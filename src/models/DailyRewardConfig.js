import mongoose from 'mongoose';

const DailyRewardDaySchema = new mongoose.Schema({
    dayNumber: { type: Number, required: true, min: 1, max: 7 },
    coins: { type: Number, default: 0, min: 0 },
    studyPoints: { type: Number, default: 0, min: 0 }
}, { _id: false });

const DailyRewardConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'default' },
    days: { type: [DailyRewardDaySchema], default: [] }
}, { timestamps: true });

export default mongoose.model('DailyRewardConfig', DailyRewardConfigSchema);
