const AVATAR_ACCENT_COLORS = [
    '#e53935',
    '#d81b60',
    '#c2185b',
    '#8e24aa',
    '#5e35b1',
    '#3949ab',
    '#1e88e5',
    '#00897b',
    '#2e7d32',
    '#558b2f',
    '#ef6c00',
    '#f4511e',
    '#6d4c41',
    '#ad1457'
];

export const pickRandomAvatarAccentColor = () => (
    AVATAR_ACCENT_COLORS[Math.floor(Math.random() * AVATAR_ACCENT_COLORS.length)]
);

export const isValidAvatarAccentColor = (value) => (
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
);

