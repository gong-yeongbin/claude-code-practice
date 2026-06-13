// CreateChangeRequestDto의 class-validator 규칙(변경 항목 1개 이상 필수 등)을 검증하는 유닛 테스트
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateChangeRequestDto } from './create-change-request.dto';

describe('CreateChangeRequestDto', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateChangeRequestDto, payload);
    return validate(dto);
  }

  const validPayload = {
    requesterId: 10,
    reason: '수량을 늘려야 합니다',
    changes: { quantity: { old: 1000, new: 1500 } },
  };

  it('변경 항목이 1개 이상이면 통과한다', async () => {
    const errors = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('changes가 빈 객체면 changes 에러가 발생한다', async () => {
    const errors = await validateDto({ ...validPayload, changes: {} });

    expect(errors.some((e) => e.property === 'changes')).toBe(true);
  });

  it('requesterId가 1 미만이면 에러가 발생한다', async () => {
    const errors = await validateDto({ ...validPayload, requesterId: 0 });

    expect(errors.some((e) => e.property === 'requesterId')).toBe(true);
  });

  it('reason이 비어 있으면 에러가 발생한다', async () => {
    const errors = await validateDto({ ...validPayload, reason: '' });

    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  describe('changes 내용 검증', () => {
    it('허용되지 않은 필드가 있으면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { unknown_field: { old: 1, new: 2 } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('quantity가 1 미만이면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { quantity: { old: 1000, new: 0 } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('quantity가 정수가 아니면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { quantity: { old: 1000, new: 1.5 } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('unit_price가 숫자가 아니면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { unit_price: { old: '5500.00', new: '비싸요' } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('unit_price가 0 이하면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { unit_price: { old: '5500.00', new: '-100' } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('delivery_date가 유효한 날짜가 아니면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { delivery_date: { old: '2026-03-15', new: '날짜아님' } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('항목에 new가 없으면 changes 에러가 발생한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: { quantity: { old: 1000 } },
      });

      expect(errors.some((e) => e.property === 'changes')).toBe(true);
    });

    it('여러 허용 필드를 올바른 값으로 담으면 통과한다', async () => {
      const errors = await validateDto({
        ...validPayload,
        changes: {
          product_name: { old: '코튼 티셔츠', new: '리넨 셔츠' },
          quantity: { old: 1000, new: 1500 },
          unit_price: { old: '5500.00', new: '7000.00' },
          delivery_date: { old: '2026-03-15', new: '2026-03-25' },
          spec: { old: { color: '블랙' }, new: { color: '화이트' } },
        },
      });

      expect(errors).toHaveLength(0);
    });
  });
});
