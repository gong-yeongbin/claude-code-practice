import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '../../generated/prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { name: string; role: UserRole }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findById(id: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findMany(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  delete(id: bigint): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
