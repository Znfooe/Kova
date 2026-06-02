import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { loadMode, saveMode, applyTheme, loadAllCustomFonts, type ThemeMode } from "./lib/theme";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { SettingsPanel } from "./components/layout/SettingsPanel";
import { AIChatPanel } from "./components/layout/AIChatPanel";
import { NoteDetail } from "./components/detail/NoteDetail";
import { db } from "./lib/db";
import { useNotes } from "./hooks/useNotes";
import type { Note } from "./lib/db";

applyTheme(loadMode());
// Load custom fonts on startup
db.getDataDir().then(dir => loadAllCustomFonts(dir));

// Zoom level management
const ZOOM_LEVELS = [0.75, 0.875, 1, 1.125, 1.25, 1.5];
function loadZoom(): number {
  return Number(localStorage.getItem("fp-zoom")) || 1;
}
function saveZoom(level: number) {
  localStorage.setItem("fp-zoom", String(level));
  document.documentElement.style.fontSize = `${level * 16}px`;
}
// Apply saved zoom on startup
document.documentElement.style.fontSize = `${loadZoom() * 16}px`;

// Restore window size on startup
const win = getCurrentWindow();
invoke<[number, number]>("get_window_size").then(() => {
  const savedW = localStorage.getItem("fp-window-width");
  const savedH = localStorage.getItem("fp-window-height");
  if (savedW && savedH) {
    const nw = Number(savedW);
    const nh = Number(savedH);
    // Only restore if size is reasonable (min 400x300)
    if (nw >= 400 && nh >= 300) {
      win.setSize(new LogicalSize(nw, nh));
    }
  }
});
// Save window size on close (skip minimized windows)
win.onResized(() => {
  invoke<[number, number]>("get_window_size").then(([w, h]) => {
    // Only save if window is reasonably sized (min 400x300)
    if (w >= 400 && h >= 300) {
      localStorage.setItem("fp-window-width", String(Math.round(w)));
      localStorage.setItem("fp-window-height", String(Math.round(h)));
    }
  });
});

export default function App() {
  const { notes, fetch, create, update, remove } = useNotes();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ThemeMode>(loadMode);
  const [showSettings, setShowSettings] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("kova-sidebar-width");
    return saved ? Number(saved) : 260;
  });
  const [settingsWidth, setSettingsWidth] = useState(() => {
    const saved = localStorage.getItem("kova-settings-width");
    return saved ? Number(saved) : 360;
  });
  const [aiWidth, setAiWidth] = useState(() => {
    const saved = localStorage.getItem("kova-ai-width");
    return saved ? Number(saved) : 360;
  });
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<import("./lib/db").Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => {
    const saved = localStorage.getItem("fp-last-folder-id");
    return saved !== null ? saved : "";
  });
  const [isDragging, setIsDragging] = useState(false);

  // Zoom with Ctrl+scroll, reset with Ctrl+0
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const current = loadZoom();
        const idx = ZOOM_LEVELS.indexOf(current);
        const next = e.deltaY < 0
          ? ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)]
          : ZOOM_LEVELS[Math.max(idx - 1, 0)];
        saveZoom(next);
        getCurrentWebview().setZoom(next).catch(() => {});
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        saveZoom(1);
        getCurrentWebview().setZoom(1).catch(() => {});
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    localStorage.setItem("kova-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("kova-settings-width", String(settingsWidth));
  }, [settingsWidth]);

  useEffect(() => {
    localStorage.setItem("kova-ai-width", String(aiWidth));
  }, [aiWidth]);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const onMouseMove = (e: MouseEvent) => {
      const w = Math.min(400, Math.max(180, e.clientX));
      setSidebarWidth(w);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleSettingsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = settingsWidth;
    const onMouseMove = (e: MouseEvent) => {
      const w = Math.min(500, Math.max(280, startWidth - (e.clientX - startX)));
      setSettingsWidth(w);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [settingsWidth]);

  const handleAIDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = aiWidth;
    const onMouseMove = (e: MouseEvent) => {
      const w = Math.min(600, Math.max(300, startWidth - (e.clientX - startX)));
      setAiWidth(w);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [aiWidth]);

  // Fetch folders on mount
  useEffect(() => {
    db.listFolders().then(setFolders);
  }, []);

  // selectedFolderId: null = show all (initial), "" = uncategorized, UUID = specific folder
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
        // Re-fetch current folder's notes to pick the next one
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
    // Switch to another selected note
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
    if (selectedNote?.id === id) setSelectedNote((prev) => prev ? { ...prev, title } : null);
  };

  const handleUpdateContent = (id: string, content: string) => {
    update(id, { content });
    if (selectedNote?.id === id) setSelectedNote((prev) => prev ? { ...prev, content } : null);
  };

  const filteredNotes = search
    ? notes.filter((n) => n.content.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
    : notes;

  const renderDetail = () => {
    if (!selectedNote) {
      return (
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
      );
    }

    return <NoteDetail note={selectedNote} onToggleSidebar={() => setShowSidebar((v) => !v)} onDelete={handleDelete} onUpdateTitle={handleUpdateTitle} onUpdateContent={handleUpdateContent} />;
  };

  return (
    <div className="h-screen flex flex-col bg-paper">
      <TitleBar settingsOpen={showSettings} aiOpen={showAI} closeToTray={localStorage.getItem("fp-close-to-tray") !== "false"} mode={mode} onToggleMode={handleToggleMode} onToggleSettings={() => { setShowSettings((v) => !v); setShowAI(false); }} onToggleAI={() => { setShowAI((v) => !v); setShowSettings(false); }} />

      <div className="flex flex-1 min-h-0">
        <div className="relative shrink-0 flex" style={{ width: showSidebar ? sidebarWidth : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-full h-full overflow-hidden">
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
                  if (updated.length > 0) {
                    setSelectedFolderId(updated[0].id);
                  } else {
                    setSelectedFolderId("");
                  }
                }
              });
            }}
            onMoveToFolder={async (noteId, folderId) => { await db.moveToFolder(noteId, folderId ?? undefined); fetch(undefined, selectedFolderId ?? undefined); }}
            onMoveMultipleToFolder={async (noteIds, folderId) => {
              for (const id of noteIds) { await db.moveToFolder(id, folderId ?? undefined); }
              // Refresh current folder view
              const updated = await fetch(undefined, selectedFolderId ?? undefined);
              // If a moved note is still selected, switch to the first remaining
              if (selectedNote && noteIds.includes(selectedNote.id)) {
                setSelectedNote(updated.length > 0 ? updated[0] : null);
              }
              db.list().then((all: Note[]) => setAllNotes(all));
            }}
            onDeselectNote={handleDeselectNote}
            onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); }}
          />
          </div>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={handleSidebarMouseDown} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {renderDetail()}
          <div className="h-7 px-4 flex items-center justify-between text-xs text-ink-ghost border-t border-paper-deep/20 bg-paper/30 shrink-0">
            <span>{filteredNotes.length} 条笔记</span>
            <span>本地存储 · SQLite</span>
          </div>
        </div>

        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showSettings ? settingsWidth : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={handleSettingsMouseDown} />
          <div className="w-full h-full overflow-hidden">
            <SettingsPanel onClose={() => setShowSettings(false)} mode={mode} onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); }} />
          </div>
        </div>

        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showAI ? aiWidth : 0, transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={handleAIDragMouseDown} />
          <div className="w-full h-full overflow-hidden">
            <AIChatPanel onClose={() => setShowAI(false)} />
          </div>
        </div>
      </div>
    </div>
  );
}
