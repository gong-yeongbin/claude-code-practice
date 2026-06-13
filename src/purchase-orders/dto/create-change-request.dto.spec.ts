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
});
