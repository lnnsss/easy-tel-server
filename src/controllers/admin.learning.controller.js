import CourseCategory from '../models/CourseCategory.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import User from '../models/User.js';
import DailyRewardConfig from '../models/DailyRewardConfig.js';
import { sendCourseReviewDecisionEmail } from '../services/mailer.js';
import {
    buildContentBlocksForRead,
    buildLegacyContentFromBlocks,
    normalizeTopicBlocks
} from '../utils/topicContent.js';
import { normalizeRewardDaysInput } from '../utils/dailyRewards.js';

// Обрабатывает серверный сценарий parseBoolean.
const parseBoolean = (value, fallback = true) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

// Приводит входные данные к единому безопасному формату.
const normalizePinnedMode = (value) => {
    const normalized = String(value || '').trim();
    if (normalized === 'dismiss_once') return 'dismiss_once';
    if (normalized === 'confirm_hide') return 'confirm_hide';
    return 'persistent';
};

// Приводит входные данные к единому безопасному формату.
const normalizeCategoryIds = (rawCategoryIds, rawCategoryId) => {
    const source = [];

    if (Array.isArray(rawCategoryIds)) {
        source.push(...rawCategoryIds);
    } else if (typeof rawCategoryIds === 'string' && rawCategoryIds.trim()) {
        source.push(...rawCategoryIds.split(','));
    }

    if (source.length === 0 && rawCategoryId) {
        source.push(rawCategoryId);
    }

    const unique = [];
    for (const item of source) {
        const value = String(item || '').trim();
        if (!value || unique.includes(value)) {
            continue;
        }
        unique.push(value);
    }

    return unique;
};

// Обрабатывает серверный сценарий cloneQuizPayload.
const cloneQuizPayload = (quizDoc, topicId) => ({
    topicId,
    passingScore: quizDoc.passingScore,
    questions: Array.isArray(quizDoc.questions) ? quizDoc.questions : []
});

// Собирает данные в формат, удобный для дальнейшего использования.
const buildTopicReadPayload = (topicDoc) => {
    const topic = topicDoc?.toObject ? topicDoc.toObject() : topicDoc;
    return {
        ...topic,
        contentBlocks: buildContentBlocksForRead(topic)
    };
};

// Проверяет условие и возвращает логический результат.
const isTopicContentValidationError = (message = '') => {
    return message.includes('contentBlocks')
        || message.includes('Добавьте хотя бы один блок контента')
        || message.includes('Блок #');
};
const SENTENCE_ALLOWED_RE = /^[\p{L}\p{N}\s-]+$/u;

// Проверяет входные данные и возвращает нормализованный результат.
const validateAndNormalizeQuestions = (questions = []) => {
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Добавьте хотя бы один вопрос');
    }

    return questions.map((question, index) => {
        const type = String(question.type || '').trim();
        const title = String(question.title || '').trim();
        const points = Number(question.points) > 0 ? Number(question.points) : 1;

        if (!title) {
            throw new Error(`Вопрос #${index + 1}: заполните текст вопроса`);
        }

        if (type !== 'single_choice' && type !== 'text_input' && type !== 'sentence_order') {
            throw new Error(`Вопрос #${index + 1}: неизвестный тип вопроса`);
        }

        if (type === 'single_choice') {
            const options = Array.isArray(question.options)
                ? question.options.map((option) => ({
                    text: String(option.text || '').trim(),
                    isCorrect: Boolean(option.isCorrect)
                }))
                : [];

            if (options.length < 3) {
                throw new Error(`Вопрос #${index + 1}: нужно минимум 3 варианта ответа`);
            }

            if (options.some((option) => !option.text)) {
                throw new Error(`Вопрос #${index + 1}: все варианты должны быть заполнены`);
            }

            const correctCount = options.filter((option) => option.isCorrect).length;
            if (correctCount !== 1) {
                throw new Error(`Вопрос #${index + 1}: должен быть ровно 1 правильный вариант`);
            }

            return {
                title,
                type,
                points,
                options,
                correctText: ''
            };
        }

        const correctText = String(question.correctText || '').trim();
        if (!correctText) {
            throw new Error(`Вопрос #${index + 1}: укажите правильный текстовый ответ`);
        }

        if (type === 'sentence_order' && !SENTENCE_ALLOWED_RE.test(correctText)) {
            throw new Error(`Вопрос #${index + 1}: предложение не должно содержать знаков препинания`);
        }

        return {
            title,
            type,
            points,
            options: [],
            correctText
        };
    });
};

// Создает сущность и возвращает результат клиенту.
export const createCategory = async (req, res) => {
    try {
        const { name, description = '', order = 0, isActive = true } = req.body;
        if (!String(name || '').trim()) {
            return res.status(400).json({ message: 'Название категории обязательно' });
        }

        const category = await CourseCategory.create({
            name: String(name).trim(),
            description: String(description || ''),
            order: Number(order) || 0,
            isActive: parseBoolean(isActive, true)
        });

        return res.status(201).json(category);
    } catch (err) {
        console.error('createCategory error', err);
        return res.status(500).json({ message: 'Ошибка создания категории' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getCategories = async (_req, res) => {
    try {
        const categories = await CourseCategory.find().sort({ order: 1, createdAt: 1 });
        return res.json(categories);
    } catch (err) {
        console.error('getCategories error', err);
        return res.status(500).json({ message: 'Ошибка загрузки категорий' });
    }
};

// Обновляет сущность по данным из запроса.
export const updateCategory = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.name !== undefined) payload.name = String(payload.name || '').trim();
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.isActive !== undefined) payload.isActive = parseBoolean(payload.isActive, true);

        const category = await CourseCategory.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!category) return res.status(404).json({ message: 'Категория не найдена' });
        return res.json(category);
    } catch (err) {
        console.error('updateCategory error', err);
        return res.status(500).json({ message: 'Ошибка обновления категории' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteCategory = async (req, res) => {
    try {
        const coursesCount = await Course.countDocuments({
            $or: [
                { categoryId: req.params.id },
                { categoryIds: req.params.id }
            ]
        });
        if (coursesCount > 0) {
            return res.status(400).json({ message: 'Нельзя удалить категорию с курсами' });
        }

        await CourseCategory.findByIdAndDelete(req.params.id);
        return res.json({ success: true });
    } catch (err) {
        console.error('deleteCategory error', err);
        return res.status(500).json({ message: 'Ошибка удаления категории' });
    }
};

// Создает сущность и возвращает результат клиенту.
export const createCourse = async (req, res) => {
    try {
        const {
            title,
            description = '',
            categoryId,
            categoryIds,
            status = 'draft',
            order = 0,
            cover = '',
            isActive = true,
            isPinnedHome = false,
            pinnedHomeText = '',
            pinnedHomeMode = 'persistent'
        } = req.body;

        if (!String(title || '').trim()) {
            return res.status(400).json({ message: 'Название курса обязательно' });
        }

        const normalizedCategoryIds = normalizeCategoryIds(categoryIds, categoryId);
        if (normalizedCategoryIds.length === 0) {
            return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
        }

        const course = await Course.create({
            title: String(title).trim(),
            description: String(description || ''),
            categoryId: normalizedCategoryIds[0],
            categoryIds: normalizedCategoryIds,
            ownerUserId: req.user.id,
            status: status === 'published' ? 'published' : 'draft',
            reviewStatus: 'not_required',
            reviewComment: '',
            reviewedBy: null,
            reviewedAt: null,
            isRevision: false,
            sourceCourseId: null,
            order: Number(order) || 0,
            cover: String(cover || ''),
            isActive: parseBoolean(isActive, true),
            isPinnedHome: parseBoolean(isPinnedHome, false),
            pinnedHomeText: String(pinnedHomeText || '').trim(),
            pinnedHomeMode: normalizePinnedMode(pinnedHomeMode)
        });

        if (course.isPinnedHome) {
            await Course.updateMany(
                { _id: { $ne: course._id } },
                { $set: { isPinnedHome: false, pinnedHomeText: '' } }
            );
        }

        return res.status(201).json(course);
    } catch (err) {
        console.error('createCourse error', err);
        return res.status(500).json({ message: 'Ошибка создания курса' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getCoursesAdmin = async (_req, res) => {
    try {
        const courses = await Course.find({
            $or: [
                { reviewStatus: { $in: ['not_required', 'approved', 'pending_review'] } },
                { ownerUserId: null }
            ]
        })
            .populate('categoryId')
            .populate('categoryIds')
            .populate('ownerUserId', 'username firstName lastName role email')
            .sort({ order: 1, createdAt: 1 });

        return res.json(courses);
    } catch (err) {
        console.error('getCoursesAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки курсов' });
    }
};

// Обрабатывает серверный сценарий applyRevisionToSourceCourse.
const applyRevisionToSourceCourse = async (revisionCourse, adminId, adminComment = '') => {
    const sourceCourse = await Course.findById(revisionCourse.sourceCourseId);
    if (!sourceCourse) {
        throw new Error('Исходный курс ревизии не найден');
    }

    sourceCourse.title = revisionCourse.title;
    sourceCourse.description = revisionCourse.description;
    sourceCourse.categoryId = revisionCourse.categoryId;
    sourceCourse.categoryIds = revisionCourse.categoryIds || [];
    sourceCourse.order = Number(revisionCourse.order) || 0;
    sourceCourse.cover = String(revisionCourse.cover || '');
    sourceCourse.isActive = parseBoolean(revisionCourse.isActive, true);
    sourceCourse.status = 'published';
    sourceCourse.reviewStatus = 'approved';
    sourceCourse.reviewComment = String(adminComment || '').trim();
    sourceCourse.reviewedBy = adminId;
    sourceCourse.reviewedAt = new Date();
    await sourceCourse.save();

    const [sourceTopics, revisionTopics] = await Promise.all([
        CourseTopic.find({ courseId: sourceCourse._id }),
        CourseTopic.find({ courseId: revisionCourse._id }).sort({ order: 1, createdAt: 1 })
    ]);

    const sourceTopicMap = new Map(sourceTopics.map((item) => [String(item._id), item]));
    const touchedSourceTopicIds = new Set();
    const revisionToTargetTopicId = new Map();

    for (const revisionTopic of revisionTopics) {
        const revisionBlocks = buildContentBlocksForRead(revisionTopic);
        const sourceTopicId = String(revisionTopic.sourceTopicId || '');
        const existingSourceTopic = sourceTopicId ? sourceTopicMap.get(sourceTopicId) : null;
        if (existingSourceTopic) {
            existingSourceTopic.title = revisionTopic.title;
            existingSourceTopic.content = buildLegacyContentFromBlocks(revisionBlocks);
            existingSourceTopic.contentBlocks = revisionBlocks;
            existingSourceTopic.order = Number(revisionTopic.order) || 0;
            existingSourceTopic.status = revisionTopic.status === 'published' ? 'published' : 'draft';
            await existingSourceTopic.save();
            touchedSourceTopicIds.add(String(existingSourceTopic._id));
            revisionToTargetTopicId.set(String(revisionTopic._id), existingSourceTopic._id);
            continue;
        }

        const createdSourceTopic = await CourseTopic.create({
            courseId: sourceCourse._id,
            sourceTopicId: null,
            title: revisionTopic.title,
            content: buildLegacyContentFromBlocks(revisionBlocks),
            contentBlocks: revisionBlocks,
            order: Number(revisionTopic.order) || 0,
            status: revisionTopic.status === 'published' ? 'published' : 'draft'
        });

        touchedSourceTopicIds.add(String(createdSourceTopic._id));
        revisionToTargetTopicId.set(String(revisionTopic._id), createdSourceTopic._id);
    }

    for (const sourceTopic of sourceTopics) {
        if (!touchedSourceTopicIds.has(String(sourceTopic._id))) {
            sourceTopic.status = 'draft';
            await sourceTopic.save();
        }
    }

    const revisionTopicIds = revisionTopics.map((topic) => topic._id);
    const revisionQuizzes = await TopicQuiz.find({ topicId: { $in: revisionTopicIds } });
    for (const revisionQuiz of revisionQuizzes) {
        const targetTopicId = revisionToTargetTopicId.get(String(revisionQuiz.topicId));
        if (!targetTopicId) continue;
        await TopicQuiz.findOneAndUpdate(
            { topicId: targetTopicId },
            cloneQuizPayload(revisionQuiz, targetTopicId),
            { upsert: true, new: true }
        );
    }

    await TopicQuiz.deleteMany({ topicId: { $in: revisionTopicIds } });
    await CourseTopic.deleteMany({ courseId: revisionCourse._id });
    await Course.deleteOne({ _id: revisionCourse._id });

    return sourceCourse;
};

// Обновляет сущность по данным из запроса.
export const updateCourse = async (req, res) => {
    try {
        const payload = { ...req.body };

        if (payload.title !== undefined) payload.title = String(payload.title || '').trim();
        if (payload.description !== undefined) payload.description = String(payload.description || '');
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.cover !== undefined) payload.cover = String(payload.cover || '');
        if (payload.status !== undefined) payload.status = payload.status === 'published' ? 'published' : 'draft';
        if (payload.isActive !== undefined) payload.isActive = parseBoolean(payload.isActive, true);
        if (payload.isPinnedHome !== undefined) payload.isPinnedHome = parseBoolean(payload.isPinnedHome, false);
        if (payload.pinnedHomeText !== undefined) payload.pinnedHomeText = String(payload.pinnedHomeText || '').trim();
        if (payload.pinnedHomeMode !== undefined) payload.pinnedHomeMode = normalizePinnedMode(payload.pinnedHomeMode);
        if (payload.categoryIds !== undefined || payload.categoryId !== undefined) {
            const normalizedCategoryIds = normalizeCategoryIds(payload.categoryIds, payload.categoryId);
            if (normalizedCategoryIds.length === 0) {
                return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
            }
            payload.categoryIds = normalizedCategoryIds;
            payload.categoryId = normalizedCategoryIds[0];
        }

        if (payload.isPinnedHome === false) {
            payload.pinnedHomeText = '';
            payload.pinnedHomeMode = 'persistent';
        }

        const course = await Course.findByIdAndUpdate(req.params.id, payload, { new: true })
            .populate('categoryId')
            .populate('categoryIds');
        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        if (course.isPinnedHome) {
            await Course.updateMany(
                { _id: { $ne: course._id } },
                { $set: { isPinnedHome: false, pinnedHomeText: '' } }
            );
        }

        return res.json(course);
    } catch (err) {
        console.error('updateCourse error', err);
        return res.status(500).json({ message: 'Ошибка обновления курса' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteCourse = async (req, res) => {
    try {
        const topics = await CourseTopic.find({ courseId: req.params.id }).select('_id');
        const topicIds = topics.map((topic) => topic._id);

        await TopicQuiz.deleteMany({ topicId: { $in: topicIds } });
        await UserCourseProgress.deleteMany({ courseId: req.params.id });
        await UserTopicAttempt.deleteMany({ courseId: req.params.id });
        await CourseTopic.deleteMany({ courseId: req.params.id });
        await Course.findByIdAndDelete(req.params.id);

        return res.json({ success: true });
    } catch (err) {
        console.error('deleteCourse error', err);
        return res.status(500).json({ message: 'Ошибка удаления курса' });
    }
};

// Создает сущность и возвращает результат клиенту.
export const createTopic = async (req, res) => {
    try {
        const { courseId, title, content, contentBlocks, order = 0, status = 'draft' } = req.body;

        if (!courseId) return res.status(400).json({ message: 'courseId обязателен' });
        if (!String(title || '').trim()) return res.status(400).json({ message: 'Название темы обязательно' });

        let normalizedContentBlocks = [];
        if (contentBlocks !== undefined) {
            normalizedContentBlocks = normalizeTopicBlocks(contentBlocks);
        } else if (String(content || '').trim()) {
            normalizedContentBlocks = [{ type: 'text', text: String(content), url: '' }];
        } else {
            return res.status(400).json({ message: 'Контент темы обязателен' });
        }

        const hasExplicitOrder = req.body.order !== undefined && req.body.order !== null && String(req.body.order).trim() !== '';
        let finalOrder = Number(order) || 0;

        if (!hasExplicitOrder) {
            const lastTopic = await CourseTopic.findOne({ courseId }).sort({ order: -1, createdAt: -1 }).select('order');
            finalOrder = Number(lastTopic?.order || 0) + 1;
        }

        const topic = await CourseTopic.create({
            courseId,
            sourceTopicId: null,
            title: String(title).trim(),
            content: buildLegacyContentFromBlocks(normalizedContentBlocks),
            contentBlocks: normalizedContentBlocks,
            order: finalOrder,
            status: status === 'published' ? 'published' : 'draft'
        });

        return res.status(201).json(buildTopicReadPayload(topic));
    } catch (err) {
        console.error('createTopic error', err);
        const status = isTopicContentValidationError(err?.message) ? 400 : 500;
        return res.status(status).json({ message: err?.message || 'Ошибка создания темы' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getTopicsAdmin = async (req, res) => {
    try {
        const query = req.query.courseId ? { courseId: req.query.courseId } : {};
        const topics = await CourseTopic.find(query).sort({ order: 1, createdAt: 1 });
        return res.json(topics.map(buildTopicReadPayload));
    } catch (err) {
        console.error('getTopicsAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки тем' });
    }
};

// Обновляет сущность по данным из запроса.
export const updateTopic = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.title !== undefined) payload.title = String(payload.title || '').trim();
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.status !== undefined) payload.status = payload.status === 'published' ? 'published' : 'draft';

        if (payload.contentBlocks !== undefined) {
            payload.contentBlocks = normalizeTopicBlocks(payload.contentBlocks);
            payload.content = buildLegacyContentFromBlocks(payload.contentBlocks);
        } else if (payload.content !== undefined) {
            const normalizedLegacy = String(payload.content || '');
            payload.content = normalizedLegacy;
            payload.contentBlocks = normalizedLegacy.trim()
                ? [{ type: 'text', text: normalizedLegacy, url: '' }]
                : [];
        }

        const topic = await CourseTopic.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        return res.json(buildTopicReadPayload(topic));
    } catch (err) {
        console.error('updateTopic error', err);
        const status = isTopicContentValidationError(err?.message) ? 400 : 500;
        return res.status(status).json({ message: err?.message || 'Ошибка обновления темы' });
    }
};

// Принимает загруженный файл и возвращает информацию для дальнейшей работы.
export const uploadTopicImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл изображения обязателен' });
    }

    return res.json({
        url: `/uploads/${req.file.filename}`
    });
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteTopic = async (req, res) => {
    try {
        await TopicQuiz.deleteOne({ topicId: req.params.id });
        await UserTopicAttempt.deleteMany({ topicId: req.params.id });
        await CourseTopic.findByIdAndDelete(req.params.id);
        await UserCourseProgress.updateMany(
            { $or: [{ unlockedTopicIds: req.params.id }, { completedTopicIds: req.params.id }] },
            {
                $pull: {
                    unlockedTopicIds: req.params.id,
                    completedTopicIds: req.params.id
                }
            }
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('deleteTopic error', err);
        return res.status(500).json({ message: 'Ошибка удаления темы' });
    }
};

// Обрабатывает серверный сценарий upsertTopicQuiz.
export const upsertTopicQuiz = async (req, res) => {
    try {
        const topicId = req.params.topicId || req.body.topicId;
        const { passingScore = 70, questions = [] } = req.body;

        if (!topicId) return res.status(400).json({ message: 'topicId обязателен' });

        const topic = await CourseTopic.findById(topicId);
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });

        const sanitizedQuestions = validateAndNormalizeQuestions(questions);

        const quiz = await TopicQuiz.findOneAndUpdate(
            { topicId },
            {
                topicId,
                passingScore: Math.max(1, Math.min(100, Number(passingScore) || 70)),
                questions: sanitizedQuestions
            },
            { new: true, upsert: true }
        );

        return res.json(quiz);
    } catch (err) {
        console.error('upsertTopicQuiz error', err);
        return res.status(400).json({ message: err?.message || 'Ошибка сохранения теста' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getTopicQuizAdmin = async (req, res) => {
    try {
        const quiz = await TopicQuiz.findOne({ topicId: req.params.topicId });
        if (!quiz) return res.json(null);
        return res.json(quiz);
    } catch (err) {
        console.error('getTopicQuizAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки теста' });
    }
};

// Обрабатывает решение администратора по заявке или материалу.
export const reviewCourse = async (req, res) => {
    try {
        const decision = String(req.body.decision || '').trim();
        const adminComment = String(req.body.adminComment || '').trim();
        if (decision !== 'approved' && decision !== 'rejected') {
            return res.status(400).json({ message: 'Решение должно быть approved или rejected' });
        }

        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: 'Курс не найден' });
        if (course.reviewStatus !== 'pending_review') {
            return res.status(400).json({ message: 'Курс не находится на модерации' });
        }

        if (decision === 'approved') {
            course.status = 'draft';
            course.reviewStatus = 'approved';
            course.reviewComment = adminComment;
            course.reviewedBy = req.user.id;
            course.reviewedAt = new Date();
            await course.save();

            if (course.ownerUserId) {
                const owner = await User.findById(course.ownerUserId).select('email firstName');
                if (owner?.email) {
                    try {
                        await sendCourseReviewDecisionEmail({
                            to: owner.email,
                            firstName: owner.firstName,
                            decision: 'approved',
                            courseTitle: course.title,
                            adminComment
                        });
                    } catch (mailErr) {
                        console.error('sendCourseReviewDecisionEmail approved error', mailErr);
                    }
                }
            }
            return res.json({ message: 'Курс одобрен и переведен в черновик' });
        }

        course.status = 'draft';
        course.reviewStatus = 'rejected';
        course.reviewComment = adminComment;
        course.reviewedBy = req.user.id;
        course.reviewedAt = new Date();
        await course.save();

        if (course.ownerUserId) {
            const owner = await User.findById(course.ownerUserId).select('email firstName');
            if (owner?.email) {
                try {
                    await sendCourseReviewDecisionEmail({
                        to: owner.email,
                        firstName: owner.firstName,
                        decision: 'rejected',
                        courseTitle: course.title,
                        adminComment
                    });
                } catch (mailErr) {
                    console.error('sendCourseReviewDecisionEmail rejected error', mailErr);
                }
            }
        }

        return res.json({ message: 'Курс отклонен' });
    } catch (err) {
        console.error('reviewCourse error', err);
        return res.status(500).json({ message: err?.message || 'Ошибка модерации курса' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getDailyRewardConfigAdmin = async (_req, res) => {
    try {
        let config = await DailyRewardConfig.findOne({ key: 'default' });
        if (!config) {
            config = await DailyRewardConfig.create({
                key: 'default',
                days: normalizeRewardDaysInput([])
            });
        }

        return res.json({
            days: normalizeRewardDaysInput(config.days || [])
        });
    } catch (err) {
        console.error('getDailyRewardConfigAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки конфигурации наград' });
    }
};

// Обрабатывает серверный сценарий upsertDailyRewardConfigAdmin.
export const upsertDailyRewardConfigAdmin = async (req, res) => {
    try {
        const days = normalizeRewardDaysInput(req.body?.days || []);
        const config = await DailyRewardConfig.findOneAndUpdate(
            { key: 'default' },
            { $set: { key: 'default', days } },
            { upsert: true, new: true }
        );

        return res.json({
            days: normalizeRewardDaysInput(config.days || [])
        });
    } catch (err) {
        console.error('upsertDailyRewardConfigAdmin error', err);
        return res.status(500).json({ message: 'Ошибка сохранения конфигурации наград' });
    }
};
