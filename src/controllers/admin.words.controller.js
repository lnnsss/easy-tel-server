import Word from '../models/Word.js';
import UserWord from '../models/UserWord.js';
import User from '../models/User.js';

const normalizeSpaces = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeKey = (value) => normalizeSpaces(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const capitalizeFirst = (value) => {
    const clean = normalizeSpaces(value);
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const createWord = async (req, res) => {
    try {
        const { nameRu, nameEn, nameTatar, transcription, descriptionRu } = req.body;
        const exists = await Word.findOne({ nameRu: capitalizeFirst(nameRu) });
        if (exists) return res.status(409).json({ message: 'Слово уже существует' });

        const word = await Word.create({
            nameRu: capitalizeFirst(nameRu),
            nameEn: normalizeSpaces(nameEn),
            nameTatar: capitalizeFirst(nameTatar),
            transcription: normalizeSpaces(transcription),
            descriptionRu: normalizeSpaces(descriptionRu),
            source: 'manual'
        });
        res.status(201).json(word);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка при создании' });
    }
};

export const getWords = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query; // лимит 10
        let query = {};

        if (search && search.trim() !== '') {
            const s = search.trim();
            query = {
                $or: [
                    { nameRu: { $regex: s, $options: 'i' } },
                    { nameEn: { $regex: s, $options: 'i' } },
                    { nameTatar: { $regex: s, $options: 'i' } }
                ]
            };
        }

        const totalItems = await Word.countDocuments(query);
        const totalPages = Math.max(1, Math.ceil(totalItems / Number(limit)));
        const currentPage = Number(page);
        const words = await Word.find(query)
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * Number(limit))
            .limit(Number(limit))
            .lean();

        res.json({
            words,
            totalPages,
            currentPage,
            totalItems
        });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера' });
    }
};

export const updateWord = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.nameRu !== undefined) payload.nameRu = capitalizeFirst(payload.nameRu);
        if (payload.nameTatar !== undefined) payload.nameTatar = capitalizeFirst(payload.nameTatar);
        if (payload.nameEn !== undefined) payload.nameEn = normalizeSpaces(payload.nameEn);
        if (payload.transcription !== undefined) payload.transcription = normalizeSpaces(payload.transcription);
        if (payload.descriptionRu !== undefined) payload.descriptionRu = normalizeSpaces(payload.descriptionRu);

        const word = await Word.findByIdAndUpdate(req.params.id, payload, { new: true });
        res.json(word);
    } catch (err) {
        res.status(500).json({ message: 'Ошибка обновления' });
    }
};

export const deleteWord = async (req, res) => {
    try {
        const { id } = req.params;
        await UserWord.deleteMany({ word: id });
        await User.updateMany({ dictionary: id }, { $pull: { dictionary: id } });
        await Word.findByIdAndDelete(id);
        res.json({ message: 'Удалено' });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка удаления' });
    }
};
