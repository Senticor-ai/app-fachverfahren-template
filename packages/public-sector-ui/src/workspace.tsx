import { type ReactNode } from "react";

export type WorkspaceDensity = "comfortable" | "compact";

export interface ResponsiveWorkspaceShellProps {
  title: string;
  subtitle?: string;
  list: ReactNode;
  detail: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  listLabel?: string;
  detailLabel?: string;
  density?: WorkspaceDensity;
}

export function ResponsiveWorkspaceShell({
  title,
  subtitle,
  list,
  detail,
  actions,
  status,
  listLabel = "Vorgangsliste",
  detailLabel = "Vorgangsdetails",
  density = "comfortable",
}: ResponsiveWorkspaceShellProps) {
  return (
    <section
      className={`ps-workspace-shell ps-workspace-shell--${density}`}
      aria-labelledby="ps-workspace-shell__title"
    >
      <header className="ps-workspace-shell__header">
        <div className="ps-workspace-shell__heading">
          <p className="ps-eyebrow">Arbeitsplatz</p>
          <h1 id="ps-workspace-shell__title">{title}</h1>
          {subtitle ? <p className="ps-muted">{subtitle}</p> : null}
        </div>
        {status ? (
          <div className="ps-workspace-shell__status">{status}</div>
        ) : null}
        {actions ? (
          <div className="ps-workspace-shell__actions">{actions}</div>
        ) : null}
      </header>

      <div className="ps-workspace-shell__body">
        <section className="ps-workspace-shell__list" aria-label={listLabel}>
          {list}
        </section>
        <section
          className="ps-workspace-shell__detail"
          aria-label={detailLabel}
        >
          {detail}
        </section>
      </div>
    </section>
  );
}

export interface StickyActionBarAction {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface StickyActionBarProps {
  primary: StickyActionBarAction;
  secondary?: StickyActionBarAction[];
  meta?: ReactNode;
  ariaLabel?: string;
}

export function StickyActionBar({
  primary,
  secondary = [],
  meta,
  ariaLabel = "Aktionen",
}: StickyActionBarProps) {
  return (
    <div className="ps-sticky-action-bar" role="region" aria-label={ariaLabel}>
      {meta ? <div className="ps-sticky-action-bar__meta">{meta}</div> : null}
      <div className="ps-sticky-action-bar__actions">
        {secondary.map((action) => (
          <button
            key={action.id}
            type="button"
            className={actionClass(action.tone ?? "secondary")}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className={actionClass(primary.tone ?? "primary")}
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}

export interface SavedView {
  id: string;
  label: string;
  count?: number;
}

export interface SavedViewsToolbarProps {
  label?: string;
  views: SavedView[];
  activeId: string;
  onSelect: (id: string) => void;
  searchLabel?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  actions?: ReactNode;
}

export function SavedViewsToolbar({
  label = "Gespeicherte Ansichten",
  views,
  activeId,
  onSelect,
  searchLabel = "Suche",
  searchValue,
  onSearchChange,
  actions,
}: SavedViewsToolbarProps) {
  return (
    <section className="ps-saved-views" aria-label={label}>
      <div className="ps-saved-views__chips" role="group" aria-label={label}>
        {views.map((view) => {
          const active = view.id === activeId;
          return (
            <button
              key={view.id}
              type="button"
              className={
                active
                  ? "ps-saved-views__chip ps-saved-views__chip--active"
                  : "ps-saved-views__chip"
              }
              aria-pressed={active}
              onClick={() => onSelect(view.id)}
            >
              <span>{view.label}</span>
              {view.count !== undefined ? (
                <span className="ps-saved-views__count ps-num">
                  {view.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {onSearchChange ? (
        <label className="ps-saved-views__search">
          <span>{searchLabel}</span>
          <input
            type="search"
            value={searchValue ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      ) : null}

      {actions ? (
        <div className="ps-saved-views__actions">{actions}</div>
      ) : null}
    </section>
  );
}

function actionClass(tone: StickyActionBarAction["tone"]): string {
  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }
  if (tone === "secondary") {
    return "ps-btn ps-btn--ghost";
  }
  return "ps-btn ps-btn--primary";
}
