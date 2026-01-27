require('dotenv').config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI
let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("✅ Gemini AI initialized");
} else {
    console.warn("⚠️ GEMINI_API_KEY not configured. Merchant enrichment disabled.");
}

const app = express();
const PORT = 5001; // Changed to 5001 to avoid macOS AirPlay/ControlCenter conflict

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("Created uploads directory");
}

/* ✅ CORS requests */
app.use(cors()); // Allow all origins to fix Network IP issues

// app.options("*", cors()); // Removed for Express 5 compatibility

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const validTypes = [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ];
        if (!validTypes.includes(file.mimetype)) {
            return cb(new Error("Only Excel files allowed (.xls, .xlsx)"));
        }
        cb(null, true);
    },
});

// Function to search for merchant information using Gemini
async function searchMerchantInfo(merchantName, merchantId) {
    if (!genAI) {
        console.log("Gemini API not configured, skipping merchant search");
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        const prompt = `Search the web and provide comprehensive information about the company "${merchantName}". Include:
1. Official website URL
2. Business description (what they do)
3. Industry/sector
4. Company size (if available)
5. Location/headquarters
6. Key products or services

Format the response as a JSON object with these exact keys: website, description, industry, company_size, location, products_services. If any information is not available, use "Not found" as the value.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Try to parse JSON from response
        let parsedData;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
            if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[1]);
            } else {
                parsedData = JSON.parse(responseText);
            }
        } catch (parseError) {
            // If parsing fails, store the raw response
            parsedData = {
                raw_response: responseText,
                website: "Not found",
                description: "Not found",
                industry: "Not found",
                company_size: "Not found",
                location: "Not found",
                products_services: "Not found"
            };
        }

        return {
            merchant_name: merchantName,
            merchant_id: merchantId,
            search_date: new Date().toISOString(),
            web_data: parsedData
        };
    } catch (error) {
        console.error("Error searching merchant info:", error);
        return {
            merchant_name: merchantName,
            merchant_id: merchantId,
            search_date: new Date().toISOString(),
            error: error.message,
            web_data: null
        };
    }
}

// Function to store merchant enrichment data
function storeMerchantEnrichment(enrichmentData) {
    if (!enrichmentData) return;

    const dataPath = path.join(__dirname, "data", "merchant_enrichment_data.json");
    let storage = { enrichments: [] };

    if (fs.existsSync(dataPath)) {
        try {
            const fileData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
            if (fileData) storage = fileData;
        } catch (e) {
            console.error("Error reading merchant enrichment file:", e);
        }
    }

    enrichmentData.id = storage.enrichments.length + 1;
    storage.enrichments.push(enrichmentData);

    fs.writeFileSync(dataPath, JSON.stringify(storage, null, 2));
    console.log(`✅ Merchant enrichment data stored for: ${enrichmentData.merchant_name}`);
}

app.post("/upload", (req, res) => {
    upload.single("checklist")(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error("Multer Error:", err);
            return res.status(500).json({ message: "Multer upload error", error: err.message });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error("Unknown Upload Error:", err);
            return res.status(500).json({ message: "Unknown upload error", error: err.message });
        }

        // Everything went fine.
        if (!req.file) {
            console.error("No file received. Body:", req.body);
            return res.status(400).json({ message: "No checklist uploaded" });
        }

        console.log("File uploaded successfully:", req.file);
        console.log("Request Body:", req.body);
        console.log("Processing for product:", req.body.product);

        try {
            // Parse the uploaded Excel file
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0]; // Assume data is in the first sheet

            // Get raw data as array of arrays
            const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

            // Transformation Logic
            let result;
            const productType = req.body.product || "Unknown";

            if (productType === "Charge at Will") {
                const auditId = "audit_" + Date.now() + "_" + Math.round(Math.random() * 1000);
                result = {
                    audit_id: auditId,
                    merchant_info: {
                        name: "",
                        mid: "",
                        date: ""
                    },
                    audit_data: []
                };

                let currentSectionName = null;

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    // Columns: A=0, B=1, C=2, D=3, E=4
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const colC = row[2] ? String(row[2]).trim() : "";
                    const colD = row[3] ? String(row[3]).trim() : "";
                    const colE = row[4] ? String(row[4]).trim() : "";

                    // Safe Metadata Extraction
                    const isHeaderRow = colB === "Audit Checklist" || colB === "Tech Checklist" || colC === "Configs";

                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.name = val;
                        else if (colB && !isHeaderRow) result.merchant_info.name = colB;
                    }
                    if (lowerA.includes("mid")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.mid = val;
                        // Avoid picking up section numbers like "1. Methods Enabled" as MID
                        else if (colB && !isHeaderRow && !colB.match(/^\d+\./)) result.merchant_info.mid = colB;
                    }
                    if (lowerA.includes("date of audit")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.date = val;
                        else if (colB && !isHeaderRow && !colB.match(/^\d+\./)) result.merchant_info.date = colB;
                    }

                    if (isHeaderRow) continue;

                    // Section Detection (Col B has value)
                    // Ensure it's not a metadata row label
                    if (colB && !lowerA.includes("mx name") && !lowerA.includes("mid") && !lowerA.includes("date of audit")) {
                        currentSectionName = colB;
                    }

                    // Item Detection (Col C has value)
                    if (colC) {
                        const checkItem = {
                            item: colC,
                            status: colD || null,
                            comment: colE || null
                        };

                        // Find section or create if missing
                        let sectionObj = result.audit_data.find(s => s.section === currentSectionName);
                        if (!sectionObj) {
                            const secName = currentSectionName || "General";
                            sectionObj = result.audit_data.find(s => s.section === secName);
                            if (!sectionObj) {
                                sectionObj = { section: secName, checks: [] };
                                result.audit_data.push(sectionObj);
                            }
                        }

                        sectionObj.checks.push(checkItem);
                    }
                }
            } else if (productType === "Route") {
                // Specialized Logic for Route
                const routeDataPath = path.join(__dirname, "data", "route_checklist_data.json");

                // 1. Define the exact 26 hierarchical items (Seed Data)
                const ROUTE_CANONICAL_TEMPLATE = [
                    { cat: "1. Linked account creation", sub: "a. Batch upload", item: "Batch upload" },
                    { cat: "1. Linked account creation", sub: "b. Dashboard", item: "Dashboard" },
                    { cat: "1. Linked account creation", sub: "b. Dashboard", item: "i. Dashboard access to linked account" },
                    { cat: "1. Linked account creation", sub: "c. API", item: "API" },
                    { cat: "1. Linked account creation", sub: "c. API", item: "i. Create linked account API" },
                    { cat: "1. Linked account creation", sub: "c. API", item: "ii. Create stakeholder" },
                    { cat: "1. Linked account creation", sub: "c. API", item: "iii. Request product config" },
                    { cat: "1. Linked account creation", sub: "c. API", item: "iv. Update product config" },
                    { cat: "2. Transfer process to linked account", sub: "a. Batch upload", item: "Batch upload" },
                    { cat: "2. Transfer process to linked account", sub: "b. Dashboard", item: "Dashboard" },
                    { cat: "2. Transfer process to linked account", sub: "c. API", item: "API" },
                    { cat: "2. Transfer process to linked account", sub: "c. API", item: "i. Transfer via order" },
                    { cat: "2. Transfer process to linked account", sub: "c. API", item: "ii. Transfer via payment" },
                    { cat: "2. Transfer process to linked account", sub: "c. API", item: "iii. Direct transfer" },
                    { cat: "3. For failure transfers", sub: "a. Consumes Error Codes", item: "Consumes Error Codes" },
                    { cat: "4. LA creation and transfer platform", sub: "a. Platform", item: "Platform" },
                    { cat: "4. LA creation and transfer platform", sub: "b. Server language/SDK", item: "Server language/SDK" },
                    { cat: "5. Verify Transfer and Settlement Status", sub: "a. Webhooks (url and events )", item: "Webhooks (url and events )" },
                    { cat: "5. Verify Transfer and Settlement Status", sub: "b. Verify webhook signature", item: "Verify webhook signature" },
                    { cat: "5. Verify Transfer and Settlement Status", sub: "c. Fetch payment APIs", item: "Fetch payment APIs" },
                    { cat: "6. Refund or Reversal", sub: "a. Dashboard", item: "Dashboard" },
                    { cat: "6. Refund or Reversal", sub: "b. API", item: "API" },
                    { cat: "7. Settlement", sub: "a. Normal settlement", item: "Normal settlement" },
                    { cat: "7. Settlement", sub: "b. Instant settlement", item: "Instant settlement" },
                    { cat: "8. UAT Sign Off", sub: "N/A", item: "Sign Off / Action Item" },
                    { cat: "Additional Comments", sub: "N/A", item: "Additional Comments" }
                ];

                // Initialize Route Storage
                let routeStorage = {
                    route_audit_sessions: [],
                    route_template_items: [],
                    route_audit_results: []
                };

                if (fs.existsSync(routeDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(routeDataPath, "utf8"));
                        if (fileData) routeStorage = fileData;
                    } catch (e) { console.error("Error reading route data file:", e); }
                }

                // 2. Ensure Template is seeded with the exactly 26 items
                if (routeStorage.route_template_items.length === 0) {
                    routeStorage.route_template_items = ROUTE_CANONICAL_TEMPLATE.map((t, idx) => ({
                        id: idx + 1,
                        category_id: parseInt(t.cat) || 0,
                        category_name: t.cat,
                        sub_category: t.sub,
                        item_description: t.item,
                        sort_order: idx + 1
                    }));
                }

                const sessionId = routeStorage.route_audit_sessions.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: "",
                    merchant_name: "",
                    audit_date: "",
                    created_at: new Date().toISOString()
                };

                // 3. Precise Parsing
                let currentCategory = "";
                let currentSubCategory = "";

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const colC = row[2] ? String(row[2]).trim() : "";
                    const colD = row[3] ? String(row[3]).trim() : "";
                    const colE = row[4] ? String(row[4]).trim() : "";

                    // Safe Metadata Extraction
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) sessionRecord.merchant_name = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) sessionRecord.merchant_id = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) sessionRecord.audit_date = colA.split(":")[1]?.trim() || colB;

                    if (row.join(" ").includes("Additional Comments")) currentCategory = "Additional Comments";

                    if (colB && colB.match(/^\d+\./)) {
                        currentCategory = colB;
                    }

                    // Map specific row to canonical item
                    if (colC && colC !== "Configs" && colC !== "Status") {
                        // Detect Sub-Category Marker (e.g., "a. Batch upload")
                        if (colC.match(/^[a-hj-z]\./) || ["API", "Dashboard"].includes(colC)) {
                            currentSubCategory = colC;
                        }

                        // Find the best matching canonical item
                        const templateItem = routeStorage.route_template_items.find(t => {
                            // Match by category and (item description OR sub-category)
                            return t.category_name === currentCategory &&
                                (t.item_description === colC || t.sub_category === colC);
                        });

                        if (templateItem) {
                            // Update or Insert result
                            let resultEntry = routeStorage.route_audit_results.find(r =>
                                r.session_id === sessionId && r.template_item_id === templateItem.id
                            );

                            if (!resultEntry) {
                                resultEntry = {
                                    id: routeStorage.route_audit_results.length + 1,
                                    session_id: sessionId,
                                    template_item_id: templateItem.id,
                                    status: colD || "N/A",
                                    comment: colE || ""
                                };
                                routeStorage.route_audit_results.push(resultEntry);
                            } else {
                                if (colD) resultEntry.status = colD;
                                if (colE) resultEntry.comment = colE;
                            }
                        }
                    }
                }

                // 4. Fill in entries for ANY canonical items that were missing in the uploaded file (Ensure 26 items)
                routeStorage.route_template_items.forEach(t => {
                    const exists = routeStorage.route_audit_results.find(r =>
                        r.session_id === sessionId && r.template_item_id === t.id
                    );
                    if (!exists) {
                        routeStorage.route_audit_results.push({
                            id: routeStorage.route_audit_results.length + 1,
                            session_id: sessionId,
                            template_item_id: t.id,
                            status: "N/A",
                            comment: ""
                        });
                    }
                });

                routeStorage.route_audit_sessions.push(sessionRecord);
                fs.writeFileSync(routeDataPath, JSON.stringify(routeStorage, null, 2));

                // Construct Response JSON
                const recentResults = routeStorage.route_audit_results.filter(r => r.session_id === sessionId);
                const checklistResponse = [];
                const uniqueCategories = [...new Set(routeStorage.route_template_items.map(t => t.category_name))];

                uniqueCategories.forEach(cat => {
                    const subItems = routeStorage.route_template_items
                        .filter(t => t.category_name === cat)
                        .map(t => {
                            const res = recentResults.find(r => r.template_item_id === t.id);
                            return { label: t.item_description, status: res ? res.status : "N/A", comment: res ? res.comment : "" };
                        });
                    if (subItems.length > 0) checklistResponse.push({ category: cat, sub_items: subItems });
                });

                result = {
                    product: "Route",
                    session_id: sessionId,
                    audit_metadata: {
                        merchant_id: sessionRecord.merchant_id,
                        merchant_name: sessionRecord.merchant_name
                    },
                    checklist: checklistResponse
                };

                // Save to individual session file (e.g., backend/data/route_audits/audit_1_TestMX.json)
                const routeAuditsDir = path.join(__dirname, "data", "route_audits");
                if (!fs.existsSync(routeAuditsDir)) fs.mkdirSync(routeAuditsDir, { recursive: true });

                const safeMxName = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                const sessionFilename = `route_audit_${sessionId}_${safeMxName}.json`;
                fs.writeFileSync(path.join(routeAuditsDir, sessionFilename), JSON.stringify(result, null, 2));
                console.log(`Individual Route audit saved to: ${sessionFilename}`);
            } else if (productType === "Subscriptions") {
                // Specialized Logic for Subscriptions
                const subDataPath = path.join(__dirname, "data", "subscription_checklist_data.json");

                const SUBSCRIPTION_CANONICAL_TEMPLATE = [
                    { cat: "1. Methods Enabled", hint: "", item: "E Mandate" },
                    { cat: "1. Methods Enabled", hint: "", item: "UPI Autopay" },
                    { cat: "1. Methods Enabled", hint: "", item: "Card Mandates" },
                    { cat: "1. Methods Enabled", hint: "", item: "Paper Nach" },
                    { cat: "2. Plan creation", hint: "", item: "Period" },
                    { cat: "2. Plan creation", hint: "", item: "Interval" },
                    { cat: "3. Subscription creation", hint: "", item: "Plan_id" },
                    { cat: "3. Subscription creation", hint: "", item: "total_count" },
                    { cat: "3. Subscription creation", hint: "", item: "Addons" },
                    { cat: "3. Checkout configuration", hint: "", item: "Handler Function" },
                    { cat: "3. Checkout configuration", hint: "", item: "Callback function [w/o Redirect]" },
                    { cat: "3. Checkout configuration", hint: "", item: "Deeplink Handling (S2S Checkout)" },
                    { cat: "3. Checkout configuration", hint: "", item: "consent_to_save_card / save" },
                    { cat: "4. For Successful transactions", hint: "", item: "Consumes / Verify payment_id, order_id and razorpay_signature (Standard and Custom Checkout)" },
                    { cat: "4. For Successful transactions", hint: "", item: "Fetch status of Payment_id and Subscription_id" },
                    { cat: "5. For Failure transactions", hint: "", item: "Consumes Error Codes" },
                    { cat: "6. Subscription Management", hint: "", item: "Fetch a Plan" },
                    { cat: "6. Subscription Management", hint: "", item: "Fetch a Subscription" },
                    { cat: "6. Subscription Management", hint: "", item: "Cancel a Subscription" },
                    { cat: "6. Subscription Management", hint: "", item: "Update a Subscription" },
                    { cat: "6. Subscription Management", hint: "", item: "Pause a Subscription" },
                    { cat: "6. Subscription Management", hint: "", item: "Resume a Subscription" },
                    { cat: "7. Autoacapture Settings", hint: "", item: "2 Days for UPI and 3 Days for other methods" },
                    { cat: "8. Late Auth Scenarios", hint: "", item: "Consumes payment state at capture time" },
                    { cat: "9. Verify Payment / Token Status", hint: "Events:", item: "Webhooks" },
                    { cat: "9. Verify Payment / Token Status", hint: "", item: "Fetch payment APIs (Fallback)" },
                    { cat: "10. Checkout library, server language, version", hint: "", item: "Platform" },
                    { cat: "10. Checkout library, server language, version", hint: "Type:", item: "Checkout Type" },
                    { cat: "10. Checkout library, server language, version", hint: "Version:", item: "Server language/SDK" },
                    { cat: "11. Refund Api's", hint: "", item: "Using Refund api's" },
                    { cat: "12. Recurring Terminals", hint: "", item: "upi_icici" },
                    { cat: "12. Recurring Terminals", hint: "", item: "enach_rbl" },
                    { cat: "12. Recurring Terminals", hint: "Others:", item: "hitachi / fulcrum" },
                    { cat: "13. Feature Flags", hint: "", item: "Subscription" },
                    { cat: "13. Feature Flags", hint: "", item: "recurring_upi_intent" },
                    { cat: "13. Feature Flags", hint: "", item: "save_vpa" },
                    { cat: "13. Feature Flags", hint: "", item: "allow_dc_recurring" },
                    { cat: "13. Feature Flags", hint: "", item: "tokenization flags for cards" },
                    { cat: "13. Feature Flags", hint: "", item: "allow_billdesk_sihub" },
                    { cat: "Additional Comments", hint: "", item: "Additional Comments" }
                ];

                let subStorage = {
                    subscription_audits: [],
                    subscription_checklist_template: [],
                    subscription_audit_results: []
                };

                if (fs.existsSync(subDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(subDataPath, "utf8"));
                        if (fileData) subStorage = fileData;
                    } catch (e) { console.error("Error reading sub data file:", e); }
                }

                if (subStorage.subscription_checklist_template.length === 0) {
                    subStorage.subscription_checklist_template = SUBSCRIPTION_CANONICAL_TEMPLATE.map((t, idx) => ({
                        item_id: idx + 1,
                        category: t.cat,
                        item_description: t.item,
                        config_hint: t.hint,
                        sort_order: idx + 1
                    }));
                }

                const sessionId = subStorage.subscription_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: "",
                    merchant_name: "",
                    audit_date: "",
                    created_at: new Date().toISOString()
                };

                let currentCategoryForSub = "";
                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const colC = row[2] ? String(row[2]).trim() : "";
                    const colD = row[3] ? String(row[3]).trim() : "";
                    const colE = row[4] ? String(row[4]).trim() : "";

                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) sessionRecord.merchant_name = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) sessionRecord.merchant_id = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) sessionRecord.audit_date = colA.split(":")[1]?.trim() || colB;

                    if (colB && colB.match(/^\d+\./)) currentCategoryForSub = colB;
                    if (row.join(" ").includes("Additional Comments")) currentCategoryForSub = "Additional Comments";

                    if (colC && colC !== "Configs" && colC !== "Status") {
                        const templateItem = subStorage.subscription_checklist_template.find(t =>
                            t.category === currentCategoryForSub && (t.item_description === colC || t.item_description.includes(colC))
                        );

                        if (templateItem) {
                            subStorage.subscription_audit_results.push({
                                id: subStorage.subscription_audit_results.length + 1,
                                audit_id: sessionId,
                                item_id: templateItem.item_id,
                                status: colD || "N/A",
                                comment: colE || ""
                            });
                        }
                    }
                }

                // Fill missing 
                subStorage.subscription_checklist_template.forEach(t => {
                    if (!subStorage.subscription_audit_results.find(r => r.audit_id === sessionId && r.item_id === t.item_id)) {
                        subStorage.subscription_audit_results.push({
                            id: subStorage.subscription_audit_results.length + 1,
                            audit_id: sessionId,
                            item_id: t.item_id,
                            status: "N/A",
                            comment: ""
                        });
                    }
                });

                subStorage.subscription_audits.push(sessionRecord);
                fs.writeFileSync(subDataPath, JSON.stringify(subStorage, null, 2));

                const recentResults = subStorage.subscription_audit_results.filter(r => r.audit_id === sessionId);
                const checklistResp = [];
                const uniqueCats = [...new Set(subStorage.subscription_checklist_template.map(t => t.category))];

                uniqueCats.forEach(cat => {
                    const items = subStorage.subscription_checklist_template
                        .filter(t => t.category === cat)
                        .map(t => {
                            const res = recentResults.find(r => r.item_id === t.item_id);
                            return { item: t.item_description, status: res ? res.status : "N/A", hint: t.config_hint, comment: res ? res.comment : "" };
                        });
                    checklistResp.push({ category: cat, checks: items });
                });

                result = {
                    product: "Subscriptions",
                    audit_metadata: { mx_name: sessionRecord.merchant_name, mid: sessionRecord.merchant_id, date: sessionRecord.audit_date },
                    checklist_content: checklistResp
                };

                const subAuditsDir = path.join(__dirname, "data", "subscription_audits");
                if (!fs.existsSync(subAuditsDir)) fs.mkdirSync(subAuditsDir, { recursive: true });
                const safeMxNameSub = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                fs.writeFileSync(path.join(subAuditsDir, `subscription_audit_${sessionId}_${safeMxNameSub}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual Subscription audit saved to: subscription_audit_${sessionId}_${safeMxNameSub}.json`);
            } else {
                // Generic/Existing Logic for other products
                result = {
                    auditChecklist: [],
                    additionalComments: ""
                };

                let currentSection = null;
                let captureComments = false;

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const colC = row[2] ? String(row[2]).trim() : "";
                    const colD = row[3] ? String(row[3]).trim() : "";

                    if (colA.toLowerCase().startsWith("mx name") || colA.toLowerCase().startsWith("mid") || colA.toLowerCase().startsWith("date of audit")) continue;

                    if ((!colA && !colB && !colC && !colD) || colA === "Tech Checklist" || colA === "Audit Checklist") continue;

                    if (colA === "Additional Comments") {
                        captureComments = true;
                        continue;
                    }

                    if (captureComments) {
                        if (colA) result.additionalComments += (result.additionalComments ? "\n" : "") + colA;
                        continue;
                    }

                    if (colA && !colB && !colC && !colD) {
                        currentSection = { section: colA, configs: [] };
                        result.auditChecklist.push(currentSection);
                        continue;
                    }

                    if (colB) {
                        const configItem = {
                            item: colB,
                            status: colC || "N/A",
                            comment: colD || ""
                        };
                        if (!currentSection) {
                            currentSection = { section: "General", configs: [] };
                            result.auditChecklist.push(currentSection);
                        }
                        currentSection.configs.push(configItem);
                    }
                }
            }

            // Define path for data storage
            const dataFilePath = path.join(__dirname, "data", "checklist_data.json");

            // Skip general storage for Route and Subscriptions and QR Code (saved in their own files)
            if (productType !== "Route" && productType !== "Subscriptions" && productType !== "QR Code" && productType !== "NCApps" && productType !== "Affordability Widget" && productType !== "Standard Checkout" && productType !== "Custom Checkout" && productType !== "S2S") {
                // Read existing data
                let existingData = [];
                if (fs.existsSync(dataFilePath)) {
                    const fileContent = fs.readFileSync(dataFilePath, "utf8");
                    try {
                        existingData = JSON.parse(fileContent);
                        if (!Array.isArray(existingData)) existingData = [];
                    } catch (e) { existingData = []; }
                }

                // Append new data (add timestamp for tracking)
                const newDataEntry = {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    product: productType,
                    uploadDate: new Date().toISOString(),
                    data: result
                };
                existingData.push(newDataEntry);

                // Write back to file
                fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2));
                console.log("Data extracted and saved to checklist_data.json");
            } else {
                console.log(`${productType} data stored exclusively in its specific file.`);
            }

            const extractedCount = result.audit_data ? result.audit_data.length :
                (result.auditChecklist ? result.auditChecklist.length :
                    (result.results ? result.results.length : 0));

            // --- NCApps Specific Logic ---
            if (productType === "NCApps") {
                console.log("Entering NCApps logic...");
                const ncappsDataPath = path.join(__dirname, "data", "ncapps_checklist_data.json");
                const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

                const NCAPPS_CANONICAL_TEMPLATE = [
                    { cat: "1. Live Keys", item: "Downloading Keys" },
                    { cat: "1. Live Keys", item: "Set Expiry" },
                    { cat: "1. Live Keys", item: "Regenerate Keys" },
                    { cat: "2. Implementation Setup", item: "Standard Checkout" },
                    { cat: "2. Implementation Setup", item: "Custom Checkout" },
                    { cat: "2. Implementation Setup", item: "S2S" },
                    { cat: "3. Features Enabled", item: "Native Checkout" },
                    { cat: "4. Image Content", item: "Image Content URL" },
                    { cat: "5 Terminals Enabled", item: "Type Online" },
                    { cat: "6. Methods Enabled", item: "Payment Methods" },
                    { cat: "7. Capture Settings", item: "Auto Capture & Manual Capture" },
                    { cat: "8. For successful transactions", item: "Consumes payment_id, order_id" },
                    { cat: "8. For successful transactions", item: "Verify payment signature step" },
                    { cat: "9. For failure transactions", item: "Consumes Error Codes" },
                    { cat: "10. Late Auth Scenarios", item: "Consumes payment state at capture time" },
                    { cat: "11. Verify Payment Status", item: "Webhooks" },
                    { cat: "11. Verify Payment Status", item: "Verify webhook signature" },
                    { cat: "11. Verify Payment Status", item: "Fetch payment APIs" },
                    { cat: "12. Offers", item: "Offers API / Dashboard" },
                    { cat: "13. Refund APIs", item: "Refund APIs" },
                    { cat: "14. UAT Sign Off", item: "Sign Off / Action Item" }
                ];

                const NCAPPS_COMMENT_TEMPLATE = [
                    "webhook Url for payment",
                    "Webhook Events"
                ];

                let ncappsStorage = {
                    ncapps_audits: [],
                    ncapps_checklist_template: [],
                    ncapps_comment_templates: [],
                    ncapps_audit_results: [],
                    ncapps_comment_values: []
                };

                if (fs.existsSync(ncappsDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(ncappsDataPath, "utf8"));
                        if (fileData) ncappsStorage = fileData;
                    } catch (e) {
                        console.error("Error reading NCApps data file:", e);
                        // Keep default structure if error
                    }
                }

                // Seed templates if empty
                if (ncappsStorage.ncapps_checklist_template.length === 0) {
                    ncappsStorage.ncapps_checklist_template = NCAPPS_CANONICAL_TEMPLATE.map((t, idx) => ({
                        item_id: idx + 1,
                        category: t.cat,
                        item_description: t.item,
                        sort_order: idx + 1
                    }));
                }
                if (ncappsStorage.ncapps_comment_templates.length === 0) {
                    ncappsStorage.ncapps_comment_templates = NCAPPS_COMMENT_TEMPLATE.map((label, idx) => ({
                        id: idx + 1,
                        field_label: label
                    }));
                }

                let merchantId = "";
                let merchantName = "";
                let auditDate = "";

                // Metadata Loop
                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) merchantName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) merchantId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) auditDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = ncappsStorage.ncapps_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: merchantId || "Unknown",
                    merchant_name: merchantName || "Audit Checklist",
                    audit_date: auditDate || "",
                    created_at: new Date().toISOString()
                };
                ncappsStorage.ncapps_audits.push(sessionRecord);

                let currentCategory = "";
                let processedChecklistItems = [];
                // processedCommentItems not strictly needed if we just append, but good for tracking uniqueness if required.

                data.forEach(row => {
                    let cat = row["Audit Checklist"] || currentCategory;
                    if (row["Audit Checklist"]) currentCategory = cat;

                    let item = row["Configs"];
                    let status = row["Status"] || "N/A";
                    let comment = row["Comment"] || "";

                    if (!item) return;
                    item = item.trim();

                    // Check if it's a checklist item
                    const templateMatch = NCAPPS_CANONICAL_TEMPLATE.find(t => t.item === item && (t.cat === (cat ? cat.trim() : "") || !cat));

                    if (templateMatch) {
                        const templateItem = ncappsStorage.ncapps_checklist_template.find(t => t.item_description === item && t.category === templateMatch.cat);
                        if (templateItem) {
                            ncappsStorage.ncapps_audit_results.push({
                                id: ncappsStorage.ncapps_audit_results.length + 1,
                                session_id: sessionId,
                                template_id: templateItem.item_id,
                                status: status,
                                specific_comment: comment
                            });
                            processedChecklistItems.push(templateItem.item_id);
                        }
                    }

                    // Check if it's a comment field (split-brain logic)
                    const commentTemplate = ncappsStorage.ncapps_comment_templates.find(t => t.field_label === item);
                    if (commentTemplate) {
                        // Use status or comment as the value, usually configs for these rows might be in 'Configs' or 'Status' column? 
                        // Based on user request/previous QR code logic examples: 
                        // "webhook Url for payment" -> Value "https://..."
                        // In QR code logic we took 'Configs' as item and 'Comment' or 'Status' as value? 
                        // Actually in QR Code logic: 
                        // const label = row["Audit Checklist"];
                        // const value = row["Configs"];
                        // So here we should probably check if 'item' (from Configs) is the label? 
                        // Wait, data.forEach(row => ... item = row["Configs"]

                        // Revised loop for Comments to match QR Code logic if structure is similar
                        // Use 'Audit Checklist' col for Label and 'Configs' col for Value?
                        // Let's do a separate pass or check row["Audit Checklist"]
                    }
                });

                // Re-iterate for strictly Comment Template Items where Label is in Column A (Audit Checklist)
                data.forEach(row => {
                    const label = row["Audit Checklist"];
                    const value = row["Configs"]; // This is likely the value for comment fields
                    if (!label) return;

                    const commentTemplate = ncappsStorage.ncapps_comment_templates.find(t => t.field_label === label.trim());
                    if (commentTemplate) {
                        ncappsStorage.ncapps_comment_values.push({
                            id: ncappsStorage.ncapps_comment_values.length + 1,
                            session_id: sessionId,
                            comment_template_id: commentTemplate.id,
                            field_value: value || ""
                        });
                    }
                });

                // Fill in N/A for missing checklist items
                ncappsStorage.ncapps_checklist_template.forEach(t => {
                    if (!processedChecklistItems.includes(t.item_id)) {
                        ncappsStorage.ncapps_audit_results.push({
                            id: ncappsStorage.ncapps_audit_results.length + 1,
                            session_id: sessionId,
                            template_id: t.item_id,
                            status: "N/A",
                            specific_comment: ""
                        });
                    }
                });

                fs.writeFileSync(ncappsDataPath, JSON.stringify(ncappsStorage, null, 2));

                // Construct Response
                let checklistResp = [];
                let groupedCategories = {};

                ncappsStorage.ncapps_checklist_template.forEach(t => {
                    if (!groupedCategories[t.category]) groupedCategories[t.category] = [];
                    const res = ncappsStorage.ncapps_audit_results.find(r => r.session_id === sessionId && r.template_id === t.item_id);
                    groupedCategories[t.category].push({
                        item: t.item_description,
                        status: res ? res.status : "N/A",
                        comment: res ? res.specific_comment : ""
                    });
                });

                for (const [cat, items] of Object.entries(groupedCategories)) {
                    checklistResp.push({ category: cat, checks: items });
                }

                let additionalCommentsResp = ncappsStorage.ncapps_comment_templates.map(ct => {
                    const val = ncappsStorage.ncapps_comment_values.find(v => v.session_id === sessionId && v.comment_template_id === ct.id);
                    return { label: ct.field_label, value: val ? val.field_value : "" };
                });

                result = {
                    product: "NCApps",
                    audit_metadata: { mx_name: sessionRecord.merchant_name, mid: sessionRecord.merchant_id, date: sessionRecord.audit_date },
                    checklist_content: checklistResp,
                    additional_comments: additionalCommentsResp
                };

                // Save individual audit file
                const ncappsAuditsDir = path.join(__dirname, "data", "ncapps_audits");
                if (!fs.existsSync(ncappsAuditsDir)) fs.mkdirSync(ncappsAuditsDir, { recursive: true });
                const safeMxName = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                fs.writeFileSync(path.join(ncappsAuditsDir, `ncapps_audit_${sessionId}_${safeMxName}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual NCApps audit saved to: ncapps_audit_${sessionId}_${safeMxName}.json`);
            }

            // --- Go Live Checklist - PG Specific Logic ---
            if (productType === "Standard Checkout" || productType === "Custom Checkout" || productType === "S2S") {
                const goliveDataPath = path.join(__dirname, "data", "golive_checklist_data.json");
                const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

                // Canonical Template from User Request
                const GOLIVE_CANONICAL_TEMPLATE = [
                    { config: "Account Live (Key/Secret)", source: "Admin Dashboard" },
                    { config: "Webhook Configs", source: "Merchant Dashboard" },
                    { config: "Successful Payment IDs", source: "Admin Dashboard" },
                    { config: "Order API Implementation", source: "Admin Dashboard / Payments Table" },
                    { config: "Signature Verification", source: "Coralogix" },
                    { config: "Refund API", source: "Admin Dashboard / Payments Table" },
                    { config: "SDK latest Version", source: "Admin Dashboard / Payments Table" }
                    // Add more items here if the user provides the full list of 22 items. 
                    // For now, using the ones explicitly listed in the prompt + generic mapping.
                ];

                let goliveStorage = {
                    golive_audits: [],
                    golive_results: []
                };

                if (fs.existsSync(goliveDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(goliveDataPath, "utf8"));
                        if (fileData) goliveStorage = fileData;
                    } catch (e) {
                        console.error("Error reading Go Live data file:", e);
                    }
                }

                let merchantId = "";
                let merchantName = "";
                let auditDate = "";

                // Metadata Extraction
                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) merchantName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) merchantId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) auditDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = goliveStorage.golive_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    product: productType,
                    merchant_id: merchantId || "Unknown",
                    merchant_name: merchantName || "Audit Checklist",
                    audit_date: auditDate || "",
                    created_at: new Date().toISOString()
                };
                goliveStorage.golive_audits.push(sessionRecord);

                let processedItems = [];

                data.forEach(row => {
                    // Check various potential column names for Configs
                    let configItem = row["Configs"] || row["Tech Checklist"] || row["Audit Checklist"];
                    let status = row["Status"] || "N/A";
                    let comment = row["Comments"] || row["Comment"] || "";

                    if (!configItem) return;
                    configItem = configItem.trim();

                    // Skip metadata rows if they appear in the data array
                    if (configItem.toLowerCase().includes("mx name") || configItem.toLowerCase().includes("mid")) return;
                    if (configItem.toLowerCase() === "configs" || configItem.toLowerCase() === "tech checklist" || configItem.toLowerCase() === "audit checklist") return;

                    // Determine Source
                    let source = "Unknown";
                    const templateMatch = GOLIVE_CANONICAL_TEMPLATE.find(t => t.config.toLowerCase() === configItem.toLowerCase());
                    if (templateMatch) {
                        source = templateMatch.source;
                    } else {
                        // Heuristic or Default Source if not in canonical list specifically
                        // For this implementation, we will append it as a new item found in this audit
                        source = "Unmapped";
                    }

                    goliveStorage.golive_results.push({
                        id: goliveStorage.golive_results.length + 1,
                        session_id: sessionId,
                        config_item: configItem,
                        source: source,
                        status: status,
                        comment: comment
                    });
                    processedItems.push(configItem);
                });

                fs.writeFileSync(goliveDataPath, JSON.stringify(goliveStorage, null, 2));

                // Construct Response
                const currentAuditResults = goliveStorage.golive_results
                    .filter(r => r.session_id === sessionId)
                    .map(r => ({
                        config: r.config_item,
                        source: r.source,
                        status: r.status,
                        comment: r.comment
                    }));

                result = {
                    product: productType, // Dynamic based on selection
                    audit_metadata: {
                        merchant_id: sessionRecord.merchant_id,
                        date: sessionRecord.audit_date
                    },
                    checklist_content: currentAuditResults
                };

                // Save individual audit file
                const goliveAuditsDir = path.join(__dirname, "data", "golive_audits");
                if (!fs.existsSync(goliveAuditsDir)) fs.mkdirSync(goliveAuditsDir, { recursive: true });
                const safeMxName = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                const safeProduct = productType.replace(/ /g, '_').toLowerCase();
                fs.writeFileSync(path.join(goliveAuditsDir, `golive_${safeProduct}_${sessionId}_${safeMxName}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual Go Live audit saved to: golive_${safeProduct}_${sessionId}_${safeMxName}.json`);
            }

            // --- Affordability Widget Specific Logic ---
            if (productType === "Affordability Widget") {
                const affordabilityDataPath = path.join(__dirname, "data", "affordability_checklist_data.json");
                const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

                const AFFORDABILITY_CANONICAL_TEMPLATE = [
                    { cat: "1. Live Keys", item: "a. Downloading Keys" },
                    { cat: "1. Live Keys", item: "b. Set Expiry" },
                    { cat: "2. Affordability Widget with", item: "a. Shopify" },
                    { cat: "2. Affordability Widget with", item: "b. WooCommerce" },
                    { cat: "2. Affordability Widget with", item: "c. Native Website" }
                ];

                const AFFORDABILITY_COMMENT_TEMPLATE = [
                    "webhook Url for payment",
                    "Webhook Events",
                    "General Notes"
                ];

                let affordabilityStorage = {
                    affordability_audits: [],
                    affordability_checklist_template: [],
                    affordability_comment_templates: [],
                    affordability_audit_results: [],
                    affordability_comment_values: []
                };

                if (fs.existsSync(affordabilityDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(affordabilityDataPath, "utf8"));
                        if (fileData) affordabilityStorage = fileData;
                    } catch (e) { console.error("Error reading Affordability Widget data file:", e); }
                }

                if (affordabilityStorage.affordability_checklist_template.length === 0) {
                    affordabilityStorage.affordability_checklist_template = AFFORDABILITY_CANONICAL_TEMPLATE.map((t, idx) => ({
                        item_id: idx + 1,
                        category: t.cat,
                        item_description: t.item,
                        sort_order: idx + 1
                    }));
                }

                if (affordabilityStorage.affordability_comment_templates.length === 0) {
                    affordabilityStorage.affordability_comment_templates = AFFORDABILITY_COMMENT_TEMPLATE.map((label, idx) => ({
                        id: idx + 1,
                        field_label: label
                    }));
                }

                let merchantId = "";
                let merchantName = "";
                let auditDate = "";

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) merchantName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) merchantId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) auditDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = affordabilityStorage.affordability_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: merchantId || "Unknown",
                    merchant_name: merchantName || "Audit Checklist",
                    audit_date: auditDate || "",
                    created_at: new Date().toISOString()
                };
                affordabilityStorage.affordability_audits.push(sessionRecord);

                let currentCategory = "";
                let processedChecklistItems = [];

                data.forEach(row => {
                    let cat = row["Audit Checklist"] || currentCategory;
                    if (row["Audit Checklist"]) currentCategory = cat;

                    let item = row["Configs"];
                    let status = row["Status"] || "N/A";
                    let comment = row["Comment"] || "";

                    if (cat) cat = cat.trim();
                    if (item) item = item.trim();

                    if (!item) return;

                    const templateMatch = AFFORDABILITY_CANONICAL_TEMPLATE.find(t => t.item === item && (t.cat === (cat || "") || !cat));

                    if (templateMatch) {
                        const templateItem = affordabilityStorage.affordability_checklist_template.find(t => t.item_description === item && t.category === templateMatch.cat);
                        if (templateItem) {
                            affordabilityStorage.affordability_audit_results.push({
                                id: affordabilityStorage.affordability_audit_results.length + 1,
                                session_id: sessionId,
                                template_id: templateItem.item_id,
                                status: status,
                                specific_comment: comment
                            });
                            processedChecklistItems.push(templateItem.item_id);
                        }
                    }
                });

                // Process Comments
                data.forEach(row => {
                    const label = row["Audit Checklist"];
                    const value = row["Configs"];
                    if (!label) return;

                    // Match loosely or exact
                    const commentTemplate = affordabilityStorage.affordability_comment_templates.find(t => t.field_label.toLowerCase() === label.trim().toLowerCase());

                    if (commentTemplate) {
                        affordabilityStorage.affordability_comment_values.push({
                            id: affordabilityStorage.affordability_comment_values.length + 1,
                            session_id: sessionId,
                            comment_template_id: commentTemplate.id,
                            field_value: value || ""
                        });
                    }
                });

                // Fill N/A
                affordabilityStorage.affordability_checklist_template.forEach(t => {
                    if (!processedChecklistItems.includes(t.item_id)) {
                        affordabilityStorage.affordability_audit_results.push({
                            id: affordabilityStorage.affordability_audit_results.length + 1,
                            session_id: sessionId,
                            template_id: t.item_id,
                            status: "N/A",
                            specific_comment: ""
                        });
                    }
                });

                fs.writeFileSync(affordabilityDataPath, JSON.stringify(affordabilityStorage, null, 2));

                // Response Construction
                let checklistResp = [];
                let groupedCategories = {};

                affordabilityStorage.affordability_checklist_template.forEach(t => {
                    if (!groupedCategories[t.category]) groupedCategories[t.category] = [];
                    const res = affordabilityStorage.affordability_audit_results.find(r => r.session_id === sessionId && r.template_id === t.item_id);
                    groupedCategories[t.category].push({
                        config: t.item_description,
                        status: res ? res.status : "N/A"
                    });
                });

                // Convert groupedCategories object to array
                for (const [cat, items] of Object.entries(groupedCategories)) {
                    checklistResp.push({ category: cat, checks: items });
                }

                // Map comments to the user's specific keys if possible, or just dynamic
                const KEY_MAP = {
                    "webhook Url for payment": "webhook_url_for_payment",
                    "Webhook Events": "webhook_events",
                    "General Notes": "general_notes"
                };

                let additionalCommentsResp = {};
                affordabilityStorage.affordability_comment_templates.forEach(ct => {
                    const val = affordabilityStorage.affordability_comment_values.find(v => v.session_id === sessionId && v.comment_template_id === ct.id);
                    const key = KEY_MAP[ct.field_label] || ct.field_label.toLowerCase().replace(/ /g, "_");
                    additionalCommentsResp[key] = val ? val.field_value : "";
                });

                result = {
                    product: "Affordability Widget",
                    audit_metadata: {
                        merchant_id: sessionRecord.merchant_id,
                        date: sessionRecord.audit_date
                    },
                    tech_checklist: checklistResp,
                    additional_comments: additionalCommentsResp
                };

                // Save individual audit file
                const affordabilityAuditsDir = path.join(__dirname, "data", "affordability_audits");
                if (!fs.existsSync(affordabilityAuditsDir)) fs.mkdirSync(affordabilityAuditsDir, { recursive: true });
                const safeMxName = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                fs.writeFileSync(path.join(affordabilityAuditsDir, `affordability_audit_${sessionId}_${safeMxName}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual Affordability audit saved to: affordability_audit_${sessionId}_${safeMxName}.json`);
            }

            // --- QR Code Specific Logic ---
            if (productType === "QR Code") {
                const qrDataPath = path.join(__dirname, "data", "qr_code_checklist_data.json");
                const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

                const QR_CODE_CANONICAL_TEMPLATE = [
                    { cat: "1. Live Keys", item: "Downloading Keys" },
                    { cat: "1. Live Keys", item: "Set Expiry" },
                    { cat: "1. Live Keys", item: "Regenerate Keys" },
                    { cat: "2. QR Code Implementation", item: "Dashboard" },
                    { cat: "2. QR Code Implementation", item: "API" },
                    { cat: "2. QR Code Implementation", item: "Instant QR" },
                    { cat: "2. QR Code Implementation", item: "Dynamic QR" },
                    { cat: "2. QR Code Implementation", item: "Expiry for QR" },
                    { cat: "3. Features Enabled", item: "QR" },
                    { cat: "4. Image Content", item: "Image Content URL" },
                    { cat: "4 Terminals Enabled", item: "Type Online(yesbank, icici)" },
                    { cat: "5. Methods Enabled", item: "Payment Methods" },
                    { cat: "6. Capture Settings", item: "Auto Capture & Manual Capture" },
                    { cat: "7. For successful transactions", item: "Consumes payment_id, order_id" },
                    { cat: "7. For successful transactions", item: "Verify payment signature step" },
                    { cat: "8. For failure transactions", item: "Consumes Error Codes" },
                    { cat: "9. Late Auth Scenarios", item: "Consumes payment state at capture time" },
                    { cat: "10. Verify Payment Status", item: "Webhooks" },
                    { cat: "10. Verify Payment Status", item: "Verify webhook signature" },
                    { cat: "10. Verify Payment Status", item: "Fetch payment APIs" },
                    { cat: "11. Offers", item: "Offers" },
                    { cat: "12. Fetch Payment API's", item: "Fetch Payment API's" },
                    { cat: "Additional Comments", item: "webhook Url for payment" },
                    { cat: "Additional Comments", item: "Webhook Events" }
                ];

                let qrStorage = {
                    qr_audits: [],
                    qr_checklist_template: [],
                    qr_audit_results: []
                };

                if (fs.existsSync(qrDataPath)) {
                    try {
                        const fileData = JSON.parse(fs.readFileSync(qrDataPath, "utf8"));
                        if (fileData) qrStorage = fileData;
                    } catch (e) { console.error("Error reading QR data file:", e); }
                }

                if (qrStorage.qr_checklist_template.length === 0) {
                    qrStorage.qr_checklist_template = QR_CODE_CANONICAL_TEMPLATE.map((t, idx) => ({
                        item_id: idx + 1,
                        category: t.cat,
                        item_description: t.item,
                        sort_order: idx + 1
                    }));
                }

                let merchantId = "";
                let merchantName = "";
                let auditDate = "";

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) merchantName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) merchantId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) auditDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = qrStorage.qr_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: merchantId || "Unknown",
                    merchant_name: merchantName || "Audit Checklist",
                    audit_date: auditDate || "",
                    created_at: new Date().toISOString()
                };
                qrStorage.qr_audits.push(sessionRecord);

                let currentCategory = "";
                let processedItems = [];

                // 1. Process standard body
                data.forEach(row => {
                    let cat = row["Audit Checklist"] || currentCategory;
                    if (row["Audit Checklist"]) currentCategory = cat;

                    let item = row["Configs"];
                    let status = row["Status"] || "N/A";
                    let comment = row["Comment"] || "";

                    if (cat) cat = cat.trim();
                    if (item) item = item.trim();

                    if (!item) return;

                    // Standard Match
                    const templateMatch = QR_CODE_CANONICAL_TEMPLATE.find(t => t.item === item);
                    if (templateMatch) {
                        const templateItem = qrStorage.qr_checklist_template.find(t => t.item_description === item);
                        if (templateItem && templateItem.category !== "Additional Comments") {
                            qrStorage.qr_audit_results.push({
                                id: qrStorage.qr_audit_results.length + 1,
                                audit_id: sessionId,
                                item_id: templateItem.item_id,
                                status: status,
                                comment: comment
                            });
                            processedItems.push(item);
                        }
                    }
                });

                // 2. Handle "Additional Comments" specifically 
                data.forEach(row => {
                    const label = row["Audit Checklist"];
                    const value = row["Configs"];

                    if (label === "webhook Url for payment" || label === "Webhook Events") {
                        const templateItem = qrStorage.qr_checklist_template.find(t => t.item_description === label);
                        if (templateItem && !processedItems.includes(label)) {
                            qrStorage.qr_audit_results.push({
                                id: qrStorage.qr_audit_results.length + 1,
                                audit_id: sessionId,
                                item_id: templateItem.item_id,
                                status: "N/A",
                                comment: value
                            });
                            processedItems.push(label);
                        }
                    }
                });

                fs.writeFileSync(qrDataPath, JSON.stringify(qrStorage, null, 2));

                // Construct Response (Unified Schema)
                let checklistResp = [];
                let groupedCategories = {};

                QR_CODE_CANONICAL_TEMPLATE.forEach(t => {
                    if (!groupedCategories[t.cat]) groupedCategories[t.cat] = [];

                    const templateId = qrStorage.qr_checklist_template.find(tmpl => tmpl.item_description === t.item)?.item_id;
                    const result = qrStorage.qr_audit_results.find(r => r.audit_id === sessionId && r.item_id === templateId);

                    groupedCategories[t.cat].push({
                        item: t.item,
                        status: result ? result.status : "N/A",
                        comment: result ? result.comment : ""
                    });
                });

                for (const [cat, items] of Object.entries(groupedCategories)) {
                    checklistResp.push({
                        category: cat,
                        checks: items
                    });
                }

                // Save individual audit file
                const sessionFileName = `qr_code_audit_${sessionId}_${sessionRecord.merchant_name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
                const sessionFilePath = path.join(__dirname, "data", "qr_code_audits", sessionFileName);
                if (!fs.existsSync(path.join(__dirname, "data", "qr_code_audits"))) {
                    fs.mkdirSync(path.join(__dirname, "data", "qr_code_audits"), { recursive: true });
                }

                const finalJson = {
                    product: "QR Code",
                    audit_metadata: { mx_name: sessionRecord.merchant_name, mid: sessionRecord.merchant_id, date: sessionRecord.audit_date },
                    checklist_content: checklistResp
                };

                fs.writeFileSync(sessionFilePath, JSON.stringify(finalJson, null, 2));

                result = finalJson;
            }

            res.status(200).json({
                message: "Checklist uploaded and data stored successfully",
                file: req.file,
                extractedSections: extractedCount,
                data: result
            });

            // Trigger merchant web search for ALL checklist types (async, don't block response)
            let merchantName = null;
            let merchantId = null;

            // Extract merchant info based on result structure
            if (result && result.audit_metadata) {
                merchantName = result.audit_metadata.mx_name || result.audit_metadata.merchant_name;
                merchantId = result.audit_metadata.mid || result.audit_metadata.merchant_id;
            } else if (result && result.merchant_info) {
                // For CAW and similar formats
                merchantName = result.merchant_info.name;
                merchantId = result.merchant_info.mid;
            }

            // Trigger search if valid merchant found
            if (merchantName && merchantName !== "Unknown" && merchantName !== "Audit Checklist" && merchantName.trim() !== "") {
                console.log(`🔍 Triggering merchant web search for: ${merchantName}`);
                // Run search asynchronously without blocking the response
                searchMerchantInfo(merchantName, merchantId)
                    .then(enrichmentData => {
                        if (enrichmentData) {
                            storeMerchantEnrichment(enrichmentData);
                        }
                    })
                    .catch(err => {
                        console.error("Merchant enrichment error (non-blocking):", err);
                    });
            }

        } catch (parseError) {
            console.error("Error parsing Excel file:", parseError);
            res.status(500).json({ message: "Error processing Excel file", error: parseError.message });
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
