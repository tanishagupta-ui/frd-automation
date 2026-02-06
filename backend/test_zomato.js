const { fetchMerchantInfo } = require('./services/merchantService');

async function test() {
    console.log("Starting test...");
    const result = await fetchMerchantInfo("Zomato");
    console.log("Result:", JSON.stringify(result, null, 2));
}

test().catch(console.error);
