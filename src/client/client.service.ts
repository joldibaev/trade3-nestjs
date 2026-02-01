import { Injectable } from '@nestjs/common';

import { Client } from '../generated/prisma/client';
import { CreateClientDto } from '../generated/types/backend/dto/client/create-client.dto';
import { UpdateClientDto } from '../generated/types/backend/dto/client/update-client.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientService {
  constructor(private readonly prisma: PrismaService) {}

  create(createClientDto: CreateClientDto): Promise<Client> {
    return this.prisma.client.create({
      data: createClientDto,
    });
  }

  findAll(): Promise<Client[]> {
    return this.prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Client> {
    return this.prisma.client.findUniqueOrThrow({
      where: { id },
    });
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<Client> {
    return this.prisma.client.update({
      where: { id },
      data: { ...updateClientDto },
    });
  }

  remove(id: string): Promise<Client> {
    return this.prisma.client.delete({
      where: { id },
    });
  }
}
