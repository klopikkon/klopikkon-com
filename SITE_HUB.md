# Site hub (passworded root)

Live: https://klopikkon.com/

- Root `index.html` is a password gate (PBKDF2 100k + AES-GCM), same pattern as `/energy/` and `/amt/prospects/`.
- Encrypted directory: `hub.enc` (no plaintext link list in git beyond this doc’s process).
- Hub itself is `noindex,nofollow`.

## Secrets (never commit)

- `SITE_HUB_PASSWORD` — unlock password
- `SITE_HUB_SALT` — hex salt (also public as `SALT_HEX` in `index.html`)

## Standing rule for every bot

When you add a **new live path** on this GitHub Pages site (public or unlisted):

1. Add a card to the hub sites list.
2. Re-encrypt and publish `hub.enc` (update `hub.json` locally → encrypt with `SITE_HUB_PASSWORD` / `SITE_HUB_SALT` → commit only `hub.enc` + `index.html` if needed).
3. Do **not** put hub/prospects/webhook/Tesla passwords in git, Drive docs that sync public, or Pages plaintext.

## Current access labels

- **public** — fine to share widely (e.g. `/hello/`)
- **unlisted** — URL works, not linked from public nav / noindex where applicable
- **passworded** — separate unlock on that path (e.g. `/energy/`, `/amt/prospects/`)
