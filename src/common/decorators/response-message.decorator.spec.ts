// ResponseMessage 데코레이터가 대상에 메시지 메타데이터를 설정하는지 검증하는 유닛 테스트
import { Reflector } from '@nestjs/core';
import { ResponseMessage, RESPONSE_MESSAGE } from './response-message.decorator';

describe('ResponseMessage', () => {
  it('데코레이터로 지정한 메시지를 메타데이터로 설정한다', () => {
    @ResponseMessage('생성 완료')
    class TestController {}

    const reflector = new Reflector();
    const message = reflector.get<string>(RESPONSE_MESSAGE, TestController);

    expect(message).toBe('생성 완료');
  });

  it('데코레이터를 붙이지 않은 대상은 메타데이터가 없다', () => {
    class TestController {}

    const reflector = new Reflector();
    const message = reflector.get<string>(RESPONSE_MESSAGE, TestController);

    expect(message).toBeUndefined();
  });
});
