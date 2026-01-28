import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStoreDto } from '../generated/types/backend/dto/store/create-store.dto';
import { UpdateStoreDto } from '../generated/types/backend/dto/store/update-store.dto';
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
      where: { isActive },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.store.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  update(id: string, updateStoreDto: UpdateStoreDto) {
    return this.prisma.store.update({
      where: { id },
      data: updateStoreDto,
    });
  }

  remove(id: string) {
    return this.prisma.store.delete({
      where: { id },
    });
  }

  async validateStore(storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Магазин не найден');
  }
}
