# Agency Access Request — pholio-landing Handoff

**Owner:** separate `pholio-landing` agent.
**Do not implement this public page in `pholio-app`.** This app repo now provides the receiving API and authenticated agency setup workflow only.

## Route to build in `pholio-landing`

Recommended public route:

- `/agency/request-access`

Legacy app route `/partners` now redirects to this marketing-owned request page using `MARKETING_SITE_URL`.

## API endpoint supplied by `pholio-app`

Submit the landing form to:

```http
POST https://app.pholio.studio/api/public/agency-access-requests
Content-Type: application/json
```

Development target:

```http
POST http://localhost:3000/api/public/agency-access-requests
```

The app route is rate-limited, validates the payload, stores only request metadata, and deliberately rejects the idea of uploading roster files, talent data, contracts, billing records, or minor-specific data on the public page.

## Payload shape

Required:

```json
{
  "agencyName": "Example Management",
  "websiteUrl": "https://example.com",
  "primaryMarketCity": "New York",
  "agencyType": "Modeling agency",
  "primaryBoards": ["Women", "Men", "Commercial"],
  "rosterSizeRange": "76-200",
  "teamSizeRange": "6-15",
  "firstUseCases": ["Roster/boards", "Open calls"],
  "contactName": "Avery Booker",
  "contactEmail": "avery@example.com",
  "contactRole": "Head booker"
}
```

Optional:

```json
{
  "primaryMarketCountry": "United States",
  "additionalLocations": ["Los Angeles", "Paris"],
  "currentSystem": "Spreadsheets",
  "migrationInterest": "unsure",
  "contactPhone": "+1 555 0100",
  "timezone": "America/New_York",
  "heardFrom": "Referral",
  "notes": "We run commercial and new-faces boards."
}
```

## Design direction

Use the agency command-center language, not talent onboarding:

- Warm cream canvas, white paper form surface, thin ink/gold rules.
- Playfair Display for the masthead/editorial title only; Inter for form controls and field labels.
- Rectangular 8–12px controls.
- No hero eyebrow, pill chips, feature badges, gradient text, glass cards, generic icon-card grids, or decorative AI ornaments.
- Primary CTA: **Submit request**.
- Avoid “start trial,” “create account,” “book demo,” and any copy that suggests instant access.

## Confirmation copy

> Your request has been received. Our team reviews agency access manually. If there is a fit, we will email next steps or schedule a short call before provisioning your login.
