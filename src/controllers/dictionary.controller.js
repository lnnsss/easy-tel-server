import UserWord from '../models/UserWord.js';
import User from '../models/User.js';
import Word from '../models/Word.js';
import DictionaryWeeklyAssessment from '../models/DictionaryWeeklyAssessment.js';
import DictionaryWeeklyAssessmentSession from '../models/DictionaryWeeklyAssessmentSession.js';
import { addScanPoints, applyDailyStreakOnScan, ensureLegacyPoints } from '../utils/userProgress.js';
import { trackAchievementEvent } from '../services/achievements.service.js';
import { normalizeUserWordForResponse, normalizeUserWordsForResponse } from '../services/userWordPresenter.service.js';

const REQUIRED_WORDS = 20;
const TEST_SIZE = 20;
const SESSION_TTL_MS = 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');
const getIsoWeekPartsUtc = (date = new Date()) => {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const diffDays = Math.round((target - firstThursday) / 86400000);
    const week = 1 + Math.floor(diffDays / 7);
    return { year: target.getUTCFullYear(), week };
};
const getWeekKeyUtc = (date = new Date()) => {
    const { year, week } = getIsoWeekPartsUtc(date);
    return `${year}-W${pad2(week)}`;
};
const shuffle = (arr = []) => {
    const next = [...arr];
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
};
const getLevelByScore = (correct) => {
    if (correct >= 18) return 'B2';
    if (correct >= 12) return 'B1';
    return 'A1';
};

export const addToDictionary = async (req, res) => {
    const wordId = String(req.body?.wordId || '').trim();
    if (!wordId) {
        return res.status(400).json({ message: 'wordId обязателен' });
    }

    const exists = await UserWord.findOne({ user: req.user.id, word: wordId });

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
    applyDailyStreakOnScan(user);
    await user.save();

    const achievementResult = await trackAchievementEvent({ userId: req.user.id, eventType: 'word_added' });
    res.json({
        ...normalizeUserWordForResponse(userWord),
        unlockedNow: achievementResult.unlockedNow || []
    });
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

    const [dbTotalItems, words] = await Promise.all([
        UserWord.countDocuments({ user: req.user.id }),
        UserWord.find({ user: req.user.id })
            .sort({ learnedAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .populate('word')
    ]);

    const safeWords = words.filter((item) => Boolean(item?.word));
    const items = normalizeUserWordsForResponse(safeWords);
    const totalItems = dbTotalItems;
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

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

export const getWeeklyAssessmentStatus = async (req, res) => {
    const userId = req.user.id;
    const wordsCount = await UserWord.countDocuments({ user: userId });
    const weekKey = getWeekKeyUtc(new Date());
    const assessment = await DictionaryWeeklyAssessment.findOne({ userId, weekKey }).lean();

    return res.json({
        hasEnoughWords: wordsCount >= REQUIRED_WORDS,
        requiredWords: REQUIRED_WORDS,
        wordsCount,
        weekKey,
        needsRetake: !assessment,
        result: assessment
            ? {
                totalQuestions: assessment.totalQuestions,
                correctAnswers: assessment.correctAnswers,
                level: assessment.level
            }
            : null
    });
};

export const startWeeklyAssessment = async (req, res) => {
    const userId = req.user.id;
    const weekKey = getWeekKeyUtc(new Date());
    const words = await UserWord.find({ user: userId }).populate('word').lean();
    const usable = words.filter((row) => row?.word?.nameTatar && row?.word?.nameRu);
    if (usable.length < REQUIRED_WORDS) {
        return res.status(400).json({ message: `Нужно изучить минимум ${REQUIRED_WORDS} слов` });
    }

    const existingAssessment = await DictionaryWeeklyAssessment.findOne({ userId, weekKey }).lean();
    if (existingAssessment) {
        return res.status(400).json({ message: 'Тест на эту неделю уже пройден' });
    }

    let selected = [];
    if (usable.length >= TEST_SIZE) {
        selected = shuffle(usable).slice(0, TEST_SIZE);
    } else {
        for (let i = 0; i < TEST_SIZE; i += 1) {
            selected.push(usable[Math.floor(Math.random() * usable.length)]);
        }
    }

    const userPoolRu = [...new Set(usable.map((item) => String(item.word.nameRu || '').trim()).filter(Boolean))];
    const globalWords = await Word.find({ isActive: true }).select('nameRu').limit(500).lean();
    const globalPoolRu = [...new Set(globalWords.map((w) => String(w?.nameRu || '').trim()).filter(Boolean))];
    const mergedPoolRu = [...new Set([...userPoolRu, ...globalPoolRu])];

    const buildOptions = (correct) => {
        const distractors = shuffle(mergedPoolRu.filter((ru) => ru && ru !== correct)).slice(0, 3);
        while (distractors.length < 3) {
            distractors.push(`Вариант ${distractors.length + 1}`);
        }
        return shuffle([correct, ...distractors.slice(0, 3)]);
    };

    const questions = selected.map((item) => {
        const correct = String(item.word.nameRu || '').trim();
        const options = buildOptions(correct);
        return {
            promptTatar: String(item.word.nameTatar || '').trim(),
            optionsRu: options,
            correctOptionIndex: options.findIndex((v) => v === correct)
        };
    }).filter((q) => q.optionsRu.length === 4 && q.correctOptionIndex >= 0);

    if (!questions.length) {
        return res.status(400).json({ message: 'Не удалось собрать вопросы для теста' });
    }

    await DictionaryWeeklyAssessmentSession.deleteMany({
        userId,
        weekKey
    });
    const session = await DictionaryWeeklyAssessmentSession.create({
        userId,
        weekKey,
        questions,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    });

    return res.json({
        sessionId: String(session._id),
        questions: questions.map((q, index) => ({
            questionIndex: index,
            promptTatar: q.promptTatar,
            optionsRu: q.optionsRu
        }))
    });
};

export const submitWeeklyAssessment = async (req, res) => {
    const userId = req.user.id;
    const weekKey = getWeekKeyUtc(new Date());
    const { sessionId, answers } = req.body || {};
    if (!sessionId || !Array.isArray(answers)) {
        return res.status(400).json({ message: 'sessionId и answers обязательны' });
    }

    const existingAssessment = await DictionaryWeeklyAssessment.findOne({ userId, weekKey }).lean();
    if (existingAssessment) {
        return res.status(400).json({ message: 'Тест на эту неделю уже пройден' });
    }

    const session = await DictionaryWeeklyAssessmentSession.findOne({
        _id: sessionId,
        userId,
        weekKey
    }).lean();
    if (!session) {
        return res.status(400).json({ message: 'Сессия теста не найдена' });
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
        return res.status(400).json({ message: 'Сессия теста истекла, начните заново' });
    }
    if (!Array.isArray(session.questions) || session.questions.length !== TEST_SIZE) {
        return res.status(400).json({ message: 'Некорректная сессия теста' });
    }

    const byIndex = new Map();
    for (const item of answers) {
        const qIndex = Number(item?.questionIndex);
        const optionIndex = Number(item?.optionIndex);
        if (!Number.isInteger(qIndex) || !Number.isInteger(optionIndex)) continue;
        byIndex.set(qIndex, optionIndex);
    }

    let correctAnswers = 0;
    session.questions.forEach((q, idx) => {
        if (byIndex.get(idx) === Number(q.correctOptionIndex)) correctAnswers += 1;
    });

    const level = getLevelByScore(correctAnswers);
    const assessment = await DictionaryWeeklyAssessment.create({
        userId,
        weekKey,
        totalQuestions: TEST_SIZE,
        correctAnswers,
        level
    });
    await DictionaryWeeklyAssessmentSession.deleteMany({ userId, weekKey });

    return res.json({
        weekKey,
        result: {
            totalQuestions: assessment.totalQuestions,
            correctAnswers: assessment.correctAnswers,
            level: assessment.level
        }
    });
};
