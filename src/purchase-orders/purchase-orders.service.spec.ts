// PurchaseOrdersService의 생성 로직을 Repository mock 기반으로 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  PurchaseOrderVersion,
} from '@generated/prisma/client';
import { CreateChangeRequestInput } from './purchase-orders.repository';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let repository: {
    create: jest.Mock<Promise<PurchaseOrderWithVersion>, [CreatePurchaseOrderInput]>;
    findById: jest.Mock<Promise<PurchaseOrderWithVersion | null>, [number]>;
    createChangeRequest: jest.Mock<Promise<ChangeRequest>, [CreateChangeRequestInput]>;
    existsPendingChangeRequest: jest.Mock<Promise<boolean>, [number]>;
    findApprovalHistories: jest.Mock<Promise<ChangeRequest[]>, [number]>;
    findVersion: jest.Mock<Promise<PurchaseOrderVersion | null>, [number, number]>;
    findVersionAt: jest.Mock<Promise<PurchaseOrderVersion | null>, [number, Date]>;
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
      existsPendingChangeRequest: jest.fn<Promise<boolean>, [number]>(),
      findApprovalHistories: jest.fn<Promise<ChangeRequest[]>, [number]>(),
      findVersion: jest.fn<Promise<PurchaseOrderVersion | null>, [number, number]>(),
      findVersionAt: jest.fn<Promise<PurchaseOrderVersion | null>, [number, Date]>(),
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
    it('존재하는 id로 조회하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);

      const result = await service.find(1);

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

      await expect(service.find(999)).rejects.toThrow(NotFoundException);
      await expect(service.find(999)).rejects.toThrow('PurchaseOrder 999 not found');
    });
  });

  describe('findApprovalHistories', () => {
    const mockApprovedCr: ChangeRequest = {
      id: 5,
      purchaseOrderId: 1,
      requesterId: 10,
      reason: '수량을 늘려야 합니다',
      changes: { quantity: { old: 1000, new: 1500 } },
      status: ChangeRequestStatus.APPROVED,
      reviewerId: 20,
      reviewComment: '승인합니다',
      reviewedAt: new Date('2026-01-03T00:00:00Z'),
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    };

    it('발주서가 존재하면 APPROVED 이력 목록을 DTO 배열로 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findApprovalHistories.mockResolvedValue([mockApprovedCr]);

      const result = await service.findApprovalHistories(1);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.findApprovalHistories).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(ChangeRequestResponseDto);
      expect(result[0].id).toBe(5);
      expect(result[0].status).toBe(ChangeRequestStatus.APPROVED);
    });

    it('승인 이력이 없으면 빈 배열을 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findApprovalHistories.mockResolvedValue([]);

      const result = await service.findApprovalHistories(1);

      expect(result).toEqual([]);
    });

    it('발주서가 존재하지 않으면 NotFoundException을 던지고 이력을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findApprovalHistories(999)).rejects.toThrow(NotFoundException);
      await expect(service.findApprovalHistories(999)).rejects.toThrow(
        'PurchaseOrder 999 not found',
      );
      expect(repository.findApprovalHistories).not.toHaveBeenCalled();
    });
  });

  describe('requestChange', () => {
    const dto: CreateChangeRequestDto = {
      requesterId: 10,
      reason: '수량을 늘려야 합니다',
      changes: { quantity: { old: 1000, new: 1500 } },
    };

    // CONFIRMED 이상 + 주문자 본인 요청
    const confirmedEntity: PurchaseOrderWithVersion = {
      ...mockEntity,
      status: OrderStatus.CONFIRMED,
    };

    it('주문자 본인이 CONFIRMED 이상 발주서에 변경 요청하면 생성하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(confirmedEntity);
      repository.existsPendingChangeRequest.mockResolvedValue(false);
      repository.createChangeRequest.mockResolvedValue(mockChangeRequest);

      const result = await service.requestChange(1, dto);

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

      await expect(service.requestChange(999, dto)).rejects.toThrow(NotFoundException);
      await expect(service.requestChange(999, dto)).rejects.toThrow('PurchaseOrder 999 not found');
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });

    it('요청자가 주문자(buyer)가 아니면 ForbiddenException을 던지고 생성하지 않는다', async () => {
      repository.findById.mockResolvedValue(confirmedEntity);

      const otherRequester = { ...dto, requesterId: 999 };
      await expect(service.requestChange(1, otherRequester)).rejects.toThrow(ForbiddenException);
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });

    it('발주서 상태가 CONFIRMED 미만(DRAFT)이면 ConflictException을 던지고 생성하지 않는다', async () => {
      repository.findById.mockResolvedValue({ ...mockEntity, status: OrderStatus.DRAFT });

      await expect(service.requestChange(1, dto)).rejects.toThrow(ConflictException);
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });

    it('발주서 상태가 PENDING이면 ConflictException을 던지고 생성하지 않는다', async () => {
      repository.findById.mockResolvedValue({ ...mockEntity, status: OrderStatus.PENDING });

      await expect(service.requestChange(1, dto)).rejects.toThrow(ConflictException);
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });

    it('발주서 상태가 IN_PRODUCTION이면 변경 요청을 생성한다', async () => {
      repository.findById.mockResolvedValue({ ...mockEntity, status: OrderStatus.IN_PRODUCTION });
      repository.existsPendingChangeRequest.mockResolvedValue(false);
      repository.createChangeRequest.mockResolvedValue(mockChangeRequest);

      await service.requestChange(1, dto);

      expect(repository.createChangeRequest).toHaveBeenCalledTimes(1);
    });

    it('동일 발주서에 PENDING 변경 요청이 있으면 ConflictException을 던지고 생성하지 않는다', async () => {
      repository.findById.mockResolvedValue(confirmedEntity);
      repository.existsPendingChangeRequest.mockResolvedValue(true);

      await expect(service.requestChange(1, dto)).rejects.toThrow(ConflictException);
      await expect(service.requestChange(1, dto)).rejects.toThrow(
        'PurchaseOrder 1 already has a pending change request',
      );
      expect(repository.existsPendingChangeRequest).toHaveBeenCalledWith(1);
      expect(repository.createChangeRequest).not.toHaveBeenCalled();
    });
  });

  describe('findVersion', () => {
    const mockVersion: PurchaseOrderVersion = {
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
    };

    it('존재하는 발주서와 버전이면 VersionResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersion.mockResolvedValue(mockVersion);

      const result = await service.findVersion(1, 1);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.findVersion).toHaveBeenCalledWith(1, 1);
      expect(result).toBeInstanceOf(PurchaseOrderVersionResponseDto);
      expect(result.id).toBe(1);
      expect(result.versionNo).toBe(1);
      expect(result.productName).toBe('코튼 티셔츠');
      expect(result.quantity).toBe(1000);
      expect(result.unitPrice).toBe('5500');
      expect(result.spec).toEqual({ color: '블랙', size: 'L' });
      expect(result.changeRequestId).toBeNull();
      expect(result.validTo).toBeNull();
    });

    it('발주서가 존재하지 않으면 NotFoundException을 던지고 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findVersion(999, 1)).rejects.toThrow(NotFoundException);
      await expect(service.findVersion(999, 1)).rejects.toThrow('PurchaseOrder 999 not found');
      expect(repository.findVersion).not.toHaveBeenCalled();
    });

    it('버전이 존재하지 않으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersion.mockResolvedValue(null);

      await expect(service.findVersion(1, 99)).rejects.toThrow(NotFoundException);
      await expect(service.findVersion(1, 99)).rejects.toThrow(
        'PurchaseOrder 1 version 99 not found',
      );
    });
  });

  describe('findSnapshot', () => {
    const mockVersion: PurchaseOrderVersion = {
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
    };

    it('해당 시점에 유효한 버전이 있으면 VersionResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersionAt.mockResolvedValue(mockVersion);

      const at = '2026-01-15';
      const result = await service.findSnapshot(1, at);

      expect(repository.findById).toHaveBeenCalledWith(1);
      // 날짜는 KST '그 날 시작'(00:00+09:00) 시각으로 환산되어 전달된다
      expect(repository.findVersionAt).toHaveBeenCalledWith(
        1,
        new Date('2026-01-15T00:00:00.000+09:00'),
      );
      expect(result).toBeInstanceOf(PurchaseOrderVersionResponseDto);
      expect(result.versionNo).toBe(1);
      expect(result.productName).toBe('코튼 티셔츠');
      expect(result.quantity).toBe(1000);
      expect(result.unitPrice).toBe('5500');
    });

    it('발주서가 존재하지 않으면 NotFoundException을 던지고 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findSnapshot(999, '2026-01-15')).rejects.toThrow(NotFoundException);
      await expect(service.findSnapshot(999, '2026-01-15')).rejects.toThrow(
        'PurchaseOrder 999 not found',
      );
      expect(repository.findVersionAt).not.toHaveBeenCalled();
    });

    it('해당 시점에 유효한 버전이 없으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersionAt.mockResolvedValue(null);

      const at = '2025-01-01';
      await expect(service.findSnapshot(1, at)).rejects.toThrow(NotFoundException);
      await expect(service.findSnapshot(1, at)).rejects.toThrow(
        `PurchaseOrder 1 has no version at ${at}`,
      );
    });

    it('at이 유효한 날짜가 아니면 BadRequestException을 던지고 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);

      await expect(service.findSnapshot(1, '날짜아님')).rejects.toThrow(BadRequestException);
      expect(repository.findVersionAt).not.toHaveBeenCalled();
    });
  });

  describe('compareVersions', () => {
    const v1: PurchaseOrderVersion = {
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
      validTo: new Date('2026-01-10T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    // v2: 모든 도메인 필드가 v1과 다르다 (productName/quantity/unitPrice/deliveryDate/spec)
    const v2: PurchaseOrderVersion = {
      ...v1,
      id: 2,
      versionNo: 2,
      productName: '코튼 후드티',
      quantity: 1500,
      unitPrice: new Prisma.Decimal('6200.00'),
      deliveryDate: new Date('2026-03-25T00:00:00Z'),
      spec: { color: '네이비', size: 'XL' },
      changeRequestId: 5,
      validFrom: new Date('2026-01-10T00:00:00Z'),
      validTo: null,
    };

    it('발주서가 없으면 NotFoundException을 던지고 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.compareVersions(999, '1', '2')).rejects.toThrow(NotFoundException);
      await expect(service.compareVersions(999, '1', '2')).rejects.toThrow(
        'PurchaseOrder 999 not found',
      );
      expect(repository.findVersion).not.toHaveBeenCalled();
    });

    it('from 버전이 없으면 NotFoundException을 던지고 to 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersion.mockResolvedValue(null);

      await expect(service.compareVersions(1, '99', '2')).rejects.toThrow(NotFoundException);
      await expect(service.compareVersions(1, '99', '2')).rejects.toThrow(
        'PurchaseOrder 1 version 99 not found',
      );
    });

    it('to 버전이 없으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      // from(1)은 존재, to(99)는 없음 — 인자 기반으로 응답
      repository.findVersion.mockImplementation((_poId, versionNo) =>
        Promise.resolve(versionNo === 1 ? v1 : null),
      );

      await expect(service.compareVersions(1, '1', '99')).rejects.toThrow(NotFoundException);
      await expect(service.compareVersions(1, '1', '99')).rejects.toThrow(
        'PurchaseOrder 1 version 99 not found',
      );
    });

    it('from/to가 정수가 아니면 BadRequestException을 던지고 버전을 조회하지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);

      await expect(service.compareVersions(1, '1.5', '2')).rejects.toThrow(BadRequestException);
      await expect(service.compareVersions(1, 'abc', '2')).rejects.toThrow(BadRequestException);
      expect(repository.findVersion).not.toHaveBeenCalled();
    });

    it('두 버전을 number로 변환해 조회하고 바뀐 모든 필드를 changes로 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersion.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

      const result = await service.compareVersions(1, '1', '2');

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.findVersion).toHaveBeenNthCalledWith(1, 1, 1);
      expect(repository.findVersion).toHaveBeenNthCalledWith(2, 1, 2);

      expect(result).toBeInstanceOf(PurchaseOrderVersionDiffResponseDto);
      expect(result.purchaseOrderId).toBe(1);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(2);

      const fields = result.changes.map((c) => c.field);
      expect(fields).toEqual(['productName', 'quantity', 'unitPrice', 'deliveryDate', 'spec']);
      expect(result.changes).toContainEqual({
        field: 'quantity',
        old: 1000,
        new: 1500,
      });
      // unitPrice는 toString으로 정규화된 문자열로 노출
      expect(result.changes).toContainEqual({
        field: 'unitPrice',
        old: '5500',
        new: '6200',
      });
    });

    it('두 버전이 동일하면 changes가 빈 배열이다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findVersion.mockResolvedValueOnce(v1).mockResolvedValueOnce({ ...v1 });

      const result = await service.compareVersions(1, '1', '1');

      expect(result.changes).toEqual([]);
    });

    it('spec이 양쪽 모두 null이면 spec 변경으로 잡지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      const a = { ...v1, spec: null };
      const b = { ...v1, versionNo: 2, spec: null };
      repository.findVersion.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.compareVersions(1, '1', '2');

      expect(result.changes.map((c) => c.field)).not.toContain('spec');
    });

    it('한쪽만 spec이 null이면 spec 변경으로 잡는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      const a = { ...v1, spec: null };
      const b = { ...v1, versionNo: 2 };
      repository.findVersion.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

      const result = await service.compareVersions(1, '1', '2');

      expect(result.changes).toContainEqual({
        field: 'spec',
        old: null,
        new: { color: '블랙', size: 'L' },
      });
    });
  });
});
