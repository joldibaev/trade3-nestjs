import { Injectable } from '@nestjs/common';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';

import { PrismaService } from '../prisma/prisma.service';
import { DashboardStats } from './interfaces/statistics.interface';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);
    const yesterdayStart = startOfDay(subDays(today, 1));
    const yesterdayEnd = endOfToday;

    // 1. Sales today
    const salesToday = await this.prisma.documentSale.aggregate({
      where: {
        date: { gte: startOfToday, lte: endOfToday },
        status: 'COMPLETED',
      },
      _sum: { total: true },
    });

    const salesYesterday = await this.prisma.documentSale.aggregate({
      where: {
        date: { gte: yesterdayStart, lte: yesterdayEnd },
        status: 'COMPLETED',
      },
      _sum: { total: true },
    });

    const salesDiff =
      salesYesterday._sum.total && Number(salesYesterday._sum.total) > 0
        ? ((Number(salesToday._sum.total || 0) - Number(salesYesterday._sum.total)) /
            Number(salesYesterday._sum.total)) *
          100
        : 0;

    // 2. Active orders (Draft or Scheduled)
    const activeOrdersCount = await this.prisma.documentSale.count({
      where: {
        status: { in: ['DRAFT', 'SCHEDULED'] },
      },
    });

    const waitingForShipment = await this.prisma.documentSale.count({
      where: { status: 'SCHEDULED' },
    });

    // 3. New clients
    const clientsCount = await this.prisma.client.count();
    const newClientsToday = await this.prisma.client.count({
      where: {
        createdAt: { gte: startOfToday },
      },
    });

    // 4. Critical stocks (quantity < 10 for example, or based on some threshold)
    // For simplicity, let's say products with total stock < 5
    const criticalStocks = await this.prisma.stock.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      having: {
        quantity: { _sum: { lt: 5 } },
      },
    });

    // 5. Activity Chart (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i);
      return {
        start: startOfDay(date),
        end: endOfDay(date),
        label: i === 6 ? 'Сегодня' : format(date, 'EE', { locale: ru }),
      };
    });

    const chartData = await Promise.all(
      last7Days.map(async (day) => {
        const sum = await this.prisma.documentSale.aggregate({
          where: {
            date: { gte: day.start, lte: day.end },
            status: 'COMPLETED',
          },
          _sum: { total: true },
        });
        return {
          label: day.label,
          value: Number(sum._sum.total || 0),
        };
      }),
    );

    return {
      sales: {
        total: Number(salesToday._sum.total || 0),
        diff: Number(salesDiff.toFixed(1)),
      },
      orders: {
        active: activeOrdersCount,
        waiting: waitingForShipment,
      },
      clients: {
        total: clientsCount,
        new: newClientsToday,
      },
      inventory: {
        critical: criticalStocks.length,
      },
      chart: chartData,
    };
  }
}
