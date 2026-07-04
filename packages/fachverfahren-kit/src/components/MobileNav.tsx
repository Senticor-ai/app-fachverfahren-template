// fachverfahren-kit/components/MobileNav — die GENERISCHE, responsive Verwaltungs-Navigation.
//
// Mobile-first: Auf großen Viewports unsichtbar (Desktop nutzt die Sidebar/Shell). Auf kleinen Viewports
// eine seriöse Bottom-Tab-Bar (Touch ≥44px Zielgröße, safe-area-inset-bottom) plus optionaler
// Hamburger-Drawer (../ui/sheet.js) für „mehr Punkte". Vollständig CONFIG-GETRIEBEN über `items` —
// keine Domänen-Literale; ein zweites Verfahren läuft ohne Änderung an dieser Datei.
//
// Barrierefrei (BITV/WCAG 2.2 AA): <nav> mit Label, aria-current="page" auf dem aktiven Punkt,
// vollständige Tastaturbedienung (native <button>), focus-visible-Ring, Zielgröße ≥44px,
// Farbe nie alleiniger Träger (aktiver Punkt zusätzlich fett + Indikatorbalken), motion-reduce.
import * as React from "react";
import { Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet.js";

/** Ein Navigationspunkt — generisch, Domäne kommt ausschließlich aus den Daten. */
export interface MobileNavItem {
  /** Stabile, eindeutige ID (a11y-Schlüssel + React-key). */
  id: string;
  /** Sichtbares Label (zugleich Tastatur-/Screenreader-Text). */
  label: string;
  /** Lucide-Icon-Komponente. */
  icon: LucideIcon;
  /** Aktion beim Aktivieren (Klick/Enter/Space). */
  onClick: () => void;
  /** Optionaler Zähler/Hinweis (z. B. offene Aufgaben). 0/leer → kein Badge. */
  badge?: number | string;
}

export interface MobileNavProps {
  /** Die Navigationspunkte (data-driven). */
  items: MobileNavItem[];
  /** ID des aktiven Punkts (steuert aria-current + Hervorhebung). */
  activeId?: string;
  /** Zugängliches Label der Navigation. */
  ariaLabel?: string;
  /** Wie viele Punkte direkt in der Tab-Bar erscheinen; der Rest wandert in den Drawer. Default 5. */
  maxVisible?: number;
  /** Überschrift des Drawers (Hamburger-Menü). */
  drawerTitle?: string;
  /** Kurzbeschreibung im Drawer-Kopf. */
  drawerDescription?: string;
  /** Label des Hamburger-Buttons. */
  moreLabel?: string;
  className?: string;
}

/** Badge formatieren — Zahlen >99 werden gekappt; 0/„" gilt als „kein Badge". */
function badgeText(badge: number | string | undefined): string | null {
  if (badge === undefined) return null;
  if (typeof badge === "number") {
    if (!Number.isFinite(badge) || badge <= 0) return null;
    return badge > 99 ? "99+" : String(badge);
  }
  const s = badge.trim();
  return s.length > 0 ? s : null;
}

/**
 * Responsive Verwaltungs-Navigation. Auf `md:` und größer komplett ausgeblendet (Desktop = Sidebar),
 * darunter eine fixierte Bottom-Tab-Bar mit optionalem Hamburger-Drawer.
 */
export const MobileNav: React.FC<MobileNavProps> = ({
  items,
  activeId,
  ariaLabel = "Hauptnavigation",
  maxVisible = 5,
  drawerTitle = "Menü",
  drawerDescription,
  moreLabel = "Mehr",
  className,
}) => {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  if (items.length === 0) return null;

  // Wenn nicht alle Punkte direkt passen, reservieren wir einen Slot für den „Mehr"-Drawer.
  const needsDrawer = items.length > maxVisible;
  const visibleCount = needsDrawer ? Math.max(1, maxVisible - 1) : items.length;
  const visible = items.slice(0, visibleCount);
  const overflow = needsDrawer ? items.slice(visibleCount) : [];
  const overflowActive = overflow.some((i) => i.id === activeId);

  // Spaltenzahl: sichtbare Punkte + ggf. der Hamburger-Slot.
  const columns = visible.length + (needsDrawer ? 1 : 0);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Nur mobil: fixierte Bottom-Bar; ab md ausgeblendet (Desktop nutzt die Shell-Sidebar).
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden",
        // Sicherer Bereich unter der Bar (Home-Indicator/Notch) — fällt auf 0 zurück, wenn nicht unterstützt.
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul
        className="mx-auto grid w-full max-w-screen-sm"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visible.map((item) => (
          <li key={item.id} className="contents">
            <TabButton item={item} active={item.id === activeId} />
          </li>
        ))}

        {needsDrawer && (
          <li className="contents">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={drawerOpen}
                  aria-current={overflowActive ? "page" : undefined}
                  className={tabClasses(overflowActive)}
                >
                  <IconWithBadge
                    icon={Menu}
                    active={overflowActive}
                    badge={overflowBadge(overflow)}
                  />
                  <TabLabel label={moreLabel} active={overflowActive} />
                  <ActiveIndicator active={overflowActive} />
                </button>
              </SheetTrigger>

              <SheetContent
                side="bottom"
                className="max-h-[80vh] overflow-y-auto rounded-t-lg pb-[env(safe-area-inset-bottom)]"
              >
                <SheetHeader>
                  <SheetTitle>{drawerTitle}</SheetTitle>
                  {drawerDescription && (
                    <SheetDescription>{drawerDescription}</SheetDescription>
                  )}
                </SheetHeader>

                <ul className="mt-4 grid gap-1">
                  {overflow.map((item) => {
                    const active = item.id === activeId;
                    const text = badgeText(item.badge);
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <SheetClose asChild>
                          <button
                            type="button"
                            onClick={item.onClick}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                              "transition-colors ease-out motion-reduce:transition-none",
                              // Kanonisches Fokus-Rezept (Spec 3.2): weicher 3px-Ring, EIN Rezept kit-weit.
                              "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                              active
                                ? "bg-accent font-semibold text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <Icon
                              className="h-5 w-5 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            {text && (
                              <span
                                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                                aria-label={`${text} neue`}
                              >
                                {text}
                              </span>
                            )}
                          </button>
                        </SheetClose>
                      </li>
                    );
                  })}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
};
MobileNav.displayName = "MobileNav";

/** Ein einzelner Tab in der Bottom-Bar. */
const TabButton: React.FC<{ item: MobileNavItem; active: boolean }> = ({
  item,
  active,
}) => {
  const text = badgeText(item.badge);
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-current={active ? "page" : undefined}
      className={tabClasses(active)}
    >
      <IconWithBadge icon={item.icon} active={active} badge={text} />
      <TabLabel label={item.label} active={active} />
      <ActiveIndicator active={active} />
    </button>
  );
};

/** Gemeinsame Klassen für Tab-/Hamburger-Buttons — Touch-Ziel ≥44px, Fokus-Ring, motion-reduce. */
function tabClasses(active: boolean): string {
  return cn(
    "relative flex min-h-[44px] w-full select-none flex-col items-center justify-center gap-0.5 px-2 py-1.5",
    "transition-colors ease-out motion-reduce:transition-none",
    // Kanonisches Fokus-Rezept (Spec 3.2): weicher 3px-Ring, EIN Rezept kit-weit.
    "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
  );
}

/** Icon mit optionalem Zähl-Badge (oben rechts). */
const IconWithBadge: React.FC<{
  icon: LucideIcon;
  active: boolean;
  badge: string | null;
}> = ({ icon: Icon, badge }) => (
  <span className="relative inline-flex">
    <Icon className="h-6 w-6" aria-hidden="true" />
    {badge && (
      <span
        className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground"
        aria-label={`${badge} neue`}
      >
        {badge}
      </span>
    )}
  </span>
);

/** Label unter dem Icon — aktiv = fett (Farbe ist nie alleiniger Träger). */
const TabLabel: React.FC<{ label: string; active: boolean }> = ({
  label,
  active,
}) => (
  <span
    className={cn(
      "max-w-full truncate text-xs leading-tight",
      active && "font-semibold",
    )}
  >
    {label}
  </span>
);

/** Schmaler Indikatorbalken am oberen Tab-Rand — zweites, nicht-farbliches Aktiv-Signal. */
const ActiveIndicator: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <span
      aria-hidden="true"
      className="absolute inset-x-3 top-0 h-0.5 rounded-md bg-primary"
    />
  ) : null;

/** Zusammengefasstes Badge für den „Mehr"-Slot — Summe numerischer Badges der Überlauf-Punkte. */
function overflowBadge(overflow: MobileNavItem[]): string | null {
  let sum = 0;
  let hasAny = false;
  for (const item of overflow) {
    if (
      typeof item.badge === "number" &&
      Number.isFinite(item.badge) &&
      item.badge > 0
    ) {
      sum += item.badge;
      hasAny = true;
    } else if (typeof item.badge === "string" && item.badge.trim().length > 0) {
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  if (sum <= 0) return "•";
  return sum > 99 ? "99+" : String(sum);
}
