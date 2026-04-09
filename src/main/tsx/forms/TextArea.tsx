import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { CSSProperties, ChangeEvent, MouseEvent } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";

/**
 * Props interface for the TextArea component.
 *
 * Maps Jelly `<f:textarea>` attributes from `core/src/main/resources/lib/form/textarea.jelly`
 * to typed React props, preserving every configuration option including CodeMirror integration,
 * markup preview, and AJAX validation.
 */
export interface TextAreaProps {
  /** Databinding field name used by Stapler form binding */
  field?: string;
  /** HTML name attribute for the textarea. Defaults to `'_.' + field` when omitted. */
  name?: string;
  /** Controlled textarea value */
  value?: string;
  /** Default value used when both value and Stapler instance are null */
  defaultValue?: string;
  /** Validation error message override for AJAX validation display */
  checkMessage?: string;
  /** Stapler AJAX validation URL for server-side field checking */
  checkUrl?: string;
  /** Space/comma-separated field names whose values are sent during AJAX validation */
  checkDependsOn?: string;
  /** HTTP method for AJAX validation requests (defaults to 'post' since Jenkins 2.285) */
  checkMethod?: "get" | "post";
  /** CodeMirror language mode identifier (e.g. 'text/x-java', 'text/x-groovy') */
  codemirrorMode?: string;
  /** Additional CodeMirror editor configuration as a JSON string */
  codemirrorConfig?: string;
  /** Stapler endpoint URL for markup preview (e.g. '/markupFormatter/previewDescription') */
  previewEndpoint?: string;
  /** Whether the textarea is read-only */
  readOnly?: boolean;
  /** Explicit row count. When omitted, auto-determined from the value content. */
  rows?: number;
  /** Callback fired when the textarea value changes */
  onChange?: (value: string) => void;
  /** HTML id attribute for the textarea element */
  id?: string;
  /** Inline CSS styles applied to the textarea element */
  style?: CSSProperties;
  /** Additional CSS class names appended to the textarea element */
  className?: string;
}

/**
 * Determines the number of visible rows for the textarea based on the content.
 *
 * Ports the Java `hudson.Functions.determineRows(String)` method:
 * counts the number of lines in the value string and returns at least 5.
 *
 * @param value - The textarea content string
 * @returns Row count (minimum 5)
 */
function determineRows(value: string | undefined): number {
  const MIN_ROWS = 5;
  if (!value) {
    return MIN_ROWS;
  }
  // Split by any newline variant (\r\n, \r, or \n) and count resulting lines
  const lineCount = value.split(/\r\n|\r|\n/).length;
  return Math.max(MIN_ROWS, lineCount);
}

/**
 * Checks if a string begins with a newline character (codepoint 10 = LF or 13 = CR).
 *
 * Used for the leading newline preservation logic that matches the Jelly template's
 * `&#10;` injection behavior (textarea.jelly line 101). HTML textarea elements collapse
 * a leading newline, so an extra newline must be prepended to preserve the original
 * first-line break.
 *
 * @param value - The string to inspect
 * @returns true if the first character is LF (\\n) or CR (\\r)
 */
function startsWithNewline(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const code = value.charCodeAt(0);
  return code === 10 || code === 13;
}

/**
 * TextArea — React multi-line text input component.
 *
 * Replaces `core/src/main/resources/lib/form/textarea.jelly` with a fully typed React
 * component that preserves identical functionality:
 *
 * - **Auto-sizing**: Row count is determined from value content via `determineRows()`,
 *   porting the Java `h.determineRows()` logic with a minimum of 5 rows.
 * - **CodeMirror integration**: When `codemirrorMode` is set, the `codemirror` CSS class
 *   and `data-codemirror-mode`/`data-codemirror-config` attributes are applied for
 *   external CodeMirror loader pickup.
 * - **Markup preview**: When `previewEndpoint` is provided (and not readOnly), a
 *   "Preview" / "Hide preview" toggle is rendered. Clicking "Preview" POSTs the current
 *   textarea content to the endpoint via `useStaplerMutation` and renders the returned
 *   HTML in a preview container.
 * - **AJAX validation**: `checkUrl`, `checkDependsOn`, `checkMethod`, and `checkMessage`
 *   are passed through as data attributes for the validation system.
 * - **Leading newline preservation**: If the value starts with a newline character,
 *   an extra newline is prepended to counteract browser textarea collapsing behavior.
 * - **Localization**: Preview link labels use `useI18n().t()` for i18n continuity.
 */
export function TextArea(props: TextAreaProps) {
  const {
    field,
    name: nameProp,
    value: valueProp,
    defaultValue,
    checkMessage,
    checkUrl,
    checkDependsOn,
    checkMethod,
    codemirrorMode,
    codemirrorConfig,
    previewEndpoint,
    readOnly = false,
    rows: rowsProp,
    onChange,
    id,
    style,
    className,
  } = props;

  // --- Hooks ---

  // Localization hook for translating preview link text
  const { t } = useI18n();

  // Stapler POST mutation for fetching rendered preview HTML from the preview endpoint.
  // The mutation is always created (hooks cannot be conditional), but `fetchPreview`
  // is only called when `previewEndpoint` is defined.
  const {
    mutate: fetchPreview,
    data: previewData,
    isPending: isPreviewPending,
  } = useStaplerMutation<string, { text: string }>({
    url: previewEndpoint ?? "",
    responseType: "text",
    contentType: "form-urlencoded",
  });

  // Internal value state for uncontrolled mode (when valueProp is not provided)
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? "",
  );

  // Derive the current textarea value:
  // - Controlled mode (valueProp is defined): use the external value prop directly
  // - Uncontrolled mode (valueProp is undefined): use internal state
  const currentValue = valueProp !== undefined ? valueProp : internalValue;

  // Preview panel visibility toggle
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Textarea DOM element reference for focus management and CodeMirror signaling
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Side effect: notify external CodeMirror integration when mode is configured.
  // Dispatches a custom event on the textarea element so the CodeMirror loader
  // (external system) can initialize syntax highlighting. This replaces the
  // Jelly/behaviorShim DOM mutation observer pattern where CodeMirror was applied
  // after server-side rendering via Behaviour.specify().
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !codemirrorMode) {
      return;
    }
    textarea.dispatchEvent(
      new CustomEvent("jenkins:codemirror-init", {
        detail: { mode: codemirrorMode, config: codemirrorConfig },
        bubbles: true,
      }),
    );
  }, [codemirrorMode, codemirrorConfig]);

  // --- Computed values ---

  // Textarea name: explicit name prop takes priority, otherwise inferred from field
  const computedName = useMemo(
    () => nameProp ?? (field ? `_.${field}` : undefined),
    [nameProp, field],
  );

  // Row count: explicit rows prop takes priority, otherwise auto-determined from content
  const computedRows = useMemo(
    () => rowsProp ?? determineRows(currentValue),
    [rowsProp, currentValue],
  );

  // CSS class string: 'jenkins-input' base + conditional 'validated' and 'codemirror'
  // + any user-provided className
  const computedClassName = useMemo(() => {
    const classes: string[] = ["jenkins-input"];
    if (checkUrl) {
      classes.push("validated");
    }
    if (codemirrorMode) {
      classes.push("codemirror");
    }
    if (className) {
      classes.push(className);
    }
    return classes.join(" ");
  }, [checkUrl, codemirrorMode, className]);

  // Textarea value with leading newline preservation.
  // HTML textarea elements collapse a leading newline — prepending an extra newline
  // ensures the original content is rendered correctly (matches Jelly &#10; injection).
  const renderedValue = useMemo(() => {
    if (currentValue && startsWithNewline(currentValue)) {
      return "\n" + currentValue;
    }
    return currentValue;
  }, [currentValue]);

  // --- Event handlers ---

  // Change handler: always updates internal state (harmless in controlled mode)
  // and notifies the parent via onChange callback
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  // Preview toggle: shows the preview panel and fetches rendered HTML from the endpoint
  const handleShowPreview = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (!previewEndpoint) {
        return;
      }
      setShowPreview(true);
      fetchPreview({ text: currentValue });
    },
    [previewEndpoint, fetchPreview, currentValue],
  );

  // Hide preview: collapses the preview panel and shows the textarea again
  const handleHidePreview = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setShowPreview(false);
  }, []);

  // --- Localized labels ---

  const previewLabel = t("Preview") ?? "Preview";
  const hidePreviewLabel = t("Hide preview") ?? "Hide preview";

  // Whether the preview section should be rendered at all
  const hasPreview = Boolean(previewEndpoint) && !readOnly;

  // --- Render ---

  return (
    <>
      <textarea
        ref={textareaRef}
        id={id}
        name={computedName}
        className={computedClassName}
        rows={computedRows}
        readOnly={readOnly}
        style={style}
        value={renderedValue}
        onChange={handleChange}
        data-check-url={checkUrl}
        data-check-depends-on={checkDependsOn}
        data-check-method={checkMethod}
        data-check-message={checkMessage}
        data-codemirror-mode={codemirrorMode}
        data-codemirror-config={codemirrorConfig}
      />

      {hasPreview && (
        <>
          <div className="textarea-preview-container">
            {!showPreview ? (
              <a
                href="#"
                className="textarea-show-preview"
                onClick={handleShowPreview}
              >
                {previewLabel}
              </a>
            ) : (
              <a
                href="#"
                className="textarea-hide-preview"
                onClick={handleHidePreview}
              >
                {hidePreviewLabel}
              </a>
            )}
          </div>

          {showPreview && (
            <div
              className="textarea-preview"
              dangerouslySetInnerHTML={{
                __html: isPreviewPending ? "" : (previewData ?? ""),
              }}
            />
          )}
        </>
      )}
    </>
  );
}
