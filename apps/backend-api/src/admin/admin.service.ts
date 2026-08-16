import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    // 1. Fetch all orders from PostgreSQL
    const allOrders = await this.prisma.order.findMany({
      include: { items: true }
    });

    const totalOrdersCount = allOrders.length;
    let totalSalesValue = 0;
    
    // Payment method splits
    const paymentSplits: Record<string, number> = {
      CASH: 0,
      UPI: 0,
      CARD: 0,
      OTHER: 0
    };

    // Multi-outlet splits
    const outletSplits: Record<string, { totalSales: number; txCount: number }> = {};

    // Menu item sales volume tracking
    const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    for (const order of allOrders) {
      totalSalesValue += order.total;

      // Group payment methods
      const payMethod = order.paymentMethod || 'OTHER';
      if (paymentSplits[payMethod] !== undefined) {
        paymentSplits[payMethod] += order.total;
      } else {
        paymentSplits[payMethod] = order.total;
      }

      // Group by outlet ID parsed from composite ID prefix (e.g. OUT01-POS01-timestamp-seq)
      const parts = order.id.split('-');
      const outletId = parts[0] && parts[0].startsWith('OUT') ? parts[0] : 'OUT-MAIN';
      if (!outletSplits[outletId]) {
        outletSplits[outletId] = { totalSales: 0, txCount: 0 };
      }
      outletSplits[outletId].totalSales += order.total;
      outletSplits[outletId].txCount += 1;

      // Aggregate item metrics
      for (const item of order.items) {
        const itemKey = item.menuItemId;
        if (!itemSales[itemKey]) {
          itemSales[itemKey] = { name: item.name, quantity: 0, revenue: 0 };
        }
        itemSales[itemKey].quantity += item.quantity;
        itemSales[itemKey].revenue += item.price * item.quantity;
      }
    }

    const aov = totalOrdersCount > 0 ? totalSalesValue / totalOrdersCount : 0;

    // Convert top items to sorted list
    const topItems = Object.values(itemSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Format outlet splits list
    const outletsList = Object.entries(outletSplits).map(([id, stats]) => ({
      outletId: id,
      totalSales: stats.totalSales,
      txCount: stats.txCount
    }));

    return {
      totalSales: totalSalesValue,
      orderCount: totalOrdersCount,
      aov,
      paymentSplits: Object.entries(paymentSplits).map(([method, amount]) => ({ method, amount })),
      outletSplits: outletsList,
      topItems
    };
  }

  async getOrders() {
    return this.prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
  }
}
