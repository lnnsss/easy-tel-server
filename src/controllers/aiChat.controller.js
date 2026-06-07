import { sendChatToMl } from '../services/mlChat.service.js';
import Word from '../models/Word.js';
import { getTatsoftTimeoutMs, translateWithTatsoft } from '../services/tatsoft.service.js';
import { TRANSLATION_GLOSSARY } from '../utils/translationGlossary.js';

const ALLOWED_ROLES = new Set(['user', 'assistant']);
const ALLOWED_MODES = new Set(['tutor', 'translate', 'correct']);
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 1500;
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
        'Если пользователь просит перевести фразу или предложение, переводи всю фразу, а не отдельное слово.',
        'Если пользователь просит объяснить перевод, после строки "Перевод:" добавь короткое "Пояснение:" на русском.',
        'Не называй источник перевода и не добавляй лишних рассуждений.'
    ].join(' '),
    correct: [
        'Ты Аиша, редактор татарского языка на платформе EasyTel.',
        'Отвечай только на русском.',
        'Исправляй текст пользователя и кратко поясняй правки.',
        'Формат: "Исправленный вариант" и затем "Пояснение".'
    ].join(' ')
};

// Приводит входные данные к единому безопасному формату.
const normalizeMode = (value) => {
    const mode = String(value || 'tutor').trim().toLowerCase();
    return ALLOWED_MODES.has(mode) ? mode : 'tutor';
};

// Приводит входные данные к единому безопасному формату.
const normalizeLookupWord = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[!?.,;:()"'`«»]/g, '')
    .replace(/\s+/g, ' ');

const TATAR_SPECIFIC_LETTER_RE = /[әөүҗңһ]/iu;
const TATAR_GLOSSARY_TOKENS = new Set(TRANSLATION_GLOSSARY
    .flatMap((entry) => normalizeLookupWord(entry.tt).split(' '))
    .filter(Boolean));

const looksLikeTatarText = (value = '') => {
    const normalized = normalizeLookupWord(value);
    if (!normalized) return false;
    if (TATAR_SPECIFIC_LETTER_RE.test(normalized)) return true;

    const tokens = normalized.split(' ').filter(Boolean);
    return Boolean(tokens.length) && tokens.every((token) => TATAR_GLOSSARY_TOKENS.has(token));
};

const RU_TARGET_RE = /(?:^|[^\p{L}\p{N}_])(?:на\s+русский|на\s+русском|по-?русски)(?=$|[^\p{L}\p{N}_])/iu;
const TT_TARGET_RE = /(?:^|[^\p{L}\p{N}_])(?:на\s+татарский|на\s+татарском|по-?татарски)(?=$|[^\p{L}\p{N}_])/iu;
const RU_SOURCE_RE = /(?:^|[^\p{L}\p{N}_])с\s+русского(?:\s+языка)?(?=$|[^\p{L}\p{N}_])/iu;
const TT_SOURCE_RE = /(?:^|[^\p{L}\p{N}_])с\s+татарского(?:\s+языка)?(?=$|[^\p{L}\p{N}_])/iu;

// Обрабатывает серверный сценарий stripTranslationHints.
const stripTranslationHints = (value) => String(value || '')
    .replace(/\b(?:скажи|пожалуйста|объясни|поясни|и\s+объясни|и\s+поясни)\b/giu, ' ')
    .replace(TT_SOURCE_RE, ' ')
    .replace(RU_SOURCE_RE, ' ')
    .replace(TT_TARGET_RE, ' ')
    .replace(RU_TARGET_RE, ' ')
    .replace(/(?:^|[^\p{L}\p{N}_])с\s+английского(?:\s+языка)?(?=$|[^\p{L}\p{N}_])/giu, ' ')
    .replace(/(?:^|[^\p{L}\p{N}_])(?:на\s+английский|на\s+английском|по-?английски)(?=$|[^\p{L}\p{N}_])/giu, ' ')
    .replace(/\b(?:татарча|русча)\b/giu, ' ')
    .replace(/\b(?:будет|будут|переводится|переводятся|значит|означает)\b/giu, ' ')
    .replace(/\b(?:слово|фразу|фраза)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Достает нужное значение из сырого ввода или ответа сервиса.
const extractTextForTranslation = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const quoted = raw.match(/[«"']([^«"']{1,240})[»"']/u)?.[1];
    if (quoted) return normalizeLookupWord(stripTranslationHints(quoted));

    const howLanguageWillBe = raw.match(/как\s+(?:на|по)\s+(?:татарск(?:ом|ий|и)|русск(?:ом|ий|и))\s+буд(?:ет|ут)\s+(?:слово\s+)?([^\n?!]{1,240})/iu)?.[1];
    if (howLanguageWillBe) return normalizeLookupWord(stripTranslationHints(howLanguageWillBe));

    const whatLanguageForWord = raw.match(/(?:как|что)\s+(?:на|по)\s+(?:татарск(?:ом|ий|и)|русск(?:ом|ий|и))\s+(?:для\s+)?(?:слова\s+)?([^\n?!]{1,240})/iu)?.[1];
    if (whatLanguageForWord) return normalizeLookupWord(stripTranslationHints(whatLanguageForWord));

    const afterQuestion = raw.match(/(?:перевод|переведи|перевести|как\s+буд(?:ет|ут)|что\s+значит|как\s+сказать|как\s+перевести)\s+(?:слово\s+)?([^\n?!]{1,240})/iu)?.[1];
    if (afterQuestion) return normalizeLookupWord(stripTranslationHints(afterQuestion));

    const beforeLanguage = raw.match(/^([^\n?!]{1,240}?)\s+(?:на|по)\s+(?:татарск(?:ом|ий|и)|русск(?:ом|ий|и))\b/iu)?.[1];
    if (beforeLanguage) return normalizeLookupWord(stripTranslationHints(beforeLanguage));

    const cleaned = normalizeLookupWord(stripTranslationHints(raw));
    if (cleaned && !cleaned.includes(' ')) return cleaned;

    return '';
};
const extractWordForTranslation = extractTextForTranslation;

// Проверяет условие и возвращает логический результат.
const isTranslationRequest = (text = '') => (
    /перевод|переведи|перевести|как\s+буд(?:ет|ут)|что\s+значит|как\s+сказать|как\s+перевести/i.test(String(text))
    || RU_TARGET_RE.test(String(text))
    || TT_TARGET_RE.test(String(text))
);
// Проверяет условие и возвращает логический результат.
const isTranslationFlow = ({ mode, text }) => mode === 'translate' || isTranslationRequest(text);
// Обрабатывает серверный сценарий wantsTranslationExplanation.
const wantsTranslationExplanation = (text = '') => /объясни|поясни|почему|разбор|пояснение/i.test(String(text));
// Определяет итоговое значение на основе входных данных.
export const resolveTatsoftDirection = (text = '', value = '') => {
    const raw = String(text || '');
    if (RU_TARGET_RE.test(raw) || /что\s+значит/i.test(raw)) return 'tat2rus';
    if (TT_TARGET_RE.test(raw)) return 'rus2tat';
    if (TT_SOURCE_RE.test(raw)) return 'tat2rus';
    if (RU_SOURCE_RE.test(raw)) return 'rus2tat';
    return looksLikeTatarText(value) ? 'tat2rus' : 'rus2tat';
};
// Собирает данные в формат, удобный для дальнейшего использования.
const buildUnknownTranslationReply = (lookupWord) => (
    lookupWord
        ? `Перевод: к сожалению, я не знаю точный перевод ${isSingleLookupWord(lookupWord) ? 'слова' : 'текста'} «${lookupWord}».`
        : 'Перевод: к сожалению, я не смогла выделить слово для точного перевода.'
);
// Проверяет условие и возвращает логический результат.
const isSingleLookupWord = (value) => {
    const normalized = normalizeLookupWord(value);
    if (!normalized) return false;
    const parts = normalized.split(' ').filter(Boolean);
    return parts.length === 1;
};
const LEARNING_RE = /изуч|обуч|учеб|учить|практик|урок|курс|язык|грамматик|слово|фраз|упражнен|диалог|произнош|склонени|спряжени|перевод|перевести/i;
const RU_RT_TOPIC_RE = /росси|рф\b|москв|казан|татарстан|татарстана|татарстане/i;
const EXPLICIT_RE = /(?:^|[\s,.;:!?])(порно|секс|эротик|наркот|закладк|суицид|самоубий|убий|террор|бомб|взрывчат|изнасил|педоф|расчлен)(?:[\s,.;:!?]|$)/i;
const CLEAR_OFFTOP_RE = /(?:^|[\s,.;:!?])(ставк|букмекер|казино|слот|рулетк|гороскоп|приворот|гадани)(?:[\s,.;:!?]|$)/i;
const OFFTOP_REDIRECT = 'Давайте вернёмся к изучению татарского языка — могу помочь с переводом, грамматикой или практикой.';

// Проверяет условие и возвращает логический результат.
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

// Возвращает нужные данные или вычисленное значение.
const getLatestUserMessage = (messages = []) => [...messages].reverse().find((item) => item.role === 'user');

// Обрабатывает серверный сценарий capitalizeFirstLetter.
const capitalizeFirstLetter = (value) => String(value || '').replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('ru-RU'));

// Формирует единый текст ответа с переводом и необязательным разбором.
export const formatTranslationReply = ({ sourceText, translatedText, direction, explanation = '' }) => {
    const directionText = direction === 'tat2rus' ? 'по-русски' : 'по-татарски';
    const lines = [`Перевод: «${capitalizeFirstLetter(sourceText)}» ${directionText} — «${translatedText}».`];
    if (explanation) lines.push(explanation);
    return lines.join('\n');
};

// Приводит входные данные к единому безопасному формату.
const normalizeExplanationToken = (value) => normalizeLookupWord(value).replace(/[^\p{L}\p{N}\s]/gu, '');

// Обрабатывает серверный сценарий includesNormalizedPhrase.
const includesNormalizedPhrase = (text, phrase) => {
    const normalizedText = ` ${normalizeExplanationToken(text)} `;
    const normalizedPhrase = normalizeExplanationToken(phrase);
    return normalizedPhrase ? normalizedText.includes(` ${normalizedPhrase} `) : false;
};

// Обрабатывает серверный сценарий findOriginalTranslationToken.
const findOriginalTranslationToken = (translation, token) => {
    const escaped = String(token || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(translation || '').match(new RegExp(escaped, 'iu'))?.[0] || token;
};

// Удаляет связь или сущность по запросу пользователя.
const removeOverlappingGlossaryEntries = (entries) => {
    const selected = [];
    const bySpecificity = [...entries].sort((left, right) => {
        const ttDiff = normalizeExplanationToken(right.tt).length - normalizeExplanationToken(left.tt).length;
        if (ttDiff) return ttDiff;
        return normalizeExplanationToken(right.ru).length - normalizeExplanationToken(left.ru).length;
    });

    bySpecificity.forEach((entry) => {
        const entryTt = normalizeExplanationToken(entry.tt);
        const entryRu = normalizeExplanationToken(entry.ru);
        const isCovered = selected.some((selectedEntry) => {
            const selectedTt = normalizeExplanationToken(selectedEntry.tt);
            const selectedRu = normalizeExplanationToken(selectedEntry.ru);
            return selectedTt === entryTt
                || includesNormalizedPhrase(selectedTt, entryTt)
                || selectedRu === entryRu
                || includesNormalizedPhrase(selectedRu, entryRu);
        });
        if (!isCovered) selected.push(entry);
    });

    return selected;
};

// Собирает данные в формат, удобный для дальнейшего использования.
const buildGrammarNotes = (translation) => {
    const normalized = normalizeExplanationToken(translation);
    const notes = [];

    if (includesNormalizedPhrase(normalized, 'белән')) {
        notes.push('«белән» ставится после слова и работает как русское «с»: «дуслар белән» буквально «друзья с»');
    }
    if (includesNormalizedPhrase(normalized, 'елга буена')) {
        notes.push('«елга буена» передает направление к реке или к берегу реки, поэтому по смыслу подходит для русского «на речку»');
    }
    if (includesNormalizedPhrase(normalized, 'киттек')) {
        notes.push('«киттек» — форма прошедшего времени от «китү» в значении «мы пошли/поехали/отправились»');
    }
    if (/\s+\S*(?:дык|дек|тык|тек)\s*$/iu.test(` ${normalized} `)) {
        notes.push('В татарском сказуемое часто стоит в конце фразы, поэтому действие закрывает предложение');
    }

    return notes;
};

// Собирает данные в формат, удобный для дальнейшего использования.
const buildDeterministicTranslationExplanation = ({ sourceText, translatedText, direction }) => {
    const source = String(sourceText || '').trim();
    const translation = String(translatedText || '').trim();
    if (!source || !translation) return '';

    const matchedEntries = removeOverlappingGlossaryEntries(TRANSLATION_GLOSSARY
        .filter(({ ru, tt }) => {
        if (direction === 'tat2rus') {
            return includesNormalizedPhrase(source, tt) && includesNormalizedPhrase(translation, ru);
        }
        return includesNormalizedPhrase(source, ru) && includesNormalizedPhrase(translation, tt);
    }))
        .sort((left, right) => translation.toLowerCase().indexOf(left.tt) - translation.toLowerCase().indexOf(right.tt));

    if (matchedEntries.length) {
        const parts = matchedEntries.map(({ tt, ruMeaning }) => `«${findOriginalTranslationToken(translation, tt)}» — «${ruMeaning}»`);
        const notes = buildGrammarNotes(translation);
        const lines = [
            'Разбор перевода:',
            ...parts.map((part, index) => `${part}${index === parts.length - 1 ? '.' : ','}`),
            ...notes.map((note) => `${note}.`)
        ];
        return lines.join('\n');
    }

    const targetLanguageText = direction === 'tat2rus' ? 'русский' : 'татарский';
    return `Смысл фразы «${source}» передан готовым вариантом «${translation}» на ${targetLanguageText}. Я не вижу в локальной базе подробного разбора каждого слова, поэтому безопасно поясняю общий смысл, не подменяя перевод другими формами.`;
};

// Обрабатывает серверный сценарий tryBuildDbTranslationReply.
const tryBuildDbTranslationReply = async ({ mode, messages }) => {
    const lastUserMessage = getLatestUserMessage(messages);
    const userText = String(lastUserMessage?.content || '').trim();
    if (!userText) return null;
    if (!isTranslationFlow({ mode, text: userText })) return null;

    const lookupWord = extractWordForTranslation(userText);
    if (!isSingleLookupWord(lookupWord)) return null;

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
        return { sourceText: ru, translatedText: tt, direction: 'rus2tat', provider: 'local_dictionary' };
    }
    if (exactCi.test(tt)) {
        return { sourceText: tt, translatedText: ru, direction: 'tat2rus', provider: 'local_dictionary' };
    }
    return { sourceText: en, translatedText: `${ru}; ${tt}`, direction: 'rus2tat', provider: 'local_dictionary' };
};

// Обрабатывает серверный сценарий tryBuildTatsoftTranslationReply.
const tryBuildTatsoftTranslationReply = async ({ mode, messages }) => {
    const lastUserMessage = getLatestUserMessage(messages);
    const userText = String(lastUserMessage?.content || '').trim();
    if (!userText) return null;
    if (!isTranslationFlow({ mode, text: userText })) return null;

    const lookupWord = extractWordForTranslation(userText);
    if (!lookupWord) return null;

    const timeoutMs = getTatsoftTimeoutMs();
    const direction = resolveTatsoftDirection(userText, lookupWord);
    const result = await translateWithTatsoft({
        direction,
        text: lookupWord,
        timeoutMs
    }).catch(() => null);
    const translatedText = String(result?.translation || '').trim();
    return translatedText ? { sourceText: lookupWord, translatedText, direction, provider: 'tatsoft' } : null;
};

// Строит учебный разбор перевода, если пользователь попросил пояснение.
export const buildTranslationExplanation = ({ sourceText, translatedText, direction, userText }) => {
    if (!wantsTranslationExplanation(userText)) return '';
    return buildDeterministicTranslationExplanation({ sourceText, translatedText, direction });
};

// Очищает входные данные перед дальнейшей обработкой.
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

// Обрабатывает сообщение AI-чата и выбирает локальный, TatSoft или ML-ответ.
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
        const shouldHandleAsTranslation = isTranslationFlow({ mode, text: userText });
        if (mode === 'tutor' && userText && !isAllowedTopic(userText)) {
            return res.json({
                reply: OFFTOP_REDIRECT,
                model: 'policy_filter',
                timingMs: 0
            });
        }

        const dbTranslationReply = await tryBuildDbTranslationReply({ mode, messages });
        if (dbTranslationReply) {
            const explanation = await buildTranslationExplanation({
                ...dbTranslationReply,
                userText
            });
            return res.json({
                reply: formatTranslationReply({ ...dbTranslationReply, explanation }),
                model: dbTranslationReply.provider,
                timingMs: 0
            });
        }

        const tatsoftTranslationReply = await tryBuildTatsoftTranslationReply({ mode, messages });
        if (tatsoftTranslationReply) {
            const explanation = await buildTranslationExplanation({
                ...tatsoftTranslationReply,
                userText
            });
            return res.json({
                reply: formatTranslationReply({ ...tatsoftTranslationReply, explanation }),
                model: tatsoftTranslationReply.provider,
                timingMs: 0
            });
        }

        const lookupWord = extractWordForTranslation(userText);
        if (shouldHandleAsTranslation) {
            return res.json({
                reply: buildUnknownTranslationReply(lookupWord),
                model: 'translation_fallback',
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
