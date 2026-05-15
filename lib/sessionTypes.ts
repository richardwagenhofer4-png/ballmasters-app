export interface BookedEntry {
  uid: string;
  name: string;
  email: string;
  bookedAt: string;
}

export interface WaitlistEntry {
  uid: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface Session {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  type: "individual" | "group";
  maxCapacity: number;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  bookedBy: BookedEntry[];
  waitlist: WaitlistEntry[];
  status: "available" | "full" | "cancelled";
  createdAt: string;
  school: string;
}

export interface Booking {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  coachId: string;
  date: string;
  startTime: string;
  title: string;
  status: "confirmed" | "cancelled" | "waitlisted" | "pending_approval" | "declined";
  createdAt: string;
  reminderSent: boolean;
  approvalMessage?: string;
}
