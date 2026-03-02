const xlsx = require('xlsx');
const path = require('path');

const files = [
    'test_ncapps_checklist.xlsx',
    'test_qrcode_checklist.xlsx',
    'test_golive_checklist.xlsx'
];

files.forEach(file => {
    try {
        const workbook = xlsx.readFile(path.join(__dirname, file));
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`--- ${file} ---`);
        console.log(data.slice(0, 10).map(row => row.slice(0, 5)));
    } catch (e) {
        console.log(`Error reading ${file}: ${e.message}`);
    }
});
