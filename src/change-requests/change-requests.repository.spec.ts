// ChangeRequestsRepository를 실제 PrismaService와 연결해 DB 조작을 검증하는 통합 테스트 (mock 금지)
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestStatus, UserRole } from '../../generated/prisma/client';

describe('ChangeRequestsRepository', () => {
  let repository: ChangeRequestsRepository;
  let prisma: PrismaService;

  // 다른 통합 테스트와 병렬 실행되므로, 이 테스트가 만든 데이터만 추적해 정리한다
  const userIds: number[] = [];
  const orderIds: number[] = [];
  const changeRequestIds: number[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [ChangeRequestsRepository],
    }).compile();

    repository = module.get<ChangeRequestsRepository>(ChangeRequestsRepository);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.changeRequest.deleteMany({ where: { id: { in: changeRequestIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    changeRequestIds.length = 0;
    orderIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(name: string, role: UserRole) {
    const user = await prisma.user.create({ data: { name, role } });
    userIds.push(user.id);
    return user;
  }

  // 변경 요청 1건을 위해 필요한 선행 데이터(주문자·발주서)를 만들고 PENDING 변경요청을 생성
  async function seedChangeRequest() {
    const requester = await createUser('주문자', UserRole.BUYER);
    const order = await prisma.purchaseOrder.create({
      data: { orderNo: `PO-CR-${Date.now()}-${Math.random()}`, buyerId: requester.id },
    });
    orderIds.push(order.id);
    const changeRequest = await prisma.changeRequest.create({
      data: {
        purchaseOrderId: order.id,
        requesterId: requester.id,
        reason: '수량 변경',
        changes: { quantity: { old: 1000, new: 1500 } },
      },
    });
    changeRequestIds.push(changeRequest.id);
    return changeRequest;
  }

  describe('findById', () => {
    it('존재하는 id면 ChangeRequest를 반환한다', async () => {
      const created = await seedChangeRequest();

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.status).toBe(ChangeRequestStatus.PENDING);
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const found = await repository.findById(999999);

      expect(found).toBeNull();
    });
  });

  describe('updateReview', () => {
    it('승인 상태와 검토자·의견·검토시각을 기록한다', async () => {
      const created = await seedChangeRequest();
      const reviewer = await createUser('소싱', UserRole.SOURCING);
      const reviewedAt = new Date();

      const updated = await repository.updateReview(created.id, {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: reviewer.id,
        reviewComment: '승인합니다',
        reviewedAt,
      });

      expect(updated.status).toBe(ChangeRequestStatus.APPROVED);
      expect(updated.reviewerId).toBe(reviewer.id);
      expect(updated.reviewComment).toBe('승인합니다');
      expect(updated.reviewedAt?.getTime()).toBe(reviewedAt.getTime());
    });

    it('반려 시 의견 없이 null로도 기록할 수 있다', async () => {
      const created = await seedChangeRequest();
      const reviewer = await createUser('소싱', UserRole.SOURCING);

      const updated = await repository.updateReview(created.id, {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: reviewer.id,
        reviewComment: null,
        reviewedAt: new Date(),
      });

      expect(updated.status).toBe(ChangeRequestStatus.REJECTED);
      expect(updated.reviewComment).toBeNull();
    });
  });
});
