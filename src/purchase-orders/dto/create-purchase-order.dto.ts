// 발주서 생성 요청 본문. 주문자가 상품명·수량·단가·사양·납기일을 담아 전달
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePurchaseOrderDto {
  // 발주서를 생성하는 주문자(users.id)
  @ApiProperty({ description: '주문자(buyer) ID', minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  buyerId: number;

  @ApiProperty({ description: '상품명', maxLength: 255, example: '코튼 티셔츠' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  productName: string;

  @ApiProperty({ description: '수량', minimum: 1, example: 1000 })
  @IsInt()
  @Min(1)
  quantity: number;

  // 단가. Decimal(12,2) 정밀도 보존을 위해 문자열로 받음.
  // 음수·과도한 소수 자리를 막기 위해 정수부 최대 10자리, 소수부 최대 2자리의 양수만 허용
  @ApiProperty({ description: '단가(문자열, Decimal 정밀도 보존)', example: '5500.00' })
  @IsNumberString()
  @IsNotEmpty()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message: 'unitPrice must be a non-negative number with up to 10 integer and 2 decimal digits',
  })
  unitPrice: string;

  @ApiProperty({ description: '납기일(ISO 8601)', example: '2026-03-15' })
  @IsDateString()
  deliveryDate: string;

  // 색상·사이즈 등 유동 사양. 선택 입력
  @ApiProperty({
    required: false,
    additionalProperties: true,
    description: '색상·사이즈 등 유동 사양(선택)',
    example: { color: '블랙', size: 'L' },
  })
  @IsOptional()
  @IsObject()
  spec?: Record<string, unknown>;
}
