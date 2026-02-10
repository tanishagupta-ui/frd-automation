const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const SUMMARY_DATA_FILE = path.join(__dirname, '../data/audit_summaries.json');

// Initialize Gemini AI
let genAI = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Ensure summary data file exists
if (!fs.existsSync(path.dirname(SUMMARY_DATA_FILE))) {
    fs.mkdirSync(path.dirname(SUMMARY_DATA_FILE), { recursive: true });
}
if (!fs.existsSync(SUMMARY_DATA_FILE)) {
    fs.writeFileSync(SUMMARY_DATA_FILE, JSON.stringify({ summaries: [] }, null, 2));
}

/**
 * Summarizes audit findings using Gemini AI and stores them.
 */
async function generateAndStoreSummary(auditResult, metadata) {
    // Extract structured data first to give Gemini better context
    const extractedData = extractAuditData(auditResult, metadata);

    // Check if we should use AI
    let summaryBody = null;
    if (process.env.GEMINI_API_KEY && genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // Prepare context from extracted data
            const findingsList = extractedData.key_findings.map(f => `- ${f}`).join("\n");

            const prompt = `
                You are a Razorpay payment integration auditor. Analyze the provided audit findings and create a professional, bulleted technical audit summary.
                
                MERCHANT: ${extractedData.merchant_name}
                PRODUCT: ${extractedData.product_type}
                
                CRITICAL CHECK FINDINGS:
                ${findingsList}
                
                PAYMENT METHODS: ${Array.from(extractedData.payment_methods).join(", ")}
                WEBHOOK STATUS: ${extractedData.webhook_status}
                CAPTURE SETTINGS: ${extractedData.capture_settings}
                TEST IDs FOUND: ${extractedData.test_ids.join(", ") || "None"}
                
                IMPORTANT: 
                1. Write 5-8 PROFESSIONAL BULLET POINTS.
                2. Tone: Formal, authoritative, and concise.
                3. Content to include (emulate this style):
                   - Observation of user journey (e.g. "The user selects a policy/service on the platform.")
                   - Specific webhook events and their purpose.
                   - Auto-capture settings and where they are configured.
                   - Mention of error handling kits shared.
                   - A bullet for "Successful Test IDs" listing pay_IDs found (Group by method like UPI, Card, NB if possible).
                4. DO NOT include recommendations. ONLY technical observations.
                
                JSON response format:
                {
                    "key_findings": ${JSON.stringify(extractedData.key_findings.slice(0, 4))},
                    "audit_summary": "- Bullet 1\\n- Bullet 2\\n- Bullet 3...",
                    "overall_status": "${extractedData.overall_status}"
                }
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            try {
                const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
                summaryBody = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);

                // Ensure key_findings are preserved from our extraction if AI hallucinates
                if (!summaryBody.key_findings || summaryBody.key_findings.length === 0) {
                    summaryBody.key_findings = extractedData.key_findings.slice(0, 4);
                }
            } catch (e) {
                console.warn("AI response parsing failed, using manual fallback.");
            }
        } catch (error) {
            console.error('Gemini error:', error.message);
        }
    }

    // Fallback if AI fail or not configured
    if (!summaryBody) {
        summaryBody = generateFallbackSummary(extractedData);
    }

    const fullSummary = {
        id: `sum_${Date.now()}`,
        audit_id: metadata.audit_id || `audit_${Date.now()}`,
        merchant_name: extractedData.merchant_name,
        product_type: extractedData.product_type,
        audit_date: metadata.audit_date || new Date().toISOString(),
        summary_date: new Date().toISOString(),
        ...summaryBody
    };

    try {
        const storedData = JSON.parse(fs.readFileSync(SUMMARY_DATA_FILE, 'utf8'));
        storedData.summaries.push(fullSummary);
        fs.writeFileSync(SUMMARY_DATA_FILE, JSON.stringify(storedData, null, 2));
        console.log(`✅ Audit summary stored for: ${extractedData.merchant_name}`);
    } catch (e) {
        console.error("Storage error:", e.message);
    }

    return fullSummary;
}

function extractAuditData(auditResult, metadata = {}) {
    const keyFindings = [];
    const paymentMethods = new Set();
    const testIds = [];
    let captureSettings = "standard mechanisms";
    let webhookStatus = "evaluated";
    let overallStatus = "Pass";

    const processItem = (item) => {
        const itemText = (item.item || item.label || item.config || item.config_item || "").toLowerCase();
        const status = (item.status || "").toLowerCase();
        const comment = (item.comment || item.specific_comment || "").toLowerCase();

        // Track payment methods
        if (itemText.includes("upi") || status.includes("upi")) paymentMethods.add("UPI");
        if (itemText.includes("card") || status.includes("card")) paymentMethods.add("Cards");
        if (itemText.includes("netbanking") || status.includes("netbanking")) paymentMethods.add("Netbanking");
        if (itemText.includes("wallet") || status.includes("wallet")) paymentMethods.add("Wallets");

        // Extract test IDs (pay_...)
        const payMatch = comment.match(/pay_[a-z0-9]+/gi) || status.match(/pay_[a-z0-9]+/gi);
        if (payMatch) testIds.push(...payMatch);

        // Track capture settings
        if (itemText.includes("capture")) {
            if (status.includes("auto") || comment.includes("auto")) captureSettings = "Auto-capture settings";
            else if (status.includes("manual") || comment.includes("manual")) captureSettings = "Manual capture settings";
        }

        // Track webhook status
        if (itemText.includes("webhook")) {
            if (status.includes("done") || status.includes("yes") || status === "x") webhookStatus = "fully integrated";
            else if (status.includes("pending") || status.includes("no")) webhookStatus = "pending optimization";
        }

        // Extract key findings for ALL Razorpay critical checks
        const originalItemName = item.item || item.label || item.config || item.config_item;
        const razorpayCriticalChecks = [
            "webhook", "signature", "order", "refund", "capture", "payment",
            "api", "sdk", "account", "key", "live", "test", "method", "config", "successful", "verify", "status", "consumes"
        ];

        const isCriticalCheck = razorpayCriticalChecks.some(check => itemText.includes(check));

        if (isCriticalCheck && originalItemName && status) {
            // Normalize status for display
            let displayStatus = status;
            if (status.includes("done") || status.includes("yes") || status === "x" || status.includes("pass")) {
                displayStatus = "Done";
            } else if (status.includes("fail")) {
                displayStatus = "Failed";
                overallStatus = "Action Required";
            } else if (status.includes("pending")) {
                displayStatus = "Pending";
                overallStatus = "Action Required";
            } else if (status.includes("n/a") || status.includes("na")) {
                displayStatus = "N/A";
            } else if (status.includes("no")) {
                displayStatus = "Not Done";
                overallStatus = "Action Required";
            } else {
                displayStatus = status.toUpperCase();
            }

            keyFindings.push(`${originalItemName}: ${displayStatus}`);
        }
    };

    const dataSources = [
        auditResult.audit_data,
        auditResult.checklist,
        auditResult.checklist_content,
        auditResult.auditChecklist,
        auditResult.results,
        auditResult.tech_checklist,
        auditResult.golive_results,
        auditResult.ncapps_results
    ];

    dataSources.forEach(source => {
        if (Array.isArray(source)) {
            source.forEach(section => {
                const checks = section.checks || section.configs || section.sub_items || section.results;
                if (Array.isArray(checks) && checks.length > 0) checks.forEach(processItem);
                else if (section.item || section.config || section.label) processItem(section);
            });
        }
    });

    if (keyFindings.length === 0) {
        keyFindings.push("All Razorpay integration checks completed");
    }

    const merchantName = metadata.merchant_name || auditResult.audit_metadata?.merchant_name || auditResult.merchant_info?.name || "the merchant";
    const productType = metadata.product_type || auditResult.product || "their payment integration";

    return {
        key_findings: keyFindings,
        payment_methods: paymentMethods,
        capture_settings: captureSettings,
        webhook_status: webhookStatus,
        overall_status: overallStatus,
        merchant_name: merchantName,
        product_type: productType,
        test_ids: [...new Set(testIds)]
    };
}

function generateFallbackSummary(extractedData) {
    const { key_findings, payment_methods, capture_settings, webhook_status, overall_status, merchant_name, product_type, test_ids } = extractedData;

    const methodsStr = payment_methods.size > 0 ? Array.from(payment_methods).join(", ") : "core payment methods";
    const testIdsStr = test_ids.length > 0 ? test_ids.join(", ") : "Validated in test environment";

    const bullets = [
        `- The user completes the payment journey on the ${merchant_name} platform.`,
        `- Technical validation confirms critical API implementations are ${overall_status === 'Pass' ? 'fully stable' : 'under review'}.`,
        `- Payment status is determined via webhooks for ${methodsStr}.`,
        `- ${capture_settings.charAt(0).toUpperCase() + capture_settings.slice(1)} are active as per dashboard configuration.`,
        `- Successful Test IDs: ${testIdsStr}.`
    ];

    return {
        key_findings: key_findings.slice(0, 4),
        audit_summary: bullets.join("\n"),
        overall_status: overall_status
    };
}

module.exports = {
    generateAndStoreSummary
};
