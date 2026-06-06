const PROFILE_ACCENT_COLORS = [
    '#ff6b6b',
    '#f06595',
    '#cc5de8',
    '#845ef7',
    '#5c7cfa',
    '#339af0',
    '#22b8cf',
    '#20c997',
    '#51cf66',
    '#94d82d',
    '#fcc419',
    '#ff922b'
];

// Содержит вспомогательную логику pickRandomProfileAccentColor для переиспользования в проекте.
export const pickRandomProfileAccentColor = () => (
    PROFILE_ACCENT_COLORS[Math.floor(Math.random() * PROFILE_ACCENT_COLORS.length)]
);

