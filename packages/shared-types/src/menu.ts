export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  imageUrl?: string;
  isAvailable: boolean;
  taxRate: number; // e.g., 0.05 for 5% tax
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateMenuItemInput {
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  imageUrl?: string;
  isAvailable?: boolean;
  taxRate?: number;
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string;
  price?: number;
  categoryId?: string;
  imageUrl?: string;
  isAvailable?: boolean;
  taxRate?: number;
}
