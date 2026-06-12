import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ChangeRequestsModule } from './change-requests/change-requests.module';

@Module({
  imports: [PrismaModule, UsersModule, PurchaseOrdersModule, ChangeRequestsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
