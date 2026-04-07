import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import { getPublicProfileByUsername } from '../controllers/users.controller.js';

const router = Router();

router.use(auth);
router.get('/:username/profile', getPublicProfileByUsername);

export default router;
