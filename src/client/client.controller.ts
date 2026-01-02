import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto } from '../generated/dto/client/create-client.dto';
import { UpdateClientDto } from '../generated/dto/client/update-client.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { Client } from '../generated/entities/client.entity';

@ApiTags('clients')
@Controller('clients')
export class ClientController {
  constructor(private readonly clientsService: ClientService) {}

  @Post()
  @ApiStandardResponse(Client)
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Get()
  @ApiStandardResponseArray(Client)
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(Client)
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @ApiStandardResponse(Client)
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Client)
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
