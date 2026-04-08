import mongoose from 'mongoose';

const FriendRequestSchema = new mongoose.Schema({
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'canceled'],
        default: 'pending',
        index: true
    },
    respondedAt: { type: Date, default: null }
}, { timestamps: true });

FriendRequestSchema.index({ fromUserId: 1, toUserId: 1, status: 1 });

export default mongoose.model('FriendRequest', FriendRequestSchema);
