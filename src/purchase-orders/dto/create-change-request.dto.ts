// 발주서 변경 요청 본문. 주문자가 변경 사유와 필드별 변경 내역을 담아 전달
import { IsInt, IsNotEmpty, IsObject, IsString, Min } from 'class-validator';

export class CreateChangeRequestDto {
  // 변경을 요청하는 주문자(users.id)
  @IsInt()
  @Min(1)
  requesterId: number;

  // 변경 사유
  @IsString()
  @IsNotEmpty()
  reason: string;

  // 필드별 변경 내역. 예: { "quantity": { "old": 1000, "new": 1500 } }
  @IsObject()
  @IsNotEmpty()
  changes: Record<string, unknown>;
}
