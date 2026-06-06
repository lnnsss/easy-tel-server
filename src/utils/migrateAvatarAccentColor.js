import User from '../models/User.js';
import {
    isValidAvatarAccentColor,
    pickRandomAvatarAccentColor
} from './avatarAccentColor.js';

// Содержит вспомогательную логику migrateAvatarAccentColor для переиспользования в проекте.
export const migrateAvatarAccentColor = async () => {
    const users = await User.find({}).select('_id avatarAccentColor').lean();
    if (!users.length) return;

    const ops = users
        .filter((user) => !isValidAvatarAccentColor(user.avatarAccentColor))
        .map((user) => ({
            updateOne: {
                filter: { _id: user._id },
                update: { $set: { avatarAccentColor: pickRandomAvatarAccentColor() } }
            }
        }));

    if (!ops.length) return;

    const result = await User.bulkWrite(ops, { ordered: false });
    const modified = Number(result?.modifiedCount || 0);
    if (modified > 0) {
        console.log(`[migration] avatar accent color assigned for ${modified} users`);
    }
};

