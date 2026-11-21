import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  JwtUserPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkSyncResultsDto,
  SaveAttemptDto,
  SaveSessionDto,
} from './dto/results.dto';
import { ResultsService } from './results.service';

@UseGuards(JwtAuthGuard)
@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: JwtUserPayload) {
    return this.resultsService.getSummary(user.userId);
  }

  @Post('attempts')
  saveAttempt(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: SaveAttemptDto,
  ) {
    return this.resultsService.saveAttempt(user.userId, dto);
  }

  @Post('sessions')
  saveSession(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: SaveSessionDto,
  ) {
    return this.resultsService.saveSession(user.userId, dto);
  }

  @Post('sync')
  syncResults(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: BulkSyncResultsDto,
  ) {
    return this.resultsService.syncResults(user.userId, dto);
  }

  @Delete()
  clearResults(@CurrentUser() user: JwtUserPayload) {
    return this.resultsService.clearResults(user.userId);
  }
}
