import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
