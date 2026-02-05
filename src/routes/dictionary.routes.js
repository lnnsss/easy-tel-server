import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    addToDictionary,
    getDictionary,
    getDictionaryItem
} from '../controllers/dictionary.controller.js';

const router = Router();

router.post('/add', auth, addToDictionary);
router.get('/', auth, getDictionary);
router.get('/:id', auth, getDictionaryItem);

export default router;
