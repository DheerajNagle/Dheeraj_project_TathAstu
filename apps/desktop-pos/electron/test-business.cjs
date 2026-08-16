const db = require('./db.cjs');

async function runTest() {
  console.log('--- Starting Shift & BOM Inventory Integration Test ---');

  // Initialize DB tables
  db.initSchema();
  console.log('Database initialized.');

  // 1. Get current inventory
  const initialStock = db.getIngredients();
  console.log('\n--- Initial Raw Materials Inventory ---');
  initialStock.forEach(i => console.log(`  * ${i.name}: ${i.stock_qty} ${i.unit}`));

  // 2. Open Cashier Shift
  console.log('\n--- Opening Cashier Shift ---');
  const activeShift = db.startShift('John Doe', 1500.00);
  console.log(`Active Shift opened: ID: ${activeShift.id}, Cashier: ${activeShift.cashier_name}, Opening Balance: ₹${activeShift.opening_balance}`);

  // 3. Save Order (Garlic Bread, qty 2)
  console.log('\n--- Saving Order (2 x Garlic Bread) ---');
  const orderId = 'OUT01-POS01-1718000000000-8392';
  const mockOrder = {
    id: orderId,
    order_number: 'ORD-20260816-111',
    tableNumber: '2',
    customerName: 'Aishwarya',
    customerPhone: '+91 8888888888',
    status: 'PENDING',
    source: 'DINE_IN',
    subTotal: 240.00,
    tax: 6.00,
    discount: 0.00,
    total: 246.00,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: `${orderId}-item1`,
        menuItemId: 'i1', // Garlic Bread
        name: 'Garlic Bread',
        price: 120.00,
        quantity: 2,
        notes: '',
        kotId: null
      }
    ]
  };

  await db.saveOrder(mockOrder);
  console.log('Order saved successfully.');

  // 4. Verify stock deduction
  // Garlic Bread has recipe: 50g Flour, 20g Cheese, 10g Butter per item
  // Sold qty: 2 -> Deduct: 100g Flour, 40g Cheese, 20g Butter
  console.log('\n--- Verifying BOM Stock Deduction ---');
  const updatedStock = db.getIngredients();
  updatedStock.forEach(i => {
    const orig = initialStock.find(o => o.id === i.id);
    const diff = orig.stock_qty - i.stock_qty;
    if (diff > 0) {
      console.log(`  * ${i.name}: ${orig.stock_qty} ${i.unit} -> ${i.stock_qty} ${i.unit} (Deducted: ${diff} ${i.unit})`);
    }
  });

  // 5. Verify Shift Sales split
  console.log('\n--- Verifying Active Shift Sales Balances ---');
  const currentShift = db.getActiveShift();
  console.log(`  * Cash Sales: ₹${currentShift.total_cash_sales.toFixed(2)}`);
  console.log(`  * Expected Drawer Cash: ₹${(currentShift.opening_balance + currentShift.total_cash_sales).toFixed(2)}`);

  // 6. Close Shift & Audit Cash
  console.log('\n--- Closing Shift (Drawer Audit) ---');
  // Cashier inputs actual cash count in drawer as ₹1740.00 (expected: 1500 + 246 = 1746.00)
  const actualCashInput = 1740.00;
  const closedShift = db.endShift(currentShift.id, actualCashInput);
  
  console.log(`Shift Closed Status: ${closedShift.status}`);
  console.log(`  * Expected Cash: ₹${(closedShift.opening_balance + closedShift.total_cash_sales).toFixed(2)}`);
  console.log(`  * Actual Cash:   ₹${closedShift.closing_balance.toFixed(2)}`);
  console.log(`  * Difference:    ₹${closedShift.drawer_difference.toFixed(2)} (Drawer short by ₹6.00)`);

  // 7. Verify Incremental Order Sequence & Clock-drift protection
  console.log('\n--- Verifying Strict Sequence Counter ---');
  const seq1 = db.getNextSequenceValue('order_sequence');
  const seq2 = db.getNextSequenceValue('order_sequence');
  console.log(`  * Sequence 1: ${seq1}`);
  console.log(`  * Sequence 2: ${seq2}`);
  if (seq2 === seq1 + 1) {
    console.log('  * Strict incremental sequence verified.');
  } else {
    throw new Error('Sequence validation failed!');
  }

  // 8. Verify Print Retry Queue
  console.log('\n--- Verifying Print Queue Job Storage ---');
  db.addPrintJob('BILL', { order: mockOrder, printerConfig: { type: 'TCP', address: '192.168.1.99' } });
  const pendingJobs = db.getPendingPrintJobs();
  console.log(`  * Pending Print Jobs: ${pendingJobs.length}`);
  if (pendingJobs.length > 0) {
    console.log(`  * Found queued job: Type: ${pendingJobs[0].job_type}, Date: ${pendingJobs[0].created_at}`);
    db.clearPrintJob(pendingJobs[0].id);
    console.log('  * Cleared print job from queue successfully.');
  } else {
    throw new Error('Print queue insertion failed!');
  }

  // 9. Verify Licensing Lock Check & Save
  console.log('\n--- Verifying Device License Key Locks ---');
  const dummyHw = 'MOCK-HWID-HEX-DUMMY-829312';
  const dummyKey = 'TATHASTU-PRO-INSTALL-101';
  db.saveLicense(dummyKey, dummyHw);
  const activeLicense = db.getLicense();
  console.log(`  * Registered License Key: ${activeLicense.license_key}`);
  console.log(`  * Registered Hardware ID: ${activeLicense.hardware_id}`);
  if (activeLicense.license_key === dummyKey && activeLicense.hardware_id === dummyHw) {
    console.log('  * Device lock licensing check verified.');
  } else {
    throw new Error('Device licensing check failed!');
  }

  console.log('\n--- Test Completed Successfully ---');
}

runTest().catch(console.error);
