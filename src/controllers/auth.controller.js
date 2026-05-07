import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import AuthorRoleRequest from '../models/AuthorRoleRequest.js';
import {
    normalizeEmail,
    normalizeName,
    validateEmail,
    validateName,
    validatePassword,
    validateUsername
} from '../utils/authValidation.js';
import { sendPasswordResetEmail, sendVerificationCodeEmail } from '../services/mailer.js';
import { ensureLegacyPoints, normalizeUserStreak } from '../utils/userProgress.js';
import { getUserCourseAnalytics } from '../utils/courseAnalytics.js';
import { normalizeUserWordsForResponse } from '../services/userWordPresenter.service.js';
import {
    CHARACTER_ALLOWED,
    COSMETIC_ALLOWED,
    COSMETIC_CATEGORIES,
    DEFAULT_CHARACTER_CUSTOMIZATION,
    FREE_ITEMS_WHITELIST,
    ITEM_PRICE_COINS
} from '../config/characterAssets.js';

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const GOOGLE_AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_AVATAR_HOST_HINT = 'googleusercontent.com';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

const logAuthError = (action, err, reqBody = {}) => {
    const { password, confirmPassword, code, token, ...safeBody } = reqBody;
    console.error(`[auth:${action}]`, {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        body: safeBody
    });
};

const createJwtToken = (user) => jwt.sign(
    { id: user._id, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

const hashString = (value) => crypto.createHash('sha256').update(value).digest('hex');

const generateVerificationCode = () => String(Math.floor(100000 + Math.random() * 900000));

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const ensureGoogleConfigured = () => (
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_REDIRECT_URI
);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tryRemoveAvatarFile = (avatarUrl) => {
    if (!avatarUrl || !avatarUrl.startsWith('/uploads/')) return;
    const relativePart = avatarUrl.replace('/uploads/', '');
    const filePath = path.resolve(uploadsRoot, relativePart);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error('[auth:avatar:cleanup]', err.message);
        });
    }
};

const buildUniqueUsername = async (baseUsername) => {
    const safeBase = baseUsername
        .replace(/[^A-Za-z0-9]/g, '')
        .toLowerCase();

    let candidate = safeBase || 'user';
    if (candidate.length < 3) candidate = `${candidate}123`;

    if (!/[A-Za-z]/.test(candidate)) candidate = `user${candidate}`;

    let suffix = 0;
    let finalCandidate = candidate;
    while (await User.exists({ username: finalCandidate })) {
        suffix += 1;
        finalCandidate = `${candidate}${suffix}`;
    }

    return finalCandidate;
};

const buildDefaultOwnedCosmetics = () => {
    const result = {};
    for (const category of COSMETIC_CATEGORIES) {
        result[category] = Array.isArray(FREE_ITEMS_WHITELIST[category]) ? [...FREE_ITEMS_WHITELIST[category]] : [];
    }
    return result;
};

export const register = async (req, res) => {
    try {
        const {
            email,
            password,
            username,
            firstName,
            lastName
        } = req.body;

        if (!email || !password || !username || !firstName || !lastName) {
            return res.status(400).json({ message: 'Заполните все поля' });
        }

        const normalizedEmail = normalizeEmail(email);
        const normalizedUsername = String(username || '').trim();
        const normalizedFirstName = normalizeName(firstName);
        const normalizedLastName = normalizeName(lastName);

        const emailError = validateEmail(normalizedEmail);
        if (emailError) return res.status(400).json({ message: emailError, details: 'Пример: user@example.com' });

        const firstNameError = validateName(normalizedFirstName);
        if (firstNameError) return res.status(400).json({ message: firstNameError });

        const lastNameError = validateName(normalizedLastName);
        if (lastNameError) return res.status(400).json({ message: lastNameError });

        const usernameError = validateUsername(normalizedUsername);
        if (usernameError) return res.status(400).json({ message: usernameError });

        const passwordError = validatePassword(password);
        if (passwordError) return res.status(400).json({ message: passwordError });

        const exists = await User.findOne({
            $or: [
                { email: normalizedEmail },
                { username: { $regex: `^${escapeRegex(normalizedUsername)}$`, $options: 'i' } }
            ]
        });

        if (exists) {
            return res.status(400).json({
                message: 'Пользователь с таким email или username уже существует'
            });
        }

        const verificationCode = generateVerificationCode();
        const verificationCodeHash = hashString(verificationCode);
        const verificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

        const hash = await bcrypt.hash(password, 10);

        const user = await User.create({
            email: normalizedEmail,
            emailVerified: false,
            emailVerificationCodeHash: verificationCodeHash,
            emailVerificationExpiresAt: verificationExpiresAt,
            password: hash,
            username: normalizedUsername,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            role: 'user',
            coins: 0,
            ownedCosmetics: buildDefaultOwnedCosmetics()
        });

        const token = createJwtToken(user);
        res.json({
            message: 'Регистрация успешна. Код подтверждения отправлен на почту.',
            token,
            emailVerified: false
        });

        // Не блокируем ответ пользователю из-за SMTP.
        sendVerificationCodeEmail({
            to: normalizedEmail,
            code: verificationCode
        }).catch((mailErr) => {
            logAuthError('register:mail', mailErr, { email: normalizedEmail });
        });
    } catch (err) {
        logAuthError('register', err, req.body);
        res.status(500).json({
            message: 'Ошибка регистрации',
            details: err?.message || 'Неизвестная ошибка'
        });
    }
};

export const login = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                message: 'Укажите email/username и пароль'
            });
        }

        const normalizedIdentifier = String(identifier || '').trim();
        const normalizedEmailIdentifier = normalizedIdentifier.toLowerCase();

        const user = await User.findOne({
            $or: [
                { email: normalizedEmailIdentifier },
                { username: { $regex: `^${escapeRegex(normalizedIdentifier)}$`, $options: 'i' } }
            ]
        });

        if (!user) {
            return res.status(400).json({
                message: 'Пользователь не найден',
                details: 'Проверьте email или username'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: 'Неверный пароль',
                details: 'Проверьте раскладку клавиатуры и попробуйте снова'
            });
        }

        const token = createJwtToken(user);

        res.json({
            token,
            emailVerified: user.emailVerified
        });
    } catch (err) {
        logAuthError('login', err, req.body);
        res.status(500).json({
            message: 'Ошибка входа',
            details: err?.message || 'Неизвестная ошибка'
        });
    }
};

export const verifyEmail = async (req, res) => {
    try {
        const { code } = req.body;
        const cleanCode = String(code || '').replace(/\D/g, '').slice(0, 6);

        if (!/^\d{6}$/.test(cleanCode)) {
            return res.status(400).json({ message: 'Введите корректный 6-значный код' });
        }

        const user = await User.findById(req.user.id).select(
            '_id emailVerified emailVerificationCodeHash emailVerificationExpiresAt'
        );

        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
        if (user.emailVerified) return res.json({ message: 'Почта уже подтверждена' });

        if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
            return res.status(400).json({ message: 'Код истек. Запросите новый код' });
        }

        const inputCodeHash = hashString(cleanCode);
        if (inputCodeHash !== user.emailVerificationCodeHash) {
            return res.status(400).json({ message: 'Неверный код подтверждения. Запросите новый код и попробуйте снова' });
        }

        user.emailVerified = true;
        user.emailVerificationCodeHash = null;
        user.emailVerificationExpiresAt = null;
        await user.save();

        res.json({ message: 'Почта успешно подтверждена' });
    } catch (err) {
        logAuthError('verifyEmail', err, req.body);
        res.status(500).json({ message: 'Ошибка подтверждения почты', details: err?.message });
    }
};

export const resendVerificationCode = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('_id email emailVerified');

        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
        if (user.emailVerified) return res.json({ message: 'Почта уже подтверждена' });

        const verificationCode = generateVerificationCode();
        user.emailVerificationCodeHash = hashString(verificationCode);
        user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
        await user.save();

        await sendVerificationCodeEmail({
            to: user.email,
            code: verificationCode
        });

        res.json({ message: 'Новый код отправлен на почту' });
    } catch (err) {
        logAuthError('resendVerificationCode', err, req.body);
        res.status(500).json({ message: 'Ошибка повторной отправки кода', details: err?.message });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail) {
            return res.status(400).json({ message: 'Укажите email' });
        }

        const emailError = validateEmail(normalizedEmail);
        if (emailError) {
            return res.status(400).json({ message: emailError });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (user) {
            const rawToken = generateResetToken();
            user.passwordResetTokenHash = hashString(rawToken);
            user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
            await user.save();

            const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail({ to: normalizedEmail, resetLink });
        }

        res.json({
            message: 'Если такой email зарегистрирован, ссылка для сброса уже отправлена'
        });
    } catch (err) {
        logAuthError('forgotPassword', err, req.body);
        res.status(500).json({ message: 'Ошибка запроса сброса пароля', details: err?.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        const rawToken = String(token || '').trim();

        if (!rawToken) {
            return res.status(400).json({ message: 'Отсутствует токен сброса' });
        }

        const passwordError = validatePassword(String(password || ''));
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }

        const hashedToken = hashString(rawToken);
        const user = await User.findOne({
            passwordResetTokenHash: hashedToken,
            passwordResetExpiresAt: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Ссылка недействительна или истекла' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ message: 'Пароль успешно изменен. Войдите заново.' });
    } catch (err) {
        logAuthError('resetPassword', err, req.body);
        res.status(500).json({ message: 'Ошибка сброса пароля', details: err?.message });
    }
};

export const googleAuthStart = async (req, res) => {
    try {
        if (!ensureGoogleConfigured()) {
            return res.status(500).json({
                message: 'Google OAuth не настроен на сервере'
            });
        }

        const state = crypto.randomBytes(12).toString('hex');
        const params = new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            prompt: 'consent',
            state
        });

        res.redirect(`${GOOGLE_AUTH_BASE_URL}?${params.toString()}`);
    } catch (err) {
        logAuthError('googleAuthStart', err);
        res.status(500).json({ message: 'Ошибка запуска Google OAuth', details: err?.message });
    }
};

export const googleAuthCallback = async (req, res) => {
    try {
        if (!ensureGoogleConfigured()) {
            return res.status(500).send('Google OAuth не настроен');
        }

        const { code } = req.query;
        if (!code) return res.status(400).send('Не получен code от Google');

        const tokenResponse = await axios.post(
            GOOGLE_TOKEN_URL,
            new URLSearchParams({
                code: String(code),
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) return res.status(400).send('Google не вернул access token');

        const userInfoRes = await axios.get(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const {
            email,
            email_verified: emailVerified,
            given_name: givenName,
            family_name: familyName,
            name,
            picture
        } = userInfoRes.data || {};

        if (!email) return res.status(400).send('Google не вернул email');
        if (!emailVerified) return res.status(400).send('Google email не подтвержден');

        const normalizedEmail = normalizeEmail(email);
        let user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            const fullName = String(name || '').trim().split(/\s+/).filter(Boolean);
            const derivedFirstName = normalizeName(givenName || fullName[0] || 'Пользователь');
            const derivedLastName = normalizeName(familyName || fullName[1] || 'Google');
            const baseUsername = normalizedEmail.split('@')[0];
            const username = await buildUniqueUsername(baseUsername);

            const randomPassword = crypto.randomBytes(24).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            user = await User.create({
                email: normalizedEmail,
                emailVerified: true,
                username,
                firstName: derivedFirstName,
                lastName: derivedLastName,
                avatarUrl: picture || null,
                password: passwordHash,
                role: 'user',
                coins: 0,
                ownedCosmetics: buildDefaultOwnedCosmetics()
            });
        } else {
            let requiresSave = false;

            if (!user.emailVerified) {
                user.emailVerified = true;
                user.emailVerificationCodeHash = null;
                user.emailVerificationExpiresAt = null;
                requiresSave = true;
            }

            const hasGooglePicture = typeof picture === 'string' && picture.trim().length > 0;
            const hasLocalAvatar = typeof user.avatarUrl === 'string' && user.avatarUrl.startsWith('/uploads/');
            const hasGoogleAvatar = typeof user.avatarUrl === 'string' && user.avatarUrl.includes(GOOGLE_AVATAR_HOST_HINT);

            // Обновляем аватар из Google, если пользователь не ставил локальный вручную.
            if (hasGooglePicture && (!user.avatarUrl || (!hasLocalAvatar && hasGoogleAvatar))) {
                user.avatarUrl = picture;
                requiresSave = true;
            }

            if (requiresSave) await user.save();
        }

        const token = createJwtToken(user);
        const redirectUrl = `${process.env.CLIENT_URL}/google-auth-callback?token=${encodeURIComponent(token)}`;
        return res.redirect(redirectUrl);
    } catch (err) {
        logAuthError('googleAuthCallback', err);
        return res.status(500).send('Ошибка входа через Google');
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, username, characterCustomization, purchaseItem } = req.body || {};
        const updates = {};

        const currentUser = await User.findById(req.user.id)
            .select('-password -emailVerificationCodeHash -passwordResetTokenHash');
        if (!currentUser) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        if (!currentUser.ownedCosmetics || typeof currentUser.ownedCosmetics !== 'object') {
            currentUser.ownedCosmetics = {};
        }
        for (const category of COSMETIC_CATEGORIES) {
            const freeItems = Array.isArray(FREE_ITEMS_WHITELIST[category]) ? FREE_ITEMS_WHITELIST[category] : [];
            const current = Array.isArray(currentUser.ownedCosmetics[category]) ? currentUser.ownedCosmetics[category] : [];
            currentUser.ownedCosmetics[category] = [...new Set([...freeItems, ...current])];
        }
        if (!Number.isFinite(Number(currentUser.coins)) || Number(currentUser.coins) < 0) {
            currentUser.coins = Number(currentUser.totalPoints) || 0;
        }

        if (firstName !== undefined) {
            const normalizedFirstName = normalizeName(firstName);
            const firstNameError = validateName(normalizedFirstName);
            if (firstNameError) return res.status(400).json({ message: firstNameError });
            updates.firstName = normalizedFirstName;
        }

        if (lastName !== undefined) {
            const normalizedLastName = normalizeName(lastName);
            const lastNameError = validateName(normalizedLastName);
            if (lastNameError) return res.status(400).json({ message: lastNameError });
            updates.lastName = normalizedLastName;
        }

        if (username !== undefined) {
            const normalizedUsername = String(username || '').trim();
            const usernameError = validateUsername(normalizedUsername);
            if (usernameError) return res.status(400).json({ message: usernameError });

            const exists = await User.findOne({
                username: { $regex: `^${escapeRegex(normalizedUsername)}$`, $options: 'i' },
                _id: { $ne: req.user.id }
            });
            if (exists) {
                return res.status(400).json({ message: 'Username уже занят' });
            }
            updates.username = normalizedUsername;
        }

        if (purchaseItem !== undefined) {
            if (!purchaseItem || typeof purchaseItem !== 'object' || Array.isArray(purchaseItem)) {
                return res.status(400).json({ message: 'purchaseItem должен быть объектом' });
            }

            const category = String(purchaseItem.category || '').trim();
            const file = String(purchaseItem.file || '').trim();
            if (!COSMETIC_CATEGORIES.includes(category)) {
                return res.status(400).json({ message: 'Недопустимая категория для покупки' });
            }
            if (!COSMETIC_ALLOWED[category]?.has(file)) {
                return res.status(400).json({ message: 'Недопустимый файл для покупки' });
            }

            const freeItems = new Set(FREE_ITEMS_WHITELIST[category] || []);
            const owned = new Set(Array.isArray(currentUser.ownedCosmetics[category]) ? currentUser.ownedCosmetics[category] : []);
            const alreadyOwned = freeItems.has(file) || owned.has(file);
            if (!alreadyOwned) {
                const coins = Number(currentUser.coins) || 0;
                if (coins < ITEM_PRICE_COINS) {
                    return res.status(400).json({ message: 'Недостаточно монет для покупки' });
                }
                currentUser.coins = coins - ITEM_PRICE_COINS;
                owned.add(file);
                currentUser.ownedCosmetics[category] = [...owned];
            }
        }

        if (characterCustomization !== undefined) {
            if (!characterCustomization || typeof characterCustomization !== 'object' || Array.isArray(characterCustomization)) {
                return res.status(400).json({ message: 'characterCustomization должен быть объектом' });
            }

            const merged = {
                ...DEFAULT_CHARACTER_CUSTOMIZATION,
                ...characterCustomization
            };

            const fields = ['gender', 'characterFile', 'shoesFile', 'bottomFile', 'topFile', 'headdressFile', 'backgroundFile'];
            for (const field of fields) {
                const value = String(merged[field] || '').trim();
                const whitelist = CHARACTER_ALLOWED[field];
                if (!whitelist || !whitelist.has(value)) {
                    return res.status(400).json({ message: `Недопустимое значение для ${field}` });
                }
                merged[field] = value;
            }

            const ownershipMap = {
                shoesFile: 'shoes',
                bottomFile: 'bottom',
                topFile: 'top',
                headdressFile: 'headdress'
            };
            for (const [field, category] of Object.entries(ownershipMap)) {
                const selected = merged[field];
                const freeItems = new Set(FREE_ITEMS_WHITELIST[category] || []);
                const owned = new Set(Array.isArray(currentUser.ownedCosmetics[category]) ? currentUser.ownedCosmetics[category] : []);
                if (!freeItems.has(selected) && !owned.has(selected)) {
                    return res.status(400).json({ message: `Сначала купите «${selected}»` });
                }
            }

            updates.characterCustomization = {
                ...merged,
                updatedAt: new Date()
            };
        }

        if (Object.keys(updates).length === 0 && purchaseItem === undefined) {
            return res.status(400).json({ message: 'Нет полей для обновления' });
        }

        Object.assign(currentUser, updates);
        await currentUser.save();

        const user = await User.findById(currentUser._id)
            .select('-password -emailVerificationCodeHash -passwordResetTokenHash');

        return res.json({ message: 'Профиль обновлен', user });
    } catch (err) {
        logAuthError('updateProfile', err, req.body);
        return res.status(500).json({ message: 'Ошибка обновления профиля', details: err?.message });
    }
};

export const uploadAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Файл не загружен' });

        const user = await User.findById(req.user.id).select('avatarUrl');
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const oldAvatarUrl = user.avatarUrl;
        user.avatarUrl = avatarUrl;
        await user.save();

        if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
            tryRemoveAvatarFile(oldAvatarUrl);
        }

        return res.json({
            message: 'Аватар обновлен',
            avatarUrl
        });
    } catch (err) {
        logAuthError('uploadAvatar', err);
        return res.status(500).json({ message: 'Ошибка загрузки аватара', details: err?.message });
    }
};

export const profile = async (req, res) => {
    const user = await User.findById(req.user.id)
        .select('-password -emailVerificationCodeHash -passwordResetTokenHash')
        .populate({
            path: 'dictionary',
            populate: { path: 'word' }
        });

    if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
    }

    ensureLegacyPoints(user);
    normalizeUserStreak(user);
    await user.save();

    const analytics = await getUserCourseAnalytics(req.user.id);
    const latestAuthorRequest = await AuthorRoleRequest.findOne({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .lean();
    const authorRequestNotice = (
        latestAuthorRequest
        && latestAuthorRequest.status !== 'pending'
        && !latestAuthorRequest.decisionSeenAt
    ) ? latestAuthorRequest : null;

    const profileData = user.toObject();
    profileData.dictionary = normalizeUserWordsForResponse(profileData.dictionary);

    res.json({
        ...profileData,
        analytics,
        latestAuthorRequest: latestAuthorRequest || null,
        authorRequestNotice
    });
};
