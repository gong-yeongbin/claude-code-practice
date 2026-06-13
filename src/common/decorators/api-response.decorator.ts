// 전역 TransformInterceptor/AllExceptionsFilter가 모든 응답을 ApiResponse<T> 구조로
// 감싸므로(src/common/dto/api-response.dto.ts), Swagger 문서도 그 래퍼를 반영하도록 돕는
// 데코레이터 모음. 성공 응답은 data에 실제 DTO를, 에러 응답은 공통 에러 구조를 표현한다.
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

interface WrappedOptions {
  status?: number;
  description?: string;
  isArray?: boolean;
}

// 성공 응답: { success, statusCode, message, data, timestamp, path } 형태로 data에 model을 끼운다
export function ApiWrappedResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: WrappedOptions = {},
) {
  const status = options.status ?? 200;
  const dataSchema = options.isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description: options.description,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: status },
          message: { type: 'string', example: 'OK' },
          data: dataSchema,
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string', example: '/purchase-orders/1' },
        },
      },
    }),
  );
}

// 에러 응답: AllExceptionsFilter가 감싸는 { success:false, statusCode, message, error, ... } 구조
export function ApiErrorResponse(status: number, description: string) {
  return ApiResponse({
    status,
    description,
    schema: {
      properties: {
        success: { type: 'boolean', example: false },
        statusCode: { type: 'number', example: status },
        message: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
        error: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        path: { type: 'string' },
      },
    },
  });
}
