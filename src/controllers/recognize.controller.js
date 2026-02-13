import Word from "../models/Word.js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import FormData from "form-data";

dotenv.config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000/predict";

export const recognizeImage = async (req, res) => {
    console.log("=== START recognizeImage ===");

    try {
        if (!req.file) {
            return res.status(400).json({ message: "Загрузите фото" });
        }

        const allWords = await Word.find({ isActive: true });
        const DB_LABELS = allWords.map(w => w.nameEn?.trim()).filter(Boolean);
        console.log("📚 Слов в БД (isActive:true):", DB_LABELS);

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
            // добавь остальные категории по необходимости
        };

        // Нормализуем labels
        const labelsFromML = mlResult
            .map(r => LABEL_MAP[r.label] || r.label)
            .filter(Boolean);

        console.log("🔍 Нормализованные labels:", labelsFromML);

        // Поиск слова в БД
        let foundWord = null;
        let bestScore = 0;
        for (const label of labelsFromML) {
            const match = allWords.find(w => w.nameEn?.trim().toLowerCase() === label.toLowerCase());
            if (match) {
                foundWord = match;
                bestScore = mlResult.find(r => r.label === label)?.score || 0;
                break;
            }
        }

        if (!foundWord) {
            return res.status(200).json({
                success: false,
                message: "Предмет не опознан или отсутствует в словаре",
                detectedLabels: labelsFromML
            });
        }

        console.log("✅ Найдено слово в БД:", foundWord.nameEn, "score:", bestScore);

        return res.status(200).json({
            success: true,
            data: {
                id: foundWord._id,
                nameRu: foundWord.nameRu,
                nameEn: foundWord.nameEn,
                nameTatar: foundWord.nameTatar,
                transcription: foundWord.transcription,
                description: foundWord.descriptionRu,
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
