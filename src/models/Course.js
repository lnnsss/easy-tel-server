import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseCategory', required: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    order: { type: Number, default: 0 },
    cover: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

CourseSchema.index({ categoryId: 1, order: 1, createdAt: 1 });

export default mongoose.model('Course', CourseSchema);
