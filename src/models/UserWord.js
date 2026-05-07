import mongoose from 'mongoose';

const UserWordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'Word' },
    externalWordId: { type: String, index: true },
    wordSnapshot: {
        _id: String,
        id: String,
        nameRu: String,
        nameEn: String,
        nameTatar: String,
        transcription: String,
        descriptionRu: String,
        source: String,
        usageExamples: [{
            _id: false,
            textTatar: { type: String, trim: true },
            textRu: { type: String, trim: true }
        }]
    },
    learnedAt: { type: Date, default: Date.now }
});

export default mongoose.model('UserWord', UserWordSchema);
