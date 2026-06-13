// AllExceptionsFilter가 예외를 ApiResponse 에러 구조로 변환하는지 검증하는 유닛 테스트
import { ArgumentsHost, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiResponse } from '../dto/api-response.dto';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  // status().json() 체이닝이 가능한 Response mock과 ArgumentsHost mock 생성
  const createHost = (url = '/users/1'): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url }),
      }),
    }) as unknown as ArgumentsHost;

  // filter가 res.json에 넘긴 응답 body를 타입과 함께 꺼낸다
  const lastBody = (): ApiResponse<never> => {
    const [body] = jsonMock.mock.calls[0] as [ApiResponse<never>];
    return body;
  };

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    filter = new AllExceptionsFilter();
  });

  it('HttpException(객체 응답)의 status와 message·error를 그대로 사용한다', () => {
    const exception = new NotFoundException('User 1 not found');

    filter.catch(exception, createHost());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = lastBody();
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body.message).toBe('User 1 not found');
    expect(body.error).toBe('Not Found');
    expect(body.path).toBe('/users/1');
    expect(typeof body.timestamp).toBe('string');
  });

  it('HttpException(문자열 응답)은 message에 문자열을 담는다', () => {
    const exception = new HttpException('forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, createHost());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    const body = lastBody();
    expect(body.message).toBe('forbidden');
    expect(body.error).toBeUndefined();
  });

  it('HttpException이 아닌 예외는 500과 기본 메시지로 처리한다', () => {
    // 예기치 못한 예외 로그는 테스트 출력에서 숨긴다
    const loggerSpy = jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

    filter.catch(new Error('boom'), createHost());

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = lastBody();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Internal Server Error');
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });
});
