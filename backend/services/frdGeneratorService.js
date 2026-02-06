const fs = require('fs');
const path = require('path');
const markdownpdf = require('markdown-pdf');

const FRD_EXPORTS_DIR = path.join(__dirname, '../generated_frds');

// Ensure exports directory exists
if (!fs.existsSync(FRD_EXPORTS_DIR)) {
    fs.mkdirSync(FRD_EXPORTS_DIR, { recursive: true });
}

/**
 * Automatically generates a professional Markdown FRD and its PDF version.
 * @param {Object} auditResult - The parsed results from the Excel checklist.
 * @param {Object} enrichmentData - The merchant info.
 * @param {string} productType - The type of product.
 * @param {string} diagramPath - Absolute path to the diagram image.
 * @returns {Promise<Object>} Paths to the generated files.
 */
async function generateFRD(auditResult, enrichmentData, productType, diagramPath) {
    try {
        const merchantName = auditResult.merchant_info?.name ||
            auditResult.audit_metadata?.merchant_name ||
            enrichmentData?.merchant_name ||
            'Merchant';

        const safeMerchantName = merchantName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `FRD_${safeMerchantName}_${timestamp}.md`;
        const filepath = path.join(FRD_EXPORTS_DIR, filename);

        const webData = enrichmentData?.web_data || {};

        let markdown = `# Functional Requirements Document\n`;
        markdown += `## ${merchantName.toUpperCase()}\n\n`;
        markdown += `**Date:** ${new Date().toLocaleDateString()}\n`;
        markdown += `**Product:** ${productType}\n\n---\n\n`;

        // 1. Requirements Description
        markdown += `## 1. Requirements Description\n\n`;
        markdown += `### 1.1 Background\n`;
        if (webData.description && webData.description !== "Not found") {
            markdown += `${webData.description}\n\n`;
        } else {
            markdown += `Background information provided by merchant for ${merchantName}.\n\n`;
        }

        markdown += `### 1.2 Industry & Location\n`;
        markdown += `- **Industry:** ${webData.industry || 'Not specified'}\n`;
        markdown += `- **Location:** ${webData.location || 'Not specified'}\n`;
        markdown += `- **Website:** ${webData.website || 'Not specified'}\n`;
        markdown += `- **Business Model:** ${webData.business_model || 'Not specified'}\n`;
        markdown += `- **Target Audience:** ${webData.target_audience || 'Not specified'}\n\n`;

        // 2. Technical Specifications
        markdown += `## 2. Technical Specifications\n\n`;
        markdown += `- **Merchant Name:** ${merchantName}\n`;
        markdown += `- **Product Type:** ${productType}\n`;

        // Extract MID if available
        const mid = auditResult.merchant_info?.mid || auditResult.audit_metadata?.merchant_id || 'Pending';
        markdown += `- **MID:** ${mid}\n\n`;

        // 3. Process Flow
        markdown += `## 3. Process Flow\n\n`;
        let pdfMarkdown = markdown;

        if (diagramPath && fs.existsSync(diagramPath)) {
            // Read file and convert to base64 to embed directly
            const bitmap = fs.readFileSync(diagramPath);
            const base64Image = Buffer.from(bitmap).toString('base64');

            // Determine mime type based on extension
            const ext = path.extname(diagramPath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

            const dataURI = `data:${mimeType};base64,${base64Image}`;
            markdown += `![Process Flow](${dataURI})\n\n`;

            // For PDF, use absolute path directly (works better with markdown-pdf)
            pdfMarkdown += `![Process Flow](${diagramPath})\n\n`;
        } else {
            const noDiagramMsg = `*Diagram pending generation.*\n\n`;
            markdown += noDiagramMsg;
            pdfMarkdown += noDiagramMsg;
        }

        // 4. Audit Findings & Checklist Status
        const auditHeader = `## 4. Audit Findings\n\n`;
        markdown += auditHeader;
        pdfMarkdown += auditHeader;

        const checklist = auditResult.audit_data || auditResult.checklist || auditResult.checklist_content || auditResult.auditChecklist;

        if (Array.isArray(checklist)) {
            checklist.forEach(section => {
                const sectionName = section.section || section.category || "General";
                const subHeader = `### ${sectionName}\n`;
                markdown += subHeader;
                pdfMarkdown += subHeader;
                const checks = section.checks || section.configs || section.sub_items || [];

                if (Array.isArray(checks) && checks.length > 0) {
                    const tableHeader = `| Item | Status | Comment |\n| :--- | :--- | :--- |\n`;
                    markdown += tableHeader;
                    pdfMarkdown += tableHeader;
                    checks.forEach(check => {
                        const label = check.item || check.label || check.config || "Unknown Item";
                        const status = check.status || "N/A";
                        const comment = check.comment || "";
                        const row = `| ${label} | **${status}** | ${comment} |\n`;
                        markdown += row;
                        pdfMarkdown += row;
                    });
                    markdown += `\n`;
                    pdfMarkdown += `\n`;
                } else {
                    const empty = `*No items found in this section.*\n\n`;
                    markdown += empty;
                    pdfMarkdown += empty;
                }
            });
        }

        if (auditResult.additionalComments) {
            const commentsSection = `### Additional Comments\n${auditResult.additionalComments}\n\n`;
            markdown += commentsSection;
            pdfMarkdown += commentsSection;
        }

        // 5. Best Practices
        let bestPractices = `## 5. Integration Best Practices\n\n`;
        bestPractices += `- **Fetch APIs:** Use Razorpay Fetch APIs for status reconciliation.\n`;
        bestPractices += `- **Webhooks:** Verify signatures on all webhook events.\n`;
        bestPractices += `- **Error Handling:** Ensure all error codes are properly consumed and mapped in user-friendly messages.\n`;

        markdown += bestPractices;
        pdfMarkdown += bestPractices;

        fs.writeFileSync(filepath, markdown);
        console.log(`✅ Automated FRD generated: ${filename}`);

        // Generate PDF
        const pdfFilename = filename.replace('.md', '.pdf');
        const pdfFilepath = path.join(FRD_EXPORTS_DIR, pdfFilename);

        console.log(`Generating PDF version: ${pdfFilename}...`);

        await new Promise((resolve, reject) => {
            markdownpdf()
                .from.string(pdfMarkdown)
                .to(pdfFilepath, function () {
                    console.log(`✅ PDF generated: ${pdfFilename}`);
                    resolve();
                });
        });

        return { md: filepath, pdf: pdfFilepath };
    } catch (error) {
        console.error('Error generating automated FRD:', error);
        throw error;
    }
}

module.exports = {
    generateFRD
};
