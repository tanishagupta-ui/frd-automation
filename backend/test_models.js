require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        console.log("Attempting to list available models...\n");

        // Try different model names that might work
        const modelsToTry = [
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-pro",
            "models/gemini-pro",
            "models/gemini-1.5-pro",
            "models/gemini-1.5-flash"
        ];

        for (const modelName of modelsToTry) {
            try {
                console.log(`Trying: ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello");
                console.log(`✅ SUCCESS with model: ${modelName}\n`);
                return modelName;
            } catch (e) {
                console.log(`❌ Failed: ${e.message.substring(0, 100)}...\n`);
            }
        }

        console.log("No working model found.");
    } catch (error) {
        console.error("Error:", error.message);
    }
}

listModels();
