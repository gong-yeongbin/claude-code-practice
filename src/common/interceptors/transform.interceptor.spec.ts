// TransformInterceptor가 성공 응답을 ApiResponse 구조로 감싸는지 검증하는 유닛 테스트
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { ApiResponse } from '../dto/api-response.dto';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let reflector: { getAllAndOverride: jest.Mock };

  // statusCode와 url을 받아 ExecutionContext mock을 생성한다
  const createContext = (statusCode: number, url = '/users'): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
        getRequest: () => ({ url }),
      }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  // 핸들러 반환값을 흘려보내는 CallHandler mock
  const createNext = (data: unknown): CallHandler => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    interceptor = new TransformInterceptor(reflector as unknown as Reflector);
  });

  it('데이터를 success: true ApiResponse 구조로 감싼다', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = (await lastValueFrom(
      interceptor.intercept(createContext(200), createNext({ id: 1 })),
    )) as ApiResponse<{ id: number }>;

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.message).toBe('OK');
    expect(result.data).toEqual({ id: 1 });
    expect(result.path).toBe('/users');
    expect(typeof result.timestamp).toBe('string');
  });

  it('@ResponseMessage 메타데이터가 있으면 그 메시지를 사용한다', async () => {
    reflector.getAllAndOverride.mockReturnValue('생성 완료');

    const result = (await lastValueFrom(
      interceptor.intercept(createContext(201), createNext({ id: 1 })),
    )) as ApiResponse<{ id: number }>;

    expect(result.message).toBe('생성 완료');
    expect(result.statusCode).toBe(201);
  });

  it('204 응답은 감싸지 않고 원본을 그대로 반환한다', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await lastValueFrom(
      interceptor.intercept(createContext(204), createNext(undefined)),
    );

    expect(result).toBeUndefined();
  });

  it('data가 null이면 감싸지 않고 null을 반환한다', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await lastValueFrom(interceptor.intercept(createContext(200), createNext(null)));

    expect(result).toBeNull();
  });
});
