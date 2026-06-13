// 발주서 변경 요청 본문. 주문자가 변경 사유와 필드별 변경 내역을 담아 전달
import { IsInt, IsNotEmpty, IsNotEmptyObject, IsObject, IsString, Min } from 'class-validator';

export class CreateChangeRequestDto {
  // 변경을 요청하는 주문자(users.id)
  @IsInt()
  @Min(1)
  requesterId: number;

  // 변경 사유
  @IsString()
  @IsNotEmpty()
  reason: string;

  // 필드별 변경 내역. 변경 항목이 최소 1개는 있어야 한다(빈 객체 불가).
  // 예: { "quantity": { "old": 1000, "new": 1500 } }
  @IsObject()
  @IsNotEmptyObject()
  changes: Record<string, unknown>;
}
