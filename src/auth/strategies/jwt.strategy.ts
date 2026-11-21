import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        '1600prep-local-dev-jwt-secret-key-2026',
    });
  }

  async validate(payload: { sub: string }) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid authentication token');
    }
    const exists = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!exists) {
      throw new UnauthorizedException('User account no longer exists');
    }
    return { userId: payload.sub };
  }
}
