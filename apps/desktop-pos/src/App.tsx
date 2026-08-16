import { useState, useEffect, useRef } from 'react';
import type { OrderStatus, PaymentStatus, OrderSource } from '@tathastu/shared-types';
import { TableGrid } from './components/TableGrid.js';
import { ModifierModal } from './components/ModifierModal.js';
import type { ModifierSelection } from './components/ModifierModal.js';

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
  code: string;
  name: string;
  description: string;
  price: number;
  category_id: string;
  is_available: number;
  tax_rate: number;
}

interface CartItem {
  id: string; // unique customization ID
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
  const [activeTab, setActiveTab] = useState<'pos' | 'tables' | 'orders' | 'sync'>('pos');
  
  // Custom inputs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [codeQuery, setCodeQuery] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  
  // Modifiers
  const [modifierItem, setModifierItem] = useState<SQLiteItem | null>(null);
  const [isModifierOpen, setIsModifierOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Focus ref for code search box (F4 shortcut)
  const codeSearchRef = useRef<HTMLInputElement>(null);

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

  // Keyboard shortcut listener (F1 - F12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser default bindings (like F5 reload, F12 inspector)
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F8', 'F9', 'F10', 'F12'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'F1':
          setActiveTab('pos');
          break;
        case 'F2':
          setActiveTab('tables');
          break;
        case 'F3':
          setActiveTab('sync');
          break;
        case 'F4':
          codeSearchRef.current?.focus();
          break;
        case 'F5':
          setSelectedTable(''); // toggle takeaway
          break;
        case 'F8':
          handleCheckout('CASH');
          break;
        case 'F9':
          handleCheckout('UPI');
          break;
        case 'F10':
          handleCheckout('CARD');
          break;
        case 'F12':
          triggerManualSync();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedTable, customerName, customerPhone, discount, syncQueue]);

  // Cart operations
  const handleItemClick = (item: SQLiteItem) => {
    setModifierItem(item);
    setIsModifierOpen(true);
  };

  const addCustomizedItemToCart = (selection: ModifierSelection) => {
    if (!modifierItem) return;

    const extrasPrice = selection.extras.reduce((sum, e) => sum + e.price, 0);
    const combinedPrice = modifierItem.price + extrasPrice;
    
    // Construct modifier detail string
    const modifierText = selection.extras.length > 0 
      ? selection.extras.map(e => e.name).join(', ')
      : '';
    const customizationName = `${modifierItem.name} (${selection.spiceLevel})${modifierText ? ` + [${modifierText}]` : ''}`;
    
    // Unique ID based on MenuItem + customization specifics to distinguish separate cart rows
    const uniqueCustId = `${modifierItem.id}-${selection.spiceLevel}-${selection.extras.map(e => e.id).sort().join('_')}`;

    setCart(prev => {
      const existing = prev.find(i => i.id === uniqueCustId);
      if (existing) {
        return prev.map(i => i.id === uniqueCustId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: uniqueCustId,
        menuItemId: modifierItem.id,
        name: customizationName,
        price: combinedPrice,
        quantity: 1,
        notes: `Spice: ${selection.spiceLevel}. Extras: ${modifierText || 'None'}`
      }];
    });

    setIsModifierOpen(false);
    setModifierItem(null);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === cartId) {
        const nextQty = i.quantity + delta;
        return nextQty > 0 ? { ...i, quantity: nextQty } : null;
      }
      return i;
    }).filter((i): i is CartItem => i !== null));
  };

  const updateItemNotes = (cartId: string, notes: string) => {
    setCart(prev => prev.map(i => i.id === cartId ? { ...i, notes } : i));
  };

  // Search by code entry
  const handleCodeSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = codeQuery.trim();
    if (!cleanCode) return;

    const matchedItem = items.find(item => item.code === cleanCode);
    if (matchedItem) {
      handleItemClick(matchedItem);
      setCodeQuery('');
    } else {
      alert(`Item code "${cleanCode}" not found.`);
    }
  };

  // GST splits calculations (Indian tax engine)
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountedSubtotal = Math.max(0, cartSubtotal - discount);
  
  // Split GST: 5% total tax rate -> 2.5% CGST + 2.5% SGST
  const cgst = discountedSubtotal * 0.025;
  const sgst = discountedSubtotal * 0.025;
  const cartTotal = discountedSubtotal + cgst + sgst;

  // Composite Key Generator for Offline Orders
  const generateCompositeOrderId = () => {
    const outletId = 'OUT01';
    const deviceId = 'POS01';
    const timestamp = Date.now();
    const sequence = Math.floor(1000 + Math.random() * 9000);
    return `${outletId}-${deviceId}-${timestamp}-${sequence}`;
  };

  const generateOrderNumber = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const serial = Math.floor(100 + Math.random() * 900);
    return `ORD-${today}-${serial}`;
  };

  const handleCheckout = async (paymentMethod: 'CASH' | 'UPI' | 'CARD') => {
    if (cart.length === 0) return;

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
      subTotal: cartSubtotal,
      tax: cgst + sgst,
      discount,
      total: cartTotal,
      paymentStatus: 'PAID' as PaymentStatus,
      paymentMethod,
      createdAt: nowStr,
      updatedAt: nowStr,
      items: cart.map(item => ({
        id: `${orderId}-${item.id}`,
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
      setDiscount(0);
      await refreshData();
      alert(`Order ${orderNumber} billed successfully!`);
    } catch (e) {
      console.error(e);
      alert('Checkout transaction failed.');
    }
  };

  // Sync Queue worker simulation
  const triggerManualSync = async () => {
    if (syncQueue.length === 0) return;
    setIsSyncing(true);
    try {
      for (const item of syncQueue) {
        await new Promise(r => setTimeout(r, 600));
        await window.electronAPI.clearSyncItem(item.id);
      }
      await refreshData();
      alert('Synchronization complete.');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter items by search bar query and category grid
  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.code.includes(searchQuery) ||
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-20 bg-gray-950 flex flex-col justify-between items-center py-6 text-white shrink-0 border-r border-gray-900">
        <div className="flex flex-col gap-8 items-center w-full">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-600 to-orange-400 flex items-center justify-center font-black text-xl shadow-lg shadow-orange-500/20 text-white">
            T
          </div>
          <nav className="flex flex-col gap-5 w-full px-2">
            <button
              onClick={() => setActiveTab('pos')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all ${
                activeTab === 'pos' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">🛒</span>
              <span className="text-[9px] font-bold">POS (F1)</span>
            </button>
            <button
              onClick={() => setActiveTab('tables')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all ${
                activeTab === 'tables' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">🍽️</span>
              <span className="text-[9px] font-bold">Floor (F2)</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all ${
                activeTab === 'orders' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">📜</span>
              <span className="text-[9px] font-bold">History</span>
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all relative ${
                activeTab === 'sync' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">🔄</span>
              <span className="text-[9px] font-bold">Sync (F3)</span>
              {syncQueue.length > 0 && (
                <span className="absolute top-1 right-2 w-5 h-5 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold border-2 border-gray-955">
                  {syncQueue.length}
                </span>
              )}
            </button>
          </nav>
        </div>
        <div className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">TathAstu</div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header toolbar */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-extrabold text-gray-800 tracking-tight">TathAstu POS Billing</h2>
            <div className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-wide">
              Outlet Terminal 01
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Local Database: OK
            </span>
            {syncQueue.length > 0 && (
              <button
                onClick={triggerManualSync}
                disabled={isSyncing}
                className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black rounded-lg transition-all"
              >
                {isSyncing ? 'Syncing...' : `Pending Sync: ${syncQueue.length} (F12)`}
              </button>
            )}
          </div>
        </header>

        {/* Tab view contents */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* 1. POS Tab View */}
          {activeTab === 'pos' && (
            <>
              {/* Menu and Search panel */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                {/* Search bars and filters */}
                <div className="flex gap-4 shrink-0 mb-6">
                  {/* Item code search */}
                  <form onSubmit={handleCodeSearchSubmit} className="w-64">
                    <div className="relative">
                      <input
                        ref={codeSearchRef}
                        type="text"
                        placeholder="Search code (e.g. 101) [F4]"
                        value={codeQuery}
                        onChange={e => setCodeQuery(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-200 text-xs font-bold focus:outline-none focus:border-orange-500 bg-white"
                      />
                      <button
                        type="submit"
                        className="absolute right-2.5 top-2.5 text-xs text-orange-600 font-extrabold"
                      >
                        Enter
                      </button>
                    </div>
                  </form>

                  {/* General Search bar */}
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Search menu items by name, category..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold focus:outline-none focus:border-orange-500 bg-white"
                    />
                  </div>
                </div>

                {/* Categories filtering tab bar */}
                <div className="flex gap-2 shrink-0 mb-6 overflow-x-auto pb-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === 'all'
                        ? 'bg-orange-500 text-white shadow-md'
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
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Items Grid view */}
                <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pr-2">
                  {filteredItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm cursor-pointer hover:border-orange-500 hover:shadow-md hover:scale-[1.01] transition-all flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-black text-gray-400 block tracking-wide">#{item.code}</span>
                          <h4 className="font-bold text-gray-800 text-sm mt-0.5">{item.name}</h4>
                          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                        </div>
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

              {/* Cart billing panel */}
              <div className="w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
                {/* Cart header */}
                <div className="p-6 border-b border-gray-100 shrink-0">
                  <div className="flex justify-between items-center">
                    <h3 className="font-extrabold text-gray-800">Checkout Cart</h3>
                    <button
                      onClick={() => setSelectedTable('')}
                      className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1 px-2.5 rounded-lg border border-gray-200"
                    >
                      Takeaway Mode [F5]
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Table No</label>
                      <select
                        value={selectedTable}
                        onChange={e => setSelectedTable(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold focus:outline-none focus:border-orange-500 bg-white"
                      >
                        <option value="">None (Takeaway)</option>
                        {tables.map(t => (
                          <option key={t.id} value={t.table_number}>
                            Table {t.table_number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Customer Name</label>
                      <input
                        type="text"
                        placeholder="Guest Name"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-orange-500 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Cart Items list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                      <span className="text-3xl">🛒</span>
                      <span className="text-xs font-bold">Billed items appear here</span>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="border-b border-gray-100 pb-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-xs text-gray-800 leading-tight block">{item.name}</span>
                            <span className="text-[10px] text-orange-600 font-extrabold block mt-0.5">
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-0.5 bg-gray-50">
                            <button
                              onClick={() => updateQuantity(item.id, -1)}
                              className="text-gray-400 hover:text-red-500 font-bold px-1 text-sm"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, 1)}
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
                          onChange={e => updateItemNotes(item.id, e.target.value)}
                          className="w-full px-2 py-1 rounded bg-gray-50 border border-gray-100 text-[10px] focus:outline-none focus:border-orange-300"
                        />
                      </div>
                    ))
                  )}
                </div>

                {/* Cart details & checkout */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0 space-y-4">
                  {/* Discount input */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <label className="font-bold text-gray-500 shrink-0">Discount Amount</label>
                    <input
                      type="number"
                      placeholder="₹0.00"
                      value={discount || ''}
                      onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-24 text-right px-2.5 py-1 rounded border border-gray-200 font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Calculations Splitting */}
                  <div className="space-y-1.5 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-bold text-gray-800">₹{cartSubtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-green-600 font-bold">
                        <span>Discount</span>
                        <span>-₹{discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>CGST (2.5%)</span>
                      <span className="font-bold text-gray-700">₹{cgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>SGST (2.5%)</span>
                      <span className="font-bold text-gray-700">₹{sgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-black text-gray-800">
                      <span>Net Payable</span>
                      <span className="text-orange-600">₹{cartTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Checkout Payment methods */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleCheckout('CASH')}
                        disabled={cart.length === 0}
                        className="py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase transition-colors"
                      >
                        💵 Cash [F8]
                      </button>
                      <button
                        onClick={() => handleCheckout('UPI')}
                        disabled={cart.length === 0}
                        className="py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase transition-colors"
                      >
                        📱 UPI [F9]
                      </button>
                      <button
                        onClick={() => handleCheckout('CARD')}
                        disabled={cart.length === 0}
                        className="py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase transition-colors"
                      >
                        💳 Card [F10]
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 2. Visual Table Floor view */}
          {activeTab === 'tables' && (
            <div className="flex-1 p-8 overflow-y-auto">
              <TableGrid
                tables={tables}
                activeOrders={orders}
                selectedTableNumber={selectedTable}
                onSelectTable={tableNumber => {
                  setSelectedTable(tableNumber);
                  setActiveTab('pos'); // Jump back to pos to choose items
                }}
              />
            </div>
          )}

          {/* 3. Orders History tab */}
          {activeTab === 'orders' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <h3 className="text-xl font-extrabold text-gray-800">Offline Billing Logs</h3>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                      <th className="p-4">Order Number</th>
                      <th className="p-4">Offline ID</th>
                      <th className="p-4">Table / Mode</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4">GST (SGST/CGST)</th>
                      <th className="p-4">Total Payable</th>
                      <th className="p-4">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">
                          No transactions completed yet.
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
                            {o.customerName || 'Walk-in'}
                          </td>
                          <td className="p-4 text-xs text-gray-500">
                            ₹{o.tax.toFixed(2)}
                          </td>
                          <td className="p-4 font-black">₹{o.total.toFixed(2)}</td>
                          <td className="p-4 text-xs">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                              {o.paymentStatus} ({o.paymentMethod})
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

          {/* 4. Sync status log tab */}
          {activeTab === 'sync' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-800">Synchronize Database</h3>
                  <p className="text-xs text-gray-400 mt-1">Pending sync queue records saved in SQLite for offline recovery.</p>
                </div>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing || syncQueue.length === 0}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white text-xs font-bold rounded-xl shadow transition-all"
                >
                  {isSyncing ? 'Synchronizing...' : 'Upload Offline Queue (F12)'}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                      <th className="p-4">Queue ID</th>
                      <th className="p-4">Entity Type</th>
                      <th className="p-4">Entity ID</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Status</th>
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-750 animate-pulse">
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

      {/* Dynamic Modifiers Choice Popup Modal */}
      {modifierItem && (
        <ModifierModal
          isOpen={isModifierOpen}
          itemName={modifierItem.name}
          itemPrice={modifierItem.price}
          onClose={() => {
            setIsModifierOpen(false);
            setModifierItem(null);
          }}
          onConfirm={addCustomizedItemToCart}
        />
      )}
    </div>
  );
}

export default App;
