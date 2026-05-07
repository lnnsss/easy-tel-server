import mongoose from 'mongoose';

const QuizOptionSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false }
}, { _id: false });

const QuizQuestionSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['single_choice', 'text_input', 'sentence_order'], required: true },
    options: { type: [QuizOptionSchema], default: [] },
    correctText: { type: String, default: '' },
    points: { type: Number, default: 1, min: 1 }
}, { _id: true });

const TopicQuizSchema = new mongoose.Schema({
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', required: true, unique: true },
    passingScore: { type: Number, default: 70, min: 1, max: 100 },
    questions: { type: [QuizQuestionSchema], default: [] }
}, { timestamps: true });

export default mongoose.model('TopicQuiz', TopicQuizSchema);
