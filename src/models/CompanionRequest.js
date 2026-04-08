import mongoose from 'mongoose';

const CompanionRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    purpose: {
        type: String,
        enum: ['speech_practice', 'competition', 'course_together', 'motivation', 'other'],
        required: true
    },
    customPurpose: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

export default mongoose.model('CompanionRequest', CompanionRequestSchema);
