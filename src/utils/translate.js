import axios from 'axios';

export const translateToTatar = async (text) => {
    const res = await axios.post('https://libretranslate.de/translate', {
        q: text,
        source: 'ru',
        target: 'tt',
        format: 'text'
    });

    return res.data.translatedText;
};
