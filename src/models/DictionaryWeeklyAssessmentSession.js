import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
    promptTatar: { type: String, required: true },
    optionsRu: [{ type: String, required: true }],
    correctOptionIndex: { type: Number, required: true, min: 0, max: 3 }
}, { _id: false });

const DictionaryWeeklyAssessmentSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    questions: { type: [QuestionSchema], required: true, default: [] },
    expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

DictionaryWeeklyAssessmentSessionSchema.index({ userId: 1, weekKey: 1 });

export default mongoose.model('DictionaryWeeklyAssessmentSession', DictionaryWeeklyAssessmentSessionSchema);

