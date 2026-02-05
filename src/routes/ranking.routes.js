import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    getTopRanking,
    getUserRank
} from '../controllers/ranking.controller.js';

const router = Router();

router.get('/', getTopRanking);
router.get('/me', auth, getUserRank);

export default router;
