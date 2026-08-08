import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { History, Loader2, PanelLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { ChatSummary } from "@/components/council-workspace/types";
import { formatDate } from "@/components/council-workspace/result-utils";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function ChatSidebar({
  chats,
  currentThreadId,
  deletingChatId,
  renamingChatId,
  running,
  open,
  modal,
  sidebarRef,
  initialFocusRef,
  onClose,
  onDelete,
  onRename,
  hasMoreChats = false,
  loadingMoreChats = false,
  onLoadMoreChats
}: {
  chats: ChatSummary[];
  currentThreadId?: string;
  deletingChatId: string | null;
  renamingChatId: string | null;
  running: boolean;
  open: boolean;
  modal: boolean;
  sidebarRef: RefObject<HTMLElement>;
  initialFocusRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  onDelete: (chatId: string) => void;
  onRename: (chatId: string, title: string) => Promise<boolean>;
  hasMoreChats?: boolean;
  loadingMoreChats?: boolean;
  onLoadMoreChats?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const skipBlurCommitRef = useRef(false);

  const filteredChats = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return chats;
    return chats.filter((chat) => chat.title.toLowerCase().includes(normalized));
  }, [chats, query]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!modal || event.key !== "Tab") return;

    const focusable = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function beginRename(chat: ChatSummary) {
    skipBlurCommitRef.current = false;
    setEditingId(chat.id);
    setDraftTitle(chat.title);
  }

  function cancelRename() {
    setEditingId(null);
    setDraftTitle("");
  }

  async function commitRename(chatId: string, currentTitle?: string) {
    if (renamingChatId) return;
    const next = draftTitle.trim();
    if (!next || (currentTitle !== undefined && next === currentTitle)) {
      cancelRename();
      return;
    }
    const ok = await onRename(chatId, next);
    if (ok) cancelRename();
  }

  return (
    <aside
      ref={sidebarRef}
      aria-hidden={!open}
      aria-label="Chat history"
      aria-modal={modal || undefined}
      className="sidebar"
      id="chat-history-sidebar"
      inert={!open}
      role={modal ? "dialog" : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="sidebar-top">
        <Link className="new-chat-button" href="/app" prefetch={false}>
          <Plus aria-hidden size={16} />
          New chat
        </Link>
        <button
          ref={initialFocusRef}
          aria-controls="chat-history-sidebar"
          aria-expanded={open}
          aria-label="Hide chat history"
          className="icon-button ghost"
          type="button"
          title="Hide sidebar"
          onClick={onClose}
        >
          <PanelLeft aria-hidden size={18} />
        </button>
      </div>

      <div className="section-title compact">
        <h2>Chats</h2>
        <History aria-hidden size={15} />
      </div>

      {chats.length ? (
        <label className="sidebar-search">
          <span className="sr-only">Search chats</span>
          <span className="input-shell">
            <Search aria-hidden size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
            />
          </span>
        </label>
      ) : null}

      <div className="chat-list">
        {chats.length === 0 ? <p className="muted small">Saved chats appear here.</p> : null}
        {chats.length > 0 && filteredChats.length === 0 ? (
          <p className="muted small">No chats match “{query.trim()}”.</p>
        ) : null}
        {filteredChats.map((chat) => {
          const isActive = currentThreadId === chat.id;
          const isDeleting = deletingChatId === chat.id;
          const isRenaming = renamingChatId === chat.id;
          const isEditing = editingId === chat.id;

          return (
            <div className={`chat-row ${isActive ? "active" : ""}`} key={chat.id}>
              {isEditing ? (
                <form
                  className="chat-rename-form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void commitRename(chat.id, chat.title);
                  }}
                >
                  <input
                    aria-label="Chat title"
                    autoFocus
                    disabled={isRenaming}
                    maxLength={120}
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={() => {
                      if (skipBlurCommitRef.current) {
                        skipBlurCommitRef.current = false;
                        return;
                      }
                      void commitRename(chat.id, chat.title);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        skipBlurCommitRef.current = true;
                        cancelRename();
                      }
                    }}
                  />
                </form>
              ) : (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className="chat-link"
                  href={`/app/chats/${chat.id}`}
                  prefetch={false}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    beginRename(chat);
                  }}
                >
                  <strong>{chat.title}</strong>
                  <span>{formatDate(chat.updated_at)}</span>
                </Link>
              )}
              <div className="chat-row-actions">
                <button
                  aria-label={`Rename ${chat.title}`}
                  className="icon-button ghost chat-action-button"
                  disabled={isDeleting || isRenaming || running || isEditing}
                  title={`Rename ${chat.title}`}
                  type="button"
                  onClick={() => beginRename(chat)}
                >
                  {isRenaming ? <Loader2 aria-hidden className="spin" size={14} /> : <Pencil aria-hidden size={14} />}
                </button>
                <button
                  aria-label={`Delete ${chat.title}`}
                  className="icon-button ghost chat-action-button"
                  disabled={isDeleting || isRenaming || running}
                  title={isDeleting ? "Deleting chat" : `Delete ${chat.title}`}
                  type="button"
                  onClick={() => onDelete(chat.id)}
                >
                  {isDeleting ? (
                    <Loader2 aria-hidden className="spin" size={14} />
                  ) : (
                    <Trash2 aria-hidden size={14} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
        {hasMoreChats && !query.trim() ? (
          <button
            className="button subtle small load-more-chats"
            disabled={loadingMoreChats}
            type="button"
            onClick={onLoadMoreChats}
          >
            {loadingMoreChats ? "Loading…" : "Load more chats"}
          </button>
        ) : null}
        {hasMoreChats && query.trim() ? (
          <p className="muted small">Search covers loaded chats only.</p>
        ) : null}
      </div>
    </aside>
  );
}
