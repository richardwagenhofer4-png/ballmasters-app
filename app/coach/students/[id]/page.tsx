"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <Link
          href="/coach/dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Dashboard
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-lg">⚽</span>
          <span className="text-sm font-bold text-gray-900">Ballmasters</span>
        </div>
        <div className="w-20" />
      </div>

      {/* Placeholder content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center mb-4 text-2xl font-bold"
          style={{ backgroundColor: "#dcfce7", color: "#14532d" }}
        >
          ?
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Student Profile</h1>
        <p className="text-sm text-gray-400 mb-2">Student ID: {id}</p>
        <p className="text-sm text-gray-500">Coming soon — detailed student analytics and video history.</p>
      </div>
    </main>
  );
}
