const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let dbPath;
try {
  // Production-grade location: app user data directory
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'tathastu_local.db');
} catch (e) {
  // Fallback for tests/dev out of Electron main process context
  dbPath = path.join(__dirname, 'tathastu_local.db');
}

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log('Initializing local SQLite database at:', dbPath);
const db = new Database(dbPath);

// Enable WAL journal mode for performance and enforce foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initSchema() {
  // Migration check: check if 'license_metadata' table exists in SQLite
  let needsMigration = false;
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='license_metadata'").get();
    if (!tableExists) {
      needsMigration = true;
    }
  } catch (e) {
    needsMigration = true;
  }

  if (needsMigration) {
    console.log('Database schema outdated. Wiping and recreating tables...');
    db.exec(`
      DROP TABLE IF EXISTS modifiers;
      DROP TABLE IF EXISTS order_items;
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS tables;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS recipes;
      DROP TABLE IF EXISTS ingredients;
      DROP TABLE IF EXISTS shifts;
      DROP TABLE IF EXISTS pos_sequence;
      DROP TABLE IF EXISTS print_retry_queue;
      DROP TABLE IF EXISTS license_metadata;
    `);
  }

  db.exec(`
    -- 1. Tables map
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      table_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'VACANT',
      capacity INTEGER DEFAULT 4
    );

    -- 2. Menu Categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- 3. Menu Items
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id TEXT NOT NULL,
      image_url TEXT,
      is_available INTEGER DEFAULT 1,
      tax_rate REAL DEFAULT 0.05,
      FOREIGN KEY (category_id) REFERENCES categories (id)
    );

    -- 4. Modifiers
    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      item_id TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    );

    -- 5. Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      table_number TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      discount REAL DEFAULT 0.0,
      total REAL NOT NULL,
      payment_status TEXT NOT NULL,
      payment_method TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 6. Order Items
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      kot_id TEXT,
      FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
    );

    -- 7. Synchronization Queue
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    -- 8. Raw Inventory Ingredients
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stock_qty REAL NOT NULL,
      unit TEXT NOT NULL
    );

    -- 9. BOM Recipe Mappings
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      quantity_required REAL NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE
    );

    -- 10. Cashier Shifts
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      cashier_name TEXT NOT NULL,
      status TEXT NOT NULL,
      opening_balance REAL NOT NULL,
      closing_balance REAL,
      opening_time TEXT NOT NULL,
      closing_time TEXT,
      total_cash_sales REAL DEFAULT 0,
      total_upi_sales REAL DEFAULT 0,
      total_card_sales REAL DEFAULT 0,
      drawer_difference REAL
    );

    -- 11. Incremental POS Sequences (Clock-drift protection)
    CREATE TABLE IF NOT EXISTS pos_sequence (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO pos_sequence (key, value) VALUES ('order_sequence', 1);

    -- 12. Printing Retry Queue (Hardware resilience)
    CREATE TABLE IF NOT EXISTS print_retry_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 13. Index Optimizations for Large Datasets (50k+ orders scale)
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    CREATE INDEX IF NOT EXISTS idx_recipes_item_id ON recipes(item_id);

    -- 14. Desktop POS Licensing Locks (Encrypted Metadata Store)
    CREATE TABLE IF NOT EXISTS license_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedMockData();
}

function seedMockData() {
  // Seed Tables
  const tableCount = db.prepare('SELECT COUNT(*) as count FROM tables').get();
  if (tableCount.count === 0) {
    console.log('Seeding mock tables...');
    const insertTable = db.prepare('INSERT INTO tables (id, table_number, status, capacity) VALUES (?, ?, ?, ?)');
    const tables = [
      { id: 't1', table_number: '1', status: 'VACANT', capacity: 2 },
      { id: 't2', table_number: '2', status: 'VACANT', capacity: 4 },
      { id: 't3', table_number: '3', status: 'OCCUPIED', capacity: 4 },
      { id: 't4', table_number: '4', status: 'VACANT', capacity: 6 },
      { id: 't5', table_number: '5', status: 'VACANT', capacity: 8 },
    ];
    db.transaction((list) => {
      for (const t of list) insertTable.run(t.id, t.table_number, t.status, t.capacity);
    })(tables);
  }

  // Seed Categories and Items
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (categoryCount.count === 0) {
    console.log('Seeding mock categories and menu items...');
    const insertCategory = db.prepare('INSERT INTO categories (id, name, description, is_active) VALUES (?, ?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO items (id, code, name, description, price, category_id, is_available, tax_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    
    db.transaction(() => {
      insertCategory.run('c1', 'Appetizers', 'Starters and quick bites', 1);
      insertCategory.run('c2', 'Main Course', 'Filling entrees', 1);
      insertCategory.run('c3', 'Beverages', 'Refreshing beverages', 1);

      insertItem.run('i1', '101', 'Garlic Bread', 'Garlic butter toasted baguette slices', 120.0, 'c1', 1, 0.05);
      insertItem.run('i2', '102', 'Stuffed Mushrooms', 'Stuffed with cheese and herbs', 160.0, 'c1', 1, 0.05);
      insertItem.run('i3', '201', 'Paneer Butter Masala', 'Paneer cubes in creamy tomato butter sauce', 280.0, 'c2', 1, 0.05);
      insertItem.run('i4', '202', 'Chicken Tikka Masala', 'Grilled chicken chunks in spiced tikka gravy', 340.0, 'c2', 1, 0.05);
      insertItem.run('i5', '203', 'Dal Makhani', 'Slow cooked black lentils with cream', 220.0, 'c2', 1, 0.05);
      insertItem.run('i6', '301', 'Fresh Lime Soda', 'Salted or sweet lime soda', 70.0, 'c3', 1, 0.05);
      insertItem.run('i7', '302', 'Cold Brew Coffee', 'Slow dripped smooth black coffee', 110.0, 'c3', 1, 0.05);
    })();
  }

  // Seed Ingredients and BOM Recipes
  const ingredientCount = db.prepare('SELECT COUNT(*) as count FROM ingredients').get();
  if (ingredientCount.count === 0) {
    console.log('Seeding mock raw ingredients and BOM recipes...');
    const insertIng = db.prepare('INSERT INTO ingredients (id, name, stock_qty, unit) VALUES (?, ?, ?, ?)');
    const insertRec = db.prepare('INSERT INTO recipes (id, item_id, ingredient_id, quantity_required) VALUES (?, ?, ?, ?)');

    db.transaction(() => {
      insertIng.run('ing_flour', 'Flour', 5000.0, 'g');
      insertIng.run('ing_cheese', 'Cheese', 3000.0, 'g');
      insertIng.run('ing_butter', 'Butter', 2000.0, 'g');
      insertIng.run('ing_paneer', 'Paneer', 4000.0, 'g');
      insertIng.run('ing_chicken', 'Chicken', 4000.0, 'g');
      insertIng.run('ing_coffee', 'Coffee Beans', 2000.0, 'g');
      insertIng.run('ing_lemon', 'Lemon Juice', 1000.0, 'ml');

      // Garlic Bread -> 50g Flour, 20g Cheese, 10g Butter
      insertRec.run('rec1', 'i1', 'ing_flour', 50.0);
      insertRec.run('rec2', 'i1', 'ing_cheese', 20.0);
      insertRec.run('rec3', 'i1', 'ing_butter', 10.0);

      // Stuffed Mushrooms -> 30g Cheese
      insertRec.run('rec4', 'i2', 'ing_cheese', 30.0);

      // Paneer Butter Masala -> 100g Paneer, 20g Butter
      insertRec.run('rec5', 'i3', 'ing_paneer', 100.0);
      insertRec.run('rec6', 'i3', 'ing_butter', 20.0);

      // Chicken Tikka Masala -> 120g Chicken, 20g Butter
      insertRec.run('rec7', 'i4', 'ing_chicken', 120.0);
      insertRec.run('rec8', 'i4', 'ing_butter', 20.0);

      // Fresh Lime Soda -> 30ml Lemon Juice
      insertRec.run('rec9', 'i6', 'ing_lemon', 30.0);

      // Cold Brew Coffee -> 20g Coffee Beans
      insertRec.run('rec10', 'i7', 'ing_coffee', 20.0);
    })();
  }
}

// --- Query Utilities ---

function getTables() {
  return db.prepare('SELECT * FROM tables').all();
}

function getCategories() {
  return db.prepare('SELECT * FROM categories WHERE is_active = 1').all();
}

function getItems() {
  return db.prepare('SELECT * FROM items WHERE is_available = 1').all();
}

function getOrders() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const selectItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  return orders.map(order => ({
    ...order,
    // Format db columns back to camelCase React interfaces
    tableNumber: order.table_number,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    subTotal: order.subtotal,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    items: selectItems.all(order.id).map(item => ({
      ...item,
      menuItemId: item.menu_item_id,
      kotId: item.kot_id
    }))
  }));
}

function saveOrder(order) {
  const insertOrder = db.prepare(`
    INSERT OR REPLACE INTO orders (id, order_number, table_number, customer_name, customer_phone, status, source, subtotal, tax, discount, total, payment_status, payment_method, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');
  const insertItem = db.prepare(`
    INSERT INTO order_items (id, order_id, menu_item_id, name, price, quantity, notes, kot_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQueue = db.prepare(`
    INSERT INTO sync_queue (entity_type, entity_id, action, payload, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction((o) => {
    // Save order fields
    insertOrder.run(
      o.id,
      o.order_number,
      o.tableNumber || null,
      o.customerName || null,
      o.customerPhone || null,
      o.status,
      o.source,
      o.subTotal,
      o.tax,
      o.discount || 0,
      o.total,
      o.paymentStatus,
      o.paymentMethod || null,
      o.createdAt,
      o.updatedAt
    );

    // Save order items
    deleteItems.run(o.id);
    for (const item of o.items) {
      insertItem.run(
        item.id,
        o.id,
        item.menuItemId,
        item.name,
        item.price,
        item.quantity,
        item.notes || null,
        item.kotId || null
      );
    }

    // Shift integration: if active shift exists, update shift sales totals
    const activeShift = db.prepare("SELECT * FROM shifts WHERE status = 'ACTIVE'").get();
    if (activeShift) {
      if (o.paymentMethod === 'CASH') {
        db.prepare("UPDATE shifts SET total_cash_sales = total_cash_sales + ? WHERE id = ?").run(o.total, activeShift.id);
      } else if (o.paymentMethod === 'UPI') {
        db.prepare("UPDATE shifts SET total_upi_sales = total_upi_sales + ? WHERE id = ?").run(o.total, activeShift.id);
      } else if (o.paymentMethod === 'CARD') {
        db.prepare("UPDATE shifts SET total_card_sales = total_card_sales + ? WHERE id = ?").run(o.total, activeShift.id);
      }
    }

    // BOM Stock deduction
    const selectRecipe = db.prepare("SELECT * FROM recipes WHERE item_id = ?");
    const deductStock = db.prepare("UPDATE ingredients SET stock_qty = stock_qty - ? WHERE id = ?");

    for (const item of o.items) {
      const recipeRows = selectRecipe.all(item.menuItemId);
      for (const recipe of recipeRows) {
        deductStock.run(recipe.quantity_required * item.quantity, recipe.ingredient_id);
      }
    }

    // Queue for synclogging
    insertQueue.run(
      'ORDER',
      o.id,
      'CREATE',
      JSON.stringify(o),
      'PENDING',
      new Date().toISOString()
    );
  })(order);

  return { success: true, orderId: order.id };
}

function getSyncQueue() {
  return db.prepare("SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC").all();
}

function clearSyncItem(id) {
  return db.prepare("UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?").run(id);
}

function mergeCatalog(categories, items) {
  const insertCategory = db.prepare(`
    INSERT OR REPLACE INTO categories (id, name, description, is_active)
    VALUES (?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT OR REPLACE INTO items (id, code, name, description, price, category_id, image_url, is_available, tax_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const cat of categories) {
      insertCategory.run(
        cat.id,
        cat.name,
        cat.description || null,
        cat.isActive !== undefined ? (cat.isActive ? 1 : 0) : 1
      );
    }
    for (const item of items) {
      const itemCode = item.code || `C-${item.id.slice(0, 4).toUpperCase()}`;
      insertItem.run(
        item.id,
        itemCode,
        item.name,
        item.description || null,
        item.price,
        item.categoryId,
        item.imageUrl || null,
        item.isAvailable !== undefined ? (item.isAvailable ? 1 : 0) : 1,
        item.taxRate || 0.05
      );
    }
  })();
}

function getIngredients() {
  return db.prepare('SELECT * FROM ingredients ORDER BY name ASC').all();
}

function getActiveShift() {
  return db.prepare("SELECT * FROM shifts WHERE status = 'ACTIVE'").get();
}

function startShift(cashierName, openingBalance) {
  db.prepare("UPDATE shifts SET status = 'CLOSED', closing_time = ? WHERE status = 'ACTIVE'").run(new Date().toISOString());

  const shiftId = 'SHIFT-' + Date.now();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shifts (id, cashier_name, status, opening_balance, opening_time, total_cash_sales, total_upi_sales, total_card_sales)
    VALUES (?, ?, 'ACTIVE', ?, ?, 0, 0, 0)
  `).run(shiftId, cashierName, openingBalance, now);

  return getActiveShift();
}

function endShift(shiftId, actualDrawerCash) {
  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId);
  if (!shift) return { success: false, error: 'Shift not found' };

  const expectedDrawerCash = shift.opening_balance + shift.total_cash_sales;
  const difference = actualDrawerCash - expectedDrawerCash;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE shifts
    SET status = 'CLOSED', closing_balance = ?, closing_time = ?, drawer_difference = ?
    WHERE id = ?
  `).run(actualDrawerCash, now, difference, shiftId);

  return db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId);
}

function getNextSequenceValue(key) {
  let val = 1;
  db.transaction(() => {
    db.prepare("UPDATE pos_sequence SET value = value + 1 WHERE key = ?").run(key);
    const row = db.prepare("SELECT value FROM pos_sequence WHERE key = ?").get(key);
    val = row.value;
  })();
  return val;
}

function addPrintJob(jobType, payload) {
  db.prepare("INSERT INTO print_retry_queue (job_type, payload, created_at) VALUES (?, ?, ?)")
    .run(jobType, JSON.stringify(payload), new Date().toISOString());
}

function getPendingPrintJobs() {
  return db.prepare("SELECT * FROM print_retry_queue ORDER BY created_at ASC").all();
}

function clearPrintJob(id) {
  db.prepare("DELETE FROM print_retry_queue WHERE id = ?").run(id);
}

function saveLicenseKey(key) {
  db.prepare("INSERT OR REPLACE INTO license_metadata (key, value) VALUES ('license_key', ?)")
    .run(key);
}

function getLicenseKey() {
  const row = db.prepare("SELECT value FROM license_metadata WHERE key = 'license_key'").get();
  return row ? row.value : null;
}

function saveLicenseToken(token) {
  db.prepare("INSERT OR REPLACE INTO license_metadata (key, value) VALUES ('license_token', ?)")
    .run(token);
}

function getLicenseToken() {
  const row = db.prepare("SELECT value FROM license_metadata WHERE key = 'license_token'").get();
  return row ? row.value : null;
}

module.exports = {
  initSchema,
  getTables,
  getCategories,
  getItems,
  getOrders,
  saveOrder,
  getSyncQueue,
  clearSyncItem,
  mergeCatalog,
  getIngredients,
  getActiveShift,
  startShift,
  endShift,
  getNextSequenceValue,
  addPrintJob,
  getPendingPrintJobs,
  clearPrintJob,
  saveLicenseKey,
  getLicenseKey,
  saveLicenseToken,
  getLicenseToken
};
