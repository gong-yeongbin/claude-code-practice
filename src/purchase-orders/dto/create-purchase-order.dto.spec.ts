// CreatePurchaseOrderDto의 class-validator 규칙(unitPrice 형식 등)을 검증하는 유닛 테스트
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';

describe('CreatePurchaseOrderDto', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreatePurchaseOrderDto, payload);
    return validate(dto);
  }

  const validPayload = {
    buyerId: 10,
    productName: '코튼 티셔츠',
    quantity: 1000,
    unitPrice: '5500.00',
    deliveryDate: '2026-03-15',
  };

  it('유효한 페이로드면 통과한다', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  describe('unitPrice', () => {
    it('음수면 에러가 발생한다', async () => {
      const errors = await validateDto({ ...validPayload, unitPrice: '-100' });

      expect(errors.some((e) => e.property === 'unitPrice')).toBe(true);
    });

    it('소수 자리가 2자리를 초과하면 에러가 발생한다', async () => {
      const errors = await validateDto({ ...validPayload, unitPrice: '100.123' });

      expect(errors.some((e) => e.property === 'unitPrice')).toBe(true);
    });

    it('정수부가 10자리를 초과하면 에러가 발생한다', async () => {
      const errors = await validateDto({ ...validPayload, unitPrice: '12345678901' });

      expect(errors.some((e) => e.property === 'unitPrice')).toBe(true);
    });

    it('소수점 없는 정수 단가도 통과한다', async () => {
      const errors = await validateDto({ ...validPayload, unitPrice: '5500' });

      expect(errors).toHaveLength(0);
    });
  });
});
