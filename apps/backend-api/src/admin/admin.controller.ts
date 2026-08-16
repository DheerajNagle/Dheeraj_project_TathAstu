import { Controller, Get, Res } from '@nestjs/common';
import * as express from 'express';
import { AdminService } from './admin.service.js';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard(@Res() res: express.Response) {
    const pathsToTry = [
      path.resolve(process.cwd(), 'public/dashboard.html'),
      path.resolve(process.cwd(), 'apps/backend-api/public/dashboard.html'),
      path.resolve(__dirname, '../../public/dashboard.html'),
      path.resolve(__dirname, '../public/dashboard.html'),
      path.resolve(__dirname, '../../../public/dashboard.html')
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    }

    return res.status(404).send(`Dashboard template HTML file not found. Tried paths: ${pathsToTry.join(', ')}`);
  }

  @Get('api/admin/metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('api/admin/orders')
  getOrders() {
    return this.adminService.getOrders();
  }
}
