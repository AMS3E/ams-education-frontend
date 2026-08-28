"use client";

import { useActionState } from "react";
import { css } from "@/styled-system/css";
import { loginAction } from "@/lib/auth/actions";
import { ac } from "./tokens";
import { BrandLockup } from "./brand";
import { Surface, Field, Input, Button } from "./ui";

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <Surface className={css({ width: "100%", maxWidth: "380px", borderRadius: "16px" })} style={{ boxShadow: ac.shadowMd }}>
      <form action={action} className={css({ padding: "32px" })}>
        {/* Brand — literally the same lockup the sidebar carries (same asset,
            same rendered width), so the sign-in page and the tool behind it are
            recognisably one product. */}
        <div className={css({ marginBottom: "20px" })}>
          <BrandLockup />
        </div>

        <h1 className={css({ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em" })}>Sign in</h1>
        <p className={css({ fontSize: "13px", marginTop: "4px", marginBottom: "22px" })} style={{ color: ac.muted }}>
          Use your WordPress username and password.
        </p>

        <div className={css({ display: "flex", flexDirection: "column", gap: "14px" })}>
          <Field label="Username">
            <Input
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              disabled={pending}
            />
          </Field>

          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required disabled={pending} />
          </Field>
        </div>

        {state?.error ? (
          <p
            role="alert"
            className={css({ fontSize: "12.5px", marginTop: "16px", padding: "9px 11px", borderRadius: "9px", lineHeight: 1.5 })}
            style={{ color: ac.danger, background: ac.dangerTint, border: `1px solid ${ac.danger}` }}
          >
            {state.error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          className={css({ width: "100%", marginTop: "20px" })}
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Surface>
  );
}
