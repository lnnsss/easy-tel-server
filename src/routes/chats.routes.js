import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import userOnly from '../middleware/userOnly.middleware.js';
import {
    getChatMessages,
    getChats,
    getOrCreateChatWithFriend,
    markChatAsRead
} from '../controllers/chats.controller.js';

const router = Router();

router.use(auth, userOnly);

router.get('/', getChats);
router.post('/with/:friendUserId', getOrCreateChatWithFriend);
router.get('/:conversationId/messages', getChatMessages);
router.post('/:conversationId/read', markChatAsRead);

export default router;
