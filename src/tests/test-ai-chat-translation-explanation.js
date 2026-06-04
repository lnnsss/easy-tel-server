import assert from 'node:assert/strict';
import { buildTranslationExplanation, formatTranslationReply } from '../controllers/aiChat.controller.js';
import { printHeader } from './helpers.js';

const run = () => {
    printHeader('TEST 4: AI chat explanation should match verified translation');

    const loveExplanation = buildTranslationExplanation({
        sourceText: 'мама я тебя люблю',
        translatedText: 'Әни мин сине яратам',
        direction: 'rus2tat',
        userText: 'объясни как по-татарски "мама я тебя люблю"'
    });

    console.log('Love explanation:');
    console.log(loveExplanation);

    assert.match(loveExplanation, /«Әни» — «мама»/i, 'Explanation should explain "Әни" as "мама"');
    assert.match(loveExplanation, /«мин» — «я»/i, 'Explanation should explain "мин" as "я"');
    assert.match(loveExplanation, /«сине» — «тебя»/i, 'Explanation should explain "сине" as "тебя"');
    assert.match(loveExplanation, /«яратам» — «люблю»/i, 'Explanation should explain "яратам" as "люблю"');
    assert.doesNotMatch(loveExplanation, /абба|көрсөтелгән|көрсөтүлгөн|жаныштас|женештас/i, 'Explanation should not include unrelated hallucinated forms');

    const riverExplanation = buildTranslationExplanation({
        sourceText: 'мы с друзьями поехали на речку',
        translatedText: 'без дуслар белән елга буена киттек',
        direction: 'rus2tat',
        userText: 'поясни перевод "мы с друзьями поехали на речку"'
    });

    console.log('\nRiver explanation:');
    console.log(riverExplanation);

    assert.match(riverExplanation, /«без» — «мы»/i, 'Explanation should explain "без" as "мы"');
    assert.match(riverExplanation, /«дуслар белән» — «с друзьями»/i, 'Explanation should explain "дуслар белән"');
    assert.match(riverExplanation, /«елга буена» — «на речку \/ к берегу реки»/i, 'Explanation should explain "елга буена"');
    assert.match(riverExplanation, /«киттек» — «поехали \/ отправились»/i, 'Explanation should explain "киттек"');
    assert.match(riverExplanation, /сказуемое часто стоит в конце/i, 'Explanation should include a useful word-order note');
    assert.match(riverExplanation, /^Разбор перевода:\n«без» — «мы»,\n«дуслар белән» — «с друзьями»,/i, 'Explanation should be formatted across lines');

    const formattedReply = formatTranslationReply({
        sourceText: 'мы с друзьями поехали на речку',
        translatedText: 'без дуслар белән елга буена киттек',
        direction: 'rus2tat',
        explanation: riverExplanation
    });

    console.log('\nFormatted reply:');
    console.log(formattedReply);

    assert.match(formattedReply, /^Перевод: «Мы с друзьями поехали на речку» по-татарски/m, 'Reply should capitalize the source phrase');
    assert.doesNotMatch(formattedReply, /Пояснение:/, 'Reply should not add an extra "Пояснение" label before the structured breakdown');

    console.log('\nRESULT: PASS');
};

try {
    run();
} catch (err) {
    console.log('\nRESULT: FAIL');
    console.error(err?.message || err);
    process.exitCode = 1;
}
