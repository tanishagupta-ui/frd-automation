const merchantService = require('./backend/services/merchantService');
const path = require('path');

const filePath = path.join(__dirname, 'backend/uploads/checklist-1770294397429-810335801.xlsx');
console.log('Testing extraction for:', filePath);

const name = merchantService.extractMerchantName(filePath, 'Some_Merchant_Audit.xlsx');
console.log('Extracted Name:', name);
