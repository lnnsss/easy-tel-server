import fetch from 'node-fetch';
import https from 'https';

const DEFAULT_BASE = 'https://v2.api.translate.tatar';
const DEFAULT_TIMEOUT_MS = 60000;
const TRANSLATE_ENDPOINTS = [
    { path: '/gradio_api/run/gradio_interface_fn', code: 'fn' },
    { path: '/gradio_api/run/gradio_interface_fn_1', code: 'fn_1' }
];

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Определяет, связана ли ошибка запроса с TLS-сертификатом.
const isTlsCertificateError = (err) => {
    const text = String(err?.message || '').toLowerCase();
    return text.includes('certificate') || text.includes('ssl') || text.includes('tls');
};

// Достает строку перевода из разных форматов ответа TatSoft.
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

// Повторяет запрос TatSoft с небезопасным TLS-агентом при ошибке сертификата.
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

// Пробует варианты endpoint/body TatSoft и возвращает первый успешный перевод.
const callTatsoftEndpoint = async ({ endpoint, direction, text, timeoutMs }) => {
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

            try {
                const response = await fetchJsonWithOptionalInsecure({
                    url,
                    options: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        signal: controller.signal
                    },
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

// Берет таймаут TatSoft из окружения и защищает его минимальным значением.
export const getTatsoftTimeoutMs = () => {
    return Math.max(parseInt(process.env.TATSOFT_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS, 1000);
};

export const translateWithTatsoft = async ({ direction, text, timeoutMs = getTatsoftTimeoutMs() }) => {
    for (const endpoint of TRANSLATE_ENDPOINTS) {
        try {
            const result = await callTatsoftEndpoint({
                endpoint: endpoint.path,
                direction,
                text,
                timeoutMs
            });

            return {
                ...result,
                endpointUsed: endpoint.code
            };
        } catch (err) {
            if (endpoint === TRANSLATE_ENDPOINTS[TRANSLATE_ENDPOINTS.length - 1]) {
                throw err;
            }
        }
    }

    throw new Error('TatSoft unknown error');
};

