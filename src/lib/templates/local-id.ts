/**
 * Return the on-disk slug for a template uploaded through this app.
 *
 * Marketplace skills use the same `pkg-*` namespace, so checking only the
 * prefix would accidentally expose a delete button for installed packages.
 * Local uploads are deliberately namespaced as `local__<slug>` and repeat the
 * slug as their original skill id.
 *
 * This lives in a browser-safe module because the template gallery needs it;
 * `skills/paths.ts` also imports Node's `path` and `os` modules.
 */
export function localTemplateSlugFromSkillId(id: string): string | null {
  const match = /^pkg-local__([a-z0-9][a-z0-9-]*)--([a-z0-9][a-z0-9-]*)$/.exec(id);
  if (!match || match[1] !== match[2]) return null;
  return match[1];
}
