import assert from "node:assert/strict";
import { normalizeMlResults } from "../utils/recognitionLabels.js";
import { printHeader, printScenario } from "./helpers.js";

const scenarios = [
    {
        title: "compound smartphone label",
        input: [{ label: "cellular telephone, cellular phone, cellphone, cell, mobile phone", score: 0.42 }],
        expected: ["smartphone"]
    },
    {
        title: "rocking chair maps to armchair",
        input: [{ label: "rocking chair, rocker", score: 0.81 }],
        expected: ["Armchair"]
    },
    {
        title: "flowerpot maps to flower",
        input: [{ label: "pot, flowerpot", score: 0.05 }],
        expected: ["Flower"]
    },
    {
        title: "dog breed labels map to dog",
        input: [
            { label: "pug, pug-dog", score: 0.988018274307251 },
            { label: "bull mastiff", score: 0.0004598279483616352 },
            { label: "Brabancon griffon", score: 0.00035167092573828995 }
        ],
        expected: ["Dog"]
    },
    {
        title: "retriever and spaniel labels map to dog",
        input: [
            { label: "golden retriever", score: 0.9898284673690796 },
            { label: "Labrador retriever", score: 0.0020498731173574924 },
            { label: "kuvasz", score: 0.0020335474982857704 },
            { label: "clumber, clumber spaniel", score: 0.0002321625652257353 },
            { label: "cocker spaniel, English cocker spaniel, cocker", score: 0.0001275799295399338 }
        ],
        expected: ["Dog"]
    },
    {
        title: "Granny Smith maps to apple before lower fruit matches",
        input: [
            { label: "Granny Smith", score: 0.8001098036766052 },
            { label: "orange", score: 0.01918857917189598 },
            { label: "banana", score: 0.00474220234900713 }
        ],
        expected: ["Apple", "Orange", "Banana"]
    },
    {
        title: "book-like labels map to book before weak file matches",
        input: [
            { label: "library", score: 0.17188186943531036 },
            { label: "bookshop, bookstore, bookstall", score: 0.033460233360528946 },
            { label: "book jacket, dust cover, dust jacket, dust wrapper", score: 0.010078227147459984 },
            { label: "file, file cabinet, filing cabinet", score: 0.004270925652235746 }
        ],
        expected: ["Book", "file", "file cabinet", "filing cabinet"]
    },
    {
        title: "sports car labels map to car before unrelated fruit",
        input: [
            { label: "sports car, sport car", score: 0.6216890215873718 },
            { label: "convertible", score: 0.12132962793111801 },
            { label: "racer, race car, racing car", score: 0.03627834469079971 },
            { label: "banana", score: 0.03222532942891121 }
        ],
        expected: ["Car", "Banana"]
    },
    {
        title: "vehicle variants map to car",
        input: [
            { label: "pickup, pickup truck", score: 0.7459468245506287 },
            { label: "beach wagon, station wagon, wagon, estate car, beach waggon, station waggon, waggon", score: 0.06505044549703598 },
            { label: "jeep, landrover", score: 0.022405032068490982 },
            { label: "cab, hack, taxi, taxicab", score: 0.004254696890711784 }
        ],
        expected: ["Car"]
    },
    {
        title: "tricycle labels map to bicycle",
        input: [
            { label: "tricycle, trike, velocipede", score: 0.999769389629364 },
            { label: "moped", score: 0.000016454201613669284 },
            { label: "bicycle-built-for-two, tandem bicycle, tandem", score: 0.000014655187442258466 }
        ],
        expected: ["Bicycle"]
    },
    {
        title: "mountain bike labels map to bicycle",
        input: [
            { label: "mountain bike, all-terrain bike, off-roader", score: 0.8302434682846069 },
            { label: "bicycle-built-for-two, tandem bicycle, tandem", score: 0.0960291177034378 },
            { label: "disk brake, disc brake", score: 0.000513676495756954 }
        ],
        expected: ["Bicycle"]
    },
    {
        title: "clock labels map to clock even when compass is strongest",
        input: [
            { label: "magnetic compass", score: 0.9608284831047058 },
            { label: "analog clock", score: 0.027354924008250237 },
            { label: "digital watch", score: 0.005629929713904858 },
            { label: "stopwatch, stop watch", score: 0.00018572025874163955 },
            { label: "wall clock", score: 0.00016375741688534617 },
            { label: "digital clock", score: 0.0000861113439896144 }
        ],
        expected: ["Clock"]
    },
    {
        title: "clock labels beat weak car wheel match",
        input: [
            { label: "stopwatch, stop watch", score: 0.9335503578186035 },
            { label: "digital watch", score: 0.012299400754272938 },
            { label: "analog clock", score: 0.011931446380913258 },
            { label: "car wheel", score: 0.0011578230187296867 },
            { label: "digital clock", score: 0.0005197384743951261 }
        ],
        expected: ["Clock", "Car"]
    },
    {
        title: "door cabinet-like labels map to door before file",
        input: [
            { label: "wardrobe, closet, press", score: 0.7481522560119629 },
            { label: "medicine chest, medicine cabinet", score: 0.042546357959508896 },
            { label: "file, file cabinet, filing cabinet", score: 0.040787629783153534 },
            { label: "shoji", score: 0.007579630706459284 },
            { label: "sliding door", score: 0.005554606672376394 }
        ],
        expected: ["Door", "file", "file cabinet", "filing cabinet"]
    },
    {
        title: "door context labels map to door before book",
        input: [
            { label: "vault", score: 0.3596673011779785 },
            { label: "bookshop, bookstore, bookstall", score: 0.02258826605975628 },
            { label: "doormat, welcome mat", score: 0.020942900329828262 }
        ],
        expected: ["Door", "Book"]
    },
    {
        title: "bannister door image maps to door before file",
        input: [
            { label: "bannister, banister, balustrade, balusters, handrail", score: 0.9231975674629211 },
            { label: "sliding door", score: 0.002930302871391177 },
            { label: "file, file cabinet, filing cabinet", score: 0.002314681652933359 }
        ],
        expected: ["Door", "file", "file cabinet", "filing cabinet"]
    },
    {
        title: "sunglasses labels map to glasses before weak clock",
        input: [
            { label: "stethoscope", score: 0.3403089642524719 },
            { label: "sunglasses, dark glasses, shades", score: 0.22222481667995453 },
            { label: "sunglass", score: 0.07095672190189362 },
            { label: "loupe, jeweler's loupe", score: 0.011065375991165638 },
            { label: "stopwatch, stop watch", score: 0.010190621018409729 }
        ],
        expected: ["stethoscope", "Glasses", "Clock"]
    },
    {
        title: "strong sunglass label maps to glasses before weak bicycle",
        input: [
            { label: "sunglass", score: 0.8028151988983154 },
            { label: "sunglasses, dark glasses, shades", score: 0.19045579433441162 },
            { label: "bicycle-built-for-two, tandem bicycle, tandem", score: 0.0001239446282852441 }
        ],
        expected: ["Glasses", "Bicycle"]
    },
    {
        title: "sunglass beats weak microphone and clock matches",
        input: [
            { label: "sunglass", score: 0.9394280910491943 },
            { label: "loupe, jeweler's loupe", score: 0.0119933495298028 },
            { label: "microphone, mike", score: 0.002879103645682335 },
            { label: "analog clock", score: 0.0013458539033308625 }
        ],
        expected: ["Glasses", "Headphones", "Clock"]
    },
    {
        title: "speaker-like headphone labels beat weak clock",
        input: [
            { label: "vacuum, vacuum cleaner", score: 0.6470509767532349 },
            { label: "loudspeaker, speaker, speaker unit, loudspeaker system, speaker system", score: 0.1135316863656044 },
            { label: "digital clock", score: 0.02574404515326023 },
            { label: "microphone, mike", score: 0.019126329571008682 }
        ],
        expected: ["vacuum", "vacuum cleaner", "Headphones", "Clock"]
    },
    {
        title: "microphone-like headphone labels map to headphones",
        input: [
            { label: "toilet seat", score: 0.44439950585365295 },
            { label: "strainer", score: 0.44131600856781006 },
            { label: "microphone, mike", score: 0.04277978837490082 },
            { label: "loudspeaker, speaker, speaker unit, loudspeaker system, speaker system", score: 0.011331059969961643 },
            { label: "digital clock", score: 0.00125952681992203 }
        ],
        expected: ["toilet seat", "strainer", "Headphones", "Clock"]
    },
    {
        title: "strong microphone label maps to headphones",
        input: [
            { label: "microphone, mike", score: 0.7271777391433716 },
            { label: "cassette player", score: 0.0052060517482459545 },
            { label: "loupe, jeweler's loupe", score: 0.0019251034827902913 },
            { label: "loudspeaker, speaker, speaker unit, loudspeaker system, speaker system", score: 0.0011200931621715426 }
        ],
        expected: ["Headphones", "Glasses"]
    },
    {
        title: "lamp labels map to lamp before unrelated weak matches",
        input: [
            { label: "spotlight, spot", score: 0.865318238735199 },
            { label: "table lamp", score: 0.031797606498003006 },
            { label: "torch", score: 0.02445470169186592 },
            { label: "candle, taper, wax light", score: 0.002231825143098831 },
            { label: "lampshade, lamp shade", score: 0.0017411941662430763 }
        ],
        expected: ["Lamp"]
    },
    {
        title: "strong table lamp beats weak flower and door",
        input: [
            { label: "table lamp", score: 0.9996418952941895 },
            { label: "lampshade, lamp shade", score: 0.000009293188668380026 },
            { label: "vase", score: 0.00000687843839841662 },
            { label: "chiffonier, commode", score: 0.000006847095392004121 }
        ],
        expected: ["Lamp", "Flower", "Door"]
    },
    {
        title: "table lamp beats weak headphones and glasses",
        input: [
            { label: "table lamp", score: 0.8231906294822693 },
            { label: "spotlight, spot", score: 0.11259079724550247 },
            { label: "microphone, mike", score: 0.030241476371884346 },
            { label: "lampshade, lamp shade", score: 0.004716864321380854 },
            { label: "loupe, jeweler's loupe", score: 0.000394778122426942 }
        ],
        expected: ["Lamp", "Headphones", "Glasses"]
    },
    {
        title: "pencil eraser labels map to pencil before ruler",
        input: [
            { label: "rubber eraser, rubber, pencil eraser", score: 0.9997310042381287 },
            { label: "rule, ruler", score: 0.00010103093518409878 },
            { label: "pencil sharpener", score: 0.00003483573527773842 },
            { label: "pencil box, pencil case", score: 0.0000032891359751374694 }
        ],
        expected: ["Pencil", "rule", "ruler"]
    },
    {
        title: "pencil labels beat weak lamp and pen matches",
        input: [
            { label: "obelisk", score: 0.47954413294792175 },
            { label: "rubber eraser, rubber, pencil eraser", score: 0.3631742596626282 },
            { label: "candle, taper, wax light", score: 0.0660633072257042 },
            { label: "pencil sharpener", score: 0.030949052423238754 },
            { label: "ballpoint, ballpoint pen, ballpen, Biro", score: 0.021041912958025932 }
        ],
        expected: ["obelisk", "Pencil", "Lamp", "Pen", "ballpen", "Biro"]
    },
    {
        title: "pencil case and paintbrush labels map to pencil before book",
        input: [
            { label: "rubber eraser, rubber, pencil eraser", score: 0.8341432809829712 },
            { label: "paintbrush", score: 0.054136715829372406 },
            { label: "pencil box, pencil case", score: 0.030639030039310455 },
            { label: "book jacket, dust cover, dust jacket, dust wrapper", score: 0.00225067394785583 }
        ],
        expected: ["Pencil", "Book"]
    },
    {
        title: "drumstick-like pencil labels map to pencil",
        input: [
            { label: "drumstick", score: 0.6618533730506897 },
            { label: "rubber eraser, rubber, pencil eraser", score: 0.09696898609399796 },
            { label: "pencil sharpener", score: 0.03097781166434288 },
            { label: "matchstick", score: 0.02698761411011219 },
            { label: "pencil box, pencil case", score: 0.009669245220720768 }
        ],
        expected: ["Pencil"]
    },
    {
        title: "modem labels map to router before weak headphones",
        input: [
            { label: "modem", score: 0.9949127435684204 },
            { label: "radio, wireless", score: 0.004696207586675882 },
            { label: "microphone, mike", score: 0.00008598205022281036 },
            { label: "sundial", score: 0.00002560737993917428 }
        ],
        expected: ["Router", "Headphones", "Clock"]
    },
    {
        title: "wireless labels map to router before monitor",
        input: [
            { label: "radio, wireless", score: 0.9440810680389404 },
            { label: "monitor", score: 0.030466370284557343 },
            { label: "hard disc, hard disk, fixed disk", score: 0.0045326948165893555 },
            { label: "microphone, mike", score: 0.003041353775188327 },
            { label: "modem", score: 0.0010487567633390427 }
        ],
        expected: ["Router", "Monitor", "Headphones"]
    },
    {
        title: "modem-heavy router labels beat weak monitor and clock",
        input: [
            { label: "modem", score: 0.4995816946029663 },
            { label: "radio, wireless", score: 0.09729582071304321 },
            { label: "monitor", score: 0.026094965636730194 },
            { label: "digital clock", score: 0.019574789330363274 },
            { label: "desktop computer", score: 0.01743192970752716 }
        ],
        expected: ["Router", "Monitor", "Clock", "Computer"]
    },
    {
        title: "window screen maps to window before door",
        input: [
            { label: "window screen", score: 0.9679421782493591 },
            { label: "sliding door", score: 0.02224096469581127 },
            { label: "window shade", score: 0.0007929857238195837 },
            { label: "dining table, board", score: 0.00036735189496539533 }
        ],
        expected: ["Window", "Door", "Table"]
    },
    {
        title: "window screen and shade beat sliding door",
        input: [
            { label: "sliding door", score: 0.5407587885856628 },
            { label: "window screen", score: 0.41522639989852905 },
            { label: "window shade", score: 0.008546802215278149 },
            { label: "monitor", score: 0.000737235473934561 }
        ],
        expected: ["Window", "Door", "Monitor"]
    },
    {
        title: "window screen beats close monitor match",
        input: [
            { label: "monitor", score: 0.3114783465862274 },
            { label: "window screen", score: 0.26802513003349304 },
            { label: "web site, website, internet site, site", score: 0.07296203821897507 },
            { label: "sliding door", score: 0.04366485774517059 },
            { label: "window shade", score: 0.03442537412047386 }
        ],
        expected: ["Window", "Monitor", "Computer", "website", "internet site", "site", "Door"]
    },
    {
        title: "tree nut labels map to tree",
        input: [
            { label: "buckeye, horse chestnut, conker", score: 0.5110316872596741 },
            { label: "lakeside, lakeshore", score: 0.42819640040397644 },
            { label: "rapeseed", score: 0.00677144480869174 },
            { label: "park bench", score: 0.004849155433475971 }
        ],
        expected: ["Tree", "lakeside", "lakeshore", "park bench"]
    },
    {
        title: "acorn label maps to tree",
        input: [
            { label: "seashore, coast, seacoast, sea-coast", score: 0.281735897064209 },
            { label: "lakeside, lakeshore", score: 0.04644711688160896 },
            { label: "stone wall", score: 0.032196711748838425 },
            { label: "acorn", score: 0.02062692679464817 }
        ],
        expected: ["seashore", "coast", "seacoast", "sea-coast", "lakeside", "lakeshore", "stone wall", "Tree"]
    },
    {
        title: "dining table stays table",
        input: [
            { label: "dining table, board", score: 0.93 },
            { label: "desk", score: 0.006 }
        ],
        expected: ["Table", "Desk"]
    }
];

printHeader("Recognition label normalization");

for (const scenario of scenarios) {
    const actual = normalizeMlResults(scenario.input).map((item) => item.label);
    printScenario({
        input: scenario.input,
        expectedStatus: scenario.title,
        expectedMessage: scenario.expected,
        actualStatus: "labels",
        actualPayload: actual
    });
    assert.deepEqual(actual, scenario.expected);
}

console.log("Recognition label normalization tests passed");
