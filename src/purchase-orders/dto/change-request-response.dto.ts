// 발주서 변경 요청 응답. ChangeRequest 엔티티를 그대로 노출
import { ChangeRequest, ChangeRequestStatus } from '@generated/prisma/client';

export class ChangeRequestResponseDto {
  id: number;
  purchaseOrderId: number;
  requesterId: number;
  reason: string;
  changes: Record<string, unknown>;
  status: ChangeRequestStatus;
  reviewerId: number | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
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
