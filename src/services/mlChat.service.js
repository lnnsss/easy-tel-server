import fetch from 'node-fetch';

const DEFAULT_ML_CHAT_URL = 'http://localhost:8000/chat';
const DEFAULT_TIMEOUT_MS = 45000;

const withTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
};

export const getMlChatTimeoutMs = () => {
    const raw = Number.parseInt(String(process.env.ML_CHAT_TIMEOUT_MS || ''), 10);
    if (!Number.isFinite(raw) || raw < 1000) return DEFAULT_TIMEOUT_MS;
    return raw;
};

export const sendChatToMl = async ({
    messages,
    mode = 'tutor',
    temperature = 0.6,
    maxNewTokens = 240
}) => {
    const url = String(process.env.ML_CHAT_URL || DEFAULT_ML_CHAT_URL).trim();
    const timeoutMs = getMlChatTimeoutMs();
    const startedAt = Date.now();

    const response = await withTimeout(
        url,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                mode,
                temperature,
                max_new_tokens: maxNewTokens
            })
        },
        timeoutMs
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = String(payload?.message || `ML chat HTTP ${response.status}`);
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return {
        reply: String(payload?.reply || '').trim(),
        model: String(payload?.model || 'unknown'),
        usage: payload?.usage || null,
        timingMs: Date.now() - startedAt
    };
};
