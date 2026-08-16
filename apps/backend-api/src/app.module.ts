import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SyncModule } from './sync/sync.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [PrismaModule, SyncModule, AdminModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
