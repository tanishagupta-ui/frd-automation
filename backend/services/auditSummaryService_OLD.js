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
    const extractedData = extractAuditData(auditResult);

    // Check if we should use AI
    let summaryBody = null;
    if (process.env.GEMINI_API_KEY && genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // Prepare context from extracted data
            const findingsList = extractedData.key_findings.map(f => `- ${f}`).join("\n");

            const prompt = `
                You are a Razorpay payment integration auditor. Analyze the provided audit findings and create a professional, narrative audit summary.
                
                MERCHANT: ${extractedData.merchant_name}
                PRODUCT: ${extractedData.product_type}
                
                CRITICAL CHECK FINDINGS:
                ${findingsList}
                
                PAYMENT METHODS: ${Array.from(extractedData.payment_methods).join(", ")}
                WEBHOOK STATUS: ${extractedData.webhook_status}
                CAPTURE SETTINGS: ${extractedData.capture_settings}
                
                IMPORTANT: 
                1. Write a SINGLE, PROFESSIONAL paragraph (5-8 sentences).
                2. Tone: Formal, authoritative, and flowy. Avoid robotic lists.
                3. Structure to follow (emulate this style):
                   - Start with: "The Razorpay [Product] integration audit for [Merchant] has resulted in an overall [Status] status..."
                   - specific technical details: "Technical validation confirms that critical API implementations—specifically [mention key checks found]—are [status description]."
                   - Balance: "While [mention any N/A or minor issues], the payment infrastructure for [Payment Methods] is robust..."
                   - Support: "...supported by [Webhook Status] webhooks for real-time event handling..."
                   - Conclusion: "With all reviewed security protocols verified, the integration is [stable/optimized/etc]."
                4. DO NOT include recommendations. ONLY factual statements.
                
                JSON response format:
                {
                    "key_findings": ${JSON.stringify(extractedData.key_findings.slice(0, 4))},
                    "audit_summary": "The professional narrative summary...",
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

function extractAuditData(auditResult) {
    const keyFindings = [];
    const paymentMethods = new Set();
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

    const merchantName = auditResult.audit_metadata?.merchant_name || auditResult.merchant_info?.name || "the merchant";
    const productType = auditResult.product || "their payment integration";

    return {
        key_findings: keyFindings,
        payment_methods: paymentMethods,
        capture_settings: captureSettings,
        webhook_status: webhookStatus,
        overall_status: overallStatus,
        merchant_name: merchantName,
        product_type: productType
    };
}

function generateFallbackSummary(extractedData) {
    const { key_findings, payment_methods, capture_settings, webhook_status, overall_status, merchant_name, product_type } = extractedData;

    // Ensure we handle empty sets/arrays safely
    const methodsStr = payment_methods.size > 0 ? Array.from(payment_methods).join(" and ") : "core payment methods";
    const findingsText = key_findings.slice(0, 4).map(f => f.replace(/:/g, " is")).join(", and ");

    const narrativeSummary = `A comprehensive Razorpay integration audit was conducted for ${merchant_name} on their ${product_type} product. ` +
        `The audit focused on critical payment infrastructure components including payment method configurations, API implementations, and security protocols. ` +
        `Specific critical assessments confirm that ${findingsText}. ` +
        `Payment methods reviewed include ${methodsStr}, with all enabled methods verified for proper functionality. ` +
        `Webhook configurations were ${webhook_status}, ensuring proper event handling and payment status updates. ` +
        `Capture settings are configured as ${capture_settings}, appropriate for the merchant's business model. ` +
        (overall_status === "Pass" ?
            `All critical Razorpay integration checks passed successfully, with no major issues identified. The integration follows Razorpay best practices and is production-ready.` :
            `Some critical checks require attention. The merchant should address the identified issues before proceeding to production.`);

    return {
        key_findings: key_findings.slice(0, 4),
        audit_summary: narrativeSummary,
        overall_status: overall_status
    };
}

module.exports = {
    generateAndStoreSummary
};
