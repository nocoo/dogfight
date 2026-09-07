# Dogfight logo usage

The identity is titanium f-22 desk model caught in a banking turn. It follows the reviewed Hexly material study `2026-09-07-01`, finishing `02`.

## Asset roles

- `logo.png`: exact 2048 × 2048 transparent foreground, free of the backdrop and cast shadow.
- `assets/brand/icon.png`: square presentation for large cards and platforms that apply their own mask.
- `assets/brand/icon-rounded.png`: large README and gallery presentation.
- `assets/brand/background.png`: independent banking vectors field.

Small header/sidebar marks and favicons use the transparent foreground without an extra tile or circular CSS mask. Touch/PWA icons use the opaque square presentation. Source hashes and provenance live in `assets/brand/source.json`. Regenerate application sizes with `uv run --with pillow python assets/brand/generate.py`; roles are recorded in `usage.json` and checksums in `derivatives.json`.

## Consumers

- index.html

## Study

[Individual comparison](https://hexly.ai/logos/dogfight) · [Complete generation archive](https://github.com/nocoo/hexly.ai/tree/main/artwork/logo-family/dogfight/2026-09-07-01) · [Shared usage SOP](https://github.com/nocoo/hexly.ai/blob/main/docs/07-logo-usage-sop.md)
