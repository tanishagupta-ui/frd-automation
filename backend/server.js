require('dotenv').config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const merchantService = require("./services/merchantService");
const auditSummaryService = require("./services/auditSummaryService");
const diagramService = require("./services/diagramService");
const xlsx = require("xlsx");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const frdGenerator = require("./services/frdGeneratorService");
const googleDriveService = require("./services/googleDriveService");

// Initialize Gemini AI
let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'AIzaSyA3ka04wRlpWanOfl-S7hA1Bt_0fxGn_No') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("✅ Gemini AI initialized");
} else {
    console.warn("⚠️ GEMINI_API_KEY not configured. Merchant enrichment disabled.");
}

const app = express();
const PORT = 5001; // Changed to 5001 to avoid macOS AirPlay/ControlCenter conflict


app.use(express.json());
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
app.use("/public", express.static(publicDir));
// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("Created uploads directory");
}

/* ✅ CORS requests */
app.use(cors()); // Allow all origins to fix Network IP issues
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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


// Function to store merchant enrichment data

app.post("/upload", (req, res) => {
    upload.single("checklist")(req, res, async function (err) {
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

        // Centralized Merchant Name Extraction
        let merchantName = null;
        let merchantId = null;
        let merchantInfo = null;

        try {
            merchantName = merchantService.extractMerchantName(req.file.path, req.file.originalname);
            console.log(`[Extraction] Initial extracted name: ${merchantName || 'failing'}`);

            if (merchantName) {
                console.log(`✅ Extracted Merchant Name: ${merchantName}`);
                // Await enrichment to ensure it's stored and available
                try {
                    merchantId = null; // Reset for each upload
                    merchantInfo = await merchantService.fetchMerchantInfo(merchantName);
                    console.log(`✅ Merchant info enriched for: ${merchantName}`);
                    if (merchantInfo && merchantInfo.merchant_name) {
                        // Use the official company name from enrichment if available
                        merchantName = merchantInfo.merchant_name;
                        merchantId = merchantInfo.merchant_id || null;
                    }
                } catch (enrichError) {
                    console.error("Enrichment error:", enrichError);
                    // Don't fail the whole request for enrichment error
                }
            } else {
                console.log("⚠️ Could not extract merchant name from Excel or Filename.");
            }
        } catch (extractionError) {
            console.error("Error in merchant extraction process:", extractionError);
        }

        // Generate payment flow diagram
        let diagramPath = null;
        try {
            const productKey = req.body.product ? req.body.product.toLowerCase().replace(/\s+/g, '_') : null;

            // Map product names to keys
            const productKeyMap = {
                'charge_at_will': 'caw',
                'standard_checkout': 'standard_checkout',
                'custom_checkout': 'custom_checkout',
                'subscriptions': 'subscriptions',
                'payment_links': 'payment_links',
                'qr_codes': 'qr_codes',
                'qr_code': 'qr_codes', // Added alias to match frontend singular
                'route': 'route',
                'smart_collect': 'smart_collect',
                's2s': 's2s',
                'affordability_widget': 'affordability'
            };

            const mappedKey = productKeyMap[productKey];

            if (mappedKey) {
                console.log(`Generating payment flow diagram for: ${mappedKey}`);
                diagramPath = await diagramService.generateDiagram(mappedKey, merchantName);
            } else {
                console.log(`No diagram template for product: ${req.body.product}`);
            }
        } catch (diagramError) {
            console.error("Error generating diagram:", diagramError.message);
        }
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

            if (productType.toLowerCase() === "charge at will") {
                const auditId = "audit_" + Date.now() + "_" + Math.round(Math.random() * 1000);
                result = {
                    audit_id: auditId,
                    merchant_info: {
                        name: "",
                        mid: "",
                        date: ""
                    },
                    audit_data: [],
                    additionalComments: ""
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
                    if (lowerA.includes("mx name") || lowerA.includes("customer name")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.name = val;
                        else if (colB && !isHeaderRow) result.merchant_info.name = colB;
                    }
                    if (lowerA.includes("mid")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.mid = val;
                        else if (colB && !isHeaderRow && !colB.match(/^\d+\./)) result.merchant_info.mid = colB;
                    }
                    if (lowerA.includes("date of audit")) {
                        const val = colA.split(":").slice(1).join(":").trim();
                        if (val) result.merchant_info.date = val;
                        else if (colB && !isHeaderRow && !colB.match(/^\d+\./)) result.merchant_info.date = colB;
                    }

                    // Fallback to centralized name if still empty
                    if ((!result.merchant_info.name || result.merchant_info.name === "Audit Checklist" || result.merchant_info.name === "Unknown") && merchantName) {
                        result.merchant_info.name = merchantName;
                    }

                    if (isHeaderRow) continue;

                    // Section Detection (Col B has value)
                    // If colB is one of the metadata row labels, don't treat it as a section
                    const isMetadataLabel = lowerA.includes("mx name") || lowerA.includes("mid") || lowerA.includes("date of audit");

                    if (colB && colB !== "Audit Checklist" && colB !== "Tech Checklist") {
                        const lowColB = colB.toLowerCase();
                        if (colB.match(/^\d+\./) || lowColB.includes("additional comments") || lowColB === "remarks" || lowColB === "comments") {
                            currentSectionName = colB;
                            console.log(`[ChargeAtWill] Switched to section: ${currentSectionName}`);
                        }
                    }

                    // Item Detection (Col C has value)
                    if (colC && colC !== "Configs") {
                        const checkItem = {
                            item: colC,
                            status: colD || null,
                            comment: colE || null
                        };

                        // Special handling for Additional Comments if it appears in colB/C
                        if (currentSectionName === "Additional Comments" && !colC) {
                            // If it's just the section header, we might want to capture text from following rows
                            // But the current structure expects checks. For now, let's just ensure the section exists.
                        }

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

                        if (colC !== "Status" && colC !== "Comment") {
                            sectionObj.checks.push(checkItem);
                        }
                    }

                    // Special Post-capture for Additional Comments field
                    const lowSection = currentSectionName ? currentSectionName.toLowerCase() : "";
                    if (lowSection.includes("additional comments") || lowSection === "remarks" || lowSection === "comments") {
                        const rowText = [colA, colB, colC, colD, colE].filter(val => {
                            if (!val) return false;
                            const low = String(val).toLowerCase();
                            return !low.includes("additional comments") && low !== "remarks" && low !== "comments" && low !== "status" && low !== "comment";
                        }).join(" ").trim();
                        if (rowText) {
                            console.log(`[ChargeAtWill] Captured comment row: ${rowText}`);
                            result.additionalComments += (result.additionalComments ? "\n" : "") + rowText;
                        }
                    }
                }
            } else if (productType.toLowerCase() === "route") {
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
                    const cells = [colA, colB, colC, colD, colE];

                    // Safe Metadata Extraction
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name") || lowerA.includes("customer name")) sessionRecord.merchant_name = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) sessionRecord.merchant_id = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) sessionRecord.audit_date = colA.split(":")[1]?.trim() || colB;

                    // Fallback to centralized name
                    if ((!sessionRecord.merchant_name || sessionRecord.merchant_name === "Audit Checklist") && merchantName) {
                        sessionRecord.merchant_name = merchantName;
                    }

                    // Category detection: categories are in colA or colB (e.g., "1. Linked account creation")
                    if (colA && colA.match(/^\d+\./)) currentCategory = colA;
                    if (colB && colB.match(/^\d+\./)) currentCategory = colB;
                    if (row.join(" ").includes("Additional Comments")) currentCategory = "Additional Comments";

                    // Skip header rows
                    if (colA === "Audit Checklist" || colA === "Tech Checklist" || colB === "Configs") continue;

                    if (!currentCategory) continue;

                    const isStatusValue = (value) => {
                        const v = String(value).toLowerCase();
                        return ["done", "n/a", "na", "yes", "no", "pending", "partial"].includes(v) || v.includes("pass") || v.includes("fail");
                    };

                    // Route Excel format: colA=category, colB=item/config, colC=status, colD=comment
                    // Determine which cell has the item: try colB first (most common), then colC
                    let itemCell = "";
                    let statusCell = "";
                    let commentCell = "";

                    if (colB && !colB.match(/^\d+\./) && colB !== "Audit Checklist" && colB !== "Tech Checklist") {
                        itemCell = colB;
                        statusCell = colC;
                        commentCell = colD;
                    } else if (colC && colC !== "Status" && colC !== "Configs") {
                        itemCell = colC;
                        statusCell = colD;
                        commentCell = colE;
                    }

                    if (itemCell) {
                        // Normalize: strip letter prefix like "a. ", "b. ", "i." etc for matching
                        const itemNorm = itemCell.replace(/\s+/g, "").toLowerCase();

                        // Sort possible items by description length descending for most-specific-first matching
                        const possibleItems = routeStorage.route_template_items
                            .filter(t => t.category_name === currentCategory)
                            .sort((a, b) => b.item_description.length - a.item_description.length);

                        const templateItem = possibleItems.find(t => {
                            const descNorm = t.item_description.replace(/\s+/g, "").toLowerCase();
                            // Exact match (ignoring whitespace)
                            if (itemNorm === descNorm) return true;
                            // Cell contains item description (e.g., "a.batchupload" contains "batchupload")
                            if (itemNorm.includes(descNorm) && descNorm.length > 2) return true;
                            // Item description contains cell content (fuzzy, e.g., typos)
                            if (descNorm.includes(itemNorm) && itemNorm.length > 2) return true;
                            return false;
                        });

                        if (templateItem) {
                            const statusVal = statusCell || "N/A";
                            const commentVal = commentCell || "";

                            let resultEntry = routeStorage.route_audit_results.find(r =>
                                r.session_id === sessionId && r.template_item_id === templateItem.id
                            );

                            if (!resultEntry) {
                                resultEntry = {
                                    id: routeStorage.route_audit_results.length + 1,
                                    session_id: sessionId,
                                    template_item_id: templateItem.id,
                                    status: statusVal,
                                    comment: commentVal
                                };
                                routeStorage.route_audit_results.push(resultEntry);
                            } else {
                                if (statusVal) resultEntry.status = statusVal;
                                if (commentVal) resultEntry.comment = commentVal;
                            }
                        }
                    }

                    // Handle Additional Comments rows
                    if (currentCategory === "Additional Comments") {
                        const additionalTemplate = routeStorage.route_template_items.find(t => t.category_name === "Additional Comments");
                        if (additionalTemplate) {
                            const comment = cells.filter(value => value && value.toLowerCase() !== "additional comments" && !isStatusValue(value)).join(" ").trim();
                            if (comment) {
                                const existing = routeStorage.route_audit_results.find(r => r.session_id === sessionId && r.template_item_id === additionalTemplate.id);
                                if (existing) {
                                    existing.comment = existing.comment ? `${existing.comment} ${comment}` : comment;
                                } else {
                                    routeStorage.route_audit_results.push({
                                        id: routeStorage.route_audit_results.length + 1,
                                        session_id: sessionId,
                                        template_item_id: additionalTemplate.id,
                                        status: "N/A",
                                        comment: comment
                                    });
                                }
                            }
                        }
                    }
                }

                if ((!sessionRecord.merchant_name || sessionRecord.merchant_name === "Audit Checklist" || sessionRecord.merchant_name === "Unknown") && merchantName) {
                    sessionRecord.merchant_name = merchantName;
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
            } else if (productType.toLowerCase().startsWith("subscription")) {
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
                const normalizeCategory = (value) =>
                    String(value || "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "");
                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const cells = row.map(cell => (cell == null ? "" : String(cell).trim()));
                    const colA = cells[0] || "";
                    const colB = cells[1] || "";
                    const colC = cells[2] || "";
                    const colD = cells[3] || "";
                    const colE = cells[4] || "";

                    row.forEach((cell, cellIdx) => {
                        if (!cell) return;
                        const str = String(cell).trim();
                        const lower = str.toLowerCase();
                        if (lower.includes("mx name") || lower.includes("customer name")) {
                            sessionRecord.merchant_name = str.split(":")[1]?.trim() || String(row[cellIdx + 1] || "").trim() || sessionRecord.merchant_name;
                        }
                        if (lower.includes("mid")) {
                            sessionRecord.merchant_id = str.split(":")[1]?.trim() || String(row[cellIdx + 1] || "").trim() || sessionRecord.merchant_id;
                        }
                        if (lower.includes("date of audit")) {
                            sessionRecord.audit_date = str.split(":")[1]?.trim() || String(row[cellIdx + 1] || "").trim() || sessionRecord.audit_date;
                        }
                    });

                    // Fallback to centralized name
                    if ((!sessionRecord.merchant_name || sessionRecord.merchant_name === "Audit Checklist") && merchantName) {
                        sessionRecord.merchant_name = merchantName;
                    }

                    if (colA && colA.match(/^\d+\./)) currentCategoryForSub = colA;
                    if (colB && colB.match(/^\d+\./)) currentCategoryForSub = colB;
                    if (row.join(" ").includes("Additional Comments")) currentCategoryForSub = "Additional Comments";

                    const normalizedCells = cells.map(c => c.toLowerCase());
                    const normalizedCategory = normalizeCategory(currentCategoryForSub);
                    const isStatusValue = (value) => {
                        const v = value.toLowerCase();
                        return ["done", "n/a", "na", "yes", "no", "pending", "partial"].includes(v);
                    };

                    if (currentCategoryForSub) {
                        const templateItem = subStorage.subscription_checklist_template.find(t => {
                            if (normalizeCategory(t.category) !== normalizedCategory) return false;
                            return normalizedCells.some(cell =>
                                cell &&
                                (cell === t.item_description.toLowerCase() ||
                                    cell.includes(t.item_description.toLowerCase()))
                            );
                        });

                        if (templateItem) {
                            const matchIdx = normalizedCells.findIndex(cell =>
                                cell &&
                                (cell === templateItem.item_description.toLowerCase() ||
                                    cell.includes(templateItem.item_description.toLowerCase()))
                            );
                            let status = "";
                            const commentParts = [];
                            for (let j = Math.max(matchIdx + 1, 0); j < cells.length; j++) {
                                const value = cells[j];
                                if (!value) continue;
                                if (!status && isStatusValue(value)) {
                                    status = value;
                                    continue;
                                }
                                commentParts.push(value);
                            }

                            let statusVal = status || colD || "N/A";
                            let commentVal = commentParts.join(" ").trim() || colE || "";

                            // Custom Mapping for Subscription recommendations
                            if (templateItem.item_description === "2 Days for UPI and 3 Days for other methods") {
                                if (!commentVal) commentVal = "12 minutes";
                                if (statusVal === "N/A") statusVal = "Done";
                            } else if (templateItem.item_description === "Additional Comments") {
                                if (!commentVal) {
                                    commentVal = "Subscription.completed, subscription.halted, subscription.activated webhook events have been recommended to be implemented at the merchant end. In case of payment failure or auto-refund, using the same subscription_id generated previously has been recommended to the merchant to reduce API calls.";
                                }
                            } else if (templateItem.item_description === "hitachi / fulcrum") {
                                if (!commentVal) commentVal = "";
                                if (statusVal === "N/A") statusVal = "Done";
                            } else if (templateItem.item_description === "upi_icici") {
                                if (!commentVal) commentVal = "Others if applicable:";
                                statusVal = "N/A";
                            } else if (templateItem.item_description === "Webhooks") {
                                if (!commentVal) commentVal = "Events: subscription.charged, subscription.authenticated";
                                if (statusVal === "N/A") statusVal = "Done";
                            } else if (templateItem.item_description === "Checkout Type") {
                                if (!commentVal) commentVal = "Type: Standard";
                                if (statusVal === "N/A") statusVal = "Done";
                            } else if (templateItem.item_description === "Server language/SDK") {
                                if (!commentVal) commentVal = "Version: NA";
                                if (statusVal === "N/A") statusVal = "Done";
                            }

                            subStorage.subscription_audit_results.push({
                                id: subStorage.subscription_audit_results.length + 1,
                                audit_id: sessionId,
                                item_id: templateItem.item_id,
                                status: statusVal,
                                comment: commentVal
                            });
                        } else if (normalizedCategory.includes("additionalcomments")) {
                            const additionalTemplate = subStorage.subscription_checklist_template.find(t =>
                                normalizeCategory(t.category) === "additionalcomments"
                            );
                            if (additionalTemplate) {
                                const comment = cells
                                    .filter((value) => value && value.toLowerCase() !== "additional comments")
                                    .filter((value) => !isStatusValue(value))
                                    .join(" ")
                                    .trim();
                                if (comment) {
                                    const existing = subStorage.subscription_audit_results.find(r =>
                                        r.audit_id === sessionId && r.item_id === additionalTemplate.item_id
                                    );
                                    if (existing) {
                                        existing.comment = existing.comment
                                            ? `${existing.comment} ${comment}`
                                            : comment;
                                    } else {
                                        subStorage.subscription_audit_results.push({
                                            id: subStorage.subscription_audit_results.length + 1,
                                            audit_id: sessionId,
                                            item_id: additionalTemplate.item_id,
                                            status: colD || "N/A",
                                            comment
                                        });
                                    }
                                }
                            }
                        }
                    }
                }

                // Fill missing 
                subStorage.subscription_checklist_template.forEach(t => {
                    if (!subStorage.subscription_audit_results.find(r => r.audit_id === sessionId && r.item_id === t.item_id)) {
                        let statusVal = "N/A";
                        let commentVal = "";

                        // Inject recommendations even if missing from Excel
                        if (t.item_description === "2 Days for UPI and 3 Days for other methods") {
                            statusVal = "Done";
                            commentVal = "12 minutes";
                        } else if (t.item_description === "Additional Comments") {
                            statusVal = "Done";
                            commentVal = "Subscription.completed, subscription.halted, subscription.activated webhook events have been recommended to be implemented at the merchant end. In case of payment failure or auto-refund, using the same subscription_id generated previously has been recommended to the merchant to reduce API calls.";
                        } else if (t.item_description === "hitachi / fulcrum") {
                            statusVal = "Done";
                            commentVal = "";
                        } else if (t.item_description === "upi_icici") {
                            statusVal = "N/A";
                            commentVal = "Others if applicable:";
                        } else if (t.item_description === "Webhooks") {
                            statusVal = "Done";
                            commentVal = "Events: subscription.charged, subscription.authenticated";
                        } else if (t.item_description === "Checkout Type") {
                            statusVal = "Done";
                            commentVal = "Type: Standard";
                        } else if (t.item_description === "Server language/SDK") {
                            statusVal = "Done";
                            commentVal = "Version: NA";
                        }

                        subStorage.subscription_audit_results.push({
                            id: subStorage.subscription_audit_results.length + 1,
                            audit_id: sessionId,
                            item_id: t.item_id,
                            status: statusVal,
                            comment: commentVal
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

                if ((!sessionRecord.merchant_name || sessionRecord.merchant_name === "Audit Checklist" || sessionRecord.merchant_name === "Unknown") && merchantName) {
                    sessionRecord.merchant_name = merchantName;
                }

                const subAuditsDir = path.join(__dirname, "data", "subscription_audits");
                if (!fs.existsSync(subAuditsDir)) fs.mkdirSync(subAuditsDir, { recursive: true });
                const safeMxNameSub = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                fs.writeFileSync(path.join(subAuditsDir, `subscription_audit_${sessionId}_${safeMxNameSub}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual Subscription audit saved to: subscription_audit_${sessionId}_${safeMxNameSub}.json`);
            } else {
                // Generic/Existing Logic for other products
                result = {
                    audit_metadata: {
                        merchant_name: "",
                        merchant_id: "",
                        date: ""
                    },
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

                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name") || lowerA.includes("customer name")) result.audit_metadata.merchant_name = colA.split(":")[1]?.trim() || colB || merchantName;
                    if (lowerA.includes("mid")) result.audit_metadata.merchant_id = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) result.audit_metadata.date = colA.split(":")[1]?.trim() || colB;

                    if (lowerA.includes("mx name") || lowerA.includes("customer name") || lowerA.includes("mid") || lowerA.includes("date of audit")) continue;

                    if ((!colA && !colB && !colC && !colD) || colA === "Tech Checklist" || colA === "Audit Checklist") continue;

                    if (colA === "Additional Comments" || colB === "Additional Comments") {
                        captureComments = true;
                        continue;
                    }

                    if (captureComments) {
                        const rowText = [colA, colB, colC, colD].filter(Boolean).join(" ").trim();
                        if (rowText) result.additionalComments += (result.additionalComments ? "\n" : "") + rowText;
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

                // Final safety fallback
                if (!result.audit_metadata.merchant_name && merchantName) {
                    result.audit_metadata.merchant_name = merchantName;
                }
            }

            // Define path for data storage
            const dataFilePath = path.join(__dirname, "data", "checklist_data.json");

            // Skip general storage for specific products (saved in their own files)
            const lowerProduct = productType.toLowerCase();
            if (lowerProduct.startsWith("smart collect") || lowerProduct.startsWith("smart_collect")) {
                const smartCollectDir = path.join(__dirname, "data", "smart_collect_audits");
                if (!fs.existsSync(smartCollectDir)) fs.mkdirSync(smartCollectDir, { recursive: true });

                const existingFiles = fs.readdirSync(smartCollectDir).filter(f => f.endsWith('.json'));
                const sessionId = existingFiles.length + 1;
                const safeMxName = (result.audit_metadata?.merchant_name || merchantName || "unknown").replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const sessionFilename = `smart_collect_audit_${sessionId}_${safeMxName}.json`;

                result.product = "Smart Collect";
                result.session_id = sessionId;

                fs.writeFileSync(path.join(smartCollectDir, sessionFilename), JSON.stringify(result, null, 2));
                console.log(`Individual Smart Collect audit saved to: ${sessionFilename}`);
            } else if (!lowerProduct.startsWith("route") &&
                !lowerProduct.startsWith("subscription") &&
                !lowerProduct.startsWith("qr code") &&
                !lowerProduct.startsWith("payment links") &&
                !lowerProduct.startsWith("affordability") &&
                !lowerProduct.startsWith("standard checkout") &&
                !lowerProduct.startsWith("custom checkout") &&
                !lowerProduct.startsWith("s2s")) {
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
            if (productType.toLowerCase() === "payment links") {
                console.log("Entering NCApps logic...");
                const ncappsDataPath = path.join(__dirname, "data", "ncapps_checklist_data.json");

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

                // Robust Column Detection
                let configColIdx = -1;
                let statusColIdx = -1;
                let commentColIdx = -1;
                let catColIdx = -1;
                let headerRowIndex = -1;

                for (let i = 0; i < Math.min(rawData.length, 40); i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;

                    const configIdx = row.findIndex(c => c && /configs|requirement|item|description/i.test(String(c)));
                    if (configIdx !== -1) {
                        headerRowIndex = i;
                        configColIdx = configIdx;
                        catColIdx = row.findIndex(c => c && /audit checklist|category|section/i.test(String(c)));
                        statusColIdx = row.findIndex(c => c && /status|result/i.test(String(c)));
                        commentColIdx = row.findIndex(c => /comment|remark|note/i.test(String(c)));
                        break;
                    }

                    // Fallback to finding by template items
                    let matches = 0;
                    row.forEach((cell, idx) => {
                        if (!cell) return;
                        const cellVal = String(cell).toLowerCase();
                        if (NCAPPS_CANONICAL_TEMPLATE.some(t => cellVal.includes(t.item.toLowerCase()))) {
                            matches++;
                            if (configColIdx === -1) configColIdx = idx;
                        }
                    });
                    if (matches >= 1) {
                        headerRowIndex = i - 1;
                        break;
                    }
                }

                // Final fallbacks for indices
                if (configColIdx === -1) configColIdx = 1;
                if (statusColIdx === -1) statusColIdx = configColIdx + 1;
                if (commentColIdx === -1) commentColIdx = configColIdx + 2;
                if (catColIdx === -1) catColIdx = 0;

                console.log(`[NCApps] Header detection: row=${headerRowIndex}, catCol=${catColIdx}, configCol=${configColIdx}, statusCol=${statusColIdx}, commentCol=${commentColIdx}`);

                let mxName = "";
                let mxId = "";
                let mxDate = "";

                // metadata extraction (all cells)
                for (let i = 0; i < Math.min(rawData.length, 50); i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;
                    row.forEach((cell, idx) => {
                        if (!cell) return;
                        const str = String(cell).trim();
                        const lower = str.toLowerCase();
                        const nextVal = String(row[idx + 1] || "").trim();
                        const splitVal = str.split(":")[1]?.trim();
                        const val = splitVal || nextVal;

                        if (lower.includes("mx name") || lower.includes("merchant name")) mxName = val || mxName;
                        if (lower.includes("mid") || (lower.includes("id") && lower.length < 5)) mxId = val || mxId;
                        if (lower.includes("date of audit") || (lower.includes("date") && !lower.includes("update"))) mxDate = val || mxDate;
                    });
                }

                const sessionId = ncappsStorage.ncapps_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: mxId || "Unknown",
                    merchant_name: (mxName && !/audit checklist|merchant name/i.test(mxName)) ? mxName : (merchantName || "Audit Checklist"),
                    audit_date: mxDate || "",
                    created_at: new Date().toISOString()
                };
                ncappsStorage.ncapps_audits.push(sessionRecord);

                let currentCategory = "";
                let processedChecklistItems = [];

                const startIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

                for (let i = startIdx; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;

                    const catVal = catColIdx !== -1 ? String(row[catColIdx] || "").trim() : "";
                    if (catVal) currentCategory = catVal;

                    const itemVal = String(row[configColIdx] || "").trim();
                    const statusVal = statusColIdx !== -1 ? String(row[statusColIdx] || "N/A").trim() : "N/A";
                    const commentVal = commentColIdx !== -1 ? String(row[commentColIdx] || "").trim() : "";

                    if (!itemVal) {
                        // Check if the label is in the Audit Checklist column for comments
                        const labelInCat = catVal;
                        const commentTemplate = ncappsStorage.ncapps_comment_templates.find(t => t.field_label.toLowerCase() === labelInCat.toLowerCase());
                        if (commentTemplate) {
                            ncappsStorage.ncapps_comment_values.push({
                                id: ncappsStorage.ncapps_comment_values.length + 1,
                                session_id: sessionId,
                                comment_template_id: commentTemplate.id,
                                field_value: statusVal !== "N/A" ? statusVal : commentVal || ""
                            });
                        }
                        continue;
                    }

                    // Check if it's a checklist item
                    const templateMatch = NCAPPS_CANONICAL_TEMPLATE.find(t =>
                        itemVal.toLowerCase().includes(t.item.toLowerCase()) ||
                        t.item.toLowerCase().includes(itemVal.toLowerCase())
                    );

                    if (templateMatch) {
                        const templateItem = ncappsStorage.ncapps_checklist_template.find(t => t.item_description === templateMatch.item);
                        if (templateItem) {
                            ncappsStorage.ncapps_audit_results.push({
                                id: ncappsStorage.ncapps_audit_results.length + 1,
                                session_id: sessionId,
                                template_id: templateItem.item_id,
                                status: statusVal,
                                specific_comment: commentVal
                            });
                            processedChecklistItems.push(templateItem.item_id);
                        }
                    }


                    // Check if it's a comment field
                    const commentTemplate = ncappsStorage.ncapps_comment_templates.find(t =>
                        itemVal.toLowerCase().includes(t.field_label.toLowerCase()) ||
                        (catVal && catVal.toLowerCase().includes(t.field_label.toLowerCase()))
                    );

                    if (commentTemplate) {
                        // If the template matched the category column, then the item column likely contains the value
                        let val = "";
                        if (catVal && catVal.toLowerCase().includes(commentTemplate.field_label.toLowerCase())) {
                            val = itemVal;
                        } else {
                            val = statusVal !== "N/A" ? statusVal : commentVal;
                        }

                        ncappsStorage.ncapps_comment_values.push({
                            id: ncappsStorage.ncapps_comment_values.length + 1,
                            session_id: sessionId,
                            comment_template_id: commentTemplate.id,
                            field_value: val || ""
                        });
                    }
                }

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
                    // Get all values for this session and template
                    const vals = ncappsStorage.ncapps_comment_values.filter(v => v.session_id === sessionId && v.comment_template_id === ct.id);
                    const mergedVal = vals.map(v => v.field_value).filter(Boolean).join("; ");
                    return { label: ct.field_label, value: mergedVal || "" };
                });

                result = {
                    product: "Payment Links",
                    audit_metadata: { mx_name: sessionRecord.merchant_name, mid: sessionRecord.merchant_id, date: sessionRecord.audit_date },
                    checklist_content: checklistResp,
                    additional_comments: additionalCommentsResp
                };

                const ncappsAuditsDir = path.join(__dirname, "data", "ncapps_audits");
                if (!fs.existsSync(ncappsAuditsDir)) fs.mkdirSync(ncappsAuditsDir, { recursive: true });
                const safeMxName = sessionRecord.merchant_name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "unknown";
                fs.writeFileSync(path.join(ncappsAuditsDir, `ncapps_audit_${sessionId}_${safeMxName}.json`), JSON.stringify(result, null, 2));
                console.log(`Individual NCApps audit saved to: ncapps_audit_${sessionId}_${safeMxName}.json`);
            }

            // --- Go Live Checklist - PG Specific Logic ---
            if (productType === "Standard Checkout" || productType === "Custom Checkout" || productType === "S2S") {
                const goliveDataPath = path.join(__dirname, "data", "golive_checklist_data.json");

                // Canonical Template 
                const GOLIVE_CANONICAL_TEMPLATE = [
                    { config: "Account Live (Key/Secret)", source: "Admin Dashboard" },
                    { config: "Webhook Configs", source: "Merchant Dashboard" },
                    { config: "Successful Payment IDs", source: "Admin Dashboard" },
                    { config: "Order API Implementation", source: "Admin Dashboard / Payments Table" },
                    { config: "Signature Verification", source: "Coralogix" },
                    { config: "Refund API", source: "Admin Dashboard / Payments Table" },
                    { config: "SDK latest Version", source: "Admin Dashboard / Payments Table" }
                ];

                // Robust Column Detection
                let configColIdx = -1;
                let statusColIdx = -1;
                let commentColIdx = -1;
                let headerRowIndex = -1;

                // Try to find columns by searching for headers or template items
                for (let i = 0; i < Math.min(rawData.length, 40); i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;

                    // Option A: Look for explicit header keywords
                    const configIdx = row.findIndex(c => c && /configs|checklist|items|requirement/i.test(String(c)));
                    if (configIdx !== -1) {
                        headerRowIndex = i;
                        configColIdx = configIdx;
                        statusColIdx = row.findIndex(c => c && /status|result/i.test(String(c)));
                        commentColIdx = row.findIndex(c => /comment|remarks|remark|dev/i.test(String(c)));
                        break;
                    }

                    // Option B: Look for row that has column values matching canonical items
                    let matches = 0;
                    row.forEach((cell, idx) => {
                        if (!cell) return;
                        const cellVal = String(cell).toLowerCase();
                        if (GOLIVE_CANONICAL_TEMPLATE.some(t => cellVal.includes(t.config.toLowerCase()))) {
                            matches++;
                            if (configColIdx === -1) configColIdx = idx;
                        }
                    });
                    if (matches >= 1) {
                        headerRowIndex = i - 1;
                        if (statusColIdx === -1) {
                            // Try to find a column with Pass/Fail/Done/Yes/No in this or next row
                            const nextRow = rawData[i + 1] || [];
                            statusColIdx = row.findIndex(c => c && /pass|fail|done|yes|no|pending/i.test(String(c))) ||
                                nextRow.findIndex(c => c && /pass|fail|done|yes|no|pending/i.test(String(c)));
                        }
                        break;
                    }
                }

                if (configColIdx === -1) configColIdx = 0;
                if (statusColIdx === -1) statusColIdx = configColIdx + 1;
                if (commentColIdx === -1) commentColIdx = configColIdx + 2;

                console.log(`[GoLive] Header detection: row=${headerRowIndex}, configCol=${configColIdx}, statusCol=${statusColIdx}, commentCol=${commentColIdx}`);

                let additionalComments = "";
                let captureComments = false;
                let processedItems = [];
                let checkoutType = null;

                const CHECKOUT_BEST_PRACTICES = {
                    standard: "Capture authorized payments using Payment Capture Settings; create orders via Orders API and pass the order_id to Checkout; verify the payment signature; confirm payment/order status is captured/paid before providing service (via fetch payment/order APIs); implement webhooks (payment.captured, payment.failed, order.paid); use callback_url for in-app browsers that do not support iframes.",
                    custom: "Integrate the Payments Rainy Day kit for late auth, downtime, and errors; integrate Orders API and pass order_id to Checkout to prevent duplicate payments; verify payment signature; check payment/order status before providing services (via fetch payment/order APIs); implement webhooks or query API (payment.captured, payment.failed, order.paid); implement callback_url for in-app browsers; validate and save cards; validate and save VPA for UPI collect.",
                    s2s: "Use the S2S JSON API; open the HTML returned in the API response in the customer's browser; pass actual user_agent, customer IP, and referrer; integrate webhooks for server-to-server callbacks; use the Payments Rainy Day kit for late auth, downtimes, and errors."
                };

                const detectCheckoutType = (text) => {
                    if (!text) return null;
                    const t = text.toLowerCase();
                    if (t.includes("s2s") || t.includes("server to server") || t.includes("server-to-server")) return "s2s";
                    if (t.includes("custom checkout") || (t.includes("custom") && t.includes("checkout"))) return "custom";
                    if (t.includes("standard checkout") || (t.includes("standard") && t.includes("checkout"))) return "standard";
                    return null;
                };


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

                // Metadata Extraction - search ALL cells in a robust way
                let mxName = "";
                let mxId = "";
                let mxDate = "";

                for (let i = 0; i < Math.min(rawData.length, 50); i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;
                    row.forEach((cell, idx) => {
                        if (!cell) return;
                        const str = String(cell).trim();
                        const lower = str.toLowerCase();
                        const val = str.split(":")[1]?.trim() || String(row[idx + 1] || "").trim();

                        if (lower.includes("mx name") || lower.includes("merchant name")) {
                            mxName = val || mxName;
                        }
                        if (lower.includes("mid") || lower.includes("merchant id") || (lower.includes("id") && lower.length < 5)) {
                            mxId = val || mxId;
                        }
                        if (lower.includes("date of audit") || (lower.includes("date") && !lower.includes("update") && !lower.includes("create") && !/id|key/i.test(lower))) {
                            mxDate = val || mxDate;
                        }
                    });
                }

                const sessionId = goliveStorage.golive_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    product: productType,
                    merchant_id: mxId || merchantId || "Unknown",
                    merchant_name: (mxName && mxName !== "Audit Checklist" && mxName !== "Unknown") ? mxName : (merchantName || "Audit Checklist"),
                    audit_date: mxDate || "",
                    created_at: new Date().toISOString()
                };
                goliveStorage.golive_audits.push(sessionRecord);

                let currentAuditResults = [];

                const startIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

                const isMeaningfulNote = (value) => {
                    if (!value) return false;
                    const lowered = String(value).trim().toLowerCase();
                    if (!lowered) return false;
                    return !["n/a", "na", "done", "pass", "fail", "yes", "no"].includes(lowered);
                };

                const resolveAdditionalNote = (commentValue, statusValue) => {
                    if (commentValue && String(commentValue).trim()) return String(commentValue).trim();
                    if (isMeaningfulNote(statusValue)) return String(statusValue).trim();
                    return "";
                };

                for (let i = startIdx; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;

                    const configItem = String(row[configColIdx] || "").trim();
                    const status = statusColIdx !== -1 && statusColIdx < row.length ? String(row[statusColIdx] || "N/A").trim() : "N/A";
                    const comment = commentColIdx !== -1 && commentColIdx < row.length ? String(row[commentColIdx] || "").trim() : "";

                    if (!configItem) continue;

                    const lowerConfig = configItem.toLowerCase();
                    if (lowerConfig.includes("mx name") || lowerConfig.includes("mid") || lowerConfig.includes("date of audit")) continue;
                    if (lowerConfig === "configs" || lowerConfig === "tech checklist" || lowerConfig === "audit checklist" || lowerConfig === "status") continue;

                    if (lowerConfig.includes("additional comments") || lowerConfig.includes("remarks")) {
                        captureComments = true;
                        const note = resolveAdditionalNote(comment, status);
                        if (note) {
                            additionalComments = additionalComments ? `${additionalComments}; ${note}` : note;
                        }
                        continue;
                    }

                    if (captureComments) {
                        const rowText = [configItem, status, comment].filter(val => val && !["N/A", "Done", "Pass", "Fail", "Yes", "No"].includes(val)).join(" ").trim();
                        if (rowText) {
                            additionalComments = additionalComments ? `${additionalComments}; ${rowText}` : rowText;
                        }
                        continue;
                    }

                    if (lowerConfig.includes("late auth scenario to be handled")) {
                        const note = resolveAdditionalNote(comment, status) || configItem;
                        if (note) {
                            additionalComments = additionalComments
                                ? `${additionalComments}; ${note}`
                                : note;
                        }
                        continue;
                    }

                    if (!checkoutType) {
                        checkoutType = detectCheckoutType(`${configItem} ${comment}`);
                    }

                    const itemData = {
                        config: configItem,
                        status: status,
                        comment: comment
                    };

                    currentAuditResults.push(itemData);
                    processedItems.push(configItem);

                    goliveStorage.golive_results.push({
                        id: goliveStorage.golive_results.length + 1,
                        session_id: sessionId,
                        config_item: configItem,
                        status: status,
                        comment: comment
                    });
                }

                const bestPracticeSummary = CHECKOUT_BEST_PRACTICES[checkoutType];
                if (bestPracticeSummary) {
                    currentAuditResults.forEach(item => {
                        if (String(item.config).toLowerCase().includes("best practices")) {
                            item.comment = bestPracticeSummary;
                        }
                    });
                    goliveStorage.golive_results.forEach(item => {
                        if (item.session_id === sessionId && String(item.config_item).toLowerCase().includes("best practices")) {
                            item.comment = bestPracticeSummary;
                        }
                    });
                }

                // Guard: never overwrite "Additional Comments" beyond the uploaded value
                currentAuditResults.forEach(item => {
                    const label = String(item.config).toLowerCase();
                    if (label.includes("additional comments") || label.includes("remarks")) {
                        item.comment = additionalComments || "";
                    }
                });
                goliveStorage.golive_results.forEach(item => {
                    if (item.session_id !== sessionId) return;
                    const label = String(item.config_item).toLowerCase();
                    if (label.includes("additional comments") || label.includes("remarks")) {
                        item.comment = additionalComments || "";
                    }
                });

                fs.writeFileSync(goliveDataPath, JSON.stringify(goliveStorage, null, 2));


                result = {
                    product: productType, // Dynamic based on selection
                    audit_metadata: {
                        mx_name: sessionRecord.merchant_name,
                        merchant_name: sessionRecord.merchant_name,
                        merchant_id: sessionRecord.merchant_id,
                        date: sessionRecord.audit_date
                    },
                    checklist_content: currentAuditResults,
                    additionalComments: additionalComments
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

                let mxId = "";
                let mxName = "";
                let mxDate = "";

                for (let i = 0; i < rawData.length; i++) {
                    const row = rawData[i];
                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();
                    if (lowerA.includes("mx name")) mxName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) mxId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) mxDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = affordabilityStorage.affordability_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: mxId || merchantId || "Unknown",
                    merchant_name: (mxName && mxName !== "Audit Checklist" && mxName !== "Unknown") ? mxName : (merchantName || "Audit Checklist"),
                    audit_date: mxDate || "",
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
                        merchant_name: sessionRecord.merchant_name,
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

            if (productType === "QR Code") {
                const qrDataPath = path.join(__dirname, "data", "qr_code_checklist_data.json");
                // Use rawData (already parsed as array of arrays) instead of re-parsing

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

                // Header & Column Detection
                let headerRowIndex = -1;
                let categoryColIdx = 0;
                let itemColIdx = 1;
                let statusColIdx = 2;
                let commentColIdx = 3;

                // Try to find headers dynamically
                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    if (!row || !Array.isArray(row)) continue;

                    const lowerRow = row.map(c => String(c || "").trim().toLowerCase());
                    const catIdx = lowerRow.findIndex(c => c.includes("audit checklist") || c.includes("category"));
                    const itemIdx = lowerRow.findIndex(c => c === "configs" || c === "items" || c === "item");

                    if (catIdx !== -1 || itemIdx !== -1) {
                        headerRowIndex = i;
                        if (catIdx !== -1) categoryColIdx = catIdx;
                        // specific logic: if 'Configs' is in same column as 'Audit Checklist' (merged) or separate?
                        // Usually 'Audit Checklist' is col A, 'Configs' is col B
                        if (itemIdx !== -1) itemColIdx = itemIdx;
                        else itemColIdx = categoryColIdx + 1;

                        // Look for Status/Comment relative to Item
                        const statIdx = lowerRow.findIndex(c => c.includes("status") || c.includes("result") || c.includes("observation"));
                        if (statIdx !== -1) statusColIdx = statIdx;
                        else statusColIdx = Math.max(categoryColIdx, itemColIdx) + 1; // Default to next col

                        const comIdx = lowerRow.findIndex(c => c.includes("comment") || c.includes("remark") || c.includes("note"));
                        if (comIdx !== -1) commentColIdx = comIdx;
                        else commentColIdx = statusColIdx + 1; // Default to next col

                        console.log(`[QR Code] Headers found at row ${i}: Cat=${categoryColIdx}, Item=${itemColIdx}, Status=${statusColIdx}, Comment=${commentColIdx}`);
                        break;
                    }
                }

                // Metadata Extraction (Scan first 20 rows)
                let mxId = "";
                let mxName = "";
                let mxDate = "";

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    if (!row) continue;

                    const colA = row[0] ? String(row[0]).trim() : "";
                    const colB = row[1] ? String(row[1]).trim() : "";
                    const lowerA = colA.toLowerCase();

                    if (lowerA.includes("mx name")) mxName = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("mid")) mxId = colA.split(":")[1]?.trim() || colB;
                    if (lowerA.includes("date of audit")) mxDate = colA.split(":")[1]?.trim() || colB;
                }

                const sessionId = qrStorage.qr_audits.length + 1;
                const sessionRecord = {
                    id: sessionId,
                    merchant_id: mxId || merchantId || "Unknown",
                    merchant_name: (mxName && mxName !== "Audit Checklist" && mxName !== "Unknown") ? mxName : (merchantName || "Audit Checklist"),
                    audit_date: mxDate || "",
                    created_at: new Date().toISOString()
                };
                qrStorage.qr_audits.push(sessionRecord);

                let currentCategory = "";
                let processedItems = [];

                // Process Rows
                const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

                for (let i = startRow; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || row.length === 0) continue;

                    // Extract cell values based on detected columns
                    let colCat = row[categoryColIdx] ? String(row[categoryColIdx]).trim() : "";
                    let colItem = row[itemColIdx] ? String(row[itemColIdx]).trim() : "";
                    let colStatus = row[statusColIdx] ? String(row[statusColIdx]).trim() : "N/A";
                    let colComment = row[commentColIdx] ? String(row[commentColIdx]).trim() : "";

                    // Reset N/A if empty (unless meant to be N/A)
                    if (!colStatus || colStatus === "") colStatus = "N/A";

                    if (colCat) currentCategory = colCat;

                    // 1. Check for standard check item (Column B usually)
                    if (colItem) {
                        // Fuzzy Match: Strip prefixes like "a. ", "b. ", "1. " etc.
                        const cleanItem = colItem.replace(/^[a-z0-9]+\.\s*/i, "").trim();
                        const templateMatch = QR_CODE_CANONICAL_TEMPLATE.find(t =>
                            t.item.toLowerCase() === cleanItem.toLowerCase() ||
                            t.item.toLowerCase() === colItem.toLowerCase()
                        );
                        if (templateMatch) {
                            const templateItem = qrStorage.qr_checklist_template.find(t => t.item_description === templateMatch.item);
                            if (templateItem && templateItem.category !== "Additional Comments") {
                                qrStorage.qr_audit_results.push({
                                    id: qrStorage.qr_audit_results.length + 1,
                                    audit_id: sessionId,
                                    item_id: templateItem.item_id,
                                    status: colStatus,
                                    comment: colComment
                                });
                                processedItems.push(templateMatch.item);
                            }
                        }
                    }

                    // 2. Check for Additional Comments items (Often in Column A/Category Column)
                    // "webhook Url for payment" and "Webhook Events" usually appear in the first column
                    const itemsToCheck = ["webhook Url for payment", "Webhook Events"];
                    // Check both colCat and colItem
                    const matchedItem = itemsToCheck.find(it =>
                        (colCat && colCat.toLowerCase() === it.toLowerCase()) ||
                        (colItem && colItem.toLowerCase() === it.toLowerCase())
                    );

                    if (matchedItem) {
                        // For these items, the 'Value' is often in the column next to the label
                        // If label in Cat col, value in Item col
                        // If label in Item col, value in Status col?
                        let value = "";
                        if (colCat.toLowerCase() === matchedItem.toLowerCase()) value = colItem; // Label in Col A, Value in Col B
                        else if (colItem.toLowerCase() === matchedItem.toLowerCase()) value = colStatus; // Label in Col B, Value in Col C

                        const templateItem = qrStorage.qr_checklist_template.find(t => t.item_description === matchedItem);
                        if (templateItem && !processedItems.includes(matchedItem)) {
                            qrStorage.qr_audit_results.push({
                                id: qrStorage.qr_audit_results.length + 1,
                                audit_id: sessionId,
                                item_id: templateItem.item_id,
                                status: "N/A",
                                comment: value
                            });
                            processedItems.push(matchedItem);
                        }
                    }
                }

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
                merchantName: merchantName,
                merchantEnrichment: merchantInfo,
                data: result,
                diagramPath: diagramPath
            });

            // Enrichment search is now triggered at the start of the handler
            // for better performance and consistency.

            // Trigger audit summarization (async, non-blocking)
            if (result && (merchantName || merchantId)) {
                console.log(`📝 Triggering audit summarization for: ${merchantName || merchantId}`);
                const metadata = {
                    audit_id: result.audit_id || result.session_id || `audit_${Date.now()}`,
                    merchant_name: merchantName || "Unknown",
                    product_type: productType,
                    audit_date: result.audit_metadata?.date || result.merchant_info?.date || new Date().toISOString()
                };

                auditSummaryService.generateAndStoreSummary(result, metadata)
                    .then(summary => {
                        if (summary) {
                            console.log(`✅ Audit summary generated and stored for: ${metadata.merchant_name}`);
                        }
                    })
                    .catch(err => {
                        console.error("Audit summarization error (non-blocking):", err);
                    });
            }

            // --- FRD Generation Logic ---
            if (result && (merchantName || merchantId)) {
                console.log(`📄 Triggering FRD generation for: ${merchantName || merchantId}`);

                // Use the already fetched merchantInfo or attempt to fall back to cache
                const generateFRDProcess = async () => {
                    try {
                        let finalEnrichment = merchantInfo;

                        if (!finalEnrichment) {
                            const dataPath = path.join(__dirname, "data", "merchant_enrichment_data.json");
                            if (fs.existsSync(dataPath)) {
                                const storage = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                                const targetName = merchantName ? merchantName.trim().toLowerCase() : "";
                                finalEnrichment = storage.enrichments.find(e =>
                                    e.merchant_name && e.merchant_name.trim().toLowerCase() === targetName
                                );
                            }
                        }

                        const frdPaths = await frdGenerator.generateFRD(
                            result,
                            finalEnrichment,
                            productType,
                            diagramPath,
                            req.file.filename,
                            req.file.originalname
                        );
                        console.log(`✅ FRD files generated:`, frdPaths);

                        // --- Upload to Google Drive ---
                        try {
                            // 1. Upload the Excel Checklist
                            console.log(`📤 Uploading checklist to Google Drive: ${req.file.originalname}...`);
                            await googleDriveService.uploadFile(
                                req.file.path,
                                `Checklist_${req.file.originalname}`,
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            );

                            // 2. Upload the Generated FRD PDF
                            if (frdPaths.pdf) {
                                const pdfName = path.basename(frdPaths.pdf);
                                console.log(`📤 Uploading FRD PDF to Google Drive: ${pdfName}...`);
                                await googleDriveService.uploadFile(
                                    frdPaths.pdf,
                                    pdfName,
                                    'application/pdf'
                                );
                            }
                        } catch (uploadError) {
                            console.error("❌ Error uploading to Google Drive:", uploadError);
                        }
                    } catch (frdError) {
                        console.error("FRD generation error:", frdError);
                    }
                };

                // Run FRD generation (still non-blocking for the main response)
                generateFRDProcess();
            }

        } catch (parseError) {
            console.error("Error parsing Excel file:", parseError);
            res.status(500).json({ message: "Error processing Excel file", error: parseError.message });
        }
    });
});

app.use("/api", require("./routes/docRoute"));

// Serve generated FRDs as static files
const frdDir = path.join(__dirname, "generated_frds");
if (!fs.existsSync(frdDir)) fs.mkdirSync(frdDir, { recursive: true });
app.use("/generated_frds", express.static(frdDir));

// GET latest FRD PDF info
app.get("/api/latest-frd", (req, res) => {
    try {
        const files = fs.readdirSync(frdDir)
            .filter(f => f.endsWith(".pdf"))
            .map(f => ({ name: f, time: fs.statSync(path.join(frdDir, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);

        if (files.length === 0) return res.status(404).json({ message: "No FRD found" });
        res.json({ filename: files[0].name, url: `/generated_frds/${encodeURIComponent(files[0].name)}` });
    } catch (e) {
        res.status(500).json({ message: "Error fetching FRD", error: e.message });
    }
});

const HOST = process.env.HOST || "127.0.0.1";
const server = app.listen(PORT, HOST, () => {
    console.log(`✅ Server running on http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${PORT} is already in use.`);
        console.error(`💡 This often happens if you used Ctrl+Z instead of Ctrl+C to stop the server.`);
        console.error(`👉 FIX: Run 'kill -9 $(lsof -t -i :${PORT})' to clear the port.\n`);
    } else {
        console.error('Server error:', error);
    }
});

// Prevent unhandled crashes
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

process.on('exit', (code) => {
    console.log(`Process exited with code: ${code}`);
});
