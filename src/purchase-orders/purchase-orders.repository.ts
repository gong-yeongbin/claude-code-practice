// 발주서 생성을 담당하는 Repository. 트랜잭션으로 PurchaseOrder와 v1 Version을 함께 생성
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
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
}
