import { useState, useCallback, useRef } from "react";
import type { Note } from "../lib/db";
import { db } from "../lib/db";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchSeq = useRef(0);

  const fetch = useCallback(async (search?: string, folderId?: string) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const result = await db.list(search, folderId);
      // Only update state if this is the latest fetch (prevents stale overwrites)
      if (seq === fetchSeq.current) {
        setNotes(result);
      }
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (title: string, content: string, tags: string[] = [], folderId?: string) => {
    const note = await db.create(title, content, tags, folderId);
    setNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const update = useCallback(async (id: string, changes: Parameters<typeof db.update>[1]) => {
    await db.update(id, changes);
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, ...changes, updated_at: new Date().toISOString() } : n));
      next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return next as Note[];
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    await db.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notes, loading, fetch, create, update, remove };
}
