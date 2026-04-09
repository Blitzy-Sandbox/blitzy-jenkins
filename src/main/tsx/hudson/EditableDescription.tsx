import { useState, useCallback, useRef } from "react";
import { useStaplerMutation } from "@/hooks/useStaplerMutation";
import { useCrumb } from "@/hooks/useCrumb";
import { useI18n } from "@/hooks/useI18n";

/**
 * Props for the EditableDescription component.
 *
 * Maps to the Jelly tag attributes from editableDescription.jelly:
 * - permission  → hasPermission (boolean — resolved server-side in Jelly)
 * - description → description   (string — pre-formatted HTML from markupFormatter)
 * - submissionUrl → submissionUrl (string — POST target)
 * - hideButton  → hideButton    (boolean — hides the edit button)
 */
export interface EditableDescriptionProps {
  /** Current description HTML content, pre-formatted by Jenkins' markupFormatter */
  description?: string;
  /** Whether the current user has permission to edit the description */
  hasPermission: boolean;
  /** URL to POST the updated description (defaults to 'submitDescription') */
  submissionUrl?: string;
  /** Whether to hide the edit button (when provided via app bar, defaults to false) */
  hideButton?: boolean;
}

/**
 * EditableDescription — React replacement for editableDescription.jelly and
 * editable-description.js.
 *
 * Renders a description area with inline editing capabilities:
 * - **View mode**: displays the pre-formatted HTML description and an edit button.
 * - **Edit mode**: shows a textarea with Save / Cancel buttons.
 *
 * Replaces:
 * - `editableDescription.jelly`  — server-rendered description + edit button
 * - `editable-description.js`    — imperative DOM manipulation for edit/cancel
 *   transitions and `Behaviour.specify('.description-cancel-button', …)` registration
 *
 * DOM IDs preserved for CSS and external compatibility:
 * - `#description`           — outer container
 * - `#description-content`   — rendered description HTML
 * - `#description-edit-form` — edit form container
 * - `#description-link`      — edit / add button
 *
 * CSS classes preserved:
 * - `jenkins-hidden`                     — visibility toggle
 * - `jenkins-buttons-row`                — button row layout
 * - `jenkins-buttons-row--invert`        — inverted button style
 * - `description-edit-button`            — edit button wrapper
 * - `description-cancel-button`          — cancel button
 */
function EditableDescription({
  description,
  hasPermission,
  submissionUrl,
  hideButton = false,
}: EditableDescriptionProps) {
  const { t } = useI18n();
  const { crumbFieldName, crumbValue } = useCrumb();

  // Ref for textarea focus management when entering edit mode
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ref that tracks the latest editText value so async onSuccess can read it
  // without stale-closure issues.
  const editTextRef = useRef<string>(description ?? "");

  // ---------------------------------------------------------------------------
  // Component state
  // ---------------------------------------------------------------------------

  /** Whether the component is in edit mode */
  const [isEditing, setIsEditing] = useState<boolean>(false);

  /** Raw text currently being edited in the textarea */
  const [editText, setEditText] = useState<string>(description ?? "");

  /**
   * Currently displayed description (may diverge from the `description` prop
   * after a successful save because the component owns local state).
   */
  const [currentDescription, setCurrentDescription] = useState<
    string | undefined
  >(description);

  // ---------------------------------------------------------------------------
  // Mutation — save description via Stapler POST
  // ---------------------------------------------------------------------------

  /**
   * useStaplerMutation POSTs to {submissionUrl || 'submitDescription'} with
   * form-urlencoded body containing the description text and CSRF crumb.
   * The hook automatically injects the crumb in the request header (via the
   * API client layer); we additionally embed it in the form body for dual
   * injection, matching the pattern where Jelly injects a hidden crumb field
   * server-side.
   */
  const { mutate, isPending } = useStaplerMutation<string, string>({
    url: submissionUrl || "submitDescription",
    contentType: "form-urlencoded",
    responseType: "text",
    onSuccess: (responseData: string) => {
      // If the server returns rendered HTML, display it; otherwise fall back to
      // the raw text the user typed (read from the ref to avoid stale closure).
      const newDescription =
        responseData != null && responseData.trim().length > 0
          ? responseData
          : editTextRef.current;
      setCurrentDescription(newDescription);
      setIsEditing(false);
    },
    onError: (error: Error) => {
      // Log the error; the component stays in edit mode so the user can retry.
      console.error("Failed to save description:", error.message);
    },
  });

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /**
   * Enter edit mode.
   *
   * Replaces the `DOMContentLoaded` click handler in editable-description.js
   * and the imperative `replaceDescription(description, url)` call.  React
   * simply toggles a boolean and the declarative JSX swaps the visible panels.
   */
  const handleEdit = useCallback(() => {
    const text = currentDescription ?? "";
    setEditText(text);
    editTextRef.current = text;
    setIsEditing(true);
    // Focus the textarea after React flushes the new edit-mode DOM.
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [currentDescription]);

  /**
   * Exit edit mode without saving.
   *
   * Replaces `Behaviour.specify('.description-cancel-button',
   * 'editable-description', 0, …)` from editable-description.js which
   * imperatively cleared the form innerHTML, added `jenkins-hidden` to the
   * form, and removed `jenkins-hidden` from content and the edit button.
   */
  const handleCancel = useCallback(() => {
    const text = currentDescription ?? "";
    setEditText(text);
    editTextRef.current = text;
    setIsEditing(false);
  }, [currentDescription]);

  /**
   * Save the updated description.
   *
   * Builds a URL-encoded body with:
   * - `description` — the raw description text from the textarea
   * - `{crumbFieldName}` — the CSRF crumb value (dual injection)
   *
   * POSTs via `useStaplerMutation` to the configured submission URL.
   */
  const handleSave = useCallback(() => {
    const params = new URLSearchParams();
    params.append("description", editText);

    // Dual CSRF crumb injection: header (handled by hook) + body (explicit).
    if (crumbFieldName && crumbValue) {
      params.append(crumbFieldName, crumbValue);
    }

    mutate(params.toString());
  }, [editText, crumbFieldName, crumbValue, mutate]);

  /**
   * Synchronise textarea value → state and ref.
   */
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setEditText(value);
      editTextRef.current = value;
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  /** Whether a non-empty description currently exists */
  const hasDescription =
    currentDescription != null && currentDescription.trim().length > 0;

  /** Localised button label — mirrors Jelly's ${%Edit description} / ${%Add description} */
  const editButtonText = hasDescription
    ? (t("Edit description") ?? "Edit description")
    : (t("Add description") ?? "Add description");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div id="description">
      {/* ------------------------------------------------------------------ */}
      {/* Description content — visible in view mode, hidden during editing  */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="description-content"
        className={isEditing ? "jenkins-hidden" : undefined}
        /*
         * dangerouslySetInnerHTML is acceptable here because the content is
         * pre-formatted by Jenkins' app.markupFormatter.translate() on the
         * server side, replicating the Jelly <j:out value="${…}"/> pattern.
         */
        dangerouslySetInnerHTML={
          currentDescription != null && currentDescription.length > 0
            ? { __html: currentDescription }
            : undefined
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Edit form — hidden in view mode, visible during editing            */}
      {/* Preserves id="description-edit-form" for CSS compatibility.        */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="description-edit-form"
        className={isEditing ? undefined : "jenkins-hidden"}
      >
        {isEditing && (
          <>
            <textarea
              ref={textareaRef}
              name="description"
              value={editText}
              onChange={handleTextChange}
              rows={8}
            />
            <div className="jenkins-buttons-row">
              <button type="submit" onClick={handleSave} disabled={isPending}>
                {isPending
                  ? (t("Saving...") ?? "Saving...")
                  : (t("Save") ?? "Save")}
              </button>
              <button
                type="button"
                className="description-cancel-button"
                onClick={handleCancel}
                disabled={isPending}
              >
                {t("Cancel") ?? "Cancel"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Edit / Add button — only rendered when user has permission and the */}
      {/* button isn't hidden.  Gains jenkins-hidden while editing.          */}
      {/* ------------------------------------------------------------------ */}
      {hasPermission && !hideButton && (
        <div
          className={
            "jenkins-buttons-row jenkins-buttons-row--invert description-edit-button" +
            (isEditing ? " jenkins-hidden" : "")
          }
        >
          <button
            id="description-link"
            type="button"
            data-url={submissionUrl || "submitDescription"}
            data-description={currentDescription ?? ""}
            onClick={handleEdit}
          >
            {editButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

export default EditableDescription;
