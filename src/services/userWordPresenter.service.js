// Преобразует Mongoose-документ или объект к обычному JSON-объекту.
const toPlainObject = (value) => {
    if (!value) return value;
    if (typeof value.toObject === "function") return value.toObject();
    return value;
};

// Приводит одну запись пользовательского словаря к обычному объекту ответа.
export const normalizeUserWordForResponse = (userWord) => {
    return toPlainObject(userWord);
};

// Приводит массив пользовательских слов к безопасному формату ответа.
export const normalizeUserWordsForResponse = (items) => (
    Array.isArray(items) ? items.map((item) => normalizeUserWordForResponse(item)) : []
);
