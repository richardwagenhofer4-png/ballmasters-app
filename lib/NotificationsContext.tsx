"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { AppNotification } from "@/lib/notifications";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  newVideo: number;
  newMessage: number;
  bookingUpdate: number;
  newComment: number;
  markRead: (ids: string[]) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  newVideo: 0,
  newMessage: 0,
  bookingUpdate: 0,
  newComment: 0,
  markRead: async () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!uid) { setNotifications([]); return; }
    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", uid),
      where("read", "==", false),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)));
    }, (err) => console.error("[NotificationsProvider]", err));
  }, [uid]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const batch = writeBatch(db);
    for (const id of ids) batch.update(doc(db, "notifications", id), { read: true });
    await batch.commit();
  }, []);

  const value: NotificationsContextValue = {
    notifications,
    unreadCount: notifications.length,
    newVideo: notifications.filter(n => n.type === "new_video").length,
    newMessage: notifications.filter(n => n.type === "new_message").length,
    bookingUpdate: notifications.filter(n =>
      n.type === "booking_approved" || n.type === "booking_declined" || n.type === "booking"
    ).length,
    newComment: notifications.filter(n => n.type === "new_comment").length,
    markRead,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationCounts() {
  return useContext(NotificationsContext);
}
