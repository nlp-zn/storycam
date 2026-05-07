export const storyCamComicVisualStyle =
  "漫画电影/动画分镜风格，非写实真人，干净线条，统一角色设定，电影光影，低饱和情绪色彩，私人记忆质感";

export const storyCamComicVisualSafetyLine =
  "All human characters must be fictional illustrated comic or animation characters, not photorealistic people, not real-person likenesses, and not celebrity likenesses.";

export function normalizeStoryCamVisualStyle(style?: string) {
  const trimmed = style?.trim();

  if (!trimmed) {
    return storyCamComicVisualStyle;
  }

  if (/(漫画|动漫|动画|二次元|comic|manga|anime|illustrated|animation)/i.test(trimmed) && !/(写实|真人|photoreal|realistic)/i.test(trimmed)) {
    return trimmed;
  }

  return `${storyCamComicVisualStyle}；将原始风格倾向“${trimmed}”转译为漫画电影语言，不输出写实真人、真人照片感或名人相似脸。`;
}

export function storyCamComicImagePromptLine() {
  return [
    "Style: stylized comic animation storyboard frame, polished cinematic illustration, 16:9 landscape.",
    storyCamComicVisualSafetyLine
  ].join("\n");
}
