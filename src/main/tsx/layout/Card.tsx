import type React from "react";

/**
 * Props for the Card container component.
 *
 * Mirrors the attributes from `core/src/main/resources/lib/layout/card.jelly`
 * (lines 28–40): title (required), id, controls, expandable, and children.
 */
export interface CardProps {
  /** Title text displayed at the top of the card (required). */
  title: string;
  /** Optional DOM id applied to the root card element. */
  id?: string;
  /** Optional controls rendered in the top-right area of the card title bar. */
  controls?: React.ReactNode;
  /**
   * Optional URL — when provided the title becomes a navigable link with a
   * chevron-forward icon indicating expandability.
   */
  expandable?: string;
  /** Card body content. */
  children: React.ReactNode;
}

/**
 * Card — a container component that renders a card UI with a title bar
 * (including optional expandable link and controls) and a content area.
 *
 * Replaces `core/src/main/resources/lib/layout/card.jelly`.
 * Uses the `.jenkins-card` CSS class family from
 * `src/main/scss/components/_cards.scss`.
 *
 * DOM structure mirrors the Jelly output exactly so that the existing SCSS
 * rules apply without modification.
 */
export function Card({
  title,
  id,
  controls,
  expandable,
  children,
}: CardProps): React.JSX.Element {
  return (
    <div className="jenkins-card" id={id}>
      <div className="jenkins-card__title">
        {expandable == null ? (
          title
        ) : (
          <a
            href={expandable}
            className="jenkins-card__title-link jenkins-card__reveal"
          >
            {title}
            {/* SVG chevron icon matching <l:icon src="symbol-chevron-forward" /> */}
            <svg
              className="svg-icon"
              aria-hidden="true"
              focusable="false"
            >
              <use href="#symbol-chevron-forward" />
            </svg>
          </a>
        )}
        <div className="jenkins-card__controls">{controls}</div>
      </div>
      <div className="jenkins-card__content">{children}</div>
    </div>
  );
}

export default Card;
