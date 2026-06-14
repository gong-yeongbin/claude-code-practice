import { ApiProperty } from '@nestjs/swagger';
import { User, UserRole } from '@generated/prisma/client';

export class UserResponseDto {
  @ApiProperty({ description: '사용자 ID', example: 1 })
  id: number;
  @ApiProperty({ description: '사용자 이름', example: '홍길동' })
  name: string;
  @ApiProperty({ enum: UserRole, description: '사용자 역할', example: UserRole.BUYER })
  role: UserRole;
  @ApiProperty({ description: '생성 시각', example: '2026-06-13T09:00:00.000+09:00' })
  createdAt: Date;
  @ApiProperty({ description: '수정 시각', example: '2026-06-13T09:00:00.000+09:00' })
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.name = user.name;
    dto.role = user.role;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
