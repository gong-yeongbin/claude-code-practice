// 변경 요청 승인/반려 비즈니스 로직. 상태 전이 검증과 검토 결과 기록을 담당하며,
// 승인 시에는 changes를 적용한 다음 버전을 발주서에 반영한다.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeRequestsRepository, NextVersionFields } from './change-requests.repository';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import {
  ChangeRequest,
  ChangeRequestStatus,
  Prisma,
  PurchaseOrderVersion,
} from '../../generated/prisma/client';

@Injectable()
export class ChangeRequestsService {
  constructor(private readonly changeRequestsRepository: ChangeRequestsRepository) {}

  // 변경 요청을 승인/반려하고 검토자·의견·검토시각을 기록한다.
  // 대상이 없으면 NotFoundException, 이미 처리된(PENDING이 아닌) 요청이면 ConflictException
  async review(id: string, dto: ReviewChangeRequestDto): Promise<ChangeRequestResponseDto> {
    const changeRequestId = Number(id);
    const changeRequest = await this.changeRequestsRepository.findById(changeRequestId);
    if (!changeRequest) {
      throw new NotFoundException(`ChangeRequest ${id} not found`);
    }
    if (changeRequest.status !== ChangeRequestStatus.PENDING) {
      throw new ConflictException(`ChangeRequest ${id} is already ${changeRequest.status}`);
    }

    const reviewedAt = new Date();
    const updated =
      dto.status === ChangeRequestStatus.APPROVED
        ? await this.approve(changeRequest, dto, reviewedAt)
        : await this.changeRequestsRepository.updateReview(changeRequestId, {
            status: dto.status,
            reviewerId: dto.reviewerId,
            reviewComment: dto.reviewComment ?? null,
            reviewedAt,
          });
    return ChangeRequestResponseDto.fromEntity(updated);
  }

  // 승인 처리. 현재 버전에 changes를 적용한 다음 버전을 만들어 발주서에 반영한다.
  private async approve(
    changeRequest: ChangeRequest,
    dto: ReviewChangeRequestDto,
    reviewedAt: Date,
  ): Promise<ChangeRequest> {
    const currentVersion = await this.changeRequestsRepository.findCurrentVersion(
      changeRequest.purchaseOrderId,
    );
    if (!currentVersion) {
      throw new NotFoundException(
        `Current version for PurchaseOrder ${changeRequest.purchaseOrderId} not found`,
      );
    }

    return this.changeRequestsRepository.applyApproval({
      changeRequestId: changeRequest.id,
      purchaseOrderId: changeRequest.purchaseOrderId,
      nextVersionNo: currentVersion.versionNo + 1,
      nextVersion: this.applyChanges(currentVersion, changeRequest.changes),
      reviewerId: dto.reviewerId,
      reviewComment: dto.reviewComment ?? null,
      reviewedAt,
    });
  }

  // 현재 버전 스냅샷에 changes(snake_case 키, 각 값의 new 사용)를 적용해 다음 버전 필드를 만든다.
  // 변경 가능 필드(product_name/quantity/unit_price/delivery_date/spec) 외의 키는 무시한다.
  private applyChanges(
    current: PurchaseOrderVersion,
    changes: Prisma.JsonValue,
  ): NextVersionFields {
    const next: NextVersionFields = {
      productName: current.productName,
      quantity: current.quantity,
      unitPrice: current.unitPrice.toString(),
      deliveryDate: current.deliveryDate,
      spec: current.spec ?? undefined,
    };

    const entries = Object.entries(changes as Record<string, { new?: unknown }>);
    for (const [key, value] of entries) {
      const newValue = value?.new;
      switch (key) {
        case 'product_name':
          next.productName = String(newValue);
          break;
        case 'quantity':
          next.quantity = Number(newValue);
          break;
        case 'unit_price':
          next.unitPrice = String(newValue);
          break;
        case 'delivery_date':
          next.deliveryDate = new Date(newValue as string);
          break;
        case 'spec':
          next.spec = newValue as Prisma.InputJsonValue;
          break;
        // 그 외 키는 무시
      }
    }
    return next;
  }
}
