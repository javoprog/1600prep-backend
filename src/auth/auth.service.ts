import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  publicUserSelect,
  PublicUserProfile,
  RawUserRecord,
  toPublicUserProfile,
} from '../users/user-profile';
import {
  GoogleAuthDto,
  LinkEmailDto,
  LoginDto,
  RegisterDto,
  TelegramWidgetDto,
  UpdateProfileDto,
} from './dto/auth.dto';

export interface TelegramIdentityPayload {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

interface GoogleTokenProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getAuthConfig() {
    const googleClientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim() || null;
    const telegramBotUsername =
      this.configService
        .get<string>('TELEGRAM_BOT_USERNAME')
        ?.trim()
        .replace(/^@/, '') || null;
    const telegramBotToken =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || null;

    return {
      googleEnabled: Boolean(googleClientId),
      googleClientId,
      telegramBotEnabled: Boolean(telegramBotToken && telegramBotUsername),
      telegramWidgetEnabled: Boolean(telegramBotToken && telegramBotUsername),
      telegramBotUsername,
    };
  }

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

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUserProfile> {
    const cleanName = dto.name.trim();
    if (!cleanName) {
      throw new BadRequestException('Name cannot be empty');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: cleanName },
      select: publicUserSelect,
    });
    return toPublicUserProfile(updated);
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

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google or Telegram sign-in. Sign in with your connected provider first, then set a password in Account Settings.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  // ============================================================================
  // GOOGLE AUTH & ACCOUNT LINKING
  // ============================================================================

  async loginOrRegisterWithGoogle(dto: GoogleAuthDto) {
    const googleProfile = await this.verifyGoogleCredential(dto.credential);
    const email = googleProfile.email.trim().toLowerCase();

    // 1. Check by googleId first
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleProfile.sub },
      select: publicUserSelect,
    });

    if (user) {
      return this.createAuthResponse(user);
    }

    // 2. Check if an account already exists with this email (e.g., created with Email & Password or Telegram+Email)
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (existingByEmail) {
      user = await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: googleProfile.sub,
          googleEmail: email,
          avatarUrl: existingByEmail.avatarUrl || googleProfile.picture || null,
        },
        select: publicUserSelect,
      });
      return this.createAuthResponse(user);
    }

    // 3. Create new account with Google
    user = await this.prisma.user.create({
      data: {
        name: googleProfile.name || email.split('@')[0] || 'Student',
        email,
        googleId: googleProfile.sub,
        googleEmail: email,
        avatarUrl: googleProfile.picture || null,
      },
      select: publicUserSelect,
    });

    return this.createAuthResponse(user);
  }

  async linkGoogleToUser(userId: string, dto: GoogleAuthDto) {
    const googleProfile = await this.verifyGoogleCredential(dto.credential);
    const googleEmail = googleProfile.email.trim().toLowerCase();

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    // Check if another user already owns this googleId
    const existingGoogleOwner = await this.prisma.user.findUnique({
      where: { googleId: googleProfile.sub },
      select: publicUserSelect,
    });

    if (existingGoogleOwner && existingGoogleOwner.id !== userId) {
      await this.mergeSecondaryUserIntoPrimary(userId, existingGoogleOwner.id);
    }

    // Also check if currentUser has no email yet and whether googleEmail is available
    let nextEmail = currentUser.email;
    if (!nextEmail) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: googleEmail },
        select: { id: true },
      });
      if (!emailOwner || emailOwner.id === userId) {
        nextEmail = googleEmail;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: googleProfile.sub,
        googleEmail,
        email: nextEmail,
        avatarUrl: currentUser.avatarUrl || googleProfile.picture || null,
      },
      select: publicUserSelect,
    });

    return toPublicUserProfile(updated);
  }

  private async verifyGoogleCredential(
    credential: string,
  ): Promise<GoogleTokenProfile> {
    const trimmed = credential.trim();
    const configuredClientId = this.configService
      .get<string>('GOOGLE_CLIENT_ID')
      ?.trim();

    // Try verifying as a Google ID Token (JWT from Google Identity Services)
    const idTokenRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(trimmed)}`,
    );

    if (idTokenRes.ok) {
      const data = (await idTokenRes.json()) as Record<string, string>;
      if (configuredClientId && data.aud !== configuredClientId) {
        throw new UnauthorizedException('Google token client ID mismatch');
      }
      if (!data.sub || !data.email) {
        throw new UnauthorizedException(
          'Google token did not include an email address',
        );
      }
      return {
        sub: data.sub,
        email: data.email,
        emailVerified:
          data.email_verified === 'true' || Boolean(data.email_verified),
        name: data.name || data.given_name || data.email.split('@')[0],
        picture: data.picture,
      };
    }

    // Fallback: Try verifying as an OAuth2 Access Token via Google UserInfo endpoint
    const userInfoRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${trimmed}` },
      },
    );

    if (userInfoRes.ok) {
      const data = (await userInfoRes.json()) as Record<string, string>;
      if (!data.sub || !data.email) {
        throw new UnauthorizedException(
          'Google userinfo did not include an email address',
        );
      }
      return {
        sub: data.sub,
        email: data.email,
        emailVerified: Boolean(data.email_verified),
        name: data.name || data.given_name || data.email.split('@')[0],
        picture: data.picture,
      };
    }

    throw new UnauthorizedException('Invalid or expired Google credential');
  }

  // ============================================================================
  // TELEGRAM AUTH (WIDGET & BOT 6-DIGIT CODE) & ACCOUNT LINKING
  // ============================================================================

  async loginOrRegisterWithTelegramWidget(dto: TelegramWidgetDto) {
    const identity = this.verifyTelegramWidgetSignature(dto);
    const user = await this.findOrCreateTelegramUser(identity);
    return this.createAuthResponse(user);
  }

  async linkTelegramWidgetToUser(userId: string, dto: TelegramWidgetDto) {
    const identity = this.verifyTelegramWidgetSignature(dto);
    const updated = await this.attachTelegramIdentityToUser(userId, identity);
    return toPublicUserProfile(updated);
  }

  async createTelegramBotAuthSession() {
    const botUsername =
      this.configService
        .get<string>('TELEGRAM_BOT_USERNAME')
        ?.trim()
        .replace(/^@/, '') || null;

    const code = await this.generateUniqueSixDigitCode();
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up expired sessions opportunistically
    await this.prisma.telegramAuthSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    await this.prisma.telegramAuthSession.create({
      data: {
        sessionToken,
        code,
        status: 'PENDING',
        expiresAt,
      },
    });

    return {
      sessionToken,
      code,
      botUsername,
      deepLink: botUsername
        ? `https://t.me/${botUsername}?start=${code}`
        : null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async pollTelegramBotAuthSession(sessionToken: string) {
    const session = await this.prisma.telegramAuthSession.findUnique({
      where: { sessionToken },
    });

    if (!session) {
      throw new BadRequestException('Telegram auth session not found');
    }

    if (session.expiresAt < new Date() && session.status !== 'COMPLETED') {
      return { status: 'EXPIRED' as const };
    }

    if (session.status === 'COMPLETED' && session.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: publicUserSelect,
      });
      if (!user) {
        return { status: 'EXPIRED' as const };
      }

      // Consume the completed session token so it cannot be replayed
      await this.prisma.telegramAuthSession.delete({
        where: { id: session.id },
      });

      const authResp = await this.createAuthResponse(user);
      return {
        status: 'COMPLETED' as const,
        ...authResp,
      };
    }

    return {
      status: 'PENDING' as const,
      code: session.code,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async createTelegramLinkCodeForUser(userId: string) {
    const botUsername =
      this.configService
        .get<string>('TELEGRAM_BOT_USERNAME')
        ?.trim()
        .replace(/^@/, '') || null;

    const code = await this.generateUniqueSixDigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramLinkCode: code,
        telegramLinkExpiresAt: expiresAt,
      },
    });

    return {
      code,
      botUsername,
      deepLink: botUsername
        ? `https://t.me/${botUsername}?start=${code}`
        : null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Called by TelegramService when the bot receives `/start <6-digit-code>` or `<6-digit-code>`.
   * Handles BOTH linking Telegram to an existing logged-in account AND signing in/registering via Telegram Bot.
   */
  async handleTelegramBotCode(
    code: string,
    identity: TelegramIdentityPayload,
  ): Promise<
    | { ok: true; mode: 'linked' | 'login'; userName: string }
    | { ok: false; reason: string }
  > {
    const cleanCode = code.trim();
    const now = new Date();

    // 1. Check if this code is an account-link code on an existing User
    const userToLink = await this.prisma.user.findFirst({
      where: {
        telegramLinkCode: cleanCode,
        telegramLinkExpiresAt: { gt: now },
      },
      select: publicUserSelect,
    });

    if (userToLink) {
      const updated = await this.attachTelegramIdentityToUser(
        userToLink.id,
        identity,
      );
      return {
        ok: true,
        mode: 'linked',
        userName: updated.name,
      };
    }

    // 2. Check if this code is a pending TelegramAuthSession (login / signup via bot)
    const authSession = await this.prisma.telegramAuthSession.findFirst({
      where: {
        code: cleanCode,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
    });

    if (authSession) {
      const user = await this.findOrCreateTelegramUser(identity);
      await this.prisma.telegramAuthSession.update({
        where: { id: authSession.id },
        data: {
          status: 'COMPLETED',
          userId: user.id,
        },
      });
      return {
        ok: true,
        mode: 'login',
        userName: user.name,
      };
    }

    return {
      ok: false,
      reason: 'Invalid or expired 6-digit code. Please generate a new code on 1600prep.',
    };
  }

  private verifyTelegramWidgetSignature(
    dto: TelegramWidgetDto,
  ): TelegramIdentityPayload {
    const botToken = this.configService
      .get<string>('TELEGRAM_BOT_TOKEN')
      ?.trim();
    if (!botToken) {
      throw new BadRequestException(
        'TELEGRAM_BOT_TOKEN is not configured on the backend server',
      );
    }

    const authDateSec = Number(dto.auth_date);
    if (!Number.isFinite(authDateSec)) {
      throw new UnauthorizedException('Invalid Telegram auth_date');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - authDateSec) > 86400) {
      throw new UnauthorizedException(
        'Telegram login session has expired. Please try again.',
      );
    }

    const dataFields: Record<string, string> = {
      auth_date: String(dto.auth_date),
      first_name: String(dto.first_name),
      id: String(dto.id),
    };
    if (dto.last_name) dataFields.last_name = String(dto.last_name);
    if (dto.photo_url) dataFields.photo_url = String(dto.photo_url);
    if (dto.username) dataFields.username = String(dto.username);

    const dataCheckString = Object.keys(dataFields)
      .sort()
      .map((key) => `${key}=${dataFields[key]}`)
      .join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== dto.hash) {
      throw new UnauthorizedException('Invalid Telegram authentication hash');
    }

    return {
      id: String(dto.id),
      firstName: dto.first_name,
      lastName: dto.last_name,
      username: dto.username,
      photoUrl: dto.photo_url,
    };
  }

  async findOrCreateTelegramUser(
    identity: TelegramIdentityPayload,
  ): Promise<RawUserRecord> {
    const existing = await this.prisma.user.findUnique({
      where: { telegramId: identity.id },
      select: publicUserSelect,
    });

    const fullName = [identity.firstName, identity.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          telegramUsername: identity.username || existing.telegramUsername,
          telegramFirstName: identity.firstName || existing.telegramFirstName,
          telegramPhotoUrl: identity.photoUrl || existing.telegramPhotoUrl,
        },
        select: publicUserSelect,
      });
    }

    return this.prisma.user.create({
      data: {
        name: fullName || identity.username || 'Telegram User',
        telegramId: identity.id,
        telegramUsername: identity.username || null,
        telegramFirstName: identity.firstName || null,
        telegramPhotoUrl: identity.photoUrl || null,
        avatarUrl: identity.photoUrl || null,
      },
      select: publicUserSelect,
    });
  }

  async attachTelegramIdentityToUser(
    userId: string,
    identity: TelegramIdentityPayload,
  ): Promise<RawUserRecord> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    const existingOwner = await this.prisma.user.findUnique({
      where: { telegramId: identity.id },
      select: publicUserSelect,
    });

    if (existingOwner && existingOwner.id !== userId) {
      await this.mergeSecondaryUserIntoPrimary(userId, existingOwner.id);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: identity.id,
        telegramUsername: identity.username || null,
        telegramFirstName: identity.firstName || null,
        telegramPhotoUrl: identity.photoUrl || null,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null,
        avatarUrl: currentUser.avatarUrl || identity.photoUrl || null,
      },
      select: publicUserSelect,
    });
  }

  // ============================================================================
  // EMAIL & PASSWORD LINKING + PROVIDER UNLINKING
  // ============================================================================

  async linkEmailAndPasswordToUser(userId: string, dto: LinkEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!currentUser) {
      throw new UnauthorizedException('User not found');
    }

    const existingEmailOwner = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    // If another account already has this email, verify its password and merge accounts seamlessly
    if (existingEmailOwner && existingEmailOwner.id !== userId) {
      if (!existingEmailOwner.passwordHash) {
        throw new ConflictException(
          'An account with this email already exists via Google. Connect Google to merge, or use a different email.',
        );
      }

      const passwordMatchesExisting = await bcrypt.compare(
        dto.password,
        existingEmailOwner.passwordHash,
      );
      if (!passwordMatchesExisting) {
        throw new ConflictException(
          'An account with this email already exists. Enter that account\'s password to merge your accounts.',
        );
      }

      await this.mergeSecondaryUserIntoPrimary(userId, existingEmailOwner.id);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const nextName = dto.name?.trim() || currentUser.name;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        passwordHash,
        name: nextName,
      },
      select: publicUserSelect,
    });

    return toPublicUserProfile(updated);
  }

  async unlinkProvider(
    userId: string,
    provider: 'google' | 'telegram' | 'password',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const activeMethods = [
      Boolean(user.passwordHash && user.email),
      Boolean(user.googleId),
      Boolean(user.telegramId),
    ].filter(Boolean).length;

    if (activeMethods <= 1) {
      throw new BadRequestException(
        'Cannot disconnect your only sign-in method. Connect another method first.',
      );
    }

    if (provider === 'google') {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          googleId: null,
          googleEmail: null,
        },
        select: publicUserSelect,
      });
      return toPublicUserProfile(updated);
    }

    if (provider === 'telegram') {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          telegramId: null,
          telegramUsername: null,
          telegramFirstName: null,
          telegramPhotoUrl: null,
          telegramLinkCode: null,
          telegramLinkExpiresAt: null,
        },
        select: publicUserSelect,
      });
      return toPublicUserProfile(updated);
    }

    if (provider === 'password') {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: null,
        },
        select: publicUserSelect,
      });
      return toPublicUserProfile(updated);
    }

    throw new BadRequestException('Unknown authentication provider');
  }

  // ============================================================================
  // HELPERS (ACCOUNT MERGE, CODE GENERATION, JWT)
  // ============================================================================

  /**
   * Moves all saved attempts and sessions from `secondaryUserId` to `primaryUserId`,
   * preserves any linked provider fields that `primaryUserId` doesn't have yet,
   * and deletes `secondaryUserId`.
   */
  private async mergeSecondaryUserIntoPrimary(
    primaryUserId: string,
    secondaryUserId: string,
  ) {
    if (primaryUserId === secondaryUserId) return;

    const [primary, secondary] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: primaryUserId },
        select: publicUserSelect,
      }),
      this.prisma.user.findUnique({
        where: { id: secondaryUserId },
        select: publicUserSelect,
      }),
    ]);

    if (!primary || !secondary) return;

    // Transfer sessions (skipping any clientSessionId already on primary)
    const secondarySessions = await this.prisma.practiceSessionRecord.findMany({
      where: { userId: secondaryUserId },
    });

    for (const sess of secondarySessions) {
      const exists = await this.prisma.practiceSessionRecord.findUnique({
        where: {
          userId_clientSessionId: {
            userId: primaryUserId,
            clientSessionId: sess.clientSessionId,
          },
        },
      });
      if (!exists) {
        await this.prisma.practiceSessionRecord.update({
          where: { id: sess.id },
          data: { userId: primaryUserId },
        });
      }
    }

    // Transfer attempts (skipping any clientAttemptId already on primary)
    const secondaryAttempts = await this.prisma.questionAttempt.findMany({
      where: { userId: secondaryUserId },
    });

    for (const att of secondaryAttempts) {
      const exists = await this.prisma.questionAttempt.findUnique({
        where: {
          userId_clientAttemptId: {
            userId: primaryUserId,
            clientAttemptId: att.clientAttemptId,
          },
        },
      });
      if (!exists) {
        await this.prisma.questionAttempt.update({
          where: { id: att.id },
          data: { userId: primaryUserId },
        });
      }
    }

    // Delete secondary user first so unique constraints (email, googleId, telegramId) are freed
    await this.prisma.user.delete({
      where: { id: secondaryUserId },
    });

    // Preserve any provider credentials from secondary if primary lacked them
    await this.prisma.user.update({
      where: { id: primaryUserId },
      data: {
        email: primary.email || secondary.email,
        passwordHash: primary.passwordHash || secondary.passwordHash,
        googleId: primary.googleId || secondary.googleId,
        googleEmail: primary.googleEmail || secondary.googleEmail,
        telegramId: primary.telegramId || secondary.telegramId,
        telegramUsername:
          primary.telegramUsername || secondary.telegramUsername,
        telegramFirstName:
          primary.telegramFirstName || secondary.telegramFirstName,
        telegramPhotoUrl:
          primary.telegramPhotoUrl || secondary.telegramPhotoUrl,
        avatarUrl: primary.avatarUrl || secondary.avatarUrl,
      },
    });
  }

  private async generateUniqueSixDigitCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = String(crypto.randomInt(100000, 999999));
      const [userCollision, sessionCollision] = await Promise.all([
        this.prisma.user.findUnique({
          where: { telegramLinkCode: code },
          select: { id: true },
        }),
        this.prisma.telegramAuthSession.findUnique({
          where: { code },
          select: { id: true },
        }),
      ]);
      if (!userCollision && !sessionCollision) {
        return code;
      }
    }
    return String(crypto.randomInt(100000, 999999));
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
