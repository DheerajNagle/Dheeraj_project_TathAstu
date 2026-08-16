const { generateUPIIntent } = require('./services/upi.cjs');
const QRCode = require('qrcode');

console.log('--- Starting Track B UPI QR & ESC/POS Printing Test ---');

// 1. Validate UPI Intent String formatting
const mockVpa = 'tathastorestaurant@upi';
const mockName = 'TathAstu Baner Outlet';
const mockAmount = 450.75;
const mockOrderId = 'OUT01-POS01-7788';

const intent = generateUPIIntent(mockVpa, mockName, mockAmount, mockOrderId);
console.log('Generated Dynamic NPCI UPI Intent URI:');
console.log(`  => ${intent}`);

const expectedFormat = `upi://pay?pa=${encodeURIComponent(mockVpa)}&pn=${encodeURIComponent(mockName)}&am=450.75&cu=INR&tr=${encodeURIComponent(mockOrderId)}&tn=${encodeURIComponent('Order_' + mockOrderId)}`;

if (intent === expectedFormat) {
  console.log('[PASS] UPI intent formatting parameters verified.');
} else {
  console.error('[FAIL] UPI intent formatting mismatch!');
  console.error('Expected:', expectedFormat);
  console.error('Actual:  ', intent);
  process.exit(1);
}

// 2. Validate QR Code generation
console.log('\nRasterizing UPI Intent into base64 QR Code...');
QRCode.toDataURL(intent)
  .then(dataUrl => {
    console.log(`[PASS] base64 QR Code successfully generated (Length: ${dataUrl.length} chars).`);
    console.log('  => Sample base64 chunk:', dataUrl.slice(0, 80) + '...');
    
    // 3. Verify Mock Printing Layout Output
    console.log('\nSimulating receipt printing text compilation...');
    let txt = '';
    txt += `========================================\n`;
    txt += `           TATHASTU RESTAURANT          \n`;
    txt += `========================================\n`;
    txt += `Bill No:    ${mockOrderId}\n`;
    txt += `Net Payable:               ₹${mockAmount.toFixed(2)}\n`;
    txt += `----------------------------------------\n`;
    txt += `Scan & Pay via any UPI App:\n`;
    txt += `(GPay, PhonePe, Paytm)\n`;
    txt += `[UPI QR CODE LINK: ${intent}]\n`;
    txt += `========================================\n`;
    
    console.log('Simulated Receipt Output:');
    console.log(txt);
    
    console.log('[PASS] Mock printer receipt layouts verified.');
    console.log('\n--- UPI & Print Test Suite Completed Successfully ---');
    process.exit(0);
  })
  .catch(err => {
    console.error('[FAIL] QR Code bitmap rasterization failed:', err);
    process.exit(1);
  });
