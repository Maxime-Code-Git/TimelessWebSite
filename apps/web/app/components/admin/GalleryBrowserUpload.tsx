import { useState, useRef, useEffect, useCallback } from "react";
import styles from "../../routes/admin.module.css";

export interface UploadQueueItem {
  id: string;
  file: File;
  target: "photos" | "videos";
  status: "pending" | "uploading" | "completed" | "error";
  progress: number; // 0 to 100
  error?: string;
  uploadId?: string;
}

interface GalleryBrowserUploadProps {
  galleryId: string;
  csrfToken: string;
  galleryFolderName: string;
  onUploadBatchComplete: (folderName: string) => void;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".webm"];

export const MAX_BATCH_FILES = 2000;

export function GalleryBrowserUpload({
  galleryId,
  csrfToken,
  galleryFolderName,
  onUploadBatchComplete,
}: GalleryBrowserUploadProps) {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchCompleted, setBatchCompleted] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photosButtonRef = useRef<HTMLButtonElement>(null);
  const videosButtonRef = useRef<HTMLButtonElement>(null);
  const hasNotifiedBatchRef = useRef(false);

  // Warn before closing/refreshing if uploads are in progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = "Un upload est en cours. Êtes-vous sûr de vouloir quitter ?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProcessing]);

  const addFilesToQueue = (files: FileList | File[], defaultTarget: "photos" | "videos") => {
    if (queue.length + files.length > MAX_BATCH_FILES) {
      setBatchError(`Limite dépassée : un lot ne peut pas contenir plus de ${MAX_BATCH_FILES} fichiers.`);
      return;
    }
    setBatchError(null);

    const newItems: UploadQueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let target = defaultTarget;
      const lower = file.name.toLowerCase();

      // Automatically categorize if dropped
      if (PHOTO_EXTENSIONS.some(ext => lower.endsWith(ext))) {
        target = "photos";
      } else if (VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext))) {
        target = "videos";
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        target,
        status: "pending",
        progress: 0,
      });
    }

    if (newItems.length > 0) {
      hasNotifiedBatchRef.current = false;
      setBatchCompleted(false);
      setQueue(prev => [...prev, ...newItems]);
    }
  };

  const uploadSingleFile = async (item: UploadQueueItem): Promise<void> => {
    const { file, target } = item;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Update item status
    setQueue(prev =>
      prev.map(q => (q.id === item.id ? { ...q, status: "uploading", progress: 0, error: undefined } : q))
    );

    let uploadId = item.uploadId;
    let uploadedChunks: number[] = [];

    // Step 1: Init or check existing session
    if (!uploadId) {
      const initRes = await fetch(`/api/admin/gallery-upload/${galleryId}?action=init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          action: "init",
          target,
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
          chunkSize: CHUNK_SIZE,
        }),
      });

      if (!initRes.ok) {
        const data = await initRes.json().catch(() => ({ error: "Erreur d'initialisation" })) as { error?: string };
        throw new Error(data.error || `Erreur HTTP ${initRes.status}`);
      }

      const initData = await initRes.json() as { uploadId: string; uploadedChunks: number[] };
      uploadId = initData.uploadId;
      uploadedChunks = initData.uploadedChunks || [];

      setQueue(prev =>
        prev.map(q => (q.id === item.id ? { ...q, uploadId } : q))
      );
    } else {
      // Check status to resume
      const statusRes = await fetch(`/api/admin/gallery-upload/${galleryId}?action=status&uploadId=${uploadId}`, {
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json() as { uploadedChunks: number[] };
        uploadedChunks = statusData.uploadedChunks || [];
      }
    }

    const uploadedSet = new Set(uploadedChunks);

    // Step 2: Upload chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (uploadedSet.has(chunkIndex)) {
        continue;
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      const chunkRes = await fetch(`/api/admin/gallery-upload/${galleryId}?action=chunk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-CSRF-Token": csrfToken,
          "X-Upload-Id": uploadId,
          "X-Chunk-Index": String(chunkIndex),
          "X-Total-Chunks": String(totalChunks),
        },
        body: chunkBlob,
      });

      if (!chunkRes.ok) {
        const errData = await chunkRes.json().catch(() => ({ error: "Erreur envoi morceau" })) as { error?: string };
        throw new Error(errData.error || `Erreur HTTP ${chunkRes.status} sur morceau ${chunkIndex + 1}`);
      }

      uploadedSet.add(chunkIndex);
      const currentProgress = Math.round((uploadedSet.size / totalChunks) * 100);

      setQueue(prev =>
        prev.map(q => (q.id === item.id ? { ...q, progress: currentProgress } : q))
      );
    }

    // Step 3: Finalize
    const finalizeRes = await fetch(`/api/admin/gallery-upload/${galleryId}?action=finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        action: "finalize",
        uploadId,
      }),
    });

    if (!finalizeRes.ok) {
      const finData = await finalizeRes.json().catch(() => ({ error: "Erreur de finalisation" })) as { error?: string };
      throw new Error(finData.error || `Erreur HTTP ${finalizeRes.status} à la finalisation`);
    }

    setQueue(prev =>
      prev.map(q => (q.id === item.id ? { ...q, status: "completed", progress: 100 } : q))
    );
  };

  // Process the queue with max concurrency of 2
  const processQueue = useCallback(async () => {
    if (isProcessing) return;

    const pending = queue.filter(q => q.status === "pending");
    if (pending.length === 0) return;

    setIsProcessing(true);

    const pool = [...pending];
    const CONCURRENCY = 2;

    const runNext = async (): Promise<void> => {
      if (pool.length === 0) return;
      const item = pool.shift()!;

      try {
        await uploadSingleFile(item);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Erreur lors du transfert";
        setQueue(prev =>
          prev.map(q => (q.id === item.id ? { ...q, status: "error", error: errorMsg } : q))
        );
      } finally {
        if (pool.length > 0) {
          await runNext();
        }
      }
    };

    const runners: Promise<void>[] = [];
    const countToLaunch = Math.min(CONCURRENCY, pool.length);
    for (let i = 0; i < countToLaunch; i++) {
      runners.push(runNext());
    }

    await Promise.all(runners);
    setIsProcessing(false);
  }, [queue, isProcessing, galleryId, csrfToken]);

  useEffect(() => {
    const hasPending = queue.some(q => q.status === "pending");
    if (hasPending && !isProcessing) {
      void processQueue();
    }
  }, [queue, isProcessing, processQueue]);

  useEffect(() => {
    const anyPendingOrUploading = queue.some(q => q.status === "pending" || q.status === "uploading");
    const hasCompleted = queue.some(q => q.status === "completed");

    if (!isProcessing && !anyPendingOrUploading && hasCompleted && !hasNotifiedBatchRef.current) {
      hasNotifiedBatchRef.current = true;
      setBatchCompleted(true);
      onUploadBatchComplete(galleryFolderName);
    }
  }, [queue, isProcessing, galleryFolderName, onUploadBatchComplete]);

  const retryItem = (id: string) => {
    hasNotifiedBatchRef.current = false;
    setBatchCompleted(false);
    setQueue(prev =>
      prev.map(q => (q.id === id ? { ...q, status: "pending", error: undefined } : q))
    );
  };

  const handlePhotosClick = () => {
    photoInputRef.current?.click();
  };

  const handleVideosClick = () => {
    videoInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files, "photos");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const totalItems = queue.length;
  const completedItems = queue.filter(q => q.status === "completed").length;
  const errorItems = queue.filter(q => q.status === "error").length;
  const currentUploading = queue.find(q => q.status === "uploading");

  const totalProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className={styles.uploadSection}>
      <div className={styles.uploadButtonsRow}>
        <button
          ref={photosButtonRef}
          type="button"
          onClick={handlePhotosClick}
          className={styles.uploadPhotosBtn}
          aria-label="Importer des photos"
        >
          📷 Importer des photos
        </button>

        <button
          ref={videosButtonRef}
          type="button"
          onClick={handleVideosClick}
          className={styles.uploadVideosBtn}
          aria-label="Importer des vidéos"
        >
          🎥 Importer des vidéos
        </button>

        <input
          ref={photoInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className={styles.visuallyHidden}
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) {
              addFilesToQueue(e.target.files, "photos");
              e.target.value = "";
            }
          }}
        />

        <input
          ref={videoInputRef}
          type="file"
          multiple
          accept="video/mp4,video/webm"
          className={styles.visuallyHidden}
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) {
              addFilesToQueue(e.target.files, "videos");
              e.target.value = "";
            }
          }}
        />
      </div>

      <div
        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="region"
        aria-label="Zone de glisser-déposer pour photos et vidéos"
      >
        <p className={styles.dropZoneText}>
          Glissez-déposez vos photos ou vidéos ici, ou utilisez les boutons ci-dessus.
        </p>
        <p className={styles.dropZoneHint}>
          Photos acceptées : JPEG, PNG, WebP, AVIF - Vidéos acceptées : MP4, WebM (morceaux de 5 Mo résilients)
        </p>
      </div>

      {batchError && (
        <p role="alert" className={styles.errorText}>
          {batchError}
        </p>
      )}

      {totalItems > 0 && (
        <div className={styles.uploadStatusContainer} role="region" aria-label="Progression de l'envoi">
          <div role="status" aria-live="polite">
            <p>
              <strong>Progression globale :</strong> {completedItems} / {totalItems} fichier(s) terminé(s)
              {errorItems > 0 && ` - ${errorItems} erreur(s)`}
            </p>
            <progress
              className={styles.uploadProgressBar}
              value={totalProgress}
              max={100}
              aria-label={`Progression globale de l'envoi : ${totalProgress}%`}
            >
              {totalProgress}%
            </progress>
          </div>

          {currentUploading && (
            <div role="status" aria-live="polite">
              <p>
                <strong>Envoi en cours :</strong> {currentUploading.file.name} ({currentUploading.progress}%)
              </p>
              <progress
                className={styles.uploadProgressBar}
                value={currentUploading.progress}
                max={100}
                aria-label={`Progression du fichier ${currentUploading.file.name} : ${currentUploading.progress}%`}
              >
                {currentUploading.progress}%
              </progress>
            </div>
          )}

          {batchCompleted && errorItems === 0 && (
            <p role="status" className={styles.successMessage}>
              ✓ Tous les fichiers ont été envoyés avec succès dans le dossier de la galerie ({galleryFolderName}).
              L'analyse a été déclenchée ci-dessous.
            </p>
          )}

          <ul className={styles.uploadQueueList} aria-label="Liste des fichiers du lot">
            {queue.map(item => (
              <li key={item.id} className={styles.uploadQueueItem}>
                <span className={styles.uploadItemName} title={item.file.name}>
                  {item.target === "photos" ? "📷" : "🎥"} {item.file.name} ({(item.file.size / 1024 / 1024).toFixed(1)} Mo)
                </span>

                {item.status === "pending" && (
                  <span className={`${styles.uploadItemStatus} ${styles.uploadItemPending}`}>En attente</span>
                )}

                {item.status === "uploading" && (
                  <span className={`${styles.uploadItemStatus} ${styles.uploadItemUploading}`}>
                    {item.progress}%
                  </span>
                )}

                {item.status === "completed" && (
                  <span className={`${styles.uploadItemStatus} ${styles.uploadItemSuccess}`}>✓ Terminé</span>
                )}

                {item.status === "error" && (
                  <div role="alert" className={`${styles.uploadItemStatus} ${styles.uploadItemError}`}>
                    <span>{item.error || "Erreur"}</span>
                    <button
                      type="button"
                      onClick={() => retryItem(item.id)}
                      className={styles.retryBtn}
                      aria-label={`Réessayer l'envoi de ${item.file.name}`}
                    >
                      Réessayer
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
