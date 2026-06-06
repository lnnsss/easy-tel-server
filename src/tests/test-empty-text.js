import assert from 'node:assert/strict';
import { callTranslate, printHeader, printScenario } from './helpers.js';

const input = { direction: 'rus2tat', text: '\n\t   \t\n' };
const expectedStatus = 400;
const expectedMessage = 'Исходный текст обязателен';

// Запускает сценарий проверки из командной строки.
const run = async () => {
    printHeader('TEST 2: empty source text should return 400');
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
    assert.ok(
        !('meta' in (res.payload || {})),
        'Validation response must not include "meta" because translation did not run'
    );
    console.log('\nRESULT: PASS');
};

run().catch((err) => {
    console.log('\nRESULT: FAIL');
    console.error(err?.message || err);
    process.exitCode = 1;
});
