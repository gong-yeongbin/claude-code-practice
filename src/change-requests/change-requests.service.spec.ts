// ChangeRequestsService의 승인/반려 비즈니스 로직을 Repository mock 기반으로 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestResponseDto } from './dto/change-request-response.dto';
import { ReviewChangeRequestDto } from './dto/review-change-request.dto';
import {
  ChangeRequest,
  ChangeRequestStatus,
  Prisma,
  PurchaseOrderVersion,
  UserRole,
} from '../../generated/prisma/client';

describe('ChangeRequestsService', () => {
  let service: ChangeRequestsService;
  let repository: {
    findById: jest.Mock;
    updateReview: jest.Mock;
    findCurrentVersion: jest.Mock;
    applyApproval: jest.Mock;
    findReviewer: jest.Mock;
  };

  // 권한 검증을 통과하는 기본 검토자(소싱팀)
  const sourcingReviewer = {
    id: 3,
    name: '소싱 담당자',
    role: UserRole.SOURCING,
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

  // 발주서의 현재 유효 버전(v1) 스냅샷
  const mockVersion: PurchaseOrderVersion = {
    id: 100,
    purchaseOrderId: 10,
    versionNo: 1,
    productName: '코튼 티셔츠',
    quantity: 1000,
    unitPrice: new Prisma.Decimal('5500.00'),
    deliveryDate: new Date('2026-03-15T00:00:00Z'),
    spec: { color: '블랙' },
    changeRequestId: null,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  // 승인 처리 후 repository.applyApproval이 돌려주는 ChangeRequest
  const approvedEntity: ChangeRequest = {
    ...mockEntity,
    status: ChangeRequestStatus.APPROVED,
    reviewerId: 3,
    reviewComment: '승인합니다',
    reviewedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      updateReview: jest.fn(),
      findCurrentVersion: jest.fn(),
      applyApproval: jest.fn(),
      findReviewer: jest.fn(),
    };
    // 기본적으로 검토자는 소싱팀이라고 가정한다 (권한 케이스에서 개별 override)
    repository.findReviewer.mockResolvedValue(sourcingReviewer);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChangeRequestsService,
        { provide: ChangeRequestsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<ChangeRequestsService>(ChangeRequestsService);
  });

  describe('review - 승인', () => {
    it('현재 버전에 changes를 적용한 다음 버전을 만들어 발주서에 반영한다', async () => {
      repository.findById.mockResolvedValue({
        ...mockEntity,
        changes: {
          quantity: { old: 1000, new: 1500 },
          delivery_date: { old: '2026-03-15', new: '2026-03-25' },
        },
      });
      repository.findCurrentVersion.mockResolvedValue(mockVersion);
      repository.applyApproval.mockResolvedValue(approvedEntity);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
        reviewComment: '승인합니다',
      };
      const result = await service.review(1, dto);

      expect(repository.findCurrentVersion).toHaveBeenCalledWith(10);
      expect(repository.applyApproval).toHaveBeenCalledWith({
        changeRequestId: 1,
        purchaseOrderId: 10,
        nextVersionNo: 2,
        nextVersion: {
          productName: '코튼 티셔츠',
          quantity: 1500,
          unitPrice: '5500',
          deliveryDate: new Date('2026-03-25'),
          spec: { color: '블랙' },
        },
        reviewerId: 3,
        reviewComment: '승인합니다',
        reviewedAt: expect.any(Date) as Date,
      });
      expect(repository.updateReview).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(ChangeRequestResponseDto);
      expect(result.status).toBe(ChangeRequestStatus.APPROVED);
    });

    it('product_name/unit_price/spec 변경을 적용하고 그 외 키는 무시한다', async () => {
      repository.findById.mockResolvedValue({
        ...mockEntity,
        changes: {
          product_name: { old: '코튼 티셔츠', new: '리넨 셔츠' },
          unit_price: { old: '5500.00', new: '7000.00' },
          spec: { old: { color: '블랙' }, new: { color: '화이트', size: 'M' } },
          unknown_field: { old: 1, new: 2 },
        },
      });
      repository.findCurrentVersion.mockResolvedValue(mockVersion);
      repository.applyApproval.mockResolvedValue(approvedEntity);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await service.review(1, dto);

      expect(repository.applyApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          nextVersion: {
            productName: '리넨 셔츠',
            quantity: 1000,
            unitPrice: '7000.00',
            deliveryDate: new Date('2026-03-15T00:00:00Z'),
            spec: { color: '화이트', size: 'M' },
          },
        }),
      );
    });

    it('reviewComment를 생략하면 null로 전달한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findCurrentVersion.mockResolvedValue(mockVersion);
      repository.applyApproval.mockResolvedValue(approvedEntity);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await service.review(1, dto);

      expect(repository.applyApproval).toHaveBeenCalledWith(
        expect.objectContaining({ reviewComment: null }),
      );
    });

    it('현재 버전 spec이 null이고 changes에 spec이 없으면 다음 버전 spec은 undefined다', async () => {
      repository.findById.mockResolvedValue({
        ...mockEntity,
        changes: { quantity: { old: 1000, new: 1500 } },
      });
      repository.findCurrentVersion.mockResolvedValue({ ...mockVersion, spec: null });
      repository.applyApproval.mockResolvedValue(approvedEntity);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await service.review(1, dto);

      expect(repository.applyApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          nextVersion: expect.objectContaining({ spec: undefined }) as unknown,
        }),
      );
    });

    it('현재 유효 버전이 없으면 NotFoundException을 던지고 applyApproval을 호출하지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.findCurrentVersion.mockResolvedValue(null);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await expect(service.review(1, dto)).rejects.toThrow(NotFoundException);
      expect(repository.applyApproval).not.toHaveBeenCalled();
    });
  });

  describe('review - 반려', () => {
    it('검토자와 의견을 기록하고 버전은 건드리지 않는다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.updateReview.mockResolvedValue({
        ...mockEntity,
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
      });

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
      };
      const result = await service.review(1, dto);

      expect(repository.updateReview).toHaveBeenCalledWith(1, {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: '근거가 부족합니다',
        reviewedAt: expect.any(Date) as Date,
      });
      expect(repository.findCurrentVersion).not.toHaveBeenCalled();
      expect(repository.applyApproval).not.toHaveBeenCalled();
      expect(result.status).toBe(ChangeRequestStatus.REJECTED);
    });

    it('reviewComment를 생략하면 null로 기록한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.updateReview.mockResolvedValue({
        ...mockEntity,
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
        reviewComment: null,
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
      });

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 3,
      };
      await service.review(1, dto);

      expect(repository.updateReview).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ reviewComment: null }),
      );
    });
  });

  describe('review - 권한', () => {
    it('검토자가 소싱팀(SOURCING)이 아니면 ForbiddenException을 던지고 변경요청을 조회하지 않는다', async () => {
      repository.findReviewer.mockResolvedValue({
        id: 3,
        name: '주문자',
        role: UserRole.BUYER,
      });

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await expect(service.review(1, dto)).rejects.toThrow(ForbiddenException);
      expect(repository.findReviewer).toHaveBeenCalledWith(3);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('검토자가 존재하지 않으면 ForbiddenException을 던진다', async () => {
      repository.findReviewer.mockResolvedValue(null);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.REJECTED,
        reviewerId: 999,
        reviewComment: '권한 없음',
      };
      await expect(service.review(1, dto)).rejects.toThrow(ForbiddenException);
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('review - 공통 예외', () => {
    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(null);

      const dto: ReviewChangeRequestDto = {
        status: ChangeRequestStatus.APPROVED,
        reviewerId: 3,
      };
      await expect(service.review(999, dto)).rejects.toThrow(NotFoundException);
      await expect(service.review(999, dto)).rejects.toThrow('ChangeRequest 999 not found');
      expect(repository.findCurrentVersion).not.toHaveBeenCalled();
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
      await expect(service.review(1, dto)).rejects.toThrow(ConflictException);
      await expect(service.review(1, dto)).rejects.toThrow('ChangeRequest 1 is already APPROVED');
    });
  });
});
