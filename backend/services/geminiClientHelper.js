/**
 * geminiClientHelper.js
 *
 * Handles Gemini AI client initialization.
 * Google AI Studio API keys come in two formats:
 * - AIza...
 * - AQ... (New format)
 * Both are valid permanent API keys.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let _cachedClient = null;

/**
 * Returns a fresh GoogleGenerativeAI instance.
 */
async function getGeminiClient() {
    const envKey = process.env.GEMINI_API_KEY || '';

    if (!envKey) {
        console.warn('⚠️  GEMINI_API_KEY not set in .env');
        return null;
    }

    if (!_cachedClient) {
        _cachedClient = new GoogleGenerativeAI(envKey);
    }
    return _cachedClient;
}

/**
 * Invalidates the cached client.
 */
function invalidateGeminiClient() {
    _cachedClient = null;
}

module.exports = { getGeminiClient, invalidateGeminiClient };
