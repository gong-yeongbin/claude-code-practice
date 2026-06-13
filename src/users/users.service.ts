import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Prisma } from '@generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.create({
      name: dto.name,
      role: dto.role,
    });
    return UserResponseDto.fromEntity(user);
  }

  async find(id: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return UserResponseDto.fromEntity(user);
  }

  async findMany(): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.findMany();
    return users.map((user) => UserResponseDto.fromEntity(user));
  }

  async delete(id: number): Promise<void> {
    await this.find(id);
    try {
      await this.usersRepository.delete(id);
    } catch (error) {
      // FK 제약(발주서·변경요청 등 연관 레코드 존재)으로 삭제 불가 → 409
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(`User ${id} cannot be deleted because related records exist`);
      }
      throw error;
    }
  }
}
