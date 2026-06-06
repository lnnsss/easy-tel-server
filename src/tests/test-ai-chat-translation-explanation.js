import assert from 'node:assert/strict';
import { buildTranslationExplanation, formatTranslationReply } from '../controllers/aiChat.controller.js';
import { printHeader } from './helpers.js';

// Запускает сценарий проверки из командной строки.
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

    const dayExplanation = buildTranslationExplanation({
        sourceText: 'Бүген көн бик матур.',
        translatedText: 'Сегодня очень красивый день.',
        direction: 'tat2rus',
        userText: 'объясни перевод "Бүген көн бик матур."'
    });

    console.log('\nDay explanation:');
    console.log(dayExplanation);

    assert.match(dayExplanation, /«бүген» — «сегодня»/i, 'Explanation should explain "бүген"');
    assert.match(dayExplanation, /«көн» — «день»/i, 'Explanation should explain "көн"');
    assert.match(dayExplanation, /«бик матур» — «очень красивый»/i, 'Explanation should explain "бик матур"');

    const schoolExplanation = buildTranslationExplanation({
        sourceText: 'Без мәктәпкә җәяү бардык.',
        translatedText: 'Мы пошли в школу пешком.',
        direction: 'tat2rus',
        userText: 'сделай разбор "Без мәктәпкә җәяү бардык."'
    });

    console.log('\nSchool explanation:');
    console.log(schoolExplanation);

    assert.match(schoolExplanation, /«без» — «мы»/i, 'Explanation should explain "без"');
    assert.match(schoolExplanation, /«мәктәпкә» — «в школу»/i, 'Explanation should explain "мәктәпкә"');
    assert.match(schoolExplanation, /«җәяү» — «пешком»/i, 'Explanation should explain "җәяү"');
    assert.match(schoolExplanation, /«бардык» — «пошли \/ отправились»/i, 'Explanation should explain "бардык"');

    const helpExplanation = buildTranslationExplanation({
        sourceText: 'Дустым миңа ярдәм итте.',
        translatedText: 'Мой друг помог мне.',
        direction: 'tat2rus',
        userText: 'поясни "Дустым миңа ярдәм итте."'
    });

    console.log('\nHelp explanation:');
    console.log(helpExplanation);

    assert.match(helpExplanation, /«дустым» — «мой друг»/i, 'Explanation should explain "дустым"');
    assert.match(helpExplanation, /«миңа» — «мне»/i, 'Explanation should explain "миңа"');
    assert.match(helpExplanation, /«ярдәм итте» — «помог»/i, 'Explanation should explain "ярдәм итте"');

    const lateExplanation = buildTranslationExplanation({
        sourceText: 'Ул бүген эшкә соңга калды.',
        translatedText: 'Он сегодня опоздал на работу.',
        direction: 'tat2rus',
        userText: 'разбор "Ул бүген эшкә соңга калды."'
    });

    console.log('\nLate explanation:');
    console.log(lateExplanation);

    assert.match(lateExplanation, /«ул» — «он \/ она»/i, 'Explanation should explain "ул"');
    assert.match(lateExplanation, /«эшкә» — «на работу»/i, 'Explanation should explain "эшкә"');
    assert.match(lateExplanation, /«соңга калды» — «опоздал\(а\)»/i, 'Explanation should explain "соңга калды"');

    const flowerExplanation = buildTranslationExplanation({
        sourceText: 'Бакчада чәчәкләр үсә.',
        translatedText: 'В саду растут цветы.',
        direction: 'tat2rus',
        userText: 'объясни "Бакчада чәчәкләр үсә."'
    });

    console.log('\nFlower explanation:');
    console.log(flowerExplanation);

    assert.match(flowerExplanation, /«бакчада» — «в саду»/i, 'Explanation should explain "бакчада"');
    assert.match(flowerExplanation, /«чәчәкләр» — «цветы»/i, 'Explanation should explain "чәчәкләр"');
    assert.match(flowerExplanation, /«үсә» — «растут»/i, 'Explanation should explain "үсә"');

    console.log('\nRESULT: PASS');
};

try {
    run();
} catch (err) {
    console.log('\nRESULT: FAIL');
    console.error(err?.message || err);
    process.exitCode = 1;
}
