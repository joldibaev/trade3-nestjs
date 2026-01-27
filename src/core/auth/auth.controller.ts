import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { HashingService } from './hashing.service';
import { Role } from '../../generated/prisma/client';

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
  async login(@Req() req: express.Request, @Res({ passthrough: true }) res: express.Response) {
    const user = req.user as { id: string; email: string; role: string };
    const tokens = await this.authService.login(user);
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('register')
  async register(@Body() body: { email: string; password: string; role?: string }) {
    const passwordHash = await this.hashingService.hash(body.password);
    return this.usersService.create({
      email: body.email,
      passwordHash,
      role: (body.role as Role) || Role.USER, // Prisma requires Role enum
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: express.Request, @Res({ passthrough: true }) res: express.Response) {
    const user = req.user as { id: string };
    await this.authService.logout(user.id);
    res.clearCookie('refreshToken');
    return { message: 'Logged out' };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: express.Request, @Res({ passthrough: true }) res: express.Response) {
    const user = req.user as { id: string; refreshToken: string };
    const tokens = await this.authService.refreshTokens(user.id, user.refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken };
  }
}
