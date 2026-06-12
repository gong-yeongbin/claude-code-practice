// ReviewChangeRequestDto의 class-validator 규칙(반려 시 의견 필수 등)을 검증하는 유닛 테스트
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReviewChangeRequestDto } from './review-change-request.dto';
import { ChangeRequestStatus } from '../../../generated/prisma/client';

describe('ReviewChangeRequestDto', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(ReviewChangeRequestDto, payload);
    return validate(dto);
  }

  it('승인 시 의견을 생략해도 통과한다', async () => {
    const errors = await validateDto({
      status: ChangeRequestStatus.APPROVED,
      reviewerId: 3,
    });

    expect(errors).toHaveLength(0);
  });

  it('반려 시 의견이 있으면 통과한다', async () => {
    const errors = await validateDto({
      status: ChangeRequestStatus.REJECTED,
      reviewerId: 3,
      reviewComment: '근거가 부족합니다',
    });

    expect(errors).toHaveLength(0);
  });

  it('반려 시 의견이 없으면 reviewComment 에러가 발생한다', async () => {
    const errors = await validateDto({
      status: ChangeRequestStatus.REJECTED,
      reviewerId: 3,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('reviewComment');
  });

  it('status가 APPROVED/REJECTED가 아니면 에러가 발생한다', async () => {
    const errors = await validateDto({
      status: ChangeRequestStatus.PENDING,
      reviewerId: 3,
    });

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('reviewerId가 없으면 에러가 발생한다', async () => {
    const errors = await validateDto({
      status: ChangeRequestStatus.APPROVED,
    });

    expect(errors.some((e) => e.property === 'reviewerId')).toBe(true);
  });
});
