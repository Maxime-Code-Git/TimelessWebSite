import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React, { StrictMode } from "react";
import { GalleryBrowserUpload } from "../app/components/admin/GalleryBrowserUpload";

describe("GalleryBrowserUpload Component", () => {
  const defaultProps = {
    galleryId: "gal-1234",
    csrfToken: "csrf-token-abc",
    galleryFolderName: "alice-bob-g1234",
    onUploadBatchComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    defaultProps.onUploadBatchComplete.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("1: presence of both upload buttons with accessible labels", () => {
    render(<GalleryBrowserUpload {...defaultProps} />);

    const photoBtn = screen.getByRole("button", { name: "Importer des photos" });
    const videoBtn = screen.getByRole("button", { name: "Importer des vidéos" });

    expect(photoBtn).toBeInTheDocument();
    expect(videoBtn).toBeInTheDocument();
  });

  it("2: correct accept attributes on hidden file inputs", () => {
    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(2);

    const photoInput = Array.from(fileInputs).find(i => i.getAttribute("accept")?.includes("image/jpeg"));
    const videoInput = Array.from(fileInputs).find(i => i.getAttribute("accept")?.includes("video/mp4"));

    expect(photoInput).toBeDefined();
    expect(photoInput?.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp,image/avif");
    expect(photoInput?.hasAttribute("multiple")).toBe(true);

    expect(videoInput).toBeDefined();
    expect(videoInput?.getAttribute("accept")).toBe("video/mp4,video/webm");
    expect(videoInput?.hasAttribute("multiple")).toBe(true);
  });

  it("3: absence totale d'attribut style inline dans le rendu", () => {
    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);
    const styledElements = container.querySelectorAll("[style]");
    expect(styledElements.length).toBe(0);
  });

  it("4: maintains focus without losing focus on button interaction", () => {
    render(<GalleryBrowserUpload {...defaultProps} />);

    const photoBtn = screen.getByRole("button", { name: "Importer des photos" });
    photoBtn.focus();
    expect(photoBtn).toHaveFocus();

    fireEvent.click(photoBtn);
    expect(photoBtn).toHaveFocus();
  });

  it("5: displays progress, status and triggers batch completion callback upon successful upload", async () => {
    let initCalls = 0;
    let chunkCalls = 0;
    let finalizeCalls = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        initCalls++;
        return new Response(JSON.stringify({ uploadId: "upl-test-1", uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=chunk")) {
        chunkCalls++;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=finalize")) {
        finalizeCalls++;
        return new Response(JSON.stringify({ success: true, fileName: "test.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const testFile = new File(["dummy jpeg content"], "test.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [testFile] } });
    });

    // Verify progress element exists without inline style
    const progressBars = container.querySelectorAll("progress");
    expect(progressBars.length).toBeGreaterThan(0);
    for (const pb of progressBars) {
      expect(pb.getAttribute("style")).toBeNull();
    }

    // Wait for async queue processing
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(initCalls).toBe(1);
    expect(chunkCalls).toBe(1);
    expect(finalizeCalls).toBe(1);

    // Verify success status
    expect(defaultProps.onUploadBatchComplete).toHaveBeenCalledWith("alice-bob-g1234");
    expect(screen.getByText("✓ Terminé")).toBeInTheDocument();

    const successStatus = screen.getByText(/Tous les fichiers ont été envoyés avec succès/);
    expect(successStatus).toBeInTheDocument();
    expect(successStatus).toHaveAttribute("role", "status");
  });

  it("6: handles error with role=alert and allows retry", async () => {
    let failFirst = true;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        if (failFirst) {
          failFirst = false;
          return new Response(JSON.stringify({ error: "Espace disque insuffisant" }), {
            status: 507,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ uploadId: "upl-retry-1", uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=chunk") || urlStr.includes("action=finalize")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const testFile = new File(["dummy content"], "error-test.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [testFile] } });
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Verify alert role
    const alertEl = screen.getByRole("alert");
    expect(alertEl).toBeInTheDocument();
    expect(alertEl).toHaveTextContent("Espace disque insuffisant");

    // Retry button is available
    const retryBtn = screen.getByRole("button", { name: /Réessayer l'envoi de error-test.jpg/ });
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Should now succeed
    expect(screen.getByText("✓ Terminé")).toBeInTheDocument();
  });

  it("7: behaves reliably under StrictMode without duplicate batch submissions", async () => {
    let initCalls = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        initCalls++;
        return new Response(JSON.stringify({ uploadId: "upl-strict-1", uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const { container } = render(
      <StrictMode>
        <GalleryBrowserUpload {...defaultProps} />
      </StrictMode>
    );

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const testFile = new File(["dummy content"], "strict.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [testFile] } });
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Exactly 1 init call despite StrictMode double effects
    expect(initCalls).toBe(1);
    expect(defaultProps.onUploadBatchComplete).toHaveBeenCalledTimes(1);
  });
});
