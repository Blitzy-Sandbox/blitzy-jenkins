/**
 * Toast notification system for Jenkins UI.
 *
 * React 19 + TypeScript replacement for src/main/js/components/notifications/index.js.
 * Replaces imperative DOM manipulation with declarative React state management while
 * preserving the global `window.notificationBar` interface for backward plugin
 * compatibility.
 *
 * CSS classes consumed from existing SCSS (no new styles):
 *   - jenkins-notification (base)
 *   - jenkins-notification--success / --warning / --error (type modifiers)
 *   - jenkins-notification--visible / --hidden (visibility state)
 *
 * @module Notifications
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { INFO, SUCCESS, WARNING, ERROR } from "@/utils/symbols";

// ---------------------------------------------------------------------------
// Constants — matching source lines 6–7
// ---------------------------------------------------------------------------

/** Full opacity constant preserved for backward-compatible global API */
const OPACITY = 1;

/** Auto-dismiss delay in milliseconds (matching source DELAY: 3000) */
const DELAY = 3000;

/** Default CSS class applied when no alertClass is specified */
const DEFAULT_ALERT_CLASS = "jenkins-notification";

// ---------------------------------------------------------------------------
// Exported Types
// ---------------------------------------------------------------------------

/**
 * Union of supported notification severity levels.
 * Maps to CSS modifier classes and icon constants.
 */
export type NotificationType = "success" | "warning" | "error" | "info";

/**
 * Configuration object accepted by `show()`.
 * Mirrors the options shape used in the legacy source implementation.
 *
 * @property alertClass - CSS class string applied to the notification container.
 *   Defaults to `"jenkins-notification"`.
 * @property icon - Inline SVG string for the notification icon.
 *   Defaults to the INFO symbol.
 * @property sticky - When `true` the notification will not auto-dismiss
 *   after the DELAY timeout.  Defaults to `false`.
 */
export interface NotificationOptions {
  alertClass?: string;
  icon?: string;
  sticky?: boolean;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Internal state representing the currently visible notification. */
interface NotificationState {
  text: string;
  icon: string;
  alertClass: string;
  sticky: boolean;
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Notification type presets — matching source lines 13–25
// ---------------------------------------------------------------------------

const NOTIFICATION_SUCCESS: NotificationOptions = {
  alertClass: "jenkins-notification jenkins-notification--success",
  icon: SUCCESS,
};

const NOTIFICATION_WARNING: NotificationOptions = {
  alertClass: "jenkins-notification jenkins-notification--warning",
  icon: WARNING,
};

const NOTIFICATION_ERROR: NotificationOptions = {
  alertClass: "jenkins-notification jenkins-notification--error",
  icon: ERROR,
  sticky: true,
};

// ---------------------------------------------------------------------------
// Global type augmentation for window.notificationBar
// ---------------------------------------------------------------------------

/**
 * Augments the global `Window` interface so that TypeScript strict mode
 * recognises `window.notificationBar` without casting.
 */
declare global {
  interface Window {
    notificationBar?: {
      OPACITY: number;
      DELAY: number;
      SUCCESS: NotificationOptions;
      WARNING: NotificationOptions;
      ERROR: NotificationOptions;
      show: (text: string, options?: NotificationOptions) => void;
      hide: () => void;
      init: () => void;
      clearTimeout: () => void;
    };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Global toast notification bar component.
 *
 * Renders a single notification at a time with an icon and text message.
 * Clicking the notification dismisses it. Non-sticky notifications auto-
 * dismiss after {@link DELAY} milliseconds.
 *
 * Exposes `window.notificationBar` on mount so that legacy Jenkins modules
 * and plugins can continue to trigger notifications via the established API.
 *
 * @example
 * ```tsx
 * // Mount once at the application root
 * <Notifications />
 *
 * // Then trigger from anywhere:
 * window.notificationBar?.show("Build started", window.notificationBar.SUCCESS);
 * ```
 */
const Notifications: React.FC = () => {
  // ---- State ---------------------------------------------------------------
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );

  /** Ref holding the auto-dismiss timer token (browser setTimeout ID). */
  const timerRef = useRef<number | null>(null);

  // ---- Internal helpers ----------------------------------------------------

  /**
   * Clear any pending auto-dismiss timer.
   * Matches source lines 41–46.
   */
  const clearTimeoutFn = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
  }, []);

  /**
   * Hide the current notification.
   * Clears any pending timer and transitions the notification to the
   * hidden CSS state. Matches source lines 48–52.
   */
  const hideNotification = useCallback(() => {
    clearTimeoutFn();
    setNotification((prev) => {
      if (prev === null) {
        return null;
      }
      return { ...prev, visible: false };
    });
  }, [clearTimeoutFn]);

  /**
   * Show a notification with the given text and optional configuration.
   * Matches source lines 54–74.
   *
   * @param text    - The message string to display.
   * @param options - Optional configuration (alertClass, icon, sticky).
   */
  const showNotification = useCallback(
    (text: string, options?: NotificationOptions) => {
      const opts = options ?? {};

      // Clear any existing auto-dismiss timer before showing a new one
      clearTimeoutFn();

      const newNotification: NotificationState = {
        text,
        icon: opts.icon ?? INFO,
        alertClass: opts.alertClass ?? DEFAULT_ALERT_CLASS,
        sticky: opts.sticky === true,
        visible: true,
      };

      setNotification(newNotification);

      // Schedule auto-dismiss unless the notification is sticky
      if (!newNotification.sticky) {
        timerRef.current = window.setTimeout(() => {
          hideNotification();
        }, DELAY);
      }
    },
    [clearTimeoutFn, hideNotification],
  );

  // ---- Global API registration ---------------------------------------------

  /**
   * Expose `window.notificationBar` on mount for backward plugin compatibility.
   * The global object mirrors every property and method from the legacy source
   * implementation so that existing callers continue to work without changes.
   *
   * Cleanup on unmount removes the global reference to prevent stale closures.
   */
  useEffect(() => {
    window.notificationBar = {
      OPACITY,
      DELAY,
      SUCCESS: NOTIFICATION_SUCCESS,
      WARNING: NOTIFICATION_WARNING,
      ERROR: NOTIFICATION_ERROR,
      show: showNotification,
      hide: hideNotification,
      // In the React version init() is a no-op — the component mounts
      // automatically and manages its own DOM.
      init: () => {
        /* no-op: React component handles mounting */
      },
      clearTimeout: clearTimeoutFn,
    };

    return () => {
      // Clean up global reference on unmount
      delete window.notificationBar;
    };
  }, [showNotification, hideNotification, clearTimeoutFn]);

  // ---- Timer cleanup on unmount --------------------------------------------

  useEffect(() => {
    return () => {
      // Ensure no orphan timers when the component is unmounted
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // ---- Render --------------------------------------------------------------

  // When no notification is active, render an empty hidden container to keep
  // the mount point in the DOM (matching source: the div persists once created)
  if (notification === null) {
    return (
      <div
        id="notification-bar"
        className="jenkins-notification jenkins-notification--hidden"
      />
    );
  }

  const visibilityClass = notification.visible
    ? "jenkins-notification--visible"
    : "jenkins-notification--hidden";

  return (
    <div
      id="notification-bar"
      className={`${notification.alertClass} ${visibilityClass}`}
      onClick={hideNotification}
      role="status"
      aria-live="polite"
    >
      {/* Icon — trusted internal SVG string from @/utils/symbols */}
      <span
        dangerouslySetInnerHTML={{ __html: notification.icon }}
        aria-hidden="true"
      />
      {/* Message text — matching source lines 61–62 */}
      <span>{notification.text}</span>
    </div>
  );
};

export default Notifications;
