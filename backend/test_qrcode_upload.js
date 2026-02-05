const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// 1. Create a dummy Excel file for QR Code Checklist
const filePath = path.join(__dirname, 'test_qrcode_checklist.xlsx');
const wb = xlsx.utils.book_new();

const data = [
    ["MX Name: QR Code Test Merchant", "Audit Checklist", "Configs", "Status", "Comments"],
    ["MID: QR_MID_999", "", "", "", ""],
    ["", "Tech Checklist", "Configs", "Status", "Comments"],
    ["", "", "Downloading Keys", "Done", "Keys active"],
    ["", "", "Webhook Configs", "Done", "Integrated"],
    ["", "", "Signature Verification", "Done", "Verified"],
];

const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, filePath);

console.log("Created test QR Code Excel file:", filePath);

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

// Run for QR Code (singular, as sent by frontend)
testUpload("QR Code");
