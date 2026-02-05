# Functional Requirements Document
## MANIPALCIGNA HEALTH INSURANCE

**Owner Name:** Rakshita Sharma  
**Date:** March 10, 2025

---

## 1. Requirements Description

### 1.1 Background and Objectives
ManipalCigna Health Insurance Company Limited (formerly known as CignaTTK Health Insurance Company Limited) is a joint venture between the Manipal Group, a leader in healthcare delivery and higher education in India, and Cigna Corporation, a global health services company. ManipalCigna offers a full suite of insurance solutions ranging from health, personal accident, major illness, travel, and global care to individual and group customers.

### 1.2 Business Requirement
**Merchant Name:** MCHI (ManipalCigna Health Insurance)  
**Objective:** Integrate with **Razorpay CAW Standard Checkout** to facilitate seamless premium payments and recurring mandates.

---

## 2. Detailed Requirements

### 2.1 Technical Specifications
- **MID:** HTGLZZxgl0o7gM
- **Integration type:** CAW Standard Checkout Integration
- **Platform:** Website
- **Backend Language:** Java (Spring Boot)
- **Product used:** CAW Standard Web Integration
- **Payment methods:** UPI, Emandate (Netbanking), Cards

### 2.2 Special Programs
There are no customized requirements at this stage.

### 2.3 Dependencies

#### 2.3.1 API Documentation
- [Charge At Will (CAW)](https://razorpay.com/docs/payments/recurring/charge-at-will/)
- [Fetch APIs](https://razorpay.com/docs/api/payments/)

#### 2.3.2 Test Credentials
N/A (Shared internally)

#### 2.3.3 Technical Contacts
- **Rakshita Sharma** (Integrations POC, Razorpay)
- **Gauthami Bhaskar** (Sales)
- **Amit Dod** (Merchant POC)

### 2.4 Configurations

#### 2.4.1 Test and Production Domains
- **Production:** [https://www.manipalcigna.com](https://www.manipalcigna.com)

#### 2.4.2 Additional Integration
NA

#### 2.4.3 Checkout Configuration
- **Automatic capture:** 3 days
- **Test payments:** Successfully validated in test mode.

#### 2.4.4 Config code/IDs
None

#### 2.4.5 Webhook URLs and Events
- **Events:** `payment.captured`, `payment.failed`, `token.confirmed`, `token.rejected`

### 2.5 Process Flow

#### 2.5.1 Actors
- **User:** End user of the website.
- **Merchant:** ManipalCigna Health Insurance.
- **Razorpay:** PG/PA.
- **Bank:** Debit processing and Mandate confirmation.

#### 2.5.2 Sequence Diagram (CAW Standard Checkout)

![MCHI Payment Flow](file:///Users/rakshita.sharma/Downloads/frd-automation-main/backend/diagrams/mchi_payment_flow.png)

---

## 3. Exception Scenarios

### 3.1 Error Handling
- **Consumption:** Errors (description/reason) are consumed by the merchant.
- **Hard-coding:** No hard-coding of error descriptions found.

### 3.2 Audit Findings
- The user selects a policy on the ManipalCigna platform.
- Upon payment completion, Razorpay receives acknowledgment from the bank.
- Payment status is determined using webhooks (`payment.captured`, `payment.failed`).
- A "Rainy Day Kit" for error handling has been shared with the merchant.
- Auto-capture is set for 3 days from the Razorpay dashboard.
- Successful Test IDs: `pay_PzqntDC2ttfaRQ` (UPI), `pay_Q3nmu2eSU2cLrH` (NB), `pay_Q3WU4xtt0oGZbA` (Card).

### 3.3 Checklist Link
[Golive Checklist - MCHI](https://razorpay.com) (Internal Link)

### 3.4 Best Practice Suggestions
- **Fetch APIs:** Suggested use of Fetch APIs for status reconciliation.
- **Late Auth:** Discussed late authorization scenarios for robustness.

---

## 4. Ready Reckoner Analysis

### 4.1 Product Features
- Standard Checkout for a seamless UI experience.
- Charge At Will for flexible recurring payments.

### 4.2 Method Features
- Multi-method support: UPI, Netbanking (Emandate), Cards.

### 4.3 Integration Best Practices
- Verification via Webhooks is the primary source of truth.
- Periodic reconciliation using Fetch APIs for edge cases.
