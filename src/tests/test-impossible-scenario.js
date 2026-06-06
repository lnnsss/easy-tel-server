import assert from 'node:assert/strict';
import { callTts, printHeader, printScenario } from './helpers.js';

const input = { text: 'Сәлам', speaker: 'robot' };
const expectedStatus = 200;
const expectedMessage = 'Озвучка должна пройти даже с несуществующим голосом';

// Запускает сценарий проверки из командной строки.
const run = async () => {
    printHeader('TEST 3 (INTENTIONAL FAIL): accept unsupported TTS speaker');
    const res = await callTts(input);

    printScenario({
        input,
        expectedStatus,
        expectedMessage,
        actualStatus: res.statusCode,
        actualPayload: res.payload
    });

    assert.equal(
        res.statusCode,
        expectedStatus,
        `Intentional fail: expected status ${expectedStatus}, got ${res.statusCode}`
    );
    assert.equal(
        res.payload?.message,
        expectedMessage,
        'Intentional fail: this message is impossible for current validation rules'
    );
    console.log('\nRESULT: PASS (this line should not be reached)');
};

run().catch((err) => {
    console.log('\nRESULT: FAIL (expected for impossible scenario)');
    console.error(err?.message || err);
    process.exitCode = 1;
});
