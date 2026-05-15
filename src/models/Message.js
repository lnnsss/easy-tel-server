import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '', trim: true, maxlength: 2000 },
    messageType: { type: String, enum: ['text', 'voice'], default: 'text', index: true },
    audioUrl: { type: String, default: null },
    audioDurationSec: { type: Number, default: null },
    listenedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model('Message', MessageSchema);
