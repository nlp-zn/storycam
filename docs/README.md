# StoryCam Docs

This folder is the persistent project memory for StoryCam. Product, design, engineering, deployment, research, and operating decisions should be written here instead of tool-local folders.

## Product

- [Product Vision](./product-vision.md)  
  Original positioning: StoryCam as an AI private story theater for ordinary users, not an industrial AI short-drama platform.

- [StoryCam Film Machine Design](./product/storycam-film-machine-design.md)  
  Current office-hours design: Web-first private mini-theater camera. The MVP flow is input -> script, character assets, and scene assets -> confirmation -> storyboard script and 1-3 core storyboard images -> storyboard expansion -> one Seedance 2.0 clip per core storyboard group -> clip confirmation -> suggested final stitch.

## Research

- [Shanyin Director Master Source](./research/shanyin-director-master-source.md)  
  Source, snapshot, and integration rules for the director methodology reference.

- [Shanyin Director Master Snapshot](./research/shanyin-director-master/)  
  Local copy of the reference project. Use this when designing StoryCam's director brain, prompt pipeline, storyboard structure, and quality checks.

## Engineering

No engineering plan yet.

Expected future docs:

- MVP architecture
- Video generation pipeline
- Storage and privacy model
- Deployment plan

## Design

No polished visual design yet. The current design handoff is intentionally minimal: one practical UI design brief plus one generated UI reference image in the active discussion.

Current design direction is captured in [StoryCam Film Machine Design](./product/storycam-film-machine-design.md). The first version should be Web-first, not mobile-only.

- [StoryCam UI Design Brief](./design/storycam-ui-design.md)  
  The single practical design document for the first Web UI: flow, required interactions, visual direction, copy, and constraints.

- [StoryCam UI Flow Board](./design/assets/storycam-ui-flow-board.png)  
  Generated visual reference showing the ordered multi-step interaction board.

## Deployment

No deployment plan yet.

Expected future docs:

- Web hosting target
- Background job infrastructure
- Video asset storage
- Environment variables and secret handling
