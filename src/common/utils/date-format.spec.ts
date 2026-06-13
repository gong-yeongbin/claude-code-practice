// KST 날짜 포맷 유틸 검증
import { deepConvertDatesToKst, toDateOnlyString, toKstIsoString } from './date-format';

describe('date-format', () => {
  describe('toKstIsoString', () => {
    it('UTC 자정을 KST 09:00(+09:00)으로 변환한다', () => {
      expect(toKstIsoString(new Date('2026-06-13T00:00:00.000Z'))).toBe(
        '2026-06-13T09:00:00.000+09:00',
      );
    });

    it('자정 변환 시 날짜가 다음 날로 넘어가도 올바르게 처리한다', () => {
      expect(toKstIsoString(new Date('2026-06-13T15:30:00.000Z'))).toBe(
        '2026-06-14T00:30:00.000+09:00',
      );
    });
  });

  describe('toDateOnlyString', () => {
    it('타임존 변환 없이 YYYY-MM-DD 부분만 취한다', () => {
      expect(toDateOnlyString(new Date('2026-03-15T00:00:00.000Z'))).toBe('2026-03-15');
    });
  });

  describe('deepConvertDatesToKst', () => {
    it('중첩 객체·배열 안의 모든 Date를 KST 문자열로 치환한다', () => {
      const input = {
        createdAt: new Date('2026-06-13T00:00:00.000Z'),
        items: [{ at: new Date('2026-06-13T01:00:00.000Z') }],
        name: '코튼 티셔츠',
        count: 1000,
      };

      expect(deepConvertDatesToKst(input)).toEqual({
        createdAt: '2026-06-13T09:00:00.000+09:00',
        items: [{ at: '2026-06-13T10:00:00.000+09:00' }],
        name: '코튼 티셔츠',
        count: 1000,
      });
    });

    it('Date가 아닌 원시값은 그대로 둔다', () => {
      expect(deepConvertDatesToKst(null)).toBeNull();
      expect(deepConvertDatesToKst('2026-03-15')).toBe('2026-03-15');
      expect(deepConvertDatesToKst(42)).toBe(42);
    });
  });
});
