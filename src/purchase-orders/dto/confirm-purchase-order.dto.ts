// 발주서 확정(PENDING→CONFIRMED) 본문. 소싱팀(SOURCING) 권한 확인을 위해 요청자 ID를 받는다
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPurchaseOrderDto {
  // 확정을 요청하는 사용자(users.id). 역할이 SOURCING이어야 한다
  @ApiProperty({ description: '요청자(소싱팀) ID', minimum: 1, example: 20 })
  @IsInt()
  @Min(1)
  requesterId: number;
}
