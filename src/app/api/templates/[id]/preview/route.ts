import { loadSkill } from "@/lib/templates/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Returns the skill's `example.html` verbatim so it can be loaded into an
 * `<iframe src=…>`. Lets the browser handle caching and avoids shipping every
 * preview HTML through `srcDoc` (which would block the main thread when the
 * gallery renders dozens of thumbnails at once).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const skill = loadSkill(id);
  if (!skill || !skill.exampleHtml) {
    return new Response(`no preview for template: ${id}`, { status: 404 });
  }
  return new Response(skill.exampleHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Local template files are edited frequently during development. Do not
      // leave an old preview cached under the same skill id while iterating.
      "Cache-Control":
        process.env.NODE_ENV === "development" ? "no-store" : "public, max-age=300",
    },
  });
}
