import { useId, type ReactNode, type ChangeEvent } from "react";

/**
 * Props for the Radio component.
 *
 * Maps the attributes of the Jelly `<f:radio>` tag to a React-compatible
 * property interface. The `name` prop groups radio buttons so only one can
 * be selected at a time, `value` identifies the selected option, and `label`
 * provides clickable text beside the radio circle. An optional `children`
 * slot renders nested content that auto-hides when the radio is unchecked
 * via the `.jenkins-radio__children` CSS adjacent-sibling rule in
 * `_radio.scss`.
 */
export interface RadioProps {
  /** Radio group name — groups radio buttons so only one can be selected. */
  name: string;

  /**
   * Whether the radio is currently selected.
   *
   * When paired with `onChange`, the component operates in **controlled** mode
   * (React manages the checked state via props). Without `onChange`, this
   * value is passed as `defaultChecked` for **uncontrolled** behavior (the
   * browser manages the checked state natively).
   */
  checked?: boolean;

  /** Value submitted when this radio option is selected. */
  value?: string;

  /**
   * DOM element ID for the radio input. When omitted, an ID is
   * auto-generated via React 19's `useId()` hook — replacing Jelly's
   * server-side `h.generateItemId()` pattern. The generated ID ensures the
   * `<label htmlFor>` ↔ `<input id>` association is always correct for
   * accessibility.
   */
  id?: string;

  /**
   * Human-readable label text displayed next to the radio circle.
   * Maps to the Jelly `title` attribute. Clicking the label toggles the
   * radio, matching native `<label for="...">` behavior.
   */
  label?: string;

  /**
   * Whether the radio input is non-interactive.
   * Replaces Jelly's `readOnlyMode` variable that was set via
   * `<j:set var="readOnlyMode" value="true"/>` inside entry tags.
   */
  disabled?: boolean;

  /**
   * Change event handler for controlled component usage. When provided,
   * the `checked` prop is treated as a controlled value and React will
   * manage the radio's checked state through this callback. When absent,
   * `checked` is passed as `defaultChecked` for uncontrolled behavior.
   */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;

  /**
   * Nested content rendered inside `.jenkins-radio__children`.
   * Auto-hidden when the radio is unchecked via the CSS adjacent-sibling
   * rule: `.jenkins-radio__input:not(:checked) + .jenkins-radio__label +
   * .jenkins-radio__children { display: none; }`.
   */
  children?: ReactNode;
}

/**
 * Accessible radio button component replacing `lib/form/radio.jelly`.
 *
 * Renders the same DOM structure as the Jelly radio tag:
 *
 * ```html
 * <div class="jenkins-radio">
 *   <input class="jenkins-radio__input" type="radio" />
 *   <label class="jenkins-radio__label" for="...">Label</label>
 *   <div class="jenkins-radio__children">…nested content…</div>
 * </div>
 * ```
 *
 * **Key design decisions:**
 * - Uses React 19 `useId()` for auto-generated IDs, ensuring proper
 *   `<label htmlFor>` ↔ `<input id>` association for accessibility.
 * - Supports both controlled mode (with `onChange`) and uncontrolled mode
 *   (with `defaultChecked`) to avoid React warnings about controlled inputs
 *   without change handlers.
 * - CSP-safe: no inline event handlers. The deprecated `onclick` attribute
 *   from the Jelly source is intentionally removed.
 * - The children div is only rendered when `children` are provided, keeping
 *   the DOM minimal while preserving the SCSS adjacent-sibling visibility
 *   rule behavior (no children div means nothing to show/hide).
 *
 * @example
 * ```tsx
 * // Controlled radio in a group
 * <Radio
 *   name="color"
 *   value="red"
 *   label="Red"
 *   checked={selected === "red"}
 *   onChange={handleChange}
 * />
 *
 * // Radio with nested children that appear when selected
 * <Radio name="option" value="custom" label="Custom" checked onChange={handleChange}>
 *   <TextBox name="customValue" placeholder="Enter custom value" />
 * </Radio>
 * ```
 */
export function Radio({
  name,
  checked,
  value,
  id: providedId,
  label,
  disabled,
  onChange,
  children,
}: RadioProps) {
  const generatedId = useId();
  const itemId = providedId ?? generatedId;

  // Determine controlled vs uncontrolled mode:
  // - Controlled: onChange handler is present → pass `checked` + `onChange`
  //   to let React manage the radio state through the parent component.
  // - Uncontrolled: onChange is absent → pass `defaultChecked` so the
  //   browser manages the checked state natively without React warnings.
  const isControlled = onChange !== undefined;

  return (
    <div className="jenkins-radio">
      <input
        className="jenkins-radio__input"
        type="radio"
        name={name}
        id={itemId}
        value={value}
        disabled={disabled}
        {...(isControlled
          ? { checked: checked ?? false, onChange }
          : { defaultChecked: checked })}
      />
      <label className="jenkins-radio__label" htmlFor={itemId}>
        {label}
      </label>
      {children != null && (
        <div className="jenkins-radio__children">{children}</div>
      )}
    </div>
  );
}
