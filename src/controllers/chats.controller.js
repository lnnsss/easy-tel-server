import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import {
    areUsersFriends,
    getConversationPartnerId,
    getConversationUnreadCountForUser,
    getOrCreateDirectConversation,
    getTotalUnreadCountForUser,
    toObjectId
} from '../utils/socialGraph.js';
import { getIO } from '../socket/index.js';

const CHAT_USER_SELECT = 'username firstName lastName avatarUrl rank';

// Форматирует данные для отображения пользователю.
const formatUser = (user) => ({
    _id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl || null,
    rank: user.rank
});

// Возвращает нужные данные или вычисленное значение.
const getConversationByIdForUser = async (conversationId, userId) => {
    return Conversation.findOne({
        _id: conversationId,
        participants: userId
    });
};

// Обрабатывает серверный сценарий emitUnreadUpdate.
const emitUnreadUpdate = async (userId, conversationId) => {
    const io = getIO();
    if (!io) return;

    const [conversationUnread, totalUnread] = await Promise.all([
        getConversationUnreadCountForUser(conversationId, userId),
        getTotalUnreadCountForUser(userId)
    ]);

    io.to(`user:${userId}`).emit('chat:read_update', {
        conversationId: String(conversationId),
        unreadCount: Number(conversationUnread) || 0,
        totalUnread: Number(totalUnread) || 0
    });
};

// Обрабатывает серверный сценарий toMessagePayload.
const toMessagePayload = (message) => ({
    _id: message._id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    text: message.text,
    messageType: message.messageType || 'text',
    audioUrl: message.audioUrl || null,
    audioDurationSec: Number.isFinite(message.audioDurationSec) ? message.audioDurationSec : null,
    listenedBy: Array.isArray(message.listenedBy) ? message.listenedBy : [],
    readBy: message.readBy || [],
    createdAt: message.createdAt
});

// Возвращает нужные данные или вычисленное значение.
export const getChats = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        const total = await Conversation.countDocuments({ participants: userId });

        const conversations = await Conversation.find({ participants: userId })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        if (!conversations.length) {
            return res.json({
                items: [],
                totalUnread: 0,
                pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
            });
        }

        const conversationIds = conversations.map((conversation) => conversation._id);
        const partnerIds = conversations.map((conversation) => getConversationPartnerId(conversation, userId));

        const [partners, unreadAgg] = await Promise.all([
            User.find({ _id: { $in: partnerIds } }).select(CHAT_USER_SELECT).lean(),
            Message.aggregate([
                {
                    $match: {
                        conversationId: { $in: conversationIds },
                        senderId: { $ne: toObjectId(userId) },
                        readBy: { $ne: toObjectId(userId) }
                    }
                },
                {
                    $group: {
                        _id: '$conversationId',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        const partnerMap = new Map(partners.map((partner) => [String(partner._id), partner]));
        const unreadMap = new Map(unreadAgg.map((item) => [String(item._id), Number(item.count) || 0]));

        const items = conversations.map((conversation) => {
            const partnerId = getConversationPartnerId(conversation, userId);
            const partner = partnerMap.get(String(partnerId));
            return {
                _id: conversation._id,
                otherUser: partner ? formatUser(partner) : null,
                lastMessageText: conversation.lastMessageText || '',
                lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
                unreadCount: unreadMap.get(String(conversation._id)) || 0
            };
        }).filter((item) => item.otherUser);

        const totalUnread = items.reduce((sum, item) => sum + item.unreadCount, 0);

        return res.json({
            items,
            totalUnread,
            pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
        });
    } catch (err) {
        console.error('getChats error', err);
        return res.status(500).json({ message: 'Ошибка загрузки чатов' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getOrCreateChatWithFriend = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const friendUserId = String(req.params.friendUserId || '');

        if (!toObjectId(friendUserId) || userId === friendUserId) {
            return res.status(400).json({ message: 'Некорректный пользователь' });
        }

        const isFriend = await areUsersFriends(userId, friendUserId);
        if (!isFriend) {
            return res.status(403).json({ message: 'Чат доступен только с друзьями' });
        }

        const friend = await User.findById(friendUserId).select(CHAT_USER_SELECT).lean();
        if (!friend) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const conversation = await getOrCreateDirectConversation(userId, friendUserId);

        return res.json({
            conversation: {
                _id: conversation._id,
                otherUser: formatUser(friend),
                lastMessageText: conversation.lastMessageText || '',
                lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
                unreadCount: await getConversationUnreadCountForUser(conversation._id, userId)
            }
        });
    } catch (err) {
        console.error('getOrCreateChatWithFriend error', err);
        return res.status(500).json({ message: 'Ошибка открытия чата' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getChatMessages = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId } = req.params;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
        const before = req.query.before ? new Date(req.query.before) : null;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) {
            return res.status(404).json({ message: 'Чат не найден' });
        }

        const query = { conversationId };
        if (before && !Number.isNaN(before.getTime())) {
            query.createdAt = { $lt: before };
        }

        const rows = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .lean();

        const hasMore = rows.length > limit;
        const messages = (hasMore ? rows.slice(0, limit) : rows)
            .reverse()
            .map((message) => ({
                ...toMessagePayload(message)
            }));

        return res.json({
            items: messages,
            hasMore,
            nextBefore: messages.length ? messages[0].createdAt : null
        });
    } catch (err) {
        console.error('getChatMessages error', err);
        return res.status(500).json({ message: 'Ошибка загрузки сообщений' });
    }
};

// Отправляет данные во внешний сервис или realtime-канал.
export const sendVoiceMessage = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId } = req.params;
        const durationSecRaw = Number(req.body?.durationSec);
        const durationSec = Number.isFinite(durationSecRaw) ? Math.max(0, Math.min(600, Math.round(durationSecRaw))) : null;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) {
            return res.status(404).json({ message: 'Чат не найден' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'Аудио не загружено' });
        }

        const partnerId = getConversationPartnerId(conversation, userId);
        const isFriend = await areUsersFriends(userId, partnerId);
        if (!isFriend) {
            return res.status(403).json({ message: 'Чат доступен только с друзьями' });
        }

        const audioUrl = `/uploads/voices/${req.file.filename}`;
        const message = await Message.create({
            conversationId,
            senderId: userId,
            text: '',
            messageType: 'voice',
            audioUrl,
            audioDurationSec: durationSec,
            listenedBy: [userId],
            readBy: [userId]
        });

        conversation.lastMessageText = 'Голосовое сообщение';
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        const outgoing = toMessagePayload(message);

        const io = getIO();
        if (io) {
            io.to(`conversation:${conversationId}`).emit('chat:new', outgoing);
            io.to(`user:${partnerId}`).emit('chat:new', outgoing);
            io.to(`user:${userId}`).emit('chat:new', outgoing);
            await emitUnreadUpdate(partnerId, conversationId);
            await emitUnreadUpdate(userId, conversationId);
        }

        return res.status(201).json({ message: outgoing });
    } catch (err) {
        console.error('sendVoiceMessage error', err);
        return res.status(500).json({ message: 'Ошибка отправки голосового сообщения' });
    }
};

// Помечает состояние как просмотренное или обработанное.
export const markVoiceMessageListened = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId, messageId } = req.params;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) return res.status(404).json({ message: 'Чат не найден' });

        const message = await Message.findOne({
            _id: messageId,
            conversationId,
            messageType: 'voice'
        });
        if (!message) return res.status(404).json({ message: 'Голосовое сообщение не найдено' });

        await Message.updateOne({ _id: messageId }, { $addToSet: { listenedBy: userId } });
        return res.json({ ok: true });
    } catch (err) {
        console.error('markVoiceMessageListened error', err);
        return res.status(500).json({ message: 'Ошибка обновления статуса прослушивания' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteMessage = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId, messageId } = req.params;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) return res.status(404).json({ message: 'Чат не найден' });

        const message = await Message.findOne({ _id: messageId, conversationId });
        if (!message) return res.status(404).json({ message: 'Сообщение не найдено' });
        if (String(message.senderId) !== userId) {
            return res.status(403).json({ message: 'Можно удалить только свои сообщения' });
        }

        await Message.deleteOne({ _id: messageId });

        const last = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).lean();
        conversation.lastMessageAt = last?.createdAt || null;
        conversation.lastMessageText = last
            ? (last.messageType === 'voice' ? 'Голосовое сообщение' : (last.text || ''))
            : '';
        await conversation.save();

        const io = getIO();
        if (io) {
            io.to(`conversation:${conversationId}`).emit('chat:message_deleted', {
                conversationId: String(conversationId),
                messageId: String(messageId)
            });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('deleteMessage error', err);
        return res.status(500).json({ message: 'Ошибка удаления сообщения' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteChat = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId } = req.params;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) return res.status(404).json({ message: 'Чат не найден' });

        await Message.deleteMany({ conversationId });
        await Conversation.deleteOne({ _id: conversationId });

        const io = getIO();
        if (io) {
            for (const participant of conversation.participants || []) {
                io.to(`user:${String(participant)}`).emit('chat:conversation_deleted', {
                    conversationId: String(conversationId)
                });
            }
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('deleteChat error', err);
        return res.status(500).json({ message: 'Ошибка удаления чата' });
    }
};

// Помечает состояние как просмотренное или обработанное.
export const markChatAsRead = async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { conversationId } = req.params;

        const conversation = await getConversationByIdForUser(conversationId, userId);
        if (!conversation) {
            return res.status(404).json({ message: 'Чат не найден' });
        }

        await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: userId },
                readBy: { $ne: userId }
            },
            {
                $addToSet: { readBy: userId }
            }
        );

        await emitUnreadUpdate(userId, conversationId);

        return res.json({ message: 'Прочитано' });
    } catch (err) {
        console.error('markChatAsRead error', err);
        return res.status(500).json({ message: 'Ошибка обновления статуса прочтения' });
    }
};
