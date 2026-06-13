// changes JSON 내용을 검증하는 커스텀 class-validator 데코레이터.
// 허용 필드만 포함하고, 각 항목이 { new: ... } 형태이며 new 값의 타입/범위가
// 유효해야 통과한다. 승인 시 적용되는 필드(snake_case)와 동일한 키를 검증한다.
import { registerDecorator, ValidationOptions } from 'class-validator';

// 변경 가능한 필드. ChangeRequestsService.applyChanges가 적용하는 키와 일치해야 한다.
const ALLOWED_FIELDS = ['product_name', 'quantity', 'unit_price', 'delivery_date', 'spec'] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

// unit_price: Decimal(12,2). 문자열/숫자로 표현된 0 초과 유한수만 허용
function isPositiveNumeric(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

// 필드별 new 값의 타입·범위 검증
function isValidNewValue(field: AllowedField, newValue: unknown): boolean {
  switch (field) {
    case 'product_name':
      return typeof newValue === 'string' && newValue.trim().length > 0;
    case 'quantity':
      return typeof newValue === 'number' && Number.isInteger(newValue) && newValue >= 1;
    case 'unit_price':
      return isPositiveNumeric(newValue);
    case 'delivery_date':
      return typeof newValue === 'string' && !Number.isNaN(Date.parse(newValue));
    case 'spec':
      return typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue);
  }
}

function isValidChanges(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([key, item]) => {
    if (!ALLOWED_FIELDS.includes(key as AllowedField)) {
      return false;
    }
    if (typeof item !== 'object' || item === null || !('new' in item)) {
      return false;
    }
    return isValidNewValue(key as AllowedField, item.new);
  });
}

export function IsValidChanges(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidChanges',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown): boolean => isValidChanges(value),
        defaultMessage: (): string =>
          `changes must only contain valid entries for: ${ALLOWED_FIELDS.join(', ')}`,
      },
    });
  };
}
