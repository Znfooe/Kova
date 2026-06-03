import { invoke } from "@tauri-apps/api/core";

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const db = {
  create: (title: string, content: string, tags: string[] = [], folderId?: string) =>
    invoke<Note>("create_note", { title, content, tags, folderId: folderId ?? null }),

  list: (search?: string, folderId?: string) =>
    invoke<Note[]>("get_notes", { search: search ?? null, folderId: folderId ?? null }),

  update: (id: string, changes: Partial<{ title: string; content: string; tags: string[]; folder_id: string | null }>) =>
    invoke<void>("update_note", { id, ...changes }),

  delete: (id: string) =>
    invoke<void>("delete_note", { id }),

  // Folder operations
  createFolder: (name: string, parentId?: string) =>
    invoke<Folder>("create_folder", { name, parentId: parentId ?? null }),

  listFolders: () =>
    invoke<Folder[]>("get_folders"),

  updateFolder: (id: string, name: string) =>
    invoke<void>("update_folder", { id, name }),

  deleteFolder: (id: string) =>
    invoke<void>("delete_folder", { id }),

  moveToFolder: (id: string, folderId?: string) =>
    invoke<void>("move_note_to_folder", { id, folderId: folderId ?? null }),

  getDataDir: () =>
    invoke<string>("get_data_dir"),

  setDataDir: (newDir: string) =>
    invoke<string>("set_data_dir", { newDir }),

  importMd: (path: string) =>
    invoke<Note>("import_md_file", { path }),

  importFile: (path: string) =>
    invoke<Note>("import_file", { path }),

  exportNote: (id: string, destDir: string) =>
    invoke<string>("export_note", { id, destDir }),

  exportNoteHtml: (id: string, destDir: string) =>
    invoke<string>("export_note_html", { id, destDir }),

  exportNoteTxt: (id: string, destDir: string) =>
    invoke<string>("export_note_txt", { id, destDir }),
};
