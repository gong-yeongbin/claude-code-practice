import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

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
    await this.usersRepository.delete(id);
  }
}
