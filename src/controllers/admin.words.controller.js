import Word from '../models/Word.js';
import UserWord from '../models/UserWord.js';
import User from '../models/User.js';

export const createWord = async (req, res) => {
    try {
        const { nameRu, nameEn, nameTatar, transcription, descriptionRu } = req.body;

        const exists = await Word.findOne({ nameRu });

        if (exists) {
            return res.status(409).json({
                message: 'Слово с таким названием уже существует'
            });
        }

        const word = await Word.create({
            nameRu,
            nameEn,
            nameTatar,
            transcription,
            descriptionRu
        });

        res.status(201).json(word);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Ошибка при создании слова'
        });
    }
};

export const getWords = async (_, res) => {
    const words = await Word.find();
    res.json(words);
};

export const updateWord = async (req, res) => {
    const word = await Word.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(word);
};

/**
 * 🔥 ПОЛНОЕ УДАЛЕНИЕ СЛОВА ИЗ ВСЕЙ СИСТЕМЫ
 */
export const deleteWord = async (req, res) => {
    try {
        const { id } = req.params; // ID слова в коллекции Word

        // 1. Находим все записи в UserWord, которые ссылаются на это слово
        const linkedUserWords = await UserWord.find({ word: id });

        // Получаем массив их ID
        const linkedUserWordIds = linkedUserWords.map(uw => uw._id);

        // 2. Удаляем эти записи из коллекции UserWord
        await UserWord.deleteMany({ word: id });

        // 3. Удаляем ссылки на эти записи из массивов dictionary у всех пользователей
        // Оператор $pull удаляет все вхождения указанных ID из массива
        await User.updateMany(
            { dictionary: { $in: linkedUserWordIds } },
            { $pull: { dictionary: { $in: linkedUserWordIds } } }
        );

        // 4. Удаляем само слово из глобальной коллекции Word
        const deletedWord = await Word.findByIdAndDelete(id);

        if (!deletedWord) {
            return res.status(404).json({ message: 'Слово не найдено' });
        }

        res.json({
            message: 'Слово полностью удалено из глобальной базы и словарей всех пользователей'
        });
    } catch (err) {
        console.error('Ошибка при каскадном удалении:', err);
        res.status(500).json({
            message: 'Ошибка при удалении слова и связанных данных'
        });
    }
};