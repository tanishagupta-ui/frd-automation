const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// 1. Create a dummy Excel file for NCApps
const filePath = path.join(__dirname, 'test_ncapps_checklist.xlsx');
const wb = xlsx.utils.book_new();

// Header info
const data = [
    ["MX Name: NCApps Test Merchant", "Audit Checklist", "Configs", "Status", "Comment"],
    ["MID: NCAPPS_MID_999", "", "", "", ""],
    ["", "1. Live Keys", "", "", ""],
    ["", "", "Downloading Keys", "Pass", "Keys are live"],
    ["", "2. Implementation Setup", "", "", ""],
    ["", "", "Standard Checkout", "Pass", "Verified standard"],
    ["", "", "Additional Comments", "", ""],
    ["", "webhook Url for payment", "https://ncapps-webhook.com", "", ""],
    ["", "Webhook Events", "order.paid, payment.captured", "", ""]
];

const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, filePath);

console.log("Created test Excel file:", filePath);

// 2. Upload file
async function testUpload() {
    const form = new FormData();
    form.append('product', 'NCApps');
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
