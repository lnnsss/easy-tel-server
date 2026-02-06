import authRoutes from './auth.routes.js';
import recognizeRoutes from './recognize.routes.js';
import dictionaryRoutes from './dictionary.routes.js';
import rankingRoutes from './ranking.routes.js';
import achievementsRoutes from './achievements.routes.js';
import adminWordRoutes from './admin.words.routes.js';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRoutes);
router.use('/recognize', recognizeRoutes);
router.use('/dictionary', dictionaryRoutes);
router.use('/ranking', rankingRoutes);
router.use('/achievements', achievementsRoutes);
router.use('/admin', adminWordRoutes);

export default router;
