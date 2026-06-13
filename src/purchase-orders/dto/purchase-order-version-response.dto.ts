// 발주서 특정 버전 조회 응답. PurchaseOrderVersion 스냅샷 필드를 노출
import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderVersion } from '@generated/prisma/client';

export class PurchaseOrderVersionResponseDto {
  @ApiProperty({ description: '버전 레코드 ID', example: 100 })
  id: number;
  @ApiProperty({ description: '대상 발주서 ID', example: 1 })
  purchaseOrderId: number;
  @ApiProperty({ description: '버전 번호', example: 1 })
  versionNo: number;
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
  @ApiProperty({
    nullable: true,
    description: '이 버전을 만든 변경요청 ID. v1은 null',
    example: null,
  })
  changeRequestId: number | null;
  @ApiProperty({ description: '이 버전이 유효해진 시각', example: '2026-06-13T00:00:00.000Z' })
  validFrom: Date;
  @ApiProperty({
    nullable: true,
    description: '다음 버전 생성 시각. 현재 버전은 null',
    example: null,
  })
  validTo: Date | null;
  @ApiProperty({ description: '생성 시각', example: '2026-06-13T00:00:00.000Z' })
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
