/**
 * Comment mentions are stored inline as `@[Display Name](userId)` so the text stays readable
 * and the web app can render them; these helpers pull them out again.
 */
const TOKEN = /@\[([^\]\n]{1,120})\]\(([a-z0-9]{20,40})\)/g;

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[2]))];
}

/** "Please check @[Ravi Kumar](ck…)" → "Please check @Ravi Kumar" */
export function plainMentions(body: string): string {
  return body.replace(TOKEN, (_, name: string) => `@${name}`);
}
