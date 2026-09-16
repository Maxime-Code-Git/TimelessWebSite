const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/routes/GalleryView.tsx');
let content = fs.readFileSync(target, 'utf-8');

const photoDivTarget = 'className={`${styles.photoItem} ${isLandscape ? styles.photoItemLandscape : styles.photoItemPortrait}`}';
const photoDivReplace = 'className={`${styles.photoItem} ${isLandscape ? styles.photoItemLandscape : styles.photoItemPortrait}`} data-testid="gallery-photo"';

if (!content.includes('data-testid="gallery-photo"')) {
  content = content.replace(photoDivTarget, photoDivReplace);
}

fs.writeFileSync(target, content);
console.log("Fixed GalleryView.tsx 3");
