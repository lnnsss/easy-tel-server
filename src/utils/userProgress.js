import { getRank } from './ranking.js';

export const WORD_SCAN_POINTS = 1;

// Гарантирует наличие нужного состояния перед дальнейшей работой.
export const ensureLegacyPoints = (user) => {
    if (!user) return user;

    const dictionaryCount = Array.isArray(user.dictionary) ? user.dictionary.length : 0;

    if (!Number.isFinite(user.scanPoints)) {
        user.scanPoints = dictionaryCount * WORD_SCAN_POINTS;
    }

    if (!Number.isFinite(user.studyPoints)) {
        user.studyPoints = 0;
    }

    user.totalPoints = (user.scanPoints || 0) + (user.studyPoints || 0);
    user.rank = getRank(user.totalPoints);

    return user;
};

// Добавляет новую запись в пользовательские данные.
export const addScanPoints = (user, points = WORD_SCAN_POINTS) => {
    ensureLegacyPoints(user);
    user.scanPoints += points;
    user.totalPoints = user.scanPoints + user.studyPoints;
    user.rank = getRank(user.totalPoints);
    return user;
};

// Добавляет новую запись в пользовательские данные.
export const addStudyPoints = (user, points = 0) => {
    ensureLegacyPoints(user);
    user.studyPoints += points;
    user.totalPoints = user.scanPoints + user.studyPoints;
    user.rank = getRank(user.totalPoints);
    return user;
};

// Содержит вспомогательную логику toDateKey для переиспользования в проекте.
export const toDateKey = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

// Содержит вспомогательную логику calculateDailyStreak для переиспользования в проекте.
export const calculateDailyStreak = (dateKeys = []) => {
    if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0;

    const sorted = [...new Set(dateKeys)]
        .map((key) => new Date(`${key}T00:00:00.000Z`).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => b - a);

    if (!sorted.length) return 0;

    let streak = 0;
    let cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    let expected = cursor.getTime();

    const hasToday = sorted[0] === expected;
    if (!hasToday) expected -= 24 * 60 * 60 * 1000;

    for (const ts of sorted) {
        if (ts === expected) {
            streak += 1;
            expected -= 24 * 60 * 60 * 1000;
        } else if (ts < expected) {
            break;
        }
    }

    return streak;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDayStart = (dateValue = new Date()) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

export const normalizeUserStreak = (user, now = new Date()) => {
    if (!user) return user;

    const today = toUtcDayStart(now);
    const last = toUtcDayStart(user.lastStreakDate);

    if (!today || !last) {
        user.streak = 0;
        return user;
    }

    const diffDays = Math.floor((today.getTime() - last.getTime()) / DAY_MS);
    if (diffDays > 1) {
        user.streak = 0;
    }

    return user;
};

export const applyDailyStreakOnScan = (user, now = new Date()) => {
    if (!user) return user;

    const today = toUtcDayStart(now);
    const last = toUtcDayStart(user.lastStreakDate);

    if (!today || !last) {
        user.streak = 1;
        user.lastStreakDate = now;
        return user;
    }

    const diffDays = Math.floor((today.getTime() - last.getTime()) / DAY_MS);

    if (diffDays <= 0) {
        user.streak = Math.max(Number(user.streak) || 0, 1);
    } else if (diffDays === 1) {
        user.streak = (Number(user.streak) || 0) + 1;
    } else {
        user.streak = 1;
    }

    user.lastStreakDate = now;
    return user;
};
