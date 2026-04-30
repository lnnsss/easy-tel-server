import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    return transporter;
};

const sendMail = async ({ to, subject, html }) => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
        throw new Error('SMTP variables are not configured');
    }

    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        html
    });
};

export const sendVerificationCodeEmail = async ({ to, code }) => {
    await sendMail({
        to,
        subject: 'EasyTel: подтверждение почты',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Подтверждение почты</h2>
                <p>Ваш код подтверждения:</p>
                <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
                <p>Код действует 15 минут.</p>
            </div>
        `
    });
};

export const sendPasswordResetEmail = async ({ to, resetLink }) => {
    await sendMail({
        to,
        subject: 'EasyTel: сброс пароля',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Сброс пароля</h2>
                <p>Чтобы задать новый пароль, перейдите по ссылке:</p>
                <p><a href="${resetLink}">${resetLink}</a></p>
                <p>Ссылка действует 15 минут.</p>
                <p>Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>
            </div>
        `
    });
};

export const sendAuthorRoleDecisionEmail = async ({
    to,
    firstName = '',
    decision = 'rejected',
    adminComment = ''
}) => {
    const approved = decision === 'approved';
    const greetingName = String(firstName || '').trim() || 'пользователь';
    const title = approved ? 'Заявка на авторство одобрена' : 'Заявка на авторство отклонена';
    const mainText = approved
        ? 'Поздравляем, вам выдана роль автора курсов в EasyTel.'
        : 'К сожалению, ваша заявка на роль автора курсов пока отклонена.';

    await sendMail({
        to,
        subject: `EasyTel: ${title}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>${title}</h2>
                <p>Здравствуйте, ${greetingName}.</p>
                <p>${mainText}</p>
                ${adminComment ? `<p><strong>Комментарий администратора:</strong> ${adminComment}</p>` : ''}
                <p>Вы можете открыть EasyTel, чтобы увидеть актуальный статус заявки.</p>
            </div>
        `
    });
};

export const sendCourseReviewDecisionEmail = async ({
    to,
    firstName = '',
    decision = 'rejected',
    courseTitle = '',
    adminComment = ''
}) => {
    const approved = decision === 'approved';
    const greetingName = String(firstName || '').trim() || 'пользователь';
    const safeCourseTitle = String(courseTitle || '').trim() || 'Ваш курс';
    const title = approved ? 'Курс одобрен' : 'Курс отклонен';
    const mainText = approved
        ? `Курс "${safeCourseTitle}" (или его изменения) успешно прошел модерацию и опубликован.`
        : `Курс "${safeCourseTitle}" (или его изменения) не прошел модерацию.`;

    await sendMail({
        to,
        subject: `EasyTel: ${title}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>${title}</h2>
                <p>Здравствуйте, ${greetingName}.</p>
                <p>${mainText}</p>
                ${adminComment ? `<p><strong>Комментарий администратора:</strong> ${adminComment}</p>` : ''}
                <p>Откройте кабинет автора в EasyTel, чтобы посмотреть актуальный статус курса.</p>
            </div>
        `
    });
};
