// 발주서 생성 비즈니스 로직. orderNo 채번과 ResponseDto 변환을 담당
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { SubmitPurchaseOrderDto } from './dto/submit-purchase-order.dto';
import { ConfirmPurchaseOrderDto } from './dto/confirm-purchase-order.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';
import { OrderStatus, Prisma, UserRole } from '@generated/prisma/client';
import { kstEndOfDay } from '@/common/utils/date-format';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly purchaseOrdersRepository: PurchaseOrdersRepository) {}

  // 발주서를 생성한다. 생성 주체(buyerId)가 BUYER 역할 계정일 때만 허용한다.
  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const buyer = await this.purchaseOrdersRepository.findUser(dto.buyerId);
    if (!buyer) {
      throw new NotFoundException(`User ${dto.buyerId} not found`);
    }
    if (buyer.role !== UserRole.BUYER) {
      throw new ForbiddenException('Only a BUYER account can create a PurchaseOrder');
    }

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

  async find(id: number): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    return PurchaseOrderResponseDto.fromEntity(order);
  }

  // 발주서를 제출해 DRAFT→PENDING으로 전환한다. 발주서가 없으면 NotFoundException,
  // 주문자(buyer) 본인이 아니면 ForbiddenException, DRAFT 상태가 아니면 ConflictException.
  async submit(id: number, dto: SubmitPurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const requester = await this.purchaseOrdersRepository.findUser(dto.requesterId);
    if (!requester) {
      throw new NotFoundException(`User ${dto.requesterId} not found`);
    }

    if (dto.requesterId !== order.buyerId) {
      throw new ForbiddenException(`Only the buyer can submit PurchaseOrder ${id}`);
    }

    if (order.status !== OrderStatus.DRAFT) {
      throw new ConflictException(
        `PurchaseOrder ${id} is ${order.status}; only DRAFT orders can be submitted`,
      );
    }

    const updated = await this.purchaseOrdersRepository.updateStatus(id, OrderStatus.PENDING);
    return PurchaseOrderResponseDto.fromEntity(updated);
  }

  // 발주서를 확정해 PENDING→CONFIRMED로 전환한다. 발주서가 없으면 NotFoundException,
  // 요청자가 소싱팀(SOURCING)이 아니면 ForbiddenException, PENDING 상태가 아니면 ConflictException.
  async confirm(id: number, dto: ConfirmPurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const requester = await this.purchaseOrdersRepository.findUser(dto.requesterId);
    if (!requester) {
      throw new NotFoundException(`User ${dto.requesterId} not found`);
    }
    if (requester.role !== UserRole.SOURCING) {
      throw new ForbiddenException(`Only the sourcing team can confirm PurchaseOrder ${id}`);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        `PurchaseOrder ${id} is ${order.status}; only PENDING orders can be confirmed`,
      );
    }

    const updated = await this.purchaseOrdersRepository.updateStatus(id, OrderStatus.CONFIRMED);
    return PurchaseOrderResponseDto.fromEntity(updated);
  }

  async findApprovalHistories(id: number): Promise<ChangeRequestResponseDto[]> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    const histories = await this.purchaseOrdersRepository.findApprovalHistories(id);
    return histories.map((h) => ChangeRequestResponseDto.fromEntity(h));
  }

  // 주문자가 특정 발주서에 대한 변경 요청을 생성. 발주서가 없으면 NotFoundException.
  // 주문자(buyer) 본인만 요청 가능하며, 발주서 상태가 CONFIRMED일 때만 허용한다.
  async requestChange(id: number, dto: CreateChangeRequestDto): Promise<ChangeRequestResponseDto> {
    const purchaseOrderId = id;
    const order = await this.purchaseOrdersRepository.findById(purchaseOrderId);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const requester = await this.purchaseOrdersRepository.findUser(dto.requesterId);
    if (!requester) {
      throw new NotFoundException(`User ${dto.requesterId} not found`);
    }

    if (dto.requesterId !== order.buyerId) {
      throw new ForbiddenException(`Only the buyer can request changes for PurchaseOrder ${id}`);
    }

    if (order.status !== OrderStatus.CONFIRMED) {
      throw new ConflictException(
        `PurchaseOrder ${id} is ${order.status}; change requests require CONFIRMED status`,
      );
    }

    // 동일 발주서에 처리 대기 중인 변경 요청이 있으면 신규 생성 불가
    if (await this.purchaseOrdersRepository.existsPendingChangeRequest(purchaseOrderId)) {
      throw new ConflictException(`PurchaseOrder ${id} already has a pending change request`);
    }

    const changeRequest = await this.purchaseOrdersRepository.createChangeRequest({
      purchaseOrderId,
      requesterId: dto.requesterId,
      reason: dto.reason,
      changes: dto.changes as Prisma.InputJsonValue,
    });
    return ChangeRequestResponseDto.fromEntity(changeRequest);
  }

  async findVersion(id: number, versionNo: number): Promise<PurchaseOrderVersionResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    const version = await this.purchaseOrdersRepository.findVersion(id, versionNo);
    if (!version) {
      throw new NotFoundException(`PurchaseOrder ${id} version ${versionNo} not found`);
    }
    return PurchaseOrderVersionResponseDto.fromEntity(version);
  }

  async findSnapshot(id: number, at: string): Promise<PurchaseOrderVersionResponseDto> {
    const order = await this.purchaseOrdersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }
    // 조회 시점은 날짜(YYYY-MM-DD)만 받아 KST 기준 '그 날 끝' 시각으로 환산한다.
    // 당일 생성·승인된 버전도 그 날짜로 조회되도록 하루의 끝을 기준으로 한다.
    const atDate = kstEndOfDay(at);
    if (atDate === null) {
      throw new BadRequestException(`Invalid date format (expected YYYY-MM-DD): ${at}`);
    }
    const version = await this.purchaseOrdersRepository.findVersionAt(id, atDate);
    if (!version) {
      throw new NotFoundException(`PurchaseOrder ${id} has no version at ${at}`);
    }
    return PurchaseOrderVersionResponseDto.fromEntity(version);
  }

  // 두 버전을 비교해 어떤 필드가 어떻게 바뀌었는지 반환. 발주서/버전 없으면 NotFoundException
  async compareVersions(
    id: number,
    from: string,
    to: string,
  ): Promise<PurchaseOrderVersionDiffResponseDto> {
    const purchaseOrderId = id;
    const order = await this.purchaseOrdersRepository.findById(purchaseOrderId);
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${id} not found`);
    }

    const fromNo = Number(from);
    const toNo = Number(to);
    if (!Number.isInteger(fromNo) || fromNo < 1 || !Number.isInteger(toNo) || toNo < 1) {
      throw new BadRequestException('from and to must be positive integers');
    }

    const fromVersion = await this.purchaseOrdersRepository.findVersion(purchaseOrderId, fromNo);
    if (!fromVersion) {
      throw new NotFoundException(`PurchaseOrder ${id} version ${from} not found`);
    }

    const toVersion = await this.purchaseOrdersRepository.findVersion(purchaseOrderId, toNo);
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
