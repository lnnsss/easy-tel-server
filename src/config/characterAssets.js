import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const CHARACTER_GENDERS = ['male', 'female'];
export const ITEM_PRICE_COINS = 10;
export const COSMETIC_CATEGORIES = ['shoes', 'bottom', 'top', 'headdress', 'background'];

const STATIC_FREE_ITEMS_WHITELIST = {
    shoes: ['Базовая.png'],
    bottom: ['Базовые.png'],
    top: ['Базовая.png'],
    headdress: [''],
    background: ['__theme__']
};

const STATIC_GENDER_DEFAULTS = {
    male: 'Алмаз.png',
    female: 'Алсу.png'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const customizeRoot = path.resolve(__dirname, '..', '..', '..', 'client', 'public', 'customize');
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

const readAssetFolder = (folderName) => {
    const folderPath = path.join(customizeRoot, folderName);
    try {
        const files = fs.readdirSync(folderPath, { withFileTypes: true })
            .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b, 'ru'));
        return files;
    } catch (err) {
        console.error('[character-assets] read error', folderName, err?.message || err);
        return [];
    }
};

const pickDefault = (files, preferred) => {
    if (preferred && files.includes(preferred)) return preferred;
    return files[0] || '';
};

const buildFreeWhitelist = (filesByCategory) => {
    const result = {};
    for (const category of COSMETIC_CATEGORIES) {
        const files = filesByCategory[category] || [];
        const staticFree = STATIC_FREE_ITEMS_WHITELIST[category] || [];
        const matched = staticFree.filter((item) => files.includes(item));
        result[category] = matched.length > 0 ? matched : (files[0] ? [files[0]] : []);
    }
    return result;
};

export const getCharacterAssetsConfig = () => {
    const characters = readAssetFolder('characters');
    const shoes = readAssetFolder('shoes');
    const bottom = readAssetFolder('bottom');
    const top = readAssetFolder('top');
    const headdress = ['', ...readAssetFolder('headdress')];
    const backgrounds = ['__theme__', ...readAssetFolder('backgrounds')];

    const genderDefaults = {
        male: pickDefault(characters, STATIC_GENDER_DEFAULTS.male),
        female: pickDefault(characters, STATIC_GENDER_DEFAULTS.female || characters[1] || characters[0] || '')
    };

    const freeItemsWhitelist = buildFreeWhitelist({ shoes, bottom, top, headdress, background: backgrounds });
    const defaults = {
        gender: 'male',
        characterFile: pickDefault(characters, genderDefaults.male),
        shoesFile: pickDefault(shoes, freeItemsWhitelist.shoes[0]),
        bottomFile: pickDefault(bottom, freeItemsWhitelist.bottom[0]),
        topFile: pickDefault(top, freeItemsWhitelist.top[0]),
        headdressFile: '',
        backgroundFile: backgrounds.includes('__theme__') ? '__theme__' : (backgrounds[0] || '')
    };

    const characterAllowed = {
        gender: new Set(CHARACTER_GENDERS),
        characterFile: new Set(characters),
        shoesFile: new Set(shoes),
        bottomFile: new Set(bottom),
        topFile: new Set(top),
        headdressFile: new Set(headdress),
        backgroundFile: new Set(backgrounds)
    };

    const cosmeticAllowed = {
        shoes: new Set(shoes),
        bottom: new Set(bottom),
        top: new Set(top),
        headdress: new Set(headdress),
        background: new Set(backgrounds)
    };

    return {
        assets: {
            genderDefaults,
            characters,
            shoes,
            bottom,
            top,
            headdress,
            backgrounds
        },
        freeItemsWhitelist,
        defaults,
        characterAllowed,
        cosmeticAllowed
    };
};
