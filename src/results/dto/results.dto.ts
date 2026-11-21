import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveAttemptDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  selectedAnswer!: string;

  @IsArray()
  @IsString({ each: true })
  correctAnswer!: string[];

  @IsBoolean()
  isCorrect!: boolean;

  @IsNumber()
  @Min(0)
  timeSpent!: number;

  @IsNumber()
  timestamp!: number;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  domain!: string;

  @IsString()
  @IsNotEmpty()
  skill!: string;

  @IsOptional()
  @IsString()
  difficulty?: string | null;
}

export class SaveSessionDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  mode!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(0)
  totalQuestions!: number;

  @IsInt()
  @Min(0)
  answeredCount!: number;

  @IsInt()
  @Min(0)
  correctCount!: number;

  @IsNumber()
  @Min(0)
  totalTime!: number;

  @IsNumber()
  startedAt!: number;

  @IsOptional()
  @IsNumber()
  completedAt?: number;
}

export class BulkSyncResultsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAttemptDto)
  attempts?: SaveAttemptDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveSessionDto)
  sessions?: SaveSessionDto[];
}
