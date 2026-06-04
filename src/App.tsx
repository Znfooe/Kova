import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { loadMode, saveMode, applyTheme, loadAllCustomFonts, type ThemeMode } from "./lib/theme";
import { loadZoom, saveZoom, getZoomDelta } from "./lib/zoom";
import { restoreWindowSize, listenWindowSize } from "./lib/windowState";
import { usePanelResize } from "./hooks/usePanelResize";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { SettingsPanel } from "./components/layout/SettingsPanel";
import { AIChatPanel } from "./components/layout/AIChatPanel";
import { NoteDetail } from "./components/detail/NoteDetail";
import { StatusBar } from "./components/StatusBar";
import { db } from "./lib/db";
import { useNotes } from "./hooks/useNotes";
import type { Note } from "./lib/db";

// Init theme and fonts
applyTheme(loadMode());
db.getDataDir().then(dir => loadAllCustomFonts(dir));

// Init zoom
document.documentElement.style.fontSize = `${loadZoom() * 16}px`;

// Init window size
restoreWindowSize();
listenWindowSize();

export default function App() {
  const { notes, fetch, create, update, remove } = useNotes();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ThemeMode>(loadMode);
  const [showSettings, setShowSettings] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<import("./lib/db").Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => {
    const saved = localStorage.getItem("fp-last-folder-id");
    return saved !== null ? saved : "";
  });

  const sidebar = usePanelResize({ storageKey: "kova-sidebar-width", defaultWidth: 260, minWidth: 180, maxWidth: 400, side: "right" });
  const settings = usePanelResize({ storageKey: "kova-settings-width", defaultWidth: 360, minWidth: 280, maxWidth: 500, side: "left" });
  const ai = usePanelResize({ storageKey: "kova-ai-width", defaultWidth: 360, minWidth: 300, maxWidth: 600, side: "left" });
  const isDragging = sidebar.isDragging || settings.isDragging || ai.isDragging;
  const [draggingFiles, setDraggingFiles] = useState(false);

  // Zoom with Ctrl+scroll, reset with Ctrl+0
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const next = getZoomDelta(loadZoom(), e.deltaY < 0 ? 1 : -1);
        saveZoom(next);
        getCurrentWebview().setZoom(next).catch(() => {});
        window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "zoom", value: next } }));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        saveZoom(1);
        getCurrentWebview().setZoom(1).catch(() => {});
        window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "zoom", value: 1 } }));
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); };
  }, []);

  // Fetch folders on mount
  useEffect(() => {
    db.listFolders().then(setFolders);
  }, []);

  // Fetch notes when folder changes
  useEffect(() => {
    fetch(undefined, selectedFolderId ?? undefined).then((fetched: Note[]) => {
      if (fetched.length > 0 && !selectedNote) {
        const lastId = localStorage.getItem("fp-last-note-id");
        const found = lastId ? fetched.find(n => n.id === lastId) : null;
        setSelectedNote(found ?? fetched[0]);
      }
    });
    db.list().then((all: Note[]) => setAllNotes(all));
  }, [selectedFolderId, fetch]);

  // Persist last selected note and folder
  useEffect(() => {
    if (selectedNote) localStorage.setItem("fp-last-note-id", selectedNote.id);
  }, [selectedNote]);
  useEffect(() => {
    if (selectedFolderId !== null) localStorage.setItem("fp-last-folder-id", selectedFolderId);
  }, [selectedFolderId]);

  // Listen for quick-note-saved events
  useEffect(() => {
    const unlisten = listen("quick-note-saved", () => {
      fetch(undefined, selectedFolderId ?? undefined);
      db.list().then((all: Note[]) => setAllNotes(all));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  // Listen for AI tool data changes
  useEffect(() => {
    const unlisten = listen("ai-stream", (event) => {
      const payload = event.payload as { type: string; data: string; conversation_id: string };
      if (payload.type === "data_changed") {
        fetch(undefined, selectedFolderId ?? undefined);
        db.list().then((all: Note[]) => setAllNotes(all));
        db.listFolders().then(setFolders);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  // Listen for external file drops
  useEffect(() => {
    const SUPPORTED_EXT = [".md", ".txt", ".html", ".htm"];
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter") {
        const hasSupported = event.payload.paths.some((p: string) =>
          SUPPORTED_EXT.some(ext => p.toLowerCase().endsWith(ext))
        );
        setDraggingFiles(hasSupported);
        return;
      }
      if (event.payload.type === "leave" || event.payload.type === "over") {
        if (event.payload.type === "leave") setDraggingFiles(false);
        return;
      }
      if (event.payload.type !== "drop") return;
      setDraggingFiles(false);
      const paths = event.payload.paths.filter((p: string) =>
        SUPPORTED_EXT.some(ext => p.toLowerCase().endsWith(ext))
      );
      if (paths.length === 0) return;
      const targetFolderId = selectedFolderId && selectedFolderId !== "" ? selectedFolderId : undefined;
      (async () => {
        for (const path of paths) {
          try {
            if (targetFolderId) {
              const note = await db.importFile(path);
              await db.moveToFolder(note.id, targetFolderId);
            } else {
              await db.importFile(path);
            }
          } catch (e) {
            console.error("Failed to import dropped file:", path, e);
          }
        }
        fetch(undefined, selectedFolderId ?? undefined);
        db.list().then((all: Note[]) => setAllNotes(all));
      })();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  const handleToggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    saveMode(next);
    applyTheme(next);
  };

  const handleCreateNote = async (folderId?: string) => {
    const note = await create("", "", [], folderId ?? selectedFolderId ?? undefined);
    setSelectedNote(note);
    fetch(undefined, selectedFolderId ?? undefined);
    db.list().then((all: Note[]) => setAllNotes(all));
  };

  const handleDelete = (id: string) => {
    remove(id).then(() => {
      const nextIds = new Set(selectedIds);
      nextIds.delete(id);
      setSelectedIds(nextIds);
      db.list().then(setAllNotes);
      if (selectedNote?.id === id) {
        fetch(undefined, selectedFolderId ?? undefined).then((remaining) => {
          setSelectedNote(remaining[0] ?? null);
        });
      }
    });
  };

  const handleDeselectNote = (noteId: string) => {
    const next = new Set(selectedIds);
    next.delete(noteId);
    setSelectedIds(next);
    if (next.size > 0) {
      const nextId = [...next][0];
      const nextNote = allNotes.find(n => n.id === nextId);
      if (nextNote) setSelectedNote(nextNote);
    } else {
      setSelectedNote(null);
    }
  };

  const handleUpdateTitle = (id: string, title: string) => {
    update(id, { title });
    if (selectedNote?.id === id) {
      const now = new Date().toISOString();
      setSelectedNote((prev) => prev ? { ...prev, title, updated_at: now } : null);
    }
  };

  const handleUpdateContent = (id: string, content: string) => {
    update(id, { content });
    if (selectedNote?.id === id) {
      const now = new Date().toISOString();
      setSelectedNote((prev) => prev ? { ...prev, content, updated_at: now } : null);
    }
  };

  const filteredNotes = search
    ? notes.filter((n) => n.content.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
    : notes;

  return (
    <div className="h-screen flex flex-col bg-paper">
      <TitleBar settingsOpen={showSettings} aiOpen={showAI} closeToTray={localStorage.getItem("fp-close-to-tray") !== "false"} mode={mode} onToggleMode={handleToggleMode} onToggleSettings={() => { setShowSettings((v) => !v); setShowAI(false); }} onToggleAI={() => { setShowAI((v) => !v); setShowSettings(false); }} />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showSidebar ? sidebar.width : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="h-full shrink-0 overflow-hidden" style={{ width: sidebar.width - 4 }}>
            <Sidebar
              search={search}
              filteredNotes={filteredNotes}
              selectedId={selectedNote?.id ?? null}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSearchChange={setSearch}
              onSelectNote={(note) => { setSelectedNote(note); setSelectedIds(new Set()); }}
              onCreateNote={handleCreateNote}
              onDelete={handleDelete}
              onFolderSelect={setSelectedFolderId}
              onFolderCreate={async (baseName, parentId) => {
                const siblings = folders.filter(f => f.parent_id === (parentId ?? null));
                const names = new Set(siblings.map(f => f.name));
                let name = baseName;
                if (names.has(name)) {
                  let i = 1;
                  while (names.has(`${baseName}${i}`)) i++;
                  name = `${baseName}${i}`;
                }
                await db.createFolder(name, parentId);
                db.listFolders().then(setFolders);
              }}
              onFolderRename={async (id, name) => { await db.updateFolder(id, name); db.listFolders().then(setFolders); }}
              onFolderDelete={async (id) => {
                await db.deleteFolder(id);
                db.listFolders().then((updated) => {
                  setFolders(updated);
                  if (selectedFolderId === id) {
                    setSelectedFolderId(updated.length > 0 ? updated[0].id : "");
                  }
                });
              }}
              onMoveToFolder={async (noteId, folderId) => { await db.moveToFolder(noteId, folderId ?? undefined); fetch(undefined, selectedFolderId ?? undefined); }}
              onMoveMultipleToFolder={async (noteIds, folderId) => {
                for (const id of noteIds) { await db.moveToFolder(id, folderId ?? undefined); }
                const updated = await fetch(undefined, selectedFolderId ?? undefined);
                if (selectedNote && noteIds.includes(selectedNote.id)) {
                  setSelectedNote(updated.length > 0 ? updated[0] : null);
                }
                db.list().then((all: Note[]) => setAllNotes(all));
              }}
              onDeselectNote={handleDeselectNote}
              onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); }}
            />
          </div>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={sidebar.handleMouseDown} />
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedNote ? (
            <NoteDetail note={selectedNote} onToggleSidebar={() => setShowSidebar((v) => !v)} onDelete={handleDelete} onUpdateTitle={handleUpdateTitle} onUpdateContent={handleUpdateContent} />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 h-10 border-b border-paper-deep/20 shrink-0 bg-paper/20">
                <span className="text-xs text-ink-ghost">选择一条笔记查看</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-ink-ghost">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="mb-3 opacity-20">
                  <rect x="10" y="7" width="36" height="42" rx="5" stroke="currentColor" strokeWidth="2"/>
                  <path d="M19 18h18M19 26h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p className="text-sm">Kova</p>
                <p className="text-xs mt-1">灵感来了，记一笔</p>
              </div>
            </>
          )}
          <StatusBar selectedNote={selectedNote} noteCount={filteredNotes.length} />
        </div>

        {/* Settings panel */}
        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showSettings && !showAI ? settings.width : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={settings.handleMouseDown} />
          <div className="h-full shrink-0 overflow-hidden" style={{ width: settings.width - 4 }}>
            <SettingsPanel onClose={() => setShowSettings(false)} mode={mode} onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); }} />
          </div>
        </div>

        {/* AI panel */}
        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showAI ? ai.width : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={ai.handleMouseDown} />
          <div className="h-full shrink-0" style={{ width: ai.width - 4 }}>
            <AIChatPanel onClose={() => setShowAI(false)} />
          </div>
        </div>
      </div>

      {/* File drop overlay */}
      {draggingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm pointer-events-none border-2 border-dashed border-accent/40 rounded-xl m-2">
          <div className="flex flex-col items-center gap-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent animate-bounce">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <p className="text-sm text-accent font-medium">释放以导入笔记</p>
            <p className="text-[11px] text-ink-ghost">支持 .md .txt .html 文件</p>
          </div>
        </div>
      )}
    </div>
  );
}
