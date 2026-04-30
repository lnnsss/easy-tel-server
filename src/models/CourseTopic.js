import mongoose from 'mongoose';

const CourseTopicSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    sourceTopicId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseTopic', default: null },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    contentBlocks: {
        type: [{
            type: { type: String, enum: ['h2', 'h3', 'text', 'image', 'spacer'], required: true },
            text: { type: String, default: '' },
            url: { type: String, default: '' },
            widthPercent: { type: Number, default: 50, min: 10, max: 100 }
        }],
        default: []
    },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }
}, { timestamps: true });

CourseTopicSchema.index({ courseId: 1, order: 1, createdAt: 1 });
CourseTopicSchema.index({ courseId: 1, sourceTopicId: 1 });

export default mongoose.model('CourseTopic', CourseTopicSchema);
