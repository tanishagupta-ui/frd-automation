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
    let summaryBody;

    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

            let findingsText = "";
            if (auditResult.audit_data) findingsText = JSON.stringify(auditResult.audit_data);
            else if (auditResult.checklist) findingsText = JSON.stringify(auditResult.checklist);
            else if (auditResult.checklist_content) findingsText = JSON.stringify(auditResult.checklist_content);
            else if (auditResult.auditChecklist) findingsText = JSON.stringify(auditResult.auditChecklist);

            if (auditResult.additionalComments) findingsText += "\nComments: " + auditResult.additionalComments;

            const prompt = `
                Analyze the following audit findings for "${metadata.merchant_name}".
                
                MANDATORY: Summarize the "additionalComments" field into exactly 3-4 distinct and concise key points. 
                Even if the comments are provided as a single block of text, you MUST distill them into 3-4 specific bullet points.
                
                You can optionally add 1-2 points from other checklist findings if they are critical.
                
                JSON response format:
                {
                    "key_findings": ["Point 1 from comments", "Point 2 from comments", "Point 3 from comments", "Point 4 (Optional)"],
                    "overall_status": "Pass/Fail/Action Required",
                    "additional_recommendations": "Concise next steps"
                }
                
                Data:
                ${findingsText}
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            try {
                const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
                summaryBody = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);
            } catch (e) {
                console.warn("AI response parsing failed, using manual fallback.");
            }
        } catch (error) {
            console.error('Gemini error:', error.message);
        }
    }

    // Fallback if AI fails
    if (!summaryBody) {
        summaryBody = extractPointsManually(auditResult);
    }

    const fullSummary = {
        id: `sum_${Date.now()}`,
        audit_id: metadata.audit_id || `audit_${Date.now()}`,
        merchant_name: metadata.merchant_name,
        product_type: metadata.product_type,
        audit_date: metadata.audit_date || new Date().toISOString(),
        summary_date: new Date().toISOString(),
        ...summaryBody
    };

    try {
        const storedData = JSON.parse(fs.readFileSync(SUMMARY_DATA_FILE, 'utf8'));
        storedData.summaries.push(fullSummary);
        fs.writeFileSync(SUMMARY_DATA_FILE, JSON.stringify(storedData, null, 2));
        console.log(`✅ Audit summary stored for: ${metadata.merchant_name}`);
    } catch (e) {
        console.error("Storage error:", e.message);
    }

    return fullSummary;
}

function extractPointsManually(auditResult) {
    const keyFindings = [];
    let overallStatus = "Pass";

    const processItem = (item) => {
        const status = (item.status || "").toLowerCase();
        if (status.includes("fail") || status.includes("pending") || status.includes("no") || status === "x") {
            keyFindings.push(`Improve: ${item.item || item.label || "Checklist item"} - ${item.comment || "Action required"}`);
            overallStatus = "Action Required";
        }
    };

    const dataSources = [auditResult.audit_data, auditResult.checklist, auditResult.checklist_content, auditResult.auditChecklist];
    dataSources.forEach(source => {
        if (Array.isArray(source)) {
            source.forEach(section => {
                const checks = section.checks || section.configs || section.sub_items || [];
                if (Array.isArray(checks)) checks.forEach(processItem);
            });
        }
    });

    if (auditResult.additionalComments) {
        const points = auditResult.additionalComments.split(/[.\n!?;]/).map(s => s.trim()).filter(s => s.length > 5);
        points.slice(0, 4).forEach(point => {
            keyFindings.push(`Comment: ${point}`);
        });
    }

    if (keyFindings.length === 0) {
        keyFindings.push("All checked items are in good standing.");
    }

    return {
        key_findings: keyFindings.slice(0, 5),
        overall_status: overallStatus,
        additional_recommendations: auditResult.additionalComments ? "Address points mentioned in comments." : "No major recommendations."
    };
}

module.exports = {
    generateAndStoreSummary
};
