import DailyRewardConfig from '../models/DailyRewardConfig.js';
import { toDateKey } from './userProgress.js';

export const DAILY_REWARD_DAYS = 7;
const CONFIG_KEY = 'default';

const buildDefaultDays = () => Array.from({ length: DAILY_REWARD_DAYS }, (_, index) => ({
    dayNumber: index + 1,
    coins: 0,
    studyPoints: 0
}));

export const normalizeRewardDaysInput = (rawDays = []) => {
    const inputByDay = new Map();
    if (Array.isArray(rawDays)) {
        for (const item of rawDays) {
            const dayNumber = Number(item?.dayNumber);
            if (Number.isFinite(dayNumber) && dayNumber >= 1 && dayNumber <= DAILY_REWARD_DAYS) {
                inputByDay.set(dayNumber, item);
            }
        }
    }

    return Array.from({ length: DAILY_REWARD_DAYS }, (_, idx) => {
        const dayNumber = idx + 1;
        const source = inputByDay.get(dayNumber) || {};
        const coinsRaw = Number(source.coins);
        const studyPointsRaw = Number(source.studyPoints);
        return {
            dayNumber,
            coins: Number.isFinite(coinsRaw) && coinsRaw >= 0 ? Math.floor(coinsRaw) : 0,
            studyPoints: Number.isFinite(studyPointsRaw) && studyPointsRaw >= 0 ? Math.floor(studyPointsRaw) : 0
        };
    });
};

export const getOrCreateDailyRewardConfig = async () => {
    let config = await DailyRewardConfig.findOne({ key: CONFIG_KEY });
    if (!config) {
        config = await DailyRewardConfig.create({
            key: CONFIG_KEY,
            days: buildDefaultDays()
        });
        return config;
    }

    const rawDays = Array.isArray(config.days) ? config.days : [];
    const normalizedDays = normalizeRewardDaysInput(rawDays);
    const rawComparable = [...rawDays]
        .map((item) => ({
            dayNumber: Number(item?.dayNumber),
            coins: Number(item?.coins),
            studyPoints: Number(item?.studyPoints)
        }))
        .sort((a, b) => a.dayNumber - b.dayNumber);
    const needsUpdate = rawDays.length !== DAILY_REWARD_DAYS
        || JSON.stringify(rawComparable) !== JSON.stringify(normalizedDays);
    if (needsUpdate) {
        config.days = normalizedDays;
        await config.save();
    }

    return config;
};

export const ensureUserDailyRewardsState = (user) => {
    if (!user.dailyRewards || typeof user.dailyRewards !== 'object') {
        user.dailyRewards = {};
    }

    const nextDayRaw = Number(user.dailyRewards.nextDay);
    user.dailyRewards.nextDay = Number.isFinite(nextDayRaw)
        ? Math.max(1, Math.min(DAILY_REWARD_DAYS + 1, Math.floor(nextDayRaw)))
        : 1;
    user.dailyRewards.lastClaimDateKey = String(user.dailyRewards.lastClaimDateKey || '').trim();
    user.dailyRewards.lastModalShownDateKey = String(user.dailyRewards.lastModalShownDateKey || '').trim();
    user.dailyRewards.completedAt = user.dailyRewards.nextDay > DAILY_REWARD_DAYS
        ? (user.dailyRewards.completedAt || new Date())
        : null;

    return user.dailyRewards;
};

export const buildDailyRewardsStatus = ({ user, config, now = new Date() }) => {
    const state = ensureUserDailyRewardsState(user);
    const todayKey = toDateKey(now);
    const days = normalizeRewardDaysInput(config?.days || []);
    const isCompleted = state.nextDay > DAILY_REWARD_DAYS;
    const currentDay = isCompleted ? null : state.nextDay;

    const rewards = days.map((day) => {
        let status = 'locked';
        if (isCompleted || day.dayNumber < state.nextDay) status = 'claimed';
        if (!isCompleted && day.dayNumber === state.nextDay) status = 'current';

        return {
            dayNumber: day.dayNumber,
            coins: day.coins,
            studyPoints: day.studyPoints,
            status
        };
    });

    const currentReward = !isCompleted
        ? rewards.find((day) => day.dayNumber === currentDay) || null
        : null;

    return {
        nextDay: state.nextDay,
        isCompleted,
        currentDay,
        currentReward,
        rewards,
        shouldShowLoginModalToday: !isCompleted && todayKey && state.lastModalShownDateKey !== todayKey
    };
};

export const markDailyRewardsModalSeen = (user, now = new Date()) => {
    const state = ensureUserDailyRewardsState(user);
    const todayKey = toDateKey(now);
    if (todayKey) state.lastModalShownDateKey = todayKey;
};
