const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

async function verifySubscription() {
    const filePath = path.join(__dirname, 'test_subscription.xlsx');

    // Create mock Subscriptions Excel
    const wb = xlsx.utils.book_new();
    const data = [
        ["MX Name: Sub Merchant", "Audit Checklist", "Configs", "Status", "Comment"],
        ["MID: SUB123", "1. Methods Enabled", "E Mandate", "Pass", "Valid"],
        ["", "", "UPI Autopay", "Fail", "Fix this"],
        ["", "3. Subscription creation", "Plan_id", "Pass", "Found"],
        ["", "6. Subscription Management", "Fetch a Plan", "Pass", "OK"],
        ["", "9. Verify Payment / Token Status", "Webhooks", "Pass", "Events captured"],
        ["", "Additional Comments", "All good", "Pass", ""]
    ];
    const ws = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    xlsx.writeFile(wb, filePath);

    const form = new FormData();
    form.append('product', 'Subscriptions'); // Match backend plural
    form.append('checklist', fs.createReadStream(filePath));

    try {
        const response = await axios.post('http://localhost:5001/upload', form, {
            headers: form.getHeaders()
        });

        const result = response.data.data;
        console.log("Product:", result.product);
        console.log("Merchant:", result.audit_metadata.mx_name);

        let totalItems = 0;
        result.checklist_content.forEach(c => totalItems += c.checks.length);
        console.log("Total Items in Response:", totalItems);

        if (totalItems === 40) { // Canonical template has 40 items including Comments
            console.log("SUCCESS: All 40 canonical items captured!");
        } else {
            console.log("FAILURE: Expected 40 items, got", totalItems);
        }

        // Check if individual file exists
        const auditsDir = path.join(__dirname, 'data', 'subscription_audits');
        const sessionFiles = fs.readdirSync(auditsDir);
        const merchantFile = sessionFiles.find(f => f.includes('sub_merchant'));

        if (merchantFile) {
            console.log("SUCCESS: Individual session file created:", merchantFile);
        } else {
            console.log("FAILURE: Individual session file NOT found.");
        }

    } catch (error) {
        console.error("Upload Error:", error.response ? error.response.data : error.message);
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

verifySubscription();
