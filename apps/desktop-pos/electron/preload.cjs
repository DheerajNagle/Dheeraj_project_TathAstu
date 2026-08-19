const { contextBridge, ipcRenderer } = require('electron');

// Expose a basic safe bridge to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  ping: () => 'pong',

  // SQLite Database Access
  getTables: () => ipcRenderer.invoke('db:get-tables'),
  getCategories: () => ipcRenderer.invoke('db:get-categories'),
  getItems: () => ipcRenderer.invoke('db:get-items'),
  getOrders: () => ipcRenderer.invoke('db:get-orders'),
  saveOrder: (order) => ipcRenderer.invoke('db:save-order', order),
  getSyncQueue: () => ipcRenderer.invoke('db:get-sync-queue'),
  clearSyncItem: (id) => ipcRenderer.invoke('db:clear-sync-item', id),

  // Printing API
  printKOT: (order, config) => ipcRenderer.invoke('print:kot', order, config),
  printBill: (order, config) => ipcRenderer.invoke('print:bill', order, config),

  // Sync API
  triggerSync: () => ipcRenderer.invoke('sync:trigger'),

  // Shift & Inventory API
  getIngredients: () => ipcRenderer.invoke('db:get-ingredients'),
  getActiveShift: () => ipcRenderer.invoke('db:get-active-shift'),
  getNextIdentifiers: () => ipcRenderer.invoke('db:get-next-identifiers'),
  startShift: (cashierName, openingBalance) => ipcRenderer.invoke('db:start-shift', cashierName, openingBalance),
  endShift: (shiftId, actualDrawerCash) => ipcRenderer.invoke('db:end-shift', shiftId, actualDrawerCash),
  pushPaymentTerminal: (amount, orderNumber, terminalIp) => ipcRenderer.invoke('payment:push-terminal', amount, orderNumber, terminalIp),
  checkLicense: () => ipcRenderer.invoke('license:check-status'),
  activateLicense: (payload) => ipcRenderer.invoke('license:activate', payload),
  onUpdaterAvailable: (callback) => ipcRenderer.on('updater:available', (event, info) => callback(info)),
  onUpdaterProgress: (callback) => ipcRenderer.on('updater:progress', (event, percent) => callback(percent)),
  onUpdaterDownloaded: (callback) => ipcRenderer.on('updater:downloaded', (event, info) => callback(info)),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  getPaymentSettings: () => ipcRenderer.invoke('db:get-payment-settings'),
  savePaymentSettings: (vpaId, merchantName, enableDynamicUpi) => ipcRenderer.invoke('db:save-payment-settings', vpaId, merchantName, enableDynamicUpi),
  getUPIQRPreview: (amount, orderNumber) => ipcRenderer.invoke('payment:get-upi-qr-preview', amount, orderNumber),
  addMenuItem: (name, price, categoryId, code) => ipcRenderer.invoke('db:add-menu-item', name, price, categoryId, code)
});
