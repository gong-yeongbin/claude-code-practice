// 한국 표준시(KST, UTC+9) 날짜 포맷 유틸. 한국은 서머타임이 없어 고정 +09:00 오프셋을 사용한다.
// DB(@db.Timestamptz)는 UTC로 저장하고, API 응답 경계에서만 KST로 변환한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 타임스탬프(Date)를 KST 기준 ISO 8601 문자열(예: 2026-06-13T09:00:00.000+09:00)로 변환한다.
export function toKstIsoString(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().replace('Z', '+09:00');
}

// 날짜-only(@db.Date) 값을 타임존 변환 없이 YYYY-MM-DD 문자열로 변환한다.
// Prisma는 @db.Date를 UTC 자정 Date로 돌려주므로 UTC 기준 날짜 부분을 그대로 취한다.
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD 날짜를 KST 기준 '그 날 시작'(00:00:00+09:00) 시각으로 변환한다.
// 형식이 틀리거나 존재하지 않는 날짜(예: 2026-02-31)면 null을 반환한다.
export function kstStartOfDay(dateStr: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(dateStr)) {
    return null;
  }
  const date = new Date(`${dateStr}T00:00:00.000+09:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // new Date는 2026-02-31을 3월로 롤오버하므로, KST 기준 날짜가 입력과 같은지 역검증한다.
  if (toDateOnlyString(new Date(date.getTime() + KST_OFFSET_MS)) !== dateStr) {
    return null;
  }
  return date;
}

// 객체/배열을 재귀 순회하며 모든 Date 인스턴스를 KST ISO 문자열로 치환한 새 값을 반환한다.
// 날짜-only 필드는 DTO 레이어에서 이미 문자열로 포맷되므로 여기서 다시 변환되지 않는다.
export function deepConvertDatesToKst(value: unknown): unknown {
  if (value instanceof Date) {
    return toKstIsoString(value);
  }
  if (Array.isArray(value)) {
    return value.map(deepConvertDatesToKst);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = deepConvertDatesToKst(val);
    }
    return result;
  }
  return value;
}
