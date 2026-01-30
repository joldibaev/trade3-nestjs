import { Injectable } from '@nestjs/common';

import { Barcode } from '../generated/prisma/client';
import { BarcodeType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';

@Injectable()
export class BarcodeService {
  constructor(private readonly prisma: PrismaService) {}

  private identifyBarcodeType(value: string): BarcodeType {
    if (/^\d{13}$/.test(value)) return BarcodeType.EAN13;
    if (/^\d{8}$/.test(value)) return BarcodeType.EAN8;
    if (/^[A-Za-z0-9]{1,128}$/.test(value)) return BarcodeType.CODE128;
    return BarcodeType.OTHER;
  }

  create(createBarcodeDto: CreateBarcodeDto): Promise<Barcode> {
    const type = this.identifyBarcodeType(createBarcodeDto.value);
    return this.prisma.barcode.create({
      data: {
        ...createBarcodeDto,
        type,
      },
    });
  }

  findAll(include?: Record<string, boolean>): Promise<Barcode[]> {
    return this.prisma.barcode.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Barcode> {
    return this.prisma.barcode.findUniqueOrThrow({
      where: { id },
    });
  }

  update(id: string, updateBarcodeDto: UpdateBarcodeDto): Promise<Barcode> {
    const { value } = updateBarcodeDto;

    return this.prisma.barcode.update({
      where: { id },
      data: {
        ...updateBarcodeDto,
        ...(value ? { type: this.identifyBarcodeType(value) } : {}),
      },
    });
  }

  remove(id: string): Promise<Barcode> {
    return this.prisma.barcode.delete({
      where: { id },
    });
  }
}
