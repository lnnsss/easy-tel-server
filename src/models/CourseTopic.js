import mongoose from 'mongoose';

const CourseTopicSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }
}, { timestamps: true });

CourseTopicSchema.index({ courseId: 1, order: 1, createdAt: 1 });

export default mongoose.model('CourseTopic', CourseTopicSchema);
