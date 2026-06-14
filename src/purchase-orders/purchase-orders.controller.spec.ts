// PurchaseOrdersController의 생성 핸들러가 Service에 올바르게 위임하는지 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { SubmitPurchaseOrderDto } from './dto/submit-purchase-order.dto';
import { ConfirmPurchaseOrderDto } from './dto/confirm-purchase-order.dto';
import { ChangeRequestStatus, OrderStatus } from '@generated/prisma/client';

describe('PurchaseOrdersController', () => {
  let controller: PurchaseOrdersController;
  let service: {
    create: jest.Mock;
    find: jest.Mock;
    submit: jest.Mock;
    confirm: jest.Mock;
    requestChange: jest.Mock;
    findApprovalHistories: jest.Mock;
    findVersion: jest.Mock;
    findSnapshot: jest.Mock;
    compareVersions: jest.Mock;
  };

  const mockResponse: PurchaseOrderResponseDto = {
    id: 1,
    orderNo: 'PO-20260101-0001',
    buyerId: 10,
    status: OrderStatus.DRAFT,
    currentVersion: 1,
    productName: '코튼 티셔츠',
    quantity: 1000,
    unitPrice: '5500.00',
    deliveryDate: '2026-03-15',
    spec: { color: '블랙', size: 'L' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockChangeRequest: ChangeRequestResponseDto = {
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
    service = {
      create: jest.fn(),
      find: jest.fn(),
      submit: jest.fn(),
      confirm: jest.fn(),
      requestChange: jest.fn(),
      findApprovalHistories: jest.fn(),
      findVersion: jest.fn(),
      findSnapshot: jest.fn(),
      compareVersions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrdersController],
      providers: [{ provide: PurchaseOrdersService, useValue: service }],
    }).compile();

    controller = module.get<PurchaseOrdersController>(PurchaseOrdersController);
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

    it('dto를 service.create에 전달하고 결과를 반환한다', async () => {
      service.create.mockResolvedValue(mockResponse);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(mockResponse);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.create.mockRejectedValue(new BadRequestException('invalid'));

      await expect(controller.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('BUYER 계정이 아니어서 service가 ForbiddenException을 던지면 그대로 전파한다', async () => {
      service.create.mockRejectedValue(new ForbiddenException('Only a BUYER account can create'));

      await expect(controller.create(dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('find', () => {
    it('id를 service.find에 전달하고 결과를 반환한다', async () => {
      service.find.mockResolvedValue(mockResponse);

      const result = await controller.find(1);

      expect(service.find).toHaveBeenCalledWith(1);
      expect(result).toBe(mockResponse);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.find.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.find(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    const dto: SubmitPurchaseOrderDto = { requesterId: 10 };
    const submitted: PurchaseOrderResponseDto = { ...mockResponse, status: OrderStatus.PENDING };

    it('id와 dto를 service.submit에 전달하고 결과를 반환한다', async () => {
      service.submit.mockResolvedValue(submitted);

      const result = await controller.submit(1, dto);

      expect(service.submit).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(submitted);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.submit.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.submit(999, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirm', () => {
    const dto: ConfirmPurchaseOrderDto = { requesterId: 20 };
    const confirmed: PurchaseOrderResponseDto = { ...mockResponse, status: OrderStatus.CONFIRMED };

    it('id와 dto를 service.confirm에 전달하고 결과를 반환한다', async () => {
      service.confirm.mockResolvedValue(confirmed);

      const result = await controller.confirm(1, dto);

      expect(service.confirm).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(confirmed);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.confirm.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.confirm(999, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findApprovalHistories', () => {
    const mockHistories: ChangeRequestResponseDto[] = [
      {
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
      },
    ];

    it('id를 service.findApprovalHistories에 전달하고 결과를 반환한다', async () => {
      service.findApprovalHistories.mockResolvedValue(mockHistories);

      const result = await controller.findApprovalHistories(1);

      expect(service.findApprovalHistories).toHaveBeenCalledWith(1);
      expect(result).toBe(mockHistories);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.findApprovalHistories.mockRejectedValue(
        new NotFoundException('PurchaseOrder 999 not found'),
      );

      await expect(controller.findApprovalHistories(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestChange', () => {
    const dto: CreateChangeRequestDto = {
      requesterId: 10,
      reason: '수량을 늘려야 합니다',
      changes: { quantity: { old: 1000, new: 1500 } },
    };

    it('id와 dto를 service.requestChange에 전달하고 결과를 반환한다', async () => {
      service.requestChange.mockResolvedValue(mockChangeRequest);

      const result = await controller.requestChange(1, dto);

      expect(service.requestChange).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(mockChangeRequest);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.requestChange.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.requestChange(999, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findVersion', () => {
    const mockVersionResponse: PurchaseOrderVersionResponseDto = {
      id: 1,
      purchaseOrderId: 1,
      versionNo: 1,
      productName: '코튼 티셔츠',
      quantity: 1000,
      unitPrice: '5500.00',
      deliveryDate: '2026-03-15',
      spec: { color: '블랙', size: 'L' },
      changeRequestId: null,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('id와 versionNo를 service.findVersion에 전달하고 결과를 반환한다', async () => {
      service.findVersion.mockResolvedValue(mockVersionResponse);

      const result = await controller.findVersion(1, 1);

      expect(service.findVersion).toHaveBeenCalledWith(1, 1);
      expect(result).toBe(mockVersionResponse);
    });

    it('발주서가 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.findVersion.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.findVersion(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('버전이 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.findVersion.mockRejectedValue(
        new NotFoundException('PurchaseOrder 1 version 99 not found'),
      );

      await expect(controller.findVersion(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findSnapshot', () => {
    const mockVersionResponse: PurchaseOrderVersionResponseDto = {
      id: 1,
      purchaseOrderId: 1,
      versionNo: 1,
      productName: '코튼 티셔츠',
      quantity: 1000,
      unitPrice: '5500.00',
      deliveryDate: '2026-03-15',
      spec: { color: '블랙', size: 'L' },
      changeRequestId: null,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('id와 at을 service.findSnapshot에 전달하고 결과를 반환한다', async () => {
      service.findSnapshot.mockResolvedValue(mockVersionResponse);

      const result = await controller.findSnapshot(1, '2026-01-15T00:00:00Z');

      expect(service.findSnapshot).toHaveBeenCalledWith(1, '2026-01-15T00:00:00Z');
      expect(result).toBe(mockVersionResponse);
    });

    it('발주서가 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.findSnapshot.mockRejectedValue(new NotFoundException('PurchaseOrder 999 not found'));

      await expect(controller.findSnapshot(999, '2026-01-15T00:00:00Z')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('해당 시점에 유효한 버전이 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.findSnapshot.mockRejectedValue(
        new NotFoundException('PurchaseOrder 1 has no version at 2025-01-01T00:00:00Z'),
      );

      await expect(controller.findSnapshot(1, '2025-01-01T00:00:00Z')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('compareVersions', () => {
    const mockDiffResponse: PurchaseOrderVersionDiffResponseDto = {
      purchaseOrderId: 1,
      fromVersion: 1,
      toVersion: 2,
      changes: [{ field: 'quantity', old: 1000, new: 1500 }],
    };

    it('id, from, to를 service.compareVersions에 전달하고 결과를 반환한다', async () => {
      service.compareVersions.mockResolvedValue(mockDiffResponse);

      const result = await controller.compareVersions(1, '1', '2');

      expect(service.compareVersions).toHaveBeenCalledWith(1, '1', '2');
      expect(result).toBe(mockDiffResponse);
    });

    it('발주서가 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.compareVersions.mockRejectedValue(
        new NotFoundException('PurchaseOrder 999 not found'),
      );

      await expect(controller.compareVersions(999, '1', '2')).rejects.toThrow(NotFoundException);
    });

    it('버전이 없으면 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      service.compareVersions.mockRejectedValue(
        new NotFoundException('PurchaseOrder 1 version 99 not found'),
      );

      await expect(controller.compareVersions(1, '1', '99')).rejects.toThrow(NotFoundException);
    });
  });
});
