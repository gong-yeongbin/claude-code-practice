// UsersRepository를 실제 PrismaService와 연결해 DB 조작을 검증하는 통합 테스트 (mock 금지)
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersRepository } from './users.repository';
import { UserRole } from '../../generated/prisma/client';

describe('UsersRepository', () => {
  let repository: UsersRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [UsersRepository],
    }).compile();

    repository = module.get<UsersRepository>(UsersRepository);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('User를 생성하고 도메인 필드를 반환한다', async () => {
      const user = await repository.create({
        name: '홍길동',
        role: UserRole.BUYER,
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('홍길동');
      expect(user.role).toBe(UserRole.BUYER);
    });
  });

  describe('findById', () => {
    it('존재하는 id면 User를 반환한다', async () => {
      const created = await repository.create({
        name: '김철수',
        role: UserRole.SOURCING,
      });

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('김철수');
    });

    it('존재하지 않는 id면 null을 반환한다', async () => {
      const found = await repository.findById(999999);

      expect(found).toBeNull();
    });
  });

  describe('findMany', () => {
    it('전체 User 목록을 반환한다', async () => {
      await repository.create({ name: 'a', role: UserRole.BUYER });
      await repository.create({ name: 'b', role: UserRole.MANUFACTURER });

      const users = await repository.findMany();

      expect(users).toHaveLength(2);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      const users = await repository.findMany();

      expect(users).toEqual([]);
    });
  });

  describe('delete', () => {
    it('User를 삭제하면 이후 조회 시 null이다', async () => {
      const created = await repository.create({
        name: '삭제대상',
        role: UserRole.BUYER,
      });

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
