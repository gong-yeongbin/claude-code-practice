// 발주서 제출(DRAFT→PENDING) 본문. 주문자 본인 확인을 위해 요청자 ID를 받는다
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitPurchaseOrderDto {
  // 제출을 요청하는 주문자(users.id). 발주서의 buyerId와 일치해야 한다
  @ApiProperty({ description: '요청자(주문자) ID', minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  requesterId: number;
}
