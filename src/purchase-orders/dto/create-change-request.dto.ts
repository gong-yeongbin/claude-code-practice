// 발주서 변경 요청 본문. 주문자가 변경 사유와 필드별 변경 내역을 담아 전달
import { IsInt, IsNotEmpty, IsNotEmptyObject, IsObject, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsValidChanges } from './is-valid-changes.validator';

export class CreateChangeRequestDto {
  // 변경을 요청하는 주문자(users.id)
  @ApiProperty({ description: '요청자(주문자) ID', minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  requesterId: number;

  // 변경 사유
  @ApiProperty({ description: '변경 사유', example: '수량을 늘려야 합니다' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  // 필드별 변경 내역. 변경 항목이 최소 1개는 있어야 한다(빈 객체 불가).
  // 허용 필드(product_name/quantity/unit_price/delivery_date/spec)만, 각 항목은
  // { new: ... } 형태로 타입·범위가 유효해야 한다. 예: { "quantity": { "old": 1000, "new": 1500 } }
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      '필드별 변경 내역. 허용 필드(product_name/quantity/unit_price/delivery_date/spec)만, 각 항목은 { new: ... } 형태',
    example: { quantity: { old: 1000, new: 1500 } },
  })
  @IsObject()
  @IsNotEmptyObject()
  @IsValidChanges()
  changes: Record<string, unknown>;
}
