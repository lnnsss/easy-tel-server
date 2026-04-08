import mongoose from 'mongoose';

const FriendshipSchema = new mongoose.Schema({
    userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

FriendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

export default mongoose.model('Friendship', FriendshipSchema);
