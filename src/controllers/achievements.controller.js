import User from '../models/User.js';

export const getAchievements = async (req, res) => {
    const user = await User.findById(req.user.id);
    res.json(user.achievements);
};
