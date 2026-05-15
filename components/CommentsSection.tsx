"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, addDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  role: "coach" | "student";
  text: string;
  createdAt: string;
  parentId: string | null;
}

interface Props {
  videoId: string;
  uid: string;
  authorName: string;
  role: "coach" | "student";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CommentsSection({ videoId, uid, authorName, role }: Props) {
  const isCoach = role === "coach";
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, "videos", videoId, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }));

      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
        seenIdsRef.current = new Set(docs.map(d => d.id));
      } else if (isCoach) {
        const incoming = docs.filter(d => !seenIdsRef.current.has(d.id));
        if (incoming.length > 0) {
          const ids = incoming.map(d => d.id);
          ids.forEach(id => seenIdsRef.current.add(id));
          setNewIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s; });
          setTimeout(() => {
            setNewIds(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
          }, 5000);
        }
      }

      setComments(docs);
    });
    return unsub;
  }, [videoId, isCoach]);

  async function submitComment(parentId: string | null, txt: string) {
    if (!txt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "videos", videoId, "comments"), {
        authorId: uid,
        authorName,
        role,
        text: txt.trim(),
        createdAt: new Date().toISOString(),
        parentId,
      });
      if (parentId === null) setText("");
      else { setReplyText(""); setReplyTo(null); }
    } finally {
      setSubmitting(false);
    }
  }

  const topLevel = comments.filter(c => c.parentId === null);
  const repliesFor = (parentId: string) => comments.filter(c => c.parentId === parentId);

  return (
    <div className="px-4 pt-4 pb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Comments
        {comments.length > 0 && (
          <span className="ml-2 text-xs font-normal text-gray-400">{comments.length}</span>
        )}
      </h3>

      <div className="divide-y divide-gray-100 mb-4">
        {topLevel.length === 0 ? (
          <p className="py-5 text-center text-xs text-gray-400">
            No comments yet — be the first!
          </p>
        ) : (
          topLevel.map(c => {
            const isNew = isCoach && newIds.has(c.id);
            const replies = repliesFor(c.id);
            return (
              <div key={c.id}>
                {/* Top-level comment */}
                <div
                  className="py-3 transition-colors"
                  style={isNew ? { backgroundColor: "#fefce8", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 } : {}}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-semibold text-gray-800">{c.authorName}</span>
                    {c.role === "coach" && (
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: "#001c48", color: "#01fff9" }}
                      >
                        Coach
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{c.text}</p>
                  {isCoach && (
                    <button
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                      className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {replyTo === c.id ? "Cancel" : "↩ Reply"}
                    </button>
                  )}
                  {replyTo === c.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitComment(c.id, replyText);
                          }
                        }}
                        placeholder="Write a reply…"
                        className="flex-1 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
                        onFocus={e => (e.target.style.borderColor = "#001c48")}
                        onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
                      />
                      <button
                        onClick={() => submitComment(c.id, replyText)}
                        disabled={!replyText.trim() || submitting}
                        className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 transition"
                        style={{ backgroundColor: "#001c48" }}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>

                {/* Replies */}
                {replies.map(r => {
                  const isReplyNew = isCoach && newIds.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className="py-2.5 pl-3 border-l-2 border-gray-100 ml-5 transition-colors"
                      style={isReplyNew ? { backgroundColor: "#fefce8" } : {}}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-gray-800">{r.authorName}</span>
                        {r.role === "coach" && (
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "#001c48", color: "#01fff9" }}
                          >
                            Coach
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{timeAgo(r.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{r.text}</p>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* New comment input */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitComment(null, text);
            }
          }}
          placeholder={isCoach ? "Add a coaching note…" : "Add a comment…"}
          className="flex-1 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
          onFocus={e => (e.target.style.borderColor = "#001c48")}
          onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
        />
        <button
          onClick={() => submitComment(null, text)}
          disabled={!text.trim() || submitting}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40 transition"
          style={{ backgroundColor: "#001c48" }}
        >
          Post
        </button>
      </div>
    </div>
  );
}
