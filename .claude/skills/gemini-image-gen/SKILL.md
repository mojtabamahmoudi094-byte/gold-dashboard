---
name: gemini-image-gen
description: "Generate original still images (Telegram post graphics, icons, cards) via Google Gemini image models — not screenshots. Triggers on: generate an image for a Telegram post, make original graphics/icon for a report, need a custom image instead of a website screenshot."
---

> ⚠️ BLOCKED as of 2026-07-16: this project's `GEMINI_API_KEY` has free-tier quota **0** for every image model (`gemini-3.1-flash-image`, `gemini-3-pro-image`, `imagen-4.0-*`) — confirmed via a live test call (HTTP 429, `generate_content_free_tier_requests limit: 0`). Image generation requires Google Cloud billing enabled on this API key's project. Do not attempt to use this skill for a live Telegram post until billing is confirmed enabled — check with the user first (cost decision), per [[feedback_api_quota_warning]].

Source: adapted from https://github.com/calesthio/generative-media-skills (MIT), `providers/image-generation/google-gemini-image`.

This project already has `GEMINI_API_KEY` (see [[reference_gemini_key_reuse]], shared with the bourse-analyst RAG chat). Once billing is enabled, reuse the same key here — no new secret needed.

## Model Selection Matrix

| Model | Best Use | Avoid When |
|-------|----------|-----------|
| **gemini-3.1-flash-image** | Default generalist; multi-reference, grounding | Extreme latency/cost constraints |
| **gemini-3.1-flash-lite-image** | High-volume exploration, thumbnails (1K only) | Brand work, final delivery, current facts |
| **gemini-3-pro-image** | Complex layouts, dense copy, localization | Bulk work; still requires exact QA |
| ~~gemini-2.5-flash-image~~ | Migration only | shutdown earliest 2026-10-02 |

**Production heuristic:** start with `gemini-3.1-flash-image` unless a specific constraint points elsewhere.

## Prompt as Contract

Write prompts in positive, concrete language specifying:

1. Deliverable and purpose (e.g. "Telegram post header card, 16:9")
2. Primary subject and action
3. Reference-role mapping if using input images (identity, object, style — max 14, but fewer is better)
4. Composition, camera, crop-safe regions
5. Materials, lighting, palette, style
6. Exact copy in quotation marks (Persian text rendering is unreliable — see below)
7. Invariants (what must not change)
8. Output spec: count, aspect ratio, size, format

Avoid vague quality descriptors ("masterpiece, 8K"); prefer concrete scene description.

## Persian Text Warning

**No exact-copy guarantee exists for rendered text, and this is worse for Persian/Arabic script than Latin.** Do not rely on the model to render correct Persian numerals, diacritics, or RTL layout inside the image.

- Generate the image **without** embedded Persian text (background/graphic only)
- Composite Persian text/numbers deterministically in post (existing chart/card generation code), not via the model
- This matches the existing convention for the monthly Codal photo cards (see [[project_codal_photo_cards]])

## Aspect Ratio and Resolution

- Default without input image: 1:1; with input image, output tends to match input aspect
- `gemini-3.1-flash-image`: 0.5K, 1K, 2K, 4K — ratios include `1:1`, `4:3`, `16:9`, `21:9`
- Draft at 1K, approve, then regenerate at final resolution

## Safety, Rights, Provenance

- All Gemini-generated images carry SynthID watermark + C2PA content credentials — do not strip to misrepresent as human-made
- Do not generate images of real people (politicians, executives, analysts) without consent — relevant since market reports sometimes reference public figures
- Unpaid-tier data may be used to improve Google's products; do not submit confidential data (not applicable here since generation is currently blocked anyway)

## Minimal Example Call (once billing enabled)

```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"<prompt, no embedded Persian text>"}]}]}'
```

Response `candidates[].content.parts[].inlineData.data` is base64 image bytes.
