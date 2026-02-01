import { Injectable } from '@nestjs/common';

import { PaymentMethod } from '../generated/prisma/client';
import { CreatePaymentMethodDto } from '../generated/types/backend/dto/payment-method/create-payment-method.dto';
import { UpdatePaymentMethodDto } from '../generated/types/backend/dto/payment-method/update-payment-method.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentMethodService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPaymentMethodDto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.create({
      data: createPaymentMethodDto,
    });
  }

  findAll(): Promise<PaymentMethod[]> {
    return this.prisma.paymentMethod.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.findUniqueOrThrow({
      where: { id },
    });
  }

  async update(id: string, updatePaymentMethodDto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.update({
      where: { id },
      data: { ...updatePaymentMethodDto },
    });
  }

  remove(id: string): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.delete({
      where: { id },
    });
  }
}
