import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
    getCourses,
    getCourseById,
    getCourseTopicById,
    submitTopicQuiz,
    getCoursesProgress,
    getCoursesAnalytics
} from '../controllers/courses.controller.js';

const router = Router();

router.use(auth);

router.get('/', getCourses);
router.get('/progress', getCoursesProgress);
router.get('/analytics', getCoursesAnalytics);
router.get('/:id', getCourseById);
router.get('/:id/topics/:topicId', getCourseTopicById);
router.post('/:id/topics/:topicId/quiz/submit', submitTopicQuiz);

export default router;
