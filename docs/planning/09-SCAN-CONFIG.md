# vacti - Configurable Scan Tool Options (2026-06-05)

> Make the VA scan deeply configurable from the GUI: per-tool options (nuclei User-Agent, tags,
> templates, rate; subfinder sources/extra; httpx/naabu options) and scan-scoping (skip a stage,
> exclude subdomains/paths) - exposed on an editable **Scan Profile**. Lands behind a green gate.
> Maps Feature-Parity 4.5 + Gap-Analysis §C.

## A. Data model - `scan_profiles.config` (jsonb)

Extend the existing `scan_profiles` row (tools/ports/severities/rate/timeout) with a single nullable
`config` jsonb holding the advanced knobs (one column → no migration churn as options grow):

```jsonc
{
  "userAgent": "Mozilla/5.0 …", // sent as -H 'User-Agent: …' to httpx + nuclei
  "headers": { "X-Bug-Bounty": "…" }, // extra request headers (profile-level; target headers still apply)
  "rateLimit": 150, // nuclei -rate-limit / httpx -rl
  "concurrency": 25, // nuclei -c / httpx -threads
  "retries": 1, // nuclei -retries
  "nucleiTags": ["cve", "exposure"], // nuclei -tags
  "nucleiTemplates": ["custom/…"], // nuclei -t
  "nucleiExcludeTags": ["dos", "intrusive"], // nuclei -exclude-tags (safety default)
  "excludeSubdomains": ["dev.x.com"], // dropped from the host list before httpx
  "extraArgs": { "nuclei": [], "httpx": [], "subfinder": [], "naabu": [] }, // escape hatch (allow-listed)
}
```

**Safety:** `extraArgs` is **allow-listed** per tool (only known-safe flags pass; anything else is
dropped + logged) so the UI can't inject arbitrary shell. Destructive nuclei tags (`dos`, `intrusive`,
`fuzzing`) are excluded by default unless explicitly enabled.

## B. Adapter wiring (`libs/recon`)

- `nucleiArgs(opts)` → already takes severities/tags/templates/headers; add `userAgent`, `rateLimit`,
  `concurrency`, `retries`, `excludeTags`, allow-listed `extraArgs`.
- `httpxArgs(headers, opts)` → add `userAgent`, `rateLimit`, `threads`, allow-listed `extraArgs`.
- `subfinderArgs` / `naabuArgs` → allow-listed `extraArgs` (subfinder provider-config/API keys are a
  later, separate item - keys belong in the encrypted vault, not the profile json).
- `pipeline.ts` → drop `config.excludeSubdomains` from the discovered/predefined host list before httpx;
  thread `config` into each stage. Skipping a stage already works via `tools.<name> = false`.

## C. UI - editable Scan Profiles

- New **/settings/profiles** (or `/profiles`) page: list profiles, create/edit with: name, tool toggles,
  ports, severities, rate/concurrency/retries, User-Agent, nuclei tags/templates/exclude-tags, exclude
  subdomains, extra-args (advanced, collapsible). Guarded by `modify_scan_config`.
- The New-scan dialog already lets you pick a profile; profiles now carry the full config.

## D. Tests

- Unit: arg builders honour each option + the allow-list drops unknown extra args; pipeline excludes
  the listed subdomains.
- e2e: create a profile with a custom User-Agent + excluded subdomain; start a scan with it.

## E. Out of scope (now)

subfinder provider API keys (needs a vault-backed provider-config file) - tracked separately; full
nuclei flag matrix (only the curated set + allow-listed extras).
