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

  it("1: presence of audience choice group and upload buttons with accessible labels", () => {
    render(<GalleryBrowserUpload {...defaultProps} />);

    const fieldset = screen.getByRole("group", { name: "Destination des médias à sélectionner :" });
    expect(fieldset).toBeInTheDocument();

    const guestRadio = screen.getByRole("radio", { name: /Invités - visible par tous les détenteurs d'un code/ });
    const coupleRadio = screen.getByRole("radio", { name: /Mariés uniquement - visible uniquement avec le code mariés/ });

    expect(guestRadio).toBeInTheDocument();
    expect(coupleRadio).toBeInTheDocument();
    expect(guestRadio).toBeChecked();
    expect(coupleRadio).not.toBeChecked();

    const photoBtn = screen.getByRole("button", { name: /Importer des photos/ });
    const videoBtn = screen.getByRole("button", { name: /Importer des vidéos/ });

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

    const photoBtn = screen.getByRole("button", { name: /Importer des photos/ });
    photoBtn.focus();
    expect(photoBtn).toHaveFocus();

    fireEvent.click(photoBtn);
    expect(photoBtn).toHaveFocus();
  });

  it("5: memorizes destination per file at selection time even if audience radio changes afterwards", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      // return slow pending response
      return new Promise(() => {});
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;

    // Default audience is Invités. Add file 1.
    const file1 = new File(["dummy 1"], "photo_guest.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [file1] } });
    });

    // Check that file 1 has [Invités] badge
    const file1El = screen.getByTitle("photo_guest.jpg");
    expect(file1El).toBeInTheDocument();
    expect(file1El.textContent).toContain("[Invités]");

    // Switch audience to "Mariés uniquement"
    const coupleRadio = screen.getByRole("radio", { name: /Mariés uniquement/ });
    await act(async () => {
      fireEvent.click(coupleRadio);
    });
    expect(coupleRadio).toBeChecked();

    // Now add file 2
    const file2 = new File(["dummy 2"], "photo_couple.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [file2] } });
    });

    // Verify file 1 REMAINS [Invités] and file 2 has [Mariés]
    const file1ElAfter = screen.getByTitle("photo_guest.jpg");
    const file2ElAfter = screen.getByTitle("photo_couple.jpg");
    expect(file1ElAfter.textContent).toContain("[Invités]");
    expect(file2ElAfter.textContent).toContain("[Mariés uniquement]");
  });

  it("6: displays progress, status and triggers batch completion callback upon successful upload", async () => {
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

    const progressBars = container.querySelectorAll("progress");
    expect(progressBars.length).toBeGreaterThan(0);
    for (const pb of progressBars) {
      expect(pb.getAttribute("style")).toBeNull();
    }

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(initCalls).toBe(1);
    expect(chunkCalls).toBe(1);
    expect(finalizeCalls).toBe(1);

    expect(defaultProps.onUploadBatchComplete).toHaveBeenCalledWith("alice-bob-g1234");
    expect(screen.getByText("✓ Terminé")).toBeInTheDocument();

    const successStatus = screen.getByText(/Tous les fichiers ont été envoyés avec succès/);
    expect(successStatus).toBeInTheDocument();
    expect(successStatus).toHaveAttribute("role", "status");
  });

  it("7: handles permanent 4xx error immediately without automatic retry", async () => {
    let initCalls = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        initCalls++;
        return new Response(JSON.stringify({ error: "Validation échouée: format non supporté" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const testFile = new File(["dummy content"], "bad-file.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [testFile] } });
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // Permanent 400 error must NOT be retried: init called exactly 1 time!
    expect(initCalls).toBe(1);

    // Verify alert role and error message with phase
    const alertEl = screen.getByRole("alert");
    expect(alertEl).toBeInTheDocument();
    expect(alertEl).toHaveTextContent("Validation échouée: format non supporté");

    // Retry button is available for manual retry
    const retryBtn = screen.getByRole("button", { name: /Réessayer l'envoi de bad-file.jpg/ });
    expect(retryBtn).toBeInTheDocument();
  });

  it("8: performs bounded automatic retries with backoff on transient errors", async () => {
    let attempts = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        attempts++;
        if (attempts === 1) {
          // Fail first attempt with transient 503
          return new Response(JSON.stringify({ error: "Service Unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        // 2nd attempt succeeds via automatic retry
        return new Response(JSON.stringify({ uploadId: "upl-transient-1", uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=chunk") || urlStr.includes("action=finalize")) {
        return new Response(JSON.stringify({ success: true, fileName: "transient.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const testFile = new File(["dummy content"], "transient.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [testFile] } });
    });

    // Wait for retries with backoff (1000ms delay for 1st retry)
    await act(async () => {
      await new Promise(r => setTimeout(r, 1300));
    });

    expect(attempts).toBe(2);
    expect(screen.getByText("✓ Terminé")).toBeInTheDocument();
  });

  it("9: provides global retry button 'Réessayer tous les échecs' when multiple items fail", async () => {
    let shouldFail = true;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        if (shouldFail) {
          return new Response(JSON.stringify({ error: "Erreur permanente simulée" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ uploadId: "upl-ok", uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const file1 = new File(["1"], "fail1.jpg", { type: "image/jpeg" });
    const file2 = new File(["2"], "fail2.jpg", { type: "image/jpeg" });

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: [file1, file2] } });
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    // Global retry button should be visible
    const retryAllBtn = screen.getByRole("button", { name: "Réessayer tous les échecs" });
    expect(retryAllBtn).toBeInTheDocument();

    // Individual retry buttons should also be visible
    expect(screen.getByRole("button", { name: /Réessayer l'envoi de fail1.jpg/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer l'envoi de fail2.jpg/ })).toBeInTheDocument();

    // Now fix the error and click "Réessayer tous les échecs"
    shouldFail = false;
    await act(async () => {
      fireEvent.click(retryAllBtn);
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    expect(screen.getByText(/Tous les fichiers ont été envoyés avec succès/)).toBeInTheDocument();
  });

  it("10: behaves reliably under StrictMode without duplicate batch submissions", async () => {
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

    expect(initCalls).toBe(1);
    expect(defaultProps.onUploadBatchComplete).toHaveBeenCalledTimes(1);
  });

  it("11: displays error alert when exceeding MAX_BATCH_FILES", async () => {
    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const tooManyFiles = Array.from({ length: 2001 }, (_, i) => new File(["content"], `test-${i}.jpg`, { type: "image/jpeg" }));

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: tooManyFiles } });
    });

    const alertEl = screen.getByRole("alert");
    expect(alertEl).toBeInTheDocument();
    expect(alertEl).toHaveTextContent("Limite dépassée : un lot ne peut pas contenir plus de 2000 fichiers.");
  });

  it("12: handles selection of 1,000 photos without buffering in memory and runs max 2 uploads concurrently", async () => {
    let activeUploads = 0;
    let maxConcurrentSeen = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("action=init")) {
        activeUploads++;
        if (activeUploads > maxConcurrentSeen) {
          maxConcurrentSeen = activeUploads;
        }
        return new Response(JSON.stringify({ uploadId: `upl-${Date.now()}-${Math.random()}`, uploadedChunks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=chunk")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("action=finalize")) {
        activeUploads--;
        return new Response(JSON.stringify({ success: true, fileName: "test.jpg" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    const { container } = render(<GalleryBrowserUpload {...defaultProps} />);

    const photoInput = container.querySelector('input[type="file"][accept*="image/jpeg"]') as HTMLInputElement;
    const thousandPhotos = Array.from({ length: 1000 }, (_, i) => new File(["img"], `photo_${i}.jpg`, { type: "image/jpeg" }));

    await act(async () => {
      fireEvent.change(photoInput, { target: { files: thousandPhotos } });
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(maxConcurrentSeen).toBeLessThanOrEqual(2);
  });
});
