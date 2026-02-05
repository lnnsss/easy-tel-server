import dotenv from "dotenv";
dotenv.config();

export const recognizeImage = async (req, res) => {
    try {
        // Проверяем токен (используем то имя, которое у вас в .env)
        const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;

        if (!token) {
            return res.status(500).json({ message: "API токен (HUGGINGFACE_TOKEN) не найден в .env" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Файл 'image' не загружен" });
        }

        // НОВЫЙ ЭНДПОИНТ ИЗ ВАШЕГО CURL
        const API_URL = "https://router.huggingface.co/hf-inference/models/microsoft/resnet-50";

        console.log("📡 Отправка запроса через Inference Router...");

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token.trim()}`,
                // Указываем тип контента как в примере.
                // Если не сработает image/jpeg, octet-stream тоже подойдет.
                "Content-Type": req.file.mimetype || "image/jpeg",
            },
            body: req.file.buffer,
        });

        const responseText = await response.text();

        // Проверка на HTML
        if (responseText.trim().startsWith("<!doctype html>")) {
            return res.status(response.status).json({
                success: false,
                message: "Hugging Face всё еще возвращает HTML. Проверьте правильность токена.",
                status: response.status
            });
        }

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            return res.status(500).json({
                message: "Ошибка парсинга JSON от API",
                error: e.message,
                raw: responseText.substring(0, 100)
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: "Ошибка Hugging Face API",
                error: result.error
            });
        }

        // Модель ResNet-50 возвращает массив объектов
        const topResult = result[0];

        return res.status(200).json({
            success: true,
            data: {
                label: topResult?.label,
                confidence: (topResult?.score * 100).toFixed(2) + "%",
                all_matches: result.slice(0, 3)
            }
        });

    } catch (error) {
        console.error("🛑 Ошибка:", error);
        res.status(500).json({ message: "Внутренняя ошибка сервера", error: error.message });
    }
};