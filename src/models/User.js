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

    role: { type: String, enum: ['user', 'author', 'admin'], default: 'user' },

    dictionary: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWord'
    }],

    scanPoints: { type: Number, default: 0 },
    studyPoints: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },

    rank: { type: String, default: 'Бронза I' },
    achievements: { type: [String], default: [] },
    courseAchievements: {
        type: [{
            courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
            title: { type: String, required: true },
            awardedAt: { type: Date, default: Date.now }
        }],
        default: []
    },

    streak: { type: Number, default: 0 },
    lastStreakDate: { type: Date, default: null },
    lastLogin: Date
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
