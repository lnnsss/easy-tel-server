import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import author from '../middleware/author.middleware.js';
import { topicImageUploadSingle } from '../middleware/topicImageUpload.middleware.js';
import {
    createAuthorCourse,
    createAuthorTopic,
    createCourseRevision,
    deleteAuthorCourse,
    deleteAuthorTopic,
    getAuthorCourses,
    getAuthorTopicQuiz,
    getAuthorTopics,
    getCategoriesForAuthor,
    submitAuthorCourseForReview,
    updateAuthorCourse,
    updateAuthorTopic,
    upsertAuthorTopicQuiz,
    uploadAuthorTopicImage
} from '../controllers/author.learning.controller.js';

const router = Router();

router.use(auth, author);

router.get('/course-categories', getCategoriesForAuthor);
router.get('/courses', getAuthorCourses);
router.post('/courses', createAuthorCourse);
router.put('/courses/:id', updateAuthorCourse);
router.delete('/courses/:id', deleteAuthorCourse);
router.post('/courses/:id/create-revision', createCourseRevision);
router.post('/courses/:id/submit-review', submitAuthorCourseForReview);

router.get('/topics', getAuthorTopics);
router.post('/topics', createAuthorTopic);
router.post('/topics/upload-image', topicImageUploadSingle('image'), uploadAuthorTopicImage);
router.put('/topics/:id', updateAuthorTopic);
router.delete('/topics/:id', deleteAuthorTopic);

router.get('/topics/:topicId/quiz', getAuthorTopicQuiz);
router.put('/topics/:topicId/quiz', upsertAuthorTopicQuiz);

export default router;
