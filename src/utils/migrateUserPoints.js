import User from '../models/User.js';
import { ensureLegacyPoints } from './userProgress.js';
import { COSMETIC_CATEGORIES, FREE_ITEMS_WHITELIST } from '../config/characterAssets.js';

export const migrateUserPoints = async () => {
    const users = await User.find().select('_id dictionary scanPoints studyPoints totalPoints rank coins ownedCosmetics');
    if (!users.length) return;

    await Promise.all(users.map(async (user) => {
        ensureLegacyPoints(user);
        const currentCoins = Number(user.coins);
        if (!Number.isFinite(currentCoins) || currentCoins < 0) {
            user.coins = Number(user.totalPoints) || 0;
        }

        if (!user.ownedCosmetics || typeof user.ownedCosmetics !== 'object') {
            user.ownedCosmetics = {};
        }
        for (const category of COSMETIC_CATEGORIES) {
            const freeItems = Array.isArray(FREE_ITEMS_WHITELIST[category]) ? FREE_ITEMS_WHITELIST[category] : [];
            const current = Array.isArray(user.ownedCosmetics[category]) ? user.ownedCosmetics[category] : [];
            user.ownedCosmetics[category] = [...new Set([...freeItems, ...current])];
        }
        await user.save();
    }));
};
