import { getAchievementsForUser, trackAchievementEvent } from '../services/achievements.service.js';

const ALLOWED_EVENTS = new Set(['theme_dark_used']);

export const getAchievements = async (req, res) => {
    const achievements = await getAchievementsForUser(req.user.id);
    res.json({ items: achievements });
};

export const postAchievementEvent = async (req, res) => {
    const eventType = String(req.body?.eventType || '').trim();
    if (!ALLOWED_EVENTS.has(eventType)) {
        return res.status(400).json({ message: 'Некорректный eventType' });
    }

    const result = await trackAchievementEvent({ userId: req.user.id, eventType });
    return res.json({ success: true, unlockedNow: result.unlockedNow || [] });
};
