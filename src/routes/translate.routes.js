import { Router } from 'express';
import { synthesizeSpeech, translateText } from '../controllers/translate.controller.js';

const router = Router();

router.post('/', translateText);
router.post('/tts', synthesizeSpeech);

export default router;
