const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Mock data
const s2sData = [
    ["Audit Checklist", "Configs"],
    ["Account Live (Key/Secret)", "Done"],
    ["S2S Integration", "Secure Hash provided"],
    ["Signature verification", "Done"],
    ["Checkout library and platform"]
];

const standardData = [
    ["Audit Checklist", "Configs"],
    ["Account Live (Key/Secret)", "Done"],
    ["Standard Checkout", "Implemented"],
    ["Signature verification", "Done"],
    ["Checkout library and platform"]
];

function createExcel(filename, data) {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    xlsx.writeFile(wb, filename);
}

// Validation function (copied from server.js for isolated testing)
const validateChecklistContent = (type, data) => {
    const content = JSON.stringify(data).toLowerCase();
    const rawProduct = (type || "Unknown").toLowerCase().trim();

    // Normalize product name to a standard key for validation
    let p = rawProduct;
    if (p.includes("subscription")) p = "subscriptions";
    else if (p.includes("payment link") || p.includes("pay link")) p = "payment_links";
    else if (p.includes("qr code")) p = "qr_code";
    else if (p.includes("route")) p = "route";
    else if (p.includes("smart collect")) p = "smart_collect";
    else if (p.includes("charge at will") || p === "caw") p = "caw";
    else if (p.includes("affordability") || p.includes("affordability widget")) p = "affordability";
    else if (p.includes("standard checkout")) p = "standard_checkout";
    else if (p.includes("custom checkout")) p = "custom_checkout";
    else if (p.includes("s2s")) p = "s2s";

    // Define Signatures
    const signatures = {
        "subscriptions": ["plan creation", "subscription creation", "e mandate", "upi autopay", "plan id"],
        "route": ["linked account creation", "transfer process", "refund or reversal", "direct transfer"],
        "qr_code": ["qr code implementation", "dynamic qr", "instant qr"],
        "payment_links": ["set expiry", "regenerate keys", "ncapps"],
        "affordability": ["emi, cardless emi", "shopify", "woocommerce", "affordability widget"],
        "smart_collect": ["virtual account", "customer identifier", "smart collect"],
        "caw": ["charge at will", "tokenization", "repeat payments", "caw", "recurring", "card at will", "auto charge", "matrimony", "subsequent debit"],
        "checkout": ["account live (key/secret)", "webhook configs", "order creation", "successful payment id", "signature verification", "Checkout library and platform"]
    };

    const matchesSignature = (sigKey) => {
        const sigs = signatures[sigKey];
        if (!sigs) return false;
        return sigs.some(sig => content.includes(sig));
    };

    const selectedSigKey = (p === "standard_checkout" || p === "custom_checkout" || p === "s2s") ? "checkout" : p;

    const matches = {};
    for (const sigKey in signatures) {
        matches[sigKey] = matchesSignature(sigKey);
    }

    if (matches["subscriptions"]) {
        matches["checkout"] = false;
    }

    if (matches["route"] || matches["qr_code"] || matches["payment_links"] || matches["affordability"] || matches["smart_collect"] || matches["caw"]) {
        matches["checkout"] = false;
    }

    if (matches[selectedSigKey]) {
        // --- Specific Validation for Checkout Types ---
        const isCheckoutProduct = (p === "standard_checkout" || p === "custom_checkout" || p === "s2s");
        if (isCheckoutProduct) {
            const hasS2S = content.includes("s2s");
            if (p === "s2s") {
                if (!hasS2S) return "S2S checklist must contain S2S integration details";
            } else {
                if (hasS2S) return "S2S checklist cannot be uploaded for Standard or Custom Checkout";
            }
        }
        return null;
    }

    return "Please upload the correct checklist";
};

// Running Tests
console.log("--- Running Validation Tests ---");

const testCases = [
    { type: "Standard Checkout", data: s2sData, expected: "S2S checklist cannot be uploaded for Standard or Custom Checkout" },
    { type: "S2S", data: s2sData, expected: null },
    { type: "S2S", data: standardData, expected: "S2S checklist must contain S2S integration details" },
    { type: "Standard Checkout", data: standardData, expected: null }
];

testCases.forEach((tc, idx) => {
    const result = validateChecklistContent(tc.type, tc.data);
    const passed = result === tc.expected;
    console.log(`Test ${idx + 1}: ${tc.type} with ${tc.data[tc.data.length - 1][0]} -> Result: "${result}" ${passed ? "✅" : "❌"}`);
});
