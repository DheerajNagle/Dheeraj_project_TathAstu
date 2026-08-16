import { Controller, Post, Get, Body } from '@nestjs/common';
import { SyncService } from './sync.service.js';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  async pushSync(@Body() body: { items: any[] }) {
    const succeededIds = await this.syncService.pushSyncBatch(body.items || []);
    return {
      success: true,
      succeededIds
    };
  }

  @Get('pull')
  async pullCatalog() {
    return this.syncService.pullCatalog();
  }
}
