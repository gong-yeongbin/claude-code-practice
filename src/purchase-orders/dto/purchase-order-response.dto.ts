// 발주서 생성 응답. PurchaseOrder 메타와 생성된 v1 버전의 도메인 필드를 합쳐 노출
import { PurchaseOrder, PurchaseOrderVersion, OrderStatus } from '../../../generated/prisma/client';

// Repository.create가 반환하는, 발주서와 현재 버전을 합친 구조
export type PurchaseOrderWithVersion = PurchaseOrder & {
  currentVersionData: PurchaseOrderVersion;
};

export class PurchaseOrderResponseDto {
  id: number;
  orderNo: string;
  buyerId: number;
  status: OrderStatus;
  currentVersion: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  deliveryDate: Date;
  spec: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: PurchaseOrderWithVersion): PurchaseOrderResponseDto {
    const version = entity.currentVersionData;
    const dto = new PurchaseOrderResponseDto();
    dto.id = entity.id;
    dto.orderNo = entity.orderNo;
    dto.buyerId = entity.buyerId;
    dto.status = entity.status;
    dto.currentVersion = entity.currentVersion;
    dto.productName = version.productName;
    dto.quantity = version.quantity;
    dto.unitPrice = version.unitPrice.toString();
    dto.deliveryDate = version.deliveryDate;
    dto.spec = version.spec as Record<string, unknown> | null;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
