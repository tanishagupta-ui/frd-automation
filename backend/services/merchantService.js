const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const MERCHANT_DATA_FILE = path.join(__dirname, '../data/merchant_enrichment_data.json');

// Initialize Gemini AI
let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("✅ Gemini AI initialized for merchant enrichment");
} else {
    console.warn("⚠️ GEMINI_API_KEY not configured. Merchant enrichment will be limited.");
}

// Ensure merchant data file exists
if (!fs.existsSync(MERCHANT_DATA_FILE)) {
    fs.writeFileSync(MERCHANT_DATA_FILE, JSON.stringify({}, null, 2));
}

/**
 * Extracts the merchant name from the Excel file by checking A1 and surrounding cells.
 * Expects format: "MX Name: [Name]"
 * @param {string} filePath 
 * @returns {string|null} The merchant name or null if not found.
 */
function extractMerchantName(filePath) {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Check A1 first, then search first 10 rows if not found
        const searchRange = ['A1', 'A2', 'B1', 'B2', 'A3', 'B3'];

        for (const addr of searchRange) {
            const cell = sheet[addr];
            if (cell && cell.v) {
                const val = cell.v.toString().trim();
                const match = val.match(/^MX Name:\s*(.+)$/i);
                if (match && match[1]) return match[1].trim();

                // If it doesn't have the prefix but looks like a name (not a header)
                if (val.length > 3 && !['Audit Checklist', 'Tech Checklist', 'Configs', 'Status'].includes(val)) {
                    // Only return if it's likely a name
                    if (!val.includes(':') && !val.match(/^\d+\./)) {
                        return val;
                    }
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting merchant name:', error.message);
        return null;
    }
}

/**
 * Fetches merchant info using Gemini AI.
 * @param {string} merchantName 
 * @returns {Promise<string>} A short description or fallback message.
 */
async function fetchMerchantInfo(merchantName) {
    if (!merchantName) return null;

    // Check if we already have data for this merchant
    const storedData = JSON.parse(fs.readFileSync(MERCHANT_DATA_FILE, 'utf8'));
    if (storedData[merchantName]) {
        console.log(`Using cached info for ${merchantName}`);
        return storedData[merchantName];
    }

    console.log(`Fetching info for: ${merchantName}`);

    if (!genAI) {
        console.warn('Gemini API not available. Skipping merchant enrichment.');
        return "Merchant enrichment unavailable (API key not configured).";
    }

    try {
        // Use gemini-1.5-flash (Stable)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        const prompt = `Provide a brief 2-3 sentence description about the company or merchant named "${merchantName}". Include what industry they're in and what they do. If this is a test/demo merchant name, just say "Test merchant for demonstration purposes."`;

        const result = await model.generateContent(prompt);
        const info = result.response.text().trim();

        if (info) {
            // Store it
            storedData[merchantName] = info;
            fs.writeFileSync(MERCHANT_DATA_FILE, JSON.stringify(storedData, null, 2));
            console.log(`✅ Merchant info fetched and cached for ${merchantName}`);
            return info;
        } else {
            return "No description generated.";
        }

    } catch (error) {
        console.error('Error fetching merchant info from Gemini:', error.message);
        return "Error fetching merchant info.";
    }
}

module.exports = {
    extractMerchantName,
    fetchMerchantInfo
};
