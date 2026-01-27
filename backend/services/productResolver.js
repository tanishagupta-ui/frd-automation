const PRODUCT_KEYS = require("../mappings/productKeys");
const productDocsMap = require("../mappings/productDocsMap");

function resolveProductDocs(uiProductName) {
    const productKey = PRODUCT_KEYS[uiProductName];

    if (!productKey) {
        throw new Error(`Unsupported product selected: ${uiProductName}`);
    }

    const productConfig = productDocsMap[productKey];

    if (!productConfig) {
        throw new Error(`No documentation found for product: ${productKey}`);
    }

    return productConfig;
}

module.exports = { resolveProductDocs };
