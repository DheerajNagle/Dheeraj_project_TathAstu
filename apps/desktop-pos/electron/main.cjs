const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db.cjs');
const printer = require('./printer.cjs');

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

  startSyncWorker();
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
