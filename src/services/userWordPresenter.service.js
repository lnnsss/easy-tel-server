const toPlainObject = (value) => {
    if (!value) return value;
    if (typeof value.toObject === "function") return value.toObject();
    return value;
};

export const normalizeUserWordForResponse = (userWord) => {
    const item = toPlainObject(userWord);
    if (!item) return item;

    if (!item.word && item.wordSnapshot) {
        item.word = {
            ...item.wordSnapshot,
            _id: item.externalWordId || item.wordSnapshot._id,
            id: item.externalWordId || item.wordSnapshot.id
        };
    }

    return item;
};

export const normalizeUserWordsForResponse = (items) => (
    Array.isArray(items) ? items.map((item) => normalizeUserWordForResponse(item)) : []
);
