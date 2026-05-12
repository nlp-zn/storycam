# Design

StoryCam's first UI should feel like a private mini-theater camera: dark, cinematic, emotionally direct, and task-focused.

## Principles

- Build the actual guided creation flow, not a landing page.
- Keep the first version Web-first.
- Show story-world confirmation before storyboard or video generation.
- Treat the core storyboard group as the video clip group.
- Use ordinary language: `我的剧本`, `人物`, `地点`, `这一段会这样拍`, `重拍这个片段`, `保存中`, `导出 MP4`.
- The `手绘旅行 VLOG` entry should feel like a compact mode inside the creation surface: one photo, one travel place, hand-drawn traveler character, real destination backgrounds. Do not turn it into a tutorial page or prompt editor.
- Do not expose `prompt packet`, `Shanyin-style shot data`, model parameters, raw provider payloads, or professional shot tables.

## Current Visual References

Current implementation should follow the retained update images:

- Step 1 input: `design-docs/stitch_storycam_cinematic_workstation/step_1_concept_input_culture_engine/step_1_update.png`
- Step 2 story world: `design-docs/stitch_storycam_cinematic_workstation/step_2_story_world_culture_engine/story-world_update.png`
- Step 3 core storyboard: `design-docs/stitch_storycam_cinematic_workstation/step_3_core_frames_culture_engine/core-storyboard.png`
- Step 5 clip generation: `design-docs/stitch_storycam_cinematic_workstation/step_5_fragment_generation_culture_engine/clip-generation.png`

Use `design-docs/stitch_storycam_cinematic_workstation/culture_engine_high_energy_dark_mode/DESIGN.md` for retained visual language. Static Stitch HTML exports and old screenshots are no longer implementation references.

## UI Foundation

- Use local shadcn-style primitives from `src/components/ui` for reusable controls.
- Use StoryCam wrappers from `src/components/storycam/StoryCamPrimitives.tsx` for repeated cinematic panels, docks, steppers, status badges, skeletons, and modal frames.
- Use lucide icons for actions and keep icon/text button heights consistent.
- Keep the palette dark and cinematic with cyan/pink accents; avoid turning the product into a generic SaaS block library.
