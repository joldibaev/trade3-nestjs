import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../generated/prisma/enums';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/auth.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { HashingService } from './hashing.service';
import type {
  AuthLoginResponse,
  AuthLogoutResponse,
  AuthRefreshResponse,
  AuthUser,
} from './interfaces/auth.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private hashingService: HashingService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<AuthLoginResponse> {
    const tokens = await this.authService.login(user);
    res.setCookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return { accessToken: tokens.accessToken, user };
  }

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Public()
  @Post('register')
  async register(@Body() body: RegisterDto): Promise<unknown> {
    const passwordHash = await this.hashingService.hash(body.password);
    return this.usersService.create({
      email: body.email,
      passwordHash,
      role: body.role || Role.USER,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<AuthLogoutResponse> {
    await this.authService.logout(user.id);
    res.clearCookie('refreshToken', { path: '/' });
    return { message: 'Logged out' };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<AuthRefreshResponse> {
    if (!user.refreshToken) {
      throw new Error('Refresh token not found');
    }
    const tokens = await this.authService.refreshTokens(user.id, user.refreshToken);

    res.setCookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return { accessToken: tokens.accessToken };
  }
}
