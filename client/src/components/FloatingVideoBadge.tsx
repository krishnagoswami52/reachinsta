import { useEffect, useState } from "react";
import { VideoModal } from "@/components/VideoModal";
import { DEMO_VIDEO_ID, DEMO_VIDEO_TITLE } from "@/config/video";

const DISMISS_KEY = "video_badge_dismissed";
const APPEAR_DELAY_MS = 3500;

/**
 * Floating "watch the demo" pill, rendered by the landing page only.
 * Appears after a short delay so it doesn't compete with the hero.
 * Dismissal is per-session (sessionStorage), so it returns next visit.
 * Desktop: below the sticky nav, top-right. Mobile: bottom-right, clear
 * of the nav.
 */
export function FloatingVideoBadge() {
  const [isVisible, setIsVisible] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "true") return;
    const timer = setTimeout(() => setIsVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <>
      <div
        className="fixed z-40 bottom-5 right-4 md:bottom-auto md:top-20 md:right-6
                   flex items-center gap-1 pl-2 pr-1.5 py-1.5
                   bg-bg-elevated border border-border-subtle rounded-full
                   shadow-lg shadow-black/40 hover:border-border-soft hover:scale-[1.02]
                   transition-all duration-200
                   animate-in fade-in slide-in-from-right-5"
        style={{ animationDuration: "500ms" }}
      >
        <button
          onClick={() => setIsVideoOpen(true)}
          className="group flex items-center gap-2.5 rounded-full
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          aria-label="Watch ReachInsta 90 second demo video"
        >
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-mint-dim group-hover:bg-mint/20 transition-colors flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-0.5">
              <path d="M2.5 1.5L10.5 6L2.5 10.5V1.5Z" fill="#7CFFB2"/>
            </svg>
          </span>
          <span className="text-[13px] font-medium text-text-primary group-hover:text-mint transition-colors whitespace-nowrap">
            See ReachInsta in 90 seconds
          </span>
        </button>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                     text-text-muted hover:text-text-primary hover:bg-border-subtle
                     transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          aria-label="Dismiss video badge"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoId={DEMO_VIDEO_ID}
        title={DEMO_VIDEO_TITLE}
      />
    </>
  );
}
