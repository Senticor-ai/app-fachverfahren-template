import * as React from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // WCAG 2.2.1 (Anpassbare Zeitvorgaben): ein sichtbarer Schließen-Button (manuelle Kontrolle) + eine großzügigere
      // Default-Dauer als sonners 4 s; sonner pausiert den Timer zusätzlich bei Hover/Fokus. Essenzielle Toasts können
      // je Aufruf `duration: Infinity` setzen. Beides VOR {...props}, damit die App es überschreiben kann.
      closeButton
      toastOptions={{
        duration: 6000,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
