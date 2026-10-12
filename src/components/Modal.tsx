import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    const firstInput = panel?.querySelector<HTMLElement>("input, textarea");
    (firstInput ?? focusables()[0] ?? panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const items = focusables();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        initial={{ y: reducedMotion ? 0 : 20, scale: reducedMotion ? 1 : 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 330, damping: 30 }}
      >
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={21} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
