// UsersService의 비즈니스 로직을 Repository mock 기반으로 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserRole } from '@generated/prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    findById: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
  };

  const mockEntity: User = {
    id: 1,
    name: '홍길동',
    role: UserRole.BUYER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: repository }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('repository.create를 도메인 필드로 호출하고 ResponseDto를 반환한다', async () => {
      repository.create.mockResolvedValue(mockEntity);

      const dto: CreateUserDto = { name: '홍길동', role: UserRole.BUYER };
      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith({
        name: '홍길동',
        role: 'BUYER',
      });
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(1);
      expect(result.name).toBe('홍길동');
      expect(result.role).toBe('BUYER');
    });
  });

  describe('find', () => {
    it('존재하는 id로 조회하고 ResponseDto를 반환한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);

      const result = await service.find(1);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(1);
    });

    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.find(999)).rejects.toThrow(NotFoundException);
      await expect(service.find(999)).rejects.toThrow('User 999 not found');
    });
  });

  describe('findMany', () => {
    it('전체 목록을 ResponseDto 배열로 변환해 반환한다', async () => {
      repository.findMany.mockResolvedValue([mockEntity, { ...mockEntity, id: 2, name: '김철수' }]);

      const result = await service.findMany();

      expect(repository.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(UserResponseDto);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      repository.findMany.mockResolvedValue([]);

      const result = await service.findMany();

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('존재하면 find로 확인 후 repository.delete를 호출한다', async () => {
      repository.findById.mockResolvedValue(mockEntity);
      repository.delete.mockResolvedValue(mockEntity);

      const result = await service.delete(1);

      expect(repository.findById).toHaveBeenCalledWith(1);
      expect(repository.delete).toHaveBeenCalledWith(1);
      expect(result).toBeUndefined();
    });

    it('존재하지 않으면 NotFoundException을 던지고 repository.delete를 호출하지 않는다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
