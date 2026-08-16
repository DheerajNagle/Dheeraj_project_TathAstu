import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SyncGateway } from './sync.gateway.js';
import { SyncService } from './sync.service.js';
import { SyncController } from './sync.controller.js';

@Module({
  imports: [PrismaModule],
  providers: [SyncGateway, SyncService],
  controllers: [SyncController],
  exports: [SyncGateway, SyncService]
})
export class SyncModule {}
