import UserWord from '../models/UserWord.js';
import User from '../models/User.js';
import { checkAchievements } from '../utils/achievements.js';
import { addScanPoints, applyDailyStreakOnScan, ensureLegacyPoints } from '../utils/userProgress.js';
import { findExternalWordById, isExternalWordId, toWordSnapshot } from '../services/externalWordSource.service.js';
import { normalizeUserWordForResponse, normalizeUserWordsForResponse } from '../services/userWordPresenter.service.js';

export const addToDictionary = async (req, res) => {
    const wordId = String(req.body?.wordId || '').trim();
    if (!wordId) {
        return res.status(400).json({ message: 'wordId обязателен' });
    }

    const isExternal = isExternalWordId(wordId);
    const exists = await UserWord.findOne(isExternal
        ? { user: req.user.id, externalWordId: wordId }
        : { user: req.user.id, word: wordId }
    );

    if (exists) {
        return res.status(400).json({ message: 'Слово уже добавлено' });
    }

    const createPayload = { user: req.user.id };
    if (isExternal) {
        const externalWord = await findExternalWordById(wordId);
        if (!externalWord) {
            return res.status(404).json({ message: 'Слово не найдено' });
        }

        createPayload.externalWordId = wordId;
        createPayload.wordSnapshot = toWordSnapshot(externalWord);
    } else {
        createPayload.word = wordId;
    }

    const userWord = await UserWord.create(createPayload);

    const user = await User.findById(req.user.id);
    user.dictionary.push(userWord._id);
    addScanPoints(user, 1);
    applyDailyStreakOnScan(user);
    user.achievements = checkAchievements(user.dictionary.length);

    await user.save();

    res.json(normalizeUserWordForResponse(userWord));
};

export const getDictionary = async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id).select('dictionary scanPoints studyPoints totalPoints rank');
    if (user) {
        ensureLegacyPoints(user);
        await user.save();
    }

    const [totalItems, words] = await Promise.all([
        UserWord.countDocuments({ user: req.user.id }),
        UserWord.find({ user: req.user.id })
            .sort({ learnedAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .populate('word')
    ]);

    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    const items = normalizeUserWordsForResponse(words);

    res.json({
        items,
        totalItems,
        totalPages,
        currentPage: page,
        hasMore: page < totalPages
    });
};

export const getDictionaryItem = async (req, res) => {
    const item = await UserWord.findOne({
        _id: req.params.id,
        user: req.user.id
    }).populate('word');

    if (!item) {
        return res.status(404).json({ message: 'Слово не найдено' });
    }

    res.json(normalizeUserWordForResponse(item));
};
