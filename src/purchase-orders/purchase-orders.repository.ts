// 발주서 생성을 담당하는 Repository. 트랜잭션으로 PurchaseOrder와 v1 Version을 함께 생성
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeRequest,
  ChangeRequestStatus,
  Prisma,
  PurchaseOrderVersion,
} from '../../generated/prisma/client';
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

    return { ...order, currentVersionData: version! };
  }

  async findApprovalHistories(purchaseOrderId: number): Promise<ChangeRequest[]> {
    return this.prisma.changeRequest.findMany({
      where: { purchaseOrderId, status: ChangeRequestStatus.APPROVED },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest> {
    return this.prisma.changeRequest.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        requesterId: input.requesterId,
        reason: input.reason,
        changes: input.changes,
      },
    });
  }

  async findVersion(purchaseOrderId: number, versionNo: number): Promise<PurchaseOrderVersion | null> {
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
