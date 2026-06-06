// Содержит вспомогательную логику safeAsync для переиспользования в проекте.
export const safeAsync = (handler) => async (req, res, next) => {
    try {
        await handler(req, res, next);
    } catch (err) {
        next(err);
    }
};

