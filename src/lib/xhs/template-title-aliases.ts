"use client";

const STORAGE_KEY = "xhs-template-title-aliases-v1";
const CHANGE_EVENT = "xhs-template-title-aliases-change";

export type TemplateTitleAliases = Record<string, string>;

export function readTemplateTitleAliases(): TemplateTitleAliases {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function writeTemplateTitleAliases(aliases: TemplateTitleAliases): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeTemplateTitleAliases(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
