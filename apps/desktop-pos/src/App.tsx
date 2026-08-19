import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
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
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

interface KDSTicket {
  id: string;
  orderNumber: string;
  tableNumber: string | null;
  status: string;
  createdAt: string;
  items: Array<{
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    notes: string | null;
    status: string;
  }>;
}

interface SQLiteIngredient {
  id: string;
  name: string;
  stock_qty: number;
  unit: string;
}

interface SQLiteShift {
  id: string;
  cashier_name: string;
  status: string;
  opening_balance: number;
  closing_balance: number | null;
  opening_time: string;
  closing_time: string | null;
  total_cash_sales: number;
  total_upi_sales: number;
  total_card_sales: number;
  drawer_difference: number | null;
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
  printKOT: (order: any, config: any) => Promise<{ success: boolean; preview: string }>;
  printBill: (order: any, config: any) => Promise<{ success: boolean; preview: string }>;
  triggerSync: () => Promise<any[]>;
  getIngredients: () => Promise<SQLiteIngredient[]>;
  getActiveShift: () => Promise<SQLiteShift | null>;
  getNextIdentifiers: () => Promise<{ orderId: string; orderNumber: string }>;
  startShift: (cashierName: string, openingBalance: number) => Promise<SQLiteShift>;
  endShift: (shiftId: string, actualDrawerCash: number) => Promise<{ shift: SQLiteShift; reportText: string }>;
  pushPaymentTerminal: (amount: number, orderNumber: string, terminalIp: string) => Promise<{ success: boolean; referenceId: string; msg: string }>;
  checkLicense: () => Promise<{ success: boolean; hardwareId: string; licenseKey?: string; msg?: string }>;
  activateLicense: (payload: { licenseKey: string; contactName: string; contactPhone: string; contactEmail: string }) => Promise<{ success: boolean; msg: string }>;
  onUpdaterAvailable: (callback: (info: any) => void) => void;
  onUpdaterProgress: (callback: (percent: number) => void) => void;
  onUpdaterDownloaded: (callback: (info: any) => void) => void;
  quitAndInstallUpdate: () => Promise<void>;
  getPaymentSettings: () => Promise<{ vpa_id: string; merchant_name: string; enable_dynamic_upi: number } | null>;
  savePaymentSettings: (vpaId: string, merchantName: string, enableDynamicUpi: number) => Promise<{ success: boolean }>;
  getUPIQRPreview: (amount: number, orderNumber: string) => Promise<{ success: boolean; upiUri: string; qrDataUrl: string; msg?: string }>;
  addMenuItem: (name: string, price: number, categoryId: string, code: string) => Promise<{ success: boolean; id: string }>;
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
  const [ingredients, setIngredients] = useState<SQLiteIngredient[]>([]);
  const [activeShift, setActiveShift] = useState<SQLiteShift | null>(null);

  // Cart & POS UI States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pos' | 'tables' | 'kds' | 'business' | 'orders' | 'sync'>('pos');
  
  // Custom inputs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [codeQuery, setCodeQuery] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  
  // Shift controls inputs
  const [openingCashierName, setOpeningCashierName] = useState<string>('');
  const [openingCashBalance, setOpeningCashBalance] = useState<number>(1000);
  const [actualCashDrawer, setActualCashDrawer] = useState<number>(0);
  const [zReportText, setZReportText] = useState<string>('');
  const [showZReportModal, setShowZReportModal] = useState<boolean>(false);

  // EDC Payment Card Reader configurations
  const [terminalIp, setTerminalIp] = useState<string>('');
  const [isPushingEDC, setIsPushingEDC] = useState<boolean>(false);
  const [edcProgressMsg, setEdcProgressMsg] = useState<string>('');

  // Licensing States
  const [isLicensed, setIsLicensed] = useState<boolean>(true);
  const [licenseChecking, setLicenseChecking] = useState<boolean>(true);
  const [hwId, setHwId] = useState<string>('');
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [activationError, setActivationError] = useState<string>('');
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [contactNameInput, setContactNameInput] = useState<string>('');
  const [contactPhoneInput, setContactPhoneInput] = useState<string>('');
  const [contactEmailInput, setContactEmailInput] = useState<string>('');

  // Auto-Updater States
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  // Payment Settings & Live UPI Preview States
  const [upiSettingsVpa, setUpiSettingsVpa] = useState<string>('tathastopos@okaxis');
  const [upiSettingsName, setUpiSettingsName] = useState<string>('TathAstu Restaurant');
  const [upiSettingsEnabled, setUpiSettingsEnabled] = useState<boolean>(true);

  // Live Checkout UPI QR preview modal states
  const [showUpiCheckoutModal, setShowUpiCheckoutModal] = useState<boolean>(false);
  const [checkoutUpiQrDataUrl, setCheckoutUpiQrDataUrl] = useState<string>('');
  const [checkoutUpiIntent, setCheckoutUpiIntent] = useState<string>('');
  const [checkoutOrderNumber, setCheckoutOrderNumber] = useState<string>('');
  const [checkoutOrderId, setCheckoutOrderId] = useState<string>('');

  // Add Dish state hooks
  const [newDishName, setNewDishName] = useState<string>('');
  const [newDishPrice, setNewDishPrice] = useState<number | ''>('');
  const [newDishCode, setNewDishCode] = useState<string>('');
  const [newDishCategory, setNewDishCategory] = useState<string>('');
  const [isAddingDish, setIsAddingDish] = useState<boolean>(false);

  const handleAddDishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDishName.trim() || newDishPrice === '' || !newDishCode.trim()) {
      alert('Please fill out all fields.');
      return;
    }
    
    setIsAddingDish(true);
    try {
      const res = await window.electronAPI.addMenuItem(
        newDishName.trim(),
        Number(newDishPrice),
        newDishCategory,
        newDishCode.trim()
      );
      if (res.success) {
        alert(`Dish "${newDishName}" added successfully locally and queued for cloud sync!`);
        setNewDishName('');
        setNewDishPrice('');
        setNewDishCode('');
        await refreshData();
      } else {
        alert('Failed to save menu item.');
      }
    } catch (err) {
      console.error(err);
      alert('Error adding menu item.');
    } finally {
      setIsAddingDish(false);
    }
  };


  // Modifiers
  const [modifierItem, setModifierItem] = useState<SQLiteItem | null>(null);
  const [isModifierOpen, setIsModifierOpen] = useState<boolean>(false);

  // Hardware/Printing Config States
  const [printerType, setPrinterType] = useState<'MOCK' | 'TCP'>('MOCK');
  const [printerAddress, setPrinterAddress] = useState<string>('192.168.1.100');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printPreview, setPrintPreview] = useState<string>('');
  const [kotPreview, setKotPreview] = useState<string>('');
  const [printModalTab, setPrintModalTab] = useState<'bill' | 'kot'>('bill');

  // Sync Engine & Real-time KDS States
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCloudOnline, setIsCloudOnline] = useState<boolean>(false);
  const [kdsTickets, setKdsTickets] = useState<KDSTicket[]>([]);

  // Focus ref for code search box (F4 shortcut)
  const codeSearchRef = useRef<HTMLInputElement>(null);

  // Load data from SQLite on mount
  const refreshData = async () => {
    try {
      const api = window.electronAPI;
      const [tList, cList, iList, oList, qList, ingList, shiftData, paySettings] = await Promise.all([
        api.getTables(),
        api.getCategories(),
        api.getItems(),
        api.getOrders(),
        api.getSyncQueue(),
        api.getIngredients(),
        api.getActiveShift(),
        api.getPaymentSettings()
      ]);
      setTables(tList);
      setCategories(cList);
      setItems(iList);
      setOrders(oList);
      setSyncQueue(qList);
      setIngredients(ingList);
      setActiveShift(shiftData);
      if (cList.length > 0 && !newDishCategory) {
        setNewDishCategory(cList[0].id);
      }
      if (paySettings) {
        setUpiSettingsVpa(paySettings.vpa_id);
        setUpiSettingsName(paySettings.merchant_name);
        setUpiSettingsEnabled(paySettings.enable_dynamic_upi === 1);
      }
      if (shiftData) {
        setActualCashDrawer(shiftData.opening_balance + shiftData.total_cash_sales);
      }
    } catch (e) {
      console.error('Error fetching SQLite data:', e);
    }
  };

  const checkLicenseLock = async () => {
    try {
      const res = await window.electronAPI.checkLicense();
      setHwId(res.hardwareId);
      if (res.success) {
        setIsLicensed(true);
      } else {
        setIsLicensed(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLicenseChecking(false);
    }
  };

  useEffect(() => {
    checkLicenseLock();
    refreshData();

    // Check license status every 20 seconds for real-time remote deactivation/suspension
    const licenseInterval = setInterval(() => {
      checkLicenseLock();
    }, 20000);

    const api = window.electronAPI;
    if (api && api.onUpdaterAvailable) {
      api.onUpdaterAvailable((info: any) => {
        setUpdateInfo(info);
        setUpdateAvailable(true);
      });
      api.onUpdaterProgress((percent: number) => {
        setUpdateProgress(Math.round(percent));
      });
      api.onUpdaterDownloaded(() => {
        setUpdateDownloaded(true);
      });
    }

    return () => {
      clearInterval(licenseInterval);
    };
  }, []);

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;
    if (!contactNameInput.trim() || !contactPhoneInput.trim()) {
      setActivationError('Please fill out all required contact fields.');
      return;
    }
    
    setIsActivating(true);
    setActivationError('');
    try {
      const res = await window.electronAPI.activateLicense({
        licenseKey: licenseKeyInput.trim(),
        contactName: contactNameInput.trim(),
        contactPhone: contactPhoneInput.trim(),
        contactEmail: contactEmailInput.trim()
      });
      if (res.success) {
        setIsLicensed(true);
        alert('Software successfully licensed and unlocked!');
        await refreshData();
      } else {
        setActivationError(res.msg || 'Activation failed.');
      }
    } catch (err) {
      setActivationError('Connection error to activation servers.');
    } finally {
      setIsActivating(false);
    }
  };

  // Connect to Socket.io for KDS and live connection status updates
  useEffect(() => {
    const socket = io('http://localhost:4000', {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      setIsCloudOnline(true);
      console.log('[KDS Socket] Connected to central cloud sync server.');
    });

    socket.on('disconnect', () => {
      setIsCloudOnline(false);
      console.log('[KDS Socket] Disconnected from central cloud sync server.');
    });

    socket.on('connect_error', () => {
      setIsCloudOnline(false);
    });

    socket.on('kot:new', (ticket: KDSTicket) => {
      console.log('[KDS Socket] Received new Kitchen ticket:', ticket);
      setKdsTickets(prev => {
        if (prev.some(t => t.id === ticket.id)) return prev;
        return [...prev, ticket];
      });
    });

    socket.on('order:updated', (payload: any) => {
      console.log('[KDS Socket] Received live order update:', payload);
      refreshData();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Keyboard shortcut listener (F1 - F12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          setSelectedTable('');
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
  }, [cart, selectedTable, customerName, customerPhone, discount, syncQueue, printerType, printerAddress, activeShift]);

  // Cart operations
  const handleItemClick = (item: SQLiteItem) => {
    setModifierItem(item);
    setIsModifierOpen(true);
  };

  const addCustomizedItemToCart = (selection: ModifierSelection) => {
    if (!modifierItem) return;

    const extrasPrice = selection.extras.reduce((sum, e) => sum + e.price, 0);
    const combinedPrice = modifierItem.price + extrasPrice;
    
    const modifierText = selection.extras.length > 0 
      ? selection.extras.map(e => e.name).join(', ')
      : '';
    const customizationName = `${modifierItem.name} (${selection.spiceLevel})${modifierText ? ` + [${modifierText}]` : ''}`;
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
  const cgst = discountedSubtotal * 0.025;
  const sgst = discountedSubtotal * 0.025;
  const cartTotal = discountedSubtotal + cgst + sgst;

  // Push payment intent to local EDC card reader terminal
  const handleEDCPush = async () => {
    if (cart.length === 0) return;
    if (!activeShift) {
      alert('Error: Please start a cashier shift in the Business tab before billing orders.');
      setActiveTab('business');
      return;
    }

    const { orderId, orderNumber } = await window.electronAPI.getNextIdentifiers();
    setIsPushingEDC(true);
    setEdcProgressMsg('Sending transaction parameters to terminal reader...');

    try {
      const res = await window.electronAPI.pushPaymentTerminal(cartTotal, orderNumber, terminalIp);
      if (res.success) {
        setEdcProgressMsg('Authorization approved! Saving transaction to database...');
        await new Promise(resolve => setTimeout(resolve, 800));
        await executeFinalCheckout('CARD', orderId, orderNumber);
      } else {
        alert(`Payment declined: ${res.msg || 'Transaction rejected by card machine.'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Payment Terminal interface communication failure.');
    } finally {
      setIsPushingEDC(false);
    }
  };

  const handleCheckout = async (paymentMethod: 'CASH' | 'UPI' | 'CARD') => {
    if (cart.length === 0) return;
    if (!activeShift) {
      alert('Error: Please start a cashier shift in the Business tab before billing orders.');
      setActiveTab('business');
      return;
    }
    const { orderId, orderNumber } = await window.electronAPI.getNextIdentifiers();

    if (paymentMethod === 'UPI' && upiSettingsEnabled) {
      try {
        const preview = await window.electronAPI.getUPIQRPreview(cartTotal, orderNumber);
        if (preview.success) {
          setCheckoutUpiQrDataUrl(preview.qrDataUrl);
          setCheckoutUpiIntent(preview.upiUri);
          setCheckoutOrderNumber(orderNumber);
          setCheckoutOrderId(orderId);
          setShowUpiCheckoutModal(true);
          return;
        }
      } catch (err) {
        console.error('[UPI Intent Checkout] Failed to fetch QR preview, falling back:', err);
      }
    }

    await executeFinalCheckout(paymentMethod, orderId, orderNumber);
  };

  const executeFinalCheckout = async (paymentMethod: 'CASH' | 'UPI' | 'CARD', orderId: string, orderNumber: string) => {
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
      // 1. Save order to local SQLite
      await window.electronAPI.saveOrder(orderPayload);

      // 2. Trigger silent prints (print KOT and customer bill receipt)
      const printConfig = { type: printerType, address: printerAddress };
      const billPrint = await window.electronAPI.printBill(orderPayload, printConfig);
      const kotPrint = await window.electronAPI.printKOT(orderPayload, printConfig);

      // Save preview text for Virtual Printer modal
      setPrintPreview(billPrint.preview || '');
      setKotPreview(kotPrint.preview || '');
      
      // Clear cart inputs
      setCart([]);
      setSelectedTable('');
      setCustomerName('');
      setCustomerPhone('');
      setDiscount(0);
      
      await refreshData();
      
      // Show virtual receipt overlay
      setShowPrintModal(true);
      
    } catch (e) {
      console.error(e);
      alert('Checkout transaction or printing failed.');
    }
  };

  // Shift control operations
  const handleStartShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingCashierName.trim()) {
      alert('Please enter cashier name.');
      return;
    }
    try {
      const shift = await window.electronAPI.startShift(openingCashierName, openingCashBalance);
      setActiveShift(shift);
      setActualCashDrawer(shift.opening_balance);
      setOpeningCashierName('');
      alert(`Shift started for cashier: ${shift.cashier_name}`);
      await refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEndShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    if (!confirm('Are you sure you want to end this shift and close the cash drawer? This will generate the Z-Report.')) return;

    try {
      const res = await window.electronAPI.endShift(activeShift.id, actualCashDrawer);
      if (res) {
        setZReportText(res.reportText);
        setShowZReportModal(true);
        setActiveShift(null);
        await refreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync Queue worker manual trigger
  const triggerManualSync = async () => {
    setIsSyncing(true);
    try {
      const updatedQueue = await window.electronAPI.triggerSync();
      setSyncQueue(updatedQueue);
      await refreshData();
      alert('Manual synchronization completed. Local database updated.');
    } catch (e) {
      console.error(e);
      alert('Sync server connection unavailable.');
    } finally {
      setIsSyncing(false);
    }
  };

  // KDS Action completed
  const handleKDSComplete = (id: string) => {
    setKdsTickets(prev => prev.filter(t => t.id !== id));
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.code.includes(searchQuery) ||
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  if (licenseChecking) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-4">Verifying system license...</p>
      </div>
    );
  }

  if (!isLicensed) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-white p-6 relative overflow-hidden select-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"></div>

        <div className="bg-gray-900/40 border border-gray-800/80 backdrop-blur-xl p-10 rounded-3xl w-full max-w-md text-center shadow-2xl relative z-10 space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-600 to-orange-400 flex items-center justify-center font-black text-3xl shadow-lg shadow-orange-500/20 text-white mx-auto">
            T
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-white uppercase">Activation Required</h2>
            <p className="text-[11px] text-gray-400 font-semibold leading-relaxed mt-1">
              This TathAstu POS workstation installation is locked. Please enter your License Activation Key to register this device.
            </p>
          </div>

          <div className="bg-gray-950/80 p-4 rounded-xl border border-gray-800/50 font-mono text-left">
            <span className="text-[9px] font-black text-gray-500 block uppercase tracking-wider">Device Hardware Fingerprint</span>
            <span className="text-xs font-bold text-orange-400 break-all select-all block mt-0.5">{hwId}</span>
          </div>

          <form onSubmit={handleActivateLicense} className="space-y-3.5">
            <div className="text-left">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">License Activation Key</label>
              <input
                type="text"
                required
                placeholder="e.g. TATHASTU-PRO-INSTALL-101"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs font-bold tracking-widest text-center text-white focus:outline-none focus:border-orange-500 uppercase transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Contact Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={contactNameInput}
                  onChange={e => setContactNameInput(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-orange-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Contact Phone</label>
                <input
                  type="text"
                  required
                  placeholder="+91 98765 43210"
                  value={contactPhoneInput}
                  onChange={e => setContactPhoneInput(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            <div className="text-left">
              <label className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">Contact Email (Optional)</label>
              <input
                type="email"
                placeholder="john@example.com"
                value={contactEmailInput}
                onChange={e => setContactEmailInput(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-orange-500 transition-all"
              />
            </div>

            {activationError && (
              <p className="text-[10px] text-red-500 font-bold bg-red-950/30 border border-red-900/50 p-2.5 rounded-lg animate-pulse">
                ⚠ {activationError}
              </p>
            )}

            <button
              type="submit"
              disabled={isActivating}
              className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-800 text-white text-xs font-black uppercase rounded-xl transition-all shadow-lg shadow-orange-500/10"
            >
              {isActivating ? 'Registering Device...' : 'Activate Installation'}
            </button>
          </form>
          
          <p className="text-[9px] text-gray-500 font-bold">TathAstu REST POS System. All rights reserved.</p>
        </div>
      </div>
    );
  }

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
              onClick={() => setActiveTab('kds')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all relative ${
                activeTab === 'kds' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">🍳</span>
              <span className="text-[9px] font-bold">KDS Screen</span>
              {kdsTickets.length > 0 && (
                <span className="absolute top-1 right-2 w-5 h-5 rounded-full bg-orange-600 text-[10px] text-white flex items-center justify-center font-bold border-2 border-gray-955 animate-pulse">
                  {kdsTickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all relative ${
                activeTab === 'business' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:bg-gray-900 hover:text-white'
              }`}
            >
              <span className="text-xl">📊</span>
              <span className="text-[9px] font-bold">Business</span>
              {ingredients.some(i => i.stock_qty < 200) && (
                <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
              )}
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
              {activeShift ? `Active Cashier: ${activeShift.cashier_name}` : 'Shift Closed'}
            </div>
          </div>

          {/* Cloud Sync Status Indicator */}
          <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
            <span className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isCloudOnline ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {isCloudOnline ? 'Cloud Sync: Connected' : 'Cloud Sync: Offline (Local)'}
            </span>
            {syncQueue.length > 0 && (
              <button
                onClick={triggerManualSync}
                disabled={isSyncing}
                className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black rounded-lg transition-all shadow-md shadow-orange-500/10"
              >
                {isSyncing ? 'Syncing...' : `Pending Sync: ${syncQueue.length} (F12)`}
              </button>
            )}
          </div>
        </header>

        {/* Auto-Updater Notification Banner */}
        {updateAvailable && (
          <div className="bg-gradient-to-r from-orange-600 to-red-650 text-white px-8 py-3 flex items-center justify-between shadow-md shrink-0 relative z-25">
            <div className="flex items-center gap-3">
              <span className="text-lg">🚀</span>
              <div className="text-xs font-bold leading-normal">
                {updateDownloaded ? (
                  <span>A new software update is ready! Please restart the POS to apply.</span>
                ) : (
                  <span>
                    Downloading update v{updateInfo?.version || 'new'} in background... 
                    <span className="ml-1 text-orange-200 font-extrabold">({updateProgress}%)</span>
                  </span>
                )}
              </div>
            </div>
            {updateDownloaded && (
              <button
                onClick={() => window.electronAPI.quitAndInstallUpdate()}
                className="px-4 py-1.5 bg-white text-orange-700 hover:bg-orange-50 font-black text-[10px] rounded-lg shadow-sm transition-all"
              >
                Install & Restart POS
              </button>
            )}
          </div>
        )}

        {/* Tab view contents */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* 1. POS Tab View */}
          {activeTab === 'pos' && (
            <>
              {/* Menu and Search panel */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
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
                        className="py-2.5 bg-gray-500 hover:bg-gray-650 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase transition-colors"
                      >
                        💳 Card [F10]
                      </button>
                    </div>
                    
                    {/* EDC push card machine */}
                    <button
                      onClick={handleEDCPush}
                      disabled={cart.length === 0}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-705 disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md shadow-purple-500/10"
                    >
                      📲 Send to EDC Card Machine
                    </button>
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
                  setActiveTab('pos');
                }}
              />
            </div>
          )}

          {/* 3. Kitchen Display System (KDS) Screen */}
          {activeTab === 'kds' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-xl font-extrabold text-gray-800">Kitchen Display System (KDS)</h3>
                <p className="text-xs text-gray-400 mt-1">Live order tickets received in real-time from active checkout terminals.</p>
              </div>

              {kdsTickets.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-gray-300 gap-2 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                  <span className="text-4xl animate-bounce">🍳</span>
                  <span className="text-xs font-bold">Kitchen queue is currently empty.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {kdsTickets.map(ticket => {
                    const elapsedMins = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000);
                    return (
                      <div
                        key={ticket.id}
                        className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden shadow-sm flex flex-col justify-between"
                      >
                        <div className="p-4 bg-orange-50/50 border-b border-orange-100 flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-orange-600 block">
                              {ticket.tableNumber ? `TABLE ${ticket.tableNumber}` : 'TAKEAWAY'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">{ticket.orderNumber}</span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            elapsedMins > 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-orange-500 text-white'
                          }`}>
                            {elapsedMins}m ago
                          </span>
                        </div>

                        <div className="p-5 flex-1 space-y-3">
                          {ticket.items.map(item => (
                            <div key={item.id} className="text-xs font-medium text-gray-700">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-orange-600">{item.quantity}x</span>
                                <span className="font-bold text-gray-800">{item.name}</span>
                              </div>
                              {item.notes && (
                                <p className="text-[10px] text-gray-400 font-semibold pl-6 mt-0.5 italic">
                                  * Note: {item.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                          <button
                            onClick={() => handleKDSComplete(ticket.id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm hover:scale-[1.02] active:scale-95 transition-all"
                          >
                            Mark Prepared ✓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. Business Tab */}
          {activeTab === 'business' && (
            <div className="flex-1 p-8 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Shift Management panel */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-800">Cashier Shifts</h3>
                  <p className="text-xs text-gray-400 mt-1">Manage drawer accountability, audit opening floats, and close shifts.</p>
                </div>

                {!activeShift ? (
                  <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🔒</span>
                      <span className="font-extrabold text-gray-800 text-sm">Register Closed</span>
                    </div>
                    
                    <form onSubmit={handleStartShiftSubmit} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block">Cashier Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. John Doe"
                          value={openingCashierName}
                          onChange={e => setOpeningCashierName(e.target.value)}
                          className="w-full mt-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block">Opening Cash Balance (Float)</label>
                        <input
                          type="number"
                          required
                          value={openingCashBalance}
                          onChange={e => setOpeningCashBalance(parseFloat(e.target.value) || 0)}
                          className="w-full mt-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-orange-500/10"
                      >
                        Open Cash Drawer & Start Shift
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-wide">
                          Shift Active
                        </span>
                        <h4 className="font-extrabold text-gray-800 text-sm mt-1">{activeShift.cashier_name}</h4>
                        <span className="text-[10px] text-gray-400 font-bold block mt-0.5">
                          Started: {new Date(activeShift.opening_time).toLocaleString()}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-gray-400 font-bold">{activeShift.id.slice(0, 12)}</span>
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <span className="text-[9px] text-gray-400 uppercase block">Opening Cash Float</span>
                          <span className="text-sm font-extrabold text-gray-700">₹{activeShift.opening_balance.toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <span className="text-[9px] text-gray-400 uppercase block">Cash Sales</span>
                          <span className="text-sm font-extrabold text-green-600">₹{activeShift.total_cash_sales.toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <span className="text-[9px] text-gray-400 uppercase block">UPI Sales</span>
                          <span className="text-sm font-extrabold text-blue-600">₹{activeShift.total_upi_sales.toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <span className="text-[9px] text-gray-400 uppercase block">Card Sales</span>
                          <span className="text-sm font-extrabold text-purple-600">₹{activeShift.total_card_sales.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="border-t border-dashed border-gray-200 pt-4 flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">Expected Drawer Cash</span>
                          <span className="text-xs text-gray-400 font-semibold">(Float + Cash Sales)</span>
                        </div>
                        <span className="text-xl font-black text-gray-800">
                          ₹{(activeShift.opening_balance + activeShift.total_cash_sales).toFixed(2)}
                        </span>
                      </div>

                      <form onSubmit={handleEndShiftSubmit} className="pt-4 border-t border-gray-100 space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase block">Actual Drawer Cash Counted</label>
                          <input
                            type="number"
                            required
                            value={actualCashDrawer}
                            onChange={e => setActualCashDrawer(parseFloat(e.target.value) || 0)}
                            className="w-full mt-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-red-500/10"
                        >
                          Perform Audit & End Shift
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Raw ingredients BOM Inventory stock panel */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-800">BOM Inventory Stocks</h3>
                  <p className="text-xs text-gray-400 mt-1">Real-time raw ingredient tracking. Stock decrements automatically on order checkout.</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                        <th className="p-4">Ingredient</th>
                        <th className="p-4 text-right">Available Stock</th>
                        <th className="p-4">Unit</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map(ing => {
                        const isLow = ing.stock_qty < 200;
                        return (
                          <tr key={ing.id} className="border-b border-gray-100 font-medium hover:bg-gray-50">
                            <td className="p-4 font-bold text-gray-700">{ing.name}</td>
                            <td className={`p-4 text-right font-black ${isLow ? 'text-red-500 font-black' : 'text-gray-800'}`}>
                              {ing.stock_qty.toFixed(2)}
                            </td>
                            <td className="p-4 text-xs font-bold text-gray-400">{ing.unit}</td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                                isLow ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-green-50 text-green-700 border-green-200'
                              }`}>
                                {isLow ? 'LOW STOCK' : 'ADEQUATE'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* 5. Orders History tab */}
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

          {/* 6. Sync status log tab */}
          {activeTab === 'sync' && (
            <div className="flex-1 p-8 overflow-y-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-800">Synchronize Database</h3>
                  <p className="text-xs text-gray-400 mt-1">Pending sync queue records saved in SQLite for offline recovery.</p>
                </div>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing}
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
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.status === 'SYNCED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-750 animate-pulse'
                            }`}>
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

      {/* Settings Dialog / Config Overlay embedded in Sync tab */}
      {activeTab === 'sync' && (
        <div className="w-80 bg-white border-l border-gray-200 p-6 shrink-0 space-y-6 overflow-y-auto">
          <h3 className="font-extrabold text-gray-800 text-sm">Hardware Configuration</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Thermal Printer Mode</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setPrinterType('MOCK')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                    printerType === 'MOCK' ? 'bg-orange-500 border-orange-500 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  Mock Simulator
                </button>
                <button
                  onClick={() => setPrinterType('TCP')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                    printerType === 'TCP' ? 'bg-orange-500 border-orange-500 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  Network Printer
                </button>
              </div>
            </div>

            {printerType === 'TCP' && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Printer IP Address</label>
                <input
                  type="text"
                  value={printerAddress}
                  onChange={e => setPrinterAddress(e.target.value)}
                  placeholder="192.168.1.100"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                />
              </div>
            )}

            {/* EDC Card terminal IP setup */}
            <div className="pt-4 border-t border-gray-100">
              <label className="text-[10px] font-bold text-gray-400 uppercase">EDC Card Machine IP</label>
              <input
                type="text"
                value={terminalIp}
                onChange={e => setTerminalIp(e.target.value)}
                placeholder="e.g. 192.168.1.150 (Empty for Mock)"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
              />
              <span className="text-[9px] text-gray-400 font-semibold block mt-1">Leaves empty to run card payment terminal simulator.</span>
            </div>

            {/* Dynamic UPI Settings */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Enable Dynamic UPI QR</label>
                <input
                  type="checkbox"
                  checked={upiSettingsEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setUpiSettingsEnabled(checked);
                    await window.electronAPI.savePaymentSettings(upiSettingsVpa, upiSettingsName, checked ? 1 : 0);
                  }}
                  className="rounded text-orange-500 focus:ring-orange-500 h-4 w-4"
                />
              </div>

              {upiSettingsEnabled && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block">Merchant UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={upiSettingsVpa}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setUpiSettingsVpa(val);
                        await window.electronAPI.savePaymentSettings(val, upiSettingsName, upiSettingsEnabled ? 1 : 0);
                      }}
                      placeholder="e.g. restaurant@upi"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block">Merchant Store Name</label>
                    <input
                      type="text"
                      value={upiSettingsName}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setUpiSettingsName(val);
                        await window.electronAPI.savePaymentSettings(upiSettingsVpa, val, upiSettingsEnabled ? 1 : 0);
                      }}
                      placeholder="e.g. TathAstu Restaurant"
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Add New Dish (Catalog Management) */}
            <form onSubmit={handleAddDishSubmit} className="pt-4 border-t border-gray-100 space-y-3 text-left">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block">Add New Dish</label>
              
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase block">Dish Name</label>
                <input
                  type="text"
                  required
                  value={newDishName}
                  onChange={e => setNewDishName(e.target.value)}
                  placeholder="e.g. Paneer Tikka Masala"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase block">Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={newDishPrice}
                    onChange={e => setNewDishPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="250"
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase block">Code (unique)</label>
                  <input
                    type="text"
                    required
                    value={newDishCode}
                    onChange={e => setNewDishCode(e.target.value)}
                    placeholder="108"
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase block">Category</label>
                <select
                  value={newDishCategory}
                  onChange={e => setNewDishCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 bg-white rounded-lg text-xs font-bold focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isAddingDish}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white text-xs font-black uppercase rounded-lg transition-all shadow-md shadow-orange-500/10 cursor-pointer"
              >
                {isAddingDish ? 'Adding...' : 'Add to Menu Grid'}
              </button>
            </form>
          </div>
          
          <div className="pt-6 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <span className="font-bold text-gray-500 block mb-2">Thermal Print Logs Location:</span>
            <p className="font-mono text-[10px] bg-gray-50 p-2 rounded break-all select-all">
              %appdata%/desktop-pos/
            </p>
          </div>
        </div>
      )}

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

      {/* Virtual Thermal Printer Simulator Screen Overlay */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col h-[600px] border border-gray-100">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-gray-800 text-lg">Virtual Thermal Printer Output</h3>
                <p className="text-xs text-gray-400 mt-0.5">Written silently to local log files in mock mode.</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 font-bold flex items-center justify-center transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-gray-100 shrink-0 bg-white px-6">
              <button
                onClick={() => setPrintModalTab('bill')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  printModalTab === 'bill' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                📄 Customer Receipt (.log)
              </button>
              <button
                onClick={() => setPrintModalTab('kot')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  printModalTab === 'kot' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                🍳 Kitchen KOT (.log)
              </button>
            </div>

            <div className="flex-1 p-6 bg-gray-900 overflow-y-auto flex justify-center">
              <pre className="font-mono text-[11px] text-green-400 text-left bg-gray-950 p-6 rounded-xl border border-gray-800 overflow-x-auto whitespace-pre h-fit w-96 leading-relaxed shadow-inner">
                {printModalTab === 'bill' ? printPreview : kotPreview}
              </pre>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Close Output [Esc]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Z-Report Simulator Popup modal */}
      {showZReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col h-[550px] border border-gray-100">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-gray-800 text-lg">Cashier Shift Closed</h3>
                <p className="text-xs text-gray-400 mt-0.5">Z-Report printed and stored in local log directory.</p>
              </div>
              <button
                onClick={() => setShowZReportModal(false)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 font-bold flex items-center justify-center transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-6 bg-gray-900 overflow-y-auto flex justify-center">
              <pre className="font-mono text-[11px] text-green-400 text-left bg-gray-950 p-6 rounded-xl border border-gray-800 overflow-x-auto whitespace-pre h-fit w-96 leading-relaxed shadow-inner">
                {zReportText}
              </pre>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
              <button
                onClick={() => setShowZReportModal(false)}
                className="px-6 py-2.5 bg-gray-950 hover:bg-gray-900 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Dismiss & Open Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDC PUSH FULL-SCREEN OVERLAY DIALOG SPINNER */}
      {isPushingEDC && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md text-white p-6">
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl w-full max-w-md text-center space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl"></div>
            
            <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mx-auto"></div>
            
            <h3 className="text-lg font-black tracking-tight text-white uppercase">EDC Terminal Push</h3>
            <p className="text-xs text-gray-400 font-semibold leading-relaxed">
              Sending <span className="text-purple-400 font-extrabold text-sm">₹{cartTotal.toFixed(2)}</span> to card reader terminal <br/>
              <span className="text-[10px] text-gray-500">({terminalIp ? `IP: ${terminalIp}` : 'Mock Simulator Mode'})</span>
            </p>
            
            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 font-mono text-[10px] text-purple-400 uppercase tracking-widest animate-pulse">
              {edcProgressMsg}
            </div>
            
            <p className="text-[10px] text-gray-500">Please tap, swipe or insert card on the reader device.</p>
          </div>
        </div>
      )}

      {/* Checkout UPI QR Code Modal */}
      {showUpiCheckoutModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 select-none animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 flex flex-col p-6 space-y-6 relative">
            <div className="text-center">
              <span className="text-3xl">📱</span>
              <h3 className="text-lg font-black tracking-tight text-gray-800 uppercase mt-2">Dynamic UPI QR</h3>
              <p className="text-[10px] text-gray-500 font-semibold mt-1">Scan this code using any UPI payment app to charge the client.</p>
            </div>

            {/* QR Code Graphic Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-100 relative">
              {checkoutUpiQrDataUrl ? (
                <img src={checkoutUpiQrDataUrl} alt="UPI Payment QR Code" className="w-48 h-48 object-contain rounded-xl shadow-sm" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-[10px] font-bold text-gray-400">Loading QR Code...</div>
              )}
              <div className="mt-3 text-[10px] font-extrabold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full uppercase tracking-wider">
                Amount: ₹{cartTotal.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2 text-left bg-gray-50 p-4 rounded-xl border border-gray-150 font-mono text-[10px]">
              <div className="flex justify-between"><span className="text-gray-400">Order Ref:</span><span className="font-bold text-gray-850">{checkoutOrderNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Merchant VPA:</span><span className="font-bold text-gray-850">{upiSettingsVpa}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Intent URL:</span><span className="font-bold text-gray-850 truncate max-w-[180px]">{checkoutUpiIntent}</span></div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowUpiCheckoutModal(false)}
                className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 text-xs font-black uppercase rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowUpiCheckoutModal(false);
                  await executeFinalCheckout('UPI', checkoutOrderId, checkoutOrderNumber);
                }}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md shadow-orange-500/20"
              >
                Payment Received
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
