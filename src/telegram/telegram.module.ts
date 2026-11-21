import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [AuthModule],
  providers: [TelegramService],
})
export class TelegramModule {}
