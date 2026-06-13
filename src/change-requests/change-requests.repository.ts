// 변경 요청 조회와 승인/반려 처리를 담당하는 Repository
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ChangeRequest,
  ChangeRequestStatus,
  Prisma,
  PurchaseOrderVersion,
  User,
} from '@generated/prisma/client';

// 반려 처리 시 갱신할 검토 결과
export interface UpdateReviewInput {
  status: ChangeRequestStatus;
  reviewerId: number;
  reviewComment: string | null;
  reviewedAt: Date;
}

// 승인 시 새로 생성할 다음 버전의 도메인 필드 (현재 버전에 changes를 적용한 결과)
export interface NextVersionFields {
  productName: string;
  quantity: number;
  unitPrice: string;
  deliveryDate: Date;
  spec: Prisma.InputJsonValue | undefined;
}

// 승인 처리(버전 적용)에 필요한 입력
export interface ApplyApprovalInput {
  changeRequestId: number;
  purchaseOrderId: number;
  nextVersionNo: number;
  nextVersion: NextVersionFields;
  reviewerId: number;
  reviewComment: string | null;
  reviewedAt: Date;
}

@Injectable()
export class ChangeRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<ChangeRequest | null> {
    return this.prisma.changeRequest.findUnique({ where: { id } });
  }

  // 승인/반려 권한 검증을 위해 검토자(users.id)를 조회
  async findReviewer(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // 발주서의 현재 유효 버전(validTo가 NULL인 스냅샷)을 조회
  async findCurrentVersion(purchaseOrderId: number): Promise<PurchaseOrderVersion | null> {
    return this.prisma.purchaseOrderVersion.findFirst({
      where: { purchaseOrderId, validTo: null },
    });
  }

  async updateReview(id: number, input: UpdateReviewInput): Promise<ChangeRequest> {
    return this.prisma.changeRequest.update({ where: { id }, data: input });
  }

  // 승인: 변경요청 선점(낙관적 락) → 이전 버전 마감 → 다음 버전 insert → 발주서 currentVersion 갱신을
  // 하나의 트랜잭션으로 처리한다. 동시 승인 시 두 번째는 ConflictException으로 롤백되어
  // versionNo 중복 insert(유니크 위반)를 방지한다.
  async applyApproval(input: ApplyApprovalInput): Promise<ChangeRequest> {
    return this.prisma.$transaction(async (tx) => {
      // 1. PENDING일 때만 승인으로 선점한다. 이미 처리됐으면 0건 매칭 → 충돌로 롤백
      const claimed = await tx.changeRequest.updateMany({
        where: { id: input.changeRequestId, status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.APPROVED,
          reviewerId: input.reviewerId,
          reviewComment: input.reviewComment,
          reviewedAt: input.reviewedAt,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(`ChangeRequest ${input.changeRequestId} is already processed`);
      }

      // 2. 직전까지 유효하던 버전을 마감(validTo 채움)
      await tx.purchaseOrderVersion.updateMany({
        where: { purchaseOrderId: input.purchaseOrderId, validTo: null },
        data: { validTo: input.reviewedAt },
      });

      // 3. changes가 적용된 다음 버전 스냅샷을 insert
      await tx.purchaseOrderVersion.create({
        data: {
          purchaseOrderId: input.purchaseOrderId,
          versionNo: input.nextVersionNo,
          productName: input.nextVersion.productName,
          quantity: input.nextVersion.quantity,
          unitPrice: input.nextVersion.unitPrice,
          deliveryDate: input.nextVersion.deliveryDate,
          spec: input.nextVersion.spec,
          changeRequestId: input.changeRequestId,
          validFrom: input.reviewedAt,
        },
      });

      // 4. 발주서에 승인된 버전 적용(currentVersion 포인터 이동)
      await tx.purchaseOrder.update({
        where: { id: input.purchaseOrderId },
        data: { currentVersion: input.nextVersionNo },
      });

      // 5. 승인 처리된 변경요청을 반환
      return tx.changeRequest.findUniqueOrThrow({ where: { id: input.changeRequestId } });
    });
  }
}
