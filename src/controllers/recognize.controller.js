import Word from '../models/Word.js';
import dotenv from "dotenv";
dotenv.config();

const HF_TOKEN = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;

export const recognizeImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "Загрузите фото" });
        const token = HF_TOKEN?.trim();

        const IMAGE_API = "https://router.huggingface.co/hf-inference/models/microsoft/resnet-50";
        const imgResponse = await fetch(IMAGE_API, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": req.file.mimetype || "image/jpeg",
                "x-wait-for-model": "true"
            },
            body: req.file.buffer,
        });

        const imgResult = await imgResponse.json();
        if (!Array.isArray(imgResult)) throw new Error("Ошибка модели фото");

        const topLabel = imgResult[0].label;
        const allWords = await Word.find({ isActive: true });
        const DB_LABELS = allWords.map(w => w.nameEn?.trim()).filter(Boolean);
        const TRAP_LABEL = "unrelated object";
        const englishCandidates = [...DB_LABELS, TRAP_LABEL];

        const LOGIC_API = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli";
        const logicResponse = await fetch(LOGIC_API, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                inputs: topLabel,
                parameters: { candidate_labels: englishCandidates, multi_label: true }
            }),
        });

        const logicResult = await logicResponse.json();
        let results = Array.isArray(logicResult) ? logicResult :
            (logicResult.labels ? logicResult.labels.map((l, i) => ({ label: l, score: logicResult.scores[i] })) : []);

        results.sort((a, b) => b.score - a.score);
        const bestMatch = results[0];

        if (!bestMatch || bestMatch.label === TRAP_LABEL || bestMatch.score < 0.75) {
            return res.status(200).json({
                success: false,
                message: "Предмет не опознан или отсутствует в словаре",
                detected: topLabel
            });
        }

        const foundWord = allWords.find(w => w.nameEn?.trim() === bestMatch.label);

        return res.status(200).json({
            success: true,
            data: {
                id: foundWord._id,
                nameRu: foundWord.nameRu,
                nameEn: foundWord.nameEn,
                nameTatar: foundWord.nameTatar,
                transcription: foundWord.transcription,
                description: foundWord.descriptionRu
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};