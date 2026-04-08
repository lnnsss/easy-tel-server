import fetch from 'node-fetch';
import https from 'https';

const ALLOWED_DIRECTIONS = new Set(['rus2tat', 'tat2rus']);
const ALLOWED_SPEAKERS = new Set(['almaz', 'alsu']);
const DEFAULT_BASE = 'https://v2.api.translate.tatar';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_TTS_BASE = 'https://tat-tts.api.translate.tatar';
const DEFAULT_TTS_TIMEOUT_MS = 60000;
const DEFAULT_TTS_TOKEN = '4b6e6a31-3cc4-45c9-abf3-a68f0ff73df9';
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

const isTlsCertificateError = (err) => {
    const text = String(err?.message || '').toLowerCase();
    return text.includes('certificate') || text.includes('ssl') || text.includes('tls');
};

const extractTranslation = (payload) => {
    if (typeof payload === 'string') {
        return payload;
    }

    if (typeof payload?.translation === 'string') {
        return payload.translation;
    }

    if (typeof payload?.output === 'string') {
        return payload.output;
    }

    if (Array.isArray(payload?.data) && typeof payload.data[0] === 'string') {
        return payload.data[0];
    }

    if (Array.isArray(payload?.output?.data) && typeof payload.output.data[0] === 'string') {
        return payload.output.data[0];
    }

    return null;
};

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

const callTatsoft = async ({ endpoint, direction, text, timeoutMs }) => {
    const base = String(process.env.TATSOFT_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
    const urls = [`${base}${endpoint}`, `${base}${endpoint}/`];
    const bodies = [
        { direction, text },
        { data: [direction, text] }
    ];
    const allowInsecureTls = String(process.env.TATSOFT_ALLOW_INSECURE_TLS || 'true').toLowerCase() === 'true';
    let lastError = null;

    for (const url of urls) {
        for (const body of bodies) {
            const startedAt = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            };

            try {
                const response = await fetchJsonWithOptionalInsecure({
                    url,
                    options: requestOptions,
                    allowInsecureTls
                });

                if (!response.ok) {
                    throw new Error(`TatSoft HTTP ${response.status}`);
                }

                const payload = await response.json();
                const translated = extractTranslation(payload);

                if (!translated) {
                    throw new Error('TatSoft malformed response');
                }

                return {
                    translation: translated,
                    durationMs: Date.now() - startedAt
                };
            } catch (err) {
                lastError = err;
            } finally {
                clearTimeout(timer);
            }
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new Error('TatSoft unknown error');
};

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

export const translateText = async (req, res) => {
    try {
        const direction = String(req.body?.direction || '').trim();
        const text = String(req.body?.text || '').trim();
        const timeoutMs = Math.max(parseInt(process.env.TATSOFT_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS, 1000);

        if (!ALLOWED_DIRECTIONS.has(direction)) {
            return res.status(400).json({ message: 'Некорректное направление перевода' });
        }

        if (!text) {
            return res.status(400).json({ message: 'Исходный текст обязателен' });
        }

        if (text.length > 5000) {
            return res.status(400).json({ message: 'Текст слишком длинный (макс. 5000 символов)' });
        }

        try {
            const primary = await callTatsoft({
                endpoint: '/gradio_api/run/gradio_interface_fn',
                direction,
                text,
                timeoutMs
            });

            return res.json({
                translation: primary.translation,
                meta: {
                    endpointUsed: 'fn',
                    durationMs: primary.durationMs
                }
            });
        } catch {
            try {
                const fallback = await callTatsoft({
                    endpoint: '/gradio_api/run/gradio_interface_fn_1',
                    direction,
                    text,
                    timeoutMs
                });

                return res.json({
                    translation: fallback.translation,
                    meta: {
                        endpointUsed: 'fn_1',
                        durationMs: fallback.durationMs
                    }
                });
            } catch {
                const upstreamError = new Error('TatSoft upstream failure');
                upstreamError.code = 'UPSTREAM_FAIL';
                throw upstreamError;
            }
        }
    } catch (err) {
        const message = String(err?.message || '');
        if (message.includes('TatSoft') || message.includes('aborted') || err?.name === 'AbortError') {
            return res.status(502).json({ message: 'Сервис перевода временно недоступен, попробуйте позже' });
        }
        console.error('translateText error', err);
        return res.status(500).json({ message: 'Ошибка сервера перевода' });
    }
};

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

        return res.json({
            wavBase64: tts.wavBase64,
            sampleRate: tts.sampleRate,
            meta: {
                speaker,
                durationMs: tts.durationMs
            }
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
