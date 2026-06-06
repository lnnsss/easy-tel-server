import assert from 'node:assert/strict';
import { callTranslate, printHeader, printScenario } from './helpers.js';

const input = { direction: 'bad-direction', text: '   привет   ' };
const expectedStatus = 400;
const expectedMessage = 'Некорректное направление перевода';

// Запускает сценарий проверки из командной строки.
const run = async () => {
    printHeader('TEST 1: invalid direction should return 400');
    const res = await callTranslate(input);

    printScenario({
        input,
        expectedStatus,
        expectedMessage,
        actualStatus: res.statusCode,
        actualPayload: res.payload
    });

    assert.equal(res.statusCode, expectedStatus, `Expected status ${expectedStatus}, got ${res.statusCode}`);
    assert.equal(res.payload?.message, expectedMessage, `Expected message "${expectedMessage}", got "${res.payload?.message}"`);
    assert.deepEqual(
        Object.keys(res.payload || {}).sort(),
        ['message'],
        'Validation error contract should contain only "message" field'
    );
    console.log('\nRESULT: PASS');
};

run().catch((err) => {
    console.log('\nRESULT: FAIL');
    console.error(err?.message || err);
    process.exitCode = 1;
});
