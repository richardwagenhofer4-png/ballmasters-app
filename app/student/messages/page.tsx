"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { getAthleteCoachId } from "@/lib/getAthleteCoach";
import { getOrCreateThread, markThreadRead, sendMessage, threadId as makeThreadId } from "@/lib/messaging";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Nav Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>;
}
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}
function ProfileIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
  { href: "/student/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/student/messages", label: "Messages", Icon: ChatIcon },
  { href: "/student/profile", label: "Profile", Icon: ProfileIcon },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StudentMessagesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [athleteName, setAthleteName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("");
  const [tid, setTid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadForAthlete, setUnreadForAthlete] = useState(0);

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  // Video attach
  const [videoOptions, setVideoOptions] = useState<VideoOption[]>([]);
  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<VideoOption | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize thread
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    const currentUid = user.uid;
    setUid(currentUid);

    (async () => {
      try {
        // Load athlete profile
        const profileSnap = await getDoc(doc(db, "users", currentUid));
        const profileData = profileSnap.data();
        const name = profileData?.fullName ?? profileData?.name ?? user.displayName ?? "Athlete";
        const avId = profileData?.avatarId ?? "";
        setAthleteName(name);
        setAvatarId(avId);

        // Get coach id
        const cId = await getAthleteCoachId(currentUid);
        if (!cId) {
          setLoading(false);
          return;
        }
        setCoachId(cId);

        // Get coach name
        const coachSnap = await getDoc(doc(db, "users", cId));
        const cName = coachSnap.data()?.fullName ?? coachSnap.data()?.name ?? "Coach";
        setCoachName(cName);

        // Get or create thread
        const newTid = await getOrCreateThread(cId, currentUid, cName, name, avId);
        setTid(newTid);

        // Mark read immediately
        await markThreadRead(newTid, "student").catch(() => {});

        // Load videos for attach
        const videosSnap = await getDocs(
          query(collection(db, "videos"), where("studentIds", "array-contains", currentUid))
        );
        setVideoOptions(
          videosSnap.docs.map(d => ({ id: d.id, title: (d.data().title as string) ?? "Untitled" }))
        );
      } catch (err) {
        console.error("[student/messages] init error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, router]);

  // Real-time messages listener
  useEffect(() => {
    if (!tid) return;
    const q = query(collection(db, "threads", tid, "messages"), orderBy("createdAt", "asc"));
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
      // Mark read when new messages arrive
      await markThreadRead(tid, "student").catch(() => {});
    });
    return unsub;
  }, [tid]);

  // Real-time unread badge for this thread
  useEffect(() => {
    if (!tid) return;
    const unsub = onSnapshot(doc(db, "threads", tid), (snap) => {
      if (snap.exists()) {
        setUnreadForAthlete((snap.data().unreadForAthlete as number) ?? 0);
      }
    });
    return unsub;
  }, [tid]);

  async function handleSend() {
    if (!tid || !uid || sending) return;
    if (!inputText.trim() && !pendingVideo) return;
    setSending(true);
    try {
      await sendMessage(tid, uid, "student", inputText.trim(), pendingVideo ? { videoId: pendingVideo.id, videoTitle: pendingVideo.title } : null);
      setInputText("");
      setPendingVideo(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      console.error("[student/messages] send error:", err);
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

  if (authLoading || loading) {
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

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: "#001c48" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-4 px-4 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Messages</h1>
        {coachName && (
          <p className="text-sm mt-0.5" style={{ color: "rgba(1,255,249,0.75)" }}>with {coachName}</p>
        )}
        {!coachId && !loading && (
          <p className="text-sm mt-0.5 text-gray-400">No coach found yet.</p>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto pb-20 px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ChatIcon className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-sm font-medium text-gray-500">No messages yet.</p>
            <p className="text-xs text-gray-400 mt-1">Send a message to your coach!</p>
          </div>
        )}

        {messages.map((msg) => {
          const isAthlete = msg.senderRole === "student";
          return (
            <div key={msg.id} className={`flex ${isAthlete ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[75%] rounded-2xl px-4 py-2.5"
                style={{
                  backgroundColor: isAthlete ? "#001c48" : "#f3f4f6",
                  color: isAthlete ? "white" : "#111827",
                }}
              >
                {msg.text && (
                  <p className="text-sm leading-snug whitespace-pre-wrap">{msg.text}</p>
                )}
                {msg.videoId && msg.videoTitle && (
                  <Link href={`/student/videos/${msg.videoId}`}>
                    <div
                      className="flex items-center gap-2 mt-1.5 rounded-xl px-3 py-2"
                      style={{ backgroundColor: isAthlete ? "rgba(255,255,255,0.12)" : "rgba(0,28,72,0.07)" }}
                    >
                      <svg className="h-4 w-4 shrink-0" style={{ color: isAthlete ? "#01fff9" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                      </svg>
                      <span className="text-xs font-semibold truncate" style={{ color: isAthlete ? "#01fff9" : "#001c48" }}>
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

      {/* Input row — sticky above bottom nav */}
      {tid && (
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
              placeholder="Message your coach…"
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
      )}

      {/* Video attach bottom sheet */}
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
              {videoOptions.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">No videos available.</p>
              ) : (
                videoOptions.map((v) => (
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

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          const isMessages = item.href === "/student/messages";
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
              <div className="relative">
                <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
                {isMessages && unreadForAthlete > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 absolute -top-0.5 -right-0.5" />
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
