// 발주서 생성 비즈니스 로직. orderNo 채번과 ResponseDto 변환을 담당
import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly purchaseOrdersRepository: PurchaseOrdersRepository) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrdersRepository.create({
      orderNo: this.generateOrderNo(),
      buyerId: dto.buyerId,
      productName: dto.productName,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      deliveryDate: new Date(dto.deliveryDate),
      spec: dto.spec as Prisma.InputJsonValue | undefined,
    });
    return PurchaseOrderResponseDto.fromEntity(order);
  }

  async find(id: string): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(Number(id));
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    return PurchaseOrderResponseDto.fromEntity(order);
  }

  async findApprovalHistories(id: string): Promise<ChangeRequestResponseDto[]> {
    const order = await this.purchaseOrdersRepository.findById(Number(id));
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    const histories = await this.purchaseOrdersRepository.findApprovalHistories(Number(id));
    return histories.map((h) => ChangeRequestResponseDto.fromEntity(h));
  }

  // 주문자가 특정 발주서에 대한 변경 요청을 생성. 발주서가 없으면 NotFoundException
  async requestChange(id: string, dto: CreateChangeRequestDto): Promise<ChangeRequestResponseDto> {
    const purchaseOrderId = Number(id);
    const order = await this.purchaseOrdersRepository.findById(purchaseOrderId);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const changeRequest = await this.purchaseOrdersRepository.createChangeRequest({
      purchaseOrderId,
      requesterId: dto.requesterId,
      reason: dto.reason,
      changes: dto.changes as Prisma.InputJsonValue,
    });
    return ChangeRequestResponseDto.fromEntity(changeRequest);
  }

  // 발주 번호 채번. PO-yyyyMMddHHmmss-랜덤4자리로 사람이 읽기 쉬운 번호 생성
  private generateOrderNo(): string {
    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const ts =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = pad(Math.floor(Math.random() * 10000), 4);
    return `PO-${ts}-${rand}`;
  }
}
