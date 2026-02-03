// Mermaid sequence diagram templates for different payment products
// All products use the same 4 actors: User, Merchant (dynamic name), Razorpay, Bank
// Templates are functions that accept merchantName parameter

const MERMAID_FLOWS = {
    subscriptions: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Select method and initiate payment
    ${merchantName}->>Razorpay: Redirected to RZP page
    Razorpay->>Bank: Debit Processed
    Bank-->>Razorpay: Information callback
    Razorpay-->>${merchantName}: Callback with payment info
    ${merchantName}-->>User: Notification of Payment Status`,

    standard_checkout: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Browse products and add to cart
    ${merchantName}->>Razorpay: Create order with amount
    Razorpay-->>${merchantName}: Return order ID
    ${merchantName}->>User: Show Razorpay checkout
    User->>Razorpay: Enter payment details
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>${merchantName}: Webhook notification
    Razorpay-->>User: Payment success page
    ${merchantName}->>User: Order confirmation`,

    custom_checkout: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Browse products
    ${merchantName}->>Razorpay: Create order
    Razorpay-->>${merchantName}: Return order ID
    User->>${merchantName}: Enter payment details on merchant page
    ${merchantName}->>Razorpay: Submit payment with custom UI
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment status
    Razorpay-->>${merchantName}: Payment callback
    ${merchantName}->>User: Show success page`,

    payment_links: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    ${merchantName}->>Razorpay: Create payment link
    Razorpay-->>${merchantName}: Return payment link URL
    ${merchantName}->>User: Send link via email/SMS
    User->>Razorpay: Click link and open payment page
    User->>Razorpay: Enter payment details
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>${merchantName}: Webhook notification
    Razorpay-->>User: Payment success page`,

    qr_codes: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    ${merchantName}->>Razorpay: Generate QR code
    Razorpay-->>${merchantName}: Return QR code
    ${merchantName}->>User: Display QR code
    User->>Razorpay: Scan QR with payment app
    User->>Bank: Authorize payment
    Bank->>Razorpay: Payment processed
    Razorpay-->>${merchantName}: Webhook notification
    ${merchantName}->>User: Show payment confirmation`,

    route: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Make purchase
    ${merchantName}->>Razorpay: Create order with transfers
    Razorpay-->>${merchantName}: Return order ID
    User->>Razorpay: Complete payment
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay->>Razorpay: Split payment to linked accounts
    Razorpay-->>${merchantName}: Transfer confirmation
    ${merchantName}->>User: Order confirmation`,

    smart_collect: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    ${merchantName}->>Razorpay: Create virtual account
    Razorpay-->>${merchantName}: Return account details
    ${merchantName}->>User: Share account details
    User->>Bank: Transfer funds to virtual account
    Bank->>Razorpay: Credit notification
    Razorpay->>Razorpay: Match payment to virtual account
    Razorpay-->>${merchantName}: Webhook with payment details
    ${merchantName}->>User: Payment confirmation`,

    caw: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Initiate first payment
    ${merchantName}->>Razorpay: Redirect to RZP Page
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>${merchantName}: Payment success 
    ${merchantName}->>User: Confirmation
    Bank-->>${merchantName}: Token is generated and confirmed by the bank
    ${merchantName}->>Razorpay : Use the token to do subsequent debits`,

    s2s: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Enter payment details
    ${merchantName}->>Razorpay: Create payment (server-to-server)
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Requires authentication
    Razorpay-->>${merchantName}: Return authentication URL
    ${merchantName}->>User: Redirect to authentication
    User->>Bank: Complete 3DS/OTP
    Bank-->>Razorpay: Authentication success
    Razorpay->>Bank: Complete payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>${merchantName}: Payment callback
    ${merchantName}->>User: Show success`,

    affordability: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant ${merchantName}
    participant Razorpay
    participant Bank
    
    User->>${merchantName}: Browse products
    ${merchantName}->>Razorpay: Request affordability widget
    Razorpay-->>${merchantName}: Return widget code
    ${merchantName}->>User: Display EMI/Pay Later options
    User->>Razorpay: Select affordability option
    Razorpay->>Bank: Check eligibility
    Bank-->>Razorpay: Eligibility response
    Razorpay-->>User: Show available offers
    User->>Razorpay: Confirm payment
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>${merchantName}: Webhook notification
    ${merchantName}->>User: Order confirmation`
};

module.exports = MERMAID_FLOWS;
