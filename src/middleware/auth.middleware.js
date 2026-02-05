import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export default async function auth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ message: 'Нет токена' });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select('_id role');

        if (!user) {
            return res.status(401).json({ message: 'Пользователь не найден' });
        }

        // 👇 КЛЮЧЕВОЙ МОМЕНТ
        req.user = {
            id: user._id,
            role: user.role
        };

        next();
    } catch (err) {
        return res.status(401).json({ message: 'Неверный токен' });
    }
}
