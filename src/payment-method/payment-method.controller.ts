import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PaymentMethod } from '../generated/prisma/client';
import { CreatePaymentMethodDto } from '../generated/types/backend/dto/payment-method/create-payment-method.dto';
import { UpdatePaymentMethodDto } from '../generated/types/backend/dto/payment-method/update-payment-method.dto';
import { PaymentMethodService } from './payment-method.service';

@ApiTags('payment-methods')
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Post()
  create(@Body() createPaymentMethodDto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    return this.paymentMethodService.create(createPaymentMethodDto);
  }

  @Get()
  findAll(): Promise<PaymentMethod[]> {
    return this.paymentMethodService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<PaymentMethod> {
    return this.paymentMethodService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    return this.paymentMethodService.update(id, updatePaymentMethodDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PaymentMethod> {
    return this.paymentMethodService.remove(id);
  }
}
