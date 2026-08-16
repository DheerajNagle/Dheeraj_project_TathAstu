import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

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
      console.log(`[License Server] Activated installation for Key: ${licenseKey}, Device ID: ${hardwareId}`);
      return { success: true, msg: 'License verified & activated successfully.' };
    } else {
      return { success: false, msg: 'Invalid activation License Key. Please contact support.' };
    }
  }
}
