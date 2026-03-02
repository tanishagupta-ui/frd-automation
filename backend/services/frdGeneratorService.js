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
  diagramPath,
  checklistFilename = null,
  originalFilename = null
) {
  try {
    const merchantName =
      auditResult.merchant_info?.name ||
      auditResult.audit_metadata?.merchant_name ||
      auditResult.audit_metadata?.mx_name ||
      enrichmentData?.merchant_name ||
      "Merchant";

    auditResult = hydrateChecklistFromDataFolder(
      auditResult,
      productType,
      merchantName
    );

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

      const imgTag = `<img src="${dataURI}" alt="Razorpay Curlec" class="h-8 object-contain" style="height: auto; max-height: 100px; display: block; margin: 20px auto;" />\n\n`;
      markdown += imgTag;
      pdfMarkdown += imgTag;
    }

    const titleText = `# Functional Requirements Document\n## ${merchantName.toUpperCase()}`;
    markdown += titleText + "\n\n";
    pdfMarkdown += titleText + "\n\n";

    const toc =
      `### Table of Contents\n\n` +
      `1. [Requirement Specification:](#1-requirement-specification)\n` +
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
      `   3.4 [Auto Capture Configuration](#34-auto-capture-configuration)\n` +
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

    markdown += `## 1. Requirement Specification:\n\n`;
    pdfMarkdown += `## 1. Requirement Specification:\n\n`;

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
    const methodStr = `- **Payment methods:** ${methods.length > 0
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
    const prod = `- **Production:** ${webData.website && webData.website !== "Not found"
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
    const checkoutType = extractCheckoutType(auditResult);
    const checkoutTypeStr = checkoutType
      ? `- **Checkout type:** ${checkoutType}\n`
      : "";
    const captureStr =
      `- **Automatic capture:** ${capture}\n` +
      checkoutTypeStr +
      `- **Test payments:** Validated in test mode.\n\n`;
    markdown += captureStr;
    pdfMarkdown += captureStr;

    markdown += `#### 2.4.4 Config code/IDs\n`;
    pdfMarkdown += `#### 2.4.4 Config code/IDs\n`;
    markdown += `None\n\n`;
    pdfMarkdown += `None\n\n`;

    markdown += `#### 2.4.5 Webhook URLs and events\n`;
    pdfMarkdown += `#### 2.4.5 Webhook URLs and events\n`;
    const webhooks = extractWebhooks(auditResult);
    const productLabel = (
      auditResult.product ||
      productType ||
      ""
    ).toLowerCase();
    const isSubscription = productLabel.includes("subscription");
    const webhookList =
      webhooks.length > 0
        ? webhooks.map((w) => `\`${w}\``).join(", ")
        : isSubscription
          ? "Not provided in checklist"
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

      const imgTag = `<img src="${dataURI}" alt="Process Flow" style="display: block; margin: 20px auto; max-width: 100%;" />\n\n`;
      markdown += imgTag;
      pdfMarkdown += imgTag;
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
    const auditFindingsSummary = buildAuditFindingsSummary(
      auditResult,
      merchantName,
      productType
    );
    markdown += auditFindingsSummary;
    pdfMarkdown += auditFindingsSummary;

    markdown += `### 3.3 Checklist Link\n`;
    pdfMarkdown += `### 3.3 Checklist Link\n`;
    if (checklistFilename) {
      const checklistUrl = `http://localhost:5001/uploads/${checklistFilename}`;
      const linkText = originalFilename || checklistFilename;
      markdown += `[${linkText}](${checklistUrl})\n\n`;
      pdfMarkdown += `[${linkText}](${checklistUrl})\n\n`;
    } else {
      markdown += `N/A\n\n`;
      pdfMarkdown += `N/A\n\n`;
    }

    markdown += `---\n\n`;
    pdfMarkdown += `---\n\n`;

    markdown += `### 3.4 Auto Capture Configuration\n`;
    pdfMarkdown += `### 3.4 Auto Capture Configuration\n`;

    const autoCaptureInfo = extractAutoCaptureSettings(auditResult);
    if (autoCaptureInfo) {
      markdown += autoCaptureInfo + `\n\n`;
      pdfMarkdown += autoCaptureInfo + `\n\n`;
    } else {
      markdown += `Standard auto-capture timing applies: 2 days for UPI and 3 days for other payment methods.\n\n`;
      pdfMarkdown += `Standard auto-capture timing applies: 2 days for UPI and 3 days for other payment methods.\n\n`;
    }

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

    // Add best practices (based on checkout type) and any additional notes
    const bestPractices = extractBestPractices(auditResult);
    const combinedNotes = extractCombinedAdditionalInfo(
      auditResult,
      productType
    );

    if (bestPractices) {
      const header = `Based on the detected checkout type, the following integration best practices apply:\n\n`;
      markdown += header + bestPractices + `\n\n`;
      pdfMarkdown += header + bestPractices + `\n\n`;
    }

    if (combinedNotes) {
      markdown += `${combinedNotes}\n\n`;
      pdfMarkdown += `${combinedNotes}\n\n`;
    }

    if (!bestPractices && !combinedNotes) {
      const defaultPractices =
        `- Verification via webhooks is the primary source of truth.\n` +
        `- Periodic reconciliation using Fetch APIs for edge cases.\n\n`;
      markdown += defaultPractices;
      pdfMarkdown += defaultPractices;
    }

    fs.writeFileSync(filepath, markdown);
    console.log(`✅ Automated FRD generated: ${filename} `);

    // Generate PDF
    const pdfFilename = filename.replace(".md", ".pdf");
    const pdfFilepath = path.join(FRD_EXPORTS_DIR, pdfFilename);
    const tmpPdfFilepath = pdfFilepath + ".tmp";

    console.log(`Generating PDF version: ${pdfFilename}...`);

    await new Promise((resolve, reject) => {
      markdownpdf({
        cssPath: path.resolve(__dirname, "frdStyle.css"),
        remarkable: { html: true },
      })
        .from.string(pdfMarkdown)
        .to(tmpPdfFilepath, function () {
          try {
            fs.renameSync(tmpPdfFilepath, pdfFilepath);
            console.log(`✅ PDF generated and finalized: ${pdfFilename} `);
            resolve();
          } catch (renameError) {
            console.error("Error finalizing PDF file:", renameError);
            reject(renameError);
          }
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
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    const status = (check.status || "").toLowerCase();
    if (label.includes("upi") || status.includes("upi")) methods.add("UPI");
    if (label.includes("card") || status.includes("card")) methods.add("Cards");
    if (
      label.includes("netbanking") ||
      status.includes("netbanking") ||
      label.includes("emandate")
    )
      methods.add("Netbanking/Emandate");
    if (label.includes("wallet") || status.includes("wallet"))
      methods.add("Wallets");
  });
  return Array.from(methods);
}

function extractCaptureSetting(auditResult) {
  let capture = "3 days (Default)";
  const checks = collectChecklistChecks(auditResult);
  for (const check of checks) {
    const section = (check._section || "").toLowerCase();
    if (section.includes("autoacapture")) {
      const value =
        getMeaningfulValue(check.comment) ||
        getMeaningfulValue(check.status) ||
        getMeaningfulValue(check.item);
      if (value) return value;
    }
  }

  for (const check of checks) {
    const label = getCheckLabel(check);
    if (label.includes("auto capture") || label.includes("autoacapture")) {
      const value =
        getMeaningfulValue(check.comment) ||
        getMeaningfulValue(check.status) ||
        getMeaningfulValue(check.item);
      if (value) return value;
    }
  }

  return capture;
}

function extractWebhooks(auditResult) {
  const webhooks = [];
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    if (!label.includes("webhook")) return;
    const combined = [check.comment, check.hint].filter(Boolean).join(" ");
    const eventList = parseWebhookEvents(combined);
    if (eventList.length > 0) {
      webhooks.push(...eventList);
    } else if (combined) {
      webhooks.push(...combined.split(/[,;\s]+/));
    }
  });

  // Also check structured or string additional_comments if available (e.g. Affordability)
  const addComments = auditResult.additional_comments || auditResult.additionalComments;
  if (addComments) {
    if (typeof addComments === 'object' && addComments.webhook_url_events) {
      const eventList = parseWebhookEvents(addComments.webhook_url_events);
      if (eventList.length > 0) {
        webhooks.push(...eventList);
      } else {
        webhooks.push(...addComments.webhook_url_events.split(/[,;\s]+/));
      }
    } else if (typeof addComments === 'string') {
      const eventList = parseWebhookEvents(addComments);
      if (eventList.length > 0) webhooks.push(...eventList);
      else {
        // Look for typical URL patterns in the string
        const urlMatch = addComments.match(/https?:\/\/[^\s,;]+/gi);
        if (urlMatch) webhooks.push(...urlMatch);
      }
    }
  }

  if (webhooks.length === 0) {
    const raw = auditResult.raw_additional_comments || auditResult.rawAdditionalComments;
    if (raw && typeof raw === 'string') {
      const eventList = parseWebhookEvents(raw);
      if (eventList.length > 0) webhooks.push(...eventList);
      else {
        // Look for typical URL patterns
        const urlMatch = raw.match(/https?:\/\/[^\s,;]+/gi);
        if (urlMatch) webhooks.push(...urlMatch);
      }
    }
  }

  return [...new Set(webhooks)].filter(
    (w) => w.includes(".") || w.includes("_")
  );
}

function extractPlatform(auditResult) {
  let platform = "Website";
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    const comment = (check.comment || "").toLowerCase();
    if (label.includes("platform")) {
      const value =
        getMeaningfulValue(check.comment) || getMeaningfulValue(check.status);
      if (value) platform = value;
    } else if (
      comment.includes("android") ||
      comment.includes("ios") ||
      comment.includes("mobile")
    ) {
      platform = "Mobile App (Android/iOS)";
    }
  });

  // Specifically for Affordability checklist items
  if (platform === "Website") {
    const affPlatforms = ["shopify", "woocommerce", "magento", "native", "android", "ios"];
    for (const check of checks) {
      const label = getCheckLabel(check).toLowerCase();
      const status = (check.status || "").toLowerCase();
      const comment = (check.comment || "").toLowerCase();
      // Look for a pass/implemented signal on a platform-specific label
      if (status === "pass" || status === "done" || status === "implemented" || comment.includes("yes") || comment.includes("pass")) {
        const found = affPlatforms.find(p => label.includes(p));
        if (found) {
          platform = found.charAt(0).toUpperCase() + found.slice(1);
          break;
        }
      }
    }
  }

  return platform;
}

function extractBackendLanguage(auditResult) {
  let language = "Java (Spring Boot)";
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    if (
      label.includes("server language") ||
      label.includes("backend") ||
      label.includes("language")
    ) {
      const value =
        extractLabeledValue(check.comment, ["language", "sdk"]) ||
        getMeaningfulValue(check.comment) ||
        getMeaningfulValue(check.status);
      if (value) language = value;
    }
  });
  return language;
}

function extractCheckoutType(auditResult) {
  let checkoutType = "";
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    if (label.includes("checkout type")) {
      const value =
        extractLabeledValue(check.comment, ["type"]) ||
        getMeaningfulValue(check.comment) ||
        getMeaningfulValue(check.status);
      if (value) checkoutType = value;
    }
  });
  return checkoutType;
}

function collectChecklistChecks(auditResult) {
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
    auditResult.tech_checklist,
  ];
  const checks = [];
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((section) => {
      const items =
        section.checks ||
        section.configs ||
        section.sub_items ||
        section.results ||
        [];
      if (Array.isArray(items) && items.length > 0) {
        items.forEach((check) => {
          checks.push({
            ...check,
            _section:
              section.category ||
              section.categoryName ||
              section.title ||
              section.section ||
              section.name,
          });
        });
        return;
      }

      const isCheckLike =
        section &&
        (section.item ||
          section.label ||
          section.config ||
          section.status ||
          section.comment);
      if (isCheckLike) {
        checks.push({
          ...section,
          _section:
            section.category ||
            section.categoryName ||
            section.title ||
            section.section ||
            section.name,
        });
      }
    });
  });
  return checks;
}

function getCheckLabel(check) {
  return (check.item || check.label || check.config || "").toLowerCase();
}

function getMeaningfulValue(value) {
  if (!value) return "";
  const cleaned = String(value).trim();
  if (!cleaned) return "";
  const lowered = cleaned.toLowerCase();
  if (["done", "n/a", "na", "yes", "no"].includes(lowered)) return "";
  if (lowered.startsWith("version:")) return "";
  return cleaned;
}

function extractLabeledValue(raw, labels) {
  if (!raw) return "";
  const text = String(raw);
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*:\\s*([^,;]+)`, "i"));
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return "";
}

function buildAuditFindingsSummary(auditResult, merchantName, productType) {
  const checks = collectChecklistChecks(auditResult);
  if (checks.length === 0) {
    return `The technical audit for **${merchantName}** confirms that the integration aligns with Razorpay standards. No major blockers were identified during the review.\n\n`;
  }

  const bullets = buildChecklistFindingsBullets(
    checks,
    auditResult,
    merchantName
  );
  if (bullets.length === 0) {
    return `The technical audit for **${merchantName}** confirms that the integration aligns with Razorpay standards. No major blockers were identified during the review.\n\n`;
  }

  return bullets.map((line) => `- ${line}`).join("\n") + "\n\n";
}

function normalizeChecklistStatus(status, comment) {
  const raw = `${status || ""}`.trim().toLowerCase();
  const commentText = `${comment || ""}`.trim().toLowerCase();
  const value = raw || commentText;
  if (!value) return "other";
  if (
    value.includes("n/a") ||
    value === "na" ||
    value.includes("not applicable")
  )
    return "na";
  if (
    value.includes("done") ||
    value.includes("pass") ||
    value.includes("ok") ||
    value.includes("success") ||
    value.includes("complete") ||
    value.includes("verified") ||
    value.includes("implemented") ||
    value.includes("available")
  )
    return "done";
  if (
    value.includes("pending") ||
    value.includes("wip") ||
    value.includes("in progress") ||
    value.includes("todo") ||
    value.includes("tbd")
  )
    return "pending";
  if (
    value.includes("fail") ||
    value.includes("error") ||
    value.includes("issue") ||
    value.includes("block") ||
    value.includes("missing")
  )
    return "failed";
  return "other";
}

function cleanChecklistText(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^[\u2022\-\*]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentence(text) {
  const cleaned = cleanChecklistText(text);
  if (!cleaned) return "";
  const withUpper =
    cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return withUpper.endsWith(".") ? withUpper : `${withUpper}.`;
}

function buildChecklistFindingsBullets(checks, auditResult, merchantName) {
  const bullets = [];
  const seen = new Set();
  const skipLabels = [
    "account live",
    "successful payment ids",
    "signature verification",
    "callback url",
    "refund api",
    "fetch api",
    "payment capture settings",
    "backend language",
  ];
  const allowLabels = [
    "auto_capture settings",
    "auto capture settings",
    "implementing fetch status api",
    "shopify",
    "woocommerce",
    "magento",
    "native",
    "ios",
    "android",
    "keys",
    "white label",
    "razorpay watermark",
    "production",
    "live",
  ];

  const pushUnique = (text) => {
    const sentence = toSentence(text);
    if (!sentence) return;
    const key = sentence.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    bullets.push(sentence);
  };

  const narrativeLines = buildNarrativeFindings(
    checks,
    auditResult,
    merchantName
  );
  narrativeLines.forEach((line) => pushUnique(line));

  const openItems = [];

  checks.forEach((check) => {
    const rawStatus =
      check.status || check.result || check.state || check.value || "";
    const normalized = normalizeChecklistStatus(rawStatus, check.comment);
    const labelRaw =
      check.item || check.label || check.config || check.check || "";
    const label = cleanChecklistText(labelRaw);
    const comment = getMeaningfulValue(check.comment);
    const statusNote = getMeaningfulValue(rawStatus);

    if (label && label.toLowerCase().includes("additional comments")) return;
    if (label && label.toLowerCase().includes("best practices")) return;
    if (label && skipLabels.some((skip) => label.toLowerCase().includes(skip)))
      return;

    if (normalized === "done") {
      // If there's a meaningful comment, we always want to show it
      if (comment) {
        if (label && !comment.toLowerCase().includes(label.toLowerCase())) {
          pushUnique(`${label}: ${comment}`);
        } else {
          pushUnique(comment || label);
        }
        return;
      }

      // Otherwise only show if it's in the allow list
      if (
        label &&
        !allowLabels.some((allow) => label.toLowerCase().includes(allow))
      ) {
        return;
      }
      if (label) {
        pushUnique(label);
      }
      return;
    }

    if (normalized === "pending" || normalized === "failed") {
      const note = label || comment || statusNote;
      if (note) openItems.push(note);
    }
  });

  if (openItems.length > 0) {
    const summarized = openItems.slice(0, 3).map((item) => cleanChecklistText(item)).filter(Boolean);
    if (summarized.length > 0) {
      pushUnique(`Open checklist items to address: ${summarized.join(", ")}`);
    }
  }

  return bullets;
}

function buildNarrativeFindings(checks, auditResult, merchantName) {
  const lines = [];

  const policySignal = findChecklistSignal(checks, [
    "policy",
    "plan",
    "product",
  ]);
  if (policySignal) {
    const normalized = policySignal.toLowerCase();
    const generic =
      normalized === "policy" ||
      normalized === "plan" ||
      normalized === "product";
    lines.push(
      `The user enters the ${merchantName} platform and selects the ${generic ? "policy" : policySignal
      }.`
    );
  }

  const paymentSignal = findChecklistSignal(checks, [
    "payment method",
    "payment flow",
    "checkout",
  ]);
  const bankAck = findChecklistSignal(checks, ["bank", "acknowledg", "ack"]);
  if (paymentSignal || bankAck) {
    const suffix = bankAck
      ? `, and Razorpay receives an acknowledgement from the bank`
      : "";
    lines.push(
      `Upon proceeding to the selected payment method and completing the payment${suffix}.`
    );
  }

  const webhookEvents = extractWebhooks(auditResult);
  if (webhookEvents.length > 0) {
    lines.push(
      `Payment status is determined using the webhooks (${webhookEvents
        .slice(0, 6)
        .map((w) => `\`${w}\``)
        .join(", ")}).`
    );
  } else if (findChecklistSignal(checks, ["webhook"])) {
    lines.push(`Payment status is determined using the webhooks.`);
  }

  const errorHandlingNote = findChecklistSignal(checks, [
    "error handling",
    "exception",
    "failure",
    "rainy",
    "runbook",
    "playbook",
    "kit",
  ]);
  if (errorHandlingNote) {
    const normalized = errorHandlingNote.toLowerCase();
    const generic =
      normalized === "error handling" ||
      normalized === "exception" ||
      normalized === "failure" ||
      normalized === "kit";
    lines.push(
      generic
        ? `Error-handling guidance has been shared with the merchant.`
        : `A ${errorHandlingNote} for error handling has been shared with the merchant.`
    );
  }

  const autoCaptureSignal = findChecklistSignal(checks, [
    "auto capture",
    "auto-capture",
    "capture timing",
    "capture window",
  ]);
  if (autoCaptureSignal) {
    const captureSetting = extractCaptureSetting(auditResult);
    if (captureSetting) {
      lines.push(
        `The merchant has set the auto-capture for ${captureSetting} from the Razorpay dashboard.`
      );
    }
  }

  // Add generic observations from additional comments if not already covered
  const additionalRaw = auditResult.raw_additional_comments || auditResult.rawAdditionalComments;
  if (additionalRaw && typeof additionalRaw === 'string' && additionalRaw.length > 15) {
    const clean = additionalRaw
      .replace(/webhook url events[:\s]*/i, "")
      .replace(/https?:\/\/[^\s,;]+/gi, "")
      .trim();
    if (clean.length > 10) {
      lines.push(`Additional observations: ${toSentence(clean)}`);
    }
  }

  return lines.filter(Boolean);
}

function findChecklistSignal(checks, keywords) {
  if (!Array.isArray(checks) || checks.length === 0) return "";
  const patterns = keywords.map((k) => k.toLowerCase());
  for (const check of checks) {
    const label = `${check.item || check.label || check.config || ""
      }`.toLowerCase();
    const comment = `${check.comment || check.hint || ""}`.toLowerCase();
    const status = `${check.status || ""}`.toLowerCase();
    const combined = `${label} ${comment} ${status}`;
    const hit = patterns.find((k) => combined.includes(k));
    if (hit) {
      const raw =
        getMeaningfulValue(check.comment) ||
        getMeaningfulValue(check.status) ||
        getMeaningfulValue(check.item) ||
        getMeaningfulValue(check.label) ||
        hit;
      return raw;
    }
  }
  return "";
}

function parseWebhookEvents(raw) {
  if (!raw) return [];
  const text = String(raw);
  const match = text.match(/events?\s*:\s*([^\n]+)/i);
  const source = match ? match[1] : text;
  const normalized = source.replace(/events?\s*:/gi, "").trim();
  return normalized
    .split(/[,;]+/)
    .map((part) => part.replace(/events?\s*:/gi, "").trim())
    .filter(Boolean);
}

function hydrateChecklistFromDataFolder(
  auditResult,
  productType,
  merchantName
) {
  const productLabel = (auditResult.product || productType || "").toLowerCase();
  if (!productLabel.includes("subscription")) return auditResult;

  const needsChecklist =
    !Array.isArray(auditResult.checklist_content) ||
    auditResult.checklist_content.length === 0 ||
    extractWebhooks(auditResult).length === 0;

  if (!needsChecklist) {
    return auditResult;
  }

  const slug = slugifyName(
    merchantName ||
    auditResult.audit_metadata?.mx_name ||
    auditResult.audit_metadata?.merchant_name ||
    ""
  );
  if (!slug) return auditResult;

  const auditsDir = path.join(__dirname, "../data/subscription_audits");
  if (!fs.existsSync(auditsDir)) return auditResult;

  const files = fs
    .readdirSync(auditsDir)
    .filter(
      (filename) =>
        filename.startsWith("subscription_audit_") &&
        filename.endsWith(`_${slug}.json`)
    );
  if (files.length === 0) return auditResult;

  const latest = files
    .sort((a, b) => extractAuditIndex(a) - extractAuditIndex(b))
    .pop();
  const auditPath = path.join(auditsDir, latest);
  try {
    const parsed = JSON.parse(fs.readFileSync(auditPath, "utf8"));
    if (Array.isArray(parsed.checklist_content)) {
      return { ...auditResult, checklist_content: parsed.checklist_content };
    }
  } catch (error) {
    console.warn(`Checklist hydrate failed for ${auditPath}:`, error.message);
  }

  return auditResult;
}

function extractAuditIndex(filename) {
  const match = filename.match(/subscription_audit_(\d+)_/);
  return match ? Number(match[1]) : 0;
}

function slugifyName(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
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
          .join(", ")}${webData.products_services.length > 4 ? ", and more" : ""
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

function extractAutoCaptureSettings(auditResult) {
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
    auditResult.tech_checklist,
  ];

  let autoCaptureComment = "";

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((section) => {
        const categoryName = (
          section.category ||
          section.categoryName ||
          ""
        ).toLowerCase();

        if (categoryName.includes("auto") || categoryName.includes("capture")) {
          const checks = section.checks || section.items || [];
          checks.forEach((check) => {
            if (check.comment && check.comment.trim() !== "") {
              autoCaptureComment = check.comment.trim();
            } else if (
              check.status &&
              check.status !== "N/A" &&
              check.status !== "Done"
            ) {
              autoCaptureComment = check.status;
            }
          });
        }
      });
    }
  });

  if (autoCaptureComment) {
    return `The integration implements auto-capture functionality with the following configuration: **${autoCaptureComment}**. This ensures optimal payment processing timing while maintaining compliance with payment gateway requirements.`;
  }

  return null;
}

function extractCombinedAdditionalInfo(auditResult, productType) {
  const sources = [
    auditResult.audit_data,
    auditResult.checklist,
    auditResult.checklist_content,
    auditResult.auditChecklist,
    auditResult.results,
    auditResult.tech_checklist,
  ];

  const productLabel = (auditResult.product || productType || "").toLowerCase();
  const isQrCode = productLabel.includes("qr");

  const uniqueComments = new Set();
  const labeledComments = new Map();

  const addComments = auditResult.additional_comments || auditResult.additionalComments;
  if (addComments) {
    if (typeof addComments === 'string' && addComments.trim()) {
      uniqueComments.add(addComments.trim());
    } else if (typeof addComments === 'object') {
      // For objects (Affordability), grab general_notes specifically or all values except webhook/platform info if needed
      if (addComments.general_notes) uniqueComments.add(addComments.general_notes.trim());
      // Include all keys from structured comments for completeness
      Object.keys(addComments).forEach(k => {
        if (k !== 'general_notes' && addComments[k]) {
          uniqueComments.add(`${k}: ${addComments[k]}`);
        }
      });
    }
  }

  // Pick up raw strings if present
  if (auditResult.raw_additional_comments) uniqueComments.add(auditResult.raw_additional_comments.trim());
  if (auditResult.rawAdditionalComments && typeof auditResult.rawAdditionalComments === 'string') {
    uniqueComments.add(auditResult.rawAdditionalComments.trim());
  }

  // Handle snake_case additional_comments from Payment Links logic
  if (Array.isArray(auditResult.additional_comments)) {
    auditResult.additional_comments.forEach(c => {
      if (c.label && c.value && String(c.value).trim()) {
        labeledComments.set(c.label, String(c.value).trim());
      }
    });
  }

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((section) => {
        const categoryName = (
          section.category ||
          section.categoryName ||
          ""
        ).toLowerCase();

        // Match sections like "Additional Comments", "Notes", etc.
        if (
          categoryName.includes("additional") ||
          categoryName.includes("comment") ||
          categoryName.includes("note")
        ) {
          const checks = section.checks || section.items || [];
          checks.forEach((check) => {
            const label = check.item || check.label || check.config || "";
            const commentValue = check.comment ? check.comment.trim() : "";
            const statusValue = check.status ? check.status.trim() : "";
            if (isQrCode && label) {
              const value = commentValue || (statusValue ? statusValue : "N/A");
              labeledComments.set(label, value);
              return;
            }

            if (commentValue && commentValue !== "N/A") {
              uniqueComments.add(commentValue);
            } else if (
              statusValue &&
              !["n/a", "done", "yes", "no"].includes(statusValue.toLowerCase())
            ) {
              uniqueComments.add(statusValue);
            }
          });
        }
      });
    }
  });

  // Also check individual check labels for "additional comments" across all sections
  const checks = collectChecklistChecks(auditResult);
  checks.forEach((check) => {
    const label = getCheckLabel(check);
    if (
      label.includes("additional comments") ||
      label.includes("integration notes")
    ) {
      const val =
        getMeaningfulValue(check.comment) || getMeaningfulValue(check.status);
      if (val) uniqueComments.add(val);
    }
  });

  if (labeledComments.size > 0) {
    const header = isQrCode
      ? `Best-practice checklist observations for QR Codes:\n\n`
      : `The following integration details and best practices were identified during the audit:\n\n`;

    const notes = Array.from(labeledComments.entries())
      .map(([label, value]) => `- ${label}: ${value}`)
      .join("\n");

    let combined = header + notes;
    if (uniqueComments.size > 0) {
      combined += "\n\n" + Array.from(uniqueComments).map(c => `- ${c}`).join("\n\n");
    }
    return combined;
  }

  if (uniqueComments.size > 0) {
    const notes = Array.from(uniqueComments)
      .map((comment) => `- ${comment}`)
      .join("\n\n");
    return `${notes}`;
  }

  return null;
}

function extractBestPractices(auditResult) {
  if (Array.isArray(auditResult.checklist_content)) {
    for (const item of auditResult.checklist_content) {
      const label = (
        item.config ||
        item.config_item ||
        item.item ||
        ""
      ).toLowerCase();
      if (label.includes("best practices")) {
        const val =
          getMeaningfulValue(item.comment) ||
          getMeaningfulValue(item.status) ||
          getMeaningfulValue(item.item);
        if (val) return formatBestPractices(val);
      }
    }
  }

  const checks = collectChecklistChecks(auditResult);
  for (const check of checks) {
    const label = getCheckLabel(check);
    if (label.includes("best practices")) {
      const val =
        getMeaningfulValue(check.comment) || getMeaningfulValue(check.status);
      if (!val) return null;
      return formatBestPractices(val);
    }
  }
  return null;
}

function formatBestPractices(val) {
  const normalize = (input) =>
    String(input || "")
      .trim()
      .replace(/^\d+\.\s*/, "");
  const parts = val
    .split(";")
    .map((s) => normalize(s))
    .filter(Boolean);
  if (parts.length > 1) {
    return parts.map((p) => `- ${p}${p.endsWith(".") ? "" : "."}`).join("\n");
  }
  const normalized = normalize(val);
  return `- ${normalized}${normalized.endsWith(".") ? "" : "."}`;
}
module.exports = {
  generateFRD,
};
