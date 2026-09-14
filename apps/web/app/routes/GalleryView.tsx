import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import styles from "./gallery.module.css";
import type { GalleryAccessLevel } from "~/lib/gallery-auth.server";

export interface GalleryMedia {
  id: string;
  type: "photo" | "video";
  width: number | null;
  height: number | null;
}

interface GalleryViewProps {
  lang: Lang;
  gallery: {
    id: string;
    public_id: string;
    bride_names: string;
    wedding_date: string;
    location: string | null;
    intro_fr: string | null;
    intro_en: string | null;
    signature_fr: string | null;
    signature_en: string | null;
  };
  accessLevel: GalleryAccessLevel;
  media: GalleryMedia[];
}

export function GalleryView({ lang, gallery, media }: Omit<GalleryViewProps, "accessLevel">) {
  const t = { 
    downloadAll: lang === "fr" ? "Tout télécharger" : "Download all",
    photos: lang === "fr" ? "Photos" : "Photos",
    videos: lang === "fr" ? "Vidéos" : "Videos"
  };

  const alternateLangHref = lang === "fr" ? `/en/gallery/${gallery.public_id}` : `/fr/galerie/${gallery.public_id}`;
  
  const intro = lang === "fr" ? gallery.intro_fr : gallery.intro_en;
  const signature = lang === "fr" ? gallery.signature_fr : gallery.signature_en;

  const photos = media.filter(m => m.type === "photo");
  const videos = media.filter(m => m.type === "video");

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main className={styles.galleryWrap}>
        <div className={styles.hero}>
          <h1>{gallery.bride_names}</h1>
          <p className={styles.date}>{gallery.wedding_date}</p>
          {gallery.location && <p className={styles.location}>{gallery.location}</p>}
        </div>

        {intro && (
          <div className={styles.intro}>
            <p>{intro}</p>
            {signature && <p className={styles.signature}>{signature}</p>}
          </div>
        )}

        <div className={styles.actions}>
          <a href={`/api/gallery/${gallery.public_id}/download`} className={`btn btn--primary ${styles.downloadBtn}`}>
            {t.downloadAll}
          </a>
        </div>

        {videos.length > 0 && (
          <section className={styles.section}>
            <h2>{t.videos}</h2>
            <div className={styles.videoGrid}>
              {videos.map(v => (
                <div key={v.id} className={styles.videoItem}>
                  <video controls preload="none">
                    <source src={`/api/gallery/${gallery.public_id}/media/${v.id}`} type="video/mp4" />
                    Votre navigateur ne supporte pas la lecture vidéo.
                  </video>
                </div>
              ))}
            </div>
          </section>
        )}

        {photos.length > 0 && (
          <section className={styles.section}>
            <h2>{t.photos}</h2>
            <div className={styles.photoGrid}>
              {photos.map(p => (
                <div key={p.id} className={styles.photoItem}>
                  <img 
                    src={`/api/gallery/${gallery.public_id}/media/${p.id}`} 
                    loading="lazy" 
                    alt={`Photo de ${gallery.bride_names}`} 
                    style={p.width && p.height ? { aspectRatio: `${p.width}/${p.height}` } : undefined}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer lang={lang} />
    </>
  );
}
