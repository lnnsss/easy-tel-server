import User from '../models/User.js';
import Course from '../models/Course.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import { addStudyPoints } from '../utils/userProgress.js';

const REWARD_BY_DIFFICULTY = {
    easy: { coins: 5, points: 2 },
    medium: { coins: 10, points: 5 },
    hard: { coins: 25, points: 10 }
};

const RELEASE_DATE = new Date();

const toDayKey = (dateValue = new Date()) => {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

const daysBetween = (a, b) => {
    const da = new Date(`${a}T00:00:00.000Z`).getTime();
    const db = new Date(`${b}T00:00:00.000Z`).getTime();
    return Math.round((da - db) / (24 * 60 * 60 * 1000));
};

const streakFromKeys = (keys = []) => {
    const uniq = [...new Set((keys || []).filter(Boolean))].sort().reverse();
    if (!uniq.length) return 0;
    let streak = 1;
    for (let i = 1; i < uniq.length; i += 1) {
        if (daysBetween(uniq[i - 1], uniq[i]) === 1) streak += 1;
        else break;
    }
    return streak;
};

export const ACHIEVEMENT_DEFS = [
    { code: 'words_1', title: 'Первое слово', description: 'Добавьте 1 слово в словарь', type: 'counter', target: 1, difficulty: 'medium' },
    { code: 'words_10', title: '10 слов', description: 'Добавьте 10 слов в словарь', type: 'counter', target: 10, difficulty: 'medium' },
    { code: 'words_25', title: '25 слов', description: 'Добавьте 25 слов в словарь', type: 'counter', target: 25, difficulty: 'medium' },
    { code: 'words_50', title: '50 слов', description: 'Добавьте 50 слов в словарь', type: 'counter', target: 50, difficulty: 'hard' },
    { code: 'words_75', title: '75 слов', description: 'Добавьте 75 слов в словарь', type: 'counter', target: 75, difficulty: 'hard' },
    { code: 'words_100', title: '100 слов', description: 'Добавьте 100 слов в словарь', type: 'counter', target: 100, difficulty: 'hard' },

    { code: 'courses_1', title: 'Первый курс', description: 'Завершите 1 курс', type: 'counter', target: 1, difficulty: 'medium' },
    { code: 'courses_3', title: 'Шәкерт', description: 'Завершите 3 курса', type: 'counter', target: 3, difficulty: 'medium' },
    { code: 'courses_5', title: 'Остаз', description: 'Завершите 5 курсов', type: 'counter', target: 5, difficulty: 'hard' },
    { code: 'courses_10', title: 'Тел остасы', description: 'Завершите 10 курсов', type: 'counter', target: 10, difficulty: 'hard' },
    { code: 'course_perfect', title: 'Без единой ошибки', description: 'Завершите курс без ошибок', type: 'binary', difficulty: 'hard' },
    { code: 'course_one_day', title: 'За день', description: 'Завершите курс в тот же день, когда начали', type: 'binary', difficulty: 'hard' },
    { code: 'category_all_courses', title: 'Вся категория', description: 'Завершите все курсы хотя бы одной категории', type: 'binary', difficulty: 'hard' },

    { code: 'tests_1', title: 'Первый тест', description: 'Пройдите 1 тест', type: 'counter', target: 1, difficulty: 'medium' },
    { code: 'test_hard', title: 'Сложный тест', description: 'Сдайте тест с результатом 90%+', type: 'binary', difficulty: 'medium' },
    { code: 'tests_10', title: '10 тестов', description: 'Пройдите 10 тестов', type: 'counter', target: 10, difficulty: 'medium' },
    { code: 'tests_25', title: '25 тестов', description: 'Пройдите 25 тестов', type: 'counter', target: 25, difficulty: 'medium' },
    { code: 'tests_50', title: '50 тестов', description: 'Пройдите 50 тестов', type: 'counter', target: 50, difficulty: 'hard' },
    { code: 'tests_75', title: '75 тестов', description: 'Пройдите 75 тестов', type: 'counter', target: 75, difficulty: 'hard' },
    { code: 'tests_100', title: '100 тестов', description: 'Пройдите 100 тестов', type: 'counter', target: 100, difficulty: 'hard' },

    { code: 'streak_3', title: '3 дня подряд', description: 'Заходите 3 дня подряд', type: 'counter', target: 3, difficulty: 'medium' },
    { code: 'streak_7', title: '7 дней подряд', description: 'Заходите 7 дней подряд', type: 'counter', target: 7, difficulty: 'medium' },
    { code: 'streak_30', title: '30 дней подряд', description: 'Заходите 30 дней подряд', type: 'counter', target: 30, difficulty: 'hard' },
    { code: 'streak_100', title: '100 дней подряд', description: 'Заходите 100 дней подряд', type: 'counter', target: 100, difficulty: 'hard' },
    { code: 'came_back_after_break', title: 'Я вернулся', description: 'Вернитесь после паузы в 3+ дня', type: 'binary', difficulty: 'medium' },

    { code: 'new_words_streak_7', title: '7 дней новых слов', description: '7 дней подряд добавляйте новые слова', type: 'counter', target: 7, difficulty: 'medium' },
    { code: 'reviews_streak_30', title: '30 дней повторений', description: '30 дней подряд проходите тесты', type: 'counter', target: 30, difficulty: 'medium' },

    { code: 'profile_completed', title: 'Приятно познакомиться', description: 'Заполните профиль', type: 'binary', difficulty: 'easy' },
    { code: 'avatar_changed', title: 'Как на паспорт', description: 'Смените аватар', type: 'binary', difficulty: 'easy' },
    { code: 'used_dark_theme', title: 'Тёмная тема', description: 'Включите тёмную тему', type: 'binary', difficulty: 'easy' },
    { code: 'used_translator', title: 'А переводи-ка мне', description: 'Переведите хотя бы одно слово', type: 'binary', difficulty: 'easy' },
    { code: 'first_message', title: 'Ало', description: 'Отправьте первое сообщение в чат', type: 'binary', difficulty: 'easy' },

    { code: 'first_tts', title: 'Первое прослушивание', description: 'Прослушайте перевод слова', type: 'binary', difficulty: 'easy' },

    { code: 'referrals_1', title: 'Пригласил друга', description: 'Пригласите 1 друга по ссылке', type: 'counter', target: 1, difficulty: 'easy' },
    { code: 'referrals_5', title: 'Пригласил 5 друзей', description: 'Пригласите 5 друзей по ссылке', type: 'counter', target: 5, difficulty: 'medium' },
    { code: 'referrals_10', title: 'Пригласил 10 друзей', description: 'Пригласите 10 друзей по ссылке', type: 'counter', target: 10, difficulty: 'hard' }
].map((def) => ({ ...def, rewards: REWARD_BY_DIFFICULTY[def.difficulty] }));

const ensureStats = (user) => {
    if (!user.achievementStats || typeof user.achievementStats !== 'object') user.achievementStats = {};
    const s = user.achievementStats;
    if (!Array.isArray(s.loginDays)) s.loginDays = [];
    if (!Array.isArray(s.wordAddDays)) s.wordAddDays = [];
    if (!Array.isArray(s.testPassDays)) s.testPassDays = [];
    if (!Number.isFinite(s.testsPassedCount)) s.testsPassedCount = 0;
    if (!Number.isFinite(s.hardTestsCount)) s.hardTestsCount = 0;
    if (!Number.isFinite(s.completedCoursesCount)) s.completedCoursesCount = 0;
    if (!s.releaseTrackedAt) s.releaseTrackedAt = RELEASE_DATE;
    if (!Array.isArray(user.userAchievements)) user.userAchievements = [];
    return s;
};

const upsertDay = (arr, key) => {
    if (!key) return;
    if (!arr.includes(key)) arr.push(key);
};

const calculateProgressMap = async (user) => {
    const stats = ensureStats(user);

    const completedCourses = await UserCourseProgress.find({
        userId: user._id,
        completedAt: { $ne: null },
        updatedAt: { $gte: stats.releaseTrackedAt || RELEASE_DATE }
    }).select('courseId createdAt completedAt').lean();

    const completedCourseCount = completedCourses.length;
    stats.completedCoursesCount = completedCourseCount;

    const attemptsCount = Number(stats.testsPassedCount) || 0;
    const hardCount = Number(stats.hardTestsCount) || 0;

    const loginStreak = streakFromKeys(stats.loginDays);
    const wordsStreak = streakFromKeys(stats.wordAddDays);
    const reviewStreak = streakFromKeys(stats.testPassDays);

    const courseIds = completedCourses.map((c) => c.courseId);
    const completedCoursesDocs = courseIds.length
        ? await Course.find({ _id: { $in: courseIds } }).select('categoryId categoryIds').lean()
        : [];

    const completedByCategory = new Map();
    for (const course of completedCoursesDocs) {
        const ids = [course.categoryId, ...(Array.isArray(course.categoryIds) ? course.categoryIds : [])]
            .map((x) => String(x || '')).filter(Boolean);
        ids.forEach((id) => completedByCategory.set(id, (completedByCategory.get(id) || 0) + 1));
    }

    const allPublished = await Course.find({
        status: 'published',
        isActive: true,
        isRevision: { $ne: true },
        reviewStatus: { $in: ['not_required', 'approved', null] }
    }).select('categoryId categoryIds').lean();

    const totalByCategory = new Map();
    for (const course of allPublished) {
        const ids = [course.categoryId, ...(Array.isArray(course.categoryIds) ? course.categoryIds : [])]
            .map((x) => String(x || '')).filter(Boolean);
        ids.forEach((id) => totalByCategory.set(id, (totalByCategory.get(id) || 0) + 1));
    }

    const hasFullCategory = [...totalByCategory.entries()].some(([cid, total]) => total > 0 && (completedByCategory.get(cid) || 0) >= total);

    const progress = {
        words_1: Array.isArray(user.dictionary) ? user.dictionary.length : 0,
        words_10: Array.isArray(user.dictionary) ? user.dictionary.length : 0,
        words_25: Array.isArray(user.dictionary) ? user.dictionary.length : 0,
        words_50: Array.isArray(user.dictionary) ? user.dictionary.length : 0,
        words_75: Array.isArray(user.dictionary) ? user.dictionary.length : 0,
        words_100: Array.isArray(user.dictionary) ? user.dictionary.length : 0,

        courses_1: completedCourseCount,
        courses_3: completedCourseCount,
        courses_5: completedCourseCount,
        courses_10: completedCourseCount,
        course_perfect: stats.coursePerfect ? 1 : 0,
        course_one_day: stats.courseOneDay ? 1 : 0,
        category_all_courses: hasFullCategory ? 1 : 0,

        tests_1: attemptsCount,
        test_hard: hardCount > 0 ? 1 : 0,
        tests_10: attemptsCount,
        tests_25: attemptsCount,
        tests_50: attemptsCount,
        tests_75: attemptsCount,
        tests_100: attemptsCount,

        streak_3: loginStreak,
        streak_7: loginStreak,
        streak_30: loginStreak,
        streak_100: loginStreak,
        came_back_after_break: stats.cameBackAfterBreak ? 1 : 0,

        new_words_streak_7: wordsStreak,
        reviews_streak_30: reviewStreak,

        profile_completed: stats.profileCompleted ? 1 : 0,
        avatar_changed: stats.avatarChanged ? 1 : 0,
        used_dark_theme: stats.usedDarkTheme ? 1 : 0,
        used_translator: stats.usedTranslator ? 1 : 0,
        first_message: stats.firstMessage ? 1 : 0,
        first_tts: stats.firstTts ? 1 : 0,

        referrals_1: Number(user.referralsCount) || 0,
        referrals_5: Number(user.referralsCount) || 0,
        referrals_10: Number(user.referralsCount) || 0
    };

    return progress;
};

export const trackAchievementEvent = async ({ userId, eventType, payload = {} }) => {
    const user = await User.findById(userId);
    if (!user) return { unlockedNow: [], achievements: [] };

    const stats = ensureStats(user);
    const todayKey = toDayKey(new Date());

    if (eventType === 'login') {
        const prev = stats.lastLoginDayKey;
        if (prev && daysBetween(todayKey, prev) > 3) stats.cameBackAfterBreak = true;
        upsertDay(stats.loginDays, todayKey);
        stats.lastLoginDayKey = todayKey;
    }

    if (eventType === 'word_added') {
        upsertDay(stats.wordAddDays, todayKey);
    }

    if (eventType === 'test_passed') {
        stats.testsPassedCount = (Number(stats.testsPassedCount) || 0) + 1;
        upsertDay(stats.testPassDays, todayKey);
        if (Number(payload.scorePercent) >= 90) {
            stats.hardTestsCount = (Number(stats.hardTestsCount) || 0) + 1;
        }
    }

    if (eventType === 'course_completed') {
        if (payload.perfect === true) stats.coursePerfect = true;
        if (payload.oneDay === true) stats.courseOneDay = true;
    }

    if (eventType === 'profile_updated') {
        stats.profileCompleted = true;
    }
    if (eventType === 'referral_invited') {
        // Progress is computed from user.referralsCount in calculateProgressMap.
    }
    if (eventType === 'avatar_changed') stats.avatarChanged = true;
    if (eventType === 'theme_dark_used') stats.usedDarkTheme = true;
    if (eventType === 'translator_used') stats.usedTranslator = true;
    if (eventType === 'message_sent') stats.firstMessage = true;
    if (eventType === 'tts_used') stats.firstTts = true;

    const progressMap = await calculateProgressMap(user);

    const unlockedNow = [];
    for (const def of ACHIEVEMENT_DEFS) {
        const current = Math.max(0, Number(progressMap[def.code]) || 0);
        const target = def.type === 'counter' ? Number(def.target || 1) : 1;
        const isUnlocked = current >= target;

        let row = user.userAchievements.find((item) => item.achievementCode === def.code);
        if (!row) {
            row = {
                achievementCode: def.code,
                progressCurrent: current,
                progressTarget: target,
                unlockedAt: null,
                claimedRewards: false
            };
            user.userAchievements.push(row);
        } else {
            row.progressCurrent = current;
            row.progressTarget = target;
        }

        if (isUnlocked && !row.unlockedAt) {
            row.unlockedAt = new Date();
            if (!row.claimedRewards) {
                user.coins = (Number(user.coins) || 0) + Number(def.rewards.coins || 0);
                addStudyPoints(user, Number(def.rewards.points || 0));
                row.claimedRewards = true;
            }
            unlockedNow.push({
                code: def.code,
                title: def.title,
                rewards: def.rewards,
                unlockedAt: row.unlockedAt
            });
        }
    }

    await user.save();

    return {
        unlockedNow,
        achievements: buildAchievementsResponse(user)
    };
};

export const buildAchievementsResponse = (user) => {
    const map = new Map((user.userAchievements || []).map((item) => [item.achievementCode, item]));
    return ACHIEVEMENT_DEFS.map((def) => {
        const row = map.get(def.code);
        const progressCurrent = Math.max(0, Number(row?.progressCurrent) || 0);
        const progressTarget = Math.max(1, Number(row?.progressTarget) || (def.type === 'counter' ? Number(def.target || 1) : 1));
        const hasProgressBar = def.type === 'counter';
        return {
            code: def.code,
            title: def.title,
            description: def.description,
            difficulty: def.difficulty,
            isUnlocked: Boolean(row?.unlockedAt),
            progressCurrent,
            progressTarget,
            hasProgressBar,
            rewards: def.rewards,
            unlockedAt: row?.unlockedAt || null
        };
    });
};

export const getAchievementsForUser = async (userId) => {
    const user = await User.findById(userId);
    if (!user) return [];

    ensureStats(user);
    const progressMap = await calculateProgressMap(user);
    for (const def of ACHIEVEMENT_DEFS) {
        const target = def.type === 'counter' ? Number(def.target || 1) : 1;
        const current = Math.max(0, Number(progressMap[def.code]) || 0);
        let row = user.userAchievements.find((item) => item.achievementCode === def.code);
        if (!row) {
            row = {
                achievementCode: def.code,
                progressCurrent: current,
                progressTarget: target,
                unlockedAt: null,
                claimedRewards: false
            };
            user.userAchievements.push(row);
        } else {
            row.progressCurrent = current;
            row.progressTarget = target;
        }
    }
    await user.save();
    return buildAchievementsResponse(user);
};
