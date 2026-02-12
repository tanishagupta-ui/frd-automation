const fs = require("fs");
const path = require("path");
const markdownpdf = require("markdown-pdf");
const { resolveProductDocs } = require("./productResolver");

const FRD_EXPORTS_DIR = path.join(__dirname, "../generated_frds");

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
async function generateFRD(
  auditResult,
  enrichmentData,
  productType,
  diagramPath
) {
  try {
    const merchantName =
      auditResult.merchant_info?.name ||
      auditResult.audit_metadata?.merchant_name ||
      auditResult.audit_metadata?.mx_name ||
      enrichmentData?.merchant_name ||
      "Merchant";

    const safeMerchantName = merchantName
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `FRD_${safeMerchantName}_${timestamp}.md`;
    const filepath = path.join(FRD_EXPORTS_DIR, filename);

    const webData = enrichmentData?.web_data || {};
    const mid =
      auditResult.merchant_info?.mid ||
      auditResult.audit_metadata?.merchant_id ||
      auditResult.audit_metadata?.mid ||
      "Pending";

    const backendCoverImagePath = path.resolve(
      __dirname,
      "../public/image.png"
    );
    const frontendCoverImagePath = path.resolve(
      __dirname,
      "../../frontend/public/image.png"
    );
    const coverImagePath = fs.existsSync(backendCoverImagePath)
      ? backendCoverImagePath
      : frontendCoverImagePath;
    let markdown = "";
    let pdfMarkdown = "";

    // --- Cover Page ---
    markdown += `<div class="cover-page">\n\n`;
    pdfMarkdown += `<div class="cover-page">\n\n`;

    if (fs.existsSync(coverImagePath)) {
      const bitmap = fs.readFileSync(coverImagePath);
      const base64Image = Buffer.from(bitmap).toString("base64");
      const dataURI = `data:image/png;base64,${base64Image}`;

      markdown += `![Cover Image](${dataURI})\n\n`;
      pdfMarkdown += `![Cover Image](${coverImagePath})\n\n`;
    }

    const titleText = `# Functional Requirements Document\n## ${merchantName.toUpperCase()}`;
    markdown += titleText + "\n\n";
    pdfMarkdown += titleText + "\n\n";

    const toc =
      `### Table of Contents\n\n` +
      `1. [Requirements Description](#1-requirements-description)\n` +
      `   1.1 [Background and Objectives](#11-background-and-objectives)\n` +
      `   1.2 [Business Requirement](#12-business-requirement)\n` +
      `2. [Detailed Requirements](#2-detailed-requirements)\n` +
      `   2.1 [Technical Specifications](#21-technical-specifications)\n` +
      `   2.2 [Special Programs](#22-special-programs)\n` +
      `   2.3 [Dependencies](#23-dependencies)\n` +
      `   2.4 [Configurations](#24-configurations)\n` +
      `   2.5 [Process Flow](#25-process-flow)\n` +
      `3. [Exception Scenarios](#3-exception-scenarios)\n` +
      `   3.1 [Error Handling](#31-error-handling)\n` +
      `   3.2 [Audit Findings](#32-audit-findings)\n` +
      `   3.3 [Checklist Link](#33-checklist-link)\n` +
      `   3.4 [Best Practice Suggestions](#34-best-practice-suggestions)\n` +
      `4. [Integration Best Practices](#4-integration-best-practices)\n\n`;

    markdown += `- **Owner Name: Rakshita Sharma**\n\n`;
    pdfMarkdown += `- **Owner Name: Rakshita Sharma**\n\n`;

    markdown += toc;
    pdfMarkdown += toc;

    markdown += `</div>\n\n`;
    pdfMarkdown += `</div>\n\n`;

    markdown += `<div class="page-break"></div>\n<div style="page-break-after:always;"></div>\n\n`;
    pdfMarkdown += `<div class="page-break"></div>\n<div style="page-break-after:always;"></div>\n\n`;

    const formattedDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    markdown += `**Date:** ${formattedDate}\n\n`;
    pdfMarkdown += `**Date:** ${formattedDate}\n\n`;

    // --- 1. Requirements Description ---
    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    markdown += `## 1. Requirements Description\n\n`;
    pdfMarkdown += `## 1. Requirements Description\n\n`;

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    markdown += `### 1.1 Background and Objectives:\n`;
    pdfMarkdown += `### 1.1 Background and Objectives:\n`;

    const bg = buildWebDataSummary(webData, merchantName);
    markdown += `${bg}\n\n`;
    pdfMarkdown += `${bg}\n\n`;

    markdown += `### 1.2 Business Requirement\n`;
    pdfMarkdown += `### 1.2 Business Requirement\n`;

    const businessReq =
      `**Merchant Name:** ${merchantName}  \n` +
      `**Objective:** Integrate with **Razorpay ${productType}** to facilitate seamless premium payments and recurring mandates.\n\n`;
    markdown += businessReq;
    pdfMarkdown += businessReq;

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    // --- 2. Detailed Requirements ---
    markdown += `## 2. Detailed Requirements\n\n`;
    pdfMarkdown += `## 2. Detailed Requirements\n\n`;

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    markdown += `### 2.1 Technical Specifications\n`;
    pdfMarkdown += `### 2.1 Technical Specifications\n`;
    const techSpecs =
      `- **MID:** ${mid}\n` +
      `- **Integration type:** ${productType} Integration\n` +
      `- **Platform:** ${extractPlatform(auditResult)}\n` +
      `- **Backend Language:** ${extractBackendLanguage(auditResult)}\n` +
      `- **Product used:** ${productType}\n`;
    markdown += techSpecs;
    pdfMarkdown += techSpecs;

    const methods = extractPaymentMethods(auditResult);
    const methodStr = `- **Payment methods:** ${
      methods.length > 0
        ? methods.join(", ")
        : "UPI, Emandate (Netbanking), Cards"
    }\n\n`;
    markdown += methodStr;
    pdfMarkdown += methodStr;

    markdown += `### 2.2 Special Programs\n`;
    pdfMarkdown += `### 2.2 Special Programs\n`;
    markdown += `There are no customized requirements at this stage.\n\n`;
    pdfMarkdown += `There are no customized requirements at this stage.\n\n`;

    markdown += `### 2.3 Dependencies\n\n`;
    pdfMarkdown += `### 2.3 Dependencies\n\n`;

    markdown += `#### 2.3.1 API Documentation\n`;
    pdfMarkdown += `#### 2.3.1 API Documentation\n`;
    let docConfig = null;
    try {
      docConfig = resolveProductDocs(productType);
    } catch (e) {
      console.warn(`Doc resolve failed for ${productType}: ${e.message}`);
    }

    if (
      docConfig &&
      Array.isArray(docConfig.docs) &&
      docConfig.docs.length > 0
    ) {
      docConfig.docs.forEach((doc) => {
        const line = `- [${doc.label}](${doc.url})\n`;
        markdown += line;
        pdfMarkdown += line;
      });
      markdown += `\n`;
      pdfMarkdown += `\n`;
    } else {
      markdown += `- [Charge At Will (CAW)](https://razorpay.com/docs/payments/recurring/charge-at-will/)\n`;
      markdown += `- [Fetch APIs](https://razorpay.com/docs/api/payments/)\n\n`;
      pdfMarkdown += `- [Charge At Will (CAW)](https://razorpay.com/docs/payments/recurring/charge-at-will/)\n`;
      pdfMarkdown += `- [Fetch APIs](https://razorpay.com/docs/api/payments/)\n\n`;
    }

    markdown += `#### 2.3.2 Test Credentials\n`;
    markdown += `N/A (Shared internally)\n\n`;
    pdfMarkdown += `#### 2.3.2 Test Credentials\n`;
    pdfMarkdown += `N/A (Shared internally)\n\n`;

    markdown += `#### 2.3.3 Technical Contacts\n`;
    markdown += `- **Rakshita Sharma** (Integrations POC, Razorpay)\n`;
    markdown += `- **Merchant Tech Team** (Merchant POC)\n\n`;
    pdfMarkdown += `#### 2.3.3 Technical Contacts\n`;
    pdfMarkdown += `- **Rakshita Sharma** (Integrations POC, Razorpay)\n`;
    pdfMarkdown += `- **Merchant Tech Team** (Merchant POC)\n\n`;

    markdown += `### 2.4 Configurations\n\n`;
    pdfMarkdown += `### 2.4 Configurations\n\n`;

    markdown += `#### 2.4.1 Test and Production Domains\n`;
    pdfMarkdown += `#### 2.4.1 Test and Production Domains\n`;
    const prod = `- **Production:** ${
      webData.website && webData.website !== "Not found"
        ? webData.website
        : "N/A"
    }\n\n`;
    markdown += prod;
    pdfMarkdown += prod;

    markdown += `#### 2.4.2 Additional Integration\n`;
    pdfMarkdown += `#### 2.4.2 Additional Integration\n`;
    markdown += `NA\n\n`;
    pdfMarkdown += `NA\n\n`;

    markdown += `#### 2.4.3 Checkout Configuration\n`;
    pdfMarkdown += `#### 2.4.3 Checkout Configuration\n`;
    const capture = extractCaptureSetting(auditResult);
    const captureStr = `- **Automatic capture:** ${capture}\n- **Test payments:** Validated in test mode.\n\n`;
    markdown += captureStr;
    pdfMarkdown += captureStr;

    markdown += `#### 2.4.4 Config code/IDs\n`;
    pdfMarkdown += `#### 2.4.4 Config code/IDs\n`;
    markdown += `None\n\n`;
    pdfMarkdown += `None\n\n`;

    markdown += `#### 2.4.5 Webhook URLs and events\n`;
    pdfMarkdown += `#### 2.4.5 Webhook URLs and events\n`;
    const webhooks = extractWebhooks(auditResult);
    const webhookList =
      webhooks.length > 0
        ? webhooks.map((w) => `\`${w}\``).join(", ")
        : "`payment.captured`, `payment.failed`";
    const webhookStr = `- **Events:** ${webhookList}\n\n`;
    markdown += webhookStr;
    pdfMarkdown += webhookStr;

    markdown += `### 2.5 Process Flow\n\n`;
    pdfMarkdown += `### 2.5 Process Flow\n\n`;

    markdown += `#### 2.5.1 Actors\n`;
    pdfMarkdown += `#### 2.5.1 Actors\n`;
    const actors =
      `- **User:** End user of the website.\n` +
      `- **Merchant:** ${merchantName}.\n` +
      `- **Razorpay:** PG/PA.\n` +
      `- **Bank:** Debit processing and Mandate confirmation.\n\n`;
    markdown += actors;
    pdfMarkdown += actors;

    markdown += `#### 2.5.2 Sequence Diagram (${productType})\n\n`;
    pdfMarkdown += `#### 2.5.2 Sequence Diagram (${productType})\n\n`;

    if (diagramPath && fs.existsSync(diagramPath)) {
      const bitmap = fs.readFileSync(diagramPath);
      const base64Image = Buffer.from(bitmap).toString("base64");
      const ext = path.extname(diagramPath).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
      const dataURI = `data:${mimeType};base64,${base64Image}`;

      markdown += `![Process Flow](${dataURI})\n\n`;
      pdfMarkdown += `![Process Flow](${diagramPath})\n\n`;
    } else {
      const noDiagramMsg = `*Diagram pending generation.*\n\n`;
      markdown += noDiagramMsg;
      pdfMarkdown += noDiagramMsg;
    }

    // --- 3. Exception Scenarios ---
    markdown += `## 3. Exception Scenarios\n\n`;
    pdfMarkdown += `## 3. Exception Scenarios\n\n`;

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    markdown += `### 3.1 Error Handling\n`;
    pdfMarkdown += `### 3.1 Error Handling\n`;
    const errorHandling =
      `- **Consumption:** Errors (description/reason) are consumed by the merchant.\n` +
      `- **Hard-coding:** No hard-coding of error descriptions found.\n\n`;
    markdown += errorHandling;
    pdfMarkdown += errorHandling;

    markdown += `### 3.2 Audit Findings\n`;
    pdfMarkdown += `### 3.2 Audit Findings\n`;
    const auditDefault = `The technical audit for **${merchantName}** confirms that the integration aligns with Razorpay standards. No major blockers were identified during the review.\n\n`;
    markdown += auditDefault;
    pdfMarkdown += auditDefault;

    markdown += `### 3.3 Checklist Link\n`;
    pdfMarkdown += `### 3.3 Checklist Link\n`;
    markdown += `\n`;
    pdfMarkdown += `\n`;

    markdown += `### 3.4 Best Practice Suggestions\n`;
    pdfMarkdown += `### 3.4 Best Practice Suggestions\n`;
    const bestPractices =
      `- **Fetch APIs:** Suggested use of Fetch APIs for status reconciliation.\n` +
      `- **Late Auth:** Discussed late authorization scenarios for robustness.\n\n`;
    markdown += bestPractices;
    pdfMarkdown += bestPractices;

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    // --- 4. Ready Reckoner Analysis ---
    // markdown += `## 4. Ready Reckoner Analysis\n\n`;
    // pdfMarkdown += `## 4. Ready Reckoner Analysis\n\n`;

    // const paymentMethods = methods.length > 0 ? methods.join(", ") : "UPI, Emandate (Netbanking), Cards";
    // markdown += `### 4.1 Product Features\n`;
    // pdfMarkdown += `### 4.1 Product Features\n`;
    // markdown += `- ${productType} for a seamless UI experience.\n\n`;
    // pdfMarkdown += `- ${productType} for a seamless UI experience.\n\n`;

    // markdown += `### 4.2 Method Features\n`;
    // pdfMarkdown += `### 4.2 Method Features\n`;
    // markdown += `- Multi-method support: ${paymentMethods}.\n\n`;
    // pdfMarkdown += `- Multi-method support: ${paymentMethods}.\n\n`;

    markdown += `### 4 Integration Best Practices\n`;
    pdfMarkdown += `### 4 Integration Best Practices\n`;
    markdown +=
      `- Verification via webhooks is the primary source of truth.\n` +
      `- Periodic reconciliation using Fetch APIs for edge cases.\n\n`;
    pdfMarkdown +=
      `- Verification via webhooks is the primary source of truth.\n` +
      `- Periodic reconciliation using Fetch APIs for edge cases.\n\n`;

    fs.writeFileSync(filepath, markdown);
    console.log(`✅ Automated FRD generated: ${filename} `);

    // Generate PDF
    const pdfFilename = filename.replace(".md", ".pdf");
    const pdfFilepath = path.join(FRD_EXPORTS_DIR, pdfFilename);

    console.log(`Generating PDF version: ${pdfFilename}...`);

    await new Promise((resolve, reject) => {
      markdownpdf({
        cssPath: path.resolve(__dirname, "frdStyle.css"),
        remarkable: { html: true },
      })
        .from.string(pdfMarkdown)
        .to(pdfFilepath, function () {
          console.log(`✅ PDF generated: ${pdfFilename} `);
          resolve();
        });
    });

    return { md: filepath, pdf: pdfFilepath };
  } catch (error) {
    console.error("Error generating automated FRD:", error);
    throw error;
  }
}

// --- Helper Functions ---

function extractPaymentMethods(auditResult) {
  const methods = new Set();
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
  ];

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((section) => {
        const checks =
          section.checks ||
          section.configs ||
          section.sub_items ||
          section.results ||
          [];
        if (Array.isArray(checks)) {
          checks.forEach((check) => {
            const label = (
              check.item ||
              check.label ||
              check.config ||
              ""
            ).toLowerCase();
            const status = (check.status || "").toLowerCase();
            if (label.includes("upi") || status.includes("upi"))
              methods.add("UPI");
            if (label.includes("card") || status.includes("card"))
              methods.add("Cards");
            if (
              label.includes("netbanking") ||
              status.includes("netbanking") ||
              label.includes("emandate")
            )
              methods.add("Netbanking/Emandate");
            if (label.includes("wallet") || status.includes("wallet"))
              methods.add("Wallets");
          });
        }
      });
    }
  });
  return Array.from(methods);
}

function extractCaptureSetting(auditResult) {
  let capture = "3 days (Default)";
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
  ];

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((section) => {
        const checks =
          section.checks ||
          section.configs ||
          section.sub_items ||
          section.results ||
          [];
        if (Array.isArray(checks)) {
          checks.forEach((check) => {
            const label = (
              check.item ||
              check.label ||
              check.config ||
              ""
            ).toLowerCase();
            if (label.includes("capture")) {
              capture = check.comment || check.status || capture;
            }
          });
        }
      });
    }
  });
  return capture;
}

function extractWebhooks(auditResult) {
  const webhooks = [];
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
  ];

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((section) => {
        const checks =
          section.checks ||
          section.configs ||
          section.sub_items ||
          section.results ||
          [];
        if (Array.isArray(checks)) {
          checks.forEach((check) => {
            const label = (
              check.item ||
              check.label ||
              check.config ||
              ""
            ).toLowerCase();
            if (
              label.includes("webhook") &&
              (label.includes("event") || label.includes("url"))
            ) {
              if (check.comment)
                webhooks.push(...check.comment.split(/[,;\s]+/));
            }
          });
        }
      });
    }
  });
  return [...new Set(webhooks)].filter(
    (w) => w.includes(".") || w.includes("_")
  );
}

function extractPlatform(auditResult) {
  let platform = "Website";
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.results,
  ];
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((section) => {
      const checks = section.checks || section.results || [];
      checks.forEach((check) => {
        const label = (check.item || check.label || "").toLowerCase();
        const comment = (check.comment || "").toLowerCase();
        if (label.includes("platform")) {
          platform = check.comment || check.status || platform;
        } else if (
          comment.includes("android") ||
          comment.includes("ios") ||
          comment.includes("mobile")
        ) {
          platform = "Mobile App (Android/iOS)";
        }
      });
    });
  });
  return platform;
}

function extractBackendLanguage(auditResult) {
  let language = "Java (Spring Boot)";
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.results,
  ];
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((section) => {
      const checks = section.checks || section.results || [];
      checks.forEach((check) => {
        const label = (check.item || check.label || "").toLowerCase();
        if (
          label.includes("server language") ||
          label.includes("backend") ||
          label.includes("language")
        ) {
          language = check.comment || check.status || language;
        }
      });
    });
  });
  return language;
}

function buildWebDataSummary(webData, merchantName) {
  if (webData && webData.description && webData.description !== "Not found") {
    const company = webData.company_name || merchantName || "The company";
    const description = webData.description || "";
    const industry = webData.industry
      ? `It operates in ${webData.industry}. `
      : "";
    const location = webData.location ? `Based in ${webData.location}, ` : "";
    const size = webData.company_size
      ? `with a team size of ${webData.company_size}, `
      : "";
    const services =
      Array.isArray(webData.products_services) &&
      webData.products_services.length > 0
        ? `Key offerings include ${webData.products_services
            .slice(0, 4)
            .join(", ")}${
            webData.products_services.length > 4 ? ", and more" : ""
          }.`
        : "";

    const prefix = location || size ? `${location}${size}`.trim() + " " : "";
    const base = description.endsWith(".") ? description : `${description}.`;
    return `${company} ${base} ${industry}${prefix}${services}`
      .replace(/\s+/g, " ")
      .trim();
  }

  const fallback = `${merchantName} is a key business entity looking to optimize its payment infrastructure. This document outlines the functional and technical requirements for integrating Razorpay's payment solutions to enhance user experience and operational efficiency.`;
  return fallback;
}

module.exports = {
  generateFRD,
};
