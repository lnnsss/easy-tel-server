import jwt from 'jsonwebtoken';

export default function optionalAuth(req, _res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id };
        return next();
    } catch {
        return next();
    }
}
