# StoryCam Agent Guide

## Project Context

StoryCam is an AI private story-theater product for ordinary users. It is not an industrial short-drama production backend.

The first product direction is a Web-based private mini-theater camera:

- Users enter a private idea, emotion, memory, relationship, or character fantasy.
- StoryCam first turns it into a readable script, character assets, and scene assets.
- After the user confirms those assets, StoryCam generates a storyboard script and 1-3 core storyboard images.
- Each core storyboard image can open an expansion canvas. The selected storyboard stays in the center, and surrounding storyboard/shot cards generate progressively.
- Each confirmed core storyboard group generates one short Seedance 2.0 video clip in the MVP.
- The system then recommends stitching the confirmed clips into the final 10-15 second work.

## Documentation Rules

All persistent project context must live under `docs/`.

Use `docs/README.md` as the index before starting product, design, engineering, deployment, or research work. Do not treat `~/.gstack/` artifacts as canonical project documentation. They are tool cache and session output only.

## Current Canonical Docs

- `docs/product-vision.md`: original product vision and positioning.
- `docs/product/storycam-film-machine-design.md`: current office-hours product design.
- `docs/research/shanyin-director-master-source.md`: source notes for the Shanyin Director Master reference.
- `docs/research/shanyin-director-master/`: local reference snapshot for director methodology.
- `docs/design/storycam-ui-design.md`: single practical UI design brief for the first Web prototype and generated UI reference image.

## Working Rules

- Keep the first version Web-first unless the docs are explicitly revised.
- Do not design the first version as a mobile-only app.
- Preserve the core loop: input story idea -> generate script, character assets, and scene assets -> user confirms -> generate storyboard script and 1-3 core storyboard images -> expand selected storyboard images -> generate one Seedance 2.0 clip per confirmed core storyboard group -> confirm clips -> system suggests stitching -> final video.
- Do not skip the script and asset confirmation stage. The user should feel the story, people, and places taking shape before video generation starts.
- Treat core storyboard images as clip groups, not isolated decorative still images.
- MVP default is 1-3 core storyboard groups. A single group can be enough; three groups is the upper bound for the first version.
- Do not assume every expanded storyboard card triggers a separate video model call. Expanded cards are guidance inside the parent storyboard group by default.
- Seedance 2.0 calls in the MVP equal the number of confirmed core storyboard groups, typically 1-3.
- Keep the final video target at 10-15 seconds by shortening per-group clips: one group can be 8-12 seconds, two groups can be 5-7 seconds each, and three groups can be 4-5 seconds each.
- Before implementation planning, clarify the MVP artifact structure: script, character assets, scene assets, storyboard script, core storyboard groups, expanded storyboard cards, clip prompt packets, generated clips, stitch suggestion, final work.
- Use the Shanyin Director Master reference as the starting point for StoryCam's internal director brain. Do not expose its professional workflow directly to ordinary users.
- Translate Shanyin's method into product primitives: director tone -> lightweight choices, rhythm planning -> generation stages, shot groups -> core storyboard groups, nine-column storyboard -> internal shot data, Double Check -> quality checks.
