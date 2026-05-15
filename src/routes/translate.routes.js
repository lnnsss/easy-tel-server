import { Router } from 'express';
import optionalAuth from '../middleware/optionalAuth.middleware.js';
import { synthesizeSpeech, translateText } from '../controllers/translate.controller.js';

const router = Router();

router.post('/', optionalAuth, translateText);
router.post('/tts', optionalAuth, synthesizeSpeech);

export default router;
