// 성공 응답을 공통 ApiResponse 구조로 감싸는 전역 인터셉터
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '@/common/dto/api-response.dto';
import { RESPONSE_MESSAGE } from '@/common/decorators/response-message.decorator';
import { deepConvertDatesToKst, toKstIsoString } from '@/common/utils/date-format';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const http = context.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    const customMessage = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((data) => {
        const statusCode = res.statusCode;
        if (statusCode === 204 || data === undefined || data === null) {
          return data;
        }
        return {
          success: true,
          statusCode,
          message: customMessage ?? 'OK',
          // 응답 data에 포함된 모든 타임스탬프(Date)를 KST(+09:00)로 변환한다
          data: deepConvertDatesToKst(data) as T,
          timestamp: toKstIsoString(new Date()),
          path: req.url,
        };
      }),
    );
  }
}
