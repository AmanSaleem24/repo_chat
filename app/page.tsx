"use client";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;
const KEY = "repo-chat:v1";

type Source = { file_path: string; start_line: number; end_line: number };
type Msg = { role: "user" | "assistant"; text: string; sources?: Source[] };
type Chat = { id: string; repo: string; ready: boolean; messages: Msg[] };

const blank = (): Chat => ({ id: crypto.randomUUID(), repo: "", ready: false, messages: [] });
const clean = (u: string) => u.trim().replace(/\/$/, "");
const label = (c: Chat) => (c.repo ? c.repo.replace("https://github.com/", "") : "New chat");

/* ─── Icons ─────────────────────────────────────────────────────────── */
const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconSidebarToggle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);
const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IconFile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // sidebarOpen = mobile drawer; sidebarCollapsed = desktop collapse
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    try {
      const saved: Chat[] = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (saved.length) { setChats(saved); setActiveId(saved[0].id); setLoaded(true); return; }
    } catch {}
    const c = blank();
    setChats([c]);
    setActiveId(c.id);
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(chats)); }, [chats, loaded]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chats]);

  const chat = chats.find((c) => c.id === activeId);
  if (!chat) return null;

  const patch = (id: string, fn: (c: Chat) => Chat) =>
    setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  const open = (id: string) => {
    setActiveId(id);
    setStatus(""); setRepoInput(""); setQ("");
    setSidebarOpen(false); // close mobile drawer on nav
  };

  const startNew = () => {
    if (!chat.ready) return open(chat.id);
    const c = blank();
    setChats((cs) => [c, ...cs]);
    open(c.id);
  };

  const remove = (id: string) => {
    const rest = chats.filter((c) => c.id !== id);
    if (!rest.length) { const c = blank(); setChats([c]); open(c.id); }
    else { setChats(rest); if (id === activeId) open(rest[0].id); }
  };

  const toggleSidebar = () => {
    if (isMobile) setSidebarOpen((v) => !v);
    else setSidebarCollapsed((v) => !v);
  };

  const ingest = async () => {
    const url = clean(repoInput);
    if (!url || busy) return;
    setBusy(true);
    setStatus("Indexing repository. Large repos can take a minute.");
    try {
      const res = await fetch(`${API}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Indexing failed");
      patch(chat.id, (c) => ({ ...c, repo: url, ready: true }));
      setStatus("");
    } catch (e: any) { setStatus(e.message); }
    setBusy(false);
  };

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    const { id, repo } = chat;
    setQ(""); setBusy(true);
    patch(id, (c) => ({
      ...c,
      messages: [...c.messages, { role: "user", text: question }, { role: "assistant", text: "" }],
    }));
    const update = (fn: (m: Msg) => Msg) =>
      patch(id, (c) => ({ ...c, messages: [...c.messages.slice(0, -1), fn(c.messages[c.messages.length - 1])] }));
    try {
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repo, question, session_id: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        update((m) => ({ ...m, text: d.detail || "Something went wrong. Try again." }));
        setBusy(false); return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop()!;
        for (const ev of events) {
          let name = "message", data = "";
          for (const line of ev.split("\n")) {
            if (line.startsWith("event: ")) name = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (name === "sources") update((m) => ({ ...m, sources: JSON.parse(data) }));
          else if (name === "message") update((m) => ({ ...m, text: m.text + JSON.parse(data) }));
        }
      }
    } catch { update((m) => ({ ...m, text: m.text || "Connection lost. Try again." })); }
    setBusy(false);
  };

  // Sidebar CSS classes
  const sidebarClass = [
    "sidebar",
    isMobile && sidebarOpen ? "open" : "",
    !isMobile && sidebarCollapsed ? "collapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="shell">
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="brand-icon"><IconCode /></div>
          <span className="brand-name">RepoChat</span>
        </div>

        <div style={{ padding: "8px 14px 0" }}>
          <button id="btn-new-chat" onClick={startNew} disabled={busy} className="btn-new-chat focus-ring">
            <IconPlus /> New chat
          </button>
        </div>

        <nav className="chat-nav">
          <span className="chat-nav-label">Recent</span>
          {chats.map((c) => (
            <div key={c.id} className={`chat-item ${c.id === activeId ? "active" : ""}`}>
              <button id={`chat-${c.id}`} onClick={() => open(c.id)} disabled={busy}
                className="chat-item-btn focus-ring" title={label(c)}>
                {label(c)}
              </button>
              <button onClick={() => remove(c.id)} disabled={busy}
                aria-label="Delete chat" className="chat-item-del focus-ring">
                ×
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        {/* Top bar */}
        <header className="topbar">
          {/* Single toggle button — collapses desktop, opens drawer on mobile */}
          <button
            id="btn-sidebar-toggle"
            onClick={toggleSidebar}
            className="sidebar-toggle focus-ring"
            aria-label="Toggle sidebar"
          >
            <IconSidebarToggle />
          </button>

          {chat.ready ? (
            <a href={chat.repo} target="_blank" rel="noreferrer"
              id="repo-link" className="repo-pill focus-ring">
              <IconLink />{label(chat)}
            </a>
          ) : (
            <span className="topbar-subtitle">Chat with any GitHub repository</span>
          )}
        </header>

        {/* ── Welcome / Ingest ── */}
        {!chat.ready ? (
          <div className="welcome-wrap">
            <div className="welcome-card">
              <div className="welcome-glow"><IconCode /></div>
              <h1 className="welcome-heading">Explore any GitHub repo with AI</h1>
              <p className="welcome-sub">
                Paste a public GitHub link and start asking questions about the codebase.
                Each chat is tied to one repo — start a new chat to switch repos.
              </p>
              <div className="repo-input-row">
                <input id="repo-url-input" value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ingest()}
                  placeholder="https://github.com/user/repo"
                  className="repo-input focus-ring" />
                <button id="btn-index" onClick={ingest}
                  disabled={busy || !repoInput.trim()} className="btn-index focus-ring">
                  {busy ? "Indexing…" : "Index repo"}
                </button>
              </div>
              {status && (
                <p className={`status-msg ${busy ? "loading" : "error"}`}>
                  {busy ? (<><span className="dot" /><span className="dot" /><span className="dot" /><span style={{ marginLeft: 4 }}>{status}</span></>) : status}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Messages ── */}
            <div className="messages-wrap">
              <div className="messages-inner">
                {chat.messages.length === 0 && (
                  <p className="empty-hint">
                    <strong style={{ color: "var(--accent)" }}>{label(chat)}</strong> is indexed.<br />
                    Ask how something works, where a function lives, or anything about the code.
                  </p>
                )}
                {chat.messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="msg-user">
                      <div className="bubble-user">{m.text}</div>
                    </div>
                  ) : (
                    <div key={i} className="msg-assistant">
                      <div className="bubble-assistant">
                        {m.text || (
                          <span className="thinking-text">
                            <span className="dot" /><span className="dot" /><span className="dot" />
                            &nbsp;Searching the code
                          </span>
                        )}
                      </div>
                      {m.sources && m.text && (
                        <div className="sources-row">
                          {m.sources.map((s, j) => (
                            <a key={j}
                              href={`${chat.repo}/blob/HEAD/${s.file_path}#L${s.start_line}-L${s.end_line}`}
                              target="_blank" rel="noreferrer" className="source-chip focus-ring">
                              <IconFile />{s.file_path}:{s.start_line}–{s.end_line}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
                <div ref={bottom} />
              </div>
            </div>

            {/* ── Input ── */}
            <div className="input-footer">
              <div className="input-row">
                <input id="chat-input" value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask()}
                  placeholder="Ask about this repo…"
                  className="chat-input" disabled={busy} />
                <button id="btn-send" onClick={ask} disabled={busy || !q.trim()}
                  aria-label="Send message" className="btn-send focus-ring">
                  <IconSend />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
