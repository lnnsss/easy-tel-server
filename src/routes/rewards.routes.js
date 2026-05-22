import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    claimDailyReward,
    getDailyRewards,
    markDailyRewardModalSeen
} from '../controllers/dailyRewards.controller.js';

const router = Router();

router.use(auth);
router.get('/daily', getDailyRewards);
router.post('/daily/claim', claimDailyReward);
router.post('/daily/modal-seen', markDailyRewardModalSeen);

export default router;
