import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminLicensesController } from './admin-licenses.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController, AdminLicensesController],
  providers: [AdminService],
  exports: [AdminService]
})
export class AdminModule {}
