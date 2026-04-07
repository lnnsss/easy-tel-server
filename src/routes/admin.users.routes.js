import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import { deleteUser, getUsers } from '../controllers/admin.users.controller.js';

const router = Router();

router.use(auth, admin);

router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);

export default router;
