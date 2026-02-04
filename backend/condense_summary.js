require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI just like in server.js
let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("✅ Gemini AI initialized\n");
} else {
    console.error("❌ GEMINI_API_KEY not found");
    process.exit(1);
}

async function condenseSummary(originalSummary) {
    try {
        // Use the same model configuration as auditSummaryService.js
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Condense this audit summary into 2-3 concise sentences while keeping all critical info (merchant, product, status, findings):

"${originalSummary}"

Return ONLY the condensed paragraph, no extra formatting.`;

        const result = await model.generateContent(prompt);
        const condensed = result.response.text().trim();

        console.log("📝 Original Summary:");
        console.log(originalSummary);
        console.log("\n✅ Condensed Summary:");
        console.log(condensed);
        console.log("\n");

        return condensed;
    } catch (error) {
        console.error("❌ Gemini Error:", error.message);

        // Fallback: Manual condensation
        const parts = originalSummary.split('. ');
        const condensed = `${parts[0]}. ${parts[parts.length - 1]}`;
        console.log("\n⚠️ Using fallback condensation:");
        console.log(condensed);
        return condensed;
    }
}

// The summary from the audit
const originalSummary = "The audit conducted on recently for Audit Checklist regarding their Standard Checkout product has resulted in an overall status of Pass. The evaluation focused on several critical payment pillars, including core payment methods, standard mechanisms, Webhooks, and Refund processing. The findings indicate that most items are in good standing with no major operational failures observed. Because of the current integration state, there are no major recommendations for changes or improvements at this time.";

condenseSummary(originalSummary);
