import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '..', 'uploads', 'voices');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.webm';
        cb(null, `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    }
});

const fileFilter = (_req, file, cb) => {
    if (String(file.mimetype || '').startsWith('audio/')) return cb(null, true);
    cb(new Error('Поддерживаются только аудиофайлы'));
};

const chatVoiceUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});

export default chatVoiceUpload;
