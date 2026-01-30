import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { HashingService } from './hashing.service';
import { AuthTokens, LoginPayload } from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<Partial<User> | null> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await this.hashingService.compare(pass, user.passwordHash))) {
      const { passwordHash: _, refreshTokenHash: __, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: LoginPayload): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    await this.updateRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const hashedRefreshToken = await this.hashingService.hash(refreshToken);
    await this.usersService.update(userId, {
      refreshTokenHash: hashedRefreshToken,
    });
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.update(userId, {
      refreshTokenHash: null,
    });
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<AuthTokens> {
    const user = await this.usersService.findOneById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException(
        'Ошибка авторизации: пользователь не найден или сессия истекла',
      );
    }

    const refreshTokenMatches = await this.hashingService.compare(
      refreshToken,
      user.refreshTokenHash,
    );

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Ошибка авторизации: сессия недействительна');
    }

    return this.login(user); // returns promise from login()
  }
}
