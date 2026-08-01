"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * A button that copies text to clipboard with visual feedback.
 * Shows a clipboard icon that transitions to a checkmark for 2s after copying.
 */
export function CopyButton({
  text,
  label,
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API isn't available
      console.error("Failed to copy to clipboard");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors
        ${copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        } ${className}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {label && <span>{copied ? "Copied!" : label}</span>}
    </button>
  );
}
