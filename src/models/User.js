import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCodeHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },

    username: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: { type: String, default: null },

    password: { type: String, required: true },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    dictionary: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWord'
    }],

    rank: { type: String, default: 'Бронза I' },
    achievements: { type: [String], default: [] },

    streak: { type: Number, default: 0 },
    lastLogin: Date
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
