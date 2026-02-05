import mongoose from 'mongoose';

const UserWordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'Word' },
    learnedAt: { type: Date, default: Date.now }
});

export default mongoose.model('UserWord', UserWordSchema);
