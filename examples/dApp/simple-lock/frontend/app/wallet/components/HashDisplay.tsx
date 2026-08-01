"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { truncateHash } from "../wallet-utils";

/**
 * Displays a hex hash or CKB address in truncated form with copy functionality.
 * Click the text to toggle between truncated and full display.
 * Always shows a copy button alongside.
 */
export function HashDisplay({
  hash,
  chars = 8,
  className = "",
  label,
}: {
  hash: string;
  chars?: number;
  className?: string;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {label && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {label}
        </span>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-mono text-sm hover:text-accent-600 dark:hover:text-accent-400
          transition-colors cursor-pointer break-all text-left"
        title={expanded ? "Click to collapse" : "Click to expand full address"}
      >
        {expanded ? hash : truncateHash(hash, chars)}
      </button>
      <CopyButton text={hash} />
    </div>
  );
}
