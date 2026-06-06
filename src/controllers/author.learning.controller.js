import CourseCategory from '../models/CourseCategory.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import {
    buildContentBlocksForRead,
    buildLegacyContentFromBlocks,
    normalizeTopicBlocks
} from '../utils/topicContent.js';

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
        if (!value || unique.includes(value)) continue;
        unique.push(value);
    }

    return unique;
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

        if (!title) throw new Error(`Вопрос #${index + 1}: заполните текст вопроса`);
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
            if (options.length < 3) throw new Error(`Вопрос #${index + 1}: нужно минимум 3 варианта ответа`);
            if (options.some((option) => !option.text)) {
                throw new Error(`Вопрос #${index + 1}: все варианты должны быть заполнены`);
            }
            const correctCount = options.filter((option) => option.isCorrect).length;
            if (correctCount !== 1) {
                throw new Error(`Вопрос #${index + 1}: должен быть ровно 1 правильный вариант`);
            }
            return { title, type, points, options, correctText: '' };
        }

        const correctText = String(question.correctText || '').trim();
        if (!correctText) throw new Error(`Вопрос #${index + 1}: укажите правильный текстовый ответ`);
        if (type === 'sentence_order' && !SENTENCE_ALLOWED_RE.test(correctText)) {
            throw new Error(`Вопрос #${index + 1}: предложение не должно содержать знаков препинания`);
        }
        return { title, type, points, options: [], correctText };
    });
};

// Возвращает нужные данные или вычисленное значение.
const getOwnedCourse = async (userId, courseId) => Course.findOne({
    _id: courseId,
    ownerUserId: userId
});

// Проверяет наличие нужного состояния или признака.
const hasChangesSinceReview = async (course) => {
    const reviewedAt = course?.reviewedAt ? new Date(course.reviewedAt) : null;
    if (!reviewedAt) return true;
    if (course.updatedAt && new Date(course.updatedAt) > reviewedAt) return true;

    const latestTopic = await CourseTopic.findOne({ courseId: course._id })
        .sort({ updatedAt: -1 })
        .select('_id updatedAt');
    if (latestTopic?.updatedAt && new Date(latestTopic.updatedAt) > reviewedAt) return true;

    const topicIds = await CourseTopic.find({ courseId: course._id }).select('_id');
    if (topicIds.length === 0) return false;

    const latestQuiz = await TopicQuiz.findOne({ topicId: { $in: topicIds.map((item) => item._id) } })
        .sort({ updatedAt: -1 })
        .select('updatedAt');

    return Boolean(latestQuiz?.updatedAt && new Date(latestQuiz.updatedAt) > reviewedAt);
};

// Проверяет, разрешено ли выполнить действие.
const canSubmitForReview = async (course) => {
    if (!course || course.reviewStatus === 'pending_review') return false;
    const topicsCount = await CourseTopic.countDocuments({ courseId: course._id });
    if (topicsCount === 0) return false;
    if (course.reviewStatus === 'approved' || course.reviewStatus === 'rejected') {
        return hasChangesSinceReview(course);
    }
    return true;
};

// Обрабатывает серверный сценарий touchCourse.
const touchCourse = async (courseId) => {
    await Course.updateOne({ _id: courseId }, { $set: { updatedAt: new Date() } });
};

// Гарантирует наличие нужного состояния перед дальнейшей работой.
const ensureEditableCourse = (course) => {
    if (!course) return { ok: false, code: 404, message: 'Курс не найден' };
    if (course.reviewStatus === 'pending_review') {
        return {
            ok: false,
            code: 400,
            message: 'Курс уже отправлен на модерацию и временно недоступен для редактирования'
        };
    }
    return { ok: true };
};

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

// Возвращает нужные данные или вычисленное значение.
export const getCategoriesForAuthor = async (_req, res) => {
    try {
        const categories = await CourseCategory.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
        return res.json(categories);
    } catch (err) {
        console.error('getCategoriesForAuthor error', err);
        return res.status(500).json({ message: 'Ошибка загрузки категорий' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getAuthorCourses = async (req, res) => {
    try {
        const courses = await Course.find({ ownerUserId: req.user.id })
            .populate('categoryId')
            .populate('categoryIds')
            .sort({ updatedAt: -1, createdAt: -1 });

        const withFlags = await Promise.all((courses || []).map(async (course) => ({
            ...course.toObject(),
            canSubmitForReview: await canSubmitForReview(course)
        })));

        return res.json(withFlags);
    } catch (err) {
        console.error('getAuthorCourses error', err);
        return res.status(500).json({ message: 'Ошибка загрузки курсов автора' });
    }
};

// Создает сущность и возвращает результат клиенту.
export const createAuthorCourse = async (req, res) => {
    try {
        const {
            title,
            description = '',
            categoryId,
            categoryIds,
            order = 0,
            cover = '',
            isActive = true
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
            status: 'draft',
            reviewStatus: 'draft',
            order: Number(order) || 0,
            cover: String(cover || ''),
            isActive: parseBoolean(isActive, true),
            isPinnedHome: false,
            pinnedHomeText: '',
            isRevision: false,
            sourceCourseId: null,
            reviewComment: '',
            reviewedBy: null,
            reviewedAt: null
        });

        return res.status(201).json(course);
    } catch (err) {
        console.error('createAuthorCourse error', err);
        return res.status(500).json({ message: 'Ошибка создания курса' });
    }
};

// Обновляет сущность по данным из запроса.
export const updateAuthorCourse = async (req, res) => {
    try {
        const course = await getOwnedCourse(req.user.id, req.params.id);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) {
            return res.status(editableCheck.code).json({ message: editableCheck.message });
        }

        const payload = { ...req.body };
        if (payload.title !== undefined) payload.title = String(payload.title || '').trim();
        if (payload.description !== undefined) payload.description = String(payload.description || '');
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.cover !== undefined) payload.cover = String(payload.cover || '');
        if (payload.isActive !== undefined) payload.isActive = parseBoolean(payload.isActive, true);
        if (payload.categoryIds !== undefined || payload.categoryId !== undefined) {
            const normalizedCategoryIds = normalizeCategoryIds(payload.categoryIds, payload.categoryId);
            if (normalizedCategoryIds.length === 0) {
                return res.status(400).json({ message: 'Выберите хотя бы одну категорию' });
            }
            payload.categoryIds = normalizedCategoryIds;
            payload.categoryId = normalizedCategoryIds[0];
        }

        payload.status = 'draft';
        if (course.reviewStatus !== 'pending_review') {
            payload.reviewStatus = course.reviewStatus === 'rejected' ? 'rejected' : 'draft';
        }
        payload.reviewComment = '';
        payload.reviewedBy = null;
        payload.reviewedAt = null;

        const updated = await Course.findByIdAndUpdate(req.params.id, payload, { new: true })
            .populate('categoryId')
            .populate('categoryIds');

        return res.json(updated);
    } catch (err) {
        console.error('updateAuthorCourse error', err);
        return res.status(500).json({ message: 'Ошибка обновления курса' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteAuthorCourse = async (req, res) => {
    try {
        const course = await getOwnedCourse(req.user.id, req.params.id);
        if (!course) return res.status(404).json({ message: 'Курс не найден' });
        if (!course.isRevision && course.status === 'published') {
            return res.status(400).json({ message: 'Нельзя удалить опубликованный курс' });
        }

        const topics = await CourseTopic.find({ courseId: course._id }).select('_id');
        const topicIds = topics.map((topic) => topic._id);

        await TopicQuiz.deleteMany({ topicId: { $in: topicIds } });
        await CourseTopic.deleteMany({ courseId: course._id });
        await Course.deleteOne({ _id: course._id });

        return res.json({ success: true });
    } catch (err) {
        console.error('deleteAuthorCourse error', err);
        return res.status(500).json({ message: 'Ошибка удаления курса' });
    }
};

// Принимает отправленные пользователем данные и фиксирует результат.
export const submitAuthorCourseForReview = async (req, res) => {
    try {
        const course = await getOwnedCourse(req.user.id, req.params.id);
        if (!course) return res.status(404).json({ message: 'Курс не найден' });
        if (course.reviewStatus === 'pending_review') {
            return res.json({ message: 'Курс уже отправлен на модерацию', alreadySubmitted: true });
        }

        const topicsCount = await CourseTopic.countDocuments({ courseId: course._id });
        if (topicsCount === 0) {
            return res.status(400).json({ message: 'Добавьте хотя бы одну тему перед отправкой' });
        }
        if ((course.reviewStatus === 'approved' || course.reviewStatus === 'rejected') && !(await hasChangesSinceReview(course))) {
            return res.status(400).json({ message: 'В курсе нет изменений после последней модерации' });
        }

        course.status = 'draft';
        course.reviewStatus = 'pending_review';
        course.reviewComment = '';
        course.reviewedBy = null;
        course.reviewedAt = null;
        await course.save();

        return res.json({ message: 'Курс отправлен на модерацию', alreadySubmitted: false });
    } catch (err) {
        console.error('submitAuthorCourseForReview error', err);
        return res.status(500).json({ message: 'Ошибка отправки курса на модерацию' });
    }
};

// Создает сущность и возвращает результат клиенту.
export const createCourseRevision = async (req, res) => {
    return res.status(400).json({ message: 'Ревизии отключены. Редактируйте существующий курс и отправляйте его на модерацию.' });
};

// Возвращает нужные данные или вычисленное значение.
export const getAuthorTopics = async (req, res) => {
    try {
        const courseId = String(req.query.courseId || '');
        if (!courseId) return res.json([]);
        const course = await getOwnedCourse(req.user.id, courseId);
        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        const topics = await CourseTopic.find({ courseId }).sort({ order: 1, createdAt: 1 });
        return res.json(topics.map(buildTopicReadPayload));
    } catch (err) {
        console.error('getAuthorTopics error', err);
        return res.status(500).json({ message: 'Ошибка загрузки тем' });
    }
};

// Создает сущность и возвращает результат клиенту.
export const createAuthorTopic = async (req, res) => {
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

        const course = await getOwnedCourse(req.user.id, courseId);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) return res.status(editableCheck.code).json({ message: editableCheck.message });

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
        await touchCourse(courseId);

        return res.status(201).json(buildTopicReadPayload(topic));
    } catch (err) {
        console.error('createAuthorTopic error', err);
        const status = isTopicContentValidationError(err?.message) ? 400 : 500;
        return res.status(status).json({ message: err?.message || 'Ошибка создания темы' });
    }
};

// Обновляет сущность по данным из запроса.
export const updateAuthorTopic = async (req, res) => {
    try {
        const topic = await CourseTopic.findById(req.params.id);
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        const course = await getOwnedCourse(req.user.id, topic.courseId);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) return res.status(editableCheck.code).json({ message: editableCheck.message });

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

        const updated = await CourseTopic.findByIdAndUpdate(req.params.id, payload, { new: true });
        await touchCourse(course._id);
        return res.json(buildTopicReadPayload(updated));
    } catch (err) {
        console.error('updateAuthorTopic error', err);
        const status = isTopicContentValidationError(err?.message) ? 400 : 500;
        return res.status(status).json({ message: err?.message || 'Ошибка обновления темы' });
    }
};

// Удаляет сущность и связанные данные, если это требуется.
export const deleteAuthorTopic = async (req, res) => {
    try {
        const topic = await CourseTopic.findById(req.params.id);
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        const course = await getOwnedCourse(req.user.id, topic.courseId);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) return res.status(editableCheck.code).json({ message: editableCheck.message });

        await TopicQuiz.deleteOne({ topicId: topic._id });
        await CourseTopic.deleteOne({ _id: topic._id });
        await touchCourse(course._id);

        return res.json({ success: true });
    } catch (err) {
        console.error('deleteAuthorTopic error', err);
        return res.status(500).json({ message: 'Ошибка удаления темы' });
    }
};

// Возвращает нужные данные или вычисленное значение.
export const getAuthorTopicQuiz = async (req, res) => {
    try {
        const topic = await CourseTopic.findById(req.params.topicId);
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        const course = await getOwnedCourse(req.user.id, topic.courseId);
        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        const quiz = await TopicQuiz.findOne({ topicId: req.params.topicId });
        return res.json(quiz || null);
    } catch (err) {
        console.error('getAuthorTopicQuiz error', err);
        return res.status(500).json({ message: 'Ошибка загрузки теста' });
    }
};

// Обрабатывает серверный сценарий upsertAuthorTopicQuiz.
export const upsertAuthorTopicQuiz = async (req, res) => {
    try {
        const topicId = req.params.topicId || req.body.topicId;
        const { passingScore = 70, questions = [] } = req.body;
        if (!topicId) return res.status(400).json({ message: 'topicId обязателен' });

        const topic = await CourseTopic.findById(topicId);
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        const course = await getOwnedCourse(req.user.id, topic.courseId);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) return res.status(editableCheck.code).json({ message: editableCheck.message });

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
        await touchCourse(course._id);

        return res.json(quiz);
    } catch (err) {
        console.error('upsertAuthorTopicQuiz error', err);
        return res.status(400).json({ message: err?.message || 'Ошибка сохранения теста' });
    }
};

// Принимает загруженный файл и возвращает информацию для дальнейшей работы.
export const uploadAuthorTopicImage = async (req, res) => {
    try {
        const courseId = String(req.body.courseId || '');
        if (!courseId) return res.status(400).json({ message: 'courseId обязателен' });
        if (!req.file) return res.status(400).json({ message: 'Файл изображения обязателен' });

        const course = await getOwnedCourse(req.user.id, courseId);
        const editableCheck = ensureEditableCourse(course);
        if (!editableCheck.ok) return res.status(editableCheck.code).json({ message: editableCheck.message });

        return res.json({
            url: `/uploads/${req.file.filename}`
        });
    } catch (err) {
        console.error('uploadAuthorTopicImage error', err);
        return res.status(500).json({ message: 'Ошибка загрузки изображения' });
    }
};
