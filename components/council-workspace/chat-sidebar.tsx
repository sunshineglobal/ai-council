import Link from "next/link";
import type { KeyboardEvent, RefObject } from "react";
import { History, Loader2, PanelLeft, Plus, Trash2 } from "lucide-react";
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
  running,
  open,
  modal,
  sidebarRef,
  initialFocusRef,
  onClose,
  onDelete
}: {
  chats: ChatSummary[];
  currentThreadId?: string;
  deletingChatId: string | null;
  running: boolean;
  open: boolean;
  modal: boolean;
  sidebarRef: RefObject<HTMLElement>;
  initialFocusRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  onDelete: (chatId: string) => void;
}) {
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
      <div className="chat-list">
        {chats.length === 0 ? <p className="muted small">Saved chats appear here.</p> : null}
        {chats.map((chat) => {
          const isActive = currentThreadId === chat.id;
          const isDeleting = deletingChatId === chat.id;

          return (
            <div className={`chat-row ${isActive ? "active" : ""}`} key={chat.id}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className="chat-link"
                href={`/app/chats/${chat.id}`}
                prefetch={false}
              >
                <strong>{chat.title}</strong>
                <span>{formatDate(chat.updated_at)}</span>
              </Link>
              <button
                aria-label={`Delete ${chat.title}`}
                className="icon-button ghost chat-delete-button"
                disabled={isDeleting || running}
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
          );
        })}
      </div>
    </aside>
  );
}
