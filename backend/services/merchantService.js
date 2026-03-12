const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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
 * Normalizes a merchant name by removing common noise and ensuring it's not a header.
 * @param {string} name 
 * @returns {string|null} Normalized name or null if invalid.
 */
function normalizeMerchantName(name) {
    if (!name) return null;
    let n = name.toString().trim();

    // Remove common prefixes
    n = n.replace(/^(mx|merchant|customer|client|company)\s*name[:\s]+/i, '');
    n = n.replace(/^[:\s-]+/, '');

    // List of words that indicate this is a header/metadata label, not a name
    const noiseWords = [
        'audit checklist', 'tech checklist', 'configs', 'status', 'item',
        'comment', 'metadata', 'date of audit', 'mid', 'audit summary',
        'checklist', 'unknown', 'n/a', 'mx name', 'merchant name',
        'linked account creation', 'transfer process', 'failure transfers',
        'platform', 'methods enabled', 'plan creation', 'subscription creation',
        'checkout configuration', 'successful transactions', 'failure transactions',
        'management', 'autoacapture', 'recurring terminals', 'feature flags',
        'additional comments', 'qr code', 'live keys', 'dashboard', 'api',
        'instant qr', 'dynamic qr', 'image content', 'terminals enabled',
        'payment methods', 'capture settings', 'late auth scenarios',
        'verify payment status', 'offers', 'fetch payment api', 'webhook url',
        'webhook events', 'affordability', 'subscriptions', 'route', 'qr codes',
        'payment links', 'smart collect', 'charge at will'
    ];

    const lowerN = n.toLowerCase();

    // If it's a known noise word or too short or looks like a section (e.g. "1. Methods")
    if (noiseWords.some(w => lowerN === w || lowerN === w + ':')) return null;
    if (n.length < 2) return null;
    if (n.match(/^\d+\./)) return null;

    // If it's literally "Audit Checklist" or "Unknown" or "the merchant"
    if (['audit checklist', 'unknown', 'the merchant', 'mx name', 'merchant name'].includes(lowerN)) return null;

    return n;
}

/**
 * Extracts the merchant name from the Excel file by checking multiple cells and patterns.
 * @param {string} filePath 
 * @param {string} originalFileName Optional: original filename for fallback extraction
 * @returns {string|null} The merchant name or null if not found.
 */
function extractMerchantName(filePath, originalFileName = null) {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 1. Check A1-B5 area first (most common for metadata)
        const searchRange = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4', 'A5', 'B5'];

        for (const addr of searchRange) {
            const cell = sheet[addr];
            if (cell && cell.v) {
                const val = cell.v.toString().trim();

                // 1. Specific pattern match: "MX Name: [Name]" or "Merchant: [Name]"
                const match = val.match(/^(?:mx|merchant|customer)\s*name[:\s]+(.+)$/i);
                if (match && match[1]) {
                    const normalized = normalizeMerchantName(match[1]);
                    if (normalized) return normalized;
                }

                // 2. If it's a label in one cell, check the next cell
                if (/^(?:mx|merchant|customer)\s*name[:\s]*$/i.test(val)) {
                    const cellAddrObj = xlsx.utils.decode_cell(addr);
                    const nextCellAddr = xlsx.utils.encode_cell({ r: cellAddrObj.r, c: cellAddrObj.c + 1 });
                    const nextCell = sheet[nextCellAddr];
                    if (nextCell && nextCell.v) {
                        const normalized = normalizeMerchantName(nextCell.v);
                        if (normalized) return normalized;
                    }
                }

                // 3. Fallback: If it's not a label, but passes normalization (not a header)
                // and is in a likely spot (like A1 or A2)
                const normalized = normalizeMerchantName(val);
                if (normalized && !val.includes(':') && !val.includes('.')) {
                    // Avoid single words that look like headers even if not in noise list
                    if (val.split(' ').length <= 4) {
                        return normalized;
                    }
                }
            }
        }

        // 2. Scan first 30 rows, first 5 columns for any cell containing name labels
        const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:E30');
        for (let r = 0; r <= Math.min(range.e.r, 30); r++) {
            for (let c = 0; c <= Math.min(range.e.c, 4); c++) {
                const cellAddress = xlsx.utils.encode_cell({ r, c });
                const cell = sheet[cellAddress];
                if (cell && cell.v) {
                    const val = cell.v.toString().trim();

                    // Match pattern in same cell
                    const nameMatch = val.match(/^(?:mx|merchant|customer)\s*name[:\s]+(.+)$/i);
                    if (nameMatch && nameMatch[1]) {
                        const normalized = normalizeMerchantName(nameMatch[1]);
                        if (normalized) return normalized;
                    }

                    // Match label then check next cell
                    if (/^(?:mx|merchant|customer)\s*name[:\s]*$/i.test(val)) {
                        const nextCellAddr = xlsx.utils.encode_cell({ r, c: c + 1 });
                        const nextCell = sheet[nextCellAddr];
                        if (nextCell && nextCell.v) {
                            const normalized = normalizeMerchantName(nextCell.v);
                            if (normalized) return normalized;
                        }
                    }
                }
            }
        }

        // 3. Low Priority Fallback: Filename-based extraction
        if (originalFileName) {
            // Remove extension
            let base = originalFileName.replace(/\.(xlsx|xls|csv)$/i, '');

            // Remove common noise words, underscores and dashes
            const noiseRegex = /(_|audit|checklist|tech|product|integration|standard|caw|subscriptions|route|pg|ncapps)/gi;
            base = base.replace(noiseRegex, ' ');

            // Clean up multiple spaces and trim
            base = base.replace(/[\s\-_]+/g, ' ').trim();

            const normalized = normalizeMerchantName(base);
            if (normalized && normalized.length > 2) return normalized;
        }

        return null; // Truly not found or only noise found
    } catch (error) {
        console.error('Error extracting merchant name:', error.message);
        return null;
    }
}

/**
 * Fetches merchant info using Gemini AI and stores in unified enrichments format.
 * @param {string} merchantName 
 * @param {string} merchantId 
 * @returns {Promise<object>} The enrichment data object.
 */
async function fetchMerchantInfo(merchantName, merchantId = null) {
    if (!merchantName) return null;

    let storage = { enrichments: [] };
    try {
        if (fs.existsSync(MERCHANT_DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(MERCHANT_DATA_FILE, 'utf8'));
            if (Array.isArray(data.enrichments)) {
                storage = data;
            } else {
                storage = { enrichments: [] };
            }
        }
    } catch (e) {
        console.error("Error reading merchant enrichment file:", e);
    }

    const targetName = merchantName.trim().toLowerCase();
    const entry = storage.enrichments.find(e =>
        (e.original_name && e.original_name.trim().toLowerCase() === targetName) ||
        (e.merchant_name && e.merchant_name.trim().toLowerCase() === targetName)
    );

    // Check if we already have good data
    if (entry && entry.web_data && !entry.error) {
        console.log(`Using cached info for ${merchantName}`);

        // Even if using cache, update metadata if it's new
        let changed = false;
        if (!entry.original_name && merchantName) {
            entry.original_name = merchantName;
            changed = true;
        }
        if (merchantId && entry.merchant_id !== merchantId) {
            entry.merchant_id = merchantId;
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(MERCHANT_DATA_FILE, JSON.stringify(storage, null, 2));
            console.log(`Updated metadata for existing merchant: ${merchantName}`);
        }

        return entry;
    }

    // Check for manual override in env
    if (process.env.MERCHANT_SERVICES && merchantName.toLowerCase().includes('ncapps')) {
        console.log(`Using manual override for ${merchantName}`);
        const manualEntry = {
            id: entry ? entry.id : storage.enrichments.length + 1,
            merchant_name: merchantName,
            merchant_id: merchantId,
            search_date: new Date().toISOString(),
            web_data: {
                company_name: merchantName,
                description: process.env.MERCHANT_SERVICES,
                industry: "Public Service / Non-Profit"
            }
        };
        updateOrPushEnrichment(storage, manualEntry);
        return manualEntry;
    }

    console.log(`Fetching info for: ${merchantName} (ID: ${merchantId || 'N/A'})`);

    if (!genAI) {
        const errorEntry = {
            id: entry ? entry.id : storage.enrichments.length + 1,
            merchant_name: merchantName,
            original_name: merchantName,
            merchant_id: merchantId,
            search_date: new Date().toISOString(),
            error: "Gemini API key not configured",
            web_data: null
        };
        updateOrPushEnrichment(storage, errorEntry);
        return errorEntry;
    }

    // Try multiple models in case of quota issues
    const modelsToTry = ["gemini-2.0-flash", "gemini-flash-latest", "gemini-pro-latest"];
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            console.log(`Attempting enrichment with ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                tools: modelName.includes('2.0') ? [{ googleSearchRetrieval: {} }] : []
            });

            const prompt = `Search the web for company information about "${merchantName}". 
            Provide a detailed JSON object with these exact keys:
            - company_name: the official name of the business
            - website: their primary website URL
            - description: a concise summary of what they do
            - industry: the main sector they operate in (e.g., E-commerce, SaaS, Retail)
            - products_services: an array of their main offerings
            - business_model: how they make money (B2B, B2C, D2C)
            - target_audience: who their primary customers are
            
            Return ONLY valid JSON.`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            let parsedData;
            try {
                const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
                parsedData = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);
            } catch (e) {
                parsedData = { description: responseText };
            }

            const enrichmentData = {
                id: entry ? entry.id : storage.enrichments.length + 1,
                merchant_name: parsedData.company_name || merchantName,
                original_name: merchantName,
                merchant_id: merchantId,
                search_date: new Date().toISOString(),
                web_data: parsedData,
                model_used: modelName
            };

            updateOrPushEnrichment(storage, enrichmentData);
            console.log(`✅ Merchant info fetched and cached for ${enrichmentData.merchant_name} using ${modelName}`);
            return enrichmentData;

        } catch (error) {
            console.warn(`Error with ${modelName}: ${error.message}`);
            lastError = error;
            continue;
        }
    }

    // If all models failed
    const finalErrorEntry = {
        id: entry ? entry.id : storage.enrichments.length + 1,
        merchant_name: merchantName,
        original_name: merchantName,
        merchant_id: merchantId,
        search_date: new Date().toISOString(),
        error: lastError ? lastError.message : "All models failed",
        web_data: null
    };

    updateOrPushEnrichment(storage, finalErrorEntry);
    return finalErrorEntry;
}

/**
 * Helper to update existing entry or push new one and save to file.
 */
function updateOrPushEnrichment(storage, enrichmentData) {
    const targetOriginal = (enrichmentData.original_name || "").trim().toLowerCase();
    const targetMerchant = (enrichmentData.merchant_name || "").trim().toLowerCase();

    const existingIndex = storage.enrichments.findIndex(e => {
        const eOrig = (e.original_name || "").trim().toLowerCase();
        const eMerch = (e.merchant_name || "").trim().toLowerCase();
        return (targetOriginal && (eOrig === targetOriginal || eMerch === targetOriginal)) ||
            (targetMerchant && (eOrig === targetMerchant || eMerch === targetMerchant));
    });

    if (existingIndex >= 0) {
        enrichmentData.id = storage.enrichments[existingIndex].id;
        storage.enrichments[existingIndex] = enrichmentData;
    } else {
        storage.enrichments.push(enrichmentData);
    }

    fs.writeFileSync(MERCHANT_DATA_FILE, JSON.stringify(storage, null, 2));
}

module.exports = {
    extractMerchantName,
    fetchMerchantInfo
};
