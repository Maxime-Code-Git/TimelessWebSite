const fs = require('fs');
const path = require('path');

const newPath = path.join(__dirname, 'app/routes/admin.galleries.new.tsx');
let newContent = fs.readFileSync(newPath, 'utf-8');
newContent = newContent.replace(/<input type="text" id="wedding_date" name="wedding_date" required placeholder="ex: 15 Juillet 2026" \/>/, '<input type="date" id="wedding_date" name="wedding_date" required />');
fs.writeFileSync(newPath, newContent);

const editPath = path.join(__dirname, 'app/routes/admin.galleries.$id.tsx');
let editContent = fs.readFileSync(editPath, 'utf-8');
editContent = editContent.replace(/<input type="text" id="wedding_date" name="wedding_date" required defaultValue=\{gallery\.wedding_date as string\} \/>/, '<input type="date" id="wedding_date" name="wedding_date" required defaultValue={gallery.wedding_date ? (gallery.wedding_date as string).split("T")[0] : ""} />');
fs.writeFileSync(editPath, editContent);

console.log("Updated date inputs");
