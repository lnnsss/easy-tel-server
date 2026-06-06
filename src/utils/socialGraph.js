import mongoose from 'mongoose';
import Friendship from '../models/Friendship.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

// Содержит вспомогательную логику toIdString для переиспользования в проекте.
const toIdString = (value) => String(value || '');

// Приводит пару пользователей к стабильному порядку для социальных связей.
export const normalizeUserPair = (first, second) => {
    const a = toIdString(first);
    const b = toIdString(second);
    if (!a || !b) return { a: null, b: null };
    return a < b ? { a, b } : { a: b, b: a };
};

// Содержит вспомогательную логику toObjectId для переиспользования в проекте.
export const toObjectId = (value) => {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
};

// Возвращает id друзей пользователя из подтвержденных связей.
export const getFriendUserIds = async (userId) => {
    const uid = toIdString(userId);
    if (!uid) return [];

    const edges = await Friendship.find({
        $or: [{ userA: uid }, { userB: uid }]
    }).select('userA userB').lean();

    return edges.map((edge) => {
        const userA = toIdString(edge.userA);
        const userB = toIdString(edge.userB);
        return userA === uid ? userB : userA;
    });
};

// Содержит вспомогательную логику areUsersFriends для переиспользования в проекте.
export const areUsersFriends = async (firstUserId, secondUserId) => {
    const pair = normalizeUserPair(firstUserId, secondUserId);
    if (!pair.a || !pair.b) return false;

    const exists = await Friendship.exists({ userA: pair.a, userB: pair.b });
    return Boolean(exists);
};

// Возвращает нужные данные или вычисленное значение.
export const getOrCreateDirectConversation = async (firstUserId, secondUserId) => {
    const pair = normalizeUserPair(firstUserId, secondUserId);
    if (!pair.a || !pair.b) return null;

    let conversation = await Conversation.findOne({ participantA: pair.a, participantB: pair.b });
    if (conversation) return conversation;

    conversation = await Conversation.create({
        participants: [pair.a, pair.b],
        participantA: pair.a,
        participantB: pair.b
    });

    return conversation;
};

// Возвращает нужные данные или вычисленное значение.
export const getConversationPartnerId = (conversation, currentUserId) => {
    const me = toIdString(currentUserId);
    const participantA = toIdString(conversation.participantA || conversation.participants?.[0]);
    const participantB = toIdString(conversation.participantB || conversation.participants?.[1]);

    if (participantA === me) return participantB;
    return participantA;
};

// Возвращает нужные данные или вычисленное значение.
export const getConversationUnreadCountForUser = async (conversationId, userId) => {
    return Message.countDocuments({
        conversationId,
        senderId: { $ne: userId },
        readBy: { $ne: userId }
    });
};

// Возвращает нужные данные или вычисленное значение.
export const getTotalUnreadCountForUser = async (userId) => {
    const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
    if (!conversations.length) return 0;

    const ids = conversations.map((conversation) => conversation._id);
    return Message.countDocuments({
        conversationId: { $in: ids },
        senderId: { $ne: userId },
        readBy: { $ne: userId }
    });
};
