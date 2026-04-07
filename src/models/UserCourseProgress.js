import mongoose from 'mongoose';

const UserCourseProgressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    unlockedTopicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic' }],
    completedTopicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic' }],
    completedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null }
}, { timestamps: true });

UserCourseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export default mongoose.model('UserCourseProgress', UserCourseProgressSchema);
