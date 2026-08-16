export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type OrderSource = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIALLY_PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'OTHER';

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string; // snapshot at time of order
  price: number; // snapshot at time of order
  quantity: number;
  notes?: string;
  kotId?: string; // Links item to its Kitchen Order Ticket
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Order {
  id: string;
  orderNumber: string; // readable identifier e.g., ORD-20260816-001
  tableNumber?: string; // required for DINE_IN
  customerName?: string;
  customerPhone?: string;
  status: OrderStatus;
  source: OrderSource;
  subTotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  items: OrderItem[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateOrderItemInput {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  source: OrderSource;
  subTotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  items: CreateOrderItemInput[];
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
}
