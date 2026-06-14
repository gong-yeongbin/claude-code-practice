// 발주서 생성 HTTP 엔드포인트. 비즈니스 로직 없이 PurchaseOrdersService에 위임
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderVersionResponseDto } from './dto/purchase-order-version-response.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { SubmitPurchaseOrderDto } from './dto/submit-purchase-order.dto';
import { ConfirmPurchaseOrderDto } from './dto/confirm-purchase-order.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { PurchaseOrderVersionDiffResponseDto } from './dto/purchase-order-version-diff-response.dto';
import { ApiErrorResponse, ApiWrappedResponse } from '@/common/decorators/api-response.decorator';

@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @ApiOperation({ summary: '발주서 생성', description: 'BUYER 역할 계정만 생성 가능.' })
  @ApiWrappedResponse(PurchaseOrderResponseDto, { status: 201, description: '생성된 발주서' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  @ApiErrorResponse(403, 'BUYER 계정이 아님')
  @ApiErrorResponse(404, 'buyerId 계정을 찾을 수 없음')
  async create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '발주서 단건 조회(현재 버전 스냅샷 포함)' })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiWrappedResponse(PurchaseOrderResponseDto, { description: '조회된 발주서' })
  @ApiErrorResponse(404, '발주서를 찾을 수 없음')
  async find(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.find(id);
  }

  @Patch(':id/submit')
  @ApiOperation({
    summary: '발주서 제출(DRAFT→PENDING)',
    description: '주문자(buyer) 본인만, 발주서가 DRAFT 상태일 때 제출 가능.',
  })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiWrappedResponse(PurchaseOrderResponseDto, { description: '제출된 발주서' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  @ApiErrorResponse(403, '주문자(buyer) 본인이 아님')
  @ApiErrorResponse(404, '발주서 또는 요청자 계정을 찾을 수 없음')
  @ApiErrorResponse(409, '발주서가 DRAFT 상태가 아님')
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitPurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.submit(id, dto);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary: '발주서 확정(PENDING→CONFIRMED)',
    description: '소싱팀(SOURCING)만, 발주서가 PENDING 상태일 때 확정 가능.',
  })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiWrappedResponse(PurchaseOrderResponseDto, { description: '확정된 발주서' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  @ApiErrorResponse(403, '소싱팀(SOURCING)이 아님')
  @ApiErrorResponse(404, '발주서 또는 요청자 계정을 찾을 수 없음')
  @ApiErrorResponse(409, '발주서가 PENDING 상태가 아님')
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmPurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrdersService.confirm(id, dto);
  }

  @Get(':id/approval-histories')
  @ApiOperation({ summary: '발주서의 승인된 변경 이력 조회' })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiWrappedResponse(ChangeRequestResponseDto, { isArray: true, description: '승인 이력 목록' })
  @ApiErrorResponse(404, '발주서를 찾을 수 없음')
  async findApprovalHistories(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ChangeRequestResponseDto[]> {
    return this.purchaseOrdersService.findApprovalHistories(id);
  }

  @Post(':id/change-requests')
  @ApiOperation({
    summary: '발주서 변경 요청 생성',
    description: '주문자 본인만, 발주서가 PENDING 상태일 때 요청 가능. 동시 PENDING은 불가.',
  })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiWrappedResponse(ChangeRequestResponseDto, { status: 201, description: '생성된 변경 요청' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  @ApiErrorResponse(403, '주문자(buyer) 본인이 아님')
  @ApiErrorResponse(404, '발주서 또는 요청자 계정을 찾을 수 없음')
  @ApiErrorResponse(409, '상태가 PENDING이 아니거나 처리 대기 중인 변경 요청 존재')
  async requestChange(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateChangeRequestDto,
  ): Promise<ChangeRequestResponseDto> {
    return this.purchaseOrdersService.requestChange(id, dto);
  }

  @Get(':id/versions/:versionNo')
  @ApiOperation({ summary: '발주서 특정 버전 스냅샷 조회' })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiParam({ name: 'versionNo', type: Number, description: '버전 번호' })
  @ApiWrappedResponse(PurchaseOrderVersionResponseDto, { description: '버전 스냅샷' })
  @ApiErrorResponse(404, '발주서 또는 버전을 찾을 수 없음')
  async findVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionNo', ParseIntPipe) versionNo: number,
  ): Promise<PurchaseOrderVersionResponseDto> {
    return this.purchaseOrdersService.findVersion(id, versionNo);
  }

  @Get(':id/diff')
  @ApiOperation({ summary: '두 버전 간 변경 필드 비교' })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiQuery({ name: 'from', type: Number, description: '비교 시작 버전 번호' })
  @ApiQuery({ name: 'to', type: Number, description: '비교 대상 버전 번호' })
  @ApiWrappedResponse(PurchaseOrderVersionDiffResponseDto, { description: '버전 비교 결과' })
  @ApiErrorResponse(400, 'from/to가 양의 정수가 아님')
  @ApiErrorResponse(404, '발주서 또는 버전을 찾을 수 없음')
  async compareVersions(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<PurchaseOrderVersionDiffResponseDto> {
    return this.purchaseOrdersService.compareVersions(id, from, to);
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: '특정 시점에 유효했던 버전 스냅샷 조회' })
  @ApiParam({ name: 'id', type: Number, description: '발주서 ID' })
  @ApiQuery({
    name: 'at',
    type: String,
    description: '조회 날짜(YYYY-MM-DD). 해당 날짜의 KST 자정 기준으로 유효했던 버전을 찾는다',
    example: '2026-02-15',
  })
  @ApiWrappedResponse(PurchaseOrderVersionResponseDto, { description: '해당 시점의 버전 스냅샷' })
  @ApiErrorResponse(400, 'at이 YYYY-MM-DD 형식이 아님')
  @ApiErrorResponse(404, '발주서 또는 해당 시점 버전을 찾을 수 없음')
  async findSnapshot(
    @Param('id', ParseIntPipe) id: number,
    @Query('at') at: string,
  ): Promise<PurchaseOrderVersionResponseDto> {
    return this.purchaseOrdersService.findSnapshot(id, at);
  }
}
