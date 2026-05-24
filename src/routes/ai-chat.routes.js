import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import userOnly from '../middleware/userOnly.middleware.js';
import { sendAiChatMessage } from '../controllers/aiChat.controller.js';

const router = Router();

router.use(auth, userOnly);
router.post('/message', sendAiChatMessage);

export default router;
