const toPlainObject = (value) => {
    if (!value) return value;
    if (typeof value.toObject === "function") return value.toObject();
    return value;
};

export const normalizeUserWordForResponse = (userWord) => {
    return toPlainObject(userWord);
};

export const normalizeUserWordsForResponse = (items) => (
    Array.isArray(items) ? items.map((item) => normalizeUserWordForResponse(item)) : []
);
