import User from '../models/User.js';
import UserWord from '../models/UserWord.js';
import { ensureLegacyPoints } from '../utils/userProgress.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getPublicProfileByUsername = async (req, res) => {
    try {
        const username = String(req.params.username || '').trim();
        if (!username) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const user = await User.findOne({
            username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' },
            role: { $ne: 'admin' }
        }).select('avatarUrl username firstName lastName streak totalPoints achievements rank dictionary');

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        ensureLegacyPoints(user);
        await user.save();

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [wordsTotal, wordsWeek] = await Promise.all([
            UserWord.countDocuments({ user: user._id }),
            UserWord.countDocuments({ user: user._id, learnedAt: { $gte: weekAgo } })
        ]);

        return res.json({
            profile: {
                avatarUrl: user.avatarUrl || null,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                streak: Number(user.streak) || 0,
                wordsWeek,
                wordsTotal,
                totalPoints: Number(user.totalPoints) || 0,
                achievements: Array.isArray(user.achievements) ? user.achievements : [],
                rank: user.rank || 'Бронза I'
            }
        });
    } catch (err) {
        console.error('getPublicProfileByUsername error', err);
        return res.status(500).json({ message: 'Ошибка загрузки профиля' });
    }
};
