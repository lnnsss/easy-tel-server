import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import User from '../models/User.js';
import Word from '../models/Word.js';
import UserWord from '../models/UserWord.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import Friendship from '../models/Friendship.js';
import FriendRequest from '../models/FriendRequest.js';
import { trackAchievementEvent } from '../services/achievements.service.js';
import { getRank } from '../utils/ranking.js';

const TARGET_USERS = 20;
const TOPIC_STUDY_POINTS = 3;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, size) => {
    const next = [...arr];
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next.slice(0, Math.max(0, Math.min(size, next.length)));
};
const chance = (value) => Math.random() < value;

const FIRST_NAMES = ['Алина', 'Ильдар', 'Лейсан', 'Тимур', 'Сафия', 'Руслан', 'Милана', 'Камиль', 'Элина', 'Артур', 'Ясмина', 'Данияр', 'Азалия', 'Ринат'];
const LAST_NAMES = ['Ахметова', 'Сафин', 'Нигматуллина', 'Гареев', 'Сулейманова', 'Гильманов', 'Закирова', 'Муртазин', 'Фатхутдинова', 'Юсупов'];

const makeReadablePassword = () => {
    const head = crypto.randomBytes(4).toString('hex');
    const tail = randomInt(10, 99);
    return `EasyTel_${head}${tail}`;
};

const makeReferralCode = () => `REF${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const dateDaysAgo = (daysAgo, jitterHours = 20) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(randomInt(1, jitterHours), randomInt(0, 59), randomInt(0, 59), 0);
    return d;
};

const buildLoginDays = (streakDays, extraDays = 0) => {
    const days = [];
    for (let i = streakDays - 1; i >= 0; i -= 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - i);
        days.push(date.toISOString().slice(0, 10));
    }
    for (let i = 0; i < extraDays; i += 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - randomInt(streakDays + 2, streakDays + 40));
        days.push(date.toISOString().slice(0, 10));
    }
    return [...new Set(days)].sort();
};

const buildWordAddDays = (wordsCount, streakDays) => {
    const days = [];
    const denseDays = Math.max(3, Math.min(streakDays, 10));
    for (let i = 0; i < wordsCount; i += 1) {
        const dayOffset = i < denseDays ? i : randomInt(0, Math.max(10, Math.ceil(wordsCount / 2)));
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - dayOffset);
        days.push(date.toISOString().slice(0, 10));
    }
    return [...new Set(days)].sort();
};

const buildTestDays = (attemptsCount, streakCandidate = 0) => {
    const days = [];
    const streakLen = Math.min(streakCandidate, 30);
    for (let i = 0; i < attemptsCount; i += 1) {
        const date = new Date();
        if (i < streakLen) {
            date.setUTCDate(date.getUTCDate() - i);
        } else {
            date.setUTCDate(date.getUTCDate() - randomInt(0, Math.max(20, attemptsCount)));
        }
        days.push(date.toISOString().slice(0, 10));
    }
    return [...new Set(days)].sort();
};

const ensureDb = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not set');
    }
    await mongoose.connect(process.env.MONGO_URI);
};

const createMissingUsers = async (existingUsers) => {
    const missing = TARGET_USERS - existingUsers.length;
    if (missing <= 0) return [];

    const created = [];
    const usedUsernames = new Set((await User.find().select('username').lean()).map((u) => String(u.username || '').toLowerCase()));
    const usedEmails = new Set((await User.find().select('email').lean()).map((u) => String(u.email || '').toLowerCase()));
    const usedReferralCodes = new Set((await User.find().select('referralCode').lean()).map((u) => String(u.referralCode || '').trim()).filter(Boolean));

    for (let i = 0; i < missing; i += 1) {
        let username = '';
        let email = '';
        let referralCode = '';

        while (!username || usedUsernames.has(username.toLowerCase())) {
            username = `user_${Date.now().toString(36)}_${randomInt(100, 999)}`;
        }
        while (!email || usedEmails.has(email.toLowerCase())) {
            email = `${username}@example.test`;
        }
        while (!referralCode || usedReferralCodes.has(referralCode)) {
            referralCode = makeReferralCode();
        }

        usedUsernames.add(username.toLowerCase());
        usedEmails.add(email.toLowerCase());
        usedReferralCodes.add(referralCode);

        const firstName = pick(FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const plainPassword = makeReadablePassword();
        const password = await bcrypt.hash(plainPassword, 10);

        const doc = await User.create({
            email,
            emailVerified: true,
            username,
            firstName,
            lastName,
            referralCode,
            password,
            role: 'user',
            lastLogin: dateDaysAgo(randomInt(0, 3))
        });

        created.push({ userId: String(doc._id), username: doc.username, email: doc.email, password: plainPassword });
    }

    return created;
};

const clearUserLearningState = async (userIds) => {
    await Promise.all([
        UserWord.deleteMany({ user: { $in: userIds } }),
        UserCourseProgress.deleteMany({ userId: { $in: userIds } }),
        UserTopicAttempt.deleteMany({ userId: { $in: userIds } }),
        Friendship.deleteMany({ $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }] }),
        FriendRequest.deleteMany({ $or: [{ fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }] })
    ]);

    await User.updateMany(
        { _id: { $in: userIds } },
        {
            $set: {
                dictionary: [],
                scanPoints: 0,
                studyPoints: 0,
                totalPoints: 0,
                coins: 0,
                rank: getRank(0),
                userAchievements: [],
                achievements: [],
                courseAchievements: [],
                streak: 0,
                lastStreakDate: null,
                achievementStats: {
                    releaseTrackedAt: new Date('2025-01-01T00:00:00.000Z'),
                    loginDays: [],
                    lastLoginDayKey: '',
                    wordAddDays: [],
                    testPassDays: [],
                    testsPassedCount: 0,
                    hardTestsCount: 0,
                    completedCoursesCount: 0,
                    coursePerfect: false,
                    courseOneDay: false,
                    cameBackAfterBreak: false,
                    profileCompleted: true,
                    avatarChanged: chance(0.5),
                    usedDarkTheme: chance(0.5),
                    usedTranslator: chance(0.8),
                    firstMessage: chance(0.6),
                    firstTts: chance(0.7)
                }
            }
        }
    );
};

const getContentPool = async () => {
    const [words, courses, topics, quizzes] = await Promise.all([
        Word.find({ isActive: true }).select('_id').lean(),
        Course.find({
            status: 'published',
            isActive: true,
            isRevision: { $ne: true },
            reviewStatus: { $in: ['not_required', 'approved', null] }
        }).select('_id title').lean(),
        CourseTopic.find({ status: 'published' }).select('_id courseId order createdAt').lean(),
        TopicQuiz.find().select('_id topicId questions passingScore').lean()
    ]);

    const quizByTopic = new Map(quizzes.map((q) => [String(q.topicId), q]));
    const topicsByCourse = new Map();

    for (const topic of topics) {
        if (!quizByTopic.has(String(topic._id))) continue;
        const key = String(topic.courseId);
        const list = topicsByCourse.get(key) || [];
        list.push(topic);
        topicsByCourse.set(key, list);
    }

    for (const list of topicsByCourse.values()) {
        list.sort((a, b) => (a.order - b.order) || (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    }

    const viableCourses = courses.filter((c) => (topicsByCourse.get(String(c._id)) || []).length > 0);

    return {
        words,
        viableCourses,
        topicsByCourse,
        quizByTopic
    };
};

const pickPersona = () => {
    const roll = Math.random();
    if (roll < 0.35) return { label: 'newbie', words: [6, 20], courses: [0, 1], streak: [1, 5], attempts: [3, 12] };
    if (roll < 0.75) return { label: 'regular', words: [20, 55], courses: [1, 2], streak: [4, 12], attempts: [8, 26] };
    return { label: 'active', words: [55, 100], courses: [1, 2], streak: [10, 35], attempts: [20, 45] };
};

const seedUserProgress = async (user, pool) => {
    const persona = pickPersona();
    const wordsCount = Math.min(pool.words.length, randomInt(persona.words[0], persona.words[1]));
    const coursesTarget = Math.min(pool.viableCourses.length, randomInt(persona.courses[0], persona.courses[1]));
    const streak = randomInt(persona.streak[0], persona.streak[1]);

    const pickedWords = sample(pool.words, wordsCount);
    const userWords = pickedWords.map((word, index) => ({
        user: user._id,
        word: word._id,
        learnedAt: dateDaysAgo(Math.max(0, Math.floor(index / 2) + randomInt(0, 6)))
    }));

    const insertedWords = userWords.length ? await UserWord.insertMany(userWords) : [];
    user.dictionary = insertedWords.map((item) => item._id);
    user.scanPoints = insertedWords.length;

    const selectedCourses = sample(pool.viableCourses, coursesTarget);
    let studyPointsFromTopics = 0;
    let totalPassedAttempts = 0;
    let hardPassedAttempts = 0;

    for (const course of selectedCourses) {
        const topics = pool.topicsByCourse.get(String(course._id)) || [];
        if (!topics.length) continue;

        const completeCourse = chance(persona.label === 'active' ? 0.75 : 0.45);
        const completedCount = completeCourse ? topics.length : randomInt(1, Math.max(1, topics.length - 1));
        const completedTopics = topics.slice(0, completedCount);
        const unlockedTopics = completeCourse
            ? topics.map((t) => t._id)
            : topics.slice(0, Math.min(topics.length, completedCount + 1)).map((t) => t._id);

        const startedAt = dateDaysAgo(randomInt(2, 45));
        const completedAt = completeCourse ? dateDaysAgo(randomInt(0, 10)) : null;

        await UserCourseProgress.create({
            userId: user._id,
            courseId: course._id,
            unlockedTopicIds: unlockedTopics,
            completedTopicIds: completedTopics.map((t) => t._id),
            completedAt,
            lastActivityAt: dateDaysAgo(randomInt(0, 7)),
            createdAt: startedAt,
            updatedAt: dateDaysAgo(randomInt(0, 5))
        });

        if (completeCourse) {
            user.courseAchievements.push({
                courseId: course._id,
                title: `Пройден курс: ${course.title}`,
                awardedAt: completedAt || new Date()
            });
            user.achievements.push(`Пройден курс: ${course.title}`);
        }

        for (const topic of completedTopics) {
            const quiz = pool.quizByTopic.get(String(topic._id));
            if (!quiz) continue;

            const attemptsForTopic = chance(0.4) ? 2 : 1;
            let passedInTopic = false;

            for (let attemptNo = 0; attemptNo < attemptsForTopic; attemptNo += 1) {
                const isLast = attemptNo === attemptsForTopic - 1;
                const passed = isLast ? true : chance(0.35);
                const scorePercent = passed
                    ? randomInt(persona.label === 'active' ? 82 : 70, 100)
                    : randomInt(35, 68);
                const awardedStudyPoints = (!passedInTopic && passed) ? TOPIC_STUDY_POINTS : 0;

                if (!passedInTopic && passed) {
                    passedInTopic = true;
                    studyPointsFromTopics += TOPIC_STUDY_POINTS;
                }

                if (passed) {
                    totalPassedAttempts += 1;
                    if (scorePercent >= 90) hardPassedAttempts += 1;
                }

                await UserTopicAttempt.create({
                    userId: user._id,
                    courseId: course._id,
                    topicId: topic._id,
                    quizId: quiz._id,
                    answers: [],
                    scorePercent,
                    passed,
                    awardedStudyPoints,
                    createdAt: dateDaysAgo(randomInt(0, 40)),
                    updatedAt: dateDaysAgo(randomInt(0, 20))
                });
            }
        }
    }

    const loginDays = buildLoginDays(streak, randomInt(2, 8));
    const wordAddDays = buildWordAddDays(user.dictionary.length, Math.min(streak, 10));
    const testPassDays = buildTestDays(totalPassedAttempts, Math.min(streak, 20));

    user.studyPoints = studyPointsFromTopics;
    user.totalPoints = user.scanPoints + user.studyPoints;
    user.rank = getRank(user.totalPoints);
    user.streak = streak;
    user.lastStreakDate = new Date(`${loginDays[loginDays.length - 1]}T12:00:00.000Z`);
    user.lastLogin = dateDaysAgo(randomInt(0, 2));

    user.achievementStats = {
        ...user.achievementStats,
        releaseTrackedAt: new Date('2025-01-01T00:00:00.000Z'),
        loginDays,
        lastLoginDayKey: loginDays[loginDays.length - 1] || '',
        wordAddDays,
        testPassDays,
        testsPassedCount: totalPassedAttempts,
        hardTestsCount: hardPassedAttempts,
        completedCoursesCount: user.courseAchievements.length,
        coursePerfect: chance(0.15),
        courseOneDay: chance(0.12),
        cameBackAfterBreak: chance(0.25),
        profileCompleted: true,
        avatarChanged: chance(0.5),
        usedDarkTheme: chance(0.5),
        usedTranslator: chance(0.8),
        firstMessage: chance(0.6),
        firstTts: chance(0.7)
    };

    await user.save();

    // Single event recomputes progress map and unlocks/rewards all eligible achievements.
    await trackAchievementEvent({ userId: user._id, eventType: 'login' });

    const refreshed = await User.findById(user._id).select('scanPoints studyPoints totalPoints rank coins dictionary userAchievements courseAchievements achievementStats');
    return {
        words: refreshed?.dictionary?.length || 0,
        testsPassed: refreshed?.achievementStats?.testsPassedCount || 0,
        coursesCompleted: refreshed?.courseAchievements?.length || 0,
        achievementsUnlocked: (refreshed?.userAchievements || []).filter((x) => x?.unlockedAt).length,
        totalPoints: refreshed?.totalPoints || 0,
        rank: refreshed?.rank || getRank(0),
        coins: refreshed?.coins || 0
    };
};

const seedFriendships = async (users) => {
    const ids = users.map((u) => String(u._id));
    const edges = new Set();

    const makeKey = (a, b) => {
        const x = String(a);
        const y = String(b);
        return x < y ? `${x}|${y}` : `${y}|${x}`;
    };

    for (const user of users) {
        const target = chance(0.7) ? randomInt(1, 4) : 0;
        const others = ids.filter((id) => id !== String(user._id));
        const chosen = sample(others, target);
        for (const otherId of chosen) {
            edges.add(makeKey(user._id, otherId));
        }
    }

    if (!edges.size) return { friendships: 0, requests: 0 };

    const friendshipDocs = [...edges].map((edge) => {
        const [a, b] = edge.split('|');
        return { userA: a, userB: b };
    });
    await Friendship.insertMany(friendshipDocs, { ordered: false });

    const pendingCount = Math.min(randomInt(2, 8), Math.floor(ids.length / 2));
    const pendingRequests = [];

    for (let i = 0; i < pendingCount; i += 1) {
        const from = pick(ids);
        const to = pick(ids.filter((id) => id !== from));
        const key = makeKey(from, to);
        if (edges.has(key)) continue;
        pendingRequests.push({
            fromUserId: from,
            toUserId: to,
            status: 'pending',
            createdAt: dateDaysAgo(randomInt(0, 7)),
            updatedAt: dateDaysAgo(randomInt(0, 3))
        });
    }

    if (pendingRequests.length) {
        await FriendRequest.insertMany(pendingRequests, { ordered: false });
    }

    return { friendships: friendshipDocs.length, requests: pendingRequests.length };
};

const main = async () => {
    await ensureDb();

    const existingUsers = await User.find({ role: 'user' }).sort({ createdAt: 1 });
    if (existingUsers.length > TARGET_USERS) {
        throw new Error(`Сейчас role=user уже больше цели: ${existingUsers.length}. Скрипт не удаляет пользователей.`);
    }

    const createdUsers = await createMissingUsers(existingUsers);
    const users = await User.find({ role: 'user' }).sort({ createdAt: 1 });

    if (users.length !== TARGET_USERS) {
        throw new Error(`Ожидалось ${TARGET_USERS} role=user, получили ${users.length}`);
    }

    const userIds = users.map((u) => u._id);
    await clearUserLearningState(userIds);

    const pool = await getContentPool();
    if (!pool.words.length) {
        throw new Error('В базе нет активных слов для генерации словаря.');
    }
    if (!pool.viableCourses.length) {
        throw new Error('Нет опубликованных курсов с темами и квизами.');
    }

    const metrics = new Map();
    for (const user of await User.find({ role: 'user' })) {
        const info = await seedUserProgress(user, pool);
        metrics.set(String(user._id), info);
    }

    const friendshipStats = await seedFriendships(await User.find({ role: 'user' }).select('_id'));

    const finalUsers = await User.find({ role: 'user' }).select('_id username email');
    const createdById = new Map(createdUsers.map((u) => [u.userId, u]));

    const credentials = finalUsers
        .map((u) => {
            const created = createdById.get(String(u._id));
            return {
                username: u.username,
                email: u.email,
                password: created ? created.password : '<unknown>',
                isNew: Boolean(created),
                ...(metrics.get(String(u._id)) || {})
            };
        })
        .sort((a, b) => a.username.localeCompare(b.username, 'ru'));

    console.log(JSON.stringify({
        summary: {
            targetUsers: TARGET_USERS,
            totalUsers: finalUsers.length,
            createdNow: createdUsers.length,
            friendships: friendshipStats.friendships,
            pendingFriendRequests: friendshipStats.requests
        },
        credentials
    }, null, 2));
};

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
