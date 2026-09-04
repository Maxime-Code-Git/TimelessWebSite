export function parseVideoUrl(url: string | null | undefined): { provider: "youtube" | "vimeo"; videoId: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;

    const host = u.hostname.toLowerCase();

    const isYouTube = host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "youtu.be";
    if (isYouTube) {
      let videoId = "";
      if (host === "youtu.be") {
        videoId = u.pathname.slice(1);
      } else if (u.pathname === "/watch") {
        videoId = u.searchParams.get("v") || "";
      } else if (u.pathname.startsWith("/shorts/")) {
        videoId = u.pathname.slice(8);
      } else if (u.pathname.startsWith("/embed/")) {
        videoId = u.pathname.slice(7);
      }
      if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        return { provider: "youtube", videoId };
      }
      return null;
    }

    const isVimeo = host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com";
    if (isVimeo) {
      const match = u.pathname.match(/^\/(?:video\/)?(\d+)$/);
      if (match) {
        const videoId = match[1];
        if (/^\d{5,15}$/.test(videoId)) {
          return { provider: "vimeo", videoId };
        }
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

export function getCanonicalVideoUrl(video: { provider: "youtube" | "vimeo"; videoId: string } | null | undefined): string {
  if (!video) return "";
  if (video.provider === "youtube") return `https://www.youtube.com/watch?v=${video.videoId}`;
  if (video.provider === "vimeo") return `https://vimeo.com/${video.videoId}`;
  return "";
}
