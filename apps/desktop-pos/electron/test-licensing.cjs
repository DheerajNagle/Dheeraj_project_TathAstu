const crypto = require('crypto');
const os = require('os');
const { machineIdSync } = require('node-machine-id');

console.log('--- Starting Track A Licensing Verification Test ---');

// 1. Generate Hardware ID (CPU UUID + MAC Address SHA-256 hash)
function getHardwareId() {
  let cpuId = 'UNKNOWN-CPU-UUID';
  try {
    cpuId = machineIdSync();
  } catch (e) {
    console.warn('Failed to fetch CPU machineId, falling back:', e.message);
  }
  
  let macs = '';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        macs += net.mac;
      }
    }
  }
  return crypto.createHash('sha256').update(cpuId + macs).digest('hex');
}

const hwId = getHardwareId();
console.log(`Generated Unique SHA-256 Device Hardware ID:\n  => ${hwId}\n`);

// 2. Local AES-256-CBC Encryption locks
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_SECRET = hwId.slice(0, 32);
const ENCRYPTION_IV = Buffer.alloc(16, 0);

function encryptToken(text) {
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_SECRET), ENCRYPTION_IV);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptToken(text) {
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_SECRET), ENCRYPTION_IV);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

// 3. Mock JWT Activation Payload
const mockPayload = {
  licenseKey: 'TATHASTU-PRO-INSTALL-101',
  hardwareId: hwId,
  features: ['pos-billing', 'kds-screen', 'shifting', 'recipes', 'cloud-dashboard'],
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
};

const mockJwt = `header.${Buffer.from(JSON.stringify(mockPayload)).toString('base64')}.signature`;
console.log('Simulated Cloud JWT Token:\n  =>', mockJwt.slice(0, 70) + '...');

// 4. Encrypt JWT Token
const encryptedToken = encryptToken(mockJwt);
console.log('\nSaved Local Encrypted SQLite token value:\n  =>', encryptedToken.slice(0, 70) + '...');

// 5. Decrypt and verify matching signatures
const decryptedToken = decryptToken(encryptedToken);
console.log('\nDecrypted SQLite token value:\n  =>', decryptedToken.slice(0, 70) + '...');

const decodedPayload = JSON.parse(Buffer.from(decryptedToken.split('.')[1], 'base64').toString('utf8'));
console.log('\nDecoded Token Parameters:');
console.log('  * License Key: ', decodedPayload.licenseKey);
console.log('  * Target Hardware Bind:', decodedPayload.hardwareId);
console.log('  * Expiration Time:    ', decodedPayload.expiresAt);
console.log('  * Activated Features: ', decodedPayload.features.join(', '));

if (decodedPayload.hardwareId === hwId) {
  console.log('\n[PASS] Hardware ID matches device signature.');
} else {
  console.error('\n[FAIL] Hardware ID mismatch!');
  process.exit(1);
}

if (new Date(decodedPayload.expiresAt).getTime() > Date.now()) {
  console.log('[PASS] Token activation timestamp remains valid.');
} else {
  console.error('[FAIL] Token timestamp is expired!');
  process.exit(1);
}

// 6. Test with a mismatching decryption key (simulating token copied to another machine)
const wrongSecret = crypto.createHash('sha256').update('ANOTHER-MACHINE-MAC').digest('hex').slice(0, 32);
function decryptWithWrongKey(text) {
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(wrongSecret), ENCRYPTION_IV);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

const failedDecryption = decryptWithWrongKey(encryptedToken);
console.log('\nDecrypting token on another device (different Hardware ID fingerprint):');
console.log(`  => Decryption Result: ${failedDecryption === null ? 'NULL (Decryption Failed/Enforced Security)' : failedDecryption}`);

if (failedDecryption === null) {
  console.log('[PASS] Anti-Tampering copied token lock verified.');
} else {
  console.error('[FAIL] Anti-Tampering copied token lock failure!');
  process.exit(1);
}

console.log('\n--- Licensing Test Suite Completed Successfully ---');
