// 발주서 특정 버전 조회 응답. PurchaseOrderVersion 스냅샷 필드를 노출
import { PurchaseOrderVersion } from '../../../generated/prisma/client';

export class PurchaseOrderVersionResponseDto {
  id: number;
  purchaseOrderId: number;
  versionNo: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  deliveryDate: Date;
  spec: Record<string, unknown> | null;
  changeRequestId: number | null;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;

  static fromEntity(entity: PurchaseOrderVersion): PurchaseOrderVersionResponseDto {
    const dto = new PurchaseOrderVersionResponseDto();
    dto.id = entity.id;
    dto.purchaseOrderId = entity.purchaseOrderId;
    dto.versionNo = entity.versionNo;
    dto.productName = entity.productName;
    dto.quantity = entity.quantity;
    dto.unitPrice = entity.unitPrice.toString();
    dto.deliveryDate = entity.deliveryDate;
    dto.spec = entity.spec as Record<string, unknown> | null;
    dto.changeRequestId = entity.changeRequestId;
    dto.validFrom = entity.validFrom;
    dto.validTo = entity.validTo;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
