import { useEffect, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Numeric settings input with an explicit range check.
 *
 * Values are only committed on blur or Enter, and only when they fall inside
 * `[min, max]`; anything else keeps the field flagged and the stored setting
 * untouched.
 */
export function NumberSetting({
  id,
  label,
  hint,
  invalidMessage,
  min,
  max,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  hint?: string;
  invalidMessage: string;
  min: number;
  max: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(String(value));
    setError(null);
  }, [value]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      setError(invalidMessage);
      return;
    }
    const parsed = Number(trimmed);
    if (parsed < min || parsed > max) {
      setError(invalidMessage);
      return;
    }
    setError(null);
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        invalid={Boolean(error)}
        className="max-w-[160px]"
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(event.currentTarget.value);
        }}
      />
    </Field>
  );
}
