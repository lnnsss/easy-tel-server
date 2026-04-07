import User from '../models/User.js';
import { ensureLegacyPoints } from '../utils/userProgress.js';

export const getTopRanking = async (_, res) => {
    try {
        const users = await User.aggregate([
            {
                // Исключаем админов
                $match: { role: { $ne: 'admin' } }
            },
            {
                $project: {
                    username: 1,
                    firstName: 1,
                    lastName: 1,
                    avatarUrl: 1,
                    rank: 1,
                    totalPoints: { $ifNull: ['$totalPoints', 0] },
                    wordsCount: { $size: { $ifNull: ["$dictionary", []] } }
                }
            },
            { $sort: { totalPoints: -1, wordsCount: -1 } },
            { $limit: 5 }
        ]);

        res.json(users || []);
    } catch (err) {
        console.error("Ranking error:", err);
        res.status(500).json([]);
    }
};

export const getUserRank = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user) {
            ensureLegacyPoints(user);
            await user.save();
        }
        res.json({ rank: user?.rank || 'Новичок' });
    } catch (err) {
        res.status(500).json({ rank: 'Ошибка' });
    }
};
