const diagramService = require('./services/diagramService');

async function test() {
    console.log('Testing Dynamic Merchant Name in Diagrams...\n');

    try {
        // Test with Uber as merchant
        console.log('Test 1: Generating diagram for Subscriptions with merchant "Uber"');
        const diagram1 = await diagramService.generateDiagram('subscriptions', 'Uber');
        console.log(`✅ Diagram saved: ${diagram1}\n`);

        // Test with Sugarfit as merchant
        console.log('Test 2: Generating diagram for Standard Checkout with merchant "Sugarfit"');
        const diagram2 = await diagramService.generateDiagram('standard_checkout', 'Sugarfit');
        console.log(`✅ Diagram saved: ${diagram2}\n`);

        // Test with no merchant name (should default to 'Merchant')
        console.log('Test 3: Generating diagram with default merchant name');
        const diagram3 = await diagramService.generateDiagram('qr_codes');
        console.log(`✅ Diagram saved: ${diagram3}`);

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

test();
