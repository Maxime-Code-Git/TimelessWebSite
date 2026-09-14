import { expect, test } from 'vitest';
import { hashGalleryCode, generateGalleryCode } from '../app/lib/gallery-auth.server';

test('hashGalleryCode generates consistent hashes', () => {
  const hash1 = hashGalleryCode('ABC-123');
  const hash2 = hashGalleryCode('ABC-123');
  expect(hash1).toBe(hash2);
});

test('hashGalleryCode ignores dashes and cases', () => {
  const hash1 = hashGalleryCode('ABC-123');
  const hash2 = hashGalleryCode('abc123');
  expect(hash1).toBe(hash2);
});

test('generateGalleryCode creates codes of correct length', () => {
  const code = generateGalleryCode();
  expect(code.length).toBeGreaterThanOrEqual(9); // Format ABC-DEF-GHI
});
