import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CurrentUser,
  JwtUserPayload,
} from './decorators/current-user.decorator';
import {
  GoogleAuthDto,
  LinkEmailDto,
  LoginDto,
  RegisterDto,
  TelegramWidgetDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('config')
  getConfig() {
    return this.authService.getAuthConfig();
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.loginOrRegisterWithGoogle(dto);
  }

  @Post('telegram/widget')
  telegramWidgetAuth(@Body() dto: TelegramWidgetDto) {
    return this.authService.loginOrRegisterWithTelegramWidget(dto);
  }

  @Post('telegram/bot-session')
  createTelegramBotSession() {
    return this.authService.createTelegramBotAuthSession();
  }

  @Get('telegram/bot-session/:sessionToken')
  pollTelegramBotSession(@Param('sessionToken') sessionToken: string) {
    return this.authService.pollTelegramBotAuthSession(sessionToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: JwtUserPayload) {
    return this.authService.getMe(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link/email')
  linkEmail(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: LinkEmailDto,
  ) {
    return this.authService.linkEmailAndPasswordToUser(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link/google')
  linkGoogle(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: GoogleAuthDto,
  ) {
    return this.authService.linkGoogleToUser(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link/telegram-widget')
  linkTelegramWidget(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: TelegramWidgetDto,
  ) {
    return this.authService.linkTelegramWidgetToUser(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('link/telegram-code')
  createTelegramLinkCode(@CurrentUser() user: JwtUserPayload) {
    return this.authService.createTelegramLinkCodeForUser(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('unlink/:provider')
  unlinkProvider(
    @CurrentUser() user: JwtUserPayload,
    @Param('provider') provider: 'google' | 'telegram' | 'password',
  ) {
    return this.authService.unlinkProvider(user.userId, provider);
  }
}
