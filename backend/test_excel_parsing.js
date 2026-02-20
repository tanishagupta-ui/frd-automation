const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const dir = '/Users/tanisha.gupta/Documents/frd automation/backend/uploads/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'))
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
const latest = files[0].name;
console.log('Latest file:', latest);
const workbook = xlsx.readFile(path.join(dir, latest));
const sheetName = workbook.SheetNames[0];
const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
console.log(rawData.slice(0, 15).map(row => row.map(c => c ? String(c).trim() : '')));
