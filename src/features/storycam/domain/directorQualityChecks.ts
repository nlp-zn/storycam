import { directorBriefSchema } from "./artifactSchemas";
import type { DirectorBrief, StoryScript, StoryboardScript } from "./artifacts";

const psychologicalProsePattern = /(意识到|感受到|觉得|明白|领会|内心|心里|情绪涌|很难过|很孤独|很开心|很痛苦)/;
const fallbackQualityCheckSummary = "剧本已转成可见动作、可听声音和 15 秒节奏。";

type DirectorQualityCheckInput = {
  allowedCharacterAssetIds?: string[];
  script: Pick<StoryScript, "beats" | "summary"> & Partial<Pick<StoryScript, "directorBrief">>;
  storyboardScript?: Pick<StoryboardScript, "frames">;
};

export function defaultDirectorBrief(input: {
  idea?: string;
  lightweightChoices?: string[];
  summary?: string;
  title?: string;
} = {}): DirectorBrief {
  const source = [input.idea, input.lightweightChoices?.join(" "), input.title, input.summary].join(" ");
  const motifs = inferVisualMotifs(source);
  const tone = input.lightweightChoices?.length ? input.lightweightChoices.join("、") : "私人、克制、有一点留白";

  return directorBriefSchema.parse({
    dialogueStrategy: inferDialogueStrategy(source),
    microRhythm: "0-3秒建立状态，3-8秒推进一个可见动作，8-12秒给反应或情绪转折，12-15秒留白收束。",
    shotDensity: "前段慢，中段围绕动作轻微加密，最后一拍停住。",
    shotSizeFocus: "中景建立空间，近景落到人物动作和关键物件，结尾用空镜或中远景保留余味。",
    soundStrategy: inferSoundStrategy(source),
    tone,
    transitionStrategy: "用声音、视线或物件变化自然衔接，不做强烈技术感转场。",
    userFacingSummary: "这一段会先建立状态，再用一个小动作和一个反应完成情绪转折。",
    visualMotifs: motifs
  });
}

export function runStoryCamDirectorQualityChecks(input: DirectorQualityCheckInput): string[] {
  const checks: string[] = [];
  const directorBrief = input.script.directorBrief;
  const effectiveDirectorBrief =
    directorBrief ??
    defaultDirectorBrief({
      summary: [input.script.summary, ...input.script.beats].join(" ")
    });

  if (!directorBrief) {
    checks.push("节奏提示缺失，已使用默认私人短片节奏。");
  }

  const scriptText = [input.script.summary, ...input.script.beats].join(" ");

  if (psychologicalProsePattern.test(scriptText)) {
    checks.push("剧本仍含明显心理描写，需要转成可见动作或可听声音。");
  }

  const frames = input.storyboardScript?.frames ?? [];

  if (framesHaveMissingSoundOrPurpose(frames)) {
    checks.push("分镜脚本存在缺少声音或叙事目的的帧。");
  }

  if (framesReferenceUnlistedCharacters(frames, input.allowedCharacterAssetIds ?? [])) {
    checks.push("分镜脚本引用了未确认的人物资产。");
  }

  if (frames.length > 0 && !directorMotifAppearsInFrames(effectiveDirectorBrief, frames)) {
    checks.push("关键画面线索尚未明显落到分镜里。");
  }

  return checks.length ? checks : [fallbackQualityCheckSummary];
}

function framesHaveMissingSoundOrPurpose(frames: Pick<StoryboardScript, "frames">["frames"]): boolean {
  return frames.length > 0 && frames.some((frame) => !frame.sound.trim() || !frame.narrativePurpose.trim());
}

function framesReferenceUnlistedCharacters(frames: Pick<StoryboardScript, "frames">["frames"], allowedCharacterAssetIds: string[]): boolean {
  const allowedIds = new Set(allowedCharacterAssetIds);

  return allowedIds.size > 0 && frames.some((frame) => frame.visibleCharacterAssetIds?.some((assetId) => !allowedIds.has(assetId)));
}

function directorMotifAppearsInFrames(directorBrief: DirectorBrief, frames: Pick<StoryboardScript, "frames">["frames"]): boolean {
  const frameText = frames
    .map((frame) => [frame.visualContent, frame.imagePrompt, frame.narrativePurpose, frame.sound, frame.title].join(" "))
    .join(" ");

  return directorBrief.visualMotifs.some((motif) => frameText.includes(motif));
}

function inferVisualMotifs(source: string) {
  const motifs: string[] = [];

  if (/雨|rain/i.test(source)) {
    motifs.push("雨声");
  }

  if (/玻璃|倒影|窗|mirror|reflection/i.test(source)) {
    motifs.push("玻璃反光");
  }

  if (/手机|短信|消息|phone|message/i.test(source)) {
    motifs.push("手机");
  }

  if (/门|回家|home/i.test(source)) {
    motifs.push("门");
  }

  if (/风|wind/i.test(source)) {
    motifs.push("风声");
  }

  return Array.from(new Set(motifs.length ? motifs : ["关键物件", "环境光", "停顿动作"])).slice(0, 6);
}

function inferDialogueStrategy(source: string) {
  if (/旁白|voiceover|narration/i.test(source)) {
    return "允许少量旁白，但旁白只补充情绪，不解释画面已经能看懂的信息。";
  }

  return "少台词，用停顿、动作和物件变化表达。";
}

function inferSoundStrategy(source: string) {
  const cues: string[] = [];

  if (/雨|rain/i.test(source)) {
    cues.push("雨声");
  }

  if (/门|便利店|home/i.test(source)) {
    cues.push("门铃或开门声");
  }

  if (/风|wind/i.test(source)) {
    cues.push("风声");
  }

  return cues.length
    ? `${cues.join("、")}作为主要声音锚点，配乐保持低声。`
    : "环境声作为主要声音锚点，配乐保持低声，避免盖过动作。";
}
