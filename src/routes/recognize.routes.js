import { Router } from 'express';
import multer from 'multer';
import { recognizeImage } from '../controllers/recognize.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), recognizeImage);

export default router;