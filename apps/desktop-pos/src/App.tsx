import { useState, useEffect } from 'react';
import type { OrderStatus, PaymentStatus, OrderSource } from '@tathastu/shared-types';

interface SQLiteTable {
  id: string;
  table_number: string;
  status: string;
  capacity: number;
}

interface SQLiteCategory {
  id: string;
  name: string;
  description: string;
  is_active: number;
}

interface SQLiteItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category_id: string;
  is_available: number;
  tax_rate: number;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

interface ElectronAPI {
  platform: string;
  ping: () => string;
  getTables: () => Promise<SQLiteTable[]>;
  getCategories: () => Promise<SQLiteCategory[]>;
  getItems: () => Promise<SQLiteItem[]>;
  getOrders: () => Promise<any[]>;
  saveOrder: (order: any) => Promise<{ success: boolean; orderId: string }>;
  getSyncQueue: () => Promise<any[]>;
  clearSyncItem: (id: number) => Promise<any>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function App() {
  // DB States
  const [tables, setTables] = useState<SQLiteTable[]>([]);
  const [categories, setCategories] = useState<SQLiteCategory[]>([]);
  const [items, setItems] = useState<SQLiteItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [syncQueue, setSyncQueue] = useState<any[]>([]);

  // Cart & POS UI States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pos' | 'orders' | 'sync'>('pos');
  const [isSyncing, setIsSyncing] = useState(false);

  // Load data from SQLite on mount
  const refreshData = async () => {
    try {
      const api = window.electronAPI;
      const [tList, cList, iList, oList, qList] = await Promise.all([
        api.getTables(),
        api.getCategories(),
        api.getItems(),
        api.getOrders(),
        api.getSyncQueue()
      ]);
      setTables(tList);
      setCategories(cList);
      setItems(iList);
      setOrders(oList);
      setSyncQueue(qList);
    } catch (e) {
      console.error('Error fetching SQLite data:', e);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Cart Handlers
  const addToCart = (item: SQLiteItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        return prev.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.menuItemId === itemId) {
        const nextQty = i.quantity + delta;
        return nextQty > 0 ? { ...i, quantity: nextQty } : null;
      }
      return i;
    }).filter((i): i is CartItem => i !== null));
  };

  const updateItemNotes = (itemId: string, notes: string) => {
    setCart(prev => prev.map(i => i.menuItemId === itemId ? { ...i, notes } : i));
  };

  // Calculations
  const subTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subTotal * 0.05; // 5% flat tax
  const total = subTotal + tax;

  // Composite Key Generator for Offline Orders
  // Format: OUTLET_ID + DEVICE_ID + TIMESTAMP + SEQUENCE_ID
  const generateCompositeOrderId = () => {
    const outletId = 'OUT01';
    const deviceId = 'POS01';
    const timestamp = Date.now();
    const sequence = Math.floor(1000 + Math.random() * 9000); // 4-digit random sequence
    return `${outletId}-${deviceId}-${timestamp}-${sequence}`;
  };

  const generateOrderNumber = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const serial = Math.floor(100 + Math.random() * 900); // 3-digit serial
    return `ORD-${today}-${serial}`;
  };

  const handleCheckout = async (paymentMethod: 'CASH' | 'UPI' | 'CARD') => {
    if (cart.length === 0) return alert('Your cart is empty!');

    const orderId = generateCompositeOrderId();
    const orderNumber = generateOrderNumber();
    const nowStr = new Date().toISOString();

    const orderPayload = {
      id: orderId,
      order_number: orderNumber,
      tableNumber: selectedTable || null,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      status: 'PENDING' as OrderStatus,
      source: (selectedTable ? 'DINE_IN' : 'TAKEAWAY') as OrderSource,
      subTotal,
      tax,
      discount: 0,
      total,
      paymentStatus: 'PAID' as PaymentStatus,
      paymentMethod,
      createdAt: nowStr,
      updatedAt: nowStr,
      items: cart.map(item => ({
        id: `${orderId}-${item.menuItemId}`,
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        notes: item.notes,
        kotId: null
      }))
    };

    try {
      await window.electronAPI.saveOrder(orderPayload);
      setCart([]);
      setSelectedTable('');
      setCustomerName('');
      setCustomerPhone('');
      await refreshData();
      alert(`Order ${orderNumber} created successfully! Added to local SQLite & Sync Queue.`);
    } catch (e) {
      console.error(e);
      alert('Failed to save order to local database');
    }
  };

  // Simulate server upload for offline queue
  const triggerManualSync = async () => {
    if (syncQueue.length === 0) return alert('No pending orders to sync!');
    setIsSyncing(true);
    try {
      // Simulate network request delays
      for (const item of syncQueue) {
        await new Promise(r => setTimeout(r, 800));
        await window.electronAPI.clearSyncItem(item.id);
      }
      await refreshData();
      alert('Synchronization complete. All local orders successfully pushed to cloud database!');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredItems = selectedCategory === 'all'
    ? items
    : items.filter(item => item.category_id === selectedCategory);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans overflow-hidden">
      {/* Navigation Drawer */}
      <aside className="w-20 bg-gray-900 flex flex-col justify-between items-center py-6 text-white border-r border-gray-800">
        <div className="flex flex-col gap-8 items-center w-full">
          <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center font-black text-xl shadow-lg shadow-orange-500/20">
            T
          </div>
          <nav className="flex flex-col gap-6 w-full px-2">
            <button
              onClick={() => setActiveTab('pos')}
              className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                activeTab === 'pos' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">🛒</span>
              <span className="text-[9px] font-bold">POS</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                activeTab === 'orders' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">📜</span>
              <span className="text-[9px] font-bold">Orders</span>
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all relative ${
                activeTab === 'sync' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">🔄</span>
              <span className="text-[9px] font-bold">Sync</span>
              {syncQueue.length > 0 && (
                <span className="absolute top-1 right-2 w-5 h-5 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold border-2 border-gray-900 animate-bounce">
                  {syncQueue.length}
                </span>
              )}
            </button>
          </nav>
        </div>
        <div className="text-[10px] text-gray-500 font-bold">v1.0</div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-800 tracking-tight">TathAstu Terminal</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              SQLite Online
            </span>
          </div>

          <div className="flex items-center gap-4">
            {syncQueue.length > 0 ? (
              <button
                onClick={triggerManualSync}
                disabled={isSyncing}
                className="px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg shadow-md hover:bg-orange-600 active:scale-95 transition-all flex items-center gap-2"
              >
                {isSyncing ? 'Syncing...' : `Sync Queue (${syncQueue.length} Orders)`}
              </button>
            ) : (
              <span className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-400">
                All Orders Synchronized
              </span>
            )}
          </div>
        </header>

        {/* Panel Container */}
        <div className="flex-1 flex overflow-hidden">
          {/* POS tab */}
          {activeTab === 'pos' && (
            <>
              {/* Left Menu Selection */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                {/* Category filters */}
                <div className="flex gap-2 shrink-0 mb-6 overflow-x-auto pb-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === 'all'
                        ? 'bg-gray-900 text-white shadow-md'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    All Items
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-gray-900 text-white shadow-md'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Items Grid */}
                <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pr-2">
                  {filteredItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-orange-500 hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between"
                    >
                      <div>
                        <h4 className="font-bold text-gray-800">{item.name}</h4>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm font-black text-orange-600">₹{item.price.toFixed(2)}</span>
                        <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white flex items-center justify-center font-bold transition-colors">
                          +
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Order/Cart Panel */}
              <div className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
                {/* Cart Header */}
                <div className="p-6 border-b border-gray-100 shrink-0">
                  <h3 className="font-extrabold text-gray-800 text-lg">Current Order</h3>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Table</label>
                      <select
                        value={selectedTable}
                        onChange={e => setSelectedTable(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold focus:outline-none focus:border-orange-500"
                      >
                        <option value="">Takeaway / Delivery</option>
                        {tables.map(t => (
                          <option key={t.id} value={t.table_number}>
                            Table {t.table_number} ({t.capacity} Pax)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Customer</label>
                      <input
                        type="text"
                        placeholder="Guest Name"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                      <span className="text-4xl">🛒</span>
                      <span className="text-xs font-bold">Cart is empty</span>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={item.menuItemId} className="border-b border-gray-100 pb-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-sm text-gray-800">{item.name}</span>
                            <span className="text-[10px] text-orange-500 font-extrabold block mt-0.5">
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
                            <button
                              onClick={() => updateQuantity(item.menuItemId, -1)}
                              className="text-gray-400 hover:text-red-500 font-bold px-1 text-sm"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.menuItemId, 1)}
                              className="text-gray-400 hover:text-green-500 font-bold px-1 text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Special instructions..."
                          value={item.notes}
                          onChange={e => updateItemNotes(item.menuItemId, e.target.value)}
                          className="w-full px-2.5 py-1 rounded bg-gray-50 border border-gray-100 text-[10px] focus:outline-none focus:border-orange-300"
                        />
                      </div>
                    ))
                  )}
                </div>

                {/* Checkout Summary */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0 space-y-4">
                  <div className="space-y-1.5 text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-bold text-gray-800">₹{subTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (5%)</span>
                      <span className="font-bold text-gray-800">₹{tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-black text-gray-800">
                      <span>Total Amount</span>
                      <span className="text-orange-600">₹{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleCheckout('CASH')}
                      disabled={cart.length === 0}
                      className="py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-bold uppercase transition-colors"
                    >
                      💵 Cash
                    </button>
                    <button
                      onClick={() => handleCheckout('UPI')}
                      disabled={cart.length === 0}
                      className="py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-bold uppercase transition-colors"
                    >
                      📱 UPI
                    </button>
                    <button
                      onClick={() => handleCheckout('CARD')}
                      disabled={cart.length === 0}
                      className="py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-bold uppercase transition-colors"
                    >
                      💳 Card
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Orders History Tab */}
          {activeTab === 'orders' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <h3 className="text-xl font-extrabold text-gray-800">Offline Order History (SQLite)</h3>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                      <th className="p-4">Order Number</th>
                      <th className="p-4">Offline ID</th>
                      <th className="p-4">Table / Source</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Payment</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-400">
                          No orders saved in SQLite. Create some from the POS interface!
                        </td>
                      </tr>
                    ) : (
                      orders.map(o => (
                        <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 font-medium">
                          <td className="p-4 font-bold text-orange-600">{o.order_number}</td>
                          <td className="p-4 text-xs font-mono text-gray-400">{o.id}</td>
                          <td className="p-4 text-xs font-bold">
                            {o.tableNumber ? `Table ${o.tableNumber}` : o.source}
                          </td>
                          <td className="p-4 text-xs">
                            {o.customerName || 'Walk-in'} {o.customerPhone && `(${o.customerPhone})`}
                          </td>
                          <td className="p-4 font-black">₹{o.total.toFixed(2)}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                              {o.paymentStatus} ({o.paymentMethod})
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sync Queue Tab */}
          {activeTab === 'sync' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-800">Local Synchronization Queue</h3>
                  <p className="text-xs text-gray-400 mt-1">Pending sync queue records saved in SQLite for offline recovery.</p>
                </div>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing || syncQueue.length === 0}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white text-xs font-bold rounded-xl shadow transition-all"
                >
                  {isSyncing ? 'Synchronizing...' : 'Upload Offline Queue'}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                      <th className="p-4">Queue ID</th>
                      <th className="p-4">Entity Type</th>
                      <th className="p-4">Entity ID</th>
                      <th className="p-4">Sync Action</th>
                      <th className="p-4">Queue Status</th>
                      <th className="p-4">Logged Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncQueue.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-400">
                          Sync queue is empty. All local database edits are synced with the cloud.
                        </td>
                      </tr>
                    ) : (
                      syncQueue.map(item => (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 font-medium">
                          <td className="p-4 text-xs font-mono font-bold text-gray-400">{item.id}</td>
                          <td className="p-4 text-xs font-bold">{item.entity_type}</td>
                          <td className="p-4 text-xs font-mono text-gray-500">{item.entity_id}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                              {item.action}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 animate-pulse">
                              {item.status}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-gray-400">{item.created_at}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
