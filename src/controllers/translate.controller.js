import fetch from 'node-fetch';
import https from 'https';
import { getTatsoftTimeoutMs, translateWithTatsoft } from '../services/tatsoft.service.js';
import { trackAchievementEvent } from '../services/achievements.service.js';

const ALLOWED_DIRECTIONS = new Set(['rus2tat', 'tat2rus']);
const ALLOWED_SPEAKERS = new Set(['almaz', 'alsu']);
const DEFAULT_TTS_BASE = 'https://tat-tts.api.translate.tatar';
const DEFAULT_TTS_TIMEOUT_MS = 60000;
const DEFAULT_TTS_TOKEN = '4b6e6a31-3cc4-45c9-abf3-a68f0ff73df9';
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Проверяет условие и возвращает логический результат.
const isTlsCertificateError = (err) => {
    const text = String(err?.message || '').toLowerCase();
    return text.includes('certificate') || text.includes('ssl') || text.includes('tls');
};

// Загружает данные из внешнего источника или API.
const fetchJsonWithOptionalInsecure = async ({ url, options, allowInsecureTls }) => {
    try {
        return await fetch(url, options);
    } catch (err) {
        if (!allowInsecureTls || !isTlsCertificateError(err)) {
            throw err;
        }

        return fetch(url, {
            ...options,
            agent: insecureHttpsAgent
        });
    }
};

// Обрабатывает серверный сценарий callTatsoftTts.
const callTatsoftTts = async ({ text, speaker, timeoutMs }) => {
    const base = String(process.env.TATSOFT_TTS_API_BASE || DEFAULT_TTS_BASE).replace(/\/+$/, '');
    const token = String(process.env.TATSOFT_TTS_TOKEN || DEFAULT_TTS_TOKEN).trim();
    const allowInsecureTls = String(process.env.TATSOFT_ALLOW_INSECURE_TLS || 'true').toLowerCase() === 'true';
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const query = new URLSearchParams({ speaker, text });
        if (token) {
            query.set('token', token);
        }

        const url = `${base}/listening/?${query.toString()}`;
        const response = await fetchJsonWithOptionalInsecure({
            url,
            options: {
                method: 'GET',
                signal: controller.signal
            },
            allowInsecureTls
        });

        if (!response.ok) {
            throw new Error(`TatSoft TTS HTTP ${response.status}`);
        }

        const payload = await response.json();
        const wavBase64 = typeof payload?.wav_base64 === 'string' ? payload.wav_base64 : '';
        const sampleRate = Number(payload?.sample_rate);

        if (!wavBase64 || !Number.isFinite(sampleRate)) {
            throw new Error('TatSoft TTS malformed response');
        }

        return {
            wavBase64,
            sampleRate,
            durationMs: Date.now() - startedAt
        };
    } finally {
        clearTimeout(timer);
    }
};

// Обрабатывает запрос на перевод текста через внешний сервис TatSoft.
export const translateText = async (req, res) => {
    try {
        const direction = String(req.body?.direction || '').trim();
        const text = String(req.body?.text || '').trim();
        const timeoutMs = getTatsoftTimeoutMs();

        if (!ALLOWED_DIRECTIONS.has(direction)) {
            return res.status(400).json({ message: 'Некорректное направление перевода' });
        }

        if (!text) {
            return res.status(400).json({ message: 'Исходный текст обязателен' });
        }

        if (text.length > 5000) {
            return res.status(400).json({ message: 'Текст слишком длинный (макс. 5000 символов)' });
        }

        const translationResult = await translateWithTatsoft({ direction, text, timeoutMs });
        const achievementResult = req.user?.id ? await trackAchievementEvent({ userId: req.user.id, eventType: 'translator_used' }) : { unlockedNow: [] };

        return res.json({
            translation: translationResult.translation,
            meta: {
                endpointUsed: translationResult.endpointUsed,
                durationMs: translationResult.durationMs
            },
            unlockedNow: achievementResult.unlockedNow || []
        });
    } catch (err) {
        const message = String(err?.message || '');
        if (message.includes('TatSoft') || message.includes('aborted') || err?.name === 'AbortError') {
            return res.status(502).json({ message: 'Сервис перевода временно недоступен, попробуйте позже' });
        }
        console.error('translateText error', err);
        return res.status(500).json({ message: 'Ошибка сервера перевода' });
    }
};

// Генерирует озвучку татарского текста через сервис TTS.
export const synthesizeSpeech = async (req, res) => {
    try {
        const text = String(req.body?.text || '').trim();
        const speaker = String(req.body?.speaker || 'almaz').trim().toLowerCase();
        const timeoutMs = Math.max(parseInt(process.env.TATSOFT_TTS_TIMEOUT_MS, 10) || DEFAULT_TTS_TIMEOUT_MS, 1000);

        if (!text) {
            return res.status(400).json({ message: 'Текст для озвучки обязателен' });
        }

        if (text.length > 5000) {
            return res.status(400).json({ message: 'Текст слишком длинный (макс. 5000 символов)' });
        }

        if (!ALLOWED_SPEAKERS.has(speaker)) {
            return res.status(400).json({ message: 'Некорректный голос. Доступно: almaz, alsu' });
        }

        const tts = await callTatsoftTts({
            text,
            speaker,
            timeoutMs
        });
        const achievementResult = req.user?.id ? await trackAchievementEvent({ userId: req.user.id, eventType: 'tts_used' }) : { unlockedNow: [] };

        return res.json({
            wavBase64: tts.wavBase64,
            sampleRate: tts.sampleRate,
            meta: {
                speaker,
                durationMs: tts.durationMs
            },
            unlockedNow: achievementResult.unlockedNow || []
        });
    } catch (err) {
        const message = String(err?.message || '');
        if (message.includes('TatSoft') || message.includes('aborted') || err?.name === 'AbortError') {
            return res.status(502).json({ message: 'Сервис озвучки временно недоступен, попробуйте позже' });
        }
        console.error('synthesizeSpeech error', err);
        return res.status(500).json({ message: 'Ошибка сервера озвучки' });
    }
};
