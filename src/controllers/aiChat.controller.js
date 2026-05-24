import { sendChatToMl } from '../services/mlChat.service.js';
import Word from '../models/Word.js';
import { getTatsoftTimeoutMs, translateWithTatsoft } from '../services/tatsoft.service.js';

const ALLOWED_ROLES = new Set(['user', 'assistant']);
const ALLOWED_MODES = new Set(['tutor', 'translate', 'correct']);
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 1200;
const SYSTEM_PROMPTS = {
    tutor: [
        'Ты — Аиша, AI-тьютор платформы EasyTel.',
        'Всегда отвечай на русском языке.',
        'Не используй смешанные языковые формы в русских фразах.',
        'Разрешены темы про обучение и смежные образовательные вопросы, включая изучение языков и другие виды обучения.',
        'Для явно нерелевантных или неуместных запросов используй мягкий редирект: кратко откажись от оффтопа и верни пользователя к учебной цели.',
        'Базовая фраза редиректа: «Давайте вернёмся к изучению татарского языка — могу помочь с переводом, грамматикой или практикой».',
        'Никогда не выдумывай перевод слова.',
        'При запросе перевода опирайся только на проверенные данные и не выдавай непроверенные варианты как факт.',
        'Если даешь татарский пример, сразу добавляй перевод на русский.',
        'Пиши кратко, понятно, по делу и мягко исправляй ошибки пользователя.',
        'Не используй опасный/вредный контент.'
    ].join(' '),
    translate: [
        'Ты Аиша, переводчик платформы EasyTel (RU↔TT).',
        'Отвечай только на русском, но обязательно давай нужный перевод на татарский или русский по запросу.',
        'Формат: сначала "Перевод:", затем при необходимости короткая пометка о форме слова.',
        'Не добавляй лишних рассуждений.'
    ].join(' '),
    correct: [
        'Ты Аиша, редактор татарского языка на платформе EasyTel.',
        'Отвечай только на русском.',
        'Исправляй текст пользователя и кратко поясняй правки.',
        'Формат: "Исправленный вариант" и затем "Пояснение".'
    ].join(' ')
};

const normalizeMode = (value) => {
    const mode = String(value || 'tutor').trim().toLowerCase();
    return ALLOWED_MODES.has(mode) ? mode : 'tutor';
};

const normalizeLookupWord = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:()"'`«»]/g, '')
    .replace(/\s+/g, ' ');

const extractWordForTranslation = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const quoted = raw.match(/[«"']([^«"']{1,60})[»"']/u)?.[1];
    if (quoted) return normalizeLookupWord(quoted);

    const byPattern = raw.match(/(?:перевод|перевести|как\s+будет|что\s+значит)\s+(?:слово\s+)?([^\n?.!,]{1,60})/iu)?.[1];
    if (byPattern) return normalizeLookupWord(byPattern);

    return '';
};

const isTranslationRequest = (text = '') => /перевод|перевести|как\s+будет|что\s+значит/i.test(String(text));
const LEARNING_RE = /изуч|обуч|учеб|учить|практик|урок|курс|язык|грамматик|слово|фраз|упражнен|диалог|произнош|склонени|спряжени|перевод|перевести/i;
const RU_RT_TOPIC_RE = /росси|рф\b|москв|казан|татарстан|татарстана|татарстане/i;
const EXPLICIT_RE = /(?:^|[\s,.;:!?])(порно|секс|эротик|наркот|закладк|суицид|самоубий|убий|террор|бомб|взрывчат|изнасил|педоф|расчлен)(?:[\s,.;:!?]|$)/i;
const CLEAR_OFFTOP_RE = /(?:^|[\s,.;:!?])(ставк|букмекер|казино|слот|рулетк|гороскоп|приворот|гадани)(?:[\s,.;:!?]|$)/i;
const OFFTOP_REDIRECT = 'Давайте вернёмся к изучению татарского языка — могу помочь с переводом, грамматикой или практикой.';

const isAllowedTopic = (text = '') => {
    const value = String(text || '').trim();
    if (!value) return true;
    if (EXPLICIT_RE.test(value)) return false;
    if (CLEAR_OFFTOP_RE.test(value)) return false;
    if (isTranslationRequest(value)) return true;
    if (LEARNING_RE.test(value)) return true;
    if (RU_RT_TOPIC_RE.test(value)) return true;
    if (value.length <= 120) return true;
    return false;
};

const getLatestUserMessage = (messages = []) => [...messages].reverse().find((item) => item.role === 'user');

const tryBuildDbTranslationReply = async ({ mode, messages }) => {
    const lastUserMessage = getLatestUserMessage(messages);
    const userText = String(lastUserMessage?.content || '').trim();
    if (!userText) return null;
    if (mode !== 'translate' && !isTranslationRequest(userText)) return null;

    const lookupWord = extractWordForTranslation(userText);
    if (!lookupWord || lookupWord.includes(' ')) return null;

    const escaped = lookupWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactCi = new RegExp(`^${escaped}$`, 'i');

    const word = await Word.findOne({
        isActive: true,
        $or: [
            { nameRu: exactCi },
            { nameTatar: exactCi },
            { nameEn: exactCi }
        ]
    }).lean();

    if (!word) return null;

    const ru = String(word.nameRu || '').trim();
    const tt = String(word.nameTatar || '').trim();
    const en = String(word.nameEn || '').trim();

    if (exactCi.test(ru)) {
        return `Перевод: «${ru}» по-татарски — «${tt}».\nИсточник: словарь EasyTel`;
    }
    if (exactCi.test(tt)) {
        return `Перевод: «${tt}» по-русски — «${ru}».\nИсточник: словарь EasyTel`;
    }
    return `Перевод: «${en}» по-русски — «${ru}», по-татарски — «${tt}».\nИсточник: словарь EasyTel`;
};

const tryBuildTatsoftTranslationReply = async ({ mode, messages }) => {
    const lastUserMessage = getLatestUserMessage(messages);
    const userText = String(lastUserMessage?.content || '').trim();
    if (!userText) return null;
    if (mode !== 'translate' && !isTranslationRequest(userText)) return null;

    const lookupWord = extractWordForTranslation(userText);
    if (!lookupWord || lookupWord.includes(' ')) return null;

    const timeoutMs = getTatsoftTimeoutMs();
    const ruToTat = await translateWithTatsoft({
        direction: 'ru-tt',
        text: lookupWord,
        timeoutMs
    }).catch(() => null);
    const ttToRu = await translateWithTatsoft({
        direction: 'tt-ru',
        text: lookupWord,
        timeoutMs
    }).catch(() => null);

    const ruToTatText = String(ruToTat?.translation || '').trim();
    const ttToRuText = String(ttToRu?.translation || '').trim();

    if (ruToTatText) {
        return `Перевод: «${lookupWord}» по-татарски — «${ruToTatText}».\nИсточник: Tatsoft`;
    }
    if (ttToRuText) {
        return `Перевод: «${lookupWord}» по-русски — «${ttToRuText}».\nИсточник: Tatsoft`;
    }
    return `Перевод: к сожалению, я не знаю точный перевод слова «${lookupWord}».`;
};

const sanitizeMessages = (raw) => {
    if (!Array.isArray(raw)) return [];
    const sliced = raw.slice(-MAX_MESSAGES);

    return sliced
        .map((item) => ({
            role: String(item?.role || '').trim().toLowerCase(),
            content: String(item?.content || '').trim()
        }))
        .filter((item) => ALLOWED_ROLES.has(item.role) && item.content)
        .map((item) => ({
            ...item,
            content: item.content.slice(0, MAX_MESSAGE_CHARS)
        }));
};

export const sendAiChatMessage = async (req, res) => {
    try {
        const mode = normalizeMode(req.body?.mode);
        const messages = sanitizeMessages(req.body?.messages);

        if (!messages.length) {
            return res.status(400).json({ message: 'Передайте хотя бы одно сообщение' });
        }

        const hasUserMessage = messages.some((item) => item.role === 'user');
        if (!hasUserMessage) {
            return res.status(400).json({ message: 'Нужно хотя бы одно сообщение пользователя' });
        }

        const lastUserMessage = getLatestUserMessage(messages);
        const userText = String(lastUserMessage?.content || '').trim();
        if (mode === 'tutor' && userText && !isAllowedTopic(userText)) {
            return res.json({
                reply: OFFTOP_REDIRECT,
                model: 'policy_filter',
                timingMs: 0
            });
        }

        const dbTranslationReply = await tryBuildDbTranslationReply({ mode, messages });
        if (dbTranslationReply) {
            return res.json({
                reply: dbTranslationReply,
                model: 'local_dictionary',
                timingMs: 0
            });
        }

        const tatsoftTranslationReply = await tryBuildTatsoftTranslationReply({ mode, messages });
        if (tatsoftTranslationReply) {
            return res.json({
                reply: tatsoftTranslationReply,
                model: 'tatsoft',
                timingMs: 0
            });
        }

        const preparedMessages = [
            { role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.tutor },
            ...messages
        ];

        const result = await sendChatToMl({
            messages: preparedMessages,
            mode,
            temperature: mode === 'translate' ? 0.2 : 0.6,
            maxNewTokens: mode === 'translate' ? 180 : 260
        });

        if (!result.reply) {
            return res.status(502).json({ message: 'AI сервис вернул пустой ответ' });
        }

        return res.json({
            reply: result.reply,
            model: result.model,
            timingMs: result.timingMs
        });
    } catch (err) {
        const message = String(err?.message || '');
        const status = Number(err?.status) || 0;
        if (err?.name === 'AbortError' || message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: 'AI сервис не успел ответить, попробуйте снова' });
        }
        if (status >= 400 && status < 500) {
            return res.status(502).json({ message: 'AI сервис временно недоступен' });
        }
        console.error('sendAiChatMessage error', err);
        return res.status(502).json({ message: 'Ошибка AI сервиса' });
    }
};
