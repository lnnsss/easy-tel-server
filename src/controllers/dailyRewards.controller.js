import User from '../models/User.js';
import {
    buildDailyRewardsStatus,
    ensureUserDailyRewardsState,
    getOrCreateDailyRewardConfig,
    markDailyRewardsModalSeen
} from '../utils/dailyRewards.js';
import { addStudyPoints, ensureLegacyPoints, toDateKey } from '../utils/userProgress.js';

const buildResponse = ({ user, status }) => ({
    progress: {
        nextDay: status.nextDay,
        isCompleted: status.isCompleted,
        currentDay: status.currentDay
    },
    rewards: status.rewards,
    currentReward: status.currentReward,
    shouldShowLoginModalToday: status.shouldShowLoginModalToday,
    balances: {
        coins: Number(user.coins) || 0,
        studyPoints: Number(user.studyPoints) || 0,
        totalPoints: Number(user.totalPoints) || 0
    }
});

export const getDailyRewards = async (req, res) => {
    try {
        const [user, config] = await Promise.all([
            User.findById(req.user.id).select('coins scanPoints studyPoints totalPoints rank dailyRewards'),
            getOrCreateDailyRewardConfig()
        ]);

        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        ensureLegacyPoints(user);
        ensureUserDailyRewardsState(user);

        const status = buildDailyRewardsStatus({ user, config });
        await user.save();

        return res.json(buildResponse({ user, status }));
    } catch (err) {
        console.error('getDailyRewards error', err);
        return res.status(500).json({ message: 'Ошибка загрузки ежедневных наград' });
    }
};

export const claimDailyReward = async (req, res) => {
    try {
        const [user, config] = await Promise.all([
            User.findById(req.user.id).select('coins scanPoints studyPoints totalPoints rank dailyRewards'),
            getOrCreateDailyRewardConfig()
        ]);

        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        ensureLegacyPoints(user);
        const state = ensureUserDailyRewardsState(user);
        const status = buildDailyRewardsStatus({ user, config });
        if (status.isCompleted) {
            return res.status(400).json({ message: 'Все награды уже получены' });
        }

        const todayKey = toDateKey(new Date());
        if (state.lastClaimDateKey && state.lastClaimDateKey === todayKey) {
            return res.status(400).json({ message: 'Награда за сегодня уже получена' });
        }

        const reward = status.currentReward;
        if (!reward) {
            return res.status(400).json({ message: 'Текущая награда недоступна' });
        }

        user.coins = (Number(user.coins) || 0) + (Number(reward.coins) || 0);
        addStudyPoints(user, Number(reward.studyPoints) || 0);

        state.lastClaimDateKey = todayKey || '';
        state.nextDay = Math.min(8, Number(state.nextDay) + 1);
        if (state.nextDay > 7) {
            state.completedAt = new Date();
        }

        await user.save();

        const nextStatus = buildDailyRewardsStatus({ user, config });
        return res.json(buildResponse({ user, status: nextStatus }));
    } catch (err) {
        console.error('claimDailyReward error', err);
        return res.status(500).json({ message: 'Ошибка получения награды' });
    }
};

export const markDailyRewardModalSeen = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('dailyRewards');
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        markDailyRewardsModalSeen(user);
        await user.save();
        return res.json({ success: true });
    } catch (err) {
        console.error('markDailyRewardModalSeen error', err);
        return res.status(500).json({ message: 'Ошибка сохранения статуса модалки' });
    }
};
