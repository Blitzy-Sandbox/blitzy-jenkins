import { createContext, useId, type ReactNode } from "react";

/**
 * Props for the TabBar component.
 *
 * Maps to the Jelly `<l:tabBar>` tag attributes:
 * - `class` → `className`
 * - `showBaseline` → `showBaseline`
 * - `<d:invokeBody/>` → `children`
 */
export interface TabBarProps {
  /** Additional CSS class applied to the `.tabBarFrame` container */
  className?: string;
  /** Whether to show the baseline separator below the tab bar */
  showBaseline?: boolean;
  /** Tab children — typically `<Tab>` components */
  children: ReactNode;
}

/**
 * Context providing the unique `tabBarId` to child Tab components.
 *
 * Replaces the Jelly scoped-variable pattern where `tabBar.jelly` sets
 * `<j:set scope="parent" var="tabBarId" value="..." />` and child
 * `tab.jelly` elements consume it for radio input `id` and `name`
 * attribute grouping (e.g. `id="tab-{tabBarId}-{tabIndex}"`).
 */
export const TabBarContext = createContext<{ tabBarId: string }>({
  tabBarId: "",
});

/**
 * TabBar — Tab navigation container component.
 *
 * Replaces `core/src/main/resources/lib/layout/tabBar.jelly` (47 lines).
 * Renders a horizontal tab bar that wraps child `Tab` components and
 * includes an optional baseline separator.
 *
 * **DOM structure** (matches Jelly output for SCSS compatibility):
 * ```html
 * <div class="tabBarFrame [className] [showBaseline]">
 *   <div class="tabBar">
 *     <!-- children (Tab components) -->
 *   </div>
 *   <div class="tabBarBaseline"></div>
 * </div>
 * ```
 *
 * **SCSS classes consumed** (from `src/main/scss/components/_tabs.scss`):
 * - `.tabBarFrame` — outer container with `position: relative`
 * - `.tabBar` — inner flex container for tab items
 * - `.tabBarBaseline` — visual baseline separator below tabs
 * - `.showBaseline` — modifier toggling baseline visibility
 *
 * Uses React 19's `useId()` for generating stable unique IDs,
 * replacing Jelly's `h.getCurrentTime().getTime()` pattern.
 *
 * @param props - {@link TabBarProps}
 */
export default function TabBar({
  className,
  showBaseline,
  children,
}: TabBarProps) {
  // Generate a stable unique ID for this tab bar instance.
  // Replaces Jelly's `h.getCurrentTime().getTime()` (line 39 of tabBar.jelly).
  // This ID is passed via TabBarContext to child Tab components so they can
  // build grouped radio input attributes (id="tab-{tabBarId}-{index}",
  // name="tab-group-{tabBarId}").
  const tabBarId = useId();

  // Build the class string to match the Jelly output:
  //   class="tabBarFrame ${attrs.class} ${attrs.showBaseline ? 'showBaseline' : ''}"
  const frameClassName = ["tabBarFrame", className, showBaseline ? "showBaseline" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <TabBarContext value={{ tabBarId }}>
      <div className={frameClassName}>
        <div className="tabBar">{children}</div>
        <div className="tabBarBaseline" />
      </div>
    </TabBarContext>
  );
}
