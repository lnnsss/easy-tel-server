import axios from 'axios';

const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const recognizeImage = async (base64Image) => {
    try {
        const response = await axios.post(
            `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: 'Назови предмет на фото одним существительным на русском'
                            },
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ]
            }
        );

        return response.data;
    } catch (err) {
        console.error('❌ Gemini error:', err.response?.data || err.message);
        throw new Error('Ошибка распознавания изображения');
    }
};
