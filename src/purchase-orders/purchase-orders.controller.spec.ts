// PurchaseOrdersController의 생성 핸들러가 Service에 올바르게 위임하는지 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { OrderStatus } from '../../generated/prisma/client';

describe('PurchaseOrdersController', () => {
  let controller: PurchaseOrdersController;
  let service: {
    create: jest.Mock;
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
    deliveryDate: new Date('2026-03-15T00:00:00Z'),
    spec: { color: '블랙', size: 'L' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
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
  });
});
