import mongoose from 'mongoose';

const WordSchema = new mongoose.Schema({
    nameRu: { type: String, required: true, unique: true },
    nameEn: { type: String, required: true },
    nameTatar: { type: String, required: true },
    source: { type: String, enum: ['manual'], default: 'manual' },
    transcription: String,
    descriptionRu: String,
    usageExamples: [{
        _id: false,
        textTatar: { type: String, trim: true },
        textRu: { type: String, trim: true }
    }],

    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Word', WordSchema);
