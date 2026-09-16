const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. ESM path for fixtures
content = content.replace(/import \* as path from "node:path";/, 'import * as path from "node:path";\nimport { fileURLToPath } from "node:url";');
content = content.replace(/__dirname/g, 'fixtureDirectory');
const addFixtureDir = `
const fixtureDirectory = fileURLToPath(
  new URL("./fixtures/", import.meta.url)
);
`;
content = content.replace(/test\.describe\.serial\("Galeries Clients", \(\) => \{/, `test.describe.serial("Galeries Clients", () => {\n${addFixtureDir}`);

// 4. Remove `if (heading > 0)` logic if it exists (my previous regex might have missed it if spaces differed)
content = content.replace(/const heading = await adminPage\.locator\('h2:has-text\("Admin"\)'\)\.count\(\);\n\s*if \(heading > 0\) \{[\s\S]*?\}\n/, '');

// Actually, in the previous rewrite I removed `if (heading === 0)`, wait!
// The user said `const heading = ... if (heading > 0) {`
// Let me just replace the login section blindly:
const loginSection = `await adminPage.goto("/admin");
    const heading = await adminPage.locator('h2:has-text("Admin")').count();
    if (heading > 0) {
      await adminPage.fill('input[name="email"]', 'admin@example.com');
      await adminPage.fill('input[name="password"]', 'e2e_password');
      await adminPage.click('button[type="submit"]');
      await adminPage.waitForURL("/admin");
    }`;
const newLogin = `await adminPage.goto("/admin");
    await expect(adminPage.locator('input[name="password"]')).toBeVisible();
    await adminPage.fill('input[name="email"]', 'admin@example.com');
    await adminPage.fill('input[name="password"]', "e2e_password");
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL("**/admin/galleries");`;

if (content.includes('const heading = await adminPage.locator')) {
  // Try to find the exact block and replace
  content = content.replace(/await adminPage\.goto\("\/admin"\);\n\s*const heading = await adminPage\.locator\('h2:has-text\("Admin"\)'\)\.count\(\);\n\s*if \(heading [><=]+ 0\) \{[\s\S]*?\}/, newLogin);
} else {
  // My previous rewrite might have replaced it. Let's find what's there now.
  content = content.replace(/await adminPage\.goto\("\/admin"\);\n\s*await adminPage\.fill\('input\[name="email"\]', 'admin@example\.com'\);\n\s*await adminPage\.fill\('input\[name="password"\]', 'e2e_password'\);\n\s*await adminPage\.click\('button\[type="submit"\]'\);\n\s*await adminPage\.waitForURL\("\/admin"\);/, newLogin);
}

// 9. Fix video source
content = content.replace(/const videoSrc = await guestVideo\.getAttribute\("src"\);/, `const videoSrc = await guestVideo.locator("source").getAttribute("src");`);

// 10. Fix cover selection
content = content.replace(/await adminPage\.locator\('input\[name="cover_image_id"\]'\)\.first\(\)\.check\(\{ force: true \}\);/, `await adminPage.locator('input[name="cover_image_id"]:not([value=""])').first().check({ force: true });`);

fs.writeFileSync(target, content);
console.log("Fixed E2E spec parts");
