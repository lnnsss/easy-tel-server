import { getRank } from './ranking.js';

export const WORD_SCAN_POINTS = 1;

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

export const addScanPoints = (user, points = WORD_SCAN_POINTS) => {
    ensureLegacyPoints(user);
    user.scanPoints += points;
    user.totalPoints = user.scanPoints + user.studyPoints;
    user.rank = getRank(user.totalPoints);
    return user;
};

export const addStudyPoints = (user, points = 0) => {
    ensureLegacyPoints(user);
    user.studyPoints += points;
    user.totalPoints = user.scanPoints + user.studyPoints;
    user.rank = getRank(user.totalPoints);
    return user;
};

export const toDateKey = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

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
