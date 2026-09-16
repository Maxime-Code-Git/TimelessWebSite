const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/execSync\(`ffmpeg -f lavfi -i color=c=blue:s=160x120:d=0\.1 -vcodec libx264 -pix_fmt yuv420p -y \$\{guestVideoPath\}`\);\n/g, 
  `fs.copyFileSync(path.join(__dirname, "fixtures/vid1.mp4"), guestVideoPath);\n`);
content = content.replace(/execSync\(`ffmpeg -f lavfi -i color=c=red:s=160x120:d=0\.1 -vcodec libx264 -pix_fmt yuv420p -y \$\{coupleVideoPath\}`\);\n/g, 
  `fs.copyFileSync(path.join(__dirname, "fixtures/vid2.mp4"), coupleVideoPath);\n`);
content = content.replace(/Photos are in \.media-item/g, `Photos are in gallery-photo`);

fs.writeFileSync(target, content);
console.log("Fixed e2e leftovers");
