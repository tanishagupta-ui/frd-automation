const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// 1. Create a dummy Excel file for QR Code
const filePath = path.join(__dirname, 'test_qrcode_checklist.xlsx');
const wb = xlsx.utils.book_new();

// Header info
const data = [
    ["MX Name: QR Test Merchant", "Audit Checklist", "Configs", "Status", "Comment"],
    ["MID: QR_MID_123", "", "", "", ""],
    ["", "1. Live Keys", "", "", ""],
    ["", "", "Downloading Keys", "Pass", "Keys downloaded"],
    ["", "2. QR Code Implementation", "", "", ""],
    ["", "", "Dashboard", "Pass", "Dash verified"],
    ["", "", "Instant QR", "N/A", "Not used"],
    ["", "Additional Comments", "", "", ""],
    ["", "webhook Url for payment", "https://example.com/hook", "", ""],
    ["", "Webhook Events", "payment.captured, payment.failed", "", ""]
];

const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, filePath);

console.log("Created test Excel file:", filePath);

// 2. Upload file
async function testUpload() {
    const form = new FormData();
    form.append('product', 'QR Code');
    form.append('checklist', fs.createReadStream(filePath));

    try {
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

testUpload();
