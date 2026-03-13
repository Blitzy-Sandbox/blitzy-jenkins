<a href="https://jenkins.io">
    <img width="400" src="https://www.jenkins.io/images/jenkins-logo-title-dark.svg" alt="Jenkins logo"> 
</a>

[![Jenkins Regular Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.jenkins.io%2Fchangelog%2Fbadge.json)](https://www.jenkins.io/changelog)
[![Jenkins LTS Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.jenkins.io%2Fchangelog-stable%2Fbadge.json)](https://www.jenkins.io/changelog-stable)
[![Docker Pulls](https://img.shields.io/docker/pulls/jenkins/jenkins.svg)](https://hub.docker.com/r/jenkins/jenkins/)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/3538/badge)](https://bestpractices.coreinfrastructure.org/projects/3538)
[![Reproducible Builds](https://img.shields.io/badge/Reproducible_Builds-ok-green)](https://maven.apache.org/guides/mini/guide-reproducible-builds.html)
[![Gitter](https://img.shields.io/gitter/room/jenkinsci/jenkins)](https://app.gitter.im/#/room/#jenkinsci_jenkins:gitter.im)

---

# Table of Contents

- [About](#about)
- [What to Use Jenkins for and When to Use It](#what-to-use-jenkins-for-and-when-to-use-it)
- [Downloads](#downloads)
- [Getting Started (Development)](#getting-started-development)
- [Frontend Architecture](#frontend-architecture)
- [Testing](#testing)
- [Source](#source)
- [Contributing to Jenkins](#contributing-to-jenkins)
- [News and Website](#news-and-website)
- [Governance](#governance)
- [Adopters](#adopters)
- [License](#license)

---

# About

In a nutshell, Jenkins is the leading open-source automation server.
Built with Java, it provides over 2,000 [plugins](https://plugins.jenkins.io/) to support automating virtually anything,
so that humans can spend their time doing things machines cannot.

# What to Use Jenkins for and When to Use It

Use Jenkins to automate your development workflow, so you can focus on work that matters most. Jenkins is commonly used for:

- Building projects
- Running tests to detect bugs and other issues as soon as they are introduced
- Static code analysis
- Deployment

Execute repetitive tasks, save time, and optimize your development process with Jenkins.

# Downloads

The Jenkins project provides official distributions as WAR files, Docker images, native packages and installers for platforms including several Linux distributions and Windows.
See the [Downloads](https://www.jenkins.io/download) page for references.

For all distributions Jenkins offers two release lines:

- [Weekly](https://www.jenkins.io/download/weekly/) -
  Frequent releases which include all new features, improvements, and bug fixes.
- [Long-Term Support (LTS)](https://www.jenkins.io/download/lts/) -
  Older release line which gets periodically updated via bug fix backports.

Latest releases:

[![Jenkins Regular Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.jenkins.io%2Fchangelog%2Fbadge.json)](https://www.jenkins.io/changelog)
[![Jenkins LTS Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.jenkins.io%2Fchangelog-stable%2Fbadge.json)](https://www.jenkins.io/changelog-stable)

# Getting Started (Development)

For more information on setting up your development environment, contributing, and working with Jenkins internals, check the [contributing guide](CONTRIBUTING.md) and the [Jenkins Developer Documentation](https://www.jenkins.io/doc/developer/).

## React Frontend Development

The Jenkins core UI is built with **React 19** and **TypeScript**, using **Vite 7** as the build tool. To get started with frontend development:

### Prerequisites

- **Node.js** 24+ (see the `engines` field in `package.json`)
- **Yarn** 4.12.0 (enabled via Corepack: `corepack enable`)

### Development Workflow

```bash
# Install dependencies
yarn install

# Start Vite dev server with Hot Module Replacement (HMR)
yarn dev

# Production build
yarn build

# Type-check TypeScript without emitting
yarn typecheck
```

### Linting

```bash
# Run ESLint + Prettier + Stylelint
yarn lint

# Auto-fix linting issues
yarn lint:fix

# Lint SCSS files only
yarn lint:css
```

# Frontend Architecture

The Jenkins core frontend uses **React 19** with **TypeScript** and **Vite 7** as the build tool:

| Directory                        | Description                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `src/main/tsx/`                  | React 19 + TypeScript frontend source (components, pages, hooks, providers, API layer) |
| `src/main/scss/`                 | SCSS styling (preserved from the original architecture, consumed by React components)  |
| `war/src/main/webapp/jsbundles/` | Vite build output (production bundles)                                                 |
| `e2e/`                           | Playwright E2E and visual regression tests                                             |
| `docs/`                          | Migration documentation                                                                |

Key technologies:

- **React 19** — Component-based UI with hooks, Actions API, and concurrent rendering
- **TypeScript 5.8** — Strict type checking across all frontend code
- **Vite 7** — Fast development server with HMR and optimized production builds
- **TanStack React Query 5** — Server state management for Stapler REST API endpoints
- **Vitest** — Unit testing framework (Vite-native)
- **Playwright** — E2E testing and visual regression via `toHaveScreenshot()`

For detailed migration documentation, see:

- [`docs/user-flows.md`](docs/user-flows.md) — User flow definitions and test scenarios
- [`docs/functional-audit.md`](docs/functional-audit.md) — Per-view migration status and screenshot diff results

# Testing

## Unit Tests

Unit tests use [Vitest](https://vitest.dev/) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/):

```bash
# Run all unit tests
yarn test

# Run tests in watch mode
yarn test:watch
```

## E2E and Visual Regression Tests

End-to-end tests use [Playwright](https://playwright.dev/) for functional flow validation and visual regression testing:

```bash
# Run all E2E tests
yarn test:e2e

# Run E2E tests with interactive UI
yarn test:e2e:ui
```

Visual regression tests use Playwright's built-in `toHaveScreenshot()` for pixel-by-pixel comparison between baseline and refactored UI captures. Baseline screenshots are stored in `docs/screenshots/`.

# Source

Our latest and greatest source of Jenkins can be found on [GitHub](https://github.com/jenkinsci/jenkins). Fork us!

# Contributing to Jenkins

New to open source or Jenkins? Here’s how to get started:

- Read the [Contribution Guidelines](CONTRIBUTING.md)
- Check our [good first issues](https://github.com/jenkinsci/jenkins/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
- Join our [Gitter chat](https://app.gitter.im/#/room/#jenkinsci_newcomer-contributors:gitter.im) for questions and help

For more information about participating in the community and contributing to the Jenkins project,
see [this page](https://www.jenkins.io/participate/).

Documentation for Jenkins core maintainers is in the [maintainers guidelines](docs/MAINTAINERS.adoc).

# News and Website

All information about Jenkins can be found on our [official website](https://www.jenkins.io/), including documentation, blog posts, plugin listings, community updates, and more.

Stay up-to-date with the latest Jenkins news, tutorials, and release notes:

- [Jenkins Blog](https://www.jenkins.io/blog/)
- [Documentation](https://www.jenkins.io/doc/)
- [Plugins Index](https://plugins.jenkins.io/)
- [Events](https://www.jenkins.io/events/)

Follow Jenkins on social media to stay connected with the community:

- [Twitter / X](https://x.com/jenkinsci)
- [YouTube](https://www.youtube.com/@jenkinscicd)
- [LinkedIn](https://www.linkedin.com/company/jenkins-project/)

# Governance

The Jenkins project is governed by an open source community.
To learn more about the governance structure, project leadership, and how decisions are made, visit the [Governance Page](https://www.jenkins.io/project/governance/).

# Adopters

Jenkins is trusted by **millions of users** and adopted by **thousands of companies** around the world — from startups to enterprises — to automate their software delivery pipelines.

Explore the [Adopters Page](https://www.jenkins.io/project/adopters/) and https://stories.jenkins.io to see:

- Companies and organizations using Jenkins
- Success stories and case studies
- How Jenkins is used in different industries

> If your company uses Jenkins and you'd like to be featured, feel free to [submit your story](https://www.jenkins.io/project/adopters/contributing/#share-your-story)!

# License

Jenkins is **licensed** under the **[MIT License](LICENSE.txt)**.
