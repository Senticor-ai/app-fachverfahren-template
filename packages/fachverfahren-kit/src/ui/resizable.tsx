// shadcn/ui Resizable (react-resizable-panels v4: `Group`/`Panel`/`Separator` — v2's
// `PanelGroup`/`PanelResizeHandle` names and `direction` prop were replaced by `orientation`;
// the Group itself now sets `display`/`flex-direction` via inline style, so orientation-based
// layout no longer needs a CSS hook on the group — only the Separator still needs one, now via
// `aria-orientation` instead of the old `data-panel-group-direction` attribute).
// IMPORTANT: `aria-orientation` on the Separator describes the DIVIDER LINE's own orientation
// per ARIA `separator` role semantics — the INVERSE of the Group's `orientation` prop. A
// horizontally-arranged Group (side-by-side panels) has a VERTICAL divider line, so its
// Separator carries `aria-orientation="vertical"`; a vertically-stacked Group's Separator
// carries `aria-orientation="horizontal"`. Verified against the built DOM: real bug caught here
// where the CSS below first keyed on `aria-[orientation=vertical]` assuming it mirrored the
// Group's own orientation, which silently applied the "stacked" look (and its `w-full`) to the
// default horizontal-Group case, collapsing both panels to 0 width.
// Master-Detail-Evidence-Layout: links Antragsdaten, rechts getabte Belege — frei ziehbar (a11y über den Handle-Griff).
import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "../lib/utils.js";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group className={cn("flex h-full w-full", className)} {...props} />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0 [&[aria-orientation=horizontal]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-border">
        <GripVertical className="h-2.5 w-2.5" aria-hidden="true" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
