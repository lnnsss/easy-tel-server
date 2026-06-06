import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import indexRoutes from './routes/index.routes.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, 'uploads');

// Читает числовую настройку окружения с fallback-значением.
const toInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

// Возвращает нужные данные или вычисленное значение.
const getLimiterKey = (req) => {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
        return `tk:${tokenHash}`;
    }
    const ip = req.ip || req.socket?.remoteAddress || '';
    return `ip:${ipKeyGenerator(ip)}`;
};

// Создает сущность и возвращает результат клиенту.
const createLimiter = ({ windowMs, max, scope }) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getLimiterKey,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
        const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : 0;
        const retryAfterSec = resetTime > Date.now()
            ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
            : Math.max(1, Math.ceil(windowMs / 1000));
        console.warn('[rate-limit]', {
            scope,
            method: req.method,
            path: req.originalUrl,
            key: getLimiterKey(req),
            retryAfterSec
        });
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            message: 'Слишком много запросов. Попробуйте чуть позже.',
            code: 'RATE_LIMITED',
            scope,
            retryAfterSec
        });
    }
});

const RATE_LIMIT_WINDOW_MS = toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const RATE_LIMIT_GLOBAL_MAX = toInt(process.env.RATE_LIMIT_GLOBAL_MAX, 600);
const RATE_LIMIT_AUTH_MAX = toInt(process.env.RATE_LIMIT_AUTH_MAX, 40);
const RATE_LIMIT_SOCIAL_MAX = toInt(process.env.RATE_LIMIT_SOCIAL_MAX, 240);
const RATE_LIMIT_TRANSLATE_MAX = toInt(process.env.RATE_LIMIT_TRANSLATE_MAX, 180);
const RATE_LIMIT_AI_CHAT_MAX = toInt(process.env.RATE_LIMIT_AI_CHAT_MAX, 90);

const apiLimiter = createLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_GLOBAL_MAX,
    scope: 'api'
});
const authLimiter = createLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_AUTH_MAX,
    scope: 'auth'
});
const socialLimiter = createLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_SOCIAL_MAX,
    scope: 'social'
});
const translateLimiter = createLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_TRANSLATE_MAX,
    scope: 'translate'
});
const aiChatLimiter = createLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_AI_CHAT_MAX,
    scope: 'ai_chat'
});

app.use(express.json());

app.use(cors({
    origin: '*', // Заметка для разработки: позже ограничу.
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(morgan('dev'));

app.use('/uploads', express.static(uploadsPath));

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/friends', socialLimiter);
app.use('/api/chats', socialLimiter);
app.use('/api/translate', translateLimiter);
app.use('/api/ai-chat', aiChatLimiter);

app.use('/api', indexRoutes);

export default app;
