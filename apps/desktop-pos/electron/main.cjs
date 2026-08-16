const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const db = require('./db.cjs');
const printer = require('./printer.cjs');

function getHardwareId() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        return crypto.createHash('sha256').update(net.mac).digest('hex');
      }
    }
  }
  return 'MOCK-HARDWARE-UUID-829312';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Check if we are running in dev mode
  const isDev = !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (!isDev) {
    autoUpdater.logger = console;
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
      console.log('[Auto-Updater] Update available. Downloading in background...');
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('[Auto-Updater] Update downloaded. Will install on restart.');
    });
  }
}

app.whenReady().then(() => {
  // Initialize database schema and seed mock data
  db.initSchema();

  // Setup IPC Handlers
  ipcMain.handle('db:get-tables', () => db.getTables());
  ipcMain.handle('db:get-categories', () => db.getCategories());
  ipcMain.handle('db:get-items', () => db.getItems());
  ipcMain.handle('db:get-orders', () => db.getOrders());
  ipcMain.handle('db:save-order', (event, order) => db.saveOrder(order));
  ipcMain.handle('db:get-sync-queue', () => db.getSyncQueue());
  ipcMain.handle('db:clear-sync-item', (event, id) => db.clearSyncItem(id));

  // Print Handlers
  ipcMain.handle('print:kot', (event, order, config) => printer.printKOT(order, config));
  ipcMain.handle('print:bill', (event, order, config) => printer.printBill(order, config));

  // Sync Trigger Handler
  ipcMain.handle('sync:trigger', async () => {
    await runUpstreamSync();
    await runDownstreamSync();
    return db.getSyncQueue();
  });

  // Shifts & Ingredients Handlers
  ipcMain.handle('db:get-ingredients', () => db.getIngredients());
  ipcMain.handle('db:get-active-shift', () => db.getActiveShift());
  ipcMain.handle('db:get-next-identifiers', async () => {
    const seq = db.getNextSequenceValue('order_sequence');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return {
      orderId: `OUT01-POS01-${seq}`,
      orderNumber: `ORD-${today}-${seq.toString().padStart(4, '0')}`
    };
  });
  
  // Licensing IPC Handlers
  ipcMain.handle('license:check', () => {
    const activeLicense = db.getLicense();
    const hwId = getHardwareId();
    if (!activeLicense) {
      return { success: false, hardwareId: hwId, msg: 'No active license found.' };
    }
    if (activeLicense.hardware_id !== hwId) {
      return { success: false, hardwareId: hwId, msg: 'Hardware fingerprint mismatch.' };
    }
    return { success: true, hardwareId: hwId, licenseKey: activeLicense.license_key };
  });

  ipcMain.handle('license:activate', async (event, licenseKey) => {
    const hwId = getHardwareId();
    try {
      const response = await fetch(`${BACKEND_URL}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey, hardwareId: hwId }),
        signal: AbortSignal.timeout(6000)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        db.saveLicense(licenseKey, hwId);
        return { success: true, msg: 'License activated successfully!' };
      }
      return { success: false, msg: data.msg || 'Activation declined by central server.' };
    } catch (err) {
      console.warn('[Licensing] Connection to central server failed:', err.message);
      const hasPatternMatch = licenseKey.startsWith('TATHASTU-') && licenseKey.split('-').length === 4;
      if (hasPatternMatch) {
        db.saveLicense(licenseKey, hwId);
        return { success: true, msg: 'License activated offline successfully.' };
      }
      return { success: false, msg: 'License server unreachable and key pattern invalid.' };
    }
  });

  ipcMain.handle('db:start-shift', (event, cashierName, openingBalance) => db.startShift(cashierName, openingBalance));
  ipcMain.handle('db:end-shift', async (event, shiftId, actualDrawerCash) => {
    const updatedShift = db.endShift(shiftId, actualDrawerCash);
    if (!updatedShift) return null;

    // Generate Z-Report Layout
    let z = '';
    z += `========================================\n`;
    z += `            SHIFT Z-REPORT              \n`;
    z += `========================================\n`;
    z += `Shift ID:     ${updatedShift.id}\n`;
    z += `Cashier:      ${updatedShift.cashier_name}\n`;
    z += `Open Time:    ${new Date(updatedShift.opening_time).toLocaleString()}\n`;
    z += `Close Time:   ${new Date(updatedShift.closing_time).toLocaleString()}\n`;
    z += `----------------------------------------\n`;
    z += `Opening Balance (Float):   ₹${updatedShift.opening_balance.toFixed(2).padStart(11)}\n`;
    z += `----------------------------------------\n`;
    z += `SALES ACCOUNTABILITY:\n`;
    z += `  Cash Sales:              ₹${updatedShift.total_cash_sales.toFixed(2).padStart(11)}\n`;
    z += `  UPI Sales:               ₹${updatedShift.total_upi_sales.toFixed(2).padStart(11)}\n`;
    z += `  Card Sales:              ₹${updatedShift.total_card_sales.toFixed(2).padStart(11)}\n`;
    
    const totalSales = updatedShift.total_cash_sales + updatedShift.total_upi_sales + updatedShift.total_card_sales;
    z += `  Total Net Sales:         ₹${totalSales.toFixed(2).padStart(11)}\n`;
    z += `----------------------------------------\n`;
    
    const expectedDrawerCash = updatedShift.opening_balance + updatedShift.total_cash_sales;
    z += `DRAWER AUDIT:\n`;
    z += `  Expected Cash in Drawer: ...  ₹${expectedDrawerCash.toFixed(2).padStart(11)}\n`;
    z += `  Actual Cash in Drawer:        ₹${updatedShift.closing_balance.toFixed(2).padStart(11)}\n`;
    z += `  Drawer Difference:            ₹${updatedShift.drawer_difference.toFixed(2).padStart(11)}\n`;
    z += `----------------------------------------\n`;
    
    const diff = updatedShift.drawer_difference;
    const statusText = diff === 0 ? 'BALANCED' : (diff > 0 ? 'OVERAGE' : 'SHORTAGE');
    z += `Drawer Status: ${statusText}\n`;
    z += `========================================\n`;

    // Save Z-Report to a file
    try {
      const logDir = app.getPath('userData');
      const zReportPath = path.join(logDir, `z_report_${shiftId}.log`);
      fs.writeFileSync(zReportPath, z, 'utf-8');
      console.log(`[Shift Manager] Z-Report written to ${zReportPath}`);
    } catch (e) {
      console.error('Failed to write Z-Report file:', e);
    }

    return { shift: updatedShift, reportText: z };
  });

  ipcMain.handle('payment:push-terminal', async (event, amount, orderNumber, terminalIp) => {
    console.log(`[EDC Sync] Pushing payment for ${orderNumber} - Amount: ₹${amount.toFixed(2)} to Terminal IP: ${terminalIp || 'MOCK'}`);

    if (terminalIp && terminalIp.trim() !== '') {
      try {
        const response = await fetch(`http://${terminalIp.trim()}:8080/pos/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Math.round(amount * 100), // amount in paise
            referenceId: orderNumber,
            merchantId: 'MERCH_TATHASTU_01'
          }),
          signal: AbortSignal.timeout(6000)
        });
        const data = await response.json();
        return { success: response.ok, referenceId: data.transactionId || 'TXN-UNKNOWN', msg: 'Terminal charge successful' };
      } catch (err) {
        console.warn(`[EDC Sync] Real payment machine connection failed: ${err.message}. Falling back to simulator.`);
      }
    }

    // Mock EDC Simulator writes receipt log files
    let pushReceipt = '';
    pushReceipt += `========================================\n`;
    pushReceipt += `   EDC CARD PAYMENT MACHINE INTENT      \n`;
    pushReceipt += `========================================\n`;
    pushReceipt += `Terminal IP:  ${terminalIp || 'MOCK_EMULATOR_192.168.1.150'}\n`;
    pushReceipt += `Order Number: ${orderNumber}\n`;
    pushReceipt += `Amount Due:   ₹${amount.toFixed(2)}\n`;
    pushReceipt += `Status:       PENDING_TAP_OR_SWIPE\n`;
    pushReceipt += `----------------------------------------\n`;
    pushReceipt += `[Reading Chip/NFC Contract...]\n`;
    pushReceipt += `[Pin verified successfully.]\n`;
    pushReceipt += `----------------------------------------\n`;
    pushReceipt += `Auth Status:  SUCCESS\n`;
    pushReceipt += `Auth Code:    AUTH_${Math.floor(100000 + Math.random() * 900000)}\n`;
    pushReceipt += `Ref Number:   EDC_${Date.now()}\n`;
    pushReceipt += `========================================\n`;

    try {
      const logDir = app.getPath('userData');
      const pushPath = path.join(logDir, 'tathastu_edc_push.log');
      fs.writeFileSync(pushPath, pushReceipt, 'utf-8');
      console.log(`[EDC Simulator] EDC Push log written to ${pushPath}`);
    } catch (e) {
      console.error('Failed to write mock EDC print log:', e);
    }

    // Wait for 2.5 seconds to simulate user card swipe and typing pin
    await new Promise(resolve => setTimeout(resolve, 2500));

    return { success: true, referenceId: `MOCK_TXN_${Date.now()}`, msg: 'Mock transaction completed' };
  });

  startSyncWorker();
  startPrintQueueWorker();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const BACKEND_URL = 'http://localhost:3000';

function startSyncWorker() {
  // Sync queue worker runs every 12 seconds
  setInterval(async () => {
    await runUpstreamSync();
    await runDownstreamSync();
  }, 12000);
}

async function runUpstreamSync() {
  try {
    const queue = db.getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[Sync Worker] Found ${queue.length} unsynced items. Synchronizing upstream...`);
    const res = await fetch(`${BACKEND_URL}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: queue })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.succeededIds)) {
        for (const id of data.succeededIds) {
          db.clearSyncItem(id);
        }
        console.log(`[Sync Worker] Upstream sync succeeded for ${data.succeededIds.length} items.`);
      }
    }
  } catch (e) {
    console.warn('[Sync Worker] Upstream sync offline/failed:', e.message);
  }
}

async function runDownstreamSync() {
  try {
    const res = await fetch(`${BACKEND_URL}/sync/pull`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        db.mergeCatalog(data.categories || [], data.menuItems || []);
        console.log('[Sync Worker] Downstream catalog synced from cloud PostgreSQL.');
      }
    }
  } catch (e) {
    console.warn('[Sync Worker] Downstream sync offline/failed:', e.message);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function startPrintQueueWorker() {
  setInterval(async () => {
    try {
      const pendingJobs = db.getPendingPrintJobs();
      if (pendingJobs.length === 0) return;

      console.log(`[Print Worker] Found ${pendingJobs.length} queued print jobs. Attempting to flush...`);
      for (const job of pendingJobs) {
        const data = JSON.parse(job.payload);
        const order = data.order;
        const printerConfig = data.printerConfig;

        let res;
        if (job.job_type === 'BILL') {
          res = await printer.printBill(order, printerConfig);
        } else {
          res = await printer.printKOT(order, printerConfig);
        }

        if (res.success) {
          db.clearPrintJob(job.id);
          console.log(`[Print Worker] Successfully printed and cleared job ${job.id} (${job.job_type}).`);
        } else {
          console.warn(`[Print Worker] Failed to print job ${job.id}. Printer still offline.`);
          break; // Stop processing remaining queue if printer is still down
        }
      }
    } catch (e) {
      console.error('[Print Worker] Error flushing print jobs:', e.message);
    }
  }, 15000);
}
