import Word from '../models/Word.js';
import dotenv from "dotenv";
dotenv.config();

const HF_TOKEN = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;

export const recognizeImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "Загрузите фото" });
        const token = HF_TOKEN?.trim();

        // --- ШАГ 1: РАСПОЗНАВАНИЕ ФОТО ---
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
        console.log(`📸 ИИ увидел: "${topLabel}"`);

        // --- ШАГ 2: ПОДГОТОВКА КАНДИДАТОВ ---
        const allWords = await Word.find({ isActive: true });

        // Добавляем "ловушку" в список английских слов
        const DB_LABELS = allWords.map(w => w.nameEn?.trim()).filter(Boolean);
        const TRAP_LABEL = "unrelated object"; // Слово-ловушка
        const englishCandidates = [...DB_LABELS, TRAP_LABEL];

        if (DB_LABELS.length === 0) {
            return res.status(200).json({ success: false, message: "Словарь пуст" });
        }

        // --- ШАГ 3: ЛОГИКА СРАВНЕНИЯ (BART) ---
        const LOGIC_API = "https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli";

        const logicResponse = await fetch(LOGIC_API, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "x-wait-for-model": "true"
            },
            body: JSON.stringify({
                inputs: topLabel,
                parameters: {
                    candidate_labels: englishCandidates,
                    multi_label: true // ⬅️ ВАЖНО: Каждое слово оценивается отдельно от 0 до 1
                }
            }),
        });

        const logicResult = await logicResponse.json();

        // Универсальный парсинг (под новый формат массива или старый объект)
        let results = [];
        if (Array.isArray(logicResult)) {
            results = logicResult;
        } else if (logicResult.labels && logicResult.scores) {
            results = logicResult.labels.map((l, i) => ({ label: l, score: logicResult.scores[i] }));
        }

        // Сортируем по уверенности
        results.sort((a, b) => b.score - a.score);

        const bestMatch = results[0];
        console.log(`🎯 Лучшее совпадение: "${bestMatch.label}" с уверенностью ${(bestMatch.score * 100).toFixed(1)}%`);

        // --- ШАГ 4: ЖЕСТКАЯ ПРОВЕРКА ---

        // 1. Если ИИ выбрал нашу "ловушку"
        if (bestMatch.label === TRAP_LABEL) {
            console.log("🚫 ИИ решил, что это посторонний предмет.");
            return res.status(200).json({
                success: false,
                message: "Этого предмета нет в словаре (ИИ не нашел сходства)",
                detected: topLabel
            });
        }

        // 2. Если уверенность слишком низкая (подняли до 0.7 для multi-label)
        // В режиме multi_label порог должен быть выше (обычно 0.7 - 0.9)
        const CONFIDENCE_THRESHOLD = 0.75;
        if (bestMatch.score < CONFIDENCE_THRESHOLD) {
            console.log(`⚠️ Недостаточно уверенности (${(bestMatch.score * 100).toFixed(1)}% < ${CONFIDENCE_THRESHOLD * 100}%)`);
            return res.status(200).json({
                success: false,
                message: "Я не уверен, что это за предмет. Попробуйте другое фото.",
                detected: topLabel
            });
        }

        // Если прошли все проверки — ищем в базе
        const foundWord = allWords.find(w => w.nameEn?.trim() === bestMatch.label);

        return res.status(200).json({
            success: true,
            detected_as: topLabel,
            match_score: (bestMatch.score * 100).toFixed(1) + "%",
            data: {
                nameRu: foundWord.nameRu,
                nameEn: foundWord.nameEn,
                nameTatar: foundWord.nameTatar,
                transcription: foundWord.transcription,
                description: foundWord.descriptionRu
            }
        });

    } catch (error) {
        console.error("🛑 Ошибка:", error);
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};