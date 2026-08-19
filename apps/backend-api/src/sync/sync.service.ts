import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SyncGateway } from './sync.gateway.js';

@Injectable()
export class SyncService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async onModuleInit() {
    await this.seedCentralDatabase();
  }

  // Ensure central PostgreSQL has categories and menu items seeded so downstream pull functions correctly
  private async seedCentralDatabase() {
    try {
      const catCount = await this.prisma.category.count();
      if (catCount === 0) {
        console.log('[Central Database] Seeding mock catalog for sync...');
        await this.prisma.$transaction(async (tx) => {
          const c1 = await tx.category.create({
            data: { id: 'c1', name: 'Appetizers', description: 'Starters and quick bites', isActive: true }
          });
          const c2 = await tx.category.create({
            data: { id: 'c2', name: 'Main Course', description: 'Filling entrees', isActive: true }
          });
          const c3 = await tx.category.create({
            data: { id: 'c3', name: 'Beverages', description: 'Refreshing beverages', isActive: true }
          });

          await tx.menuItem.createMany({
            data: [
              { id: 'i1', name: 'Garlic Bread', description: 'Garlic butter toasted baguette slices', price: 120.0, categoryId: 'c1', isAvailable: true, taxRate: 0.05 },
              { id: 'i2', name: 'Stuffed Mushrooms', description: 'Stuffed with cheese and herbs', price: 160.0, categoryId: 'c1', isAvailable: true, taxRate: 0.05 },
              { id: 'i3', name: 'Paneer Butter Masala', description: 'Paneer cubes in creamy tomato butter sauce', price: 280.0, categoryId: 'c2', isAvailable: true, taxRate: 0.05 },
              { id: 'i4', name: 'Chicken Tikka Masala', description: 'Grilled chicken chunks in spiced tikka gravy', price: 340.0, categoryId: 'c2', isAvailable: true, taxRate: 0.05 },
              { id: 'i5', name: 'Dal Makhani', description: 'Slow cooked black lentils with cream', price: 220.0, categoryId: 'c2', isAvailable: true, taxRate: 0.05 },
              { id: 'i6', name: 'Fresh Lime Soda', description: 'Salted or sweet lime soda', price: 70.0, categoryId: 'c3', isAvailable: true, taxRate: 0.05 },
              { id: 'i7', name: 'Cold Brew Coffee', description: 'Slow dripped smooth black coffee', price: 110.0, categoryId: 'c3', isAvailable: true, taxRate: 0.05 }
            ]
          });
        });
        console.log('[Central Database] Mock catalog seeded successfully.');
      }
    } catch (e) {
      console.error('Failed to seed central database (PostgreSQL container may be offline):', e.message);
    }
  }

  async pushSyncBatch(payloads: any[]) {
    const succeededIds: string[] = [];

    for (const item of payloads) {
      try {
        if (item.entity_type === 'ORDER') {
          const orderData = JSON.parse(item.payload);
          
          // Check if order already exists in central database
          const existing = await this.prisma.order.findUnique({
            where: { orderNumber: orderData.order_number }
          });

          if (!existing) {
            // Write to central PostgreSQL database
            const savedOrder = await this.prisma.order.create({
              data: {
                id: orderData.id,
                orderNumber: orderData.order_number,
                tableNumber: orderData.tableNumber,
                customerName: orderData.customerName,
                customerPhone: orderData.customerPhone,
                status: orderData.status,
                source: orderData.source,
                subTotal: orderData.subTotal,
                tax: orderData.tax,
                discount: orderData.discount,
                total: orderData.total,
                paymentStatus: orderData.paymentStatus,
                paymentMethod: orderData.paymentMethod,
                createdAt: new Date(orderData.createdAt),
                updatedAt: new Date(orderData.updatedAt),
                items: {
                  create: orderData.items.map((i: any) => ({
                    id: i.id,
                    menuItemId: i.menuItemId,
                    name: i.name,
                    price: i.price,
                    quantity: i.quantity,
                    notes: i.notes,
                    kotId: i.kotId
                  }))
                }
              },
              include: {
                items: true
              }
            });

            console.log(`[Sync Engine] Saved order ${savedOrder.orderNumber} to PostgreSQL.`);
            
            // Broadcast live KOT updates to Kitchen Displays (KDS)
            this.syncGateway.broadcastKOT({
              id: savedOrder.id,
              orderNumber: savedOrder.orderNumber,
              tableNumber: savedOrder.tableNumber,
              status: 'PENDING',
              createdAt: savedOrder.createdAt,
              items: savedOrder.items.map((i: any) => ({
                id: i.id,
                menuItemId: i.menuItemId,
                name: i.name,
                quantity: i.quantity,
                notes: i.notes,
                status: 'PENDING'
              }))
            });

            // Also broadcast general order update event
            this.syncGateway.broadcastOrderUpdate(savedOrder);
          } else {
            console.log(`[Sync Engine] Order ${orderData.order_number} already synced.`);
          }

          succeededIds.push(item.id);
        } else if (item.entity_type === 'ITEM') {
          const itemData = JSON.parse(item.payload);
          
          await this.prisma.menuItem.upsert({
            where: { id: itemData.id },
            update: {
              name: itemData.name,
              price: itemData.price,
              categoryId: itemData.categoryId,
              isAvailable: true
            },
            create: {
              id: itemData.id,
              name: itemData.name,
              price: itemData.price,
              categoryId: itemData.categoryId,
              isAvailable: true,
              taxRate: 0.05
            }
          });

          console.log(`[Sync Engine] Synced menu item ${itemData.name} (ID: ${itemData.id}) to PostgreSQL.`);
          succeededIds.push(item.id);
        }
      } catch (e) {
        console.error(`[Sync Engine] Failed to sync item ${item.id}:`, e.message);
      }
    }

    return succeededIds;
  }

  async pullCatalog(outletId?: string) {
    try {
      const categories = await this.prisma.category.findMany();
      const menuItems = await this.prisma.menuItem.findMany();
      
      let orders: any[] = [];
      if (outletId) {
        orders = await this.prisma.order.findMany({
          where: {
            id: {
              startsWith: outletId
            }
          },
          include: {
            items: true
          }
        });
      } else {
        orders = await this.prisma.order.findMany({
          include: {
            items: true
          }
        });
      }

      return {
        success: true,
        categories,
        menuItems,
        orders
      };
    } catch (e) {
      console.error('[Sync Engine] Failed to pull catalog from PostgreSQL:', e.message);
      return {
        success: false,
        categories: [],
        menuItems: [],
        orders: []
      };
    }
  }

  async processSwiggyWebhook(payload: any) {
    const orderNumber = payload.orderId || `SW-${Date.now().toString().slice(-6)}`;
    const subtotal = (payload.cart || []).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const discount = payload.discount || 0;
    const tax = Math.max(0, subtotal - discount) * 0.05;
    const total = subtotal - discount + tax;

    const orderData = {
      id: `OUT01-SWIGGY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      order_number: orderNumber,
      tableNumber: null,
      customerName: payload.customer?.name || 'Swiggy Guest',
      customerPhone: payload.customer?.phone || null,
      status: 'PENDING',
      source: 'DELIVERY',
      subTotal: subtotal,
      tax,
      discount,
      total,
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: (payload.cart || []).map((item: any) => ({
        id: `SW-ITEM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        menuItemId: item.itemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        notes: item.notes || null,
        kotId: null
      }))
    };

    return this.saveAndBroadcastWebhookOrder(orderData);
  }

  async processZomatoWebhook(payload: any) {
    const orderNumber = payload.order_id || `ZM-${Date.now().toString().slice(-6)}`;
    const subtotal = (payload.items || []).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const discount = payload.discount_amount || 0;
    const tax = Math.max(0, subtotal - discount) * 0.05;
    const total = subtotal - discount + tax;

    const orderData = {
      id: `OUT01-ZOMATO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      order_number: orderNumber,
      tableNumber: null,
      customerName: payload.customer_details?.customer_name || 'Zomato Guest',
      customerPhone: payload.customer_details?.customer_phone || null,
      status: 'PENDING',
      source: 'DELIVERY',
      subTotal: subtotal,
      tax,
      discount,
      total,
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: (payload.items || []).map((item: any) => ({
        id: `ZM-ITEM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        menuItemId: item.item_id,
        name: item.item_name,
        price: item.price,
        quantity: item.quantity,
        notes: item.instructions || null,
        kotId: null
      }))
    };

    return this.saveAndBroadcastWebhookOrder(orderData);
  }

  private async saveAndBroadcastWebhookOrder(orderData: any) {
    const savedOrder = await this.prisma.order.create({
      data: {
        id: orderData.id,
        orderNumber: orderData.order_number,
        tableNumber: orderData.tableNumber,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone,
        status: orderData.status,
        source: orderData.source,
        subTotal: orderData.subTotal,
        tax: orderData.tax,
        discount: orderData.discount,
        total: orderData.total,
        paymentStatus: orderData.paymentStatus,
        paymentMethod: orderData.paymentMethod,
        createdAt: orderData.createdAt,
        updatedAt: orderData.updatedAt,
        items: {
          create: orderData.items.map((i: any) => ({
            id: i.id,
            menuItemId: i.menuItemId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            notes: i.notes,
            kotId: i.kotId
          }))
        }
      },
      include: {
        items: true
      }
    });

    console.log(`[Webhook Engine] Saved aggregator order ${savedOrder.orderNumber} to PostgreSQL.`);

    this.syncGateway.broadcastKOT({
      id: savedOrder.id,
      orderNumber: savedOrder.orderNumber,
      tableNumber: savedOrder.tableNumber,
      status: 'PENDING',
      createdAt: savedOrder.createdAt,
      items: savedOrder.items.map((i: any) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
        status: 'PENDING'
      }))
    });

    this.syncGateway.broadcastOrderUpdate(savedOrder);

    return { success: true, orderNumber: savedOrder.orderNumber };
  }
}
