const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// 1. Create a dummy Excel file for Affordability Widget
const filePath = path.join(__dirname, 'test_affordability_checklist.xlsx');
const wb = xlsx.utils.book_new();

// Header info
const data = [
    ["MX Name: Affordability Test Merchant", "Audit Checklist", "Configs", "Status", "Comment"],
    ["MID: AFF_MID_999", "", "", "", ""],
    ["", "1. Live Keys", "", "", ""],
    ["", "", "a. Downloading Keys", "Pass", "Keys are live"],
    ["", "2. Affordability Widget with", "", "", ""],
    ["", "", "a. Shopify", "Pass", "Shopify plugin works"],
    ["", "", "b. WooCommerce", "Fail", "Plugin not found"],
    ["", "Additional Comments", "", "", ""],
    ["", "webhook Url for payment", "https://aff-webhook.com", "", ""],
    ["", "General Notes", "Testing Affordability", "", ""]
];

const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
xlsx.writeFile(wb, filePath);

console.log("Created test Excel file:", filePath);

// 2. Upload file
async function testUpload() {
    const form = new FormData();
    form.append('product', 'Affordability Widget');
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
