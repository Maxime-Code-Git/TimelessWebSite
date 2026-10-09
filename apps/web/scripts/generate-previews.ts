import "../../../scripts/env-loader.js";
import { getGalleryDb } from "../app/lib/gallery-db.server";
import { generateAllPreviews, ConcurrencyLimiter } from "../app/lib/gallery-preview.server";

async function main() {
  console.log("Démarrage de la génération des previews...");
  const db = getGalleryDb();

  const photos = db.prepare(`SELECT id, gallery_id FROM gallery_media WHERE type = 'photo'`).all() as { id: string; gallery_id: string }[];

  if (photos.length === 0) {
    console.log("Aucune photo trouvée dans la base de données.");
    process.exit(0);
  }

  console.log(`${photos.length} photos trouvées.`);

  let generated = 0;
  let ignored = 0; // well, technically ensurePreview ignores if already present
  let failed = 0;

  const limit = new ConcurrencyLimiter(2);

  const tasks = photos.map(photo => limit.run(async () => {
    try {
      const { generated: gen, ignored: ign } = await generateAllPreviews(photo.gallery_id, photo.id);
      generated += gen;
      ignored += ign;
    } catch (err) {
      console.error(`Erreur pour la photo ${photo.id} de la galerie ${photo.gallery_id}:`, err);
      failed++;
    }
  }));

  await Promise.all(tasks);

  console.log("Génération terminée !");
  console.log(`- Previews générées: ${generated}`);
  console.log(`- Previews ignorées (déjà présentes): ${ignored}`);
  console.log(`- Échecs: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Erreur critique:", err);
  process.exit(1);
});
