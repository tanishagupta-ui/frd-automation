const { fetchMerchantInfo } = require('./services/merchantService');
const fs = require('fs');
const path = require('path');

async function testUnifiedEnrichment() {
    console.log("Testing Unified Merchant Enrichment...");

    const merchantName = "Test Unified Merchant " + Date.now();
    const merchantId = "MID_" + Math.floor(Math.random() * 1000);

    try {
        console.log(`Step 1: Fetching info for ${merchantName}...`);
        const result = await fetchMerchantInfo(merchantName, merchantId);

        console.log("Result received:", JSON.stringify(result, null, 2));

        console.log("\nStep 2: Checking storage file format...");
        const dataPath = path.join(__dirname, 'data/merchant_enrichment_data.json');
        const storage = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        if (storage.enrichments && Array.isArray(storage.enrichments)) {
            console.log("✅ SUCCESS: Data stored in 'enrichments' array format.");
            const entry = storage.enrichments.find(e => e.merchant_name === merchantName);
            if (entry) {
                console.log("✅ SUCCESS: Entry found for test merchant.");
                console.log("Details:", {
                    id: entry.id,
                    name: entry.merchant_name,
                    mid: entry.merchant_id,
                    date: entry.search_date
                });
            } else {
                console.log("❌ FAILURE: Entry NOT found in storage.");
            }
        } else {
            console.log("❌ FAILURE: Storage is NOT in the new array format.");
        }

    } catch (e) {
        console.error("❌ TEST FAILED:", e.message);
    }
}

testUnifiedEnrichment();
