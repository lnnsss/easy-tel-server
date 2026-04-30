import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = 'src/uploads';

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_, __, cb) => {
        cb(null, uploadDir);
    },
    filename: (_, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueName}${path.extname(file.originalname)}`);
    }
});

const imageOnlyFilter = (_, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
        return cb(null, true);
    }
    return cb(new Error('Разрешены только изображения'));
};

const topicImageUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageOnlyFilter
});

export const topicImageUploadSingle = (fieldName = 'image') => (req, res, next) => {
    topicImageUpload.single(fieldName)(req, res, (err) => {
        if (!err) return next();

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Размер изображения не должен превышать 5MB' });
        }

        return res.status(400).json({ message: err.message || 'Ошибка загрузки файла' });
    });
};
