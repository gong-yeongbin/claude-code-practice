// 발주서 생성 응답. PurchaseOrder 메타와 생성된 v1 버전의 도메인 필드를 합쳐 노출
import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrder, PurchaseOrderVersion, OrderStatus } from '@generated/prisma/client';

// Repository.create가 반환하는, 발주서와 현재 버전을 합친 구조
export type PurchaseOrderWithVersion = PurchaseOrder & {
  currentVersionData: PurchaseOrderVersion;
};

export class PurchaseOrderResponseDto {
  @ApiProperty({ description: '발주서 ID', example: 1 })
  id: number;
  @ApiProperty({ description: '발주 번호', example: 'PO-20260613-0001' })
  orderNo: string;
  @ApiProperty({ description: '주문자(buyer) ID', example: 10 })
  buyerId: number;
  @ApiProperty({
    enum: OrderStatus,
    description: '발주서 워크플로우 상태',
    example: OrderStatus.CONFIRMED,
  })
  status: OrderStatus;
  @ApiProperty({ description: '현재 유효 버전 번호', example: 1 })
  currentVersion: number;
  @ApiProperty({ description: '상품명', example: '코튼 티셔츠' })
  productName: string;
  @ApiProperty({ description: '수량', example: 1000 })
  quantity: number;
  @ApiProperty({ description: '단가(문자열, Decimal 정밀도 보존)', example: '5500.00' })
  unitPrice: string;
  @ApiProperty({ description: '납기일', example: '2026-03-15' })
  deliveryDate: Date;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: '사양',
    example: { color: '블랙', size: 'L' },
  })
  spec: Record<string, unknown> | null;
  @ApiProperty({ description: '생성 시각', example: '2026-06-13T00:00:00.000Z' })
  createdAt: Date;
  @ApiProperty({ description: '수정 시각', example: '2026-06-13T00:00:00.000Z' })
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
