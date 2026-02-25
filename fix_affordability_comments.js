const fs = require('fs');
const path = require('path');

const auditsDir = path.join(__dirname, 'backend/data/affordability_audits');

if (!fs.existsSync(auditsDir)) {
    console.error(`Directory not found: ${auditsDir}`);
    process.exit(1);
}

const files = fs.readdirSync(auditsDir).filter(f => f.endsWith('.json'));

let updatedCount = 0;

files.forEach(file => {
    const filePath = path.join(auditsDir, file);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        if (typeof data.additional_comments === 'object' && data.additional_comments !== null) {
            const webhookUrl = data.additional_comments.webhook_url_events || '';
            let newComments = "webhook url events";
            if (webhookUrl) {
                newComments += ` ${webhookUrl}`;
            }

            data.additional_comments = newComments;

            // Also remove raw_additional_comments if it exists
            if (data.raw_additional_comments !== undefined) {
                delete data.raw_additional_comments;
            }

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            updatedCount++;
            console.log(`Updated: ${file}`);
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
});

console.log(`\nFinished. Updated ${updatedCount} files.`);
