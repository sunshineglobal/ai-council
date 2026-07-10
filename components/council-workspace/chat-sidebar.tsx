import Link from "next/link";
import { History, Loader2, PanelLeft, Plus, Trash2 } from "lucide-react";
import type { ChatSummary } from "@/components/council-workspace/types";
import { formatDate } from "@/components/council-workspace/result-utils";

export function ChatSidebar({
  chats,
  currentThreadId,
  deletingChatId,
  running,
  open,
  onClose,
  onDelete
}: {
  chats: ChatSummary[];
  currentThreadId?: string;
  deletingChatId: string | null;
  running: boolean;
  open: boolean;
  onClose: () => void;
  onDelete: (chatId: string) => void;
}) {
  return (
    <aside
      aria-hidden={!open}
      aria-label="Chat history"
      className="sidebar"
      id="chat-history-sidebar"
      inert={!open}
    >
      <div className="sidebar-top">
        <Link className="new-chat-button" href="/app" prefetch={false}>
          <Plus aria-hidden size={16} />
          New chat
        </Link>
        <button
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
