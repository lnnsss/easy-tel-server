import User from '../models/User.js';

// Содержит вспомогательную логику migrateHeaddressDefault для переиспользования в проекте.
export const migrateHeaddressDefault = async () => {
    const result = await User.updateMany(
        { 'characterCustomization.headdressFile': { $ne: '' } },
        {
            $set: {
                'characterCustomization.headdressFile': '',
                'characterCustomization.updatedAt': new Date()
            }
        }
    );

    const modified = Number(result?.modifiedCount || 0);
    if (modified > 0) {
        console.log(`[migration] headdress default updated for ${modified} users`);
    }
};

