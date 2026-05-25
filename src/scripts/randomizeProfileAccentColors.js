import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { pickRandomProfileAccentColor } from '../utils/profileAccentColor.js';

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not set');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find({}).select('_id').lean();
    if (!users.length) {
        console.log('No users found');
        return;
    }

    const ops = users.map((user) => ({
        updateOne: {
            filter: { _id: user._id },
            update: { $set: { profileAccentColor: pickRandomProfileAccentColor() } }
        }
    }));

    const result = await User.bulkWrite(ops, { ordered: false });
    console.log(
        JSON.stringify(
            {
                totalUsers: users.length,
                modified: Number(result?.modifiedCount || 0)
            },
            null,
            2
        )
    );
};

run()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });

