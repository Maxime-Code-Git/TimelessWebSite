/**
 * @fileoverview Types partagés et utilitaires pour Sempra
 * Ce module est consommé directement depuis ses sources (pas de build dist/ nécessaire).
 */

export type Category = "photo" | "film" | "duo";

export interface Formule {
  name: string;
  note: string;
  featured: boolean;
  price?: number;
}

export interface FormulesMap {
  photo: Formule[];
  film: Formule[];
  duo: Formule[];
}

// Validation type helpers pour Phase 3 (Forms & API)
export interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  date: string;
  location: string;
  message: string;
}
