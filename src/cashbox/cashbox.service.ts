import { Injectable } from '@nestjs/common';

import { Cashbox } from '../generated/prisma/client';
import { CreateCashboxDto } from '../generated/types/backend/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/types/backend/dto/cashbox/update-cashbox.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashboxService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCashboxDto: CreateCashboxDto): Promise<Cashbox> {
    return this.prisma.cashbox.create({
      data: createCashboxDto,
    });
  }

  findAll(storeId?: string, include?: Record<string, boolean>): Promise<Cashbox[]> {
    return this.prisma.cashbox.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string): Promise<Cashbox> {
    return this.prisma.cashbox.findUniqueOrThrow({
      where: { id },
    });
  }

  async update(id: string, updateCashboxDto: UpdateCashboxDto): Promise<Cashbox> {
    return this.prisma.cashbox.update({
      where: { id },
      data: { ...updateCashboxDto },
    });
  }

  remove(id: string): Promise<Cashbox> {
    return this.prisma.cashbox.delete({
      where: { id },
    });
  }
}
