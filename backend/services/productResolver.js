const PRODUCT_KEYS = require("../mappings/productKeys");
const productDocsMap = require("../mappings/productDocsMap");

function resolveProductDocs(uiProductName) {
    const normalizedName = String(uiProductName || "").trim();
    const productKey =
        PRODUCT_KEYS[normalizedName] ||
        PRODUCT_KEYS[normalizedName.toLowerCase()] ||
        PRODUCT_KEYS[normalizedName.replace(/\s+/g, " ")];

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
