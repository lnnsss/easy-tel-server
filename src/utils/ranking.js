const RANK_THRESHOLDS = [
    { maxPoints: 10, rank: 'Бронза I' },
    { maxPoints: 20, rank: 'Бронза II' },
    { maxPoints: 30, rank: 'Серебро I' },
    { maxPoints: 40, rank: 'Серебро II' },
    { maxPoints: 50, rank: 'Золото I' },
    { maxPoints: 75, rank: 'Золото II' },
    { maxPoints: Infinity, rank: 'Легенда' }
];

export const getRank = (points = 0) => {
    const safePoints = Number.isFinite(points) ? points : 0;
    return RANK_THRESHOLDS.find((tier) => safePoints <= tier.maxPoints)?.rank || 'Легенда';
};

export const getRankThresholds = () => RANK_THRESHOLDS;
