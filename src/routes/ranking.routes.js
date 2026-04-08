import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    getFriendsRanking,
    getTopRanking,
    getUserRank
} from '../controllers/ranking.controller.js';

const router = Router();

router.get('/', getTopRanking);
router.get('/me', auth, getUserRank);
router.get('/friends', auth, getFriendsRanking);

export default router;
