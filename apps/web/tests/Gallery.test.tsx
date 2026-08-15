import { describe, it, expect } from "vitest";
import GalleryFr, { loader } from "../app/routes/fr.gallery";

describe("Gallery Component", () => {
  it("renders null", () => {
    expect(GalleryFr()).toBeNull();
  });

  it("loader throws a redirect to espace-clients", async () => {
    try {
      await loader({ request: new Request("http://localhost/fr/galerie/123"), params: {}, context: {} });
      expect.fail("Loader should have thrown a redirect");
    } catch (response: any) {
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/fr/espace-clients?status=unavailable");
    }
  });
});
