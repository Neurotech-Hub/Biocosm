import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type InfoPopoverProps = {
  label: string;
  title: string;
  children: ReactNode;
};

export function InfoPopover({ label, title, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="info-popover" ref={containerRef}>
      <button
        type="button"
        className="info-popover-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open ? (
        <div className="info-popover-panel" id={popoverId} role="dialog" aria-label={title}>
          <h3>{title}</h3>
          {children}
        </div>
      ) : null}
    </div>
  );
}
