import mongoose from 'mongoose';
import { pickRandomAvatarAccentColor } from '../utils/avatarAccentColor.js';
import { pickRandomProfileAccentColor } from '../utils/profileAccentColor.js';

const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    emailVerified: { type: Boolean, default: false },
    emailVerificationCodeHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },

    username: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    avatarAccentColor: { type: String, default: pickRandomAvatarAccentColor },
    referralCode: { type: String, unique: true, sparse: true, default: null },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralsCount: { type: Number, default: 0 },
    profileAccentColor: { type: String, default: pickRandomProfileAccentColor },
    characterCustomization: {
        gender: { type: String, enum: ['male', 'female'], default: 'male' },
        characterFile: { type: String, default: 'Алмаз.png' },
        shoesFile: { type: String, default: 'Базовая.png' },
        bottomFile: { type: String, default: 'Базовые.png' },
        topFile: { type: String, default: 'Базовая.png' },
        headdressFile: { type: String, default: '' },
        backgroundFile: { type: String, default: '__theme__' },
        updatedAt: { type: Date, default: Date.now }
    },

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
    coins: { type: Number, default: 0 },
    ownedCosmetics: {
        shoes: { type: [String], default: [] },
        bottom: { type: [String], default: [] },
        top: { type: [String], default: [] },
        headdress: { type: [String], default: [] },
        background: { type: [String], default: [] }
    },

    rank: { type: String, default: 'Бронза I' },
    achievements: { type: [String], default: [] },

    userAchievements: {
        type: [{
            achievementCode: { type: String, required: true },
            progressCurrent: { type: Number, default: 0 },
            progressTarget: { type: Number, default: 1 },
            unlockedAt: { type: Date, default: null },
            claimedRewards: { type: Boolean, default: false }
        }],
        default: []
    },
    achievementStats: {
        releaseTrackedAt: { type: Date, default: Date.now },
        loginDays: { type: [String], default: [] },
        lastLoginDayKey: { type: String, default: '' },
        wordAddDays: { type: [String], default: [] },
        testPassDays: { type: [String], default: [] },
        testsPassedCount: { type: Number, default: 0 },
        hardTestsCount: { type: Number, default: 0 },
        completedCoursesCount: { type: Number, default: 0 },
        coursePerfect: { type: Boolean, default: false },
        courseOneDay: { type: Boolean, default: false },
        cameBackAfterBreak: { type: Boolean, default: false },
        profileCompleted: { type: Boolean, default: false },
        avatarChanged: { type: Boolean, default: false },
        usedDarkTheme: { type: Boolean, default: false },
        usedTranslator: { type: Boolean, default: false },
        firstMessage: { type: Boolean, default: false },
        firstTts: { type: Boolean, default: false }
    },
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
    lastLogin: Date,
    dailyRewards: {
        nextDay: { type: Number, default: 1, min: 1, max: 8 },
        lastClaimDateKey: { type: String, default: '' },
        lastModalShownDateKey: { type: String, default: '' },
        completedAt: { type: Date, default: null }
    }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
