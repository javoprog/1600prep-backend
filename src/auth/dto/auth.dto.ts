import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  credential!: string;
}

export class TelegramWidgetDto {
  @IsNotEmpty()
  id!: string | number;

  @IsString()
  @IsNotEmpty()
  first_name!: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsNotEmpty()
  auth_date!: number | string;

  @IsString()
  @IsNotEmpty()
  hash!: string;
}

export class LinkEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
