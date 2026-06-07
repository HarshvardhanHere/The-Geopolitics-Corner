import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'admin_session';

export function createSessionToken(): string {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = JSON.stringify({ expires: expiresAt });
  
  // Generate signature
  const signature = crypto
    .createHmac('sha256', adminPassword)
    .update(payload)
    .digest('hex');
    
  // Base64 encode package of payload and signature
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const { payload, signature } = JSON.parse(decoded);
    
    // Validate signature
    const expectedSignature = crypto
      .createHmac('sha256', adminPassword)
      .update(payload)
      .digest('hex');
      
    if (signature !== expectedSignature) {
      return false;
    }
    
    // Check expiry
    const { expires } = JSON.parse(payload);
    if (Date.now() > expires) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}
