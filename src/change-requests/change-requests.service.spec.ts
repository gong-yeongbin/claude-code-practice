// ChangeRequestsService의 승인/반려 비즈니스 로직을 Repository mock 기반으로 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import { ChangeRequest, ChangeRequestStatus } from '../../generated/prisma/client';

describe('ChangeRequestsService', () => {
  let service: ChangeRequestsService;
  let repository: {
    findById: jest.Mock;
    updateReview: jest.Mock;
  };

  const mockEntity: ChangeRequest = {
    id: 1,
    purchaseOrderId: 10,
    requesterId: 2,
    reason: '수량 변경',
    changes: { quantity: { old: 1000, new: 1500 } },
    status: ChangeRequestStatus.PENDING,
    reviewerId: null,
    reviewComment: null,
    reviewedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      updateReview: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeRequestsService,
        { provide: ChangeRequestsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ChangeRequestsService>(ChangeRequestsService);
  });

  describe('review', () => {
    it('승인 시 검토자와 의견을 기록하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      const approved: ChangeRequest = {
        ...mockEntity,
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: '승인합니다',
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
      };
      repository.updateReview.mockResolvedValue(approved);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: '승인합니다',
      };
      const result = await service.review('1', dto);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.updateReview).toHaveBeenCalledWith(1, {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: '승인합니다',
        reviewedAt: expect.any(Date) as Date,
      });
      expect(result).toBeInstanceOf(ChangeRequestResponseDto);
      expect(result.status).toBe(ChangeRequestStatus.APPROVED);
      expect(result.reviewerId).toBe(3);
      expect(result.reviewComment).toBe('승인합니다');
    });

    it('반려 시 검토자와 의견을 기록하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      const rejected: ChangeRequest = {
        ...mockEntity,
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
      };
      repository.updateReview.mockResolvedValue(rejected);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
      };
      const result = await service.review('1', dto);

      expect(repository.updateReview).toHaveBeenCalledWith(1, {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
        reviewedAt: expect.any(Date) as Date,
      });
      expect(result.status).toBe(ChangeRequestStatus.REJECTED);
      expect(result.reviewComment).toBe('근거가 부족합니다');
    });

    it('승인 시 의견을 생략하면 reviewComment를 null로 기록한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.updateReview.mockResolvedValue({
        ...mockEntity,
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: null,
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
      });

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      const result = await service.review('1', dto);

      expect(repository.updateReview).toHaveBeenCalledWith(1, {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: null,
        reviewedAt: expect.any(Date) as Date,
      });
      expect(result.reviewComment).toBeNull();
    });

    it('존재하지 않으면 NotFoundException을 던지고 updateReview를 호출하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await expect(service.review('999', dto)).rejects.toThrow(NotFoundException);
      await expect(service.review('999', dto)).rejects.toThrow('ChangeRequest 999 not found');
      expect(repository.updateReview).not.toHaveBeenCalled();
    });

    it('이미 처리된(PENDING이 아닌) 요청이면 ConflictException을 던진다', async () => {
      repository.findById.mockResolvedValue({
        ...mockEntity,
        status: ChangeRequestStatus.APPROVED,
      });

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '재검토',
      };
      await expect(service.review('1', dto)).rejects.toThrow(ConflictException);
      await expect(service.review('1', dto)).rejects.toThrow('ChangeRequest 1 is already APPROVED');
      expect(repository.updateReview).not.toHaveBeenCalled();
    });
  });
});
