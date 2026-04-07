import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export default async function seedAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminFirstName = process.env.ADMIN_FIRST_NAME;
    const adminLastName = process.env.ADMIN_LAST_NAME;

    if (!adminEmail || !adminPassword || !adminUsername || !adminFirstName || !adminLastName) {
        console.warn('Создание администратора пропущено: заполните ADMIN_* переменные в .env');
        return;
    }

    const exists = await User.findOne({ email: adminEmail });
    if (exists) {
        console.log('Администратор уже существует');
        return;
    }

    const hash = await bcrypt.hash(adminPassword, 10);

    await User.create({
        email: adminEmail,
        password: hash,
        username: adminUsername,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: 'admin'
    });

    console.log(`Администратор создан: ${adminEmail}`);
}
