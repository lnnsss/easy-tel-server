export const CHARACTER_GENDERS = ['male', 'female'];

export const CHARACTER_FILES = ['Алмаз.png', 'Алсу.png'];
export const SHOES_FILES = ['Найки.png', 'Кеды.png', 'Тимбы.png', 'Баленси XXL.png', 'Доктор Мартинс.png', 'Базовая.png'];
export const BOTTOM_FILES = ['Спортивки.png', 'Как у фараона.png', 'Милашки треники.png', 'Свага джинсы.png', 'Рваные джинсы.png', 'Карго дефолт.png', 'Базовые.png'];
export const TOP_FILES = ['Худи.png', 'Бомбер.png', 'Мамин свитер.png', 'Тишка Казань.png', 'Тишка йорик.png', 'Линейный свитер.png', 'Базовый.png', 'Базовая.png', 'Зелёнка.png'];
export const HEADDRESS_FILES = ['Ушанка.png', 'Ай мачо хед.png', 'Кепка XXL.png', 'Тубетейка.png', 'Базовый.png'];
export const BACKGROUND_FILES = ['__theme__', 'neegers.jpg', 'fire.jpg', 'dungeonMaster.jpg', 'fine.jpg', 'spongeBob.jpg', 'casino.jpg', 'classic.jpg', 'office.jpg', 'simpson.jpg', 'png.jpg', 'cover.jpg', 'toilet.jpg'];
export const ITEM_PRICE_COINS = 5;
export const COSMETIC_CATEGORIES = ['shoes', 'bottom', 'top', 'headdress'];

export const FREE_ITEMS_WHITELIST = {
    shoes: ['Базовая.png'],
    bottom: ['Базовые.png'],
    top: ['Базовая.png'],
    headdress: ['Базовый.png']
};

export const DEFAULT_CHARACTER_CUSTOMIZATION = {
    gender: 'male',
    characterFile: 'Алмаз.png',
    shoesFile: 'Базовая.png',
    bottomFile: 'Базовые.png',
    topFile: 'Базовая.png',
    headdressFile: 'Базовый.png',
    backgroundFile: '__theme__'
};

export const CHARACTER_ALLOWED = {
    gender: new Set(CHARACTER_GENDERS),
    characterFile: new Set(CHARACTER_FILES),
    shoesFile: new Set(SHOES_FILES),
    bottomFile: new Set(BOTTOM_FILES),
    topFile: new Set(TOP_FILES),
    headdressFile: new Set(HEADDRESS_FILES),
    backgroundFile: new Set(BACKGROUND_FILES)
};

export const COSMETIC_ALLOWED = {
    shoes: new Set(SHOES_FILES),
    bottom: new Set(BOTTOM_FILES),
    top: new Set(TOP_FILES),
    headdress: new Set(HEADDRESS_FILES)
};
