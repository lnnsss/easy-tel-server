export default function userOnly(req, res, next) {
    if (req.user?.role === 'admin') {
        return res.status(403).json({ message: 'Доступ только для пользователей' });
    }
    return next();
}
