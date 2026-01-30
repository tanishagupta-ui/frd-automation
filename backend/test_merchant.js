const { fetchMerchantInfo } = require('./services/merchantService');

async function testMerchantInfo() {
    console.log("Testing existing merchant enrichment...");
    try {
        const info = await fetchMerchantInfo("Razorpay");
        console.log("Result:", info);
    } catch (e) {
        console.error("Test failed:", e.message);
    }
}

testMerchantInfo();
