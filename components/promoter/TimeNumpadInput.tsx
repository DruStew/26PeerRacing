"use client";

import { useCallback } from "react";

const MAX_LEN = 10;

function appendTimeChar(current: string, ch: string): string {
  if (ch === "backspace") return current.slice(0, -1);
  if (ch === ":") {
    if (!current || current.endsWith(":")) return current;
    if ((current.match(/:/g) ?? []).length >= 2) return current;
    return `${current}:`;
  }
  if (!/^\d$/.test(ch)) return current;
  if (current.length >= MAX_LEN) return current;
  return `${current}${ch}`;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ":", "0", "backspace"] as const;

export function TimeNumpadInput({
  value,
  onChange,
  placeholder = "0:00:00",
  disabled = false,
  open,
  onOpenChange,
}: Props) {
  const press = useCallback(
    (key: (typeof KEYPAD_KEYS)[number]) => {
      onChange(appendTimeChar(value, key));
    },
    [value, onChange],
  );

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`w-full rounded-lg border px-3 py-2.5 text-left font-mono text-base tabular-nums text-[#1E3A5F] transition-colors disabled:opacity-50 ${
          open
            ? "border-[#E87722] ring-2 ring-[#E87722]/25"
            : "border-[#1E3A5F]/20 hover:border-[#1E3A5F]/35"
        }`}
      >
        {value ? (
          value
        ) : (
          <span className="text-[#1E3A5F]/40">{placeholder}</span>
        )}
      </button>

      {open && !disabled ? (
        <div className="mt-2 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-2">
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Time keypad">
            {KEYPAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className={`rounded-lg py-3 text-lg font-semibold tabular-nums transition-colors active:scale-[0.98] ${
                  key === "backspace"
                    ? "bg-white text-[#1E3A5F] ring-1 ring-[#1E3A5F]/15 hover:bg-[#fff8f3]"
                    : key === ":"
                      ? "bg-[#1E3A5F] text-white hover:bg-[#1E3A5F]/90"
                      : "bg-white text-[#1E3A5F] ring-1 ring-[#1E3A5F]/15 hover:bg-[#fff8f3]"
                }`}
              >
                {key === "backspace" ? "⌫" : key}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-2 w-full rounded-lg border border-[#1E3A5F]/15 bg-white py-2 text-xs font-semibold text-[#1E3A5F]/70 hover:border-[#E87722]/40 hover:text-[#E87722]"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
