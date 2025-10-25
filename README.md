# Vercel-backed saving to GitHub

This project removes images and adds a Vercel Serverless Function to commit answers to your GitHub repository.

## Deploy the API on Vercel
1. Create a new Vercel project and import **this folder** (or just the `api/` dir into your existing Vercel app).
2. In Vercel → Project Settings → **Environment Variables**, add:
   - `GITHUB_TOKEN`  (fine-grained PAT with **Contents: Read & write** to target repo)
   - `REPO_OWNER`    (e.g., your GitHub username or org)
   - `REPO_NAME`     (repo name to store answers)
   - `REPO_BRANCH`   (optional, defaults to `main`)
   - `CORS_ALLOW_ORIGIN` (optional; set to your GitHub Pages origin for tighter security, e.g. `https://<user>.github.io`)

3. Deploy. Note your deployment URL (e.g., `https://your-app.vercel.app`).

## Wire the frontend
- Edit `assets/ui.js` → set `VERCEL_BASE_URL` to your deployment URL.

## Use it
- Open the site’s course page → click **Save to GitHub**.
- A new file appears in your repo at `answers/<course-id>/<timestamp>.json`.

Security tips:
- Use a repo-scoped fine-grained token.
- Set `CORS_ALLOW_ORIGIN` to your exact GitHub Pages URL.
