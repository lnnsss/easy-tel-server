import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import CourseCategory from '../models/CourseCategory.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';

dotenv.config();

const DEFAULT_MARKDOWN_PATH = path.resolve(process.cwd(), '../other/tatar_language_a1_course.md');

const splitByHeading = (source, headingPattern) => {
    const regex = new RegExp(`^${headingPattern}.*$`, 'gm');
    const matches = [...source.matchAll(regex)];
    if (matches.length === 0) return [];

    return matches.map((match, index) => {
        const start = match.index;
        const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
        return source.slice(start, end).trim();
    });
};

const extractBlock = (source, fromHeading, toHeadingList = []) => {
    const fromRegex = new RegExp(`^${fromHeading}\\s*$`, 'm');
    const fromMatch = source.match(fromRegex);
    if (!fromMatch || fromMatch.index == null) return '';

    const blockStart = fromMatch.index + fromMatch[0].length;
    const rest = source.slice(blockStart);

    let blockEnd = rest.length;
    for (const toHeading of toHeadingList) {
        const toRegex = new RegExp(`^${toHeading}\\s*$`, 'm');
        const toMatch = rest.match(toRegex);
        if (toMatch && toMatch.index != null) {
            blockEnd = Math.min(blockEnd, toMatch.index);
        }
    }

    return rest.slice(0, blockEnd).trim();
};

const normalizeOptionText = (text) => text.replace(/\s+\(правильный\)\s*$/iu, '').trim();

const parseQuizQuestion = (questionBlock) => {
    const typeMatch = questionBlock.match(/^\s*Тип:\s*(.+)\s*$/m);
    const questionMatch = questionBlock.match(/^\s*Вопрос:\s*(.+)\s*$/m);

    if (!typeMatch || !questionMatch) {
        throw new Error(`Не удалось распарсить вопрос:\n${questionBlock}`);
    }

    const rawType = typeMatch[1].trim().toLowerCase();
    const title = questionMatch[1].trim();

    if (rawType === 'один вариант') {
        const optionsMatch = questionBlock.match(/^\s*Варианты:\s*$([\s\S]*)/m);
        if (!optionsMatch) {
            throw new Error(`В вопросе "${title}" не найден блок "Варианты"`);
        }

        const options = optionsMatch[1]
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('- '))
            .map((line) => {
                const optionText = line.slice(2).trim();
                return {
                    text: normalizeOptionText(optionText),
                    isCorrect: /\(правильный\)/iu.test(optionText)
                };
            });

        if (options.length < 2) {
            throw new Error(`В вопросе "${title}" недостаточно вариантов ответа`);
        }

        if (!options.some((option) => option.isCorrect)) {
            throw new Error(`В вопросе "${title}" нет правильного варианта`);
        }

        return {
            title,
            type: 'single_choice',
            options,
            correctText: '',
            points: 1
        };
    }

    if (rawType === 'текстовый ответ') {
        const answerMatch = questionBlock.match(/^\s*Правильный ответ:\s*(.+)\s*$/m);
        if (!answerMatch) {
            throw new Error(`В вопросе "${title}" не найден "Правильный ответ"`);
        }

        return {
            title,
            type: 'text_input',
            options: [],
            correctText: answerMatch[1].trim(),
            points: 1
        };
    }

    throw new Error(`Неизвестный тип вопроса "${rawType}" в вопросе "${title}"`);
};

const parseTopicBlocks = (topicText) => {
    const lines = String(topicText || '').split('\n');
    const blocks = [];
    let paragraphBuffer = [];

    const flushParagraph = () => {
        const text = paragraphBuffer.join('\n').trim();
        if (text) {
            blocks.push({ type: 'text', text, url: '' });
        }
        paragraphBuffer = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            continue;
        }

        if (line.startsWith('### ')) {
            flushParagraph();
            blocks.push({ type: 'h3', text: line.slice(4).trim(), url: '' });
            continue;
        }

        paragraphBuffer.push(rawLine);
    }

    flushParagraph();
    return blocks;
};

const parseCourseFromMarkdown = (source) => {
    const titleMatch = source.match(/^#\s+(.+)\s*$/m);
    if (!titleMatch) throw new Error('Не найден заголовок курса');
    const title = titleMatch[1].trim();

    const description = extractBlock(source, '## Описание курса', ['## Рекомендованные настройки в админке', '## Использованные источники']);
    const settings = extractBlock(source, '## Рекомендованные настройки в админке', ['## Использованные источники', '# Тема']);

    const statusMatch = settings.match(/^\s*Статус:\s*(.+)\s*$/m);
    const passingScoreMatch = settings.match(/^\s*Проходной балл тестов:\s*(\d+)\s*$/m);
    const categoryMatch = settings.match(/^\s*Категория:\s*(.+)\s*$/m);

    const status = String(statusMatch?.[1] || '').trim().toLowerCase() === 'опубликован' ? 'published' : 'draft';
    const passingScore = Number.parseInt(passingScoreMatch?.[1] || '70', 10);
    const categoryNames = String(categoryMatch?.[1] || 'Для начинающих')
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);

    const topicSections = splitByHeading(source, '# Тема\\s+\\d+\\.');
    if (topicSections.length === 0) throw new Error('Не найдены темы курса');

    const topics = topicSections.map((topicSection, index) => {
        const topicTitleMatch = topicSection.match(/^#\s+Тема\s+\d+\.\s+(.+)\s*$/m);
        if (!topicTitleMatch) {
            throw new Error(`Не удалось прочитать заголовок темы #${index + 1}`);
        }
        const topicTitle = topicTitleMatch[1].trim();

        const topicText = extractBlock(topicSection, '## Текст темы', ['## Тест']).trim();
        const testBlock = extractBlock(topicSection, '## Тест', []);
        const questionBlocks = splitByHeading(testBlock, '### Вопрос\\s+\\d+');
        const questions = questionBlocks.map(parseQuizQuestion);
        const contentBlocks = parseTopicBlocks(topicText);

        return {
            title: topicTitle,
            content: topicText,
            contentBlocks,
            order: index,
            questions
        };
    });

    return {
        title,
        description,
        status,
        passingScore: Number.isFinite(passingScore) ? passingScore : 70,
        categoryNames,
        topics
    };
};

const resolveCategories = async (categoryNames) => {
    const ids = [];

    for (const name of categoryNames) {
        let category = await CourseCategory.findOne({ name });
        if (!category) {
            const last = await CourseCategory.findOne().sort({ order: -1, createdAt: -1 }).select('order');
            category = await CourseCategory.create({
                name,
                description: '',
                order: (last?.order || 0) + 1,
                isActive: true
            });
            console.log(`Создана категория: ${name}`);
        }
        ids.push(category._id);
    }

    return ids;
};

const run = async () => {
    const markdownPathArg = process.argv[2];
    const markdownPath = markdownPathArg
        ? path.resolve(process.cwd(), markdownPathArg)
        : DEFAULT_MARKDOWN_PATH;

    const fileContent = await fs.readFile(markdownPath, 'utf8');
    const parsed = parseCourseFromMarkdown(fileContent);

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI не задан в окружении');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    const categoryIds = await resolveCategories(parsed.categoryNames);

    const course = await Course.create({
        title: parsed.title,
        description: parsed.description,
        categoryId: categoryIds[0],
        categoryIds,
        ownerUserId: null,
        status: parsed.status,
        reviewStatus: 'not_required',
        order: 0,
        cover: '',
        isActive: true,
        isPinnedHome: false,
        pinnedHomeText: '',
        pinnedHomeMode: 'persistent'
    });

    console.log(`Создан курс: ${course.title} (${course._id})`);

    for (const topicData of parsed.topics) {
        const topic = await CourseTopic.create({
            courseId: course._id,
            title: topicData.title,
            content: topicData.content,
            contentBlocks: topicData.contentBlocks,
            order: topicData.order,
            status: parsed.status
        });

        await TopicQuiz.create({
            topicId: topic._id,
            passingScore: parsed.passingScore,
            questions: topicData.questions
        });

        console.log(`  - Тема создана: ${topic.title}`);
    }

    console.log(`Импорт завершен: ${parsed.topics.length} тем.`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Ошибка импорта курса:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore disconnect errors
    }
    process.exit(1);
});
