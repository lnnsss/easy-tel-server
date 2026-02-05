import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import {
    createWord,
    getWords,
    updateWord,
    deleteWord
} from '../controllers/admin.controller.js';

const router = Router();

router.post('/words', auth, admin, createWord);
router.get('/words', auth, admin, getWords);
router.put('/words/:id', auth, admin, updateWord);
router.delete('/words/:id', auth, admin, deleteWord);

export default router;
