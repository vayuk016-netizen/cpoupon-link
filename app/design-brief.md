# Coupon Link Vault: Design Brief

- **Design read:** A private, calm, precise personal utility for managing time-sensitive Gemini Pro 18-month redemption links, designed to make the next action obvious without implying control over provider expiry rules.
- **Concept spine:** Archive dossier: every coupon is a small, traceable record with source, dates, status, and a clear next action.
- **Delivery tier:** Editorial utility: crisp hierarchy, strong spacing, responsive dense data surfaces, micro-interactions only.
- **Locked palette:** Pristine cool light: background `#F5F7FB`, surface `#FFFFFF`, ink `#202938`, muted text `#667085`, border `#DDE3ED`, one restrained cobalt accent `#3D59B8`. The accent is reserved for primary actions and active navigation; semantic statuses use accessible neutral/semantic tones, not additional brand accents.
- **Locked type:** Satoshi-like sans for display and body, system sans fallback; system monospace for dates and metadata. Sans-only because this is a practical data utility, not an editorial or luxury brand.
- **Animation mode:** non-animated: user picked Non-animated at intake.
- **Signature interaction:** A keyboard-accessible archive form, searchable records, status filters, and a record detail drawer-like card state. No autoplay, scroll-driven animation, or mandatory camera journey; short hover/focus transitions only, with reduced-motion support.
- **Section plan:** (1) compact navigation and hero overview, centered instrument composition; (2) add-coupon workspace with asymmetric form and safety note; (3) archive list with filters/search and record actions; (4) expiry overview and practical usage notes in an oversized metrics strip plus narrow side-rail note. Each section uses a distinct layout family.
- **Asset plan:** A custom-authored vector cover illustration and favicon because image-generation tools are unavailable on the current plan; a bespoke archive tray motif and abstract index-card system carried through the UI. Dense functional controls use accessible inline SVG iconography.
- **CTA inventory:** `Save coupon` (primary form submission), `Add a coupon` (empty state / hero action), `Open link` (record action), `Copy link` (record action), `Mark activated` (status action), `Export backup` (local JSON export), `Import backup` (local JSON import), `Delete record` (destructive action with confirmation). Each action has distinct semantics and styling.
- **Storage contract:** Coupon records stay in the current browser profile using IndexedDB; no coupon data is sent to the server. Provide JSON backup/restore. Data does not automatically sync to other browsers or devices.
- **Truth contract:** Expiry status is based only on dates the user enters. The app does not verify a provider's live token status, extend a link's lifetime, or guarantee redemption.
- **Accessibility:** Keyboard-operable forms and dialogs, visible focus rings, labels, high contrast, reduced-motion support, responsive desktop/mobile layouts.
- **Privacy:** No analytics, no account sign-in, no third-party coupon validation, no collection of Google credentials or one-time codes.
