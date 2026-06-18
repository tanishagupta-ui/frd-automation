const fs = require('fs');
const file = 'services/frdGeneratorService.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `function buildWebDataSummary(webData, merchantName) {
  const defaultFallback = \`**\${cleanMerchantName(merchantName || "The merchant")}\** is integrating Razorpay solutions to enhance their online payment experience. The objective is to provide a seamless, secure, and reliable transaction flow tailored to their business requirements.\`;

  if (webData && webData.description && webData.description !== "Not found") {
    const company = cleanMerchantName(webData.company_name || merchantName || "The company");
    const description = webData.description || "";
    const industry = webData.industry
      ? \`It operates in \${webData.industry}. \`
      : "";
    const location = webData.location ? \`Based in \${webData.location}, \` : "";
    const size = webData.company_size
      ? \`with a team size of \${webData.company_size}, \`
      : "";
    const services =
      Array.isArray(webData.products_services) &&
        webData.products_services.length > 0
        ? \`Key offerings include \${webData.products_services
          .slice(0, 4)
          .join(", ")}\${webData.products_services.length > 4 ? ", and more" : ""
        }.\`
        : "";

    const prefix = location || size ? \`\${location}\${size}\`.trim() + " " : "";
    const base = description.endsWith(".") ? description : \`\${description}.\`;

    const companyPrefix = base.toLowerCase().startsWith(company.toLowerCase()) ? "" : \`\${company} \`;

    return \`\${companyPrefix}\${base} \${industry}\${prefix}\${services}\`
      .replace(/\\s+/g, " ")
      .trim();
  }

  return defaultFallback;
}`;

content = content.replace(/function buildWebDataSummary\([\s\S]*?return "NA";\n\}/, replacement);
fs.writeFileSync(file, content);
console.log('Patched');
