import authRoutes from './auth.routes.js';
import recognizeRoutes from './recognize.routes.js';
import dictionaryRoutes from './dictionary.routes.js';
import rankingRoutes from './ranking.routes.js';
import achievementsRoutes from './achievements.routes.js';
import adminWordRoutes from './admin.words.routes.js';
import coursesRoutes from './courses.routes.js';
import adminLearningRoutes from './admin.learning.routes.js';
import adminUsersRoutes from './admin.users.routes.js';
import usersRoutes from './users.routes.js';
import friendsRoutes from './friends.routes.js';
import chatsRoutes from './chats.routes.js';
import { Router } from 'express';

const router = Router();

router.use('/auth', authRoutes);
router.use('/recognize', recognizeRoutes);
router.use('/dictionary', dictionaryRoutes);
router.use('/ranking', rankingRoutes);
router.use('/achievements', achievementsRoutes);
router.use('/admin', adminWordRoutes);
router.use('/admin', adminUsersRoutes);
router.use('/admin/learning', adminLearningRoutes);
router.use('/courses', coursesRoutes);
router.use('/users', usersRoutes);
router.use('/friends', friendsRoutes);
router.use('/chats', chatsRoutes);

export default router;
