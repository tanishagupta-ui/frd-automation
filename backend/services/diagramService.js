const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const MERMAID_FLOWS = require('../templates/mermaidFlows');

const DIAGRAMS_DIR = path.join(__dirname, '../diagrams');

// Ensure diagrams directory exists
if (!fs.existsSync(DIAGRAMS_DIR)) {
    fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
}

/**
 * Get Mermaid code for a specific product with dynamic merchant name
 * @param {string} productKey - Product key (e.g., 'subscriptions', 'standard_checkout')
 * @param {string} merchantName - Merchant name to use in diagram (e.g., 'Uber', 'Sugarfit')
 * @returns {string|null} Mermaid diagram code
 */
function getMermaidCode(productKey, merchantName = 'Merchant') {
    const template = MERMAID_FLOWS[productKey];
    if (!template) return null;

    // Call the template function with merchant name
    return template(merchantName);
}

/**
 * Convert Mermaid code to PNG image using Mermaid.ink API
 * @param {string} mermaidCode - Mermaid diagram code
 * @returns {Promise<Buffer>} Image buffer
 */
async function convertMermaidToImage(mermaidCode) {
    try {
        // Encode Mermaid code to base64
        const base64Code = Buffer.from(mermaidCode).toString('base64');

        // Mermaid.ink API URL
        const imageUrl = `https://mermaid.ink/img/${base64Code}`;

        console.log(`Generating diagram from Mermaid.ink...`);

        // Fetch the image
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000, // 10 second timeout
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error('Error converting Mermaid to image:', error.message);
        throw new Error('Failed to generate diagram image');
    }
}

/**
 * Generate and save diagram image for a product
 * @param {string} productKey - Product key
 * @param {string} merchantName - Merchant name (optional, for filename)
 * @returns {Promise<string>} Path to saved diagram
 */
async function generateDiagram(productKey, merchantName = null) {
    try {
        // Use merchant name or default to 'Merchant'
        const displayName = merchantName || 'Merchant';

        // Get Mermaid code for product with merchant name
        const mermaidCode = getMermaidCode(productKey, displayName);

        if (!mermaidCode) {
            throw new Error(`No Mermaid template found for product: ${productKey}`);
        }

        console.log(`Generating diagram for product: ${productKey} (Merchant: ${displayName})`);

        // Convert to image
        const imageBuffer = await convertMermaidToImage(mermaidCode);

        // Generate filename
        const sanitizedMerchant = displayName
            ? displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')
            : 'default';
        const filename = `${productKey}_${sanitizedMerchant}_${Date.now()}.png`;
        const filepath = path.join(DIAGRAMS_DIR, filename);

        // Save image
        fs.writeFileSync(filepath, imageBuffer);
        console.log(`✅ Diagram saved: ${filename}`);

        return filepath;
    } catch (error) {
        console.error('Error generating diagram:', error.message);
        throw error;
    }
}

/**
 * Get list of available product keys
 * @returns {string[]} Array of product keys
 */
function getAvailableProducts() {
    return Object.keys(MERMAID_FLOWS);
}

module.exports = {
    getMermaidCode,
    convertMermaidToImage,
    generateDiagram,
    getAvailableProducts
};
