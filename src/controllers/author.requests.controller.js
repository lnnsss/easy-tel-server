import AuthorRoleRequest from '../models/AuthorRoleRequest.js';
import User from '../models/User.js';
import { sendAuthorRoleDecisionEmail } from '../services/mailer.js';

const EDUCATION_LEVELS = [
    'secondary',
    'college',
    'bachelor',
    'master_specialist',
    'phd',
    'other'
];
const TATAR_LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'native'];
const TEACHING_LEVELS = ['epg_phase_1', 'epg_phase_2', 'epg_phase_3', 'epg_phase_4', 'epg_phase_5', 'epg_phase_6'];

const normalizeStr = (value, max = 1000) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createAuthorRequest = async (req, res) => {
    try {
        if (req.user?.role === 'admin') {
            return res.status(403).json({ message: 'Администратору заявка не требуется' });
        }
        if (req.user?.role === 'author') {
            return res.status(400).json({ message: 'У вас уже есть роль автора' });
        }

        const educationLevel = normalizeStr(req.body.educationLevel, 64);
        const educationDetails = normalizeStr(req.body.educationDetails, 500);
        const contactEmail = normalizeEmail(req.body.contactEmail);
        const tatarLevel = normalizeStr(req.body.tatarLevel, 32);
        const teachingLevel = normalizeStr(req.body.teachingLevel, 32);
        const motivation = normalizeStr(req.body.motivation, 3000);

        if (!EDUCATION_LEVELS.includes(educationLevel)) {
            return res.status(400).json({ message: 'Некорректный уровень образования' });
        }
        if (!TATAR_LEVELS.includes(tatarLevel)) {
            return res.status(400).json({ message: 'Некорректный уровень татарского языка' });
        }
        if (!TEACHING_LEVELS.includes(teachingLevel)) {
            return res.status(400).json({ message: 'Некорректный уровень преподавания' });
        }
        if (contactEmail && !isValidEmail(contactEmail)) {
            return res.status(400).json({ message: 'Некорректная почта для связи' });
        }
        if (!motivation || motivation.length < 20) {
            return res.status(400).json({ message: 'Опишите мотивацию подробнее (минимум 20 символов)' });
        }

        const existingPending = await AuthorRoleRequest.findOne({
            userId: req.user.id,
            status: 'pending'
        }).select('_id');
        if (existingPending) {
            return res.status(409).json({ message: 'У вас уже есть заявка на рассмотрении' });
        }

        const created = await AuthorRoleRequest.create({
            userId: req.user.id,
            educationLevel,
            educationDetails,
            contactEmail,
            tatarLevel,
            teachingLevel,
            motivation,
            status: 'pending'
        });

        return res.status(201).json({
            request: created
        });
    } catch (err) {
        console.error('createAuthorRequest error', err);
        return res.status(500).json({ message: 'Ошибка создания заявки' });
    }
};

export const getMyAuthorRequest = async (req, res) => {
    try {
        const request = await AuthorRoleRequest.findOne({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            request: request || null
        });
    } catch (err) {
        console.error('getMyAuthorRequest error', err);
        return res.status(500).json({ message: 'Ошибка загрузки заявки' });
    }
};

export const markAuthorDecisionSeen = async (req, res) => {
    try {
        const request = await AuthorRoleRequest.findOne({
            _id: req.params.id,
            userId: req.user.id
        });

        if (!request) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        if (request.status === 'pending') {
            return res.status(400).json({ message: 'Решение по заявке еще не принято' });
        }

        if (!request.decisionSeenAt) {
            request.decisionSeenAt = new Date();
            await request.save();
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('markAuthorDecisionSeen error', err);
        return res.status(500).json({ message: 'Ошибка обновления статуса просмотра' });
    }
};

export const getAdminAuthorRequests = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const status = normalizeStr(req.query.status, 32);
        const search = normalizeStr(req.query.search, 120);
        const query = {};
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            query.status = status;
        }

        if (search) {
            const users = await User.find({
                $or: [
                    { email: { $regex: escapeRegex(search), $options: 'i' } },
                    { username: { $regex: escapeRegex(search), $options: 'i' } },
                    { firstName: { $regex: escapeRegex(search), $options: 'i' } },
                    { lastName: { $regex: escapeRegex(search), $options: 'i' } }
                ]
            }).select('_id').lean();
            query.userId = { $in: users.map((item) => item._id) };
        }

        const totalItems = await AuthorRoleRequest.countDocuments(query);
        const items = await AuthorRoleRequest.find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', '_id firstName lastName username email role')
            .populate('reviewedBy', '_id firstName lastName username')
            .lean();

        return res.json({
            items,
            totalItems,
            totalPages: Math.max(Math.ceil(totalItems / limit), 1),
            currentPage: page
        });
    } catch (err) {
        console.error('getAdminAuthorRequests error', err);
        return res.status(500).json({ message: 'Ошибка загрузки заявок' });
    }
};

export const reviewAuthorRequest = async (req, res) => {
    try {
        const decision = normalizeStr(req.body.decision, 32);
        const adminComment = normalizeStr(req.body.adminComment, 2000);
        if (decision !== 'approved' && decision !== 'rejected') {
            return res.status(400).json({ message: 'Решение должно быть approved или rejected' });
        }

        const request = await AuthorRoleRequest.findById(req.params.id).populate('userId', '_id email firstName role');
        if (!request) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Заявка уже рассмотрена' });
        }

        request.status = decision;
        request.adminComment = adminComment;
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        request.decisionSeenAt = null;
        await request.save();

        if (decision === 'approved' && request.userId) {
            await User.findByIdAndUpdate(request.userId._id, { role: 'author' });
        }

        const emailTo = normalizeEmail(request.contactEmail || request.userId?.email || '');
        if (emailTo) {
            sendAuthorRoleDecisionEmail({
                to: emailTo,
                firstName: request.userId.firstName,
                decision,
                adminComment
            }).catch((mailErr) => {
                console.error('sendAuthorRoleDecisionEmail error', mailErr);
            });
        }

        return res.json({
            message: decision === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена'
        });
    } catch (err) {
        console.error('reviewAuthorRequest error', err);
        return res.status(500).json({ message: 'Ошибка рассмотрения заявки' });
    }
};
