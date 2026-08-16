import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service.js';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = 'TATHASTU_SECRET_POS_LICENSING_KEY_2026';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('api/license/activate')
  activateLicense(@Body() body: { licenseKey: string; hardwareId: string }) {
    const validKeys = [
      'TATHASTU-PRO-INSTALL-101',
      'TATHASTU-CORP-OFFLINE-999',
      'TATHASTU-POS9-KEYS-2026'
    ];
    
    const { licenseKey, hardwareId } = body;
    if (!licenseKey || !hardwareId) {
      return { success: false, msg: 'Missing License Key or Hardware ID parameters.' };
    }
    
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
      console.log(`[License Server] Activated installation for Key: ${licenseKey}, Device ID: ${hardwareId}`);
      return { success: true, token, msg: 'License verified & activated successfully.' };
    } else {
      return { success: false, msg: 'Invalid activation License Key. Please contact support.' };
    }
  }

  @Post('api/license/verify')
  verifyLicense(@Body() body: { token: string; hardwareId: string }) {
    const { token, hardwareId } = body;
    if (!token || !hardwareId) {
      return { success: false, msg: 'Verification parameters missing.' };
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.hardwareId !== hardwareId) {
        return { success: false, msg: 'Hardware fingerprint mismatch.' };
      }
      
      if (new Date(decoded.expiresAt).getTime() < Date.now()) {
        return { success: false, msg: 'License token expired.' };
      }
      
      return { success: true, msg: 'License verified.', expiresAt: decoded.expiresAt, features: decoded.features };
    } catch (e) {
      return { success: false, msg: 'Invalid or tampered license token.' };
    }
  }
}
