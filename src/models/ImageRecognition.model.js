import mongoose from 'mongoose';

const imageRecognitionSchema = new mongoose.Schema(
    {
        originalFilename: {
            type: String,
            required: true,
        },
        imagePath: {
            type: String,
            required: true,
        },
        aiResponse: {
            type: String,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { versionKey: false }
);

export default mongoose.model(
    'ImageRecognition',
    imageRecognitionSchema
);
