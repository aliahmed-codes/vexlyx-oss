# GitHub Integration

Vexlyx uses one GitHub App per panel installation. Administrators create the App through GitHub's manifest flow or enter an existing App's credentials. Users then install that App on a personal account or organization and select repositories from the dashboard.

## GitHub App configuration

The API builds callback and webhook URLs from `API_BASE_URL` and refuses to start the manifest flow unless it is a public HTTPS URL. Request headers are never used to construct security-sensitive URLs.

The generated App requests repository Contents read access and Metadata read access. It subscribes to push events; GitHub also sends installation and installation-repository lifecycle events required to keep connections synchronized.

The App ID, slug, and client ID are stored as identifiers. The private key, client secret, and webhook secret are encrypted with the existing AES-256-GCM encryption helper. API responses expose only non-secret status fields.

## Installation linking

Before redirecting to GitHub, Vexlyx stores a random state value in Redis for ten minutes. The state is single-use and bound to the current Vexlyx user, session, and operation.

The App requests GitHub user authorization during installation. At the callback, Vexlyx exchanges the authorization code, calls `GET /user/installations`, and confirms the returned installation ID is accessible to that user. The GitHub user token is discarded after this check and is never stored.

## Repository authorization and tokens

Every installation, repository, and branch route first scopes the installation to the authenticated Vexlyx user. Repository IDs are resolved through the installation API again when connecting a project.

Vexlyx signs GitHub App JWTs with Node's built-in `crypto` module and exchanges them for installation tokens. Tokens are cached only in process memory until shortly before expiry. They are never stored in PostgreSQL, Redis, files, logs, or audit metadata.

## Clone and pull behavior

Installation tokens are passed to `git_manager.py` through stdin. The script exposes the token to Git through temporary process environment configuration and an HTTP authorization header. The repository remote remains the ordinary credential-free HTTPS clone URL, so `.git/config` never contains a token.

The build worker obtains a fresh installation token before every GitHub-backed fetch or pull. Manual repositories continue using their existing HTTPS or SSH/deploy-key path.

## Webhooks

`POST /api/webhooks/github-app` validates the raw request body with the encrypted App webhook secret. Invalid or missing signatures return 401. `x-github-delivery` values are claimed atomically in Redis for 24 hours to prevent duplicate deployments; failed processing releases the claim so GitHub can retry.

Push events are matched by numeric installation and repository IDs, then filtered by each project's configured branch. Installation suspension, uninstall, and repository removal mark affected projects disconnected without stopping their running containers.

The legacy per-project GitHub webhook remains available for manually connected projects.

## Local testing

GitHub cannot deliver callbacks or webhooks to localhost. Set `API_BASE_URL` to a public HTTPS tunnel endpoint and ensure it forwards to the API. Set `CORS_ORIGIN` to the dashboard URL. The Settings card reports whether the configured API URL is suitable before starting App creation.

## Extending providers

GitHub-specific authentication and REST behavior live under `apps/api/src/modules/github`. Generic source synchronization remains in the Git service and `git_manager.py`. A future provider should implement repository discovery and short-lived credential acquisition while continuing to call the same credential-safe Git runner.

## Verification

Run:

```bash
pnpm typecheck
pnpm test
python -m unittest tests/test_github_app_git_credentials.py
```

Live validation requires a public HTTPS panel and a GitHub account capable of creating and installing an App. Verify private cloning, branch filtering, duplicate delivery handling, suspension, repository removal, uninstall, and the absence of credentials in `.git/config`.
