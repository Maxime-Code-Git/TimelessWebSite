import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import { Header } from "../app/components/layout/Header";

describe("Header Component", () => {
  it("renders French navigation correctly", () => {
    render(
      <MemoryRouter>
        <Header lang="fr" alternateLangHref="/en/" />
      </MemoryRouter>
    );

    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Formules")).toBeInTheDocument();
    expect(screen.getByText("À propos")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Espace clients")).toBeInTheDocument();
  });

  it("renders English navigation correctly", () => {
    render(
      <MemoryRouter>
        <Header lang="en" alternateLangHref="/fr/" />
      </MemoryRouter>
    );

    expect(screen.getByText("Pricing")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("Client area")).toBeInTheDocument();
  });

  it("handles language switcher logic", () => {
    render(
      <MemoryRouter>
        <Header lang="fr" alternateLangHref="/en/pricing" />
      </MemoryRouter>
    );

    // Active lang is FR
    expect(screen.getByText("FR")).toBeInTheDocument();
    // Inactive lang link is EN pointing to alternateHref
    const enLink = screen.getByRole("link", { name: "Switch to EN" });
    expect(enLink).toHaveAttribute("href", "/en/pricing");
  });

  it("renders reciprocal Parallax link in navigation in French", () => {
    const { container } = render(
      <MemoryRouter>
        <Header lang="fr" alternateLangHref="/en/" />
      </MemoryRouter>
    );

    const parallaxLink = screen.getByRole("link", { name: "PARALLAX ↗" });
    expect(parallaxLink).toBeInTheDocument();
    expect(parallaxLink).toHaveAttribute("href", "https://parallax-creative-studio.com/");
    expect(parallaxLink).toHaveAttribute("target", "_blank");
    expect(parallaxLink).toHaveAttribute("rel", "noopener noreferrer");

    // Verify it is placed before client area in navigation
    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
    if (nav) {
      const links = Array.from(nav.querySelectorAll("a"));
      const parallaxIdx = links.findIndex((a) => a.textContent?.includes("PARALLAX ↗"));
      const clientAreaIdx = links.findIndex((a) => a.textContent?.includes("Espace clients"));
      expect(parallaxIdx).toBeGreaterThan(-1);
      expect(clientAreaIdx).toBeGreaterThan(-1);
      expect(parallaxIdx).toBeLessThan(clientAreaIdx);
    }
  });

  it("renders reciprocal Parallax link in navigation in English", () => {
    const { container } = render(
      <MemoryRouter>
        <Header lang="en" alternateLangHref="/fr/" />
      </MemoryRouter>
    );

    const parallaxLink = screen.getByRole("link", { name: "PARALLAX ↗" });
    expect(parallaxLink).toBeInTheDocument();
    expect(parallaxLink).toHaveAttribute("href", "https://parallax-creative-studio.com/");
    expect(parallaxLink).toHaveAttribute("target", "_blank");
    expect(parallaxLink).toHaveAttribute("rel", "noopener noreferrer");

    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();
    if (nav) {
      const links = Array.from(nav.querySelectorAll("a"));
      const parallaxIdx = links.findIndex((a) => a.textContent?.includes("PARALLAX ↗"));
      const clientAreaIdx = links.findIndex((a) => a.textContent?.includes("Client area"));
      expect(parallaxIdx).toBeGreaterThan(-1);
      expect(clientAreaIdx).toBeGreaterThan(-1);
      expect(parallaxIdx).toBeLessThan(clientAreaIdx);
    }
  });
});
