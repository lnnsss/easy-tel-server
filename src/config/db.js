import mongoose from 'mongoose';

// Подключает сервер к MongoDB по строке из переменных окружения.
const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
};

export default connectDB;
