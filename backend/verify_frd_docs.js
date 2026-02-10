const frdGenerator = require('./services/frdGeneratorService');
const fs = require('fs');
const path = require('path');

async function verifyFrdReformatting() {
    const mockAuditResult = {
        merchant_info: { name: "Verification Merchant", mid: "VERIFY_MID_123", date: "2026-02-05" },
        audit_data: [
            {
                section: "Webhook Configs",
                checks: [{ item: "Events enabled", status: "Done", comment: "payment.captured, payment.failed" }]
            }
        ]
    };

    const mockEnrichmentData = {
        web_data: {
            description: "Verification Merchant is a test entity created for system validation.",
            website: "https://verification-test.com"
        }
    };

    const mockAuditSummary = {
        audit_summary: "- The user completes the payment journey on the Verification Merchant platform.\n- Technical validation confirms critical API implementations are fully stable.\n- Payment status is determined via webhooks for UPI, Cards.\n- Auto-capture settings are active as per dashboard configuration.\n- Successful Test IDs: pay_PzqntDC2ttfaRQ (UPI), pay_Q3WU4xtt0oGZbA (Card)."
    };

    const productType = "Subscriptions";
    const diagramPath = null;

    try {
        console.log("Generating test FRD with feedback-based format...");
        const result = await frdGenerator.generateFRD(mockAuditResult, mockEnrichmentData, productType, diagramPath, mockAuditSummary);

        console.log("Reading generated MD file:", result.md);
        const content = fs.readFileSync(result.md, 'utf8');

        // Check for expected headers (CLEAN - no HTML)
        const expectedHeaders = [
            "## 1. Requirement Specification:",
            "## 2. Detailed Requirements",
            "### 3.2 Audit Caughts",
            "### 3.3 Checklist Link"
        ];

        expectedHeaders.forEach(header => {
            if (content.includes(header)) {
                console.log(`✅ SUCCESS: Clean Header "${header}" found in MD.`);
            } else {
                console.error(`❌ FAILURE: Clean Header "${header}" MISSING from MD.`);
                console.log("Actual sample around header might be:", content.substring(0, 500));
                process.exit(1);
            }
        });

        // Check for NO HTML tags in MD (Except intentional layout tags)
        if (content.includes("<span")) {
            console.error("❌ FAILURE: Restricted HTML tags (span) found in raw MD file.");
            process.exit(1);
        } else {
            console.log("✅ SUCCESS: Minimal/Allowed HTML tags found in raw MD file.");
        }

        // Check for Cover Page mention in MD
        if (content.includes("base64")) {
            console.log("✅ SUCCESS: Cover page image found in MD.");
        } else {
            console.error("❌ FAILURE: Cover page image MISSING from MD.");
            process.exit(1);
        }

        // Check for Checklist Table in content
        if (content.includes("| Item | Status | Comment |")) {
            console.log("✅ SUCCESS: Checklist table found in MD.");
        } else {
            console.error("❌ FAILURE: Checklist table MISSING from MD.");
            process.exit(1);
        }

        // Check for Subscription API documentation (Correct Mapping)
        if (content.includes("https://razorpay.com/docs/payments/subscriptions/apis/")) {
            console.log("✅ SUCCESS: Subscription APIs correctly linked.");
        } else if (content.includes("charge-at-will")) {
            console.error("❌ FAILURE: Still showing Charge At Will docs for Subscriptions.");
            process.exit(1);
        } else {
            console.error("❌ FAILURE: Subscription documentation link MISSING.");
            process.exit(1);
        }

        console.log("\n✨ ALL VERIFICATION CHECKS PASSED ✨");

    } catch (error) {
        console.error("Verification failed with error:", error);
        process.exit(1);
    }
}

verifyFrdReformatting();
