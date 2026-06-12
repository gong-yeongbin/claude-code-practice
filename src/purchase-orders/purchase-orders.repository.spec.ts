// PurchaseOrdersRepository의 트랜잭션 생성을 실제 PrismaService와 연결해 검증하는 통합 테스트 (mock 금지)
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrdersRepository, CreatePurchaseOrderInput } from './purchase-orders.repository';
import { UserRole } from '../../generated/prisma/client';

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
});
