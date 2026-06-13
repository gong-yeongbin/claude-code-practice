// ChangeRequestsController의 HTTP 핸들러가 Service에 올바르게 위임하는지 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequestStatus } from '@generated/prisma/client';

describe('ChangeRequestsController', () => {
  let controller: ChangeRequestsController;
  let service: {
    review: jest.Mock;
  };

  const mockResponse: ChangeRequestResponseDto = {
    id: 1,
    purchaseOrderId: 10,
    requesterId: 2,
    reason: '수량 변경',
    changes: { quantity: { old: 1000, new: 1500 } },
    status: ChangeRequestStatus.APPROVED,
    reviewerId: 3,
    reviewComment: '승인합니다',
    reviewedAt: new Date('2026-01-02T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(async () => {
    service = {
      review: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChangeRequestsController],
      providers: [{ provide: ChangeRequestsService, useValue: service }],
    }).compile();

    controller = module.get<ChangeRequestsController>(ChangeRequestsController);
  });

  describe('review', () => {
    it('id와 dto를 service.review에 전달하고 결과를 반환한다', async () => {
      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: '승인합니다',
      };
      service.review.mockResolvedValue(mockResponse);

      const result = await controller.review(1, dto);

      expect(service.review).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(mockResponse);
    });

    it('대상이 없어 service가 던진 NotFoundException을 그대로 전파한다', async () => {
      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '사유 부족',
      };
      service.review.mockRejectedValue(new NotFoundException('ChangeRequest 999 not found'));

      await expect(controller.review(999, dto)).rejects.toThrow(NotFoundException);
    });

    it('소싱팀이 아니어서 service가 던진 ForbiddenException을 그대로 전파한다', async () => {
      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 2,
      };
      service.review.mockRejectedValue(
        new ForbiddenException('User 2 is not authorized to review change requests'),
      );

      await expect(controller.review(1, dto)).rejects.toThrow(ForbiddenException);
    });

    it('이미 처리되어 service가 던진 ConflictException을 그대로 전파한다', async () => {
      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      service.review.mockRejectedValue(
        new ConflictException('ChangeRequest 1 is already APPROVED'),
      );

      await expect(controller.review(1, dto)).rejects.toThrow(ConflictException);
    });
  });
});
