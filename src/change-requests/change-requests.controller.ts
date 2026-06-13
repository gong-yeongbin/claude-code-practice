import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ChangeRequestsService } from './change-requests.service';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';

@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequestsService: ChangeRequestsService) {}

  @Patch(':id')
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequestsService.review(id, dto);
  }
}
