// 변경 요청 승인/반려 비즈니스 로직. 상태 전이 검증과 검토 결과 기록을 담당
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { ChangeRequestStatus } from '../../generated/prisma/client';

@Injectable()
export class ChangeRequestsService {
  constructor(private readonly changeRequestsRepository: ChangeRequestsRepository) {}

  // 변경 요청을 승인/반려하고 검토자·의견·검토시각을 기록한다.
  // 대상이 없으면 NotFoundException, 이미 처리된(PENDING이 아닌) 요청이면 ConflictException
  async review(id: string, dto: ReviewChangeRequestDto): Promise<ChangeRequestResponseDto> {
    const changeRequestId = Number(id);
    const changeRequest = await this.changeRequestsRepository.findById(changeRequestId);
    if (!changeRequest) {
      throw new NotFoundException(`ChangeRequest ${id} not found`);
    }
    if (changeRequest.status !== ChangeRequestStatus.PENDING) {
      throw new ConflictException(`ChangeRequest ${id} is already ${changeRequest.status}`);
    }

    const updated = await this.changeRequestsRepository.updateReview(changeRequestId, {
      status: dto.status,
      reviewerId: dto.reviewerId,
      reviewComment: dto.reviewComment ?? null,
      reviewedAt: new Date(),
    });
    return ChangeRequestResponseDto.fromEntity(updated);
  }
}
