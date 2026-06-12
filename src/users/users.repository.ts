import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '../../generated/prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; role: UserRole }): Promise<User> {
    return await this.prisma.user.create({ data });
  }

  async findById(id: bigint): Promise<User | null> {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async findMany(): Promise<User[]> {
    return await this.prisma.user.findMany();
  }

  async delete(id: bigint): Promise<User> {
    return await this.prisma.user.delete({ where: { id } });
  }
}
