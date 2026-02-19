import { forwardRef, type ChangeEvent } from "react";

/**
 * Props for the FileUpload component.
 *
 * Maps the Jelly `file.jelly` tag attributes to typed React props:
 *  - `field`     → databinding / name inference
 *  - `clazz`     → `className` (additional CSS classes)
 *  - `name`      → explicit input name (falls back to `field`)
 *  - `jsonAware` → structured JSON form submission flag
 *  - `accept`    → comma-separated list of accepted MIME types (since Jenkins 2.385)
 */
export interface FileUploadProps {
  /** Databinding field name. Also used to infer the input `name` when `name` is omitted. */
  field?: string;
  /** Additional CSS class(es) appended after the base `jenkins-file-upload` class. */
  className?: string;
  /** Explicit `name` attribute for the `<input>`. Defaults to `field` when not provided. */
  name?: string;
  /** When `true`, marks the input for structured JSON form submission. */
  jsonAware?: boolean;
  /** Comma-separated list of accepted file types (e.g. `".pdf,.docx,image/*"`). */
  accept?: string;
  /** Callback invoked when the user selects or clears files. */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * **FileUpload** — React replacement for `core/src/main/resources/lib/form/file.jelly`.
 *
 * Renders a styled `<input type="file">` element with the `jenkins-file-upload`
 * CSS class applied by `src/main/scss/form/_file-upload.scss`.
 *
 * The component accepts a forwarded `ref` so that parent components can
 * programmatically clear the file selection (`ref.current.value = ""`) or
 * trigger the native file picker (`ref.current.click()`).
 *
 * ### Mapping from Jelly
 *
 * | Jelly attribute | React prop    | Notes                                   |
 * |-----------------|---------------|-----------------------------------------|
 * | `field`         | `field`       | Name inference when `name` is absent    |
 * | `clazz`         | `className`   | Appended to `jenkins-file-upload`       |
 * | `name`          | `name`        | Explicit input name                     |
 * | `jsonAware`     | `jsonAware`   | Rendered as `data-json-aware` attribute |
 * | `accept`        | `accept`      | Passed through to `<input>`             |
 *
 * @example
 * ```tsx
 * <FileUpload
 *   field="myFile"
 *   accept=".pdf,.docx"
 *   onChange={(e) => console.log(e.target.files)}
 * />
 * ```
 */
export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(
  function FileUpload(
    { field, className, name, jsonAware, accept, onChange },
    ref,
  ) {
    // Compute the input name: an explicit `name` prop takes precedence,
    // otherwise fall back to the `field` prop (mirrors the Jelly expression
    // `attrs.name ?: attrs.field`).
    const inputName = name ?? field;

    // Build the CSS class string. The base class `jenkins-file-upload` is
    // always present; any caller-supplied `className` is appended with a
    // separating space — matching the Jelly expression:
    //   class="jenkins-file-upload${attrs.clazz == null ? '' : ' ' + attrs.clazz}"
    const cssClass = className
      ? `jenkins-file-upload ${className}`
      : "jenkins-file-upload";

    return (
      <input
        ref={ref}
        name={inputName}
        type="file"
        className={cssClass}
        accept={accept}
        data-json-aware={jsonAware || undefined}
        onChange={onChange}
      />
    );
  },
);
