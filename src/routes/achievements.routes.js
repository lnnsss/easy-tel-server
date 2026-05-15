import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import { getAchievements, postAchievementEvent } from '../controllers/achievements.controller.js';

const router = Router();

router.get('/', auth, getAchievements);
router.post('/event', auth, postAchievementEvent);

export default router;
