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
});
