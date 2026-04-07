export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NAME_REGEX = /^\p{L}+$/u;
export const USERNAME_ALLOWED_REGEX = /^[A-Za-z0-9]+$/;
export const USERNAME_HAS_LETTER_REGEX = /[A-Za-z]/;
export const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/;
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export const normalizeName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return trimmed;
    return trimmed[0].toLocaleUpperCase('ru-RU') + trimmed.slice(1).toLocaleLowerCase('ru-RU');
};

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const validateName = (value) => {
    if (value.length < 3) return 'Имя и фамилия должны содержать минимум 3 символа';
    if (!NAME_REGEX.test(value)) return 'Имя и фамилия должны содержать только буквы';
    return null;
};

export const validateUsername = (value) => {
    if (value.length < 3) return 'Username должен содержать минимум 3 символа';
    if (!USERNAME_ALLOWED_REGEX.test(value) || !USERNAME_HAS_LETTER_REGEX.test(value)) {
        return 'Username должен содержать только английские буквы и цифры, и минимум одну букву';
    }
    return null;
};

export const validateEmail = (value) => {
    if (!EMAIL_REGEX.test(value)) return 'Некорректный email';
    return null;
};

export const validatePassword = (password) => {
    if (password.length < 8) return 'Пароль должен содержать минимум 8 символов';
    if (!PASSWORD_ALLOWED_REGEX.test(password)) {
        return 'Пароль может содержать только английские буквы, цифры и спецсимволы';
    }
    if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
        return 'Пароль должен содержать заглавные и строчные английские буквы, цифру и спецсимвол';
    }
    return null;
};

