import { Router } from 'express';
import multer from 'multer';
import { generateUsageExamples, recognizeImage } from '../controllers/recognize.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), recognizeImage);
router.post('/examples', generateUsageExamples);

export default router;
