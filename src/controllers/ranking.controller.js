import User from '../models/User.js';

export const getTopRanking = async (_, res) => {
    const users = await User.find()
        .sort({ dictionary: -1 })
        .limit(10)
        .select('email rank dictionary');

    res.json(users);
};

export const getUserRank = async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json({ rank: user.rank });
};
