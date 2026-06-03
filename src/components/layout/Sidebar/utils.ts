import type { Folder } from "../../../lib/db";
import type { FolderNode } from "./types";

export function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
