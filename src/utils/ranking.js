export const getRank = (count) => {
    if (count <= 10) return 'Бронза I';
    if (count <= 20) return 'Бронза II';
    if (count <= 30) return 'Серебро I';
    if (count <= 40) return 'Серебро II';
    if (count <= 50) return 'Золото I';
    return 'Легенда';
};
