export function parseAdminId(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const id = Number(raw.replace(/^#/, ""));
  if (!/^#?[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    throw new Error("Enter a positive whole ID.");
  }
  return id;
}

export function retainSelectedIds(selected: number[], available: number[]) {
  const valid = new Set(available);
  return selected.filter((id) => valid.has(id));
}

export function groupApplications<T extends { kind: string; item: { user_id: number; id: number } }>(items: T[]) {
  const groups = new Map<number, T[]>();
  items.forEach((entry) => groups.set(entry.item.user_id, [...(groups.get(entry.item.user_id) ?? []), entry]));
  return [...groups.entries()];
}

export async function applySelectedReviews(
  ids: number[],
  apply: (id: number) => Promise<unknown>,
) {
  const succeeded: number[] = [];
  const failed: Array<{ id: number; message: string }> = [];
  for (const id of new Set(ids)) {
    try { await apply(id); succeeded.push(id); }
    catch (error) { failed.push({ id, message: error instanceof Error ? error.message : "Request failed" }); }
  }
  return { succeeded, failed };
}
