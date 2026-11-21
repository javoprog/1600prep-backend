import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf<Context> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      this.logger.log(
        'TELEGRAM_BOT_TOKEN not set — Telegram bot polling is disabled until configured.',
      );
      return;
    }

    try {
      const bot = new Telegraf(token);

      bot.start(async (ctx) => {
        const text =
          ctx.message && 'text' in ctx.message ? ctx.message.text : '';
        const match = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);
        if (match?.[1]) {
          await this.processCode(ctx, match[1]);
          return;
        }

        await ctx.reply(
          'Welcome to 1600prep! To sign in or connect your Telegram account, click "Connect Telegram" on 1600prep or send your 6-digit code here.',
        );
      });

      bot.hears(/^\s*(\d{6})\s*$/, async (ctx) => {
        const code = ctx.match[1];
        await this.processCode(ctx, code);
      });

      bot.catch((err) => {
        this.logger.warn(
          `Telegram bot runtime error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      this.bot = bot;
      bot
        .launch()
        .then(() => {
          this.logger.log('Telegram bot started polling.');
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to launch Telegram bot polling: ${err instanceof Error ? err.message : String(err)}`,
          );
          this.bot = null;
        });
    } catch (err) {
      this.logger.warn(
        `Failed to initialize Telegram bot: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.bot) {
      try {
        this.bot.stop('SIGTERM');
      } catch {
        // Ignore stop errors
      }
      this.bot = null;
    }
  }

  private async processCode(ctx: Context, code: string) {
    const from = ctx.from;
    if (!from) return;

    const res = await this.authService.handleTelegramBotCode(code, {
      id: String(from.id),
      firstName: from.first_name || 'Student',
      lastName: from.last_name,
      username: from.username,
    });

    if (!res.ok) {
      await ctx.reply(`❌ ${res.reason}`);
      return;
    }

    if (res.mode === 'linked') {
      await ctx.reply(
        `✅ Your Telegram account is now connected to your 1600prep account (${res.userName}). You can return to the browser.`,
      );
    } else {
      await ctx.reply(
        `✅ Signed in to 1600prep as ${res.userName}! Return to your browser tab — it will update automatically.`,
      );
    }
  }
}
