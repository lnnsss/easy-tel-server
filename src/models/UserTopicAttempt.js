import mongoose from 'mongoose';

const UserAnswerSchema = new mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    answerText: { type: String, default: '' },
    selectedOptionIndex: { type: Number, default: null },
    isCorrect: { type: Boolean, default: false }
}, { _id: false });

const UserTopicAttemptSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'TopicQuiz', required: true },
    answers: { type: [UserAnswerSchema], default: [] },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    awardedStudyPoints: { type: Number, default: 0 }
}, { timestamps: true });

UserTopicAttemptSchema.index({ userId: 1, courseId: 1, topicId: 1, createdAt: -1 });

export default mongoose.model('UserTopicAttempt', UserTopicAttemptSchema);
