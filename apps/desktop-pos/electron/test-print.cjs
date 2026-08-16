const { printBill, printKOT } = require('./printer.cjs');

const mockOrder = {
  id: 'OUT01-POS01-1718000000000-4829',
  order_number: 'ORD-20260816-999',
  tableNumber: '4',
  customerName: 'Dheeraj Nagle',
  customerPhone: '+91 9999999999',
  status: 'PENDING',
  source: 'DINE_IN',
  subTotal: 560.00,
  tax: 14.00,
  discount: 50.00,
  total: 524.00,
  paymentStatus: 'PAID',
  paymentMethod: 'UPI',
  createdAt: new Date().toISOString(),
  items: [
    {
      id: 'item-1',
      menuItemId: 'i3',
      name: 'Paneer Butter Masala (Medium) + [Extra Cheese]',
      price: 320.00,
      quantity: 1,
      notes: 'Spice: Medium. Extras: Extra Cheese'
    },
    {
      id: 'item-2',
      menuItemId: 'i5',
      name: 'Dal Makhani (Spicy)',
      price: 220.00,
      quantity: 1,
      notes: 'Spice: Spicy. Extras: None'
    }
  ]
};

async function runTest() {
  console.log('--- Starting Thermal Printer Layout Integration Test ---');
  
  const billRes = await printBill(mockOrder, { type: 'MOCK' });
  console.log('Bill Receipt generated successfully.');
  console.log('\n--- Customer Bill Print Output Preview ---');
  console.log(billRes.preview);
  
  const kotRes = await printKOT(mockOrder, { type: 'MOCK' });
  console.log('KOT Ticket generated successfully.');
  console.log('\n--- Kitchen KOT Print Output Preview ---');
  console.log(kotRes.preview);

  console.log('--- Test Completed Successfully ---');
}

runTest().catch(console.error);
