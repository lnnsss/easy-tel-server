import Word from "../models/Word.js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import FormData from "form-data";
import mongoose from "mongoose";
import { generateUsageExamplesForWord, normalizeUsageExamples } from "../services/usageExamples.service.js";
import { buildWordTitleCase } from "../services/wordDescription.service.js";
import { normalizeMlResults } from "../utils/recognitionLabels.js";

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL;
// Приводит входные данные к единому безопасному формату.
const normalizeWordKey = (value) => String(value || "").trim().toLowerCase();

// Генерирует дополнительные примеры употребления для найденного слова.
export const generateUsageExamples = async (req, res) => {
    try {
        const wordId = String(req.body?.wordId || "").trim();
        const excludeExamplesRaw = Array.isArray(req.body?.excludeExamples) ? req.body.excludeExamples : [];
        if (!wordId) {
            return res.status(400).json({ message: "wordId обязателен" });
        }

        if (!mongoose.Types.ObjectId.isValid(wordId)) {
            return res.status(400).json({ message: "Некорректный wordId" });
        }
        const foundWord = await Word.findOne({ _id: wordId, isActive: true })
            .select("nameRu nameTatar usageExamples");

        if (!foundWord) {
            return res.status(404).json({ message: "Слово не найдено" });
        }

        const usageExamples = await generateUsageExamplesForWord({
            wordRu: foundWord.nameRu,
            wordTatar: foundWord.nameTatar,
            excludeExamples: excludeExamplesRaw
        });

        return res.status(200).json({
            success: true,
            data: {
                wordId: foundWord._id,
                usageExamples
            }
        });
    } catch (err) {
        console.error("🔥 Ошибка в generateUsageExamples:", err);
        return res.status(500).json({ message: "Ошибка сервера", error: err.message });
    }
};

// Распознает загруженное изображение и сопоставляет ML-метки со словарем.
export const recognizeImage = async (req, res) => {
    console.log("=== START recognizeImage ===");

    try {
        if (!ML_SERVICE_URL) {
            return res.status(500).json({ message: "Не настроен ML_SERVICE_URL в .env" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Загрузите фото" });
        }

        const allWords = await Word.find({ isActive: true });
        const wordsByNameEn = new Map(
            allWords
                .map((word) => [normalizeWordKey(word.nameEn), word])
                .filter(([key]) => Boolean(key))
        );

        // Формируем данные формы.
        const formData = new FormData();
        formData.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype || "image/jpeg"
        });

        console.log("📡 Отправка запроса в ML_SERVICE_URL:", ML_SERVICE_URL);

        const response = await fetch(ML_SERVICE_URL, {
            method: "POST",
            body: formData,
            headers: formData.getHeaders()
        });

        if (!response.ok) throw new Error(`Ошибка ML сервиса: ${response.status}`);
        const mlResult = await response.json();
        console.log("🧠 Результат ML сервиса:", mlResult);

        if (!mlResult || !mlResult.length) {
            return res.status(200).json({
                success: false,
                message: "Предмет не опознан или отсутствует в словаре"
            });
        }

        const normalizedCandidates = normalizeMlResults(mlResult);
        const labelsFromML = normalizedCandidates.map((item) => item.label);

        console.log("🔍 Нормализованные labels:", normalizedCandidates);

        let foundWord = null;
        let bestScore = 0;
        for (const candidate of normalizedCandidates) {
            const match = wordsByNameEn.get(normalizeWordKey(candidate.label));
            if (match) {
                foundWord = match;
                bestScore = candidate.score;
                break;
            }
        }

        if (!foundWord) {
            return res.status(200).json({
                success: false,
                message: "Предмет не опознан или отсутствует в словаре",
                reason: "not_found_in_dictionary",
                detectedLabels: labelsFromML
            });
        }

        console.log("✅ Найдено слово:", foundWord.nameEn, "score:", bestScore);
        const usageExamples = normalizeUsageExamples(foundWord.usageExamples);

        return res.status(200).json({
            success: true,
            data: {
                id: foundWord._id,
                nameRu: buildWordTitleCase(foundWord.nameRu),
                nameEn: foundWord.nameEn,
                nameTatar: buildWordTitleCase(foundWord.nameTatar),
                transcription: foundWord.transcription,
                description: foundWord.descriptionRu,
                usageExamples,
                score: bestScore
            }
        });

    } catch (err) {
        console.error("🔥 Ошибка в recognizeImage:", err);
        res.status(500).json({ message: "Ошибка сервера", error: err.message });
    } finally {
        console.log("=== END recognizeImage ===");
    }
};
