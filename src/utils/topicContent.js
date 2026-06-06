const ALLOWED_TOPIC_BLOCK_TYPES = new Set(['h2', 'h3', 'text', 'image', 'spacer']);

// Приводит входные данные к единому безопасному формату.
const normalizeString = (value) => String(value || '').trim();
// Приводит входные данные к единому безопасному формату.
const normalizeImageWidthPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 50;
    return Math.max(10, Math.min(100, Math.round(numeric)));
};

// Приводит входные данные к единому безопасному формату.
export const normalizeTopicBlocks = (rawBlocks = []) => {
    if (!Array.isArray(rawBlocks)) {
        throw new Error('contentBlocks должен быть массивом');
    }

    if (rawBlocks.length === 0) {
        throw new Error('Добавьте хотя бы один блок контента');
    }

    return rawBlocks.map((block, index) => {
        const type = normalizeString(block?.type).toLowerCase();
        if (!ALLOWED_TOPIC_BLOCK_TYPES.has(type)) {
            throw new Error(`Блок #${index + 1}: неизвестный тип "${type || 'empty'}"`);
        }

        if (type === 'image') {
            const url = normalizeString(block?.url);
            if (!url) {
                throw new Error(`Блок #${index + 1}: для изображения укажите url`);
            }
            return {
                type,
                url,
                text: '',
                widthPercent: normalizeImageWidthPercent(block?.widthPercent)
            };
        }

        if (type === 'spacer') {
            return { type, text: '', url: '' };
        }

        const text = normalizeString(block?.text);
        if (!text) {
            throw new Error(`Блок #${index + 1}: заполните текст`);
        }
        return { type, text, url: '' };
    });
};

// Собирает данные в формат, удобный для дальнейшего использования.
export const buildLegacyContentFromBlocks = (blocks = []) => {
    if (!Array.isArray(blocks) || blocks.length === 0) return '';

    return blocks
        .filter((block) => block && block.type !== 'image' && block.type !== 'spacer')
        .map((block) => normalizeString(block.text))
        .filter(Boolean)
        .join('\n\n');
};

// Собирает данные в формат, удобный для дальнейшего использования.
export const buildContentBlocksForRead = (topic) => {
    const existing = Array.isArray(topic?.contentBlocks) ? topic.contentBlocks : [];
    if (existing.length > 0) {
        return existing.map((block) => ({
            type: normalizeString(block?.type).toLowerCase(),
            text: normalizeString(block?.text),
            url: normalizeString(block?.url),
            widthPercent: normalizeImageWidthPercent(block?.widthPercent)
        }));
    }

    const legacyContent = String(topic?.content || '');
    if (!legacyContent.trim()) return [];
    return [{ type: 'text', text: legacyContent, url: '' }];
};
