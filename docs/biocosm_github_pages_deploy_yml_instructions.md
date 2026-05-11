# Biocosm GitHub Pages Deployment via GitHub Actions

## Goal

Deploy the `Neurotech-Hub/Biocosm` React/Vite app to GitHub Pages using a modern `.github/workflows/deploy.yml` workflow.

Do **not** use the older `gh-pages` package / branch deployment route unless this GitHub Actions route fails for a repository-permissions reason.

Target public URL:

```text
https://neurotech-hub.github.io/Biocosm/
```

---

## Assumptions

- Repository: `Neurotech-Hub/Biocosm`
- Default branch: `main`
- App tooling: React + Vite
- Static build output directory: `dist`
- Deployment target: GitHub Pages
- Pages source should be: **GitHub Actions**

---

## Required implementation steps

### 1. Confirm the app builds locally

From the repository root:

```bash
npm install
npm run build
```

Expected result:

```text
dist/
```

If the build fails, fix TypeScript, import, package, or environment-variable issues before continuing.

If a lockfile exists, prefer this in CI:

```bash
npm ci
```

If no lockfile exists, use:

```bash
npm install
```

---

### 2. Configure Vite base path

Open one of:

```text
vite.config.js
vite.config.ts
```

Ensure the Vite config includes:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Biocosm/',
})
```

The `base` value must exactly match the repository name, including capitalization:

```text
/Biocosm/
```

This is required because GitHub Pages serves the project site from a subpath.

Without this setting, the deployed page may load as a blank white page because built asset paths point to the wrong location.

---

### 3. Create the GitHub Actions workflow

Create this file:

```text
.github/workflows/deploy.yml
```

Recommended content:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build app
        run: npm run build

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

If `npm ci` fails because there is no lockfile, change the install step to:

```yaml
      - name: Install dependencies
        run: npm install
```

---

### 4. Enable GitHub Pages Actions deployment

In GitHub:

```text
Repository → Settings → Pages
```

Set:

```text
Source: GitHub Actions
```

Do not select `Deploy from a branch` for this route.

---

### 5. Push the changes

Commit and push:

```bash
git add vite.config.* .github/workflows/deploy.yml
git commit -m "Deploy Biocosm to GitHub Pages"
git push origin main
```

Then check:

```text
Repository → Actions → Deploy to GitHub Pages
```

Expected result:

```text
Workflow completes successfully
Site is published to https://neurotech-hub.github.io/Biocosm/
```

---

## Optional: SPA routing support

If the app uses React Router or any client-side route paths, direct browser refreshes may 404 on GitHub Pages.

Add:

```text
public/404.html
```

Contents:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>
      sessionStorage.redirect = location.href;
    </script>
    <meta http-equiv="refresh" content="0;URL='/Biocosm/'" />
  </head>
  <body></body>
</html>
```

Then add this near the start of the app entry file, usually one of:

```text
src/main.jsx
src/main.tsx
```

```js
const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;

if (redirect && redirect !== location.href) {
  history.replaceState(null, '', redirect);
}
```

Only add this if routing refreshes are a problem. If the app is a simple single-page app without path-based routes, this may not be needed.

---

## Environment variables

If the app uses environment variables, GitHub Pages receives them only at build time.

For Vite, client-exposed variables must start with:

```text
VITE_
```

Example:

```text
VITE_API_BASE_URL
```

Add required values in:

```text
Repository → Settings → Secrets and variables → Actions
```

Then expose them in the workflow build step if needed:

```yaml
      - name: Build app
        run: npm run build
        env:
          VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
```

Do not expose private API keys in a static frontend build. Anything beginning with `VITE_` is bundled into browser-visible code.

---

## Files expected to change

Minimum expected changes:

```text
vite.config.js
.github/workflows/deploy.yml
```

Possible additional changes:

```text
vite.config.ts
public/404.html
src/main.jsx
src/main.tsx
package-lock.json
```

Do **not** add `gh-pages` unless explicitly switching to the branch-based deployment method.

---

## Acceptance criteria

Deployment is complete when all are true:

- `npm run build` works locally.
- `dist/` is generated.
- `vite.config.*` includes `base: '/Biocosm/'`.
- `.github/workflows/deploy.yml` exists.
- GitHub Pages source is set to `GitHub Actions`.
- A push to `main` triggers the workflow.
- The workflow finishes successfully.
- The site loads at:

```text
https://neurotech-hub.github.io/Biocosm/
```

- Browser dev tools show no missing built assets such as:

```text
/assets/*.js
/assets/*.css
```

from the wrong root path.

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank white page | Missing or wrong Vite `base` | Use `base: '/Biocosm/'` |
| CSS/JS 404s | Asset paths built for root domain | Rebuild after setting Vite `base` |
| Workflow fails at `npm ci` | Missing or stale lockfile | Use `npm install` or commit updated lockfile |
| GitHub Pages says not configured | Pages source not set | Settings → Pages → Source → GitHub Actions |
| Refresh on a route 404s | GitHub Pages static hosting + SPA routing | Add optional `public/404.html` fallback |
| Env var undefined | Missing `VITE_` prefix or workflow env | Add `VITE_` var and pass it during build |

---

## Recommended developer-agent instruction

Implement GitHub Pages deployment for `Neurotech-Hub/Biocosm` using `.github/workflows/deploy.yml`, not the `gh-pages` package route. Configure Vite with `base: '/Biocosm/'`, create the GitHub Actions Pages workflow, ensure the app builds to `dist`, and verify the deployed site loads correctly at `https://neurotech-hub.github.io/Biocosm/`. Add SPA fallback support only if route refreshes produce 404 errors.
