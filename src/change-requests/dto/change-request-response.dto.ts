// 변경 요청 응답. ChangeRequest 엔티티를 그대로 노출
import { ApiProperty } from '@nestjs/swagger';
import { ChangeRequest, ChangeRequestStatus } from '@generated/prisma/client';

export class ChangeRequestResponseDto {
  @ApiProperty({ description: '변경 요청 ID', example: 5 })
  id: number;
  @ApiProperty({ description: '대상 발주서 ID', example: 1 })
  purchaseOrderId: number;
  @ApiProperty({ description: '요청자(주문자) ID', example: 10 })
  requesterId: number;
  @ApiProperty({ description: '변경 사유', example: '수량을 늘려야 합니다' })
  reason: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '필드별 변경 내역',
    example: { quantity: { old: 1000, new: 1500 } },
  })
  changes: Record<string, unknown>;
  @ApiProperty({
    enum: ChangeRequestStatus,
    description: '변경 요청 처리 상태',
    example: ChangeRequestStatus.APPROVED,
  })
  status: ChangeRequestStatus;
  @ApiProperty({ nullable: true, description: '검토자(소싱팀) ID. 처리 전에는 null', example: 3 })
  reviewerId: number | null;
  @ApiProperty({ nullable: true, description: '검토 의견', example: '승인합니다' })
  reviewComment: string | null;
  @ApiProperty({ nullable: true, description: '검토 시각', example: '2026-06-13T00:00:00.000Z' })
  reviewedAt: Date | null;
  @ApiProperty({ description: '생성 시각', example: '2026-06-13T00:00:00.000Z' })
  createdAt: Date;
  @ApiProperty({ description: '수정 시각', example: '2026-06-13T00:00:00.000Z' })
  updatedAt: Date;

  static fromEntity(entity: ChangeRequest): ChangeRequestResponseDto {
    const dto = new ChangeRequestResponseDto();
    dto.id = entity.id;
    dto.purchaseOrderId = entity.purchaseOrderId;
    dto.requesterId = entity.requesterId;
    dto.reason = entity.reason;
    dto.changes = entity.changes as Record<string, unknown>;
    dto.status = entity.status;
    dto.reviewerId = entity.reviewerId;
    dto.reviewComment = entity.reviewComment;
    dto.reviewedAt = entity.reviewedAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
