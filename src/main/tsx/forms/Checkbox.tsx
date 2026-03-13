import { useState, useId, useActionState, type ChangeEvent } from "react";

/**
 * Props for the Checkbox component.
 * Maps from the Jelly checkbox.jelly attributes to React props.
 */
export interface CheckboxProps {
  /** Checkbox input name, defaults to '_.'+field when field is provided */
  name?: string;
  /** Controlled checked state — when provided, component is controlled */
  checked?: boolean;
  /** Submit value when checkbox is checked (browser defaults to "on" if omitted) */
  value?: string;
  /** JSON value when checked, used for subset selection */
  json?: string;
  /** Default checked state for uncontrolled usage */
  defaultChecked?: boolean;
  /** Element ID — auto-generated via useId() if not provided */
  id?: string;
  /** Additional CSS classes applied to the input element */
  className?: string;
  /** Inverts checkbox logic — section expands when UNchecked */
  negative?: boolean;
  /** Databinding field name — used to compute name when name is not provided */
  field?: string;
  /** Human-readable label text displayed next to the checkbox */
  label?: string;
  /** Tooltip text on both the checkbox input and label */
  tooltip?: string;
  /** Description text rendered below the checkbox */
  description?: string;
  /** AJAX validation endpoint URL */
  checkUrl?: string;
  /** Space-separated field names that validation depends on */
  checkDependsOn?: string;
  /** Whether the checkbox is disabled (read-only mode) */
  disabled?: boolean;
  /** Change event handler — called when checkbox state changes */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * React checkbox component replacing lib/form/checkbox.jelly.
 *
 * Renders a boolean checkbox with support for:
 * - Controlled and uncontrolled usage patterns
 * - React 19 form action integration via useActionState
 * - Label and description text
 * - Negative (inverted) logic for optional blocks
 * - AJAX validation via checkUrl
 * - Tooltip display
 *
 * HTML output replicates the Jelly-rendered structure:
 *   <span class="jenkins-checkbox">
 *     <input type="checkbox" ... />
 *     <label class="attach-previous ...">...</label>
 *   </span>
 *   <div class="jenkins-checkbox__description">...</div>
 */
export function Checkbox({
  name,
  checked: controlledChecked,
  value,
  json,
  defaultChecked,
  id: providedId,
  className,
  negative,
  field,
  label,
  tooltip,
  description,
  checkUrl,
  checkDependsOn,
  disabled,
  onChange,
}: CheckboxProps) {
  /* Auto-generate a unique DOM ID when none is provided */
  const generatedId = useId();
  const checkboxId = providedId ?? generatedId;

  /* Compute the input name: explicit name takes priority, then '_.'+field */
  const computedName = name ?? (field ? `_.${field}` : undefined);

  /* Controlled vs uncontrolled checked state management */
  const isControlled = controlledChecked !== undefined;
  const [internalChecked, setInternalChecked] = useState(
    defaultChecked ?? false,
  );
  const resolvedChecked = isControlled ? controlledChecked : internalChecked;

  /*
   * React 19 form action integration via useActionState.
   * Provides isPending flag for disabling the checkbox during form submission.
   * The dispatch function propagates checkbox state changes through the
   * React 19 form action system for <form action={}> compatibility.
   */
  const [, dispatchAction, isPending] = useActionState(
    (_previousState: boolean, newChecked: boolean) => newChecked,
    resolvedChecked,
  );

  /** Handle checkbox state change */
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newChecked = event.target.checked;
    if (!isControlled) {
      setInternalChecked(newChecked);
    }
    dispatchAction(newChecked);
    onChange?.(event);
  };

  /* Build conditional CSS classes for the input element */
  const inputClassParts: string[] = [];
  if (className) {
    inputClassParts.push(className);
  }
  if (negative) {
    inputClassParts.push("negative");
  }
  if (checkUrl) {
    inputClassParts.push("validated");
  }
  const inputClasses =
    inputClassParts.length > 0 ? inputClassParts.join(" ") : undefined;

  /* Build label CSS classes */
  const labelClassParts: string[] = ["attach-previous"];
  if (label == null) {
    labelClassParts.push("js-checkbox-label-empty");
  }
  const labelClasses = labelClassParts.join(" ");

  /* Checkbox is disabled when explicitly disabled or during form submission */
  const isDisabled = disabled || isPending;

  return (
    <>
      <span className="jenkins-checkbox">
        <input
          type="checkbox"
          name={computedName}
          value={value}
          title={tooltip}
          id={checkboxId}
          className={inputClasses}
          checked={resolvedChecked}
          disabled={isDisabled}
          onChange={handleChange}
          data-check-url={checkUrl}
          data-check-depends-on={checkDependsOn}
          data-json={json}
        />
        <label className={labelClasses} htmlFor={checkboxId} title={tooltip}>
          {label ?? ""}
        </label>
      </span>
      {description != null && (
        <div className="jenkins-checkbox__description">{description}</div>
      )}
    </>
  );
}
