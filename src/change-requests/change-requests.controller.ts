import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ChangeRequestsService } from './change-requests.service';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { ApiErrorResponse, ApiWrappedResponse } from '@/common/decorators/api-response.decorator';

@ApiTags('change-requests')
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Patch(':id')
  @ApiOperation({
    summary: '변경 요청 승인/반려',
    description: '소싱팀(SOURCING)만 가능. 승인 시 새 버전 생성, 반려 시 사유 기록.',
  })
  @ApiParam({ name: 'id', type: Number, description: '변경 요청 ID' })
  @ApiWrappedResponse(ChangeRequestResponseDto, { description: '처리된 변경 요청' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  @ApiErrorResponse(403, '소싱팀 권한이 없음')
  @ApiErrorResponse(404, '변경 요청을 찾을 수 없음')
  @ApiErrorResponse(409, '이미 처리된 변경 요청')
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequestsService.review(id, dto);
  }
}
