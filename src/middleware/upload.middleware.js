import multer from 'multer';

const storage = multer.diskStorage({
    destination: 'src/uploads',
    filename: (_, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

export default multer({ storage });
