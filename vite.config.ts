import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vite 7 build configuration for Jenkins UI.
 *
 * Replaces webpack.config.js with a modern Vite-based build pipeline.
 * Preserves all entry points from the webpack configuration, migrated
 * from src/main/js/ (JavaScript) to src/main/tsx/ (React 19 + TypeScript).
 *
 * Key transformations from webpack.config.js:
 * - 18 webpack entry points mapped to 14 Vite rollup inputs
 *   (5 entries consolidated into the React component tree)
 * - sass-loader → css-loader → postcss-loader chain replaced by
 *   Vite's native Dart Sass + PostCSS integration
 * - babel-loader + handlebars-loader eliminated (Vite uses esbuild
 *   for TypeScript/JSX transform, Handlebars replaced by JSX)
 * - MiniCssExtractPlugin replaced by Vite's built-in CSS extraction
 * - CleanWebpackPlugin replaced by build.emptyOutDir
 * - splitChunks vendor cacheGroup preserved via manualChunks
 *
 * Output: war/src/main/webapp/jsbundles/ (same path for WAR compatibility)
 * Alias: @ → src/main/tsx (migrated from src/main/js)
 */
export default defineConfig({
  /**
   * Plugins.
   *
   * @vitejs/plugin-react enables:
   * - React 19 Fast Refresh for instant HMR during development
   * - Automatic JSX transform (replaces Babel loader from webpack)
   * - React 19 compiler optimizations
   */
  plugins: [react()],

  /**
   * Module resolution.
   *
   * The '@' alias maps to src/main/tsx, replacing the webpack alias
   * that pointed to src/main/js. This enables clean imports:
   *   import { Component } from "@/components/header/Header"
   *
   * Must be kept in sync with tsconfig.app.json paths:
   *   "@/*": ["src/main/tsx/*"]
   */
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/main/tsx"),
    },
  },

  /**
   * Build configuration.
   *
   * Replicates the webpack 5 multi-entry build using Vite's Rollup-based
   * bundling. All entry points are mapped from their original JS paths
   * to their new React 19 + TypeScript equivalents.
   */
  build: {
    // Output to the same directory as webpack for WAR packaging compatibility.
    // Jelly shell views reference bundles from /jsbundles/ via <script> tags.
    outDir: path.resolve(__dirname, "war/src/main/webapp/jsbundles"),

    // Clean the output directory before each build (replaces CleanWebpackPlugin)
    emptyOutDir: true,

    // Generate source maps for production debugging
    // Equivalent to webpack devtool: "source-map" in production mode
    sourcemap: true,

    rollupOptions: {
      /**
       * Multi-entry input configuration.
       *
       * Maps all webpack entry points to their new React 19 + TypeScript
       * equivalents. Entry keys preserve the original naming convention
       * to maintain predictable output filenames for Jelly <script>/<link>
       * tag references.
       *
       * Consolidated entries (absorbed into the React component tree):
       *   - keyboard-shortcuts → useKeyboardShortcut hook (imported in main.tsx)
       *   - sortable-drag-drop → React DnD within components
       *   - section-to-sidebar-items → SidePanel.tsx layout component
       *   - section-to-tabs → TabBar.tsx layout component
       *   - pages/project/builds-card → integrated into job page components
       */
      input: {
        // Core application entry — bootstraps React 19 root with providers
        // Replaces: src/main/js/app.js
        app: path.resolve(__dirname, "src/main/tsx/main.tsx"),

        // Plugin setup wizard — multi-step onboarding flow
        // Replaces: src/main/js/pluginSetupWizard.js + pluginSetupWizard.scss
        pluginSetupWizard: path.resolve(
          __dirname,
          "src/main/tsx/pages/setup-wizard/SetupWizard.tsx",
        ),

        // Plugin manager — browse, search, install plugins
        // Replaces: src/main/js/plugin-manager-ui.js
        "plugin-manager-ui": path.resolve(
          __dirname,
          "src/main/tsx/pages/plugin-manager/PluginManagerIndex.tsx",
        ),

        // New item creation page
        // Replaces: src/main/js/add-item.js + add-item.scss
        "add-item": path.resolve(
          __dirname,
          "src/main/tsx/pages/job/NewJob.tsx",
        ),

        // Node management page
        // Replaces: src/main/js/pages/computer-set
        "pages/computer-set": path.resolve(
          __dirname,
          "src/main/tsx/pages/computer/ComputerSet.tsx",
        ),

        // Main dashboard view
        // Replaces: src/main/js/pages/dashboard
        "pages/dashboard": path.resolve(
          __dirname,
          "src/main/tsx/pages/dashboard/Dashboard.tsx",
        ),

        // System information diagnostics page
        // Replaces: src/main/js/pages/manage-jenkins/system-information
        "pages/manage-jenkins/system-information": path.resolve(
          __dirname,
          "src/main/tsx/pages/manage-jenkins/SystemInformation.tsx",
        ),

        // Cloud configuration page
        // Replaces: src/main/js/pages/cloud-set/index.js + index.scss
        "pages/cloud-set": path.resolve(
          __dirname,
          "src/main/tsx/pages/cloud/CloudSet.tsx",
        ),

        // Manage Jenkins admin landing page
        // Replaces: src/main/js/pages/manage-jenkins
        "pages/manage-jenkins": path.resolve(
          __dirname,
          "src/main/tsx/pages/manage-jenkins/ManageJenkins.tsx",
        ),

        // Sign-in and registration page
        // Replaces: src/main/js/pages/register
        "pages/register": path.resolve(
          __dirname,
          "src/main/tsx/pages/security/SignInRegister.tsx",
        ),

        // Page header component — scroll effects, breadcrumbs, navigation
        // Replaces: src/main/js/components/header/index.js
        header: path.resolve(
          __dirname,
          "src/main/tsx/components/header/Header.tsx",
        ),

        // Table row multi-select controller
        // Replaces: src/main/js/components/row-selection-controller
        "components/row-selection-controller": path.resolve(
          __dirname,
          "src/main/tsx/components/row-selection-controller/RowSelectionController.tsx",
        ),

        // SCSS-only entries — produce standalone CSS bundles loaded via
        // <link> tags in Jelly shell templates. These entries generate CSS
        // output files at predictable paths (simple-page.css, styles.css).
        "simple-page": path.resolve(
          __dirname,
          "src/main/scss/simple-page.scss",
        ),
        styles: path.resolve(__dirname, "src/main/scss/styles.scss"),
      },

      output: {
        // Predictable entry filenames without content hashing.
        // Jelly shell templates reference bundles by fixed paths:
        //   <script src="${rootURL}/jsbundles/app.js"></script>
        entryFileNames: "[name].js",

        // Shared chunk filenames (e.g., vendors.js)
        chunkFileNames: "[name].js",

        // Asset file naming with font directory organization.
        // Replicates webpack's asset/resource generator for fonts.
        assetFileNames(assetInfo) {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          // Route font files to fonts/ subdirectory
          if (/\.(woff2?|ttf|eot)$/i.test(name)) {
            return "fonts/[name].[ext]";
          }
          // CSS and other assets use flat naming
          return "[name].[ext]";
        },

        /**
         * Vendor chunk splitting.
         *
         * Replicates webpack's splitChunks.cacheGroups.commons:
         *   test: /[\\/]node_modules[\\/]/
         *   name: "vendors"
         *   chunks: "all"
         *
         * All node_modules dependencies are bundled into a single 'vendors'
         * chunk (vendors.js) enabling efficient browser caching across
         * all entry points.
         */
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            return "vendors";
          }
        },
      },
    },
  },

  /**
   * CSS/SCSS configuration.
   *
   * Vite handles SCSS compilation natively via Dart Sass — no sass-loader,
   * css-loader, or style-loader needed. PostCSS is applied automatically
   * from postcss.config.js (postcss-preset-env with media-query-ranges).
   *
   * The 69 SCSS files in src/main/scss/ are preserved unchanged and
   * consumed by React components via className props, maintaining
   * visual parity with the Jelly-rendered UI.
   */
  css: {
    preprocessorOptions: {
      scss: {
        // Suppress deprecation warnings from third-party dependencies
        // (e.g., Bootstrap 3.4.1 under .bootstrap-3 namespace) that use
        // legacy Sass features. Vite 7 uses the modern Dart Sass compiler
        // API by default — no explicit api selection is needed.
        quietDeps: true,
      },
    },
    // Enable CSS source maps in development for style debugging
    devSourcemap: true,
  },

  /**
   * Development server configuration.
   *
   * Proxies Stapler REST API and Jenkins backend endpoints to a local
   * Jenkins instance during development. This ensures CSRF crumbs,
   * session cookies, and authentication headers pass through correctly
   * to the Stapler endpoints consumed by React Query hooks.
   *
   * Start Jenkins on port 8080, then run 'yarn dev' for the Vite
   * dev server with React Fast Refresh on port 5173.
   */
  server: {
    port: 5173,
    proxy: {
      // Stapler JSON API endpoints (appended as /api/json to model URLs)
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // CSRF crumb issuer — consumed by useCrumb hook
      "/crumbIssuer": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Plugin manager endpoints — install, status, search, available
      "/pluginManager": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Update center connectivity check
      "/updateCenter": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Setup wizard endpoints — first user, instance config, proxy
      "/setupWizard": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Computer (node) management endpoints
      "/computer": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Jenkins management endpoints
      "/manage": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Job and build endpoints
      "/job": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // View endpoints
      "/view": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
