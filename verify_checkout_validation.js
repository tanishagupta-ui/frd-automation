/**
 * Test script for validateChecklistContent logic in server.js
 */

const signatures = {
    "subscriptions": ["plan creation", "subscription creation", "e mandate", "upi autopay", "plan id"],
    "route": ["linked account creation", "transfer process", "refund or reversal", "direct transfer"],
    "qr_code": ["qr code implementation", "dynamic qr", "instant qr"],
    "payment_links": ["set expiry", "regenerate keys", "ncapps"],
    "affordability": ["emi, cardless emi", "shopify", "woocommerce", "affordability widget"],
    "smart_collect": ["virtual account", "customer identifier", "smart collect"],
    "caw": ["charge at will", "tokenization", "repeat payments", "caw", "recurring", "card at will", "auto charge", "matrimony", "subsequent debit"],
    "checkout": ["account live (key/secret)", "webhook configs", "order creation", "successful payment id", "signature verification"]
};

const validateChecklistContent = (type, data, filename = "") => {
    const content = JSON.stringify(data).toLowerCase();
    const fileLower = filename.toLowerCase();
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

    // Helper to check if content matches a signature
    const matchesSignature = (sigKey) => {
        const sigs = signatures[sigKey];
        if (!sigs) return false;
        // Check if any of the signature phrases are found in the content
        return sigs.some(sig => content.includes(sig));
    };

    const selectedSigKey = (p === "standard_checkout" || p === "custom_checkout" || p === "s2s") ? "checkout" : p;

    // 1. Identify which signatures are present
    const matches = {};
    for (const sigKey of Object.keys(signatures)) {
        matches[sigKey] = matchesSignature(sigKey);
    }

    // 2. Refined Identification & Exclusions
    if (matches["subscriptions"]) {
        matches["checkout"] = false;
    }
    if (matches["route"] || matches["qr_code"] || matches["payment_links"] || matches["affordability"] || matches["smart_collect"] || matches["caw"]) {
        matches["checkout"] = false;
    }

    // 3. Validate Selection
    if (matches[selectedSigKey]) {
        // --- Specific Validation for Checkout Types ---
        const isCheckoutProduct = (p === "standard_checkout" || p === "custom_checkout" || p === "s2s");
        if (isCheckoutProduct) {
            const hasS2SKeyword = content.includes("s2s") || fileLower.includes("s2s");

            if (p === "s2s") {
                if (!hasS2SKeyword) return "Please upload the correct S2S checklist";
            } else if (p === "standard_checkout") {
                if (hasS2SKeyword) return "S2S checklist cannot be uploaded for Standard Checkout";
                if (fileLower.includes("custom")) return "Custom checklist cannot be uploaded for Standard Checkout";
            } else if (p === "custom_checkout") {
                if (hasS2SKeyword) return "S2S checklist cannot be uploaded for Custom Checkout";
            }
        }
        return null; // Successfully validated
    }

    return `Please upload the correct checklist`;
};

// Test Cases
const tests = [
    // S2S Tests
    { type: "S2S", data: ["signature verification", "s2s"], filename: "siggy.xlsx", expected: null },
    { type: "S2S", data: ["signature verification"], filename: "standard.xlsx", expected: "Please upload the correct S2S checklist" },
    { type: "S2S", data: ["signature verification"], filename: "s2s_integration.xlsx", expected: null },

    // Standard Checkout Tests
    { type: "Standard Checkout", data: ["signature verification"], filename: "standard.xlsx", expected: null },
    { type: "Standard Checkout", data: ["signature verification", "s2s"], filename: "standard.xlsx", expected: "S2S checklist cannot be uploaded for Standard Checkout" },
    { type: "Standard Checkout", data: ["signature verification"], filename: "s2s_siggy.xlsx", expected: "S2S checklist cannot be uploaded for Standard Checkout" },
    { type: "Standard Checkout", data: ["signature verification"], filename: "custom_checkout.xlsx", expected: "Custom checklist cannot be uploaded for Standard Checkout" },

    // Custom Checkout Tests
    { type: "Custom Checkout", data: ["signature verification"], filename: "custom.xlsx", expected: null },
    { type: "Custom Checkout", data: ["signature verification", "s2s"], filename: "custom.xlsx", expected: "S2S checklist cannot be uploaded for Custom Checkout" },
    { type: "Custom Checkout", data: ["signature verification"], filename: "s2s_special.xlsx", expected: "S2S checklist cannot be uploaded for Custom Checkout" },
];

tests.forEach((t, i) => {
    const result = validateChecklistContent(t.type, t.data, t.filename);
    if (result === t.expected) {
        console.log(`✅ Test ${i + 1} passed`);
    } else {
        console.error(`❌ Test ${i + 1} failed: Expected "${t.expected}", got "${result}"`);
    }
});
