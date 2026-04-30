import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseCategory', required: true },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CourseCategory' }],
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    reviewStatus: {
        type: String,
        enum: ['not_required', 'draft', 'pending_review', 'approved', 'rejected'],
        default: 'not_required'
    },
    reviewComment: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    isRevision: { type: Boolean, default: false },
    sourceCourseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    order: { type: Number, default: 0 },
    cover: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isPinnedHome: { type: Boolean, default: false },
    pinnedHomeText: { type: String, default: '' },
    pinnedHomeMode: {
        type: String,
        enum: ['dismiss_once', 'persistent', 'confirm_hide'],
        default: 'persistent'
    }
}, { timestamps: true });

CourseSchema.index({ categoryId: 1, order: 1, createdAt: 1 });
CourseSchema.index({ categoryIds: 1, order: 1, createdAt: 1 });
CourseSchema.index({ ownerUserId: 1, createdAt: -1 });
CourseSchema.index({ sourceCourseId: 1, isRevision: 1 });

export default mongoose.model('Course', CourseSchema);
