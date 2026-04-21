import CourseCategory from '../models/CourseCategory.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import User from '../models/User.js';
import { addStudyPoints, ensureLegacyPoints } from '../utils/userProgress.js';
import { getUserCourseAnalytics } from '../utils/courseAnalytics.js';

const TOPIC_POINTS = 3;

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getCourseCategoryIds = (course) => {
    const fromArray = Array.isArray(course?.categoryIds) ? course.categoryIds : [];
    const normalizedArray = fromArray
        .map((entry) => String(entry?._id || entry || '').trim())
        .filter(Boolean);

    if (normalizedArray.length > 0) {
        return normalizedArray;
    }

    const fallback = String(course?.categoryId?._id || course?.categoryId || '').trim();
    return fallback ? [fallback] : [];
};

const getOrCreateProgress = async (userId, courseId, topicIds = []) => {
    let progress = await UserCourseProgress.findOne({ userId, courseId });
    if (!progress) {
        progress = await UserCourseProgress.create({
            userId,
            courseId,
            unlockedTopicIds: topicIds.length ? [topicIds[0]] : [],
            completedTopicIds: [],
            completedAt: null,
            lastActivityAt: null
        });
    } else {
        const topicIdSet = new Set(topicIds.map((id) => String(id)));

        progress.unlockedTopicIds = (progress.unlockedTopicIds || []).filter((id) => topicIdSet.has(String(id)));
        progress.completedTopicIds = (progress.completedTopicIds || []).filter((id) => topicIdSet.has(String(id)));

        // If progress was created before topics existed, unlock the first topic now.
        if (topicIds.length > 0 && progress.unlockedTopicIds.length === 0) {
            progress.unlockedTopicIds = [topicIds[0]];
        }

        // Keep next uncompleted topic unlocked (important when new topics were added after completion).
        const completedSet = new Set((progress.completedTopicIds || []).map((id) => String(id)));
        const firstUncompleted = topicIds.find((id) => !completedSet.has(String(id)));
        if (firstUncompleted && !progress.unlockedTopicIds.some((id) => String(id) === String(firstUncompleted))) {
            progress.unlockedTopicIds.push(firstUncompleted);
        }

        // If new topics were added after the course had been completed, reopen the course.
        if (progress.completedAt && progress.completedTopicIds.length < topicIds.length) {
            progress.completedAt = null;
        }

        await progress.save();
    }
    return progress;
};

const getTopicList = async (courseId) => CourseTopic
    .find({ courseId, status: 'published' })
    .sort({ order: 1, createdAt: 1 });

const buildQuestionPublicPayload = (question) => {
    if (question.type === 'single_choice') {
        return {
            _id: question._id,
            title: question.title,
            type: question.type,
            points: question.points,
            options: question.options.map((option) => ({ text: option.text }))
        };
    }

    return {
        _id: question._id,
        title: question.title,
        type: question.type,
        points: question.points
    };
};

export const getCourses = async (req, res) => {
    try {
        const [categories, courses, progresses, topicCounts] = await Promise.all([
            CourseCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
            Course.find({ status: 'published', isActive: true })
                .populate('categoryId')
                .sort({ order: 1, createdAt: 1 })
                .lean(),
            UserCourseProgress.find({ userId: req.user.id }).lean(),
            CourseTopic.aggregate([
                { $match: { status: 'published' } },
                { $group: { _id: '$courseId', totalTopics: { $sum: 1 } } }
            ])
        ]);

        const progressMap = new Map(progresses.map((progress) => [String(progress.courseId), progress]));
        const topicCountMap = new Map(topicCounts.map((item) => [String(item._id), item.totalTopics]));

        const coursesByCategory = categories.map((category) => {
            const categoryCourses = courses
                .filter((course) => getCourseCategoryIds(course).includes(String(category._id)))
                .map((course) => {
                    const progress = progressMap.get(String(course._id));
                    const completedTopics = progress?.completedTopicIds?.length || 0;
                    const unlockedTopics = progress?.unlockedTopicIds?.length || 0;
                    const totalTopics = topicCountMap.get(String(course._id)) || 0;

                    return {
                        ...course,
                        progress: {
                            completedTopics,
                            unlockedTopics,
                            totalTopics,
                            completed: Boolean(progress?.completedAt) && completedTopics >= totalTopics && totalTopics > 0
                        }
                    };
                });

            return {
                ...category,
                courses: categoryCourses
            };
        });

        return res.json({ categories: coursesByCategory });
    } catch (err) {
        console.error('getCourses error', err);
        return res.status(500).json({ message: 'Ошибка загрузки курсов' });
    }
};

export const getCourseById = async (req, res) => {
    try {
        const course = await Course.findOne({
            _id: req.params.id,
            status: 'published',
            isActive: true
        })
            .populate('categoryId')
            .populate('categoryIds');

        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        const topics = await getTopicList(course._id);
        const topicIds = topics.map((topic) => topic._id);

        const progress = await getOrCreateProgress(req.user.id, course._id, topicIds);

        const topicView = topics.map((topic) => {
            const topicId = String(topic._id);
            return {
                _id: topic._id,
                title: topic.title,
                order: topic.order,
                isUnlocked: progress.unlockedTopicIds.some((id) => String(id) === topicId),
                isCompleted: progress.completedTopicIds.some((id) => String(id) === topicId)
            };
        });

        return res.json({
            course,
            topics: topicView,
            progress: {
                completed: Boolean(progress.completedAt) && progress.completedTopicIds.length >= topics.length && topics.length > 0,
                completedTopics: progress.completedTopicIds.length,
                unlockedTopics: progress.unlockedTopicIds.length
            }
        });
    } catch (err) {
        console.error('getCourseById error', err);
        return res.status(500).json({ message: 'Ошибка загрузки курса' });
    }
};

export const getPinnedCourse = async (_req, res) => {
    try {
        const course = await Course.findOne({
            isPinnedHome: true,
            status: 'published',
            isActive: true
        }).select('_id title pinnedHomeText pinnedHomeMode');

        if (!course) return res.json({ course: null });

        return res.json({
            course: {
                _id: course._id,
                title: course.title,
                pinnedHomeText: String(course.pinnedHomeText || '').trim() || `Рекомендуем пройти курс: ${course.title}`,
                pinnedHomeMode: course.pinnedHomeMode || 'persistent'
            }
        });
    } catch (err) {
        console.error('getPinnedCourse error', err);
        return res.status(500).json({ message: 'Ошибка загрузки закрепленного курса' });
    }
};

export const getCourseTopicById = async (req, res) => {
    try {
        const { id: courseId, topicId } = req.params;
        const course = await Course.findOne({
            _id: courseId,
            status: 'published',
            isActive: true
        });

        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        const topics = await getTopicList(course._id);
        const topic = topics.find((item) => String(item._id) === String(topicId));
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });

        const progress = await getOrCreateProgress(req.user.id, course._id, topics.map((item) => item._id));
        const isUnlocked = progress.unlockedTopicIds.some((id) => String(id) === String(topic._id));

        if (!isUnlocked) {
            return res.status(403).json({ message: 'Тема пока не разблокирована. Сначала завершите предыдущую тему.' });
        }

        const quiz = await TopicQuiz.findOne({ topicId: topic._id });

        return res.json({
            topic,
            quiz: quiz ? {
                _id: quiz._id,
                passingScore: quiz.passingScore,
                questions: quiz.questions.map(buildQuestionPublicPayload)
            } : null
        });
    } catch (err) {
        console.error('getCourseTopicById error', err);
        return res.status(500).json({ message: 'Ошибка загрузки темы' });
    }
};

export const submitTopicQuiz = async (req, res) => {
    try {
        const { id: courseId, topicId } = req.params;
        const { answers } = req.body;

        if (!Array.isArray(answers)) {
            return res.status(400).json({ message: 'Неверный формат ответов' });
        }

        const course = await Course.findOne({ _id: courseId, status: 'published', isActive: true });
        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        const topics = await getTopicList(course._id);
        const topic = topics.find((item) => String(item._id) === String(topicId));
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });

        const progress = await getOrCreateProgress(req.user.id, course._id, topics.map((item) => item._id));
        const isUnlocked = progress.unlockedTopicIds.some((id) => String(id) === String(topic._id));
        if (!isUnlocked) {
            return res.status(403).json({ message: 'Тема пока не разблокирована' });
        }

        const quiz = await TopicQuiz.findOne({ topicId: topic._id });
        if (!quiz) {
            return res.status(400).json({ message: 'Тест для темы не найден' });
        }

        const answerMap = new Map(
            answers
                .filter((answer) => answer && answer.questionId)
                .map((answer) => [String(answer.questionId), answer])
        );

        const resultAnswers = [];
        let pointsEarned = 0;
        let pointsTotal = 0;

        for (const question of quiz.questions) {
            pointsTotal += question.points;
            const userAnswer = answerMap.get(String(question._id));
            let isCorrect = false;
            let selectedOptionIndex = null;
            let answerText = '';

            if (question.type === 'single_choice') {
                const inputIndex = Number(userAnswer?.selectedOptionIndex);
                selectedOptionIndex = Number.isInteger(inputIndex) ? inputIndex : null;
                const correctIndex = question.options.findIndex((option) => option.isCorrect);
                isCorrect = selectedOptionIndex === correctIndex;
            } else {
                answerText = String(userAnswer?.answerText || '');
                isCorrect = normalizeText(answerText) === normalizeText(question.correctText);
            }

            if (isCorrect) pointsEarned += question.points;

            resultAnswers.push({
                questionId: question._id,
                answerText,
                selectedOptionIndex,
                isCorrect
            });
        }

        const scorePercent = pointsTotal > 0 ? Math.round((pointsEarned / pointsTotal) * 100) : 0;
        const passed = scorePercent >= quiz.passingScore;

        const wasCompletedBefore = progress.completedTopicIds.some((id) => String(id) === String(topic._id));
        let awardedStudyPoints = 0;

        if (passed && !wasCompletedBefore) {
            progress.completedTopicIds.push(topic._id);

            const sortedTopics = [...topics].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
            const currentIndex = sortedTopics.findIndex((item) => String(item._id) === String(topic._id));
            const nextTopic = sortedTopics[currentIndex + 1];

            if (nextTopic && !progress.unlockedTopicIds.some((id) => String(id) === String(nextTopic._id))) {
                progress.unlockedTopicIds.push(nextTopic._id);
            }

            if (progress.completedTopicIds.length >= sortedTopics.length) {
                progress.completedAt = new Date();

                const user = await User.findById(req.user.id);
                if (user) {
                    ensureLegacyPoints(user);
                    awardedStudyPoints = TOPIC_POINTS;
                    addStudyPoints(user, awardedStudyPoints);

                    const alreadyAwarded = (user.courseAchievements || []).some(
                        (achievement) => String(achievement.courseId) === String(course._id)
                    );

                    if (!alreadyAwarded) {
                        user.courseAchievements.push({
                            courseId: course._id,
                            title: `Пройден курс: ${course.title}`,
                            awardedAt: new Date()
                        });

                        const legacyAchievement = `Пройден курс: ${course.title}`;
                        if (!user.achievements.includes(legacyAchievement)) {
                            user.achievements.push(legacyAchievement);
                        }
                    }

                    await user.save();
                }
            } else {
                const user = await User.findById(req.user.id);
                if (user) {
                    ensureLegacyPoints(user);
                    awardedStudyPoints = TOPIC_POINTS;
                    addStudyPoints(user, awardedStudyPoints);
                    await user.save();
                }
            }
        }

        progress.lastActivityAt = new Date();
        await progress.save();

        await UserTopicAttempt.create({
            userId: req.user.id,
            courseId: course._id,
            topicId: topic._id,
            quizId: quiz._id,
            answers: resultAnswers,
            scorePercent,
            passed,
            awardedStudyPoints
        });

        return res.json({
            passed,
            scorePercent,
            passingScore: quiz.passingScore,
            awardedStudyPoints,
            feedback: resultAnswers.map((answer) => ({
                questionId: answer.questionId,
                isCorrect: answer.isCorrect
            }))
        });
    } catch (err) {
        console.error('submitTopicQuiz error', err);
        return res.status(500).json({ message: 'Ошибка проверки теста' });
    }
};

export const getCoursesProgress = async (req, res) => {
    try {
        const progress = await UserCourseProgress.find({ userId: req.user.id })
            .populate('courseId')
            .sort({ updatedAt: -1 });

        return res.json(progress.map((item) => ({
            _id: item._id,
            courseId: item.courseId?._id,
            courseTitle: item.courseId?.title,
            completed: Boolean(item.completedAt),
            completedTopics: item.completedTopicIds.length,
            unlockedTopics: item.unlockedTopicIds.length,
            lastActivityAt: item.lastActivityAt,
            completedAt: item.completedAt
        })));
    } catch (err) {
        console.error('getCoursesProgress error', err);
        return res.status(500).json({ message: 'Ошибка загрузки прогресса' });
    }
};

export const getCoursesAnalytics = async (req, res) => {
    try {
        const analytics = await getUserCourseAnalytics(req.user.id);
        return res.json(analytics);
    } catch (err) {
        console.error('getCoursesAnalytics error', err);
        return res.status(500).json({ message: 'Ошибка загрузки аналитики' });
    }
};
