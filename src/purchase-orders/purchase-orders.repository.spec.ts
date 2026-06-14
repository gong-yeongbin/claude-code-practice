// PurchaseOrdersRepository의 트랜잭션 생성을 실제 PrismaService와 연결해 검증하는 통합 테스트 (mock 금지)
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { PrismaService } from '@/prisma/prisma.service';
import { PurchaseOrdersRepository, CreatePurchaseOrderInput } from './purchase-orders.repository';
import { ChangeRequestStatus, OrderStatus, UserRole } from '@generated/prisma/client';

describe('PurchaseOrdersRepository', () => {
  let repository: PurchaseOrdersRepository;
  let prisma: PrismaService;
  let buyerId: number;

  const baseInput = (): CreatePurchaseOrderInput => ({
    orderNo: `PO-TEST-${Math.floor(Math.random() * 1e9)}`,
    buyerId,
    productName: '코튼 티셔츠',
    quantity: 1000,
    unitPrice: '5500.00',
    deliveryDate: new Date('2026-03-15'),
    spec: { color: '블랙', size: 'L' },
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [PurchaseOrdersRepository],
    }).compile();

    repository = module.get<PurchaseOrdersRepository>(PurchaseOrdersRepository);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    const buyer = await prisma.user.create({
      data: { name: '주문자', role: UserRole.BUYER },
    });
    buyerId = buyer.id;
  });

  afterEach(async () => {
    // 자식 → 부모 순으로 정리 (FK 제약)
    await prisma.changeRequest.deleteMany();
    await prisma.purchaseOrderVersion.deleteMany();
    await prisma.purchaseOrder.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('PurchaseOrder와 v1 Version을 트랜잭션으로 생성하고 합친 결과를 반환한다', async () => {
      const input = baseInput();
      const po = await repository.create(input);

      expect(po.id).toBeDefined();
      expect(po.orderNo).toBe(input.orderNo);
      expect(po.buyerId).toBe(buyerId);
      expect(po.status).toBe('DRAFT');
      expect(po.currentVersion).toBe(1);

      expect(po.currentVersionData.versionNo).toBe(1);
      expect(po.currentVersionData.productName).toBe('코튼 티셔츠');
      expect(po.currentVersionData.quantity).toBe(1000);
      expect(po.currentVersionData.unitPrice.toString()).toBe('5500');
      expect(po.currentVersionData.spec).toEqual({ color: '블랙', size: 'L' });
      expect(po.currentVersionData.validFrom).toBeInstanceOf(Date);
      expect(po.currentVersionData.validTo).toBeNull();
    });

    it('spec 없이도 생성된다', async () => {
      const input = baseInput();
      delete input.spec;
      const po = await repository.create(input);

      expect(po.currentVersionData.spec).toBeNull();
    });
  });

  describe('findById', () => {
    it('현재 버전 스냅샷을 합쳐 발주서를 반환한다', async () => {
      const input = baseInput();
      const created = await repository.create(input);

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.orderNo).toBe(input.orderNo);
      expect(found!.currentVersion).toBe(1);
      expect(found!.currentVersionData.versionNo).toBe(1);
      expect(found!.currentVersionData.productName).toBe('코튼 티셔츠');
      expect(found!.currentVersionData.unitPrice.toString()).toBe('5500');
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const found = await repository.findById(999999);

      expect(found).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('발주서 상태를 변경하고 현재 버전 스냅샷을 합쳐 반환한다', async () => {
      const created = await repository.create(baseInput());

      const updated = await repository.updateStatus(created.id, OrderStatus.PENDING);

      expect(updated.id).toBe(created.id);
      expect(updated.status).toBe(OrderStatus.PENDING);
      expect(updated.currentVersion).toBe(1);
      expect(updated.currentVersionData.versionNo).toBe(1);
      expect(updated.currentVersionData.productName).toBe('코튼 티셔츠');

      // DB에도 반영된다
      const found = await repository.findById(created.id);
      expect(found!.status).toBe(OrderStatus.PENDING);
    });
  });

  describe('findUser', () => {
    it('존재하는 사용자를 반환한다', async () => {
      const user = await repository.findUser(buyerId);

      expect(user).not.toBeNull();
      expect(user!.id).toBe(buyerId);
      expect(user!.role).toBe(UserRole.BUYER);
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const user = await repository.findUser(999999);

      expect(user).toBeNull();
    });
  });

  describe('findApprovalHistories', () => {
    it('APPROVED 상태의 변경 요청만 createdAt 오름차순으로 반환한다', async () => {
      const po = await repository.create(baseInput());

      const cr1 = await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '첫 번째 승인',
          changes: { test: 1 },
          status: ChangeRequestStatus.APPROVED,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const cr2 = await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '두 번째 승인',
          changes: { test: 2 },
          status: ChangeRequestStatus.APPROVED,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
      });
      // PENDING은 제외돼야 함
      await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '보류',
          changes: {},
          status: ChangeRequestStatus.PENDING,
        },
      });

      const result = await repository.findApprovalHistories(po.id);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(cr1.id);
      expect(result[1].id).toBe(cr2.id);
      result.forEach((r) => expect(r.status).toBe(ChangeRequestStatus.APPROVED));
    });

    it('REJECTED 상태는 제외한다', async () => {
      const po = await repository.create(baseInput());
      await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '반려',
          changes: {},
          status: ChangeRequestStatus.REJECTED,
        },
      });

      const result = await repository.findApprovalHistories(po.id);

      expect(result).toHaveLength(0);
    });

    it('해당 발주서의 승인 이력이 없으면 빈 배열을 반환한다', async () => {
      const po = await repository.create(baseInput());

      const result = await repository.findApprovalHistories(po.id);

      expect(result).toHaveLength(0);
    });
  });

  describe('createChangeRequest', () => {
    it('PENDING 상태의 변경 요청을 생성해 반환한다', async () => {
      const po = await repository.create(baseInput());

      const cr = await repository.createChangeRequest({
        purchaseOrderId: po.id,
        requesterId: buyerId,
        reason: '수량을 늘려야 합니다',
        changes: { quantity: { old: 1000, new: 1500 } },
      });

      expect(cr.id).toBeDefined();
      expect(cr.purchaseOrderId).toBe(po.id);
      expect(cr.requesterId).toBe(buyerId);
      expect(cr.reason).toBe('수량을 늘려야 합니다');
      expect(cr.changes).toEqual({ quantity: { old: 1000, new: 1500 } });
      expect(cr.status).toBe('PENDING');
      expect(cr.reviewerId).toBeNull();
    });

    it('이미 PENDING 변경 요청이 있으면 ConflictException을 던진다', async () => {
      const po = await repository.create(baseInput());
      const input = {
        purchaseOrderId: po.id,
        requesterId: buyerId,
        reason: '수량 변경',
        changes: { quantity: { old: 1000, new: 1500 } },
      };
      await repository.createChangeRequest(input);

      await expect(repository.createChangeRequest(input)).rejects.toThrow(ConflictException);
    });

    it('동시 생성 시 하나만 성공하고 나머지는 ConflictException으로 막는다', async () => {
      const po = await repository.create(baseInput());
      const input = {
        purchaseOrderId: po.id,
        requesterId: buyerId,
        reason: '수량 변경',
        changes: { quantity: { old: 1000, new: 1500 } },
      };

      const results = await Promise.allSettled([
        repository.createChangeRequest(input),
        repository.createChangeRequest(input),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);

      // PENDING 변경요청은 하나만 존재한다
      const pendings = await prisma.changeRequest.findMany({
        where: { purchaseOrderId: po.id, status: ChangeRequestStatus.PENDING },
      });
      expect(pendings).toHaveLength(1);
    });
  });

  describe('existsPendingChangeRequest', () => {
    it('PENDING 변경 요청이 있으면 true를 반환한다', async () => {
      const po = await repository.create(baseInput());
      await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '대기 중',
          changes: { quantity: { old: 1000, new: 1500 } },
          status: ChangeRequestStatus.PENDING,
        },
      });

      const result = await repository.existsPendingChangeRequest(po.id);

      expect(result).toBe(true);
    });

    it('PENDING 변경 요청이 없으면(APPROVED만 있으면) false를 반환한다', async () => {
      const po = await repository.create(baseInput());
      await prisma.changeRequest.create({
        data: {
          purchaseOrderId: po.id,
          requesterId: buyerId,
          reason: '승인됨',
          changes: { quantity: { old: 1000, new: 1500 } },
          status: ChangeRequestStatus.APPROVED,
        },
      });

      const result = await repository.existsPendingChangeRequest(po.id);

      expect(result).toBe(false);
    });

    it('변경 요청이 전혀 없으면 false를 반환한다', async () => {
      const po = await repository.create(baseInput());

      const result = await repository.existsPendingChangeRequest(po.id);

      expect(result).toBe(false);
    });
  });

  describe('findVersion', () => {
    it('존재하는 버전을 반환한다', async () => {
      const created = await repository.create(baseInput());

      const version = await repository.findVersion(created.id, 1);

      expect(version).not.toBeNull();
      expect(version!.purchaseOrderId).toBe(created.id);
      expect(version!.versionNo).toBe(1);
      expect(version!.productName).toBe('코튼 티셔츠');
      expect(version!.quantity).toBe(1000);
      expect(version!.unitPrice.toString()).toBe('5500');
      expect(version!.spec).toEqual({ color: '블랙', size: 'L' });
      expect(version!.validTo).toBeNull();
    });

    it('존재하지 않는 versionNo이면 null을 반환한다', async () => {
      const created = await repository.create(baseInput());

      const version = await repository.findVersion(created.id, 999);

      expect(version).toBeNull();
    });
  });

  describe('findVersionAt', () => {
    it('validFrom 이후 시각이면 해당 버전을 반환한다', async () => {
      const created = await repository.create(baseInput());
      const afterCreation = new Date(created.currentVersionData.validFrom.getTime() + 1000);

      const version = await repository.findVersionAt(created.id, afterCreation);

      expect(version).not.toBeNull();
      expect(version!.purchaseOrderId).toBe(created.id);
      expect(version!.versionNo).toBe(1);
    });

    it('validFrom 이전 시각이면 null을 반환한다', async () => {
      const created = await repository.create(baseInput());
      const beforeCreation = new Date(created.currentVersionData.validFrom.getTime() - 1000);

      const version = await repository.findVersionAt(created.id, beforeCreation);

      expect(version).toBeNull();
    });

    it('존재하지 않는 발주서 id면 null을 반환한다', async () => {
      const version = await repository.findVersionAt(999999, new Date());

      expect(version).toBeNull();
    });
  });
});
