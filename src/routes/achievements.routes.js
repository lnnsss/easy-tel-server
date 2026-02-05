import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import { getAchievements } from '../controllers/achievements.controller.js';

const router = Router();

router.get('/', auth, getAchievements);

export default router;
