import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStoreDto } from '../generated/dto/store/create-store.dto';
import { UpdateStoreDto } from '../generated/dto/store/update-store.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  create(createStoreDto: CreateStoreDto) {
    return this.prisma.store.create({
      data: createStoreDto,
    });
  }

  findAll(isActive?: boolean, include?: Record<string, boolean>) {
    return this.prisma.store.findMany({
      where: {
        isActive,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: string, include?: Record<string, boolean>) {
    const store = await this.prisma.store.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include,
    });
    if (!store) throw new NotFoundException('Магазин не найден');
    return store;
  }

  update(id: string, updateStoreDto: UpdateStoreDto) {
    return this.prisma.store.update({
      where: { id },
      data: updateStoreDto,
    });
  }

  remove(id: string) {
    return this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async validateStore(storeId: string): Promise<void> {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        deletedAt: null,
      },
    });
    if (!store) throw new NotFoundException('Магазин не найден');
  }
}
