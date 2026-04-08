import dotenv from "dotenv";
import { createServer } from 'http';
dotenv.config();

import app from "./app.js";
import { initSocket } from './socket/index.js';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
initSocket(server);

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
