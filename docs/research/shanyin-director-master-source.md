# Shanyin Director Master Source

External reference:

- Repository: https://github.com/Shanyin-ai/shanyin-director-master
- Snapshot commit inspected: `c808b2d9ddcfba152c5ee17c914c6451f1a27a02`
- Local snapshot: `docs/research/shanyin-director-master/`

## Why This Exists

StoryCam's video generation quality depends on the director layer, not just the video model.

This reference project is the starting point for StoryCam's internal director brain:

- director tone setting
- rhythm planning
- script audiovisual refinement
- shot group planning
- nine-column storyboard structure
- action-reaction shot logic
- shot-level quality checks

The full reference is kept in this project so product, prompt, engineering, and evaluation decisions can evolve from the same source material.

## Integration Rule

Do not expose the Shanyin workflow directly to ordinary users.

StoryCam should translate Shanyin's professional director workflow into consumer-facing interaction:

- "导演定调" becomes lightweight style and mood choices.
- "节奏规划" becomes visible generation progress and keyframe structure.
- "九列分镜表" becomes internal shot data and model prompt packets.
- "Double Check" becomes automated quality checks before showing results.

