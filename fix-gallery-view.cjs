const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/routes/GalleryView.tsx');
let content = fs.readFileSync(target, 'utf-8');

// Ensure we don't duplicate data-testid if it's already there
if (!content.includes('data-testid="gallery-photo"')) {
  content = content.replace(/className=\{styles\.mediaItem\}/g, 'className={styles.mediaItem} data-testid="gallery-photo"');
}

if (!content.includes('data-testid="gallery-video"')) {
  content = content.replace(/className=\{styles\.videoCard\}/g, 'className={styles.videoCard} data-testid="gallery-video"');
}

fs.writeFileSync(target, content);
console.log("Fixed GalleryView.tsx");
