import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ApiErrorResponse, ApiWrappedResponse } from '@/common/decorators/api-response.decorator';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: '사용자 생성' })
  @ApiWrappedResponse(UserResponseDto, { status: 201, description: '생성된 사용자' })
  @ApiErrorResponse(400, '요청 본문 검증 실패')
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '사용자 목록 조회' })
  @ApiWrappedResponse(UserResponseDto, { isArray: true, description: '사용자 목록' })
  async findMany(): Promise<UserResponseDto[]> {
    return this.usersService.findMany();
  }

  @Get(':id')
  @ApiOperation({ summary: '사용자 단건 조회' })
  @ApiParam({ name: 'id', type: Number, description: '사용자 ID' })
  @ApiWrappedResponse(UserResponseDto, { description: '조회된 사용자' })
  @ApiErrorResponse(404, '사용자를 찾을 수 없음')
  async find(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.find(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '사용자 삭제' })
  @ApiParam({ name: 'id', type: Number, description: '사용자 ID' })
  @ApiResponse({ status: 204, description: '삭제 성공(본문 없음)' })
  @ApiErrorResponse(404, '사용자를 찾을 수 없음')
  @ApiErrorResponse(409, '연관 레코드가 있어 삭제 불가')
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usersService.delete(id);
  }
}
