import mongoose from 'mongoose';

const DictionaryWeeklyAssessmentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    totalQuestions: { type: Number, required: true, default: 20 },
    correctAnswers: { type: Number, required: true, default: 0 },
    level: { type: String, enum: ['A1', 'B1', 'B2'], required: true }
}, { timestamps: true });

DictionaryWeeklyAssessmentSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

export default mongoose.model('DictionaryWeeklyAssessment', DictionaryWeeklyAssessmentSchema);

