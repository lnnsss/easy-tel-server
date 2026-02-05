import mongoose from 'mongoose';

const WordSchema = new mongoose.Schema({
    nameRu: { type: String, required: true, unique: true },
    nameTatar: { type: String, required: true },
    transcription: String,
    descriptionRu: String,

    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Word', WordSchema);
