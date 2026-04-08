import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import {
    areUsersFriends,
    getConversationPartnerId,
    getConversationUnreadCountForUser,
    getTotalUnreadCountForUser
} from '../utils/socialGraph.js';

let ioInstance = null;

const emitUnread = async (userId, conversationId) => {
    if (!ioInstance) return;
    const [conversationUnread, totalUnread] = await Promise.all([
        getConversationUnreadCountForUser(conversationId, userId),
        getTotalUnreadCountForUser(userId)
    ]);

    ioInstance.to(`user:${userId}`).emit('chat:read_update', {
        conversationId: String(conversationId),
        unreadCount: Number(conversationUnread) || 0,
        totalUnread: Number(totalUnread) || 0
    });
};

const authenticateSocket = async (socket, next) => {
    try {
        const tokenFromAuth = socket.handshake?.auth?.token;
        const tokenFromHeader = socket.handshake?.headers?.authorization?.split(' ')[1];
        const token = tokenFromAuth || tokenFromHeader;

        if (!token) return next(new Error('NO_TOKEN'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('_id role tokenVersion');

        if (!user) return next(new Error('USER_NOT_FOUND'));
        if (user.role === 'admin') return next(new Error('FORBIDDEN'));
        if ((decoded.tv || 0) !== (user.tokenVersion || 0)) return next(new Error('STALE_SESSION'));

        socket.user = { id: String(user._id), role: user.role };
        return next();
    } catch {
        return next(new Error('INVALID_TOKEN'));
    }
};

const handleSendMessage = (socket) => async (payload = {}) => {
    try {
        const conversationId = String(payload.conversationId || '');
        const rawText = String(payload.text || '');
        const text = rawText.trim();

        if (!conversationId) {
            socket.emit('chat:error', { message: 'Не передан conversationId' });
            return;
        }
        if (!text) {
            socket.emit('chat:error', { message: 'Сообщение не может быть пустым' });
            return;
        }
        if (text.length > 2000) {
            socket.emit('chat:error', { message: 'Сообщение слишком длинное' });
            return;
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: socket.user.id
        });

        if (!conversation) {
            socket.emit('chat:error', { message: 'Чат не найден' });
            return;
        }

        const partnerId = getConversationPartnerId(conversation, socket.user.id);
        const isFriend = await areUsersFriends(socket.user.id, partnerId);

        if (!isFriend) {
            socket.emit('chat:error', { message: 'Чат доступен только с друзьями' });
            return;
        }

        const message = await Message.create({
            conversationId,
            senderId: socket.user.id,
            text,
            readBy: [socket.user.id]
        });

        conversation.lastMessageText = text;
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        const outgoing = {
            _id: message._id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            text: message.text,
            readBy: message.readBy,
            createdAt: message.createdAt
        };

        socket.join(`conversation:${conversationId}`);
        ioInstance.to(`conversation:${conversationId}`).emit('chat:new', outgoing);
        ioInstance.to(`user:${partnerId}`).emit('chat:new', outgoing);
        ioInstance.to(`user:${socket.user.id}`).emit('chat:new', outgoing);
        await emitUnread(partnerId, conversationId);
        await emitUnread(socket.user.id, conversationId);
    } catch (err) {
        console.error('socket chat:send error', err);
        socket.emit('chat:error', { message: 'Ошибка отправки сообщения' });
    }
};

const handleReadMessage = (socket) => async (payload = {}) => {
    try {
        const conversationId = String(payload.conversationId || '');
        if (!conversationId) {
            socket.emit('chat:error', { message: 'Не передан conversationId' });
            return;
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: socket.user.id
        });

        if (!conversation) {
            socket.emit('chat:error', { message: 'Чат не найден' });
            return;
        }

        await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: socket.user.id },
                readBy: { $ne: socket.user.id }
            },
            { $addToSet: { readBy: socket.user.id } }
        );

        const partnerId = getConversationPartnerId(conversation, socket.user.id);
        await emitUnread(socket.user.id, conversationId);
        await emitUnread(partnerId, conversationId);

        ioInstance.to(`conversation:${conversationId}`).emit('chat:read_update', {
            conversationId,
            readerId: socket.user.id
        });
    } catch (err) {
        console.error('socket chat:read error', err);
        socket.emit('chat:error', { message: 'Ошибка обновления прочтения' });
    }
};

export const initSocket = (httpServer) => {
    ioInstance = new Server(httpServer, {
        cors: {
            origin: '*'
        }
    });

    ioInstance.use(authenticateSocket);

    ioInstance.on('connection', (socket) => {
        const userId = socket.user.id;
        socket.join(`user:${userId}`);

        Conversation.find({ participants: userId }).select('_id').lean()
            .then((conversations) => {
                conversations.forEach((conversation) => {
                    socket.join(`conversation:${conversation._id}`);
                });
            })
            .catch((err) => {
                console.error('socket join conversations error', err);
            });

        socket.on('chat:send', handleSendMessage(socket));
        socket.on('chat:read', handleReadMessage(socket));
    });

    return ioInstance;
};

export const getIO = () => ioInstance;
