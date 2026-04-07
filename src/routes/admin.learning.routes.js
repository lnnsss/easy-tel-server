import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import admin from '../middleware/admin.middleware.js';
import {
    createCategory,
    getCategories,
    updateCategory,
    deleteCategory,
    createCourse,
    getCoursesAdmin,
    updateCourse,
    deleteCourse,
    createTopic,
    getTopicsAdmin,
    updateTopic,
    deleteTopic,
    upsertTopicQuiz,
    getTopicQuizAdmin
} from '../controllers/admin.learning.controller.js';

const router = Router();

router.use(auth, admin);

router.post('/course-categories', createCategory);
router.get('/course-categories', getCategories);
router.put('/course-categories/:id', updateCategory);
router.delete('/course-categories/:id', deleteCategory);

router.post('/courses', createCourse);
router.get('/courses', getCoursesAdmin);
router.put('/courses/:id', updateCourse);
router.delete('/courses/:id', deleteCourse);

router.post('/topics', createTopic);
router.get('/topics', getTopicsAdmin);
router.put('/topics/:id', updateTopic);
router.delete('/topics/:id', deleteTopic);

router.get('/topics/:topicId/quiz', getTopicQuizAdmin);
router.put('/topics/:topicId/quiz', upsertTopicQuiz);

export default router;
