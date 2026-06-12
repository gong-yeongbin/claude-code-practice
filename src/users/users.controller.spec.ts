// UsersController의 HTTP 핸들러가 Service에 올바르게 위임하는지 검증하는 유닛 테스트
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UserRole } from '../../generated/prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let service: {
    create: jest.Mock;
    findMany: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };

  const mockResponse: UserResponseDto = {
    id: '1',
    name: '홍길동',
    role: UserRole.BUYER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findMany: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('create', () => {
    it('dto를 service.create에 전달하고 결과를 반환한다', async () => {
      const dto: CreateUserDto = { name: '홍길동', role: UserRole.BUYER };
      service.create.mockResolvedValue(mockResponse);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(mockResponse);
    });
  });

  describe('findMany', () => {
    it('service.findMany 결과를 반환한다', async () => {
      service.findMany.mockResolvedValue([mockResponse]);

      const result = await controller.findMany();

      expect(service.findMany).toHaveBeenCalled();
      expect(result).toEqual([mockResponse]);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      service.findMany.mockResolvedValue([]);

      const result = await controller.findMany();

      expect(result).toEqual([]);
    });
  });

  describe('find', () => {
    it('id를 service.find에 전달하고 결과를 반환한다', async () => {
      service.find.mockResolvedValue(mockResponse);

      const result = await controller.find('1');

      expect(service.find).toHaveBeenCalledWith('1');
      expect(result).toBe(mockResponse);
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.find.mockRejectedValue(new NotFoundException('User 999 not found'));

      await expect(controller.find('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('id를 service.delete에 전달한다', async () => {
      service.delete.mockResolvedValue(undefined);

      const result = await controller.delete('1');

      expect(service.delete).toHaveBeenCalledWith('1');
      expect(result).toBeUndefined();
    });

    it('service가 던진 예외를 그대로 전파한다', async () => {
      service.delete.mockRejectedValue(new NotFoundException('User 999 not found'));

      await expect(controller.delete('999')).rejects.toThrow(NotFoundException);
    });
  });
});
