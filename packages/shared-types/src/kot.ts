export type KOTStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export interface KOTItem {
  id: string;
  kotId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  notes?: string;
  status: KOTStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface KOT {
  id: string;
  orderId: string;
  kotNumber: string; // readable ticket number e.g., KOT-101
  tableNumber?: string;
  status: KOTStatus;
  items: KOTItem[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateKOTItemInput {
  menuItemId: string;
  name: string;
  quantity: number;
  notes?: string;
}

export interface CreateKOTInput {
  orderId: string;
  tableNumber?: string;
  items: CreateKOTItemInput[];
}

export interface UpdateKOTStatusInput {
  status: KOTStatus;
}

export interface UpdateKOTItemStatusInput {
  itemId: string;
  status: KOTStatus;
}
