import Course from '../models/Course.js';
import CourseCategory from '../models/CourseCategory.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import UserWord from '../models/UserWord.js';
import { calculateDailyStreak, toDateKey } from './userProgress.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

export const getUserCourseAnalytics = async (userId) => {
    const [attempts, progresses, courses, categories, userWords] = await Promise.all([
        UserTopicAttempt.find({ userId }).sort({ createdAt: -1 }).lean(),
        UserCourseProgress.find({ userId }).lean(),
        Course.find({ status: 'published', isActive: true }).lean(),
        CourseCategory.find({ isActive: true }).lean(),
        UserWord.find({ user: userId }).select('learnedAt').lean()
    ]);

    const courseMap = new Map(courses.map((course) => [String(course._id), course]));
    const categoryMap = new Map(categories.map((category) => [String(category._id), category]));

    const knowledgeByCategory = new Map();

    let totalAnswers = 0;
    let totalCorrect = 0;

    for (const attempt of attempts) {
        const course = courseMap.get(String(attempt.courseId));
        if (!course) continue;
        const categoryId = String(course.categoryId);
        const categoryName = categoryMap.get(categoryId)?.name || 'Без категории';

        const bucket = knowledgeByCategory.get(categoryId) || {
            categoryId,
            categoryName,
            attempts: 0,
            answers: 0,
            correctAnswers: 0,
            accuracy: 0
        };

        const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
        const correctAnswers = answers.filter((answer) => answer.isCorrect).length;

        bucket.attempts += 1;
        bucket.answers += answers.length;
        bucket.correctAnswers += correctAnswers;

        totalAnswers += answers.length;
        totalCorrect += correctAnswers;

        knowledgeByCategory.set(categoryId, bucket);
    }

    const categoryStats = [...knowledgeByCategory.values()].map((item) => ({
        ...item,
        accuracy: item.answers > 0 ? clamp((item.correctAnswers / item.answers) * 100) : 0
    }));

    const completedCourses = progresses.filter((progress) => progress.completedAt).length;
    const activeCourses = new Set(progresses.map((progress) => String(progress.courseId))).size;

    const studyDateKeys = attempts
        .filter((attempt) => attempt.passed)
        .map((attempt) => toDateKey(attempt.createdAt))
        .filter(Boolean);

    const scanDateKeys = userWords
        .map((entry) => toDateKey(entry.learnedAt))
        .filter(Boolean);

    const uniqueStudyDates = [...new Set(studyDateKeys)];
    const uniqueScanDates = [...new Set(scanDateKeys)];

    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    const studyDays30 = uniqueStudyDates.filter((day) => now - new Date(`${day}T00:00:00.000Z`).getTime() <= 30 * msInDay).length;
    const studyDays7 = uniqueStudyDates.filter((day) => now - new Date(`${day}T00:00:00.000Z`).getTime() <= 7 * msInDay).length;
    const scanDays30 = uniqueScanDates.filter((day) => now - new Date(`${day}T00:00:00.000Z`).getTime() <= 30 * msInDay).length;
    const scanDays7 = uniqueScanDates.filter((day) => now - new Date(`${day}T00:00:00.000Z`).getTime() <= 7 * msInDay).length;

    const studyStreak = calculateDailyStreak(uniqueStudyDates);

    const disciplineScore = clamp(
        ((studyDays30 / 30) * 100) * 0.6 + (Math.min(studyStreak, 14) / 14) * 100 * 0.4
    );

    const motivationScore = clamp(
        ((scanDays30 / 30) * 100) * 0.7 + ((scanDays7 / 7) * 100) * 0.3
    );

    return {
        summary: {
            totalAttempts: attempts.length,
            totalAnswers,
            totalCorrect,
            overallAccuracy: totalAnswers > 0 ? clamp((totalCorrect / totalAnswers) * 100) : 0,
            activeCourses,
            completedCourses
        },
        knowledgeByCategory: categoryStats,
        discipline: {
            score: disciplineScore,
            studyStreak,
            studyDays7,
            studyDays30
        },
        motivation: {
            score: motivationScore,
            scanDays7,
            scanDays30
        }
    };
};
