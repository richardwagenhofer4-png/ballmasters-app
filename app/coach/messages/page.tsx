"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { markThreadRead, sendMessage } from "@/lib/messaging";
import InitialsAvatar from "@/components/InitialsAvatar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreadDoc {
  id: string;
  coachId: string;
  athleteId: string;
  coachName: string;
  athleteName: string;
  athleteAvatarId: string;
  lastMessage: string;
  lastSenderRole: "coach" | "student" | null;
  lastAt: { seconds: number; nanoseconds: number } | null;
  unreadForCoach: number;
  unreadForAthlete: number;
}

interface Message {
  id: string;
  senderId: string;
  senderRole: "coach" | "student";
  text: string;
  videoId: string | null;
  videoTitle: string | null;
  createdAt: { seconds: number; nanoseconds: number } | null;
}

interface VideoOption {
  id: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ts: { seconds: number } | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts.seconds * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ---------------------------------------------------------------------------
// Nav Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function StudentsIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>;
}
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachMessagesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  const [uid, setUid] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadDoc[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  // Conversation view state
  const [view, setView] = useState<"list" | "thread">("list");
  const [activeThread, setActiveThread] = useState<ThreadDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  // Video attach
  const [athleteVideos, setAthleteVideos] = useState<VideoOption[]>([]);
  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<VideoOption | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    setUid(user.uid);
  }, [authLoading, user, router]);

  // Real-time threads listener
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "threads"),
      where("coachId", "==", uid),
      orderBy("lastAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: ThreadDoc[] = snap.docs.map(d => ({
        id: d.id,
        coachId: d.data().coachId as string,
        athleteId: d.data().athleteId as string,
        coachName: (d.data().coachName as string) ?? "",
        athleteName: (d.data().athleteName as string) ?? "Athlete",
        athleteAvatarId: (d.data().athleteAvatarId as string) ?? "",
        lastMessage: (d.data().lastMessage as string) ?? "",
        lastSenderRole: (d.data().lastSenderRole as "coach" | "student" | null) ?? null,
        lastAt: d.data().lastAt ?? null,
        unreadForCoach: (d.data().unreadForCoach as number) ?? 0,
        unreadForAthlete: (d.data().unreadForAthlete as number) ?? 0,
      }));
      setThreads(list);
      setTotalUnread(list.reduce((s, t) => s + t.unreadForCoach, 0));
    });
    return unsub;
  }, [uid]);

  // Real-time messages for active thread
  useEffect(() => {
    if (!activeThread) return;
    const q = query(
      collection(db, "threads", activeThread.id, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, async (snap) => {
      const msgs: Message[] = snap.docs.map(d => ({
        id: d.id,
        senderId: d.data().senderId as string,
        senderRole: d.data().senderRole as "coach" | "student",
        text: (d.data().text as string) ?? "",
        videoId: (d.data().videoId as string | null) ?? null,
        videoTitle: (d.data().videoTitle as string | null) ?? null,
        createdAt: d.data().createdAt ?? null,
      }));
      setMessages(msgs);
      await markThreadRead(activeThread.id, "coach").catch(() => {});
    });
    return unsub;
  }, [activeThread]);

  async function openThread(thread: ThreadDoc) {
    setActiveThread(thread);
    setView("thread");
    setMessages([]);
    setInputText("");
    setPendingVideo(null);
    // Load athlete videos
    try {
      const videosSnap = await getDocs(
        query(collection(db, "videos"), where("studentIds", "array-contains", thread.athleteId))
      );
      setAthleteVideos(
        videosSnap.docs.map(d => ({ id: d.id, title: (d.data().title as string) ?? "Untitled" }))
      );
    } catch (err) {
      console.error("[coach/messages] load videos error:", err);
    }
    // Mark read on open
    await markThreadRead(thread.id, "coach").catch(() => {});
  }

  function backToList() {
    setView("list");
    setActiveThread(null);
    setMessages([]);
  }

  async function handleSend() {
    if (!activeThread || !uid || sending) return;
    if (!inputText.trim() && !pendingVideo) return;
    setSending(true);
    try {
      await sendMessage(
        activeThread.id,
        uid,
        "coach",
        inputText.trim(),
        pendingVideo ? { videoId: pendingVideo.id, videoTitle: pendingVideo.title } : null
      );
      setInputText("");
      setPendingVideo(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      console.error("[coach/messages] send error:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#001c48" }}>
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  const canSend = (inputText.trim().length > 0 || pendingVideo !== null) && !sending;

  const NAV_ITEMS = [
    { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
    { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
    { href: "/coach/students", label: "Athletes", Icon: StudentsIcon },
    { href: "/coach/calendar", label: "Calendar", Icon: CalendarIcon },
    { href: "/coach/messages", label: "Messages", Icon: ChatIcon },
  ];

  return (
    <main className="min-h-screen flex flex-col bg-gray-50 pb-20">

      {/* --------------------------------------------------------------------- */}
      {/* Thread list view                                                       */}
      {/* --------------------------------------------------------------------- */}
      {view === "list" && (
        <>
          {/* Header */}
          <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
            </div>
            <h1 className="text-2xl font-extrabold text-white">Messages</h1>
            <p className="text-xs mt-0.5" style={{ color: "#01fff9" }}>{threads.length} conversation{threads.length !== 1 ? "s" : ""}</p>
          </div>

          {/* Thread list */}
          <div className="flex-1 px-4 py-4">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ChatIcon className="h-12 w-12 text-gray-200 mb-4" />
                <p className="text-sm font-medium text-gray-500">No conversations yet.</p>
                <p className="text-xs text-gray-400 mt-1">Conversations will appear here once athletes message you.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {threads.map((thread, i) => (
                  <button
                    key={thread.id}
                    onClick={() => openThread(thread)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition text-left"
                    style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                  >
                    <InitialsAvatar
                      name={thread.athleteName}
                      id={thread.athleteId}
                      size={40}
                      variant="student"
                      avatarId={thread.athleteAvatarId || undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{thread.athleteName}</span>
                        <span className="text-xs text-gray-400 shrink-0">{relativeTime(thread.lastAt)}</span>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{thread.lastMessage || "No messages yet"}</p>
                    </div>
                    {thread.unreadForCoach > 0 && (
                      <span
                        className="shrink-0 h-5 min-w-[20px] flex items-center justify-center rounded-full text-xs font-bold text-white px-1.5"
                        style={{ backgroundColor: "#001c48" }}
                      >
                        {thread.unreadForCoach}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* Conversation view                                                      */}
      {/* --------------------------------------------------------------------- */}
      {view === "thread" && activeThread && (
        <>
          {/* Header */}
          <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-4 px-4 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={backToList}
                className="p-1 -ml-1 transition"
                style={{ color: "rgba(1,255,249,0.8)" }}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                </svg>
              </button>
              <InitialsAvatar
                name={activeThread.athleteName}
                id={activeThread.athleteId}
                size={32}
                variant="student"
                avatarId={activeThread.athleteAvatarId || undefined}
              />
              <h1 className="text-lg font-bold text-white truncate flex-1">{activeThread.athleteName}</h1>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ChatIcon className="h-12 w-12 text-gray-200 mb-4" />
                <p className="text-sm font-medium text-gray-500">No messages yet.</p>
                <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation.</p>
              </div>
            )}
            {messages.map((msg) => {
              const isCoach = msg.senderRole === "coach";
              return (
                <div key={msg.id} className={`flex ${isCoach ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-4 py-2.5"
                    style={{
                      backgroundColor: isCoach ? "#001c48" : "#f3f4f6",
                      color: isCoach ? "white" : "#111827",
                    }}
                  >
                    {msg.text && (
                      <p className="text-sm leading-snug whitespace-pre-wrap">{msg.text}</p>
                    )}
                    {msg.videoId && msg.videoTitle && (
                      <Link href={`/coach/videos/${msg.videoId}/annotate`}>
                        <div
                          className="flex items-center gap-2 mt-1.5 rounded-xl px-3 py-2"
                          style={{ backgroundColor: isCoach ? "rgba(255,255,255,0.12)" : "rgba(0,28,72,0.07)" }}
                        >
                          <svg className="h-4 w-4 shrink-0" style={{ color: isCoach ? "#01fff9" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                          </svg>
                          <span className="text-xs font-semibold truncate" style={{ color: isCoach ? "#01fff9" : "#001c48" }}>
                            {msg.videoTitle}
                          </span>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div
            className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 64px)" }}
          >
            {/* Pending video chip */}
            {pendingVideo && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <div
                  className="flex items-center gap-1.5 rounded-full px-3 py-1"
                  style={{ backgroundColor: "rgba(1,255,249,0.1)", color: "#001c48" }}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                  </svg>
                  <span className="text-xs font-medium truncate max-w-[160px]">{pendingVideo.title}</span>
                  <button onClick={() => setPendingVideo(null)} className="ml-0.5 text-gray-400 hover:text-gray-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Video attach button */}
              <button
                onClick={() => setShowVideoSheet(true)}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg transition"
                style={{ backgroundColor: "#f3f4f6", color: "#6b7280" }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                </svg>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${activeThread.athleteName}…`}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition"
                style={{ maxHeight: "120px", overflow: "auto" }}
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#001c48" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Video attach sheet */}
          {showVideoSheet && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowVideoSheet(false)} />
              <div className="relative bg-white rounded-t-2xl w-full max-w-md" style={{ maxHeight: "60vh", display: "flex", flexDirection: "column" }}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900">Attach a Video</h2>
                  <button onClick={() => setShowVideoSheet(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1">
                  {athleteVideos.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-gray-400 text-center">No videos for this athlete.</p>
                  ) : (
                    athleteVideos.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { setPendingVideo(v); setShowVideoSheet(false); }}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 active:bg-gray-100 transition text-left border-b border-gray-100 last:border-0"
                      >
                        <svg className="h-5 w-5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-800 truncate">{v.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          const isMessages = item.href === "/coach/messages";
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
              <div className="relative">
                <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
                {isMessages && totalUnread > 0 && (
                  <span
                    className="absolute -top-1 -right-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full text-white px-0.5"
                    style={{ backgroundColor: "#001c48", fontSize: "9px", fontWeight: 700 }}
                  >
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
