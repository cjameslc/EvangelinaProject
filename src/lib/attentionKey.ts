// A fingerprint for a "Needs your attention" card — see the DismissedAttentionItem
// schema comment for why this is a content hash and not a stable record id
// (these cards are recomputed/aggregate every load, not backed by one DB row each).
export function attentionKey(id: string, desc: string): string {
  const input = `${id}|${desc}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `${id}-${(hash >>> 0).toString(36)}`;
}
