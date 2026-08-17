const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROUTES = [
  '/fr/',
  '/en/',
  '/fr/portfolio',
  '/fr/formules',
  '/fr/a-propos',
  '/fr/contact',
  '/fr/espace-clients',
  '/__test/gallery',
];

async function capture() {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  
  const desktopPage = await desktop.newPage();
  const mobilePage = await mobile.newPage();
  
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }
  
  for (const route of ROUTES) {
    let filename = route.replace(/\//g, '-').replace(/^-|-$/g, '');
    if (filename === 'fr') filename = 'accueil-fr';
    if (filename === 'en') filename = 'accueil-en';
    if (filename === '-test-gallery') filename = 'test-gallery';

    console.log(`Capturing ${route}...`);
    
    // Desktop
    await desktopPage.goto(`http://localhost:5173${route}`);
    // Wait a bit for animations/fonts
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `screenshots/desktop-${filename}.png`, fullPage: true });
    
    // Mobile
    await mobilePage.goto(`http://localhost:5173${route}`);
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: `screenshots/mobile-${filename}.png`, fullPage: true });
  }
  
  await browser.close();
  console.log('Screenshots generated in /screenshots directory.');

  const { execSync } = require('child_process');
  execSync('zip -r ../../visual-review.zip screenshots generate-screenshots.cjs');
  console.log('visual-review.zip created at root.');
}

capture().catch(console.error);
