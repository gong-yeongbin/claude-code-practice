import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@generated/prisma/client';

export class CreateUserDto {
  @ApiProperty({ description: '사용자 이름', maxLength: 100, example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: UserRole, description: '사용자 역할', example: UserRole.BUYER })
  @IsEnum(UserRole)
  role: UserRole;
}
