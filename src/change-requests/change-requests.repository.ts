// 변경 요청 조회와 승인/반려 처리를 담당하는 Repository
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeRequest, ChangeRequestStatus } from '../../generated/prisma/client';

// 승인/반려 처리 시 갱신할 검토 결과
export interface UpdateReviewInput {
  status: ChangeRequestStatus;
  reviewerId: number;
  reviewComment: string | null;
  reviewedAt: Date;
}

@Injectable()
export class ChangeRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<ChangeRequest | null> {
    return this.prisma.changeRequest.findUnique({ where: { id } });
  }

  async updateReview(id: number, input: UpdateReviewInput): Promise<ChangeRequest> {
    return this.prisma.changeRequest.update({ where: { id }, data: input });
  }
}
