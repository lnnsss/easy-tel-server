import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import userOnly from '../middleware/userOnly.middleware.js';
import {
    getChatMessages,
    getChats,
    getOrCreateChatWithFriend,
    markChatAsRead,
    sendVoiceMessage,
    markVoiceMessageListened,
    deleteChat,
    deleteMessage
} from '../controllers/chats.controller.js';
import chatVoiceUpload from '../middleware/chatVoiceUpload.middleware.js';

const router = Router();

router.use(auth, userOnly);

router.get('/', getChats);
router.post('/with/:friendUserId', getOrCreateChatWithFriend);
router.get('/:conversationId/messages', getChatMessages);
router.post('/:conversationId/read', markChatAsRead);
router.post('/:conversationId/messages/:messageId/listened', markVoiceMessageListened);
router.delete('/:conversationId/messages/:messageId', deleteMessage);
router.delete('/:conversationId', deleteChat);
router.post(
    '/:conversationId/voice',
    (req, res, next) => {
        chatVoiceUpload.single('voice')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ message: err?.message || 'Ошибка загрузки аудио' });
            }
            return next();
        });
    },
    sendVoiceMessage
);

export default router;
