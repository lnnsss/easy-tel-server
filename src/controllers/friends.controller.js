import mongoose from 'mongoose';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import Friendship from '../models/Friendship.js';
import CompanionRequest from '../models/CompanionRequest.js';
import { getFriendUserIds, normalizeUserPair } from '../utils/socialGraph.js';

const USER_PUBLIC_SELECT = 'username firstName lastName avatarUrl avatarAccentColor rank totalPoints dictionary';
const COMPANION_PURPOSE_LABEL = {
    speech_practice: 'Для тренировки татарской речи',
    competition: 'Для соревнования между собой',
    course_together: 'Для совместного прохождения курса',
    motivation: 'Для взаимной мотивации',
    other: 'Другое'
};

const formatCompanionLabel = (purpose, customPurpose = '') => (
    purpose === 'other'
        ? (customPurpose || COMPANION_PURPOSE_LABEL.other)
        : (COMPANION_PURPOSE_LABEL[purpose] || COMPANION_PURPOSE_LABEL.other)
);

const formatUserCard = (user) => ({
    _id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl || null,
    avatarAccentColor: user.avatarAccentColor || null,
    rank: user.rank,
    totalPoints: Number(user.totalPoints) || 0,
    wordsCount: Array.isArray(user.dictionary) ? user.dictionary.length : 0
});

const toObjectId = (value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
};

const getPagination = (query = {}, defaultLimit = 20, maxLimit = 50) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
    return { page, limit, skip: (page - 1) * limit };
};

const getPendingRequestMaps = async (currentUserId, candidateIds) => {
    if (!candidateIds.length) {
        return { outgoingMap: new Map(), incomingMap: new Map() };
    }

    const [outgoing, incoming] = await Promise.all([
        FriendRequest.find({
            fromUserId: currentUserId,
            toUserId: { $in: candidateIds },
            status: 'pending'
        }).select('_id toUserId').lean(),
        FriendRequest.find({
            fromUserId: { $in: candidateIds },
            toUserId: currentUserId,
            status: 'pending'
        }).select('_id fromUserId').lean()
    ]);

    const outgoingMap = new Map(outgoing.map((item) => [String(item.toUserId), String(item._id)]));
    const incomingMap = new Map(incoming.map((item) => [String(item.fromUserId), String(item._id)]));

    return { outgoingMap, incomingMap };
};

export const searchUsers = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const q = String(req.query.q || '').trim();
        const { page, limit, skip } = getPagination(req.query, 20, 50);

        const query = {
            role: { $ne: 'admin' },
            _id: { $ne: userId }
        };

        if (q) {
            const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { username: { $regex: escaped, $options: 'i' } },
                { firstName: { $regex: escaped, $options: 'i' } },
                { lastName: { $regex: escaped, $options: 'i' } }
            ];
        }

        const [users, total, friendIds] = await Promise.all([
            User.find(query)
                .select(USER_PUBLIC_SELECT)
                .sort({ totalPoints: -1, firstName: 1, lastName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments(query),
            getFriendUserIds(userId)
        ]);

        const friendSet = new Set(friendIds.map(String));
        const candidateIds = users.map((user) => String(user._id));
        const { outgoingMap, incomingMap } = await getPendingRequestMaps(userId, candidateIds);

        const items = users.map((user) => {
            const id = String(user._id);
            let status = 'none';
            let requestId = null;

            if (friendSet.has(id)) {
                status = 'friend';
            } else if (outgoingMap.has(id)) {
                status = 'pending_outgoing';
                requestId = outgoingMap.get(id);
            } else if (incomingMap.has(id)) {
                status = 'pending_incoming';
                requestId = incomingMap.get(id);
            }

            return {
                ...formatUserCard(user),
                relationStatus: status,
                requestId
            };
        });

        return res.json({
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (err) {
        console.error('searchUsers error', err);
        return res.status(500).json({ message: 'Ошибка поиска пользователей' });
    }
};

export const getFriendsList = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { page, limit, skip } = getPagination(req.query, 10, 50);
        const friendIds = await getFriendUserIds(userId);

        if (!friendIds.length) {
            return res.json({
                items: [],
                pagination: { page, limit, total: 0, totalPages: 1 }
            });
        }

        const total = friendIds.length;
        const friends = await User.find({ _id: { $in: friendIds } })
            .select(USER_PUBLIC_SELECT)
            .sort({ totalPoints: -1, firstName: 1, lastName: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.json({
            items: friends.map((friend) => ({ ...formatUserCard(friend), relationStatus: 'friend' })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (err) {
        console.error('getFriendsList error', err);
        return res.status(500).json({ message: 'Ошибка загрузки друзей' });
    }
};

export const getIncomingRequests = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req.query, 10, 50);
        const filter = { toUserId: req.user.id, status: 'pending' };

        const [incoming, total] = await Promise.all([
            FriendRequest.find(filter)
                .populate({ path: 'fromUserId', select: USER_PUBLIC_SELECT })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FriendRequest.countDocuments(filter)
        ]);

        return res.json({
            items: incoming
                .filter((item) => item.fromUserId)
                .map((item) => ({
                    _id: item._id,
                    createdAt: item.createdAt,
                    from: formatUserCard(item.fromUserId)
                })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (err) {
        console.error('getIncomingRequests error', err);
        return res.status(500).json({ message: 'Ошибка загрузки входящих заявок' });
    }
};

export const getOutgoingRequests = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req.query, 10, 50);
        const filter = { fromUserId: req.user.id, status: 'pending' };

        const [outgoing, total] = await Promise.all([
            FriendRequest.find(filter)
                .populate({ path: 'toUserId', select: USER_PUBLIC_SELECT })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FriendRequest.countDocuments(filter)
        ]);

        return res.json({
            items: outgoing
                .filter((item) => item.toUserId)
                .map((item) => ({
                    _id: item._id,
                    createdAt: item.createdAt,
                    to: formatUserCard(item.toUserId)
                })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (err) {
        console.error('getOutgoingRequests error', err);
        return res.status(500).json({ message: 'Ошибка загрузки исходящих заявок' });
    }
};

export const createFriendRequest = async (req, res) => {
    try {
        const fromUserId = String(req.user.id);
        const toUserId = String(req.body.toUserId || '');
        const targetId = toObjectId(toUserId);

        if (!targetId) return res.status(400).json({ message: 'Некорректный пользователь' });
        if (fromUserId === toUserId) return res.status(400).json({ message: 'Нельзя добавить себя в друзья' });

        const target = await User.findById(targetId).select('_id role');
        if (!target || target.role === 'admin') {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const pair = normalizeUserPair(fromUserId, toUserId);
        const alreadyFriends = await Friendship.exists({ userA: pair.a, userB: pair.b });
        if (alreadyFriends) {
            return res.status(409).json({ message: 'Вы уже друзья' });
        }

        const existingOutgoing = await FriendRequest.findOne({
            fromUserId,
            toUserId,
            status: 'pending'
        });
        if (existingOutgoing) {
            return res.status(409).json({ message: 'Заявка уже отправлена' });
        }

        const reciprocal = await FriendRequest.findOne({
            fromUserId: toUserId,
            toUserId: fromUserId,
            status: 'pending'
        });

        if (reciprocal) {
            reciprocal.status = 'accepted';
            reciprocal.respondedAt = new Date();
            await reciprocal.save();

            try {
                await Friendship.create({ userA: pair.a, userB: pair.b });
            } catch (error) {
                if (error?.code !== 11000) throw error;
            }

            return res.json({ autoAccepted: true, message: 'Встречная заявка найдена. Вы теперь друзья.' });
        }

        const request = await FriendRequest.create({ fromUserId, toUserId, status: 'pending' });
        return res.status(201).json({
            request: {
                _id: request._id,
                fromUserId: request.fromUserId,
                toUserId: request.toUserId,
                status: request.status,
                createdAt: request.createdAt
            }
        });
    } catch (err) {
        console.error('createFriendRequest error', err);
        return res.status(500).json({ message: 'Ошибка отправки заявки' });
    }
};

export const acceptFriendRequest = async (req, res) => {
    try {
        const request = await FriendRequest.findOne({
            _id: req.params.id,
            toUserId: req.user.id,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        request.status = 'accepted';
        request.respondedAt = new Date();
        await request.save();

        const pair = normalizeUserPair(request.fromUserId, request.toUserId);
        try {
            await Friendship.create({ userA: pair.a, userB: pair.b });
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }

        return res.json({ message: 'Заявка принята' });
    } catch (err) {
        console.error('acceptFriendRequest error', err);
        return res.status(500).json({ message: 'Ошибка принятия заявки' });
    }
};

export const declineFriendRequest = async (req, res) => {
    try {
        const request = await FriendRequest.findOne({
            _id: req.params.id,
            toUserId: req.user.id,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        request.status = 'declined';
        request.respondedAt = new Date();
        await request.save();

        return res.json({ message: 'Заявка отклонена' });
    } catch (err) {
        console.error('declineFriendRequest error', err);
        return res.status(500).json({ message: 'Ошибка отклонения заявки' });
    }
};

export const cancelFriendRequest = async (req, res) => {
    try {
        const request = await FriendRequest.findOne({
            _id: req.params.id,
            fromUserId: req.user.id,
            status: 'pending'
        });

        if (!request) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        request.status = 'canceled';
        request.respondedAt = new Date();
        await request.save();

        return res.json({ message: 'Заявка отменена' });
    } catch (err) {
        console.error('cancelFriendRequest error', err);
        return res.status(500).json({ message: 'Ошибка отмены заявки' });
    }
};

export const removeFriend = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const friendUserId = String(req.params.friendUserId || '');
        const friendId = toObjectId(friendUserId);

        if (!friendId) return res.status(400).json({ message: 'Некорректный пользователь' });
        if (userId === friendUserId) return res.status(400).json({ message: 'Некорректный пользователь' });

        const pair = normalizeUserPair(userId, friendUserId);
        const result = await Friendship.deleteOne({ userA: pair.a, userB: pair.b });

        if (!result.deletedCount) {
            return res.status(404).json({ message: 'Пользователь не в друзьях' });
        }

        return res.json({ message: 'Пользователь удален из друзей' });
    } catch (err) {
        console.error('removeFriend error', err);
        return res.status(500).json({ message: 'Ошибка удаления из друзей' });
    }
};

export const createOrUpdateCompanionRequest = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const purpose = String(req.body.purpose || '').trim();
        const customPurpose = String(req.body.customPurpose || '').trim();

        if (!Object.keys(COMPANION_PURPOSE_LABEL).includes(purpose)) {
            return res.status(400).json({ message: 'Некорректная цель поиска собеседника' });
        }

        if (purpose === 'other' && !customPurpose) {
            return res.status(400).json({ message: 'Укажите свою причину в поле "Другое"' });
        }

        const payload = {
            purpose,
            customPurpose: purpose === 'other' ? customPurpose.slice(0, 200) : '',
            isActive: true
        };

        const request = await CompanionRequest.findOneAndUpdate(
            { userId },
            payload,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return res.json({
            request: {
                _id: request._id,
                purpose: request.purpose,
                customPurpose: request.customPurpose,
                isActive: request.isActive
            }
        });
    } catch (err) {
        console.error('createOrUpdateCompanionRequest error', err);
        return res.status(500).json({ message: 'Ошибка сохранения заявки на поиск собеседника' });
    }
};

export const getCompanionRequests = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { page, limit, skip } = getPagination(req.query, 10, 50);

        const filter = {
            userId: { $ne: userId },
            isActive: true
        };

        const [rows, total, friendIds, myRequestRow] = await Promise.all([
            CompanionRequest.find(filter)
                .populate({ path: 'userId', select: USER_PUBLIC_SELECT })
                .sort({ updatedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CompanionRequest.countDocuments(filter),
            getFriendUserIds(userId),
            CompanionRequest.findOne({ userId }).populate({ path: 'userId', select: USER_PUBLIC_SELECT }).lean()
        ]);

        const users = rows.map((row) => row.userId).filter(Boolean);
        const candidateIds = users.map((user) => String(user._id));
        const friendSet = new Set(friendIds.map(String));
        const { outgoingMap, incomingMap } = await getPendingRequestMaps(userId, candidateIds);

        const items = rows
            .filter((row) => row.userId)
            .map((row) => {
                const candidateId = String(row.userId._id);
                let relationStatus = 'none';
                let requestId = null;

                if (friendSet.has(candidateId)) {
                    relationStatus = 'friend';
                } else if (outgoingMap.has(candidateId)) {
                    relationStatus = 'pending_outgoing';
                    requestId = outgoingMap.get(candidateId);
                } else if (incomingMap.has(candidateId)) {
                    relationStatus = 'pending_incoming';
                    requestId = incomingMap.get(candidateId);
                }

                return {
                    _id: row._id,
                    user: formatUserCard(row.userId),
                    purpose: row.purpose,
                    purposeLabel: formatCompanionLabel(row.purpose, row.customPurpose),
                    customPurpose: row.customPurpose || '',
                    relationStatus,
                    requestId,
                    updatedAt: row.updatedAt
                };
            });

        const myRequest = myRequestRow && myRequestRow.userId ? {
            _id: myRequestRow._id,
            user: formatUserCard(myRequestRow.userId),
            purpose: myRequestRow.purpose,
            purposeLabel: formatCompanionLabel(myRequestRow.purpose, myRequestRow.customPurpose),
            customPurpose: myRequestRow.customPurpose || '',
            isActive: Boolean(myRequestRow.isActive),
            updatedAt: myRequestRow.updatedAt
        } : null;

        return res.json({
            items,
            myRequest,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        });
    } catch (err) {
        console.error('getCompanionRequests error', err);
        return res.status(500).json({ message: 'Ошибка загрузки заявок на поиск собеседника' });
    }
};

export const withdrawCompanionRequest = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const request = await CompanionRequest.findOneAndUpdate(
            { userId },
            { isActive: false },
            { new: true }
        );

        if (!request) {
            return res.status(404).json({ message: 'Активная заявка не найдена' });
        }

        return res.json({ message: 'Заявка отозвана' });
    } catch (err) {
        console.error('withdrawCompanionRequest error', err);
        return res.status(500).json({ message: 'Ошибка отзыва заявки' });
    }
};
