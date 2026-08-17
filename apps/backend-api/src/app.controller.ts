import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = 'TATHASTU_SECRET_POS_LICENSING_KEY_2026';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('api/license/activate')
  async activateLicense(@Body() body: { licenseKey: string; hardwareId: string }) {
    const { licenseKey, hardwareId } = body;
    if (!licenseKey || !hardwareId) {
      return { success: false, msg: 'Missing License Key or Hardware ID parameters.' };
    }

    const license = await this.prisma.license.findUnique({
      where: { key: licenseKey }
    });

    if (!license) {
      // Fallback for mock static keys
      const validKeys = [
        'TATHASTU-PRO-INSTALL-101',
        'TATHASTU-CORP-OFFLINE-999',
        'TATHASTU-POS9-KEYS-2026'
      ];
      
      const hasPatternMatch = licenseKey.startsWith('TATHASTU-') && licenseKey.split('-').length === 4;
      const isValidKey = validKeys.includes(licenseKey) || hasPatternMatch;
      
      if (isValidKey) {
        const payload = {
          licenseKey,
          hardwareId,
          features: ['pos-billing', 'kds-screen', 'shifting', 'recipes', 'cloud-dashboard'],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
        console.log(`[License Server] Activated mock installation for Key: ${licenseKey}, Device ID: ${hardwareId}`);
        return { success: true, token, msg: 'License verified & activated successfully.' };
      } else {
        return { success: false, msg: 'Invalid activation License Key. Please contact support.' };
      }
    }

    if (!license.isActive) {
      return { success: false, msg: 'This license has been deactivated or suspended.' };
    }

    if (license.hardwareId && license.hardwareId !== hardwareId) {
      return { success: false, msg: 'License is already bound to another workstation device.' };
    }

    let expiresAt = license.expiresAt;
    let activatedAt = license.activatedAt;

    if (!expiresAt) {
      activatedAt = new Date();
      expiresAt = new Date(Date.now() + license.durationDays * 24 * 60 * 60 * 1000);

      await this.prisma.license.update({
        where: { id: license.id },
        data: {
          hardwareId,
          activatedAt,
          expiresAt
        }
      });
    } else if (new Date(expiresAt).getTime() < Date.now()) {
      return { success: false, msg: 'This workstation license has expired.' };
    }

    const payload = {
      licenseKey: license.key,
      hardwareId,
      features: ['pos-billing', 'kds-screen', 'shifting', 'recipes', 'cloud-dashboard'],
      expiresAt: expiresAt.toISOString()
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${license.durationDays}d` });
    console.log(`[License Server] Activated DB installation for Key: ${licenseKey}, Device ID: ${hardwareId}`);
    return { success: true, token, msg: 'License verified & activated successfully.' };
  }

  @Post('api/license/verify')
  async verifyLicense(@Body() body: { token: string; hardwareId: string }) {
    const { token, hardwareId } = body;
    if (!token || !hardwareId) {
      return { success: false, msg: 'Verification parameters missing.' };
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.hardwareId !== hardwareId) {
        return { success: false, msg: 'Hardware fingerprint mismatch.' };
      }

      // Check DB status of license
      const license = await this.prisma.license.findUnique({
        where: { key: decoded.licenseKey }
      });

      if (license) {
        if (!license.isActive) {
          return { success: false, msg: 'License suspended by system administrator.' };
        }
        if (license.expiresAt && new Date(license.expiresAt).getTime() < Date.now()) {
          return { success: false, msg: 'License subscription has expired.' };
        }
      } else {
        // Fallback validation for static mock key
        if (new Date(decoded.expiresAt).getTime() < Date.now()) {
          return { success: false, msg: 'License token expired.' };
        }
      }

      return { success: true, msg: 'License verified.', expiresAt: decoded.expiresAt, features: decoded.features };
    } catch (e) {
      return { success: false, msg: 'Invalid or tampered license token.' };
    }
  }
}
