// Приводит входные данные к единому безопасному формату.
const normalizeKey = (value) => String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const RECOGNITION_LABEL_MAP = {
    tabby: "Cat",
    "tabby cat": "Cat",
    "tiger cat": "Cat",
    "egyptian cat": "Cat",
    lynx: "Cat",
    catamount: "Cat",

    dog: "Dog",
    bloodhound: "Dog",
    "golden retriever": "Dog",
    "labrador retriever": "Dog",
    pug: "Dog",
    "pug-dog": "Dog",
    "bull mastiff": "Dog",
    "brabancon griffon": "Dog",
    kuvasz: "Dog",
    "english setter": "Dog",
    "great pyrenees": "Dog",
    clumber: "Dog",
    "clumber spaniel": "Dog",
    "saint bernard": "Dog",
    "st bernard": "Dog",
    "cocker spaniel": "Dog",
    "english cocker spaniel": "Dog",
    cocker: "Dog",
    "flat-coated retriever": "Dog",

    banana: "Banana",
    plantain: "Banana",
    orange: "Orange",
    apple: "Apple",
    "granny smith": "Apple",

    car: "Car",
    "sports car": "Car",
    "sport car": "Car",
    convertible: "Car",
    racer: "Car",
    "race car": "Car",
    "racing car": "Car",
    "car wheel": "Car",
    grille: "Car",
    "radiator grille": "Car",
    pickup: "Car",
    "pickup truck": "Car",
    "passenger car": "Car",
    limousine: "Car",
    limo: "Car",
    "beach wagon": "Car",
    "station wagon": "Car",
    wagon: "Car",
    "estate car": "Car",
    "beach waggon": "Car",
    "station waggon": "Car",
    waggon: "Car",
    minivan: "Car",
    jeep: "Car",
    landrover: "Car",
    "tow truck": "Car",
    "tow car": "Car",
    wrecker: "Car",
    "amphibious vehicle": "Car",
    minibus: "Car",
    ambulance: "Car",
    cab: "Car",
    hack: "Car",
    taxi: "Car",
    taxicab: "Car",

    bicycle: "Bicycle",
    "mountain bike": "Bicycle",
    "all-terrain bike": "Bicycle",
    "off-roader": "Bicycle",
    tricycle: "Bicycle",
    trike: "Bicycle",
    velocipede: "Bicycle",
    "bicycle-built-for-two": "Bicycle",
    "tandem bicycle": "Bicycle",
    tandem: "Bicycle",
    moped: "Bicycle",
    "disk brake": "Bicycle",
    "disc brake": "Bicycle",

    clock: "Clock",
    watch: "Clock",
    "analog clock": "Clock",
    "digital clock": "Clock",
    "wall clock": "Clock",
    "digital watch": "Clock",
    stopwatch: "Clock",
    "stop watch": "Clock",
    sundial: "Clock",
    "magnetic compass": "Clock",
    barometer: "Clock",

    door: "Door",
    "sliding door": "Door",
    shoji: "Door",
    wardrobe: "Door",
    closet: "Door",
    press: "Door",
    "medicine chest": "Door",
    "medicine cabinet": "Door",
    "china cabinet": "Door",
    "china closet": "Door",
    chiffonier: "Door",
    commode: "Door",
    vault: "Door",
    safe: "Door",
    doormat: "Door",
    "welcome mat": "Door",
    bannister: "Door",
    banister: "Door",
    balustrade: "Door",
    balusters: "Door",
    handrail: "Door",

    glasses: "Glasses",
    sunglass: "Glasses",
    sunglasses: "Glasses",
    "dark glasses": "Glasses",
    shades: "Glasses",
    loupe: "Glasses",
    "jeweler's loupe": "Glasses",

    headphones: "Headphones",
    headphone: "Headphones",
    earphones: "Headphones",
    earphone: "Headphones",
    earbuds: "Headphones",
    earbud: "Headphones",
    headset: "Headphones",
    microphone: "Headphones",
    mike: "Headphones",
    loudspeaker: "Headphones",
    speaker: "Headphones",
    "speaker unit": "Headphones",
    "loudspeaker system": "Headphones",
    "speaker system": "Headphones",
    "cassette player": "Headphones",

    person: "Person",
    human: "Person",
    people: "Person",

    lamp: "Lamp",
    "table lamp": "Lamp",
    lampshade: "Lamp",
    "lamp shade": "Lamp",
    spotlight: "Lamp",
    spot: "Lamp",
    torch: "Lamp",
    candle: "Lamp",
    taper: "Lamp",
    "wax light": "Lamp",
    beacon: "Lamp",
    lighthouse: "Lamp",
    "beacon light": "Lamp",
    pharos: "Lamp",

    router: "Router",
    modem: "Router",
    radio: "Router",
    wireless: "Router",
    "hard disc": "Router",
    "hard disk": "Router",
    "fixed disk": "Router",

    window: "Window",
    "window screen": "Window",
    "window shade": "Window",
    windowpane: "Window",
    "window pane": "Window",
    casement: "Window",

    tree: "Tree",
    buckeye: "Tree",
    "horse chestnut": "Tree",
    conker: "Tree",
    acorn: "Tree",
    rapeseed: "Tree",

    "computer keyboard": "Keyboard",
    keypad: "Keyboard",
    "computer mouse": "Computer mouse",
    mouse: "Mouse",
    notebook: "Laptop",
    laptop: "Laptop",
    screen: "Monitor",
    monitor: "Monitor",
    "web site": "Computer",
    "desktop computer": "Computer",
    printer: "Printer",
    scanner: "Scanner",
    projector: "Projector",

    ipod: "smartphone",
    "cellular telephone": "smartphone",
    "cellular phone": "smartphone",
    cellphone: "smartphone",
    cell: "smartphone",
    "mobile phone": "smartphone",
    "smart phone": "smartphone",
    smartphone: "smartphone",
    "hand-held computer": "smartphone",
    "hand-held microcomputer": "smartphone",
    telephone: "phone",
    phone: "phone",

    backpack: "Backpack",
    rucksack: "Backpack",
    binder: "Book",
    "ring-binder": "Book",
    bookshop: "Book",
    bookstore: "Book",
    bookstall: "Book",
    "book jacket": "Book",
    "dust cover": "Book",
    "dust jacket": "Book",
    "dust wrapper": "Book",
    library: "Book",
    pencil: "Pencil",
    "rubber eraser": "Pencil",
    rubber: "Pencil",
    "pencil eraser": "Pencil",
    "pencil sharpener": "Pencil",
    "pencil box": "Pencil",
    "pencil case": "Pencil",
    paintbrush: "Pencil",
    drumstick: "Pencil",
    matchstick: "Pencil",
    pole: "Pencil",
    ballpoint: "Pen",
    "ballpoint pen": "Pen",
    "water bottle": "Bottle",

    desk: "Desk",
    "dining table": "Table",
    table: "Table",
    board: "Table",
    bookcase: "Bookshelf",
    bookshelf: "Bookshelf",

    chair: "Chair",
    "folding chair": "Chair",
    stool: "Stool",
    "rocking chair": "Armchair",
    rocker: "Armchair",
    armchair: "Armchair",
    "easy chair": "Armchair",
    throne: "Armchair",

    flower: "Flower",
    daisy: "Flower",
    rose: "Flower",
    flowerpot: "Flower",
    pot: "Flower",
    vase: "Flower",
    plant: "Flower",
    "potted plant": "Flower"
};

// Разбивает compound label ML-модели на отдельные проверяемые варианты.
export const splitMlLabel = (label) => {
    const fullLabel = String(label || "").trim();
    if (!fullLabel) return [];

    const parts = fullLabel
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    return [fullLabel, ...parts].filter((value, index, list) => (
        list.findIndex((item) => normalizeKey(item) === normalizeKey(value)) === index
    ));
};

// Сопоставляет одну ML-метку с каноническим английским названием слова.
export const normalizeRecognitionLabel = (label) => {
    const key = normalizeKey(label);
    if (!key) return "";
    return RECOGNITION_LABEL_MAP[key] || String(label || "").trim();
};

const getCandidateScore = ({ label, score }) => {
    if (normalizeKey(label) === "window") {
        return score * 1.4;
    }

    return score;
};

// Превращает сырые ML-метки в нормализованные кандидаты для поиска в словаре.
export const normalizeMlResults = (mlResults = []) => {
    const bestByLabel = new Map();

    for (const result of Array.isArray(mlResults) ? mlResults : []) {
        const rawLabel = String(result?.label || "").trim();
        const score = Number(result?.score) || 0;

        for (const candidate of splitMlLabel(rawLabel)) {
            const label = normalizeRecognitionLabel(candidate);
            if (!label) continue;
            if (candidate.includes(",") && normalizeKey(label) === normalizeKey(candidate)) {
                continue;
            }

            const labelKey = normalizeKey(label);
            const candidateScore = getCandidateScore({ label, score });
            const existing = bestByLabel.get(labelKey);
            if (!existing || candidateScore > existing.score) {
                bestByLabel.set(labelKey, { rawLabel, label, score: candidateScore });
            }
        }
    }

    return [...bestByLabel.values()].sort((left, right) => right.score - left.score);
};
