import fs from 'node:fs';

const files = [
  'apps/web/app/lib/gallery-deletion-worker.server.ts',
  'apps/web/app/routes/admin.data-retention.tsx',
  'apps/web/e2e/data-retention.spec.ts',
  'apps/web/tests/admin-data-retention-booking.server.test.ts',
  'apps/web/tests/admin-data-retention-booking.test.tsx',
  'apps/web/tests/admin-data-retention-gallery.server.test.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/[ \t]+$/gm, '');
  fs.writeFileSync(file, content);
}
