import mongoose from 'mongoose';

const AuthorRoleRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    educationLevel: { type: String, required: true, trim: true },
    educationDetails: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    tatarLevel: {
        type: String,
        enum: ['a0', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native'],
        required: true
    },
    teachingLevel: {
        type: String,
        enum: ['epg_phase_1', 'epg_phase_2', 'epg_phase_3', 'epg_phase_4', 'epg_phase_5', 'epg_phase_6'],
        required: true
    },
    motivation: { type: String, required: true, trim: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    adminComment: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decisionSeenAt: { type: Date, default: null }
}, { timestamps: true });

AuthorRoleRequestSchema.index(
    { userId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'pending' } }
);
AuthorRoleRequestSchema.index({ userId: 1, createdAt: -1 });
AuthorRoleRequestSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('AuthorRoleRequest', AuthorRoleRequestSchema);
