# Tesla Powerwall + Spirit of Fire — architecture and rebuild guide

Last updated: 2026-08-29
Live repo: klopikkon/klopikkon-com
Timer: cron-job.org workflow_dispatch (GitHub on.schedule is off)

Do not put private keys, refresh tokens, or PATs in this file.

Full copy also lives in the chat that generated this. If this file is short, use the chat version.

## Who holds what

- Domain / Pages: klopikkon.com CNAME + public key at /.well-known/appspecific/com.tesla.3p.public-key.pem
- Tesla developer: Client ID, Client secret (partner register only), NA Fleet audience
- GitHub Actions secrets: TESLA_CLIENT_ID, TESLA_REFRESH_TOKEN, TESLA_PRIVATE_KEY, ENERGY_SITE_ID, TESLA_VEHICLE_ID, GH_PAT, optional TESLA_CLIENT_SECRET and ENERGY_DASH_PASSWORD
- cron-job.org: GH_PAT only (Bearer header). No Tesla secrets.
- Phone Tesla app: virtual key pair at tesla.com/_ak/klopikkon.com
- Offline password manager: private PEM, refresh token, client secret, PAT

See repository files:
- .github/workflows/tesla-powerwall.yml
- energy/car_step.sh
- energy/car_presence.json
- .github/workflows/tesla-partner-register.yml
- callback.html
