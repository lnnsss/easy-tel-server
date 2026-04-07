import { Router } from 'express';
import {
    forgotPassword,
    googleAuthCallback,
    googleAuthStart,
    login,
    profile,
    register,
    resendVerificationCode,
    resetPassword,
    updateProfile,
    uploadAvatar,
    verifyEmail
} from '../controllers/auth.controller.js';
import auth from '../middleware/auth.middleware.js';
import avatarUpload from '../middleware/avatarUpload.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', auth, verifyEmail);
router.post('/resend-verification-code', auth, resendVerificationCode);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/google', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.get('/profile', auth, profile);
router.patch('/profile', auth, updateProfile);
router.post(
    '/avatar',
    auth,
    (req, res, next) => {
        avatarUpload.single('avatar')(req, res, (err) => {
            if (err) return res.status(400).json({ message: err.message || 'Ошибка загрузки файла' });
            return next();
        });
    },
    uploadAvatar
);

export default router;
