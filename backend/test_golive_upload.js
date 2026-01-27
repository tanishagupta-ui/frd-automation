const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// 1. Create a dummy Excel file for Go Live Checklist
const filePath = path.join(__dirname, 'test_golive_checklist.xlsx');
const wb = xlsx.utils.book_new();

// Header info matching the request
const data = [
    ["MX Name: Go Live Test Merchant", "Audit Checklist", "Configs", "Status", "Comments"],
    ["MID: GL_MID_123", "", "", "", ""],
    ["", "Tech Checklist", "Configs", "Status", "Comments"], // Header row often repeated or varied
    ["", "", "Account Live (Key/Secret)", "Done", "Keys active"],
    ["", "", "Webhook Configs", "Pending", "Customer delaying"],
    ["", "", "Signature Verification", "Done", "Verified in Coralogix"],
    ["", "", "Unknown Config Item", "N/A", "Should be Unmapped"]
];

const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, filePath);

console.log("Created test Excel file:", filePath);

// 2. Upload file
async function testUpload(productName) {
    const form = new FormData();
    form.append('product', productName);
    form.append('checklist', fs.createReadStream(filePath));

    try {
        console.log(`Testing upload for: ${productName}`);
        const res = await axios.post('http://localhost:5001/upload', form, {
            headers: { ...form.getHeaders() }
        });

        console.log("Upload Success! Status:", res.status);
        console.log("Response Data (Snippet):", JSON.stringify(res.data.data, null, 2));

    } catch (err) {
        console.error("Upload Failed:", err.message);
        if (err.response) console.error("Error Response:", err.response.data);
    }
}

// Run for one of the supported products
testUpload("Standard Checkout");
