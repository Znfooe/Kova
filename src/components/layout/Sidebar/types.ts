import type { Folder } from "../../../lib/db";

export interface FolderNode extends Folder {
  children: FolderNode[];
}
