import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import { Router } from 'express';
import {
    createWord,
    getWords,
    updateWord,
    deleteWord
} from '../controllers/admin.words.controller.js';

const router = Router();

router.use(auth, admin);

router.post('/words', createWord);
router.get('/words', getWords);
router.put('/words/:id', updateWord);
router.delete('/words/:id', deleteWord);

export default router;
