import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtRefreshPayload } from '../interfaces/jwt-refresh-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: FastifyRequest): string | null => {
          return req.cookies?.refreshToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') as string,
      passReqToCallback: true,
    });
  }

  validate(
    req: FastifyRequest,
    payload: { sub: string; email: string; role: string },
  ): JwtRefreshPayload {
    const refreshToken = req.cookies?.refreshToken as string;

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken: refreshToken,
    };
  }
}
