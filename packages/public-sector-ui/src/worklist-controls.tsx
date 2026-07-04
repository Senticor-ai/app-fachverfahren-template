import { type ReactNode, useId } from "react";

export type QuickFilterTone = "neutral" | "success" | "warning" | "critical";
export type BulkActionTone = "primary" | "secondary" | "danger";

export interface QuickFilterOption {
  id: string;
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  tone?: QuickFilterTone;
}

export interface QuickFilterChipsProps {
  title?: string;
  description?: string;
  filters: QuickFilterOption[];
  onToggleFilter: (filter: QuickFilterOption) => void;
  allActiveLabel?: string;
  emptyLabel?: string;
}

export interface BulkAction {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: BulkActionTone;
}

export interface BulkActionBarProps {
  selectedCount: number;
  totalCount?: number;
  title?: string;
  description?: string;
  detailLabel?: string;
  statusLabel?: string;
  actions?: BulkAction[];
  selectAllAction?: BulkAction;
  clearSelectionAction?: BulkAction;
  footer?: ReactNode;
}

const filterToneClass: Record<QuickFilterTone, string> = {
  neutral: "ps-worklist-filters__chip--neutral",
  success: "ps-worklist-filters__chip--success",
  warning: "ps-worklist-filters__chip--warning",
  critical: "ps-worklist-filters__chip--critical",
};

export function QuickFilterChips({
  title = "Schnellfilter",
  description = "Filtern Sie die Arbeitsliste über mehrere Zustände gleichzeitig.",
  filters,
  onToggleFilter,
  allActiveLabel = "Alle Filter aktiv.",
  emptyLabel = "Keine Schnellfilter verfügbar.",
}: QuickFilterChipsProps) {
  const titleId = useId();
  const descriptionId = useId();
  const activeCount = filters.filter((filter) => filter.active).length;

  return (
    <section
      className="ps-worklist-filters"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-worklist-filters__header">
        <div className="ps-worklist-filters__heading">
          <p className="ps-eyebrow">Filter</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        <span className="ps-worklist-filters__summary">
          <span className="ps-num">{activeCount}</span>
          <span>aktiv</span>
        </span>
      </header>

      {filters.length === 0 ? (
        <p className="ps-worklist-filters__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <div
          className="ps-worklist-filters__chips"
          role="group"
          aria-label="Schnellfilter"
        >
          {filters.map((filter) => {
            const isLastActive = filter.active && activeCount === 1;
            const ariaLabel = [
              filter.label,
              filter.active ? "aktiv" : "inaktiv",
              typeof filter.count === "number"
                ? `${filter.count} Einträge`
                : "",
              isLastActive ? "letzter aktiver Filter" : "",
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <button
                key={filter.id}
                type="button"
                className={`ps-worklist-filters__chip ${
                  filterToneClass[filter.tone ?? "neutral"]
                }`}
                aria-pressed={filter.active}
                aria-label={ariaLabel}
                disabled={filter.disabled || isLastActive}
                onClick={() => onToggleFilter(filter)}
              >
                <span>{filter.label}</span>
                {typeof filter.count === "number" ? (
                  <span className="ps-worklist-filters__count ps-num">
                    {filter.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {filters.length > 0 && activeCount === filters.length ? (
        <p className="ps-worklist-filters__note" role="status">
          {allActiveLabel}
        </p>
      ) : null}
    </section>
  );
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  title = "Auswahl",
  description = "Führen Sie Aktionen für ausgewählte Einträge aus.",
  detailLabel,
  statusLabel,
  actions = [],
  selectAllAction,
  clearSelectionAction,
  footer,
}: BulkActionBarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const hasSelection = selectedCount > 0;
  const computedStatus =
    statusLabel ??
    (hasSelection
      ? `${selectedCount} ausgewählt`
      : "Keine Einträge ausgewählt");

  return (
    <section
      className={
        hasSelection
          ? "ps-bulk-action-bar ps-bulk-action-bar--active"
          : "ps-bulk-action-bar"
      }
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="ps-bulk-action-bar__content">
        <header className="ps-bulk-action-bar__header">
          <div>
            <p className="ps-eyebrow">Mehrfachaktion</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId} className="ps-muted">
              {description}
            </p>
          </div>
          <div className="ps-bulk-action-bar__status" role="status">
            <strong className="ps-num">{selectedCount}</strong>
            <span>
              {typeof totalCount === "number"
                ? `von ${totalCount} ausgewählt`
                : computedStatus}
            </span>
          </div>
        </header>

        {detailLabel ? (
          <p className="ps-bulk-action-bar__detail">{detailLabel}</p>
        ) : null}

        {footer ? (
          <div className="ps-bulk-action-bar__footer" role="note">
            {footer}
          </div>
        ) : null}
      </div>

      <div
        className="ps-bulk-action-bar__actions"
        role="group"
        aria-label="Auswahlaktionen"
      >
        {selectAllAction ? <ActionButton action={selectAllAction} /> : null}
        {clearSelectionAction ? (
          <ActionButton
            action={clearSelectionAction}
            forceDisabled={!hasSelection}
          />
        ) : null}
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            forceDisabled={!hasSelection}
          />
        ))}
      </div>
    </section>
  );
}

function ActionButton({
  action,
  forceDisabled = false,
}: {
  action: BulkAction;
  forceDisabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={actionClass(action.tone ?? "secondary")}
      disabled={action.disabled || forceDisabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

function actionClass(tone: BulkActionTone) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}
