import Word from '../models/Word.js';
import UserWord from '../models/UserWord.js';
import User from '../models/User.js';

export const createWord = async (req, res) => {
    try {
        const { nameRu, nameEn, nameTatar, transcription, descriptionRu } = req.body;
        const exists = await Word.findOne({ nameRu });
        if (exists) return res.status(409).json({ message: 'Слово уже существует' });

        const word = await Word.create({
            nameRu, nameEn, nameTatar, transcription, descriptionRu
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
        const totalPages = Math.ceil(totalItems / Number(limit));

        const words = await Word.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        res.json({
            words,
            totalPages,
            currentPage: Number(page),
            totalItems
        });
    } catch (err) {
        res.status(500).json({ message: 'Ошибка сервера' });
    }
};

export const updateWord = async (req, res) => {
    try {
        const word = await Word.findByIdAndUpdate(req.params.id, req.body, { new: true });
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