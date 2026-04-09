import { useContext } from "react";
import { TabBarContext } from "./TabBar";

/**
 * Props for the Tab component.
 *
 * Maps to the Jelly `<l:tab>` tag attributes defined in
 * `core/src/main/resources/lib/layout/tab.jelly` (lines 28-39):
 * - `name` (required) → display text of the tab
 * - `href` (required) → URL the tab links to
 * - `active` (boolean) → whether the tab is currently active
 * - `title` → tooltip/title text for the tab link
 *
 * The `index` prop replaces the Jelly `tabIndex` scoped variable
 * that was auto-incremented by each `<l:tab>` via
 * `<j:set scope="parent" var="tabIndex" value="${tabIndex+1}" />`.
 */
export interface TabProps {
  /** Display name of the tab (required). Shown as the link text. */
  name: string;
  /** URL the tab links to (required). Applied as the anchor href. */
  href: string;
  /**
   * Whether this tab is currently active.
   * When true, adds the `.active` CSS class to the container div
   * and sets the radio input to `defaultChecked`.
   * @default false
   */
  active?: boolean;
  /** Tooltip/title text for the tab link. Applied as the anchor title attribute. */
  title?: string;
  /**
   * Index of this tab within the tab bar.
   * Used to construct the radio input `id` attribute: `tab-{tabBarId}-{index}`.
   * Replaces the Jelly auto-incremented `tabIndex` scoped variable.
   * @default 0
   */
  index?: number;
}

/**
 * Tab — Individual tab component within a TabBar.
 *
 * Replaces `core/src/main/resources/lib/layout/tab.jelly` (53 lines).
 * Renders a single tab with a radio input for CSS-based tab group
 * selection and a linked label.
 *
 * **DOM structure** (matches Jelly output for SCSS compatibility):
 * ```html
 * <div class="tab [active]">
 *   <input type="radio" id="tab-{tabBarId}-{index}" name="tab-group-{tabBarId}" [checked] />
 *   <a href="{href}" class="[addTab]" title="{title}">{name}</a>
 * </div>
 * ```
 *
 * **Jelly source correspondence**:
 * - Container `div.tab` with optional `.active` class (line 41)
 * - Radio input with `id="tab-{tabBarId}-{tabIndex}"` and
 *   `name="tab-group-{tabBarId}"` for group selection (lines 43-48)
 * - `checked="checked"` when active (line 44)
 * - Anchor link with `addTab` class when name equals "+" (line 50)
 *
 * **SCSS classes consumed** (from `src/main/scss/components/_tabs.scss`):
 * - `.tab` — individual tab container
 * - `.tab.active` — active tab styling with distinct background/border
 * - `.addTab` — special "+" tab for adding new tabs/items
 *
 * The radio input pattern enables CSS `:checked` selector styling
 * for tab state management without JavaScript.
 *
 * Consumes `TabBarContext` from the parent `TabBar` component to
 * obtain the unique `tabBarId` for radio input grouping, replacing
 * the Jelly scoped variable pattern (`<j:set scope="parent">`).
 *
 * @param props - {@link TabProps}
 */
export default function Tab({
  name,
  href,
  active = false,
  title,
  index = 0,
}: TabProps) {
  // Consume the tabBarId from the parent TabBar via context.
  // This replaces the Jelly scoped variable pattern where tab.jelly
  // reads `tabBarId` set by tabBar.jelly via `<j:set scope="parent">`.
  const { tabBarId } = useContext(TabBarContext);

  // Construct the radio input id and name attributes to match
  // the Jelly output format: id="tab-{tabBarId}-{tabIndex}",
  // name="tab-group-{tabBarId}" (tab.jelly lines 44, 47).
  const radioId = `tab-${tabBarId}-${index}`;
  const groupName = `tab-group-${tabBarId}`;

  return (
    <div className={`tab${active ? " active" : ""}`}>
      <input
        type="radio"
        id={radioId}
        name={groupName}
        defaultChecked={active}
      />
      <a href={href} className={name === "+" ? "addTab" : ""} title={title}>
        {name}
      </a>
    </div>
  );
}
