import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RODON_URL = "https://www.rodon.org/other/trs.htm";
const DEFAULT_CACHE_TTL_HOURS = 24;
const CACHE_VERSION = 5;
const CACHE_DIR = path.resolve(__dirname, "../../.cache");
const CACHE_FILE = path.join(CACHE_DIR, "external-tatar-words.json");
const DOWNLOAD_TIMEOUT_MS = Number(process.env.EXTERNAL_WORDS_DOWNLOAD_TIMEOUT_MS || 30000);
const SEED_REFRESH_RETRY_MS = Number(process.env.EXTERNAL_WORDS_SEED_RETRY_MS || 120000);
const EXTERNAL_WORD_ID_PREFIX = "external:";

const LABEL_TO_RU_CANDIDATES = new Map(Object.entries({
    "dog": ["собака"],
    "cat": ["кошка", "кот"],
    "banana": ["банан"],
    "orange": ["апельсин"],
    "apple": ["яблоко"],
    "computer": ["компьютер"],
    "laptop": ["ноутбук"],
    "monitor": ["монитор"],
    "keyboard": ["клавиатура"],
    "computer mouse": ["компьютерная мышь", "мышь"],
    "mouse": ["мышь"],
    "printer": ["принтер"],
    "scanner": ["сканер"],
    "projector": ["проектор"],
    "backpack": ["рюкзак"],
    "pencil": ["карандаш"],
    "pen": ["ручка"],
    "table": ["стол"],
    "desk": ["письменный стол", "стол"],
    "bookshelf": ["книжная полка", "полка"],
    "bottle": ["бутылка"],
    "chair": ["стул"]
}));

const RU_TO_EN = new Map([
    ...[...LABEL_TO_RU_CANDIDATES.entries()].flatMap(([en, ruList]) => ruList.map((ru) => [ru, en]))
]);

const LAST_RESORT_SEED_WORDS = [
    { nameTatar: "Эт", nameRu: "Собака", nameEn: "Dog" },
    { nameTatar: "Мәче", nameRu: "Кошка", nameEn: "Cat" },
    { nameTatar: "Банан", nameRu: "Банан", nameEn: "Banana" },
    { nameTatar: "Алма", nameRu: "Яблоко", nameEn: "Apple" },
    { nameTatar: "Әфлисун", nameRu: "Апельсин", nameEn: "Orange" },
    { nameTatar: "Компьютер", nameRu: "Компьютер", nameEn: "Computer" },
    { nameTatar: "Ноутбук", nameRu: "Ноутбук", nameEn: "Laptop" },
    { nameTatar: "Монитор", nameRu: "Монитор", nameEn: "Monitor" },
    { nameTatar: "Клавиатура", nameRu: "Клавиатура", nameEn: "Keyboard" },
    { nameTatar: "Тычкан", nameRu: "Мышь", nameEn: "Mouse" },
    { nameTatar: "Принтер", nameRu: "Принтер", nameEn: "Printer" },
    { nameTatar: "Сканер", nameRu: "Сканер", nameEn: "Scanner" },
    { nameTatar: "Проектор", nameRu: "Проектор", nameEn: "Projector" },
    { nameTatar: "Рюкзак", nameRu: "Рюкзак", nameEn: "Backpack" },
    { nameTatar: "Карандаш", nameRu: "Карандаш", nameEn: "Pencil" },
    { nameTatar: "Ручка", nameRu: "Ручка", nameEn: "Pen" },
    { nameTatar: "Өстәл", nameRu: "Стол", nameEn: "Table" },
    { nameTatar: "Китап киштәсе", nameRu: "Книжная полка", nameEn: "Bookshelf" },
    { nameTatar: "Бутылка", nameRu: "Бутылка", nameEn: "Bottle" },
    { nameTatar: "Урындык", nameRu: "Стул", nameEn: "Chair" }
];

let inMemoryCache = null;
let inMemorySource = "none"; // none | remote | file-cache | seed
let inMemoryUpdatedAt = 0;
let refreshInFlight = null;
let lastRefreshAttemptAt = 0;
let lastRefreshSuccessAt = 0;
let lastRefreshError = "";

export const isExternalWordsEnabled = () => String(process.env.EXTERNAL_WORDS_ENABLED || "true").toLowerCase() !== "false";
export const isExternalWordId = (value) => String(value || "").startsWith(EXTERNAL_WORD_ID_PREFIX);

const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();
const normalizeKey = (value) => normalizeSpaces(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasCyrillic = (value) => /[А-Яа-яЁёӘәӨөҮүҖҗҢңҺһІі]/u.test(String(value || ""));
const hasLatin = (value) => /[A-Za-z]/.test(String(value || ""));
const capitalizeFirst = (value) => {
    const clean = normalizeSpaces(value);
    if (!clean) return "";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
};
const makeFallbackTranscription = (nameTatar) => {
    const clean = normalizeSpaces(nameTatar);
    if (!clean) return "";
    return `/${clean.toLowerCase()}/`;
};
const buildExternalId = (nameTatar, nameRu) => {
    const hash = crypto
        .createHash("sha1")
        .update(`${normalizeKey(nameTatar)}::${normalizeKey(nameRu)}`)
        .digest("hex")
        .slice(0, 16);
    return `${EXTERNAL_WORD_ID_PREFIX}${hash}`;
};

const fetchHtml = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const ab = await response.arrayBuffer();
        const bytes = Buffer.from(ab);

        const utf8 = new TextDecoder("utf-8").decode(bytes);
        if (/[ÐÑ]{2,}/.test(utf8)) {
            const cp1251 = new TextDecoder("windows-1251").decode(bytes);
            return cp1251;
        }
        return utf8;
    } finally {
        clearTimeout(timeout);
    }
};

const readCacheFile = async () => {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const sourceUrl = process.env.EXTERNAL_WORDS_RODON_URL || DEFAULT_RODON_URL;
    const expectedSignature = `rodon:${sourceUrl}`;
    return (
        parsed?.version === CACHE_VERSION
        && parsed?.sourceSignature === expectedSignature
        && Array.isArray(parsed?.words)
    ) ? parsed : null;
};

const writeCacheFile = async (words) => {
    const sourceUrl = process.env.EXTERNAL_WORDS_RODON_URL || DEFAULT_RODON_URL;
    const sourceSignature = `rodon:${sourceUrl}`;
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
        CACHE_FILE,
        JSON.stringify({ version: CACHE_VERSION, sourceSignature, generatedAt: new Date().toISOString(), words }, null, 2),
        "utf8"
    );
};

const isCacheFresh = (cache) => {
    const ttlHours = Number(process.env.EXTERNAL_WORDS_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS);
    const generatedAt = Date.parse(cache?.generatedAt || "");
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) return false;
    if (!generatedAt) return false;
    return Date.now() - generatedAt < ttlHours * 60 * 60 * 1000;
};

const decodeHtmlEntities = (value) => String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const htmlToLines = (html) => decodeHtmlEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n"))
    .split(/\n+/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

const cleanTranslation = (value) => normalizeSpaces(String(value || "")
    .replace(/^\d+\.?\s*/, "")
    .replace(/^[-–—:]+\s*/, "")
    .replace(/\([^)]*\)/g, "")
    .split(/[;/]/)[0]
    .replace(/\bперен\.?\b/gi, "")
    .replace(/\bразг\.?\b/gi, "")
    .replace(/\bустар\.?\b/gi, "")
    .replace(/[.:,]+$/g, ""));

const PART_OF_SPEECH = ["сущ", "гл", "пр", "нар", "межд", "част", "союз", "мест", "числ", "вводн", "шутл", "миф"];
const entryPattern = new RegExp(`^([\\p{L}\\-]+)\\s+(${PART_OF_SPEECH.join("|")})\\b\\.?(.*)$`, "iu");

const buildWordRecord = ({ nameTatar, nameRu, nameEn, source, sourceUrl }) => {
    const tt = capitalizeFirst(nameTatar);
    const ru = capitalizeFirst(nameRu);
    const en = normalizeSpaces(nameEn);
    const id = buildExternalId(tt, ru);
    return {
        _id: id,
        id,
        source,
        sourceUrl,
        nameRu: ru,
        nameEn: en,
        nameTatar: tt,
        transcription: makeFallbackTranscription(tt),
        descriptionRu: `${tt} — татарское слово, которое переводится на русский как «${ru}».`,
        description: `${tt} — татарское слово, которое переводится на русский как «${ru}».`,
        usageExamples: [],
        englishKeys: en ? [normalizeKey(en)] : []
    };
};

const parseRodonEntries = (html, sourceUrl) => {
    const lines = htmlToLines(html);
    const words = [];
    const seen = new Set();

    for (const line of lines) {
        const match = line.match(entryPattern);
        if (!match) continue;

        const nameTatar = capitalizeFirst(match[1]);
        if (!nameTatar || !hasCyrillic(nameTatar) || hasLatin(nameTatar)) continue;

        const nameRu = capitalizeFirst(cleanTranslation(match[3] || ""));
        if (!nameRu || !hasCyrillic(nameRu) || hasLatin(nameRu)) continue;
        if (nameTatar.length < 2 || nameTatar.length > 40) continue;
        if (nameRu.length < 2 || nameRu.length > 70) continue;

        const dedupeKey = `${normalizeKey(nameTatar)}::${normalizeKey(nameRu)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const nameEn = RU_TO_EN.get(normalizeKey(nameRu)) || "";
        words.push(buildWordRecord({ nameTatar, nameRu, nameEn, source: "rodon.org", sourceUrl }));
    }

    return words;
};

const buildSeedWords = () => LAST_RESORT_SEED_WORDS.map((item) => buildWordRecord({
    ...item,
    source: "seed",
    sourceUrl: "local:seed"
}));

const createLookup = (words) => {
    const byId = new Map();
    const byEnglish = new Map();
    const byRu = new Map();

    for (const word of words) {
        byId.set(String(word.id), word);

        const ruKey = normalizeKey(word.nameRu);
        if (ruKey && !byRu.has(ruKey)) byRu.set(ruKey, word);

        for (const key of Array.isArray(word.englishKeys) ? word.englishKeys : []) {
            if (!byEnglish.has(key)) byEnglish.set(key, word);
        }
    }

    return { words, byId, byEnglish, byRu };
};

const tokenizeEnglishKey = (value) => normalizeKey(value).split(/\s+/).filter((token) => token.length >= 5);
const hasTokenMatch = (left, right) => {
    const leftTokens = new Set(tokenizeEnglishKey(left));
    const rightTokens = tokenizeEnglishKey(right);
    if (!leftTokens.size || !rightTokens.length) return false;
    return rightTokens.some((token) => leftTokens.has(token));
};

const downloadExternalWords = async () => {
    const sourceUrl = process.env.EXTERNAL_WORDS_RODON_URL || DEFAULT_RODON_URL;
    const html = await fetchHtml(sourceUrl);
    const parsed = parseRodonEntries(html, sourceUrl);
    return parsed;
};

const tryRefreshInBackground = async () => {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
        lastRefreshAttemptAt = Date.now();
        try {
            const words = await downloadExternalWords();
            if (!words.length) {
                throw new Error("External source parsed as empty");
            }
            await writeCacheFile(words);
            inMemoryCache = createLookup(words);
            inMemorySource = "remote";
            inMemoryUpdatedAt = Date.now();
            lastRefreshSuccessAt = inMemoryUpdatedAt;
            lastRefreshError = "";
            console.log(`📚 Внешний словарь rodon.org обновлен в фоне: ${words.length} слов`);
        } catch (err) {
            lastRefreshError = err?.message || String(err);
            console.warn("⚠️ Фоновое обновление внешнего словаря не удалось:", lastRefreshError);
        } finally {
            refreshInFlight = null;
        }
    })();

    return refreshInFlight;
};

export const getExternalWordSource = async ({ forceRefresh = false } = {}) => {
    if (!isExternalWordsEnabled()) return createLookup([]);

    if (forceRefresh) {
        await tryRefreshInBackground();
        if (inMemoryCache) return inMemoryCache;
    }

    if (!forceRefresh && inMemoryCache) {
        if (inMemorySource !== "seed") {
            const cacheAgeMs = Date.now() - inMemoryUpdatedAt;
            const staleMs = DEFAULT_CACHE_TTL_HOURS * 60 * 60 * 1000;
            if (cacheAgeMs > staleMs) {
                void tryRefreshInBackground();
            }
            return inMemoryCache;
        }

        const seedAgeMs = Date.now() - inMemoryUpdatedAt;
        if (seedAgeMs < SEED_REFRESH_RETRY_MS) {
            return inMemoryCache;
        }
        // Seed устарел: пробуем снова сходить во внешний источник.
    }

    if (!forceRefresh) {
        try {
            const cached = await readCacheFile();
            if (cached && cached.words.length > 0) {
                inMemoryCache = createLookup(cached.words);
                inMemorySource = "file-cache";
                inMemoryUpdatedAt = Date.now();
                if (!isCacheFresh(cached)) {
                    void tryRefreshInBackground();
                }
                return inMemoryCache;
            }
        } catch {
            // Optional cache.
        }
    }

    try {
        await tryRefreshInBackground();
        if (inMemoryCache) return inMemoryCache;
        throw new Error("Unable to build external words source");
    } catch (err) {
        try {
            const cached = await readCacheFile();
            if (cached && cached.words.length > 0) {
                inMemoryCache = createLookup(cached.words);
                inMemorySource = "file-cache";
                inMemoryUpdatedAt = Date.now();
                console.warn("⚠️ Внешний словарь недоступен, используем кэш:", err?.message || err);
                return inMemoryCache;
            }
        } catch {
            // Continue to seed fallback.
        }

        const seedWords = buildSeedWords();
        inMemoryCache = createLookup(seedWords);
        inMemorySource = "seed";
        inMemoryUpdatedAt = Date.now();
        lastRefreshError = err?.message || String(err);
        console.warn("⚠️ Внешний словарь и кэш недоступны, используем seed:", err?.message || err);
        void tryRefreshInBackground();
        return inMemoryCache;
    }
};

export const getExternalWordSourceHealth = () => ({
    enabled: isExternalWordsEnabled(),
    source: inMemorySource,
    inMemoryWords: inMemoryCache?.words?.length || 0,
    inMemoryUpdatedAt: inMemoryUpdatedAt ? new Date(inMemoryUpdatedAt).toISOString() : null,
    refreshInFlight: Boolean(refreshInFlight),
    lastRefreshAttemptAt: lastRefreshAttemptAt ? new Date(lastRefreshAttemptAt).toISOString() : null,
    lastRefreshSuccessAt: lastRefreshSuccessAt ? new Date(lastRefreshSuccessAt).toISOString() : null,
    lastRefreshError: lastRefreshError || null,
    cacheFile: CACHE_FILE
});

export const findExternalWordById = async (wordId) => {
    const source = await getExternalWordSource();
    return source.byId.get(String(wordId)) || null;
};

export const findExternalWordByEnglishLabel = async (label) => {
    const source = await getExternalWordSource();
    const key = normalizeKey(label);
    if (!key) return null;

    if (source.byEnglish.has(key)) return source.byEnglish.get(key);

    const ruCandidates = LABEL_TO_RU_CANDIDATES.get(key) || [];
    for (const ruWord of ruCandidates) {
        const ruKey = normalizeKey(ruWord);
        if (source.byRu.has(ruKey)) return source.byRu.get(ruKey);
    }

    for (const [candidateKey, word] of source.byEnglish.entries()) {
        if (hasTokenMatch(key, candidateKey)) return word;
    }

    return null;
};

export const toWordSnapshot = (word) => ({
    _id: word?.id || word?._id,
    nameRu: word?.nameRu || "",
    nameEn: word?.nameEn || "",
    nameTatar: word?.nameTatar || "",
    transcription: word?.transcription || "",
    descriptionRu: word?.descriptionRu || word?.description || "",
    usageExamples: Array.isArray(word?.usageExamples) ? word.usageExamples : [],
    source: word?.source || "external"
});
