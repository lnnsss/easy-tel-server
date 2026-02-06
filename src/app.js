import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import indexRoutes from './routes/index.routes.js';
import seedAdmin from './utils/seedAdmin.js';

dotenv.config();

const app = express();

app.use(express.json());

app.use(cors({
    origin: '*', // TODO для dev, позже ограничу
}));

app.use(helmet());

app.use(morgan('dev'));

app.use('/uploads', express.static('src/uploads'));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100,                // 100 запросов с IP
}));

app.use('/api', indexRoutes);

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');
        await seedAdmin(); // создаём админа, если нет
    })
    .catch(err => {
        console.error('❌ MongoDB error:', err);
    });

export default app;
