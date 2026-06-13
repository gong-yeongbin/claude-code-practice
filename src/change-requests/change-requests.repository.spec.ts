// ChangeRequestsRepository를 실제 PrismaService와 연결해 DB 조작을 검증하는 통합 테스트 (mock 금지)
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@/prisma/prisma.module';
import { PrismaService } from '@/prisma/prisma.service';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestStatus, UserRole } from '@generated/prisma/client';

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
    await prisma.purchaseOrderVersion.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
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

  // 발주서 + v1 버전 + PENDING 변경요청을 만들어 승인 처리의 선행 상태를 구성한다
  async function seedScenario() {
    const requester = await createUser('주문자', UserRole.BUYER);
    const order = await prisma.purchaseOrder.create({
      data: { orderNo: `PO-CR-${Date.now()}-${Math.random()}`, buyerId: requester.id },
    });
    orderIds.push(order.id);
    const v1 = await prisma.purchaseOrderVersion.create({
      data: {
        purchaseOrderId: order.id,
        versionNo: 1,
        productName: '코튼 티셔츠',
        quantity: 1000,
        unitPrice: '5500.00',
        deliveryDate: new Date('2026-03-15'),
        validFrom: order.createdAt,
      },
    });
    const changeRequest = await prisma.changeRequest.create({
      data: {
        purchaseOrderId: order.id,
        requesterId: requester.id,
        reason: '수량 변경',
        changes: { quantity: { old: 1000, new: 1500 } },
      },
    });
    changeRequestIds.push(changeRequest.id);
    return { order, v1, changeRequest };
  }

  describe('findById', () => {
    it('존재하는 id면 ChangeRequest를 반환한다', async () => {
      const { changeRequest } = await seedScenario();

      const found = await repository.findById(changeRequest.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(changeRequest.id);
      expect(found?.status).toBe(ChangeRequestStatus.PENDING);
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const found = await repository.findById(999999);

      expect(found).toBeNull();
    });
  });

  describe('findReviewer', () => {
    it('존재하는 사용자를 반환한다', async () => {
      const reviewer = await createUser('소싱', UserRole.SOURCING);

      const found = await repository.findReviewer(reviewer.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(reviewer.id);
      expect(found?.role).toBe(UserRole.SOURCING);
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const found = await repository.findReviewer(999999);

      expect(found).toBeNull();
    });
  });

  describe('findCurrentVersion', () => {
    it('validTo가 NULL인 현재 유효 버전을 반환한다', async () => {
      const { order } = await seedScenario();

      const current = await repository.findCurrentVersion(order.id);

      expect(current).not.toBeNull();
      expect(current?.versionNo).toBe(1);
      expect(current?.validTo).toBeNull();
    });

    it('버전이 없으면 null을 반환한다', async () => {
      const current = await repository.findCurrentVersion(999999);

      expect(current).toBeNull();
    });
  });

  describe('updateReview', () => {
    it('반려 상태와 검토자·의견을 기록한다', async () => {
      const { changeRequest } = await seedScenario();
      const reviewer = await createUser('소싱', UserRole.SOURCING);

      const updated = await repository.updateReview(changeRequest.id, {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: reviewer.id,
        reviewComment: '근거가 부족합니다',
        reviewedAt: new Date(),
      });

      expect(updated.status).toBe(ChangeRequestStatus.REJECTED);
      expect(updated.reviewerId).toBe(reviewer.id);
      expect(updated.reviewComment).toBe('근거가 부족합니다');
    });
  });

  describe('applyApproval', () => {
    it('이전 버전을 마감하고 새 버전을 만들며 발주서와 변경요청을 갱신한다', async () => {
      const { order, v1, changeRequest } = await seedScenario();
      const reviewer = await createUser('소싱', UserRole.SOURCING);
      const reviewedAt = new Date();

      const updated = await repository.applyApproval({
        changeRequestId: changeRequest.id,
        purchaseOrderId: order.id,
        nextVersionNo: 2,
        nextVersion: {
          productName: '코튼 티셔츠',
          quantity: 1500,
          unitPrice: '5500.00',
          deliveryDate: new Date('2026-03-15'),
          spec: undefined,
        },
        reviewerId: reviewer.id,
        reviewComment: '승인합니다',
        reviewedAt,
      });

      // 변경요청 승인 기록
      expect(updated.status).toBe(ChangeRequestStatus.APPROVED);
      expect(updated.reviewerId).toBe(reviewer.id);
      expect(updated.reviewComment).toBe('승인합니다');

      // 이전 버전(v1) 마감
      const closed = await prisma.purchaseOrderVersion.findUnique({ where: { id: v1.id } });
      expect(closed?.validTo).not.toBeNull();

      // 새 버전(v2) 생성 + changes 적용
      const v2 = await prisma.purchaseOrderVersion.findUnique({
        where: { purchaseOrderId_versionNo: { purchaseOrderId: order.id, versionNo: 2 } },
      });
      expect(v2).not.toBeNull();
      expect(v2?.quantity).toBe(1500);
      expect(v2?.changeRequestId).toBe(changeRequest.id);
      expect(v2?.validTo).toBeNull();

      // 발주서에 승인된 버전 적용
      const reloaded = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
      expect(reloaded?.currentVersion).toBe(2);
    });
  });
});
