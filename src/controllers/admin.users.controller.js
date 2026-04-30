import User from '../models/User.js';
import UserWord from '../models/UserWord.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';
import Course from '../models/Course.js';
import CourseTopic from '../models/CourseTopic.js';
import TopicQuiz from '../models/TopicQuiz.js';
import AuthorRoleRequest from '../models/AuthorRoleRequest.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSortField = (value) => {
    if (value === 'totalPoints') return 'totalPoints';
    if (value === 'latestRequestAt') return 'latestRequestAt';
    return 'createdAt';
};

const normalizeSortOrder = (value) => (String(value || '').toLowerCase() === 'asc' ? 1 : -1);

export const getUsers = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
        const search = String(req.query.search || '').trim();
        const role = String(req.query.role || '').trim();
        const authorRequestStatus = String(req.query.authorRequestStatus || '').trim();
        const hasCoursesRaw = String(req.query.hasCourses || '').trim().toLowerCase();
        const createdFrom = req.query.registrationDateFrom ? new Date(req.query.registrationDateFrom) : null;
        const createdTo = req.query.registrationDateTo ? new Date(req.query.registrationDateTo) : null;
        const minPoints = Number.isFinite(Number(req.query.minPoints)) ? Number(req.query.minPoints) : null;
        const maxPoints = Number.isFinite(Number(req.query.maxPoints)) ? Number(req.query.maxPoints) : null;
        const sortBy = normalizeSortField(req.query.sortBy);
        const sortOrder = normalizeSortOrder(req.query.sortOrder);

        const query = {};
        if (role === 'user' || role === 'author' || role === 'admin') {
            query.role = role;
        }

        if (search) {
            query.$or = [
                { email: { $regex: escapeRegex(search), $options: 'i' } },
                { username: { $regex: escapeRegex(search), $options: 'i' } },
                { firstName: { $regex: escapeRegex(search), $options: 'i' } },
                { lastName: { $regex: escapeRegex(search), $options: 'i' } }
            ];
        }
        if (createdFrom || createdTo) {
            query.createdAt = {};
            if (createdFrom && !Number.isNaN(createdFrom.getTime())) query.createdAt.$gte = createdFrom;
            if (createdTo && !Number.isNaN(createdTo.getTime())) {
                const inclusiveTo = new Date(createdTo);
                inclusiveTo.setHours(23, 59, 59, 999);
                query.createdAt.$lte = inclusiveTo;
            }
            if (Object.keys(query.createdAt).length === 0) {
                delete query.createdAt;
            }
        }
        if (minPoints !== null || maxPoints !== null) {
            query.totalPoints = {};
            if (minPoints !== null) query.totalPoints.$gte = minPoints;
            if (maxPoints !== null) query.totalPoints.$lte = maxPoints;
        }

        const users = await User.find(query)
            .select('_id email username firstName lastName rank totalPoints createdAt role')
            .sort({ createdAt: -1, _id: -1 })
            .lean();

        const userIds = users.map((user) => user._id);
        const [wordStats, coursesStats, latestRequests] = await Promise.all([
            UserWord.aggregate([
                { $match: { user: { $in: userIds } } },
                { $group: { _id: '$user', wordsCount: { $sum: 1 } } }
            ]),
            Course.aggregate([
                {
                    $match: {
                        ownerUserId: { $in: userIds },
                        isRevision: { $ne: true }
                    }
                },
                { $group: { _id: '$ownerUserId', coursesCount: { $sum: 1 } } }
            ]),
            AuthorRoleRequest.aggregate([
                { $match: { userId: { $in: userIds } } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$userId',
                        requestId: { $first: '$_id' },
                        status: { $first: '$status' },
                        updatedAt: { $first: '$updatedAt' },
                        createdAt: { $first: '$createdAt' },
                        reviewedAt: { $first: '$reviewedAt' },
                        adminComment: { $first: '$adminComment' }
                    }
                }
            ])
        ]);

        const wordsCountMap = new Map(wordStats.map((item) => [String(item._id), item.wordsCount]));
        const coursesCountMap = new Map(coursesStats.map((item) => [String(item._id), item.coursesCount]));
        const latestRequestMap = new Map(latestRequests.map((item) => [String(item._id), item]));

        let payload = users.map((user) => ({
            ...user,
            wordsCount: wordsCountMap.get(String(user._id)) || 0,
            coursesCount: coursesCountMap.get(String(user._id)) || 0,
            latestAuthorRequest: latestRequestMap.get(String(user._id)) || null
        }));

        if (authorRequestStatus) {
            payload = payload.filter((user) => {
                if (authorRequestStatus === 'none') return !user.latestAuthorRequest;
                if (authorRequestStatus === 'pending' || authorRequestStatus === 'approved' || authorRequestStatus === 'rejected') {
                    return user.latestAuthorRequest?.status === authorRequestStatus;
                }
                return true;
            });
        }

        if (hasCoursesRaw === 'true' || hasCoursesRaw === 'false') {
            const wantsCourses = hasCoursesRaw === 'true';
            payload = payload.filter((user) => wantsCourses ? user.coursesCount > 0 : user.coursesCount === 0);
        }

        payload.sort((a, b) => {
            let aValue;
            let bValue;
            if (sortBy === 'totalPoints') {
                aValue = Number(a.totalPoints) || 0;
                bValue = Number(b.totalPoints) || 0;
            } else if (sortBy === 'latestRequestAt') {
                aValue = a.latestAuthorRequest?.updatedAt ? new Date(a.latestAuthorRequest.updatedAt).getTime() : 0;
                bValue = b.latestAuthorRequest?.updatedAt ? new Date(b.latestAuthorRequest.updatedAt).getTime() : 0;
            } else {
                aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            }

            if (aValue === bValue) return 0;
            return aValue > bValue ? sortOrder : -sortOrder;
        });

        const totalItems = payload.length;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedPayload = payload.slice(start, end);

        return res.json({
            users: pagedPayload,
            totalPages,
            currentPage: page,
            totalItems
        });
    } catch (err) {
        console.error('getUsers error', err);
        return res.status(500).json({ message: 'Ошибка загрузки пользователей' });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (String(req.user.id) === String(id)) {
            return res.status(400).json({ message: 'Нельзя удалить текущего администратора' });
        }

        const user = await User.findById(id).select('_id role');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        if (user.role === 'admin') {
            return res.status(403).json({ message: 'Удаление администратора запрещено' });
        }

        const courses = await Course.find({ ownerUserId: id }).select('_id');
        const courseIds = courses.map((course) => course._id);
        const topics = await CourseTopic.find({ courseId: { $in: courseIds } }).select('_id');
        const topicIds = topics.map((topic) => topic._id);

        await TopicQuiz.deleteMany({ topicId: { $in: topicIds } });
        await CourseTopic.deleteMany({ courseId: { $in: courseIds } });
        await Course.deleteMany({ ownerUserId: id });
        await AuthorRoleRequest.deleteMany({ userId: id });
        await UserWord.deleteMany({ user: id });
        await UserCourseProgress.deleteMany({ userId: id });
        await UserTopicAttempt.deleteMany({ userId: id });
        await User.findByIdAndDelete(id);

        return res.json({ message: 'Пользователь удалён' });
    } catch (err) {
        console.error('deleteUser error', err);
        return res.status(500).json({ message: 'Ошибка удаления пользователя' });
    }
};

export const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const role = String(req.body.role || '').trim();

        if (role !== 'user' && role !== 'author' && role !== 'admin') {
            return res.status(400).json({ message: 'Допустимые роли: user, author или admin' });
        }

        if (String(req.user.id) === String(id)) {
            return res.status(400).json({ message: 'Нельзя изменить роль текущего администратора' });
        }

        const user = await User.findById(id).select('_id role');
        if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

        const previousRole = user.role;
        if (previousRole === 'admin' && role !== 'admin') {
            const adminsCount = await User.countDocuments({ role: 'admin' });
            if (adminsCount <= 1) {
                return res.status(400).json({ message: 'Нельзя снять роль последнего администратора' });
            }
        }

        user.role = role;
        await user.save();

        if (previousRole === 'author' && role === 'user') {
            await AuthorRoleRequest.findOneAndUpdate(
                { userId: user._id, status: 'approved' },
                {
                    status: 'rejected',
                    adminComment: 'Роль автора снята администратором.',
                    reviewedBy: req.user.id,
                    reviewedAt: new Date(),
                    decisionSeenAt: null
                },
                { sort: { createdAt: -1 } }
            );
        }

        return res.json({ message: 'Роль пользователя обновлена' });
    } catch (err) {
        console.error('updateUserRole error', err);
        return res.status(500).json({ message: 'Ошибка смены роли пользователя' });
    }
};
