import { GalleryPage } from "~/components/pages/GalleryPage";
import { FIXTURES } from "../../tests/gallery.fixtures";

export default function TestGallery() {
  return (
    <GalleryPage
      lang="fr"
      galleryName={FIXTURES.galleryName}
      date={FIXTURES.dateFR}
      location={FIXTURES.location}
      intro={FIXTURES.introFR}
      signature={FIXTURES.signature}
      chapters={FIXTURES.chapters}
    />
  );
}
