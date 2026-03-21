const PRODUCT_KEYS = require("./backend/mappings/productKeys");
const productDocsMap = require("./backend/mappings/productDocsMap");
const { resolveProductDocs } = require("./backend/services/productResolver");

function test(name) {
    console.log(`Testing: "${name}"`);
    try {
        const key = PRODUCT_KEYS[name] || PRODUCT_KEYS[name.toLowerCase()] || PRODUCT_KEYS[name.replace(/\s+/g, " ")];
        console.log(`  Mapped Key: ${key}`);

        const docs = resolveProductDocs(name);
        console.log(`  Resolved Docs: ${docs.productName} (${docs.frdLabel})`);
        console.log(`  URLs: ${docs.docs.map(d => d.url).join(", ")}`);
    } catch (e) {
        console.log(`  FAILED: ${e.message}`);
    }
    console.log("---");
}

test("Affordability");
test("Affordability Widget");
test("affordability");
test("Standard Checkout");
test("Subscriptions");
test("Route");
test("Payment Links");
