import { Controller, Get, Post, Delete, Body, Param, HttpStatus, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as crypto from 'crypto';

@Controller('api/admin/licenses')
export class AdminLicensesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getLicenses() {
    return this.prisma.license.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  @Post()
  async createLicense(@Body() body: { restaurant: string; durationDays: number }) {
    const { restaurant, durationDays } = body;
    if (!restaurant || !durationDays) {
      throw new HttpException('Missing restaurant name or duration days', HttpStatus.BAD_REQUEST);
    }

    // Generate format TATHASTU-XXXX-XXXX-XXXX
    const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p3 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const key = `TATHASTU-${p1}-${p2}-${p3}`;

    const newLicense = await this.prisma.license.create({
      data: {
        key,
        restaurant,
        durationDays: Number(durationDays),
        isActive: true
      }
    });

    return { success: true, license: newLicense };
  }

  @Post(':id/toggle')
  async toggleLicense(@Param('id') id: string) {
    const license = await this.prisma.license.findUnique({ where: { id } });
    if (!license) {
      throw new HttpException('License not found', HttpStatus.NOT_FOUND);
    }

    const updated = await this.prisma.license.update({
      where: { id },
      data: { isActive: !license.isActive }
    });

    return { success: true, license: updated };
  }

  @Post(':id/renew')
  async renewLicense(@Param('id') id: string, @Body() body: { durationDays: number }) {
    const { durationDays } = body;
    const license = await this.prisma.license.findUnique({ where: { id } });
    if (!license) {
      throw new HttpException('License not found', HttpStatus.NOT_FOUND);
    }

    const days = Number(durationDays) || 30;
    
    // Extend from current expiresAt if it is in the future, otherwise from now
    let baseDate = new Date();
    if (license.expiresAt && new Date(license.expiresAt).getTime() > Date.now()) {
      baseDate = new Date(license.expiresAt);
    }

    const newExpiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.license.update({
      where: { id },
      data: {
        expiresAt: newExpiresAt,
        isActive: true,
        durationDays: days
      }
    });

    return { success: true, license: updated };
  }

  @Delete(':id')
  async deleteLicense(@Param('id') id: string) {
    await this.prisma.license.delete({ where: { id } });
    return { success: true, msg: 'License revoked and deleted successfully.' };
  }
}
