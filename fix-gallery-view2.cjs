const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/routes/GalleryView.tsx');
let content = fs.readFileSync(target, 'utf-8');

// For photos:
if (!content.includes('data-testid="gallery-photo"')) {
  content = content.replace(/<div\s+key=\{[^\}]+\}\s+className=\{styles\.mediaItem\}/g, match => match + ' data-testid="gallery-photo"');
}

// Ensure video also replaces properly if not already there (though the previous grep found one)
content = content.replace(/<div key=\{media\.id\} className=\{styles\.videoCard\}>/g, '<div key={media.id} className={styles.videoCard} data-testid="gallery-video">');

fs.writeFileSync(target, content);
console.log("Fixed GalleryView.tsx 2");
