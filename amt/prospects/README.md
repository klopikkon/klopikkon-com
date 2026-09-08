# AMT prospects (unlisted + password)

Live: https://klopikkon.com/amt/prospects/

- `index.html` — lock screen + searchable list (PBKDF2 100k + AES-GCM), same pattern as `/energy/`.
- `prospects.enc` — encrypted JSON blob. No plaintext accounts in git.
- `publish.py` — encrypt a JSON file and push `prospects.enc` to main.

## JSON shape (scout export)

```json
{
  "updated_at": "2026-09-08T00:00:00Z",
  "status": "ok",
  "note": "optional",
  "accounts": [
    {
      "company": "Example Pty Ltd",
      "region": "AU",
      "country": "Australia",
      "segment": "AU pub",
      "why_sell": "why AMT fits",
      "geography": "Melbourne CBD",
      "address": "",
      "contact_names": "Name — role",
      "contact_emails": "public@example.edu.au",
      "contact_phones": "",
      "contact_path": "https://…",
      "current_customer": false,
      "incumbent": "DC Chemicals",
      "modality": "LNP/mRNA",
      "notes": "optional leftover",
      "source": "https://…",
      "source_year": 2026
    }
  ]
}
```

Card sections: Why sell (`why_sell`) · Company (`geography`/`address`/`region`/`country`) · Contacts (`contact_*`) · Category (`segment`/`current_customer`/`incumbent`/`modality`). Empty fields stay hidden. Legacy `notes`-only rows still render a Notes block.

Segments examples: `AU pub`, `US-EU scale`, `AU-NZ vet`.

## Password / salt

- Salt is public in `index.html` (`SALT_HEX`) — that is normal for this pattern.
- Password and salt hex for republish live only in env / GitHub Actions secrets:
  - `AMT_PROSPECTS_PASSWORD`
  - `AMT_PROSPECTS_SALT`
  - `GH_PAT`
- Never commit the password. Never put webhook secrets here.
- Source of truth for the list: AMT account scout Drive folder **AMT accounts**. When it updates, export JSON and run `publish.py`.

## Do not

- Link this page from `/hello`, root, or public `/amt/` nav.
- Flash plaintext before unlock (`#dash` stays `hidden` until decrypt succeeds).
