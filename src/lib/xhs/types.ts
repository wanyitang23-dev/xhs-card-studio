/**
 * Data model for the four-step Xiaohongshu flow.
 *
 *   ① 贴文章 → ② 拆页清单 (outline) → ③ 封面三选一 (cover) → ④ 出成品 (render)
 *
 * The original html-anything pipeline was one-shot: content → HTML. Steps ②
 * and ③ exist so the user confirms structure and cover *before* paying for a
 * full render, which is the expensive part.
 */

export type PageKind = "cover" | "content" | "ending";

/** One card. The user may edit every field before the final render. */
export type XhsPage = {
  id: string;
  kind: PageKind;
  /** Big text on the card. */
  title: string;
  /** Supporting copy. Empty is legal — some covers are title-only. */
  body: string;
  /**
   * `asset:<id>` tokens for user-uploaded screenshots to embed *in this card*.
   * Resolved to inline `data:` URLs at render time, mirroring how the original
   * pipeline handles editor images.
   */
  imageAssetIds: string[];
  /** The user has reviewed this page and it is ready to render. */
  confirmed: boolean;
};

/** One candidate cover in the step-③ comparison. */
export type CoverCandidate = {
  id: string;
  /** Short human label for the variant, e.g. "大字标题" / "拼贴". */
  label: string;
  /** Streaming target — accumulates while the agent writes. */
  html: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
};

/** Shape the outline endpoint asks the agent to return. */
export type OutlineResponse = {
  pages: Array<{
    kind?: string;
    title?: string;
    body?: string;
  }>;
};

/** Sensible caps. Xiaohongshu allows 18 images per post; past ~9 engagement drops. */
export const MAX_PAGES = 18;
export const RECOMMENDED_MAX_PAGES = 9;
export const MIN_PAGES = 2;

/**
 * How many cards to produce.
 *
 * `"auto"` lets the agent decide from the content — but "decide" used to mean
 * "split every beat onto its own card", which turned a 200-character post into
 * seven pages. The auto branch now also has to honour a count the writer states
 * in the copy itself ("4 张图讲清楚…"), and to leave short content short.
 *
 * A number is a hard target the agent is told to hit exactly, cover and ending
 * included.
 */
export type PageCountSetting = "auto" | number;

/** Clamp a user-entered count into something renderable. */
export function clampPageCount(n: number): number {
  return Math.max(MIN_PAGES, Math.min(MAX_PAGES, Math.round(n)));
}

/**
 * What the paging step is allowed to do to the user's words.
 *
 * `"condense"` is the default and the original behaviour: read the article,
 * rewrite it into card-length copy. It suits a draft that was never written for
 * cards.
 *
 * `"verbatim"` narrows the job to one act — choosing where the page breaks go.
 * The text on each card is a contiguous run of the source, unedited. It suits
 * copy the user already wrote deliberately (a finished post, a quote, a passage
 * where the exact wording matters), where any rewrite is a loss.
 *
 * A `mode` field existed in v0 and was dropped; this is not that feature coming
 * back by default, it is the choice being handed to the user.
 */
export type OutlineMode = "condense" | "verbatim";

/**
 * How many characters of unedited text one card can hold.
 *
 * Measured, not guessed: at the body sizes the bundled templates set (29-32px
 * over a 1080x1440 card), the text column takes about 390 characters before it
 * overflows the card. 350 leaves room for the title and footer that share the
 * card, and for a template with a larger body face.
 */
export const VERBATIM_PAGE_CHARS = 350;

/**
 * Cards a verbatim split of `chars` characters needs, cover and ending included.
 *
 * In condense mode the agent can always make the text fit by writing less. In
 * verbatim mode it cannot, so whether the article fits at all is arithmetic,
 * and arithmetic belongs in code: the UI uses this to warn *before* a run that
 * a source is too long for one post.
 */
export function estimateVerbatimPages(chars: number): number {
  return Math.max(MIN_PAGES, Math.ceil(chars / VERBATIM_PAGE_CHARS) + 2);
}

/** The text that goes in the caption box when the cards are uploaded. */
export type Caption = {
  title: string;
  body: string;
  /** Stored without the leading `#`; the UI adds it when rendering and copying. */
  tags: string[];
};
