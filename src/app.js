import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import indexRoutes from './routes/index.routes.js';
import seedAdmin from './utils/seedAdmin.js';
import { migrateUserPoints } from './utils/migrateUserPoints.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, 'uploads');

app.use(express.json());

app.use(cors({
    origin: '*', // TODO для dev, позже ограничу
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(morgan('dev'));

app.use('/uploads', express.static(uploadsPath));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100,                // 100 запросов с IP
}));

app.use('/api', indexRoutes);

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected');
        await seedAdmin(); // создаём админа, если нет
        await migrateUserPoints();
    })
    .catch(err => {
        console.error('MongoDB error:', err);
    });

export default app;
