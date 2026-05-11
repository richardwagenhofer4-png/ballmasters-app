"use client";

import { useState, useEffect } from "react";

interface Props {
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteAccountModal({ isOpen, loading, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const confirmed = confirmText === "DELETE";

  useEffect(() => {
    if (isOpen) setConfirmText("");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!loading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-xl font-bold text-gray-900 mb-2">
          Delete your account
        </h2>
        <p className="text-center text-sm text-gray-500 mb-6">
          This will permanently delete your account and all your data. This cannot be undone.
        </p>

        {/* Confirm input */}
        <div className="mb-6">
          <label htmlFor="deleteConfirm" className="block text-sm font-medium text-gray-700 mb-2">
            Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
          </label>
          <input
            id="deleteConfirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            disabled={loading}
            className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 transition disabled:opacity-60 bg-white"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border-2 border-gray-300 py-3 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 rounded-lg py-3 text-sm font-semibold text-white transition"
            style={{
              backgroundColor: confirmed && !loading ? "#dc2626" : "#fca5a5",
              cursor: confirmed && !loading ? "pointer" : "not-allowed",
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deleting…
              </span>
            ) : (
              "Delete account"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
