import type { SVGProps } from "react";
import type { SocialPlatformId } from "~/lib/social-networks";

interface SocialIconProps extends SVGProps<SVGSVGElement> {
  id: SocialPlatformId;
}

export function SocialIcon({ id, width = 15, height = 15, ...props }: SocialIconProps) {
  switch (id) {
    case "instagram":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" />
        </svg>
      );

    case "facebook":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );

    case "youtube":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none" />
        </svg>
      );

    case "linkedin":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <rect x="2" y="2" width="20" height="20" rx="3" />
          <line x1="7" y1="10" x2="7" y2="17" />
          <circle cx="7" cy="6.8" r="0.9" />
          <path d="M11 17v-4a2.5 2.5 0 0 1 5 0v4" />
          <line x1="11" y1="10" x2="11" y2="17" />
        </svg>
      );

    case "tiktok":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      );

    case "vimeo":
      return (
        <svg
          width={width}
          height={height}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          {...props}
        >
          <path d="M2.5 8.5C2.8 7.6 4.3 4 7 4c2.5 0 3.2 2.3 3.5 4.5.4 2.3.8 4 1.7 4 .8 0 1.7-1.1 1.9-2.5.3-1.8-.7-1.9-1.3-1.9-.3 0-.5.1-.6.1.6-2 2.4-3.2 4.4-3.2 2.5 0 3.1 2 2.7 4.8-.6 3.9-3.2 6.7-5.8 6.7-2.3 0-3.2-1.7-3.6-3.7-.5-2.7-1-5.3-2.1-5.3-.3 0-.9.6-1.3 1.3L4.8 13 2.5 8.5z" />
        </svg>
      );

    default:
      return null;
  }
}
