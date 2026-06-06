import dotenv from "dotenv";
import mongoose from "mongoose";
import Word from "../models/Word.js";

dotenv.config();

const RECOGNITION_WORDS = [
    {
        nameRu: "Стул",
        nameEn: "Chair",
        nameTatar: "Урындык",
        descriptionRu: "Предмет мебели для сидения одного человека, обычно со спинкой.",
    },
    {
        nameRu: "Дверь",
        nameEn: "Door",
        nameTatar: "Ишек",
        descriptionRu: "Подвижная перегородка, закрывающая вход или выход из помещения.",
    },
    {
        nameRu: "Яблоко",
        nameEn: "Apple",
        nameTatar: "Алма",
        descriptionRu: "Круглый съедобный фрукт, который растет на яблоне.",
    },
    {
        nameRu: "Кресло",
        nameEn: "Armchair",
        nameTatar: "Кәнәфи",
        descriptionRu: "Мягкий предмет мебели для сидения одного человека, обычно со спинкой и подлокотниками.",
    },
    {
        nameRu: "Банан",
        nameEn: "Banana",
        nameTatar: "Банан",
        descriptionRu: "Длинный желтый съедобный фрукт с мягкой мякотью.",
    },
    {
        nameRu: "Книга",
        nameEn: "Book",
        nameTatar: "Китап",
        descriptionRu: "Печатное или электронное издание с текстом или изображениями.",
    },
    {
        nameRu: "Бутылка",
        nameEn: "Bottle",
        nameTatar: "Шешә",
        descriptionRu: "Емкость с узким горлышком для хранения жидкости.",
    },
    {
        nameRu: "Машина",
        nameEn: "Car",
        nameTatar: "Машина",
        descriptionRu: "Транспортное средство для передвижения по дорогам.",
    },
    {
        nameRu: "Кошка",
        nameEn: "Cat",
        nameTatar: "Песи",
        descriptionRu: "Домашнее животное семейства кошачьих.",
    },
    {
        nameRu: "Собака",
        nameEn: "Dog",
        nameTatar: "Эт",
        descriptionRu: "Домашнее животное, часто живущее рядом с человеком.",
    },
    {
        nameRu: "Велосипед",
        nameEn: "Bicycle",
        nameTatar: "Велосипед",
        descriptionRu: "Двухколесное транспортное средство, приводимое в движение педалями.",
    },
    {
        nameRu: "Часы",
        nameEn: "Clock",
        nameTatar: "Сәгать",
        descriptionRu: "Устройство для измерения и отображения времени.",
    },
    {
        nameRu: "Тетрадка",
        nameEn: "Notebook",
        nameTatar: "Дәфтәр",
        descriptionRu: "Сшитые листы бумаги для записей, учебы или заметок.",
    },
    {
        nameRu: "Чашка",
        nameEn: "Cup",
        nameTatar: "Чынаяк",
        descriptionRu: "Небольшая посуда с ручкой для питья.",
    },
    {
        nameRu: "Флешка",
        nameEn: "USB flash drive",
        nameTatar: "Флешка",
        descriptionRu: "Портативное устройство для хранения и переноса цифровых данных.",
    },
    {
        nameRu: "Цветы",
        nameEn: "Flowers",
        nameTatar: "Чәчәк",
        descriptionRu: "Растения или части растений с лепестками, часто яркие и ароматные.",
    },
    {
        nameRu: "Очки",
        nameEn: "Glasses",
        nameTatar: "Күзлек",
        descriptionRu: "Предмет с линзами, который носят перед глазами для зрения или защиты.",
    },
    {
        nameRu: "Наушники",
        nameEn: "Headphones",
        nameTatar: "Колакчыннар",
        descriptionRu: "Устройство для прослушивания звука, надеваемое на уши.",
    },
    {
        nameRu: "Человек",
        nameEn: "Person",
        nameTatar: "Кеше",
        descriptionRu: "Живое разумное существо, представитель человеческого рода.",
    },
    {
        nameRu: "Лампа",
        nameEn: "Lamp",
        nameTatar: "Лампа",
        descriptionRu: "Устройство для освещения пространства.",
    },
    {
        nameRu: "Ручка",
        nameEn: "Pen",
        nameTatar: "Сап",
        descriptionRu: "Письменная принадлежность для нанесения чернил на бумагу.",
    },
    {
        nameRu: "Карандаш",
        nameEn: "Pencil",
        nameTatar: "Каләм",
        descriptionRu: "Письменная принадлежность со стержнем для рисования или письма.",
    },
    {
        nameRu: "Принтер",
        nameEn: "Printer",
        nameTatar: "Принтер",
        descriptionRu: "Устройство для печати текста или изображений на бумаге.",
    },
    {
        nameRu: "Роутер",
        nameEn: "Router",
        nameTatar: "Роутер",
        descriptionRu: "Сетевое устройство, которое распределяет интернет-соединение.",
    },
    {
        nameRu: "Смартфон",
        nameEn: "Smartphone",
        nameTatar: "Смартфон",
        descriptionRu: "Мобильный телефон с экраном и функциями карманного компьютера.",
    },
    {
        nameRu: "Окно",
        nameEn: "Window",
        nameTatar: "Тәрәзә",
        descriptionRu: "Проем в стене со стеклом для света, воздуха или обзора.",
    },
    {
        nameRu: "Дерево",
        nameEn: "Tree",
        nameTatar: "Агач",
        descriptionRu: "Многолетнее растение со стволом, ветвями и листьями.",
    }
].map((word) => ({
    ...word,
    source: "manual",
    isActive: true,
    usageExamples: [
        {
            textTatar: `Бу ${word.nameTatar.toLowerCase()}.`,
            textRu: `Это ${word.nameRu.toLowerCase()}.`
        },
        {
            textTatar: `Мин ${word.nameTatar.toLowerCase()} күрәм.`,
            textRu: `Я вижу ${word.nameRu.toLowerCase()}.`
        }
    ]
}));

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Выполняет служебный сценарий run для обслуживания данных проекта.
const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required");
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

    for (const word of RECOGNITION_WORDS) {
        const existing = await Word.findOne({
            $or: [
                { nameRu: { $regex: `^${escapeRegex(word.nameRu)}$`, $options: "i" } },
                { nameEn: { $regex: `^${escapeRegex(word.nameEn)}$`, $options: "i" } }
            ]
        });

        const saved = existing
            ? await Word.findByIdAndUpdate(existing._id, word, { returnDocument: "after" })
            : await Word.create(word);

        const action = existing ? "Updated" : "Created";
        console.log(`${action} recognition word: ${saved.nameEn} (${saved.nameRu} / ${saved.nameTatar})`);
    }

    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error("Failed to upsert recognition words:", err);
    await mongoose.disconnect();
    process.exit(1);
});
