import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';

@Module({
  imports: [PrismaModule, UsersModule, PurchaseOrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
