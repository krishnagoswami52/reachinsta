import { useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  title?: string;
}

/**
 * YouTube video modal built on the shadcn/ui Dialog.
 * Radix handles Escape, outside-click, X button, focus trap, and body
 * scroll lock; closing unmounts the iframe, which stops playback.
 * autoplay=1 is safe here — the user explicitly clicked to open.
 */
export function VideoModal({ isOpen, onClose, videoId, title = "Product Demo" }: VideoModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&color=white`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        ref={contentRef}
        // Keep initial focus on the dialog, not the iframe — keydowns inside
        // the cross-origin iframe never reach us, which would break Escape.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
        className="w-[90vw] max-w-4xl border-none bg-transparent p-0 shadow-none
                   [&>button]:-top-10 [&>button]:right-0 [&>button]:text-text-primary
                   [&>button]:opacity-80 [&>button]:hover:opacity-100
                   [&>button>svg]:h-6 [&>button>svg]:w-6"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative w-full pt-[56.25%] overflow-hidden rounded-xl bg-black shadow-2xl">
          <iframe
            src={embedUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
