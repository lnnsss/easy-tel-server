import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    addToDictionary,
    getDictionary,
    getDictionaryItem,
    getWeeklyAssessmentStatus,
    startWeeklyAssessment,
    submitWeeklyAssessment
} from '../controllers/dictionary.controller.js';

const router = Router();

router.post('/add', auth, addToDictionary);
router.get('/weekly-assessment', auth, getWeeklyAssessmentStatus);
router.post('/weekly-assessment/start', auth, startWeeklyAssessment);
router.post('/weekly-assessment/submit', auth, submitWeeklyAssessment);
router.get('/', auth, getDictionary);
router.get('/:id', auth, getDictionaryItem);

export default router;
