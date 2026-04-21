import { HfInference } from "@huggingface/inference";
import { getTatsoftTimeoutMs, translateWithTatsoft } from "./tatsoft.service.js";

const EXAMPLES_LIMIT = 2;
const CANDIDATES_POOL_SIZE = 18;
const DEFAULT_AI_MODEL = process.env.USAGE_EXAMPLES_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const AI_TIMEOUT_MS = Number(process.env.USAGE_EXAMPLES_AI_TIMEOUT_MS || 4500);
const WORD_TOKEN = "EASYTEL_WORD_TOKEN";

const BANNED_CONTEXT_PATTERNS = [
    /\bслово\b/iu,
    /\bпредложен\w*\b/iu,
    /\bперевод\w*\b/iu,
    /\bурок\w*\b/iu,
    /\bвыуч\w*\b/iu,
    /\bизуч\w*\b/iu,
    /\bграммат\w*\b/iu,
    /\bпример\w*\b/iu
];

let hfClient = null;

const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const normalizeSentence = (value) => normalizeSpaces(String(value || "").replace(/^[\d)\].\-:;\s]+/, ""));

const lowerFirst = (value) => {
    const text = String(value || "");
    if (!text) return "";
    return text[0].toLowerCase() + text.slice(1);
};

const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenize = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const normalizeForCompare = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const getWordStemRu = (wordRu) => {
    const word = normalizeForCompare(wordRu);
    if (!word) return "";

    if (word.length <= 4) {
        return word;
    }

    if (/[аяоеёыиуюьй]$/iu.test(word)) {
        return word.slice(0, -1);
    }

    return word;
};

const isRelatedRuToken = (token, wordRu, wordStem) => {
    const cleanToken = normalizeForCompare(token);
    const cleanWord = normalizeForCompare(wordRu);
    if (!cleanToken || !cleanWord) return false;

    if (cleanToken === cleanWord) return true;
    if (!wordStem || wordStem.length < 3) {
        return cleanToken.includes(cleanWord) || cleanWord.includes(cleanToken);
    }

    return cleanToken.startsWith(wordStem);
};

const containsRuWordOrForm = (sentence, wordRu, wordStem) =>
    tokenize(sentence).some((token) => isRelatedRuToken(token, wordRu, wordStem));

const containsBannedContext = (sentence) => BANNED_CONTEXT_PATTERNS.some((re) => re.test(sentence));

const ensureLowercaseWordInsideSentence = (sentence, wordRu, wordStem) => {
    const source = String(sentence || "");
    const matches = [...source.matchAll(/[\p{L}\p{N}-]+/gu)];

    let result = source;
    let delta = 0;

    for (const match of matches) {
        const token = match[0];
        if (!isRelatedRuToken(token, wordRu, wordStem)) {
            continue;
        }

        const start = (match.index || 0) + delta;
        if (start === 0) {
            continue;
        }

        const lowered = lowerFirst(token);
        result = `${result.slice(0, start)}${lowered}${result.slice(start + token.length)}`;
        delta += lowered.length - token.length;
    }

    return normalizeSentence(result);
};

const replaceFirstRelatedRuWordWithToken = (sentence, wordRu, wordStem) => {
    const source = String(sentence || "");
    const matches = [...source.matchAll(/[\p{L}\p{N}-]+/gu)];

    for (const match of matches) {
        const token = match[0];
        if (!isRelatedRuToken(token, wordRu, wordStem)) {
            continue;
        }

        const start = match.index || 0;
        const end = start + token.length;
        return `${source.slice(0, start)}${WORD_TOKEN}${source.slice(end)}`;
    }

    return source;
};

const jaccardSimilarity = (left, right) => {
    const a = new Set(tokenize(left));
    const b = new Set(tokenize(right));
    if (!a.size || !b.size) return 1;

    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection += 1;
    }

    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 1;
};

const isTooSimilar = (sentence, excludedSentences) => {
    for (const excluded of excludedSentences) {
        if (normalizeForCompare(sentence) === normalizeForCompare(excluded)) {
            return true;
        }
        if (jaccardSimilarity(sentence, excluded) >= 0.86) {
            return true;
        }
    }
    return false;
};

const dedupeSentences = (sentences) => {
    const seen = new Set();
    const result = [];

    for (const sentence of sentences) {
        const cleanSentence = normalizeSentence(sentence);
        if (!cleanSentence) continue;

        const key = normalizeForCompare(cleanSentence);
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(cleanSentence);
    }

    return result;
};

const pickMostDiverseExamples = (sentences, count = EXAMPLES_LIMIT) => {
    const clean = dedupeSentences(sentences);
    if (clean.length <= count) {
        return clean.slice(0, count);
    }

    const shuffled = [...clean];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let bestPair = [shuffled[0], shuffled[1]];
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < shuffled.length; i += 1) {
        for (let j = i + 1; j < shuffled.length; j += 1) {
            const left = shuffled[i];
            const right = shuffled[j];
            const similarity = jaccardSimilarity(left, right);
            const lengthPenalty = Math.abs(left.length - right.length) / Math.max(left.length, right.length, 1);
            const score = similarity + lengthPenalty * 0.08;

            const isBetter = score + 1e-6 < bestScore;
            const isCloseAndRandom = Math.abs(score - bestScore) <= 0.04 && Math.random() > 0.5;

            if (isBetter || isCloseAndRandom) {
                bestScore = score;
                bestPair = [left, right];
            }
        }
    }

    return bestPair.slice(0, count);
};

const getRuCases = (wordRuRaw) => {
    const word = lowerFirst(normalizeSpaces(wordRuRaw));
    if (!word) {
        return { nom: "", acc: "", prep: "", gen: "", inst: "" };
    }

    const needI = /[гкхжчшщц]$/i.test(word.slice(0, -1));

    if (word.endsWith("а")) {
        const base = word.slice(0, -1);
        return {
            nom: word,
            acc: `${base}у`,
            prep: `${base}е`,
            gen: `${base}${needI ? "и" : "ы"}`,
            inst: `${base}ой`
        };
    }

    if (word.endsWith("я")) {
        const base = word.slice(0, -1);
        return {
            nom: word,
            acc: `${base}ю`,
            prep: `${base}е`,
            gen: `${base}и`,
            inst: `${base}ей`
        };
    }

    if (word.endsWith("ь")) {
        const base = word.slice(0, -1);
        return {
            nom: word,
            acc: word,
            prep: `${base}и`,
            gen: `${base}и`,
            inst: `${base}ью`
        };
    }

    return {
        nom: word,
        acc: word,
        prep: `${word}е`,
        gen: `${word}а`,
        inst: `${word}ом`
    };
};

const buildFallbackCandidates = (wordRuRaw) => {
    const w = getRuCases(wordRuRaw);
    const templates = [
        `Я заметил ${w.acc} во дворе у дома.`,
        `В магазине мы купили ${w.acc} к ужину.`,
        `На прогулке я сфотографировал ${w.acc}.`,
        `Вечером я показал ${w.acc} друзьям.`,
        `На столе рядом с чашкой лежал ${w.nom}.`,
        `Утром мы искали ${w.acc}, а потом быстро нашли.`,
        `На рынке сегодня легко найти ${w.acc}.`,
        `В объявлении часто упоминают ${w.acc}.`,
        `Я аккуратно положил ${w.acc} в рюкзак.`,
        `По дороге домой мы увидели ${w.acc}.`,
        `За ужином мы говорили о ${w.prep}.`,
        `На празднике всем понравился ${w.nom}.`,
        `Я давно хотел купить ${w.acc}.`,
        `На витрине сразу бросается в глаза ${w.nom}.`,
        `В чате друзья обсуждали ${w.acc} весь вечер.`,
        `Я взял ${w.acc} с собой в поездку.`,
        `Перед выходом я проверил, где лежит ${w.nom}.`,
        `После работы мы быстро забрали ${w.acc}.`,
        `В парке дети сразу заметили ${w.acc}.`,
        `В выходные мы выбрали ${w.acc} для дома.`
    ];

    for (let i = templates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [templates[i], templates[j]] = [templates[j], templates[i]];
    }

    return templates.map((s) => normalizeSentence(s));
};

const getHfClient = () => {
    if (!process.env.HUGGINGFACEHUB_API_TOKEN) {
        return null;
    }

    if (!hfClient) {
        hfClient = new HfInference();
    }

    return hfClient;
};

const withTimeout = async (promise, timeoutMs) => {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("usage_examples_ai_timeout")), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const extractGeneratedText = (response) => {
    if (typeof response?.generated_text === "string") return response.generated_text;
    if (Array.isArray(response) && typeof response[0]?.generated_text === "string") return response[0].generated_text;
    return "";
};

const parseAiCandidates = (rawText, wordRu, wordStem) => {
    const lines = String(rawText || "")
        .split(/\n+/)
        .map((line) => normalizeSentence(line.replace(/^[-*•]\s*/, "")))
        .filter(Boolean);

    return dedupeSentences(lines)
        .map((line) => ensureLowercaseWordInsideSentence(line, wordRu, wordStem))
        .filter((line) => containsRuWordOrForm(line, wordRu, wordStem))
        .filter((line) => !containsBannedContext(line));
};

const tryGenerateWithAi = async (wordRu, wordStem) => {
    const client = getHfClient();
    if (!client) {
        return [];
    }

    const prompt = [
        `Сгенерируй 20 коротких естественных предложений на русском языке со словом \"${wordRu}\".`,
        "Используй корректные формы слова по смыслу: падеж и число, где нужно.",
        "Предложения должны быть о реальной жизни: дом, улица, магазин, семья, праздник, работа, отдых.",
        "Не пиши про изучение языка, уроки, перевод или грамматику.",
        "Верни только предложения, по одному в строке, без нумерации и пояснений."
    ].join(" ");

    try {
        const response = await withTimeout(
            client.textGeneration({
                model: DEFAULT_AI_MODEL,
                inputs: prompt,
                parameters: {
                    max_new_tokens: 360,
                    temperature: 0.95,
                    top_p: 0.95,
                    return_full_text: false
                }
            }),
            AI_TIMEOUT_MS
        );

        return parseAiCandidates(extractGeneratedText(response), wordRu, wordStem);
    } catch (err) {
        console.warn("⚠️ AI генерация примеров недоступна, используем fallback:", err?.message || err);
        return [];
    }
};

const replaceTokenWithWord = (sentence, word) => String(sentence || "")
    .replace(new RegExp(escapeRegExp(WORD_TOKEN), "g"), word);

const ensureWordInTatarSentence = ({ sentenceTat, wordTat, translatedWordCandidate }) => {
    const cleanSentenceTat = normalizeSentence(sentenceTat);
    const canonicalWord = normalizeSpaces(wordTat);

    if (!cleanSentenceTat || !canonicalWord) {
        return "";
    }

    const canonicalRe = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(canonicalWord)}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (canonicalRe.test(cleanSentenceTat)) {
        return cleanSentenceTat;
    }

    const candidate = normalizeSpaces(translatedWordCandidate);
    if (!candidate) {
        return "";
    }

    const candidateRe = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(candidate)}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (candidateRe.test(cleanSentenceTat)) {
        return normalizeSentence(cleanSentenceTat.replace(candidateRe, `$1${canonicalWord}`));
    }

    return "";
};

const translateRuSentenceToTat = async ({ sentenceRu, wordRu, wordStem, wordTat, timeoutMs, translatedWordCandidate }) => {
    const withToken = replaceFirstRelatedRuWordWithToken(sentenceRu, wordRu, wordStem);
    if (!withToken.includes(WORD_TOKEN)) {
        return "";
    }

    const translation = await translateWithTatsoft({
        direction: "rus2tat",
        text: withToken,
        timeoutMs
    });

    const translatedRaw = normalizeSentence(String(translation?.translation || ""));
    if (!translatedRaw) {
        return "";
    }

    return ensureWordInTatarSentence({
        sentenceTat: replaceTokenWithWord(translatedRaw, wordTat),
        wordTat,
        translatedWordCandidate
    });
};

const normalizeUsageExamples = (examples) => {
    if (!Array.isArray(examples)) {
        return [];
    }

    const seen = new Set();
    const normalized = [];

    for (const item of examples) {
        const textRu = normalizeSentence(item?.textRu);
        const textTatar = normalizeSentence(item?.textTatar);
        if (!textRu || !textTatar) continue;

        const key = `${normalizeForCompare(textRu)}::${normalizeForCompare(textTatar)}`;
        if (seen.has(key)) continue;

        seen.add(key);
        normalized.push({ textRu, textTatar });

        if (normalized.length >= EXAMPLES_LIMIT) break;
    }

    return normalized;
};

const buildHardFallbackExamples = (wordRu, wordTat) => {
    const w = getRuCases(wordRu);
    return [
        { textRu: `Я заметил ${w.acc} по дороге домой.`, textTatar: `Өйгә кайтканда мин ${wordTat} күрдем.` },
        { textRu: `В магазине мы купили ${w.acc}.`, textTatar: `Кибеттә без ${wordTat} сатып алдык.` },
        { textRu: `На фотографии хорошо видно ${w.acc}.`, textTatar: `Бу фотода ${wordTat} яхшы күренә.` },
        { textRu: `Вечером мы говорили о ${w.prep}.`, textTatar: `Кич белән без ${wordTat} турында сөйләштек.` }
    ];
};

export const generateUsageExamplesForWord = async ({ wordRu, wordTatar, excludeExamples = [] }) => {
    const cleanWordRu = lowerFirst(normalizeSpaces(wordRu));
    const cleanWordTat = lowerFirst(normalizeSpaces(wordTatar));
    const wordStem = getWordStemRu(cleanWordRu);

    if (!cleanWordRu || !cleanWordTat) {
        return [];
    }

    const excludedRu = Array.isArray(excludeExamples)
        ? excludeExamples
            .map((item) => normalizeSentence(typeof item === "string" ? item : item?.textRu))
            .filter(Boolean)
        : [];

    const timeoutMs = getTatsoftTimeoutMs();
    const aiCandidates = await tryGenerateWithAi(cleanWordRu, wordStem);
    const fallbackCandidates = buildFallbackCandidates(cleanWordRu)
        .map((s) => ensureLowercaseWordInsideSentence(s, cleanWordRu, wordStem))
        .filter((s) => containsRuWordOrForm(s, cleanWordRu, wordStem))
        .filter((s) => !containsBannedContext(s));

    const ruCandidates = dedupeSentences([...aiCandidates, ...fallbackCandidates])
        .filter((s) => !isTooSimilar(s, excludedRu))
        .slice(0, CANDIDATES_POOL_SIZE);

    const selectedRuSentences = pickMostDiverseExamples(
        ruCandidates.length >= EXAMPLES_LIMIT ? ruCandidates : dedupeSentences([...ruCandidates, ...fallbackCandidates]),
        EXAMPLES_LIMIT
    );

    let translatedWordCandidate = "";
    try {
        const wordTranslation = await translateWithTatsoft({
            direction: "rus2tat",
            text: cleanWordRu,
            timeoutMs
        });
        translatedWordCandidate = normalizeSpaces(wordTranslation?.translation);
    } catch (err) {
        console.warn("⚠️ Не удалось получить перевод базового слова для сверки:", err?.message || err);
    }

    const generated = [];
    for (const textRu of selectedRuSentences) {
        try {
            const textTatar = await translateRuSentenceToTat({
                sentenceRu: textRu,
                wordRu: cleanWordRu,
                wordStem,
                wordTat: cleanWordTat,
                timeoutMs,
                translatedWordCandidate
            });

            if (!textTatar) continue;
            generated.push({ textRu, textTatar });
        } catch (err) {
            console.warn("⚠️ Ошибка перевода примера через Tatsoft:", err?.message || err);
        }
    }

    const normalizedGenerated = normalizeUsageExamples(generated)
        .filter((item) => !isTooSimilar(item.textRu, excludedRu));

    if (normalizedGenerated.length >= EXAMPLES_LIMIT) {
        return normalizedGenerated.slice(0, EXAMPLES_LIMIT);
    }

    const hardFallback = buildHardFallbackExamples(cleanWordRu, cleanWordTat)
        .filter((item) => !isTooSimilar(item.textRu, [...excludedRu, ...normalizedGenerated.map((x) => x.textRu)]));

    return normalizeUsageExamples([...normalizedGenerated, ...hardFallback]);
};

export { normalizeUsageExamples };
