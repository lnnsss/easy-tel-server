import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import { Router } from 'express';
import {
    createWord,
    getWords,
    importExternalWords,
    cleanupExternalImportedWords,
    updateWord,
    deleteWord
} from '../controllers/admin.words.controller.js';

const router = Router();

router.use(auth, admin);

router.post('/words', createWord);
router.get('/words', getWords);
router.post('/words/import', importExternalWords);
router.delete('/words/external-imports', cleanupExternalImportedWords);
router.put('/words/:id', updateWord);
router.delete('/words/:id', deleteWord);

export default router;
