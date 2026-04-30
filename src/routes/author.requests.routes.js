import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    createAuthorRequest,
    getMyAuthorRequest,
    markAuthorDecisionSeen
} from '../controllers/author.requests.controller.js';

const router = Router();

router.use(auth);
router.post('/requests', createAuthorRequest);
router.get('/requests/me', getMyAuthorRequest);
router.patch('/requests/:id/seen', markAuthorDecisionSeen);

export default router;
