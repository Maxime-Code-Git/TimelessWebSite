import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import { GalleryView, packRows, type GalleryMedia } from "../app/routes/GalleryView";

vi.mock("~/components/layout/Header", () => ({ Header: () => null }));
vi.mock("~/components/layout/Footer", () => ({ Footer: () => null }));


describe("packRows layout logic", () => {
  const p = (id: string): GalleryMedia => ({ id, type: "photo", mime_type: "image/jpeg", width: 800, height: 1200, visibility: "maries", poster_revision: null }); // Portrait (1 unit)
  const l = (id: string): GalleryMedia => ({ id, type: "photo", mime_type: "image/jpeg", width: 1200, height: 800, visibility: "maries", poster_revision: null }); // Landscape (2 units)

  test("1. répartition sans trou: portrait, portrait, portrait, paysage", () => {
    const photos = [p("1"), p("2"), p("3"), l("4")];
    const rows = packRows(photos);
    expect(rows.length).toBe(2);
    expect(rows[0].units).toBe(3);
    expect(rows[0].photos).toHaveLength(3);
    expect(rows[1].units).toBe(2);
    expect(rows[1].photos).toHaveLength(1);
  });

  test("2. rangée incomplète portrait + paysage occupant trois unités", () => {
    const photos = [p("1"), l("2")];
    const rows = packRows(photos);
    expect(rows.length).toBe(1);
    expect(rows[0].units).toBe(3);
    expect(rows[0].photos).toHaveLength(2);
  });

  test("3. dernier paysage seul", () => {
    const photos = [l("1")];
    const rows = packRows(photos);
    expect(rows.length).toBe(1);
    expect(rows[0].units).toBe(2);
    expect(rows[0].photos).toHaveLength(1);
    expect(rows[0].isSinglePortrait).toBe(false);
  });

  test("4. dernier portrait seul", () => {
    const photos = [p("1")];
    const rows = packRows(photos);
    expect(rows.length).toBe(1);
    expect(rows[0].units).toBe(1);
    expect(rows[0].photos).toHaveLength(1);
    expect(rows[0].isSinglePortrait).toBe(true);
  });
});

describe("Lightbox interactions", () => {
  const p = (id: string): GalleryMedia => ({ id, type: "photo", mime_type: "image/jpeg", width: 800, height: 1200, visibility: "maries", poster_revision: null });

  const galleryProps = {
    public_id: "test",
    bride_names: "A & B",
    wedding_date: "2026",
    location: null,
    intro_fr: null,
    intro_en: null,
    signature_fr: null,
    signature_en: null,
    cover_image_id: null,
  };

  test("5. apparition du statut de chargement à l’ouverture", () => {
    render(<MemoryRouter><GalleryView lang="fr" gallery={galleryProps} media={[p("1")]} /></MemoryRouter>);
    const photoBtn = screen.getByRole("button", { name: "Photo de A & B" });
    fireEvent.click(photoBtn);
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de l’image…");
  });

  test("6. disparition du statut après load", () => {
    render(<MemoryRouter><GalleryView lang="fr" gallery={galleryProps} media={[p("1")]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Photo de A & B" }));
    const img = screen.getByTestId("lightbox-full-image");
    fireEvent.load(img);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("7. affichage du message après error", () => {
    render(<MemoryRouter><GalleryView lang="fr" gallery={galleryProps} media={[p("1")]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Photo de A & B" }));
    const img = screen.getByTestId("lightbox-full-image");
    fireEvent.error(img);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger l’image.");
  });

  test("8. traductions EN", () => {
    render(<MemoryRouter><GalleryView lang="en" gallery={galleryProps} media={[p("1")]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Photo of A & B" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading image…");
    const img = screen.getByTestId("lightbox-full-image");
    fireEvent.error(img);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load the image.");
  });
});
