"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  titleId: string;
  onClose: () => void;
  /** Élément qui retrouve le focus à la fermeture ; à défaut, celui qui l’avait à l’ouverture. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Fenêtre modale accessible : `role="dialog"`, Échap pour fermer, focus placé dedans à l'ouverture, **gardé dedans**
 * au clavier (Tab boucle) et rendu à l'élément d'origine à la fermeture. Un clic sur le fond ferme aussi.
 */
export function Modal({ titleId, onClose, returnFocusRef, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => opener?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le point de retour du focus est lu une seule fois, à l’ouverture
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface-strong p-6 shadow-2xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}
