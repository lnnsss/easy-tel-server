import { HfInference } from "@huggingface/inference";

let hf;

const getHF = () => {
    if (!hf) {
        if (!process.env.HUGGINGFACEHUB_API_TOKEN) {
            throw new Error(
                "HUGGINGFACEHUB_API_TOKEN не найден в env"
            );
        }

        hf = new HfInference(); // ✅ БЕЗ аргументов
    }
    return hf;
};

export const recognizeImage = async (imageBuffer) => {
    try {
        const hfClient = getHF();

        return await hfClient.imageClassification({
            model: "microsoft/resnet-50",
            inputs: new Uint8Array(imageBuffer),
        });
    } catch (err) {
        console.error("Ошибка Hugging Face:", err);
        throw err;
    }
};
