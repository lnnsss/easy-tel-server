export default function author(req, res, next) {
    if (req.user?.role !== 'author') {
        return res.status(403).json({
            message: 'Доступ только для авторов'
        });
    }

    next();
}
