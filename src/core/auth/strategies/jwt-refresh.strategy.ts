import * as express from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: express.Request): string | null => {
          return (req.cookies as Record<string, string>)?.refreshToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') as string,
      passReqToCallback: true,
    });
  }

  validate(
    req: express.Request,
    payload: { sub: string; email: string; role: string },
  ): { id: string; email: string; role: string; refreshToken: string } {
    const refreshToken = (req.cookies as Record<string, string>)?.refreshToken;

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken: refreshToken,
    };
  }
}
