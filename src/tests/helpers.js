import { synthesizeSpeech, translateText } from '../controllers/translate.controller.js';

// Создает mock-объект response для тестов контроллеров.
export const makeRes = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(data) {
        this.payload = data;
        return this;
    }
});

// Вызывает translate-контроллер в тестовом окружении.
export const callTranslate = async (body) => {
    const req = { body, user: null };
    const res = makeRes();
    await translateText(req, res);
    return res;
};

// Вызывает TTS-контроллер в тестовом окружении.
export const callTts = async (body) => {
    const req = { body, user: null };
    const res = makeRes();
    await synthesizeSpeech(req, res);
    return res;
};

// Печатает заголовок тестового сценария в консоль.
export const printHeader = (title) => {
    console.log('='.repeat(72));
    console.log(title);
    console.log('='.repeat(72));
};

// Печатает результат отдельного тестового сценария.
export const printScenario = ({ input, expectedStatus, expectedMessage, actualStatus, actualPayload }) => {
    console.log('Input:');
    console.log(JSON.stringify(input, null, 2));
    console.log('\nExpected:');
    console.log(JSON.stringify({ status: expectedStatus, message: expectedMessage }, null, 2));
    console.log('\nActual:');
    console.log(JSON.stringify({ status: actualStatus, payload: actualPayload }, null, 2));
};
