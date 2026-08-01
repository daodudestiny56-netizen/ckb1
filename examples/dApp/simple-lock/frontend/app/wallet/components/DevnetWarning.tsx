"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";

/**
 * Persistent warning banner that this wallet is for Devnet testing only.
 * Dismissible for the current session (reappears on page reload).
 */
export function DevnetWarning() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800
      dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-200
      rounded-lg px-4 py-3 flex items-start gap-3 mb-6">
      <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="text-sm font-semibold">Devnet Only</p>
        <p className="text-xs mt-0.5 opacity-80">
          This wallet uses test funds on a local development network. Do not use
          with real CKB or real private keys.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss warning"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
