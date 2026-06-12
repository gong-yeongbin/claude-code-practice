// PurchaseOrdersService의 생성 로직을 Repository mock 기반으로 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersRepository, CreatePurchaseOrderInput } from './purchase-orders.repository';
import {
  PurchaseOrderResponseDto,
  PurchaseOrderWithVersion,
} from './dto/purchase-order-response.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import {
  ChangeRequest,
  ChangeRequestStatus,
  OrderStatus,
  Prisma,
} from '../../generated/prisma/client';
import { CreateChangeRequestInput } from './purchase-orders.repository';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let repository: {
    create: jest.Mock<Promise<PurchaseOrderWithVersion>, [CreatePurchaseOrderInput]>;
    findById: jest.Mock<Promise<PurchaseOrderWithVersion | null>, [number]>;
    createChangeRequest: jest.Mock<Promise<ChangeRequest>, [CreateChangeRequestInput]>;
  };

  const mockEntity: PurchaseOrderWithVersion = {
    id: 1,
    orderNo: 'PO-20260101-0001',
    buyerId: 10,
    status: OrderStatus.DRAFT,
    currentVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    currentVersionData: {
      id: 1,
      purchaseOrderId: 1,
      versionNo: 1,
      productName: '코튼 티셔츠',
      quantity: 1000,
      unitPrice: new Prisma.Decimal('5500.00'),
      deliveryDate: new Date('2026-03-15T00:00:00Z'),
      spec: { color: '블랙', size: 'L' },
      changeRequestId: null,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  };

  const mockChangeRequest: ChangeRequest = {
    id: 5,
    purchaseOrderId: 1,
    requesterId: 10,
    reason: '수량을 늘려야 합니다',
    changes: { quantity: { old: 1000, new: 1500 } },
    status: ChangeRequestStatus.PENDING,
    reviewerId: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn<Promise<PurchaseOrderWithVersion>, [CreatePurchaseOrderInput]>(),
      findById: jest.fn<Promise<PurchaseOrderWithVersion | null>, [number]>(),
      createChangeRequest: jest.fn<Promise<ChangeRequest>, [CreateChangeRequestInput]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PurchaseOrdersRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  describe('create', () => {
    const dto: CreatePurchaseOrderDto = {
      buyerId: 10,
      productName: '코튼 티셔츠',
      quantity: 1000,
      unitPrice: '5500.00',
      deliveryDate: '2026-03-15',
      spec: { color: '블랙', size: 'L' },
    };

    it('도메인 필드와 서버생성 orderNo로 repository.create를 호출하고 ResponseDto를 반환한다', async () => {
      repository.create.mockResolvedValue(mockEntity);

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledTimes(1);
      const arg = repository.create.mock.calls[0][0];
      expect(arg.buyerId).toBe(10);
      expect(arg.productName).toBe('코튼 티셔츠');
      expect(arg.quantity).toBe(1000);
      expect(arg.unitPrice).toBe('5500.00');
      expect(arg.deliveryDate).toEqual(new Date('2026-03-15'));
      expect(arg.spec).toEqual({ color: '블랙', size: 'L' });
      // orderNo는 서버에서 생성되어 전달된다
      expect(arg.orderNo).toMatch(/^PO-/);

      expect(result).toBeInstanceOf(PurchaseOrderResponseDto);
      expect(result.id).toBe(1);
      expect(result.orderNo).toBe('PO-20260101-0001');
      expect(result.buyerId).toBe(10);
      expect(result.status).toBe(OrderStatus.DRAFT);
      expect(result.currentVersion).toBe(1);
      expect(result.productName).toBe('코튼 티셔츠');
      expect(result.quantity).toBe(1000);
      // Prisma.Decimal은 toString 시 불필요한 0을 정규화한다
      expect(result.unitPrice).toBe('5500');
      expect(result.spec).toEqual({ color: '블랙', size: 'L' });
    });

    it('spec이 없으면 undefined를 그대로 repository에 전달한다', async () => {
      repository.create.mockResolvedValue({
        ...mockEntity,
        currentVersionData: { ...mockEntity.currentVersionData, spec: null },
      });

      const dtoWithoutSpec: CreatePurchaseOrderDto = {
        buyerId: 10,
        productName: '코튼 티셔츠',
        quantity: 1000,
        unitPrice: '5500.00',
        deliveryDate: '2026-03-15',
      };
      const result = await service.create(dtoWithoutSpec);

      const arg = repository.create.mock.calls[0][0];
      expect(arg.spec).toBeUndefined();
      expect(result.spec).toBeNull();
    });
  });

  describe('find', () => {
    it('존재하는 id면 number로 변환해 조회하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);

      const result = await service.find('1');

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(PurchaseOrderResponseDto);
      expect(result.id).toBe(1);
      expect(result.orderNo).toBe('PO-20260101-0001');
      expect(result.currentVersion).toBe(1);
      expect(result.productName).toBe('코튼 티셔츠');
      expect(result.unitPrice).toBe('5500');
      expect(result.spec).toEqual({ color: '블랙', size: 'L' });
    });

    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.find('999')).rejects.toThrow(NotFoundException);
      await expect(service.find('999')).rejects.toThrow('PurchaseOrder 999 not found');
    });
  });

  describe('requestChange', () => {
    const dto: CreateChangeRequestDto = {
      requesterId: 10,
      reason: '수량을 늘려야 합니다',
      changes: { quantity: { old: 1000, new: 1500 } },
    };

    it('발주서가 존재하면 변경 요청을 생성하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.createChangeRequest.mockResolvedValue(mockChangeRequest);

      const result = await service.requestChange('1', dto);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.createChangeRequest).toHaveBeenCalledTimes(1);
      const arg = repository.createChangeRequest.mock.calls[0][0];
      expect(arg.purchaseOrderId).toBe(1);
      expect(arg.requesterId).toBe(10);
      expect(arg.reason).toBe('수량을 늘려야 합니다');
      expect(arg.changes).toEqual({ quantity: { old: 1000, new: 1500 } });

      expect(result).toBeInstanceOf(ChangeRequestResponseDto);
      expect(result.id).toBe(5);
      expect(result.purchaseOrderId).toBe(1);
      expect(result.requesterId).toBe(10);
      expect(result.status).toBe(ChangeRequestStatus.PENDING);
      expect(result.reviewerId).toBeNull();
      expect(result.changes).toEqual({ quantity: { old: 1000, new: 1500 } });
    });

    it('발주서가 존재하지 않으면 NotFoundException을 던지고 변경 요청을 생성하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.requestChange('999', dto)).rejects.toThrow(NotFoundException);
      await expect(service.requestChange('999', dto)).rejects.toThrow(
        'PurchaseOrder 999 not found',
      );
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });
  });
});
