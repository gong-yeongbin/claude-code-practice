// 발주서 생성 비즈니스 로직. orderNo 채번과 ResponseDto 변환을 담당
import { Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';
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

  async findVersion(id: string, versionNo: string): Promise<PurchaseOrderVersionResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(Number(id));
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    const version = await this.purchaseOrdersRepository.findVersion(Number(id), Number(versionNo));
    if (!version) {
      throw new NotFoundException(`PurchaseOrder ${id} version ${versionNo} not found`);
    }
    return PurchaseOrderVersionResponseDto.fromEntity(version);
  }

  async findSnapshot(id: string, at: string): Promise<PurchaseOrderVersionResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(Number(id));
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    const version = await this.purchaseOrdersRepository.findVersionAt(Number(id), new Date(at));
    if (!version) {
      throw new NotFoundException(`PurchaseOrder ${id} has no version at ${at}`);
    }
    return PurchaseOrderVersionResponseDto.fromEntity(version);
  }

  // 두 버전을 비교해 어떤 필드가 어떻게 바뀌었는지 반환. 발주서/버전 없으면 NotFoundException
  async compareVersions(
    id: string,
    from: string,
    to: string,
  ): Promise<PurchaseOrderVersionDiffResponseDto> {
    const purchaseOrderId = Number(id);
    const order = await this.purchaseOrdersRepository.findById(purchaseOrderId);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const fromVersion = await this.purchaseOrdersRepository.findVersion(purchaseOrderId, Number(from));
    if (!fromVersion) {
      throw new NotFoundException(`PurchaseOrder ${id} version ${from} not found`);
    }

    const toVersion = await this.purchaseOrdersRepository.findVersion(purchaseOrderId, Number(to));
    if (!toVersion) {
      throw new NotFoundException(`PurchaseOrder ${id} version ${to} not found`);
    }

    return PurchaseOrderVersionDiffResponseDto.fromVersions(fromVersion, toVersion);
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
