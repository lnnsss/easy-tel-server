export default function authorOrAdmin(req, res, next) {
    if (req.user?.role !== 'author' && req.user?.role !== 'admin') {
        return res.status(403).json({
            message: 'Доступ только для автора или администратора'
        });
    }

    next();
}
