// 발주서 생성을 담당하는 Repository. 트랜잭션으로 PurchaseOrder와 v1 Version을 함께 생성
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ChangeRequest,
  ChangeRequestStatus,
  OrderStatus,
  Prisma,
  PurchaseOrderVersion,
  User,
} from '@generated/prisma/client';
import { PurchaseOrderWithVersion } from './dto/purchase-order-response.dto';

// 발주서 생성에 필요한 메타 + v1 도메인 필드
export interface CreatePurchaseOrderInput {
  orderNo: string;
  buyerId: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  deliveryDate: Date;
  spec?: Prisma.InputJsonValue;
}

// 변경 요청 생성에 필요한 입력. status는 PENDING 기본값
export interface CreateChangeRequestInput {
  purchaseOrderId: number;
  requesterId: number;
  reason: string;
  changes: Prisma.InputJsonValue;
}

@Injectable()
export class PurchaseOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithVersion> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          orderNo: input.orderNo,
          buyerId: input.buyerId,
        },
      });

      const version = await tx.purchaseOrderVersion.create({
        data: {
          purchaseOrderId: order.id,
          versionNo: 1,
          productName: input.productName,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          deliveryDate: input.deliveryDate,
          spec: input.spec,
          validFrom: order.createdAt,
        },
      });

      return { ...order, currentVersionData: version };
    });
  }

  async findById(id: number): Promise<PurchaseOrderWithVersion | null> {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) {
      return null;
    }

    const version = await this.prisma.purchaseOrderVersion.findUnique({
      where: {
        purchaseOrderId_versionNo: {
          purchaseOrderId: order.id,
          versionNo: order.currentVersion,
        },
      },
    });

    // currentVersion 포인터가 가리키는 버전이 없으면 데이터 정합성이 깨진 상태.
    // 단언으로 모호하게 크래시하는 대신 명시적으로 실패시켜 로그에 남긴다.
    if (!version) {
      throw new Error(
        `Data integrity error: PurchaseOrder ${id} has no version ${order.currentVersion}`,
      );
    }

    return { ...order, currentVersionData: version };
  }

  // 발주서 워크플로우 상태를 변경하고, 현재 버전 스냅샷을 합쳐 반환한다
  async updateStatus(id: number, status: OrderStatus): Promise<PurchaseOrderWithVersion> {
    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });

    const version = await this.prisma.purchaseOrderVersion.findUnique({
      where: {
        purchaseOrderId_versionNo: {
          purchaseOrderId: order.id,
          versionNo: order.currentVersion,
        },
      },
    });

    if (!version) {
      throw new Error(
        `Data integrity error: PurchaseOrder ${id} has no version ${order.currentVersion}`,
      );
    }

    return { ...order, currentVersionData: version };
  }

  // 확정 권한 검증(소싱팀 여부)을 위해 요청자(users.id)를 조회
  async findUser(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findApprovalHistories(purchaseOrderId: number): Promise<ChangeRequest[]> {
    return this.prisma.changeRequest.findMany({
      where: { purchaseOrderId, status: ChangeRequestStatus.APPROVED },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 동일 발주서에 처리 대기(PENDING) 중인 변경 요청이 있는지 확인한다
  async existsPendingChangeRequest(purchaseOrderId: number): Promise<boolean> {
    const pending = await this.prisma.changeRequest.findFirst({
      where: { purchaseOrderId, status: ChangeRequestStatus.PENDING },
      select: { id: true },
    });
    return pending !== null;
  }

  // 변경요청 생성. 같은 발주서에 대한 동시 생성을 advisory lock으로 직렬화하고,
  // 락을 잡은 뒤 PENDING 중복을 재확인해 경쟁 조건(중복 PENDING 생성)을 막는다.
  // 락은 트랜잭션 종료 시 자동 해제된다.
  async createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${input.purchaseOrderId})`;

      const pending = await tx.changeRequest.findFirst({
        where: { purchaseOrderId: input.purchaseOrderId, status: ChangeRequestStatus.PENDING },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException(
          `PurchaseOrder ${input.purchaseOrderId} already has a pending change request`,
        );
      }

      return tx.changeRequest.create({
        data: {
          purchaseOrderId: input.purchaseOrderId,
          requesterId: input.requesterId,
          reason: input.reason,
          changes: input.changes,
        },
      });
    });
  }

  async findVersion(
    purchaseOrderId: number,
    versionNo: number,
  ): Promise<PurchaseOrderVersion | null> {
    return this.prisma.purchaseOrderVersion.findUnique({
      where: { purchaseOrderId_versionNo: { purchaseOrderId, versionNo } },
    });
  }

  async findVersionAt(purchaseOrderId: number, at: Date): Promise<PurchaseOrderVersion | null> {
    return this.prisma.purchaseOrderVersion.findFirst({
      where: {
        purchaseOrderId,
        validFrom: { lte: at },
        OR: [{ validTo: { gt: at } }, { validTo: null }],
      },
    });
  }
}
