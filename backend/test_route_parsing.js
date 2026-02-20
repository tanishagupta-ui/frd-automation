const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'uploads');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtime.getTime() - fs.statSync(path.join(dir, a)).mtime.getTime());

let routeFile;
for (const file of files) {
    const wb = xlsx.readFile(path.join(dir, file));
    const raw = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const str = raw.slice(0, 10).map(r => r.join(' ')).join(' ');
    if (str.includes('Linked account creation') || str.includes('Transfer process')) {
        routeFile = file;
        break;
    }
}

if (!routeFile) { console.log("No Route file found"); process.exit(0); }

console.log('Testing Route file:', routeFile);
const workbook = xlsx.readFile(path.join(dir, routeFile));
const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

console.log('\n--- Raw Excel Data (first 20 rows) ---');
rawData.slice(0, 20).forEach((row, i) => console.log(`Row ${i}: ${JSON.stringify(row)}`));

const routeDataPath = path.join(__dirname, 'data', 'route_checklist_data.json');
const routeStorage = JSON.parse(fs.readFileSync(routeDataPath, 'utf8'));

let currentCategory = '';

const isStatusValue = (value) => {
    const v = String(value).toLowerCase();
    return ['done', 'n/a', 'na', 'yes', 'no', 'pending', 'partial'].includes(v) || v.includes('pass') || v.includes('fail');
};

console.log('\n--- Parsing Results ---');
for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const cells = row.map(cell => (cell == null ? '' : String(cell).trim()));
    const colA = cells[0] || '';
    const colB = cells[1] || '';
    const colC = cells[2] || '';
    const colD = cells[3] || '';
    const colE = cells[4] || '';

    if (colA && colA.match(/^\d+\./)) currentCategory = colA;
    if (colB && colB.match(/^\d+\./)) currentCategory = colB;
    if (row.join(' ').includes('Additional Comments')) currentCategory = 'Additional Comments';

    if (colA === 'Audit Checklist' || colA === 'Tech Checklist' || colB === 'Configs') continue;
    if (!currentCategory) continue;

    let itemCell = '';
    let statusCell = '';
    let commentCell = '';

    if (colB && !colB.match(/^\d+\./) && colB !== 'Audit Checklist' && colB !== 'Tech Checklist') {
        itemCell = colB;
        statusCell = colC;
        commentCell = colD;
    } else if (colC && colC !== 'Status' && colC !== 'Configs') {
        itemCell = colC;
        statusCell = colD;
        commentCell = colE;
    }

    if (itemCell) {
        const itemNorm = itemCell.replace(/\s+/g, '').toLowerCase();

        const possibleItems = routeStorage.route_template_items
            .filter(t => t.category_name === currentCategory)
            .sort((a, b) => b.item_description.length - a.item_description.length);

        const templateItem = possibleItems.find(t => {
            const descNorm = t.item_description.replace(/\s+/g, '').toLowerCase();
            if (itemNorm === descNorm) return true;
            if (itemNorm.includes(descNorm) && descNorm.length > 2) return true;
            if (descNorm.includes(itemNorm) && itemNorm.length > 2) return true;
            return false;
        });

        if (templateItem) {
            console.log(`[${currentCategory}] Item: "${templateItem.item_description}" | Status: "${statusCell}" | Comment: "${commentCell}"`);
        } else {
            console.log(`[${currentCategory}] NO MATCH for: "${itemCell}"`);
        }
    }

    if (currentCategory === 'Additional Comments') {
        const comment = cells.filter(v => v && v.toLowerCase() !== 'additional comments' && !isStatusValue(v)).join(' ').trim();
        if (comment) console.log(`[Additional Comments] Comment: "${comment}"`);
    }
}

console.log('\nDone!');
