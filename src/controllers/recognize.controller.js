import Word from "../models/Word.js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import FormData from "form-data";
import mongoose from "mongoose";
import { generateUsageExamplesForWord, normalizeUsageExamples } from "../services/usageExamples.service.js";
import {
    findExternalWordByEnglishLabel,
    findExternalWordById,
    getExternalWordSource,
    getExternalWordSourceHealth,
    isExternalWordId
} from "../services/externalWordSource.service.js";
import { buildWordTitleCase, resolveRichDescription } from "../services/wordDescription.service.js";

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

export const recognizeSourceHealth = async (req, res) => {
    try {
        const forceRefresh = String(req.query?.refresh || "").toLowerCase() === "true";
        if (forceRefresh) {
            await getExternalWordSource({ forceRefresh: true });
        }

        return res.status(200).json({
            success: true,
            data: getExternalWordSourceHealth()
        });
    } catch (err) {
        return res.status(200).json({
            success: false,
            data: getExternalWordSourceHealth(),
            message: err?.message || "Не удалось получить статус источника"
        });
    }
};

export const generateUsageExamples = async (req, res) => {
    try {
        const wordId = String(req.body?.wordId || "").trim();
        const excludeExamplesRaw = Array.isArray(req.body?.excludeExamples) ? req.body.excludeExamples : [];
        if (!wordId) {
            return res.status(400).json({ message: "wordId обязателен" });
        }

        let foundWord = null;
        if (isExternalWordId(wordId)) {
            foundWord = await findExternalWordById(wordId);
        } else if (mongoose.Types.ObjectId.isValid(wordId)) {
            foundWord = await Word.findOne({ _id: wordId, isActive: true })
                .select("nameRu nameTatar usageExamples");
        } else {
            return res.status(400).json({ message: "Некорректный wordId" });
        }

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

export const recognizeImage = async (req, res) => {
    console.log("=== START recognizeImage ===");

    try {
        if (!ML_SERVICE_URL) {
            return res.status(500).json({ message: "Не настроен ML_SERVICE_URL в .env" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Загрузите фото" });
        }

        // Формируем form-data
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

        // Словарь нормализации прямо в Node.js
        const LABEL_MAP = {
            "tabby": "Cat",
            "tabby cat": "Cat",
            "tiger cat": "Cat",
            "Egyptian cat": "Cat",
            "lynx": "Cat",
            "catamount": "Cat",
            "banana": "Banana",
            "plantain": "Banana",
            "dog": "Dog",
            "bloodhound": "Dog",
            "golden retriever": "Dog",
            "Labrador retriever": "Dog",
            "orange": "Orange",
            "apple": "Apple",
            "computer keyboard": "Keyboard",
            "keypad": "Keyboard",
            "computer mouse": "Computer mouse",
            "mouse": "Mouse",
            "notebook": "Laptop",
            "laptop": "Laptop",
            "screen": "Monitor",
            "monitor": "Monitor",
            "web site": "Computer",
            "desktop computer": "Computer",
            "printer": "Printer",
            "scanner": "Scanner",
            "projector": "Projector",
            "backpack": "Backpack",
            "rucksack": "Backpack",
            "pencil": "Pencil",
            "ballpoint": "Pen",
            "ballpoint pen": "Pen",
            "water bottle": "Bottle",
            "desk": "Desk",
            "dining table": "Table",
            "table": "Table",
            "bookcase": "Bookshelf",
            "bookshelf": "Bookshelf"
        };

        // Нормализуем labels
        const labelsFromML = mlResult
            .map((r) => LABEL_MAP[r.label] || r.label)
            .filter(Boolean);

        console.log("🔍 Нормализованные labels:", labelsFromML);

        // Ищем только по внешнему словарю; ошибки источника превращаем в мягкий отказ.
        let foundWord = null;
        let bestScore = 0;

        try {
            for (const label of labelsFromML) {
                const match = await findExternalWordByEnglishLabel(label);
                if (match) {
                    foundWord = match;
                    bestScore = mlResult.find((r) => (LABEL_MAP[r.label] || r.label) === label)?.score || 0;
                    break;
                }
            }
        } catch (sourceErr) {
            console.warn("⚠️ Внешний словарь недоступен:", sourceErr?.message || sourceErr);
            return res.status(200).json({
                success: false,
                message: "Внешний словарь временно недоступен. Попробуйте позже.",
                reason: "source_unavailable",
                detectedLabels: labelsFromML
            });
        }

        if (!foundWord) {
            return res.status(200).json({
                success: false,
                message: "Предмет не опознан или отсутствует в словаре",
                reason: "not_found_in_dictionary",
                detectedLabels: labelsFromML
            });
        }

        console.log("✅ Найдено слово:", foundWord.nameEn, "score:", bestScore, "source:", foundWord.source);
        const usageExamples = normalizeUsageExamples(foundWord.usageExamples);
        const description = await resolveRichDescription({
            wordId: foundWord.id || foundWord._id,
            wordRu: foundWord.nameRu,
            wordTatar: foundWord.nameTatar,
            wordEn: foundWord.nameEn,
            existingDescription: foundWord.descriptionRu || foundWord.description
        });

        return res.status(200).json({
            success: true,
            data: {
                id: foundWord.id || foundWord._id,
                nameRu: buildWordTitleCase(foundWord.nameRu),
                nameEn: foundWord.nameEn,
                nameTatar: buildWordTitleCase(foundWord.nameTatar),
                transcription: foundWord.transcription,
                description,
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
