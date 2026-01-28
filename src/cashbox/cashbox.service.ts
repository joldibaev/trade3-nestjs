import { Injectable } from '@nestjs/common';
import { CreateCashboxDto } from '../generated/types/backend/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/types/backend/dto/cashbox/update-cashbox.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class CashboxService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCashboxDto: CreateCashboxDto) {
    return this.prisma.cashbox.create({
      data: createCashboxDto,
    });
  }

  findAll(storeId?: string, isActive?: boolean, include?: Record<string, boolean>) {
    return this.prisma.cashbox.findMany({
      where: { storeId, isActive },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string) {
    return this.prisma.cashbox.findUniqueOrThrow({
      where: { id },
    });
  }

  update(id: string, updateCashboxDto: UpdateCashboxDto) {
    return this.prisma.cashbox.update({
      where: { id },
      data: updateCashboxDto,
    });
  }

  remove(id: string) {
    return this.prisma.cashbox.delete({
      where: { id },
    });
  }
}
