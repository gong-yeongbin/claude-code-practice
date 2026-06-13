// 두 버전 비교 결과. 엔티티가 아니라 두 PurchaseOrderVersion 스냅샷을 비교해 계산한 응답
import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderVersion } from '@generated/prisma/client';

// 변경된 필드 하나의 이전/이후 값
export interface VersionFieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

export class PurchaseOrderVersionDiffResponseDto {
  @ApiProperty({ description: '대상 발주서 ID', example: 1 })
  purchaseOrderId: number;
  @ApiProperty({ description: '비교 시작 버전 번호', example: 1 })
  fromVersion: number;
  @ApiProperty({ description: '비교 대상 버전 번호', example: 2 })
  toVersion: number;
  // 두 버전 사이에 실제로 바뀐 필드만 담는다. 동일하면 빈 배열
  @ApiProperty({
    type: 'array',
    description: '두 버전 사이에 실제로 바뀐 필드 목록. 동일하면 빈 배열',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        old: {},
        new: {},
      },
    },
    example: [{ field: 'quantity', old: 1000, new: 1500 }],
  })
  changes: VersionFieldChange[];

  static fromVersions(
    from: PurchaseOrderVersion,
    to: PurchaseOrderVersion,
  ): PurchaseOrderVersionDiffResponseDto {
    const dto = new PurchaseOrderVersionDiffResponseDto();
    dto.purchaseOrderId = from.purchaseOrderId;
    dto.fromVersion = from.versionNo;
    dto.toVersion = to.versionNo;
    dto.changes = [];

    if (from.productName !== to.productName) {
      dto.changes.push({ field: 'productName', old: from.productName, new: to.productName });
    }
    if (from.quantity !== to.quantity) {
      dto.changes.push({ field: 'quantity', old: from.quantity, new: to.quantity });
    }
    // unitPrice는 Prisma.Decimal이라 toString으로 정규화해 비교
    const fromPrice = from.unitPrice.toString();
    const toPrice = to.unitPrice.toString();
    if (fromPrice !== toPrice) {
      dto.changes.push({ field: 'unitPrice', old: fromPrice, new: toPrice });
    }
    if (from.deliveryDate.getTime() !== to.deliveryDate.getTime()) {
      dto.changes.push({ field: 'deliveryDate', old: from.deliveryDate, new: to.deliveryDate });
    }
    // spec은 JSON이라 직렬화해 비교. null/undefined는 null로 정규화
    const fromSpec = from.spec ?? null;
    const toSpec = to.spec ?? null;
    if (JSON.stringify(fromSpec) !== JSON.stringify(toSpec)) {
      dto.changes.push({ field: 'spec', old: fromSpec, new: toSpec });
    }

    return dto;
  }
}
