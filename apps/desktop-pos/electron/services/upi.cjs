/**
 * Constructs an NPCI-compliant UPI payment intent URI.
 * @param {string} vpa Merchant VPA address (e.g. restaurant@upi)
 * @param {string} merchantName Name of the merchant store
 * @param {number} grandTotal Amount to charge
 * @param {string} orderId Unique reference ID for transaction reconciliation
 * @returns {string} Fully encoded UPI payment intent string
 */
function generateUPIIntent(vpa, merchantName, grandTotal, orderId) {
  const cleanVpa = (vpa || 'tathastopos@okaxis').trim();
  const cleanName = (merchantName || 'TathAstu Restaurant').trim();
  const amtStr = grandTotal.toFixed(2);
  
  return `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=${encodeURIComponent(cleanName)}&am=${amtStr}&cu=INR&tr=${encodeURIComponent(orderId)}&tn=${encodeURIComponent('Order_' + orderId)}`;
}

module.exports = {
  generateUPIIntent
};
