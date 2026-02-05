import Word from '../models/Word.js';

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

export const deleteWord = async (req, res) => {
    await Word.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Слово отключено' });
};
