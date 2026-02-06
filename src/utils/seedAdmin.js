import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export default async function seedAdmin() {
    const adminEmail = 'admin@gmail.com';

    const exists = await User.findOne({ email: adminEmail });
    if (exists) {
        console.log('Администратор уже существует');
        return;
    }

    const hash = await bcrypt.hash('admin123', 10);

    await User.create({
        email: adminEmail,
        password: hash,
        username: 'admin',
        firstName: 'Admin',
        lastName: 'System',
        role: 'admin'
    });

    console.log('Администратор создан: admin@gmail.com / admin123');
}
