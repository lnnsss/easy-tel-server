import User from '../models/User.js';
import UserWord from '../models/UserWord.js';
import UserCourseProgress from '../models/UserCourseProgress.js';
import UserTopicAttempt from '../models/UserTopicAttempt.js';

export const getUsers = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
        const search = String(req.query.search || '').trim();

        const query = { role: { $ne: 'admin' } };
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } }
            ];
        }

        const totalItems = await User.countDocuments(query);
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        const users = await User.find(query)
            .select('_id email username firstName lastName rank totalPoints createdAt')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const userIds = users.map((user) => user._id);
        const wordStats = await UserWord.aggregate([
            { $match: { user: { $in: userIds } } },
            { $group: { _id: '$user', wordsCount: { $sum: 1 } } }
        ]);

        const wordsCountMap = new Map(wordStats.map((item) => [String(item._id), item.wordsCount]));

        const payload = users.map((user) => ({
            ...user,
            wordsCount: wordsCountMap.get(String(user._id)) || 0
        }));

        return res.json({
            users: payload,
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
