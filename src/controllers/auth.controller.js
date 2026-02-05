import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const register = async (req, res) => {
    try {
        const {
            email,
            password,
            username,
            firstName,
            lastName
        } = req.body;

        if (!email || !password || !username || !firstName || !lastName) {
            return res.status(400).json({
                message: 'Заполните все поля'
            });
        }

        const exists = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (exists) {
            return res.status(400).json({
                message: 'Пользователь с таким email или username уже существует'
            });
        }

        const hash = await bcrypt.hash(password, 10);

        await User.create({
            email,
            password: hash,
            username,
            firstName,
            lastName,
            role: 'user'
        });

        res.json({ message: 'Регистрация успешна' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка регистрации' });
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: 'Неверные данные' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Неверные данные' });
    }

    const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({ token });
};

export const profile = async (req, res) => {
    const user = await User.findById(req.user.id)
        .select('-password')
        .populate({
            path: 'dictionary',
            populate: { path: 'word' }
        });

    res.json(user);
};
