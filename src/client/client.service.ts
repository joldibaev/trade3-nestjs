import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateClientDto } from '../generated/dto/client/create-client.dto';
import { UpdateClientDto } from '../generated/dto/client/update-client.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  create(createClientDto: CreateClientDto) {
    return this.prisma.client.create({
      data: createClientDto,
    });
  }

  findAll(isActive?: boolean) {
    return this.prisma.client.findMany({
      where: {
        isActive,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  update(id: string, updateClientDto: UpdateClientDto) {
    return this.prisma.client.update({
      where: { id },
      data: updateClientDto,
    });
  }

  remove(id: string) {
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
