import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
    participants: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
        validate: {
            validator: (value) => Array.isArray(value) && value.length === 2,
            message: 'Conversation must have exactly 2 participants'
        },
        index: true
    },
    participantA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessageText: { type: String, default: '' }
}, { timestamps: true });

ConversationSchema.index({ participantA: 1, participantB: 1 }, { unique: true });

export default mongoose.model('Conversation', ConversationSchema);
