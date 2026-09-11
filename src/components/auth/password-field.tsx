"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * One password box, shown in the clear until the parent hides it.
 *
 * Kelly Watson (Frozen Jr., 8 Sep 2026) chose a password at sign-up, could not
 * sign in with it eight times, and then could not save a new one on her phone
 * across four reset links. Two hidden boxes and a browser's own validation
 * bubble ("please lengthen this text…") were the whole obstacle course:
 *
 * - Visible by default, so a typo is seen, not discovered at the next sign-in.
 *   A text box also keeps iOS from taking the field over with its own
 *   suggested password, which it does to `type="password"` boxes marked
 *   new-password and which reads as "a prompt that would not let me type".
 * - No confirm box. With the password in view there is nothing to confirm.
 * - No native minLength: the length rule is printed under the box and enforced
 *   by the form that owns it, in its own words, where the parent can read it.
 * - autoCapitalize off, because a phone keyboard capitalizing the first letter
 *   of a visible text box is a password that will never match again.
 */
export function PasswordField({
  id = "password",
  name = "password",
  label = "Password",
  autoComplete = "new-password",
  defaultVisible = true,
  hint = "At least 8 characters.",
  ...rest
}: {
  id?: string;
  name?: string;
  label?: string;
  autoComplete?: "new-password" | "current-password";
  defaultVisible?: boolean;
  hint?: string | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "name" | "autoComplete">) {
  const [visible, setVisible] = useState(defaultVisible);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {visible ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        {...rest}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
