// 발주서 생성 HTTP 엔드포인트. 비즈니스 로직 없이 PurchaseOrdersService에 위임
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.create(dto);
  }

  @Get(':id')
  async find(@Param('id') id: string): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.find(id);
  }
}
