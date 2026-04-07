import CourseCategory from '../models/CourseCategory.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';

const parseBoolean = (value, fallback = true) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

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

        if (type !== 'single_choice' && type !== 'text_input') {
            throw new Error(`Вопрос #${index + 1}: неизвестный тип вопроса`);
        }

        if (type === 'single_choice') {
            const options = Array.isArray(question.options)
                ? question.options.map((option) => ({
                    text: String(option.text || '').trim(),
                    isCorrect: Boolean(option.isCorrect)
                }))
                : [];

            if (options.length !== 4) {
                throw new Error(`Вопрос #${index + 1}: нужно ровно 4 варианта ответа`);
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

        return {
            title,
            type,
            points,
            options: [],
            correctText
        };
    });
};

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

export const getCategories = async (_req, res) => {
    try {
        const categories = await CourseCategory.find().sort({ order: 1, createdAt: 1 });
        return res.json(categories);
    } catch (err) {
        console.error('getCategories error', err);
        return res.status(500).json({ message: 'Ошибка загрузки категорий' });
    }
};

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

export const deleteCategory = async (req, res) => {
    try {
        const coursesCount = await Course.countDocuments({ categoryId: req.params.id });
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

export const createCourse = async (req, res) => {
    try {
        const {
            title,
            description = '',
            categoryId,
            status = 'draft',
            order = 0,
            cover = '',
            isActive = true
        } = req.body;

        if (!String(title || '').trim()) {
            return res.status(400).json({ message: 'Название курса обязательно' });
        }

        if (!categoryId) {
            return res.status(400).json({ message: 'categoryId обязателен' });
        }

        const course = await Course.create({
            title: String(title).trim(),
            description: String(description || ''),
            categoryId,
            status: status === 'published' ? 'published' : 'draft',
            order: Number(order) || 0,
            cover: String(cover || ''),
            isActive: parseBoolean(isActive, true)
        });

        return res.status(201).json(course);
    } catch (err) {
        console.error('createCourse error', err);
        return res.status(500).json({ message: 'Ошибка создания курса' });
    }
};

export const getCoursesAdmin = async (_req, res) => {
    try {
        const courses = await Course.find()
            .populate('categoryId')
            .sort({ order: 1, createdAt: 1 });

        return res.json(courses);
    } catch (err) {
        console.error('getCoursesAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки курсов' });
    }
};

export const updateCourse = async (req, res) => {
    try {
        const payload = { ...req.body };

        if (payload.title !== undefined) payload.title = String(payload.title || '').trim();
        if (payload.description !== undefined) payload.description = String(payload.description || '');
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.cover !== undefined) payload.cover = String(payload.cover || '');
        if (payload.status !== undefined) payload.status = payload.status === 'published' ? 'published' : 'draft';
        if (payload.isActive !== undefined) payload.isActive = parseBoolean(payload.isActive, true);

        const course = await Course.findByIdAndUpdate(req.params.id, payload, { new: true }).populate('categoryId');
        if (!course) return res.status(404).json({ message: 'Курс не найден' });

        return res.json(course);
    } catch (err) {
        console.error('updateCourse error', err);
        return res.status(500).json({ message: 'Ошибка обновления курса' });
    }
};

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

export const createTopic = async (req, res) => {
    try {
        const { courseId, title, content, order = 0, status = 'draft' } = req.body;

        if (!courseId) return res.status(400).json({ message: 'courseId обязателен' });
        if (!String(title || '').trim()) return res.status(400).json({ message: 'Название темы обязательно' });
        if (!String(content || '').trim()) return res.status(400).json({ message: 'Контент темы обязателен' });

        const hasExplicitOrder = req.body.order !== undefined && req.body.order !== null && String(req.body.order).trim() !== '';
        let finalOrder = Number(order) || 0;

        if (!hasExplicitOrder) {
            const lastTopic = await CourseTopic.findOne({ courseId }).sort({ order: -1, createdAt: -1 }).select('order');
            finalOrder = Number(lastTopic?.order || 0) + 1;
        }

        const topic = await CourseTopic.create({
            courseId,
            title: String(title).trim(),
            content: String(content),
            order: finalOrder,
            status: status === 'published' ? 'published' : 'draft'
        });

        return res.status(201).json(topic);
    } catch (err) {
        console.error('createTopic error', err);
        return res.status(500).json({ message: 'Ошибка создания темы' });
    }
};

export const getTopicsAdmin = async (req, res) => {
    try {
        const query = req.query.courseId ? { courseId: req.query.courseId } : {};
        const topics = await CourseTopic.find(query).sort({ order: 1, createdAt: 1 });
        return res.json(topics);
    } catch (err) {
        console.error('getTopicsAdmin error', err);
        return res.status(500).json({ message: 'Ошибка загрузки тем' });
    }
};

export const updateTopic = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.title !== undefined) payload.title = String(payload.title || '').trim();
        if (payload.content !== undefined) payload.content = String(payload.content || '');
        if (payload.order !== undefined) payload.order = Number(payload.order) || 0;
        if (payload.status !== undefined) payload.status = payload.status === 'published' ? 'published' : 'draft';

        const topic = await CourseTopic.findByIdAndUpdate(req.params.id, payload, { new: true });
        if (!topic) return res.status(404).json({ message: 'Тема не найдена' });
        return res.json(topic);
    } catch (err) {
        console.error('updateTopic error', err);
        return res.status(500).json({ message: 'Ошибка обновления темы' });
    }
};

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
