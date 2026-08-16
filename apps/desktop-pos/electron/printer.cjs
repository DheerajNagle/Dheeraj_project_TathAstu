const path = require('path');
const fs = require('fs');
const net = require('net');
const { app } = require('electron');

let logDir;
try {
  logDir = app.getPath('userData');
} catch (e) {
  logDir = __dirname;
}

// Helper to write mock prints to local text files
function writeToMockLog(filename, content) {
  const filePath = path.join(logDir, filename);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[Printer Simulator] Receipt saved to ${filePath}`);
    return content;
  } catch (e) {
    console.error('Failed to write mock print log:', e);
    return content;
  }
}

// Generate the UPI URI payload
function generateUPIUri(orderNumber, totalAmount) {
  const payeeVPA = 'tathastopos@okaxis';
  const payeeName = 'TathAstu Restaurant';
  const encodedName = encodeURIComponent(payeeName);
  return `upi://pay?pa=${payeeVPA}&pn=${encodedName}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${orderNumber}&tr=${orderNumber}`;
}

// --- Printing Handlers ---

async function printKOT(order, printerConfig = { type: 'MOCK' }) {
  const nowStr = new Date(order.createdAt).toLocaleString();
  
  // 1. Compile text version for Simulator/Logs
  let txt = '';
  txt += `========================================\n`;
  txt += `           KITCHEN ORDER TICKET         \n`;
  txt += `========================================\n`;
  txt += `KOT Ref:    ${order.id.slice(-6).toUpperCase()}\n`;
  txt += `Order No:   ${order.order_number}\n`;
  txt += `Table:      ${order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}\n`;
  txt += `Time:       ${nowStr}\n`;
  txt += `----------------------------------------\n`;
  txt += `Qty  Item Name & Customizations\n`;
  txt += `----------------------------------------\n`;
  
  for (const item of order.items) {
    txt += `${item.quantity.toString().padEnd(4)} ${item.name}\n`;
    if (item.notes) {
      txt += `     * Note: ${item.notes}\n`;
    }
  }
  txt += `----------------------------------------\n`;
  txt += `[Paper Cut Command]\n`;
  txt += `========================================\n`;

  const output = writeToMockLog('tathastu_print_kot.log', txt);

  // 2. Network/TCP printing
  if (printerConfig.type === 'TCP' && printerConfig.address) {
    try {
      const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${printerConfig.address}`,
      });
      
      printer.alignCenter();
      printer.bold(true);
      printer.setTextDoubleHeight();
      printer.setTextDoubleWidth();
      printer.println("KITCHEN TICKET");
      printer.setTextNormal();
      printer.bold(false);
      
      printer.alignLeft();
      printer.println(`KOT Ref:  ${order.id.slice(-6).toUpperCase()}`);
      printer.println(`Order No: ${order.order_number}`);
      printer.println(`Table:    ${order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}`);
      printer.println(`Time:     ${nowStr}`);
      printer.drawLine();
      
      for (const item of order.items) {
        printer.bold(true);
        printer.println(`${item.quantity} x ${item.name}`);
        printer.bold(false);
        if (item.notes) {
          printer.println(`  Note: ${item.notes}`);
        }
      }
      printer.drawLine();
      printer.cut();
      
      await printer.execute();
      console.log('KOT printed successfully to TCP.');
    } catch (e) {
      console.error('Failed to send KOT to TCP printer:', e);
    }
  }

  return { success: true, preview: output };
}

async function printBill(order, printerConfig = { type: 'MOCK' }) {
  const nowStr = new Date(order.createdAt).toLocaleString();
  const upiUri = generateUPIUri(order.order_number, order.total);
  
  // Calculate splits for receipt layout
  const subtotal = order.subTotal;
  const discount = order.discount || 0;
  const discountedSubtotal = subtotal - discount;
  const cgst = discountedSubtotal * 0.025;
  const sgst = discountedSubtotal * 0.025;
  
  // 1. Compile text version for Simulator/Logs
  let txt = '';
  txt += `========================================\n`;
  txt += `           TATHASTU RESTAURANT          \n`;
  txt += `         GSTIN: 27AAAAA1111A1Z1         \n`;
  txt += `      Address: Baner Rd, Pune, MH       \n`;
  txt += `            Tel: +91 9876543210         \n`;
  txt += `========================================\n`;
  txt += `Bill No:    ${order.order_number}\n`;
  txt += `Table:      ${order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}\n`;
  txt += `Date:       ${nowStr}\n`;
  txt += `----------------------------------------\n`;
  txt += `Qty  Item Name               Amt (INR)\n`;
  txt += `----------------------------------------\n`;
  
  for (const item of order.items) {
    const itemTotal = (item.price * item.quantity).toFixed(2);
    txt += `${item.quantity.toString().padEnd(4)} ${(item.name.slice(0, 22)).padEnd(22)} ${itemTotal.padStart(12)}\n`;
    if (item.notes) {
      txt += `     * Note: ${item.notes}\n`;
    }
  }
  
  txt += `----------------------------------------\n`;
  txt += `Subtotal:                  ${subtotal.toFixed(2).padStart(12)}\n`;
  if (discount > 0) {
    txt += `Discount:                 -${discount.toFixed(2).padStart(12)}\n`;
  }
  txt += `CGST (2.5%):               ${cgst.toFixed(2).padStart(12)}\n`;
  txt += `SGST (2.5%):               ${sgst.toFixed(2).padStart(12)}\n`;
  txt += `----------------------------------------\n`;
  txt += `Net Payable:               ₹${order.total.toFixed(2).padStart(11)}\n`;
  txt += `----------------------------------------\n`;
  txt += `Scan to Pay via UPI:\n`;
  txt += `[UPI QR CODE LINK: ${upiUri}]\n`;
  txt += `----------------------------------------\n`;
  txt += `         Thank you! Visit again.        \n`;
  txt += `========================================\n`;

  const output = writeToMockLog('tathastu_print_receipt.log', txt);

  // 2. Network/TCP printing
  if (printerConfig.type === 'TCP' && printerConfig.address) {
    try {
      const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${printerConfig.address}`,
      });
      
      printer.alignCenter();
      printer.bold(true);
      printer.println("TATHASTU RESTAURANT");
      printer.bold(false);
      printer.println("GSTIN: 27AAAAA1111A1Z1");
      printer.println("Baner Rd, Pune, MH");
      printer.println("Tel: +91 9876543210");
      printer.drawLine();
      
      printer.alignLeft();
      printer.println(`Bill No: ${order.order_number}`);
      printer.println(`Table:   ${order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}`);
      printer.println(`Date:    ${nowStr}`);
      printer.drawLine();
      
      for (const item of order.items) {
        printer.leftRight(`${item.quantity} x ${item.name.slice(0, 20)}`, `INR ${(item.price * item.quantity).toFixed(2)}`);
        if (item.notes) {
          printer.println(`  Note: ${item.notes}`);
        }
      }
      
      printer.drawLine();
      printer.leftRight("Subtotal", `INR ${subtotal.toFixed(2)}`);
      if (discount > 0) {
        printer.leftRight("Discount", `-INR ${discount.toFixed(2)}`);
      }
      printer.leftRight("CGST (2.5%)", `INR ${cgst.toFixed(2)}`);
      printer.leftRight("SGST (2.5%)", `INR ${sgst.toFixed(2)}`);
      printer.drawLine();
      
      printer.bold(true);
      printer.leftRight("NET PAYABLE", `INR ${order.total.toFixed(2)}`);
      printer.bold(false);
      printer.drawLine();
      
      // Print Native UPI QR Code
      printer.alignCenter();
      printer.println("Scan to Pay via UPI");
      printer.printQR(upiUri);
      printer.println("");
      printer.println("Thank you! Visit again.");
      
      printer.cut();
      await printer.execute();
      console.log('Bill printed successfully to TCP.');
    } catch (e) {
      console.error('Failed to send bill to TCP printer:', e);
    }
  }

  return { success: true, preview: output };
}

module.exports = {
  printKOT,
  printBill
};
