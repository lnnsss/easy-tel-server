import dotenv from "dotenv";
dotenv.config(); // ⬅️ ВСЕГДА первым

import app from "./app.js";
import connectDB from "./config/db.js";

await connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
});
