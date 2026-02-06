const xlsx = require('./backend/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'backend/uploads');
if (!fs.existsSync(uploadsDir)) {
    console.error('Uploads dir not found:', uploadsDir);
    process.exit(1);
}

const files = fs.readdirSync(uploadsDir)
    .filter(f => f.endsWith('.xlsx'))
    .map(f => ({
        name: f,
        time: fs.statSync(path.join(uploadsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

console.log('Last 3 uploaded files:');
files.slice(0, 3).forEach(f => {
    console.log(`\n--- ${f.name} ---`);
    try {
        const workbook = xlsx.readFile(path.join(uploadsDir, f.name));
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        data.slice(0, 10).forEach(row => console.log(JSON.stringify(row)));
    } catch (e) {
        console.error('Error reading', f.name, e.message);
    }
});
