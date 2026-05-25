import User from '../models/User.js';
import UserWord from '../models/UserWord.js';
import Friendship from '../models/Friendship.js';
import FriendRequest from '../models/FriendRequest.js';
import { ensureLegacyPoints, normalizeUserStreak } from '../utils/userProgress.js';
import { normalizeUserPair } from '../utils/socialGraph.js';
import { getUserCourseAnalytics } from '../utils/courseAnalytics.js';

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
        }).select('avatarUrl avatarAccentColor username firstName lastName streak lastStreakDate totalPoints coins achievements rank dictionary characterCustomization ownedCosmetics profileAccentColor');

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        ensureLegacyPoints(user);
        normalizeUserStreak(user);
        await user.save();

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [wordsTotal, wordsWeek] = await Promise.all([
            UserWord.countDocuments({ user: user._id }),
            UserWord.countDocuments({ user: user._id, learnedAt: { $gte: weekAgo } })
        ]);
        const analytics = await getUserCourseAnalytics(user._id);

        const currentUserId = String(req.user.id);
        const targetUserId = String(user._id);
        let relationStatus = 'none';
        let requestId = null;

        if (currentUserId === targetUserId) {
            relationStatus = 'self';
        } else {
            const pair = normalizeUserPair(currentUserId, targetUserId);
            const isFriend = await Friendship.exists({ userA: pair.a, userB: pair.b });

            if (isFriend) {
                relationStatus = 'friend';
            } else {
                const [outgoing, incoming] = await Promise.all([
                    FriendRequest.findOne({
                        fromUserId: currentUserId,
                        toUserId: targetUserId,
                        status: 'pending'
                    }).select('_id').lean(),
                    FriendRequest.findOne({
                        fromUserId: targetUserId,
                        toUserId: currentUserId,
                        status: 'pending'
                    }).select('_id').lean()
                ]);

                if (outgoing?._id) {
                    relationStatus = 'pending_outgoing';
                    requestId = String(outgoing._id);
                } else if (incoming?._id) {
                    relationStatus = 'pending_incoming';
                    requestId = String(incoming._id);
                }
            }
        }

        return res.json({
            profile: {
                _id: user._id,
                avatarUrl: user.avatarUrl || null,
                avatarAccentColor: user.avatarAccentColor || null,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                profileAccentColor: user.profileAccentColor || null,
                streak: Number(user.streak) || 0,
                wordsWeek,
                wordsTotal,
                totalPoints: Number(user.totalPoints) || 0,
                coins: Number(user.coins) || 0,
                achievements: Array.isArray(user.achievements) ? user.achievements : [],
                rank: user.rank || 'Бронза I',
                characterCustomization: user.characterCustomization || null,
                ownedCosmetics: user.ownedCosmetics || null,
                analytics,
                relationStatus,
                requestId
            }
        });
    } catch (err) {
        console.error('getPublicProfileByUsername error', err);
        return res.status(500).json({ message: 'Ошибка загрузки профиля' });
    }
};
