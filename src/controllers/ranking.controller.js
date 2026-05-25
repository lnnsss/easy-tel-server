import User from '../models/User.js';
import mongoose from 'mongoose';
import { ensureLegacyPoints } from '../utils/userProgress.js';
import { getFriendUserIds } from '../utils/socialGraph.js';

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
                    avatarAccentColor: 1,
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

export const getFriendsRanking = async (req, res) => {
    try {
        if (req.user?.role === 'admin') {
            return res.status(403).json({ message: 'Доступ только для пользователей' });
        }

        const userId = String(req.user.id);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const friendIds = await getFriendUserIds(userId);
        const ids = [...new Set([userId, ...friendIds])];

        if (!ids.length) {
            return res.json({
                items: [],
                pagination: { page, limit, total: 0, totalPages: 1 }
            });
        }

        const users = await User.aggregate([
            {
                $match: {
                    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
                    role: { $ne: 'admin' }
                }
            },
            {
                $project: {
                    username: 1,
                    firstName: 1,
                    lastName: 1,
                    avatarUrl: 1,
                    avatarAccentColor: 1,
                    rank: 1,
                    totalPoints: { $ifNull: ['$totalPoints', 0] },
                    wordsCount: { $size: { $ifNull: ['$dictionary', []] } }
                }
            },
            { $sort: { totalPoints: -1, wordsCount: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        return res.json({
            items: users || [],
            pagination: {
                page,
                limit,
                total: ids.length,
                totalPages: Math.max(Math.ceil(ids.length / limit), 1)
            }
        });
    } catch (err) {
        console.error('Friends ranking error:', err);
        return res.status(500).json({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    }
};
