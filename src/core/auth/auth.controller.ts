import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { HashingService } from './hashing.service';
import { Role } from '../../generated/prisma/enums';
import { RegisterDto } from './dto/auth.dto';

interface RequestWithUser extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    refreshToken: string;
  };
}

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
  async login(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const user = (req as unknown as RequestWithUser).user;
    const tokens = await this.authService.login(user);
    res.setCookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('register')
  async register(@Body() body: RegisterDto) {
    // Placeholder for now, should be migrated to Zod DTO
    const passwordHash = await this.hashingService.hash(body.password);
    return this.usersService.create({
      email: body.email,
      passwordHash,
      role: body.role || Role.USER,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const user = (req as unknown as RequestWithUser).user;
    await this.authService.logout(user.id);
    res.clearCookie('refreshToken', { path: '/' });
    return { message: 'Logged out' };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const user = (req as unknown as RequestWithUser).user;
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
