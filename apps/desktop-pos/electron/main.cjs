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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
