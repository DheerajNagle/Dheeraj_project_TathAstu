import { Controller, Post, Get, Body, Query } from '@nestjs/common';
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
  async pullCatalog(@Query('outletId') outletId?: string) {
    return this.syncService.pullCatalog(outletId);
  }

  @Post('webhook/swiggy')
  async swiggyWebhook(@Body() payload: any) {
    return this.syncService.processSwiggyWebhook(payload);
  }

  @Post('webhook/zomato')
  async zomatoWebhook(@Body() payload: any) {
    return this.syncService.processZomatoWebhook(payload);
  }
}
