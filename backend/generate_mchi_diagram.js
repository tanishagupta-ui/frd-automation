const diagramService = require('./services/diagramService');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        const merchantName = 'ManipalCigna';
        const productKey = 'standard_checkout'; // Based on "Standard Checkout Integration"

        // Use the code from the FRD instead to ensure consistency
        const customMermaidCode = `sequenceDiagram
    participant User
    participant ManipalCigna
    participant Razorpay
    participant Bank
    
    User->>ManipalCigna: Select policy and initiate payment
    ManipalCigna->>Razorpay: Create order with tokenization request
    Razorpay-->>ManipalCigna: Return order ID
    ManipalCigna->>User: Show Razorpay Standard Checkout
    User->>Razorpay: Enter payment details (UPI/Card/NB)
    Razorpay->>Bank: Process first payment & Register Mandate
    Bank-->>Razorpay: Payment & Mandate confirmation
    Razorpay-->>ManipalCigna: Webhook (payment.captured & token.confirmed)
    Razorpay-->>User: Payment success page
    ManipalCigna->>User: Policy issuance confirmation
    Note over ManipalCigna, Razorpay: Subsequent debits using stored tokens
    ManipalCigna->>Razorpay: Initiate Charge At Will (Subsequent Debit)
    Razorpay->>Bank: Process recurring debit
    Bank-->>Razorpay: Success
    Razorpay-->>ManipalCigna: Webhook (payment.captured)`;

        const imageBuffer = await diagramService.convertMermaidToImage(customMermaidCode);
        const filename = 'mchi_payment_flow.png';
        const filepath = path.join(__dirname, 'diagrams', filename);

        fs.writeFileSync(filepath, imageBuffer);
        console.log(`✅ Diagram saved to: ${filepath}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

run();
