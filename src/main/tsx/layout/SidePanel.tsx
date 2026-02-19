/**
 * SidePanel — Side Navigation Panel
 *
 * Replaces `core/src/main/resources/lib/layout/side-panel.jelly`.
 * Renders the left-side navigation panel containing contextual task links
 * and action items as part of Jenkins's two-column layout.
 *
 * DOM contract:
 *   - `id="side-panel"` is required — CSS (`#side-panel { flex-shrink: 0 }`)
 *     and legacy scripts reference this DOM anchor.
 *   - Base class: `app-page-body__sidebar`
 *   - Sticky modifier: `app-page-body__sidebar--sticky`
 *     (enables `position: sticky` above the tablet breakpoint)
 *
 * @module layout/SidePanel
 */

import type { ReactNode } from "react";

/**
 * Props accepted by the {@link SidePanel} component.
 */
export interface SidePanelProps {
  /**
   * Make the side panel sticky during scrolling.
   *
   * When `true` the panel receives the `app-page-body__sidebar--sticky`
   * CSS modifier which pins it to the top of the viewport (offset by the
   * header height) on viewports at or above the tablet breakpoint.
   *
   * **Do not** enable on pages where plugins can contribute dynamic tasks —
   * a variable number of task links may exceed the viewport height, making
   * sticky behaviour counterproductive.
   *
   * @default false
   */
  sticky?: boolean;

  /**
   * Side-panel content — typically task links, widgets, or other contextual
   * navigation rendered by the parent page component.
   *
   * Mirrors the `<d:invokeBody />` slot from the original Jelly template.
   */
  children: ReactNode;
}

/**
 * Side navigation panel for the Jenkins two-column layout.
 *
 * Produces the same DOM structure as `lib/layout/side-panel.jelly`:
 *
 * ```html
 * <div id="side-panel"
 *      class="app-page-body__sidebar [app-page-body__sidebar--sticky]">
 *   <!-- children -->
 * </div>
 * ```
 *
 * @param props - {@link SidePanelProps}
 * @returns The side-panel container element.
 */
export function SidePanel({
  sticky = false,
  children,
}: SidePanelProps) {
  return (
    <div
      id="side-panel"
      className={`app-page-body__sidebar${sticky ? " app-page-body__sidebar--sticky" : ""}`}
    >
      {children}
    </div>
  );
}

export default SidePanel;
