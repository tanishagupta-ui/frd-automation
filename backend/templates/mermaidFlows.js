// Mermaid sequence diagram templates for different payment products
// All products use the same 4 actors: User, Merchant (dynamic name), Razorpay, Bank
// Templates are functions that accept merchantName parameter

const MERMAID_FLOWS = {
    subscriptions: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Select method and initiate payment
    Merchant->>Razorpay: Redirected to RZP page
    Razorpay->>Bank: Debit Processed
    Bank-->>Razorpay: Information callback
    Razorpay-->>Merchant: Callback with payment info
    Merchant-->>User: Notification of Payment Status`,

    standard_checkout: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Browse products and add to cart
    Merchant->>Razorpay: Create order with amount
    Razorpay-->>Merchant: Return order ID
    Merchant->>User: Show Razorpay checkout
    User->>Razorpay: Enter payment details
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>Merchant: Webhook notification
    Razorpay-->>User: Payment success page
    Merchant->>User: Order confirmation`,

    custom_checkout: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Browse products
    Merchant->>Razorpay: Create order
    Razorpay-->>Merchant: Return order ID
    User->>Merchant: Enter payment details on merchant page
    Merchant->>Razorpay: Submit payment with custom UI
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment status
    Razorpay-->>Merchant: Payment callback
    Merchant->>User: Show success page`,

    payment_links: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    Merchant->>Razorpay: Create payment link
    Razorpay-->>Merchant: Return payment link URL
    Merchant->>User: Send link via email/SMS
    User->>Razorpay: Click link and open payment page
    User->>Razorpay: Enter payment details
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>Merchant: Webhook notification
    Razorpay-->>User: Payment success page`,

    qr_codes: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    Merchant->>Razorpay: Generate QR code
    Razorpay-->>Merchant: Return QR code
    Merchant->>User: Display QR code
    User->>Razorpay: Scan QR with payment app
    User->>Bank: Authorize payment
    Bank->>Razorpay: Payment processed
    Razorpay-->>Merchant: Webhook notification
    Merchant->>User: Show payment confirmation`,

    route: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Make purchase
    Merchant->>Razorpay: Create order with transfers
    Razorpay-->>Merchant: Return order ID
    User->>Razorpay: Complete payment
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay->>Razorpay: Split payment to linked accounts
    Razorpay-->>Merchant: Transfer confirmation
    Merchant->>User: Order confirmation`,

    smart_collect: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    Merchant->>Razorpay: Create virtual account
    Razorpay-->>Merchant: Return account details
    Merchant->>User: Share account details
    User->>Bank: Transfer funds to virtual account
    Bank->>Razorpay: Credit notification
    Razorpay->>Razorpay: Match payment to virtual account
    Razorpay-->>Merchant: Webhook with payment details
    Merchant->>User: Payment confirmation`,

    caw: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Initiate first payment
    Merchant->>Razorpay: Redirect to RZP Page
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>Merchant: Payment success 
    Merchant->>User: Confirmation
    Bank-->>Merchant: Token is generated and confirmed by the bank
    Merchant->>Razorpay : Use the token to do subsequent debits`,

    s2s: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Enter payment details
    Merchant->>Razorpay: Create payment (server-to-server)
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Requires authentication
    Razorpay-->>Merchant: Return authentication URL
    Merchant->>User: Redirect to authentication
    User->>Bank: Complete 3DS/OTP
    Bank-->>Razorpay: Authentication success
    Razorpay->>Bank: Complete payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>Merchant: Payment callback
    Merchant->>User: Show success`,

    affordability: (merchantName = 'Merchant') => `sequenceDiagram
    participant User
    participant Merchant as "${merchantName}"
    participant Razorpay
    participant Bank
    
    User->>Merchant: Browse products
    Merchant->>Razorpay: Request affordability widget
    Razorpay-->>Merchant: Return widget code
    Merchant->>User: Display EMI/Pay Later options
    User->>Razorpay: Select affordability option
    Razorpay->>Bank: Check eligibility
    Bank-->>Razorpay: Eligibility response
    Razorpay-->>User: Show available offers
    User->>Razorpay: Confirm payment
    Razorpay->>Bank: Process payment
    Bank-->>Razorpay: Payment confirmation
    Razorpay-->>Merchant: Webhook notification
    Merchant->>User: Order confirmation`
};

module.exports = MERMAID_FLOWS;
