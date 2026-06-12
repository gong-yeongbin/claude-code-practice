// ChangeRequestsModule의 DI 배선이 올바른지 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { ChangeRequestsModule } from './change-requests.module';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';

describe('ChangeRequestsModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [PrismaModule, ChangeRequestsModule],
    }).compile();
  });

  it('컨트롤러와 서비스를 제공한다', () => {
    expect(module.get<ChangeRequestsController>(ChangeRequestsController)).toBeInstanceOf(
      ChangeRequestsController,
    );
    expect(module.get<ChangeRequestsService>(ChangeRequestsService)).toBeInstanceOf(
      ChangeRequestsService,
    );
  });
});
