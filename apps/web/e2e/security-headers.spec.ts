import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('should return correct CSP and security headers on document request', async ({ request }) => {
    const response = await request.get('/fr/');
    const headers = response.headers();
    
    // Check security headers
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    
    // Check CSP
    const csp = headers['content-security-policy'];
    expect(csp).toContain('default-src \'self\'');
    expect(csp).toContain('script-src \'self\' \'nonce-');
    expect(csp).toContain('frame-ancestors \'none\'');
    
    // HSTS should be omitted (per instructions)
    expect(headers['strict-transport-security']).toBeUndefined();
  });
});
