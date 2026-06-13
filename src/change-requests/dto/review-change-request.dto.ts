// 변경 요청 승인/반려 본문. 소싱팀이 상태와 검토자, 검토 의견을 담아 전달
import { IsIn, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChangeRequestStatus } from '@generated/prisma/client';

export class ReviewChangeRequestDto {
  // 변경할 상태. 승인(APPROVED) 또는 반려(REJECTED)만 허용
  @ApiProperty({
    enum: [ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED],
    description: '승인(APPROVED) 또는 반려(REJECTED)',
    example: ChangeRequestStatus.APPROVED,
  })
  @IsIn([ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED])
  status: ChangeRequestStatus;

  // 검토한 소싱팀 담당자(users.id)
  @ApiProperty({ description: '검토자(소싱팀) ID', minimum: 1, example: 3 })
  @IsInt()
  @Min(1)
  reviewerId: number;

  // 검토 의견. 반려 시 필수, 승인 시 선택
  @ApiProperty({
    required: false,
    description: '검토 의견. 반려 시 필수, 승인 시 선택',
    example: '승인합니다',
  })
  @ValidateIf((o: ReviewChangeRequestDto) => o.status === ChangeRequestStatus.REJECTED)
  @IsString()
  @IsNotEmpty()
  reviewComment?: string;
}
