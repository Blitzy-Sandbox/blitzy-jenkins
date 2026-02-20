/**
 * ScriptConsole — Groovy Script Console Interface Component
 *
 * Replaces `core/src/main/resources/lib/hudson/scriptConsole.jelly` — the Jelly
 * template that provides an interactive Groovy script console with a textarea
 * for script input, a Run button for execution, and an output `<pre>` block for
 * displaying results.
 *
 * The Jelly version uses:
 * - Server-side form POST (`<form action="script" method="post">`) for execution
 * - `<st:adjunct>` for CodeMirror Groovy syntax highlighting
 * - `<l:copyButton>` for clipboard copy of output
 * - `${%...}` localization patterns for 8 i18n keys
 * - `it.channel != null` conditional for offline detection
 *
 * The React version replaces these with:
 * - `useStaplerMutation` with form-urlencoded content type for script execution POST
 * - Plain textarea with `id="script"` and `class="script"` for CodeMirror compat
 * - Clipboard API (`navigator.clipboard.writeText()`) for copy functionality
 * - `useI18n` hook `t()` for localization
 * - `channelAvailable` prop for offline state
 *
 * No jQuery, no Handlebars, no behaviorShim — React 19 component lifecycle.
 *
 * @module hudson/ScriptConsole
 */

import { useState, useCallback, useRef, type ReactNode, type ReactElement, type FormEvent } from 'react';
import { useStaplerMutation } from '@/hooks/useStaplerMutation';
import { useCrumb } from '@/hooks/useCrumb';
import { useI18n } from '@/hooks/useI18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ScriptConsole} component.
 *
 * Maps to the Jelly template attributes and context variables:
 * - `scriptUrl` → the `action` attribute on the `<form>` tag (line 59)
 * - `channelAvailable` → `it.channel != null` conditional (line 49)
 * - `initialScript` → `request2.getParameter('script')` (line 60)
 * - `layout` → `attrs.layout` (line 38), defaults to `'two-column'`
 * - `title` → `${%scriptConsole}` override
 * - `children` → `<d:invokeBody />` slot (line 54) for example content
 */
export interface ScriptConsoleProps {
  /**
   * The URL to POST the script to for execution.
   * Maps to the `action` attribute on the Jelly `<form>` tag.
   *
   * @example '/computer/{name}/script'
   * @example '/manage/script'
   */
  scriptUrl: string;

  /**
   * Whether the script execution channel is available.
   * When `false`, the form is hidden and an offline message is displayed.
   * Mirrors `it.channel != null` conditional from scriptConsole.jelly line 49.
   *
   * @default true
   */
  channelAvailable?: boolean;

  /**
   * Pre-populated script text for the textarea.
   * Mirrors `request2.getParameter('script')` from scriptConsole.jelly line 60.
   *
   * @default ''
   */
  initialScript?: string;

  /**
   * Layout type for the page shell.
   * Mirrors the `layout` attribute from scriptConsole.jelly line 38.
   *
   * @default 'two-column'
   */
  layout?: string;

  /**
   * Custom title override for the page heading.
   * When not provided, uses the localized `'scriptConsole'` i18n key.
   */
  title?: string;

  /**
   * Slot content rendered between the description paragraphs.
   * Replaces the Jelly `<d:invokeBody />` invocation (line 54) which is used
   * to inject example script snippets or contextual help.
   */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Duration in milliseconds to show the "Copied!" feedback tooltip
 * after a successful clipboard copy operation.
 */
const COPY_FEEDBACK_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// Component Implementation
// ---------------------------------------------------------------------------

/**
 * Interactive Groovy Script Console component.
 *
 * Renders a form with a textarea for script input and a Run button. On
 * submission, the script is POSTed to the `scriptUrl` endpoint via
 * `useStaplerMutation` with form-urlencoded content type and CSRF crumb
 * injection. The server response (plain text output) is displayed in a
 * `<pre>` block with a copy-to-clipboard button.
 *
 * When `channelAvailable` is `false`, the form is replaced with an offline
 * message, mirroring the Jelly `<j:otherwise>` branch (line 74-77).
 *
 * DOM structure matches the Jelly template output for visual parity:
 * ```
 * <h1>Script Console</h1>
 * <p>{description}</p>
 * {children}
 * <p>{description2}</p>
 * <form>
 *   <textarea id="script" name="script" class="script">...</textarea>
 *   <div style="text-align: right"><button>Run</button></div>
 * </form>
 * <h2>Result <button>Copy</button></h2>
 * <pre>{output}</pre>
 * ```
 *
 * @param props - Component props (see {@link ScriptConsoleProps})
 * @returns The rendered script console interface
 */
function ScriptConsole(props: ScriptConsoleProps): ReactElement {
  const {
    scriptUrl,
    channelAvailable = true,
    initialScript = '',
    title: titleOverride,
    children,
  } = props;
  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  const { t } = useI18n();
  const { crumbFieldName, crumbValue } = useCrumb();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Current script text in the textarea */
  const [scriptText, setScriptText] = useState<string>(initialScript);

  /** Script execution output text — null when no execution has occurred */
  const [output, setOutput] = useState<string | null>(null);

  /** Whether the copy-to-clipboard feedback is currently shown */
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  /** Ref for the textarea element, preserved for CodeMirror integration */
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // -------------------------------------------------------------------------
  // Mutation — Script execution POST
  // -------------------------------------------------------------------------

  /**
   * Stapler mutation for executing the Groovy script via POST.
   *
   * Uses `form-urlencoded` content type to match the original Jelly form
   * submission pattern (`<form action="script" method="post">`). The
   * `responseType: 'text'` ensures the raw script output text is returned
   * (not parsed as JSON), matching the plain-text response from the
   * `/script` endpoint.
   *
   * CSRF crumb is automatically injected by the `jenkinsStaplerPost`
   * client function called under the hood.
   */
  const scriptMutation = useStaplerMutation<string, string>({
    url: scriptUrl,
    contentType: 'form-urlencoded',
    responseType: 'text',
    onSuccess: (data: string) => {
      setOutput(data);
    },
    onError: (error: Error) => {
      setOutput(`Error: ${error.message}`);
    },
  });

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  /**
   * Handles form submission by POSTing the script text to the Stapler endpoint.
   *
   * Constructs a URL-encoded form body containing the script text and CSRF
   * crumb, replicating the native `<form>` POST that the Jelly template
   * performs. Prevents the browser's default form submission to keep the
   * SPA experience.
   */
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();

      // Construct form-urlencoded body with script text and CSRF crumb
      // Mirrors the Jelly form fields: <textarea name="script"> + hidden crumb field
      const formBody = new URLSearchParams();
      formBody.append('script', scriptText);
      if (crumbFieldName && crumbValue) {
        formBody.append(crumbFieldName, crumbValue);
      }

      scriptMutation.mutate(formBody.toString());
    },
    [scriptText, crumbFieldName, crumbValue, scriptMutation],
  );

  /**
   * Copies the script execution output to the clipboard using the
   * Clipboard API. Replaces the Jelly `<l:copyButton>` component
   * (scriptConsole.jelly line 70).
   *
   * Shows a brief "Copied!" feedback message on success. Falls back
   * to a no-op if the Clipboard API is unavailable or the copy fails.
   */
  const handleCopyOutput = useCallback((): void => {
    if (output === null) {
      return;
    }

    navigator.clipboard
      .writeText(output)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => {
          setCopySuccess(false);
        }, COPY_FEEDBACK_DURATION_MS);
      })
      .catch(() => {
        // Clipboard API unavailable or denied — silent fail
        // The user can still manually select and copy the <pre> text
      });
  }, [output]);

  // -------------------------------------------------------------------------
  // Derived Values
  // -------------------------------------------------------------------------

  /** Resolved page title: prop override > i18n lookup > fallback */
  const pageTitle: string =
    titleOverride ?? t('scriptConsole') ?? 'Script Console';

  /** Localized description paragraphs */
  const description: string = t('description') ?? '';
  const description2: string = t('description2') ?? '';

  /** Localized button and label text */
  const runButtonLabel: string = t('Run') ?? 'Run';
  const resultHeading: string = t('Result') ?? 'Result';
  const copyTooltipText: string = copySuccess
    ? (t('successfullyCopied') ?? 'Copied!')
    : (t('clickToCopy') ?? 'Copy to clipboard');
  const offlineMessage: string =
    t('impossibleOffline') ??
    'This operation is not available because the channel is offline.';

  // -------------------------------------------------------------------------
  // Render — Offline State
  // -------------------------------------------------------------------------

  if (!channelAvailable) {
    return (
      <div className="jenkins-script-console">
        <h1>{pageTitle}</h1>
        <p>{offlineMessage}</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render — Online State (Form + Output)
  // -------------------------------------------------------------------------

  return (
    <div className="jenkins-script-console">
      <h1>{pageTitle}</h1>

      {/* Description paragraph — mirrors scriptConsole.jelly line 51 */}
      {description && <p>{description}</p>}

      {/* Children slot — mirrors <d:invokeBody /> (line 54) for examples */}
      {children}

      {/* Second description paragraph — mirrors line 56 */}
      {description2 && <p>{description2}</p>}

      {/* Script execution form — mirrors <form action="script" method="post"> (line 59) */}
      <form
        action="script"
        method="post"
        onSubmit={handleSubmit}
      >
        {/*
         * Textarea for Groovy script input.
         * Preserves id="script", name="script", class="script" for
         * CodeMirror integration compatibility (line 60).
         */}
        <textarea
          ref={textareaRef}
          id="script"
          name="script"
          className="script"
          value={scriptText}
          onChange={(e) => { setScriptText(e.target.value); }}
          rows={20}
          aria-label={pageTitle}
        />

        {/* Submit button aligned right — mirrors <div align="right"> (line 61-63) */}
        <div style={{ textAlign: 'end' }}>
          <button
            type="submit"
            className="jenkins-button jenkins-button--primary"
            disabled={scriptMutation.isPending}
          >
            {scriptMutation.isPending ? `${runButtonLabel}…` : runButtonLabel}
          </button>
        </div>
      </form>

      {/* Output section — shown only after execution (line 67-73) */}
      {output !== null && (
        <section aria-label={resultHeading}>
          <h2>
            {resultHeading}
            {' '}
            {/* Copy button — replaces <l:copyButton> (line 70) */}
            <button
              type="button"
              className="jenkins-button jenkins-button--tertiary"
              onClick={handleCopyOutput}
              title={copyTooltipText}
              aria-label={copyTooltipText}
            >
              {copySuccess
                ? (t('successfullyCopied') ?? 'Copied!')
                : '📋'}
            </button>
          </h2>

          {/*
           * Output pre-formatted text block — mirrors <pre><st:out value="${output}"/></pre>
           * (line 72). React's JSX escaping provides equivalent XSS protection
           * to Jelly's <st:out> tag — no dangerouslySetInnerHTML needed.
           */}
          <pre>{output}</pre>
        </section>
      )}
    </div>
  );
}

export default ScriptConsole;
