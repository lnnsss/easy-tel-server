import dotenv from "dotenv";
import mongoose from 'mongoose';
import { createServer } from 'http';
dotenv.config();

import app from "./app.js";
import { initSocket } from './socket/index.js';
import seedAdmin from './utils/seedAdmin.js';
import { migrateUserPoints } from './utils/migrateUserPoints.js';
import { migrateHeaddressDefault } from './utils/migrateHeaddressDefault.js';
import { migrateAvatarAccentColor } from './utils/migrateAvatarAccentColor.js';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
initSocket(server);

const bootstrap = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not set');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    await seedAdmin();
    await migrateUserPoints();
    await migrateHeaddressDefault();
    await migrateAvatarAccentColor();

    server.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`);
    });
};

bootstrap().catch((error) => {
    console.error('Startup error:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
