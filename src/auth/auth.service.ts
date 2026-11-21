import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  publicUserSelect,
  PublicUserProfile,
  RawUserRecord,
  toPublicUserProfile,
} from '../users/user-profile';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async getMe(userId: string): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return toPublicUserProfile(user);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const defaultName = email.split('@')[0] || 'Student';
    const name = dto.name?.trim() || defaultName;

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
      select: publicUserSelect,
    });

    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const nextName = dto.name !== undefined ? dto.name.trim() : user.name;
    if (!nextName) {
      throw new BadRequestException('Name cannot be empty');
    }

    let nextEmail = user.email;
    if (dto.email !== undefined) {
      const normalized = dto.email.trim().toLowerCase();
      if (!normalized) {
        throw new BadRequestException('Email cannot be empty');
      }
      if (normalized !== user.email) {
        const collision = await this.prisma.user.findUnique({
          where: { email: normalized },
          select: { id: true },
        });
        if (collision && collision.id !== userId) {
          throw new ConflictException('That email is already in use');
        }
        nextEmail = normalized;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        email: nextEmail,
      },
      select: publicUserSelect,
    });

    return toPublicUserProfile(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const nextHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash },
    });

    return { updated: true };
  }

  async deleteAccount(userId: string) {
    await this.prisma.user.delete({
      where: { id: userId },
    });
    return { deleted: true };
  }

  private async createAuthResponse(user: RawUserRecord) {
    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
    return {
      token,
      user: toPublicUserProfile(user),
    };
  }
}
