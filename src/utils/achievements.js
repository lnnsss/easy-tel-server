// Содержит вспомогательную логику checkAchievements для переиспользования в проекте.
export const checkAchievements = (count) => {
    const achievements = [];

    if (count >= 1) achievements.push('Первое слово');
    if (count >= 10) achievements.push('10 слов');
    if (count >= 25) achievements.push('25 слов');
    if (count >= 50) achievements.push('50 слов');
    if (count >= 100) achievements.push('100 слов');

    return achievements;
};
