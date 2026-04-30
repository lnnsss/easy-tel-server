import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import { deleteUser, getUsers, updateUserRole } from '../controllers/admin.users.controller.js';

const router = Router();

router.use(auth, admin);

router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/role', updateUserRole);

export default router;
