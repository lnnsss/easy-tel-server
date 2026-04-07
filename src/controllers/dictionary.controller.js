import UserWord from '../models/UserWord.js';
import User from '../models/User.js';
import { checkAchievements } from '../utils/achievements.js';
import { addScanPoints, ensureLegacyPoints } from '../utils/userProgress.js';

export const addToDictionary = async (req, res) => {
    const { wordId } = req.body;

    const exists = await UserWord.findOne({
        user: req.user.id,
        word: wordId
    });

    if (exists) {
        return res.status(400).json({ message: 'Слово уже добавлено' });
    }

    const userWord = await UserWord.create({
        user: req.user.id,
        word: wordId
    });

    const user = await User.findById(req.user.id);
    user.dictionary.push(userWord._id);
    addScanPoints(user, 1);
    user.achievements = checkAchievements(user.dictionary.length);

    await user.save();

    res.json(userWord);
};

export const getDictionary = async (req, res) => {
    const user = await User.findById(req.user.id).select('dictionary scanPoints studyPoints totalPoints rank');
    if (user) {
        ensureLegacyPoints(user);
        await user.save();
    }

    const words = await UserWord.find({ user: req.user.id })
        .populate('word');

    res.json(words);
};

export const getDictionaryItem = async (req, res) => {
    const item = await UserWord.findOne({
        _id: req.params.id,
        user: req.user.id
    }).populate('word');

    if (!item) {
        return res.status(404).json({ message: 'Слово не найдено' });
    }

    res.json(item);
};
