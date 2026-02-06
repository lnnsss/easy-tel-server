import User from '../models/User.js';

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
                    rank: 1,
                    wordsCount: { $size: { $ifNull: ["$dictionary", []] } }
                }
            },
            { $sort: { wordsCount: -1 } },
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
        res.json({ rank: user?.rank || 'Новичок' });
    } catch (err) {
        res.status(500).json({ rank: 'Ошибка' });
    }
};