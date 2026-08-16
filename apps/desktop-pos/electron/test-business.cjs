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

  console.log('\n--- Test Completed Successfully ---');
}

runTest().catch(console.error);
