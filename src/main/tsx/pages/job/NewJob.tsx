/**
 * NewJob — New Item Creation Page Component
 *
 * Replaces:
 * 1. core/src/main/resources/hudson/model/View/newJob.jelly (75 lines)
 * 2. src/main/js/add-item.js (352 lines)
 *
 * Renders the "Create New Item" form with:
 * - Item name input with server-side validation via checkJobName endpoint
 * - Category-based item type selection (radio buttons)
 * - Optional "Copy from" field for cloning existing items
 * - Client-side validation gating native form submission to createItem
 *
 * All imperative DOM manipulation from add-item.js is replaced by React
 * state management. The form still submits via native POST to the Stapler
 * createItem endpoint — no AJAX form submission.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import Layout from '@/layout/Layout';
import { useStaplerQuery } from '@/hooks/useStaplerQuery';
import { useStaplerMutation } from '@/hooks/useStaplerMutation';
import { useI18n } from '@/hooks/useI18n';
import { useJenkinsNavigation } from '@/hooks/useJenkinsNavigation';

/* ================================================================
   Type Definitions
   ================================================================ */

/**
 * Represents a single item type within a category (e.g., Freestyle Project,
 * Pipeline). Mirrors the JSON response from the Stapler itemCategories endpoint.
 */
export interface ItemType {
  /** Java class name used as the radio input value */
  class: string;
  /** Human-readable item type name */
  displayName: string;
  /** Item type description — may contain HTML-encoded links */
  description: string;
  /** Inline SVG XML for the item icon (case 1) */
  iconXml?: string;
  /** CSS class name for the icon (case 2, used with iconQualifiedUrl) */
  iconClassName?: string;
  /** Fully qualified icon URL (case 2) */
  iconQualifiedUrl?: string;
  /** Icon file path pattern with :size placeholder (case 3) */
  iconFilePathPattern?: string;
}

/**
 * Represents a category grouping of item types (e.g., "Standalone Projects",
 * "Nested Projects"). Mirrors the JSON response structure from Stapler.
 */
export interface ItemCategory {
  /** Category identifier string */
  id: string;
  /** Category display name */
  name: string;
  /** Category description text */
  description: string;
  /** Array of item types belonging to this category */
  items: ItemType[];
}

/**
 * Props for the NewJob page component.
 */
export interface NewJobProps {
  /** Current view URL relative to Jenkins root (for API calls and form action) */
  viewUrl: string;
  /** Localized pronoun for the "New" heading (e.g., "Item", "Job") */
  newPronoun?: string;
  /** Whether existing items are available for cloning (shows "Copy from" section) */
  hasExistingItems?: boolean;
}

/** Shape of the Stapler itemCategories endpoint response */
interface CategoriesResponse {
  categories: ItemCategory[];
}

/* ================================================================
   Utility Functions
   ================================================================ */

/**
 * Replaces dots with underscores for valid CSS class names.
 * Mirrors add-item.js line 31: className.replace(/\./g, '_')
 */
function cleanClassName(className: string): string {
  return className.replace(/\./g, '_');
}

/**
 * Detects HTML-encoded anchor tags in description strings and unescapes them.
 * Mirrors add-item.js lines 34-40: checks for '&lt;a href="' pattern.
 */
function checkForLink(desc: string): string {
  if (desc.indexOf('&lt;a href="') === -1) {
    return desc;
  }
  return desc.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Parses the HTML response from the checkJobName Stapler endpoint and
 * extracts the text content of the first element (the validation message).
 * Mirrors add-item.js lines 21-28.
 */
function parseResponseFromCheckJobName(data: string): string | undefined {
  const parser = new DOMParser();
  const doc = parser.parseFromString(data, 'text/html');
  const element = doc.body.firstChild;
  if (element && element.textContent) {
    return element.textContent.trim();
  }
  return undefined;
}

/**
 * Normalizes a view URL: ensures leading slash, strips trailing slash.
 * Returns empty string for empty/undefined input.
 */
function normalizeViewUrl(viewUrl: string | undefined): string {
  if (!viewUrl) {
    return '';
  }
  let normalized = viewUrl;
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/* ================================================================
   Sub-Components
   ================================================================ */

/**
 * Renders the icon for an item type. Handles all 4 icon cases from
 * add-item.js drawIcon() (lines 200-247):
 * 1. iconXml — inline SVG
 * 2. iconClassName + iconQualifiedUrl — img tag
 * 3. iconFilePathPattern — img with resolved URL
 * 4. Default — initials-based placeholder icon
 */
function ItemIcon({
  item,
  baseUrl,
}: {
  item: ItemType;
  baseUrl: string;
}): React.JSX.Element {
  // Case 1: Inline SVG XML
  if (item.iconXml) {
    return (
      <div
        className="icon"
        dangerouslySetInnerHTML={{ __html: item.iconXml }}
      />
    );
  }

  // Case 2: Icon class name with qualified URL
  if (item.iconClassName && item.iconQualifiedUrl) {
    return (
      <div className="icon">
        <img src={item.iconQualifiedUrl} alt="" />
      </div>
    );
  }

  // Case 3: Icon file path pattern with :size placeholder
  if (item.iconFilePathPattern) {
    const resolvedUrl =
      baseUrl + '/' + item.iconFilePathPattern.replace(':size', '48x48');
    return (
      <div className="icon">
        <img src={resolvedUrl} alt="" />
      </div>
    );
  }

  // Case 4: Default initials-based icon
  // Mirrors add-item.js lines 231-245
  const name = item.displayName || '';
  const words = name.split(/\s+/);
  const firstLetter = words[0] ? words[0].charAt(0).toUpperCase() : '';
  const secondLetter =
    words.length > 1
      ? words[1].charAt(0).toUpperCase()
      : name.length > 1
        ? name.charAt(1).toLowerCase()
        : '';

  return (
    <div className="default-icon">
      <span className="a">{firstLetter}</span>
      <span className="b">{secondLetter}</span>
    </div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

/**
 * NewJob — New Item Creation Page
 *
 * Renders the "Create a new item" form with dynamic item category loading,
 * inline name validation, item type radio selection, and optional copy-from
 * support. Fully replaces both newJob.jelly and add-item.js.
 */
function NewJob({
  viewUrl,
  newPronoun = 'Item',
  hasExistingItems = false,
}: NewJobProps): React.JSX.Element {
  const { t } = useI18n();
  const { baseUrl, buildUrl } = useJenkinsNavigation();
  const normalizedUrl = normalizeViewUrl(viewUrl);

  /* ----------------------------------------------------------------
     Refs
     ---------------------------------------------------------------- */
  const nameInputRef = useRef<HTMLInputElement>(null);
  const copyFromInputRef = useRef<HTMLInputElement>(null);
  const copyRadioRef = useRef<HTMLInputElement>(null);

  /* ----------------------------------------------------------------
     State
     ---------------------------------------------------------------- */
  /** Whether the item name passes server-side validation */
  const [nameValid, setNameValid] = useState(false);
  /** Whether an item type radio is selected */
  const [itemsValid, setItemsValid] = useState(false);
  /** Whether the copy-from field has a valid value */
  const [fromValid, setFromValid] = useState(false);
  /** The currently selected item type class name (or null) */
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  /** Whether the name-required message should be shown */
  const [showNameRequired, setShowNameRequired] = useState(false);
  /** Whether the itemtype-required message should be shown */
  const [showItemTypeRequired, setShowItemTypeRequired] = useState(false);
  /* ----------------------------------------------------------------
     Data Fetching — Item Categories
     ---------------------------------------------------------------- */
  const {
    data: categoriesData,
    isLoading,
    isError,
  } = useStaplerQuery<CategoriesResponse>({
    url: buildUrl(
      `${normalizedUrl}/itemCategories?depth=3&iconStyle=icon-xlg`,
    ),
    queryKey: ['itemCategories', normalizedUrl],
  });

  // Derive panel visibility from query state (mirrors add-item.js line 250)
  const panelVisible = Boolean(categoriesData && !isLoading && !isError);

  // Auto-focus name input after data loads (mirrors add-item.js line 259)
  useEffect(() => {
    if (panelVisible && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [panelVisible]);

  const categories: ItemCategory[] = categoriesData?.categories ?? [];

  /* ----------------------------------------------------------------
     Name Validation Mutation
     Mirrors add-item.js lines 262-290: POST to checkJobName
     ---------------------------------------------------------------- */
  const {
    mutate: validateName,
    data: nameValidationData,
    isPending: isNameValidating,
    isError: isNameValidationError,
  } = useStaplerMutation<string, string>({
    url: buildUrl(`${normalizedUrl}/checkJobName`),
    contentType: 'form-urlencoded',
    responseType: 'text',
    onSuccess: (responseData: string) => {
      const message = parseResponseFromCheckJobName(responseData);
      if (message) {
        setNameValid(false);
      } else {
        setNameValid(true);
      }
    },
    onError: () => {
      setNameValid(false);
    },
  });

  /**
   * Derived validation message from the last mutation response.
   * Uses `nameValidationData` (the mutation's `data` property) directly
   * to parse and display server-side name validation errors.
   */
  const nameValidationMessage: string =
    nameValidationData
      ? (parseResponseFromCheckJobName(nameValidationData) ?? '')
      : '';

  /* ----------------------------------------------------------------
     Event Handlers
     ---------------------------------------------------------------- */

  /**
   * Handles name input blur and input events.
   * Mirrors add-item.js nameFieldEvent() lines 262-290.
   */
  const handleNameEvent = useCallback(
    (e: React.ChangeEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      if (value === '') {
        setShowNameRequired(true);
        setNameValid(false);
        // Update data-valid attribute for CSS
        if (nameInputRef.current) {
          nameInputRef.current.setAttribute('data-valid', 'false');
        }
      } else {
        setShowNameRequired(false);
        validateName(`value=${encodeURIComponent(value)}`);
      }
    },
    [validateName],
  );

  /**
   * Handles item type selection via click or keyboard.
   * Mirrors add-item.js select() lines 174-187.
   */
  const handleItemSelect = useCallback(
    (itemClass: string) => {
      // Clean copy-from selection
      if (copyRadioRef.current) {
        copyRadioRef.current.checked = false;
      }
      if (copyFromInputRef.current) {
        copyFromInputRef.current.value = '';
        copyFromInputRef.current.setAttribute('data-valid', 'false');
      }
      setFromValid(false);

      // Set selected item
      setSelectedItem(itemClass);
      setItemsValid(true);
      setShowItemTypeRequired(false);

      // Update name data-valid if name is valid
      if (nameInputRef.current && nameValid) {
        nameInputRef.current.setAttribute('data-valid', 'true');
      }
    },
    [nameValid],
  );

  /**
   * Handles keyboard events on item list items (Space/Enter to select).
   * Mirrors add-item.js lines 190-195.
   */
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>, itemClass: string) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleItemSelect(itemClass);
      }
    },
    [handleItemSelect],
  );

  /**
   * Handles copy-from field blur and input events.
   * Mirrors add-item.js copyFromFieldEvent() lines 296-323.
   */
  const handleCopyFromEvent = useCallback(
    (e: React.ChangeEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      if (value === '') {
        // Uncheck copy radio
        if (copyRadioRef.current) {
          copyRadioRef.current.checked = false;
        }
        setFromValid(false);
      } else {
        // Clean item selection
        setSelectedItem(null);
        setItemsValid(false);

        // Check copy radio
        if (copyRadioRef.current) {
          copyRadioRef.current.checked = true;
        }
        setFromValid(true);

        if (copyFromInputRef.current) {
          copyFromInputRef.current.setAttribute('data-valid', 'true');
        }
      }
    },
    [],
  );

  /**
   * Computes whether the submit button should be enabled.
   * Mirrors add-item.js getFormValidationStatus() lines 81-96.
   */
  const isSubmitEnabled = nameValid && (itemsValid || fromValid);

  /**
   * Handles form submission — prevents default when validation fails.
   * Mirrors add-item.js lines 98-119 form submit handler.
   */
  const handleFormSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      if (isSubmitEnabled) {
        // Let the native form POST proceed to createItem
        return;
      }

      e.preventDefault();

      // Show validation messages for missing fields
      const nameValue = nameInputRef.current?.value.trim() ?? '';
      if (nameValue === '') {
        setShowNameRequired(true);
      }
      if (!itemsValid && !fromValid) {
        setShowItemTypeRequired(true);
      }
    },
    [isSubmitEnabled, itemsValid, fromValid],
  );

  /* ----------------------------------------------------------------
     Rendering Helpers
     ---------------------------------------------------------------- */

  /**
   * Renders a single item type within a category.
   * Mirrors add-item.js drawItem() lines 146-197.
   */
  const renderItem = (item: ItemType): React.JSX.Element => {
    const isSelected = selectedItem === item.class;
    const cleanedClass = cleanClassName(item.class);
    const processedDesc = checkForLink(item.description);

    return (
      <li
        key={item.class}
        tabIndex={0}
        className={`${cleanedClass}${isSelected ? ' active' : ''}`}
        role="radio"
        aria-checked={isSelected}
        onClick={() => handleItemSelect(item.class)}
        onKeyDown={(e) => handleItemKeyDown(e, item.class)}
      >
        <ItemIcon item={item} baseUrl={baseUrl} />
        <div>
          <label>
            <input
              type="radio"
              name="mode"
              value={item.class}
              checked={isSelected}
              onChange={() => handleItemSelect(item.class)}
            />
            <span className="label">{item.displayName}</span>
          </label>
          <div
            className="desc"
            dangerouslySetInnerHTML={{ __html: processedDesc }}
          />
        </div>
      </li>
    );
  };

  /**
   * Renders a category section with its item types.
   * Mirrors add-item.js drawCategory() lines 122-143.
   */
  const renderCategory = (category: ItemCategory): React.JSX.Element => {
    const categoryClassName = `j-add-item-type-${cleanClassName(category.id)}`;
    return (
      <div
        key={category.id}
        className="category"
        id={categoryClassName}
      >
        <div className="header">
          <h2>{category.name}</h2>
          <p>{category.description}</p>
        </div>
        <ul className="j-item-options">
          {category.items.map((item) => renderItem(item))}
        </ul>
      </div>
    );
  };

  /* ----------------------------------------------------------------
     Component Render
     ---------------------------------------------------------------- */
  return (
    <Layout type="one-column" title={`New ${newPronoun}`}>
      <div
        id="add-item-panel"
        style={panelVisible ? undefined : { display: 'none' }}
      >
        <h1>
          {'New '}
          {newPronoun}
        </h1>
        <form
          method="post"
          action="createItem"
          name="createItem"
          id="createItem"
          onSubmit={handleFormSubmit}
        >
          {/* ── Name Input Section ── */}
          <div className="header">
            <div className="add-item-name">
              <label htmlFor="name" className="jenkins-form-label">
                {t('Item name') ?? 'Item name'}
              </label>
              <input
                ref={nameInputRef}
                name="name"
                className="jenkins-input"
                id="name"
                data-valid={nameValid ? 'true' : 'false'}
                type="text"
                tabIndex={0}
                onBlur={handleNameEvent}
                onChange={handleNameEvent}
                autoComplete="off"
              />
              <div
                id="itemname-required"
                className={`input-validation-message${showNameRequired ? '' : ' input-message-disabled'}`}
              >
                {'» '}
                {t('ItemName.validation.required') ?? 'This field cannot be empty, please enter a valid name'}
              </div>
              <div
                id="itemname-invalid"
                className={`input-validation-message${
                  nameValidationMessage || isNameValidationError || isNameValidating
                    ? ''
                    : ' input-message-disabled'
                }`}
              >
                {isNameValidating && '» Validating...'}
                {isNameValidationError && !isNameValidating && (
                  <>{'» '}{t('Validation failed') ?? 'Validation request failed'}</>
                )}
                {nameValidationMessage && !isNameValidating && !isNameValidationError && (
                  <>{`» ${nameValidationMessage}`}</>
                )}
              </div>
              <div
                id="itemtype-required"
                className={`input-validation-message${showItemTypeRequired ? '' : ' input-message-disabled'}`}
              >
                {'» '}
                {t('ItemType.validation.required') ?? 'Please select an item type'}
              </div>
            </div>
          </div>

          {/* ── Item Type Selection Section ── */}
          <div>
            <div className="jenkins-form-label">
              {t('Item type') ?? 'Item type'}
            </div>
            <div
              id="items"
              className="categories flat"
              role="radiogroup"
              aria-label="Item type"
              data-valid={itemsValid ? 'true' : 'false'}
            >
              {categories.map((category) => renderCategory(category))}
            </div>
          </div>

          {/* ── Copy From Section ── */}
          {hasExistingItems && (
            <div className="item-copy">
              <p className="jenkins-form-label">
                {t('Copy from') ?? 'Copy from'}
              </p>
              <div className="add-item-copy">
                <input
                  ref={copyRadioRef}
                  type="radio"
                  name="mode"
                  value="copy"
                  readOnly
                />
                <label htmlFor="from">
                  {t('Copy from') ?? 'Copy from'}
                </label>
                <input
                  ref={copyFromInputRef}
                  id="from"
                  data-valid={fromValid ? 'true' : 'false'}
                  name="from"
                  placeholder={t('Type to autocomplete') ?? 'Type to autocomplete'}
                  className="jenkins-input"
                  type="text"
                  autoComplete="off"
                  onBlur={handleCopyFromEvent}
                  onChange={handleCopyFromEvent}
                />
              </div>
            </div>
          )}

          {/* ── Submit Button ── */}
          <div className="bottom-sticker-inner">
            <button
              type="submit"
              id="ok-button"
              disabled={!isSubmitEnabled}
              className="jenkins-button jenkins-button--primary"
            >
              {t('OK') ?? 'OK'}
            </button>
          </div>
        </form>
      </div>

      {/* Loading state — shown while categories are being fetched */}
      {isLoading && !panelVisible && (
        <div className="add-item-panel-loading">
          <h1>
            {'New '}
            {newPronoun}
          </h1>
          <div className="spinner-container">
            <div className="spinner" />
          </div>
        </div>
      )}

      {/* Error state — shown if categories fetch fails */}
      {isError && !panelVisible && (
        <div className="add-item-panel-error">
          <h1>
            {'New '}
            {newPronoun}
          </h1>
          <div className="error">
            {t('Unable to load item categories') ?? 'Unable to load item categories. Please try again.'}
          </div>
        </div>
      )}
    </Layout>
  );
}

export default NewJob;
