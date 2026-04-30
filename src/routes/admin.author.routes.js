import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import {
    getAdminAuthorRequests,
    reviewAuthorRequest
} from '../controllers/author.requests.controller.js';

const router = Router();

router.use(auth, admin);
router.get('/author/requests', getAdminAuthorRequests);
router.patch('/author/requests/:id/review', reviewAuthorRequest);

export default router;
