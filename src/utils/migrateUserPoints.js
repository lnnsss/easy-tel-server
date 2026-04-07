import User from '../models/User.js';
import { ensureLegacyPoints } from './userProgress.js';

export const migrateUserPoints = async () => {
    const users = await User.find().select('_id dictionary scanPoints studyPoints totalPoints rank');
    if (!users.length) return;

    await Promise.all(users.map(async (user) => {
        ensureLegacyPoints(user);
        await user.save();
    }));
};
