# Planned production deployment

## Binding decision

When Swaggr is ready for release, its source code will live in a GitHub repository. A push directly to `main` will trigger GitHub Actions, which will build and publish the application to Cloudflare Pages. The project does not use branches as part of its workflow.

Neither the GitHub repository nor the Cloudflare Pages project has been created yet. This document records the intended target; it does **not** authorize creating either service or publishing the application before the owner asks for that work.

## Development constraints now

- Keep builds non-interactive and runnable with `npm run build`.
- Do not commit credentials, Cloudflare API tokens, GitHub tokens, or production configuration. Runtime secrets must be supplied through Cloudflare's configuration when the deployment is set up.
- Treat the current private Sites deployment as a development preview only, not as the future production route.
- Before adding deployment-specific configuration, verify that the current Vinext output is compatible with Cloudflare Pages and determine whether Pages Functions / Workers are required. Do not silently assume that a static-only Pages build is sufficient.

## Future implementation checklist

1. Create the GitHub repository with `main` as its working and production branch.
2. Create the Cloudflare Pages project and decide its production URL / custom domain.
3. Confirm the Cloudflare build command, output directory, and any required Pages Functions or Worker integration against the then-current Vinext documentation.
4. Add a GitHub Actions workflow triggered by pushes to `main`.
5. Configure deployment authentication using the approved GitHub-to-Cloudflare mechanism, with secrets stored only in GitHub/Cloudflare.
6. Validate the deployed app, including PWA manifest and service-worker delivery over HTTPS.

## Open decisions

- GitHub owner and repository name.
- Cloudflare account and Pages project name.
- Public domain and whether the repository itself will be public.
