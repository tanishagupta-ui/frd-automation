const { generateAndStoreSummary } = require('./services/auditSummaryService');
const fs = require('fs');
const path = require('path');

async function testSummarization() {
    console.log("Starting Audit Summarization Test...");

    const auditData = {
        audit_id: "test_audit_123",
        audit_data: [
            {
                section: "1. Order creation",
                checks: [
                    { item: "a. Partial Payments", status: "N/A", comment: "Not supported" },
                    { item: "b. Capture settings", status: "Done", comment: "Auto-capture enabled" }
                ]
            },
            {
                section: "2. Checkout configuration",
                checks: [
                    { item: "a. Handler Function", status: "Fail", comment: "Missing handler" }
                ]
            }
        ],
        additionalComments: "Merchant needs to implement the handler function immediately."
    };

    const metadata = {
        audit_id: "test_audit_123",
        merchant_name: "Test Merchant",
        product_type: "Charge at Will",
        audit_date: new Date().toISOString()
    };

    try {
        const summary = await generateAndStoreSummary(auditData, metadata);

        if (summary) {
            console.log("✅ Summary generated successfully:");
            console.log(JSON.stringify(summary, null, 2));

            // Verify file exists and contains the summary
            const summaryFile = path.join(__dirname, 'data', 'audit_summaries.json');
            if (fs.existsSync(summaryFile)) {
                const content = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
                const found = content.summaries.find(s => s.audit_id === "test_audit_123");
                if (found) {
                    console.log("✅ Summary confirmed in storage file.");
                } else {
                    console.error("❌ Summary not found in storage file.");
                }
            }
        } else {
            console.error("❌ Summary generation failed.");
        }
    } catch (error) {
        console.error("❌ Test error:", error);
    }
}

testSummarization();
