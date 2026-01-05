import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from '../generated/dto/user/create-user.dto';
import { UpdateUserDto } from '../generated/dto/user/update-user.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { User } from '../generated/entities/user.entity';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly usersService: UserService) {}

  @Post()
  @ApiStandardResponse(User)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiStandardResponseArray(User)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(User)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiStandardResponse(User)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiStandardResponse(User)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
