/**
 * @fileoverview Types partagés et utilitaires pour Timeless
 */

export const SITE_CONFIG = {
  name: "Timeless",
  tagline: "Photographe & Vidéaste de mariage en Belgique",
  email: "contact@timeless.be",
} as const;

export type Category = "photo" | "film" | "duo";

export interface Formule {
  name: string;
  note: string;
  featured: boolean;
  price?: number; // Optionnel
}

export interface FormulesMap {
  photo: Formule[];
  film: Formule[];
  duo: Formule[];
}

// Validation type helpers for Phase 3 (Forms & API)
export interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  date: string;
  location: string;
  message: string;
}
