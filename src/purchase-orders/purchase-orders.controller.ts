// 발주서 생성 HTTP 엔드포인트. 비즈니스 로직 없이 PurchaseOrdersService에 위임
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.create(dto);
  }

  @Get(':id')
  async find(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.find(id);
  }

  @Get(':id/approval-histories')
  async findApprovalHistories(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ChangeRequestResponseDto[]> {
    return this.purchaseOrdersService.findApprovalHistories(id);
  }

  @Post(':id/change-requests')
  async requestChange(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateChangeRequestDto,
  ): Promise<ChangeRequestResponseDto> {
    return this.purchaseOrdersService.requestChange(id, dto);
  }

  @Get(':id/versions/:versionNo')
  async findVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionNo', ParseIntPipe) versionNo: number,
  ): Promise<PurchaseOrderVersionResponseDto> {
    return this.purchaseOrdersService.findVersion(id, versionNo);
  }

  @Get(':id/diff')
  async compareVersions(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<PurchaseOrderVersionDiffResponseDto> {
    return this.purchaseOrdersService.compareVersions(id, from, to);
  }

  @Get(':id/snapshot')
  async findSnapshot(
    @Param('id', ParseIntPipe) id: number,
    @Query('at') at: string,
  ): Promise<PurchaseOrderVersionResponseDto> {
    return this.purchaseOrdersService.findSnapshot(id, at);
  }
}
