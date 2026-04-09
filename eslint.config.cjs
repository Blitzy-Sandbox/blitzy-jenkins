const eslintConfigPrettier = require("eslint-config-prettier");
const globals = require("globals");
const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const reactRefreshModule = require("eslint-plugin-react-refresh");

module.exports = [
  // ─── Global ignores ─────────────────────────────────────────────────
  {
    ignores: [
      "**/target/",
      "**/work/",

      // Node
      "**/node/",

      // Generated JavaScript Bundles
      "**/jsbundles/",

      // Vite build output
      "**/dist/",

      // TypeScript declaration files (type-only, no runtime logic to lint)
      "**/*.d.ts",

      // External scripts
      ".pnp.cjs",
      ".pnp.loader.mjs",
      "src/main/js/plugin-setup-wizard/bootstrap-detached.js",
    ],
  },

  // ─── Base language options with Jenkins browser globals ──────────────
  //     All Jenkins-specific globals are preserved for plugin ecosystem
  //     compatibility. Legacy scripts and 2,000+ plugins depend on these
  //     being declared in the global scope.
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        applyTooltip: "readonly",
        AutoScroller: "readonly",
        Behaviour: "readonly",
        breadcrumbs: "readonly",
        buildFormTree: "readonly",
        CodeMirror: "readonly",
        ComboBox: "readonly",
        COMBOBOX_VERSION: "writeable",
        crumb: "readonly",
        dialog: "readonly",
        ensureVisible: "readonly",
        escapeHTML: "readonly",
        findAncestor: "readonly",
        findAncestorClass: "readonly",
        findElementsBySelector: "readonly",
        findFormParent: "readonly",
        fireEvent: "readonly",
        Form: "readonly",
        FormChecker: "readonly",
        getElementOverflowParams: "readonly",
        hoverNotification: "readonly",
        iota: "writeable",
        isInsideRemovable: "readonly",
        isPageVisible: "readonly",
        isRunAsTest: "readonly",
        layoutUpdateCallback: "readonly",
        loadScript: "readonly",
        makeButton: "readonly",
        notificationBar: "readonly",
        object: "readonly",
        objectToUrlFormEncoded: "readonly",
        onSetupWizardInitialized: "readonly",
        qs: "readonly",
        refillOnChange: "readonly",
        refreshPart: "readonly",
        registerSortableDragDrop: "readonly",
        renderOnDemand: "readonly",
        rootURL: "readonly",
        safeValidateButton: "readonly",
        setupWizardExtensions: "readonly",
        SharedArrayBuffer: "readonly",
        shortenName: "readonly",
        Sortable: "readonly",
        toQueryString: "readonly",
        TryEach: "readonly",
        ts_refresh: "readonly",
        updateOptionalBlock: "readonly",
        Utilities: "readonly",
        UTILITIES_VERSION: "writeable",
        YAHOO: "readonly",
      },
    },
  },

  // ─── ESLint recommended rules ───────────────────────────────────────
  js.configs.recommended,

  // ─── Prettier compatibility ─────────────────────────────────────────
  //     Disables ESLint formatting rules that conflict with Prettier so
  //     that both tools can coexist without contradictory reports.
  eslintConfigPrettier,

  // ─── Enforce curly braces for all control statements ────────────────
  {
    rules: {
      curly: "error",
    },
  },

  // ─── TypeScript configuration (scoped to .ts/.tsx files only) ───────
  //     Uses @typescript-eslint/parser for TypeScript-aware parsing and
  //     enables the recommended rule set from @typescript-eslint. Rules
  //     are file-scoped so they do not interfere with existing .js linting.
  //     JSX support is enabled in parserOptions for .tsx component files.
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // ESLint core rule overrides for TypeScript — turns off rules that
      // the TypeScript compiler already enforces (e.g. no-undef, no-redeclare)
      // and enables modern JS rules (prefer-const, no-var, prefer-spread)
      ...tsPlugin.configs["flat/recommended"][1].rules,
      // @typescript-eslint recommended rules — type-aware linting covering
      // ban-ts-comment, no-explicit-any, no-unused-vars, and more
      ...tsPlugin.configs["flat/recommended"][2].rules,
    },
  },

  // ─── React plugin configuration (scoped to JSX/TSX component files) ─
  //     Configures eslint-plugin-react with React 19 version auto-detection
  //     and the automatic JSX runtime overlay. The jsx-runtime config
  //     disables react-in-jsx-scope since React 19 does not require React
  //     to be imported in every file that uses JSX. prop-types is disabled
  //     because TypeScript interfaces replace runtime PropTypes validation.
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      react: reactPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React recommended rules (display-name, jsx-key, no-deprecated, etc.)
      ...reactPlugin.configs.flat.recommended.rules,
      // React 19 automatic JSX runtime — disables react-in-jsx-scope and
      // jsx-uses-react since the compiler handles the React import
      ...reactPlugin.configs.flat["jsx-runtime"].rules,
      // TypeScript interfaces replace React PropTypes for type checking
      "react/prop-types": "off",
    },
  },

  // ─── React Hooks rules (scoped to TS/TSX files) ────────────────────
  //     Enforces the Rules of Hooks, exhaustive-deps, and additional React
  //     19 correctness rules from eslint-plugin-react-hooks v7 recommended
  //     flat config. These rules ensure hooks are called correctly and
  //     component purity is maintained for React 19 concurrent rendering.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      ...reactHooksPlugin.configs.flat.recommended.plugins,
    },
    rules: {
      ...reactHooksPlugin.configs.flat.recommended.rules,
    },
  },

  // ─── React Refresh for Vite Fast Refresh (scoped to TSX files) ─────
  //     Ensures component files export only React components so that
  //     Vite's Fast Refresh (HMR) can safely hot-reload them without a
  //     full page refresh. allowConstantExport permits named constant
  //     exports (e.g. query keys) alongside component exports.
  {
    files: ["**/*.tsx"],
    plugins: {
      ...reactRefreshModule.default.configs.vite.plugins,
    },
    rules: {
      ...reactRefreshModule.default.configs.vite.rules,
    },
  },

  // ─── Node globals for configuration files ──────────────────────────
  //     Configuration files run in Node.js context and need access to
  //     Node globals (require, module, __dirname, process, etc.).
  //     Updated: webpack.config.js replaced by vite.config.ts;
  //     playwright.config.ts added for E2E visual regression testing.
  {
    files: [
      "eslint.config.cjs",
      "postcss.config.js",
      "vite.config.ts",
      "playwright.config.ts",
      ".stylelintrc.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
