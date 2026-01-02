import { Injectable } from '@nestjs/common';
import { CreateCashboxDto } from '../generated/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/dto/cashbox/update-cashbox.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class CashboxService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCashboxDto: CreateCashboxDto) {
    return this.prisma.cashbox.create({
      data: createCashboxDto,
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.cashbox.findMany({
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.cashbox.findUniqueOrThrow({
      where: { id },
      include,
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
