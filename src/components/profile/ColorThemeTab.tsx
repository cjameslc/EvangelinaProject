"use client";

import { useColorTheme } from "@/components/ui/ColorThemeProvider";
import { COLOR_THEME_LIST, type ColorThemeId } from "@/lib/colorThemes";
import { CheckIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

/**
 * Personal appearance preference — switches instantly (ColorThemeProvider
 * applies the DOM attribute synchronously) and persists to the account in
 * the background (PATCH /api/profile -> User.colorTheme), same two-step
 * shape as every other save-on-this-page field, but applied optimistically
 * rather than needing an explicit "Save" click — a theme choice is either
 * on immediately or it isn't, unlike a name/email edit worth reviewing
 * first.
 */
export function ColorThemeTab() {
  const { colorTheme, setColorTheme, saving } = useColorTheme();
  const active: ColorThemeId | null = colorTheme;

  return (
    <div className="card mb-5 p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Appearance</h2>
        {saving && <span className="text-[11.5px] text-[var(--gray)]">Saving…</span>}
      </div>
      <p className="mb-4 text-[12.5px] text-[var(--gray)]">
        Your own color theme for this app — only you see it. A theme sets a fixed palette, so the light/dark toggle in the nav turns off while one&rsquo;s active — pick &ldquo;System&rdquo; below to get it back.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Not a ColorThemeConfig — deliberately styled from the live --bg/
            --ink/--skin-primary tokens instead of fixed inline colors, so
            this card always shows whatever light/dark actually looks like
            right now, and setColorTheme(null) is the one way back to it
            once any fixed theme below has been picked. */}
        <button
          type="button"
          onClick={() => setColorTheme(null)}
          aria-pressed={active === null}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 p-4 text-left transition",
            active === null ? "border-[var(--skin-primary,#6c5ce7)]" : "border-[var(--line)] hover:border-[var(--line-2)]"
          )}
          style={{ background: "var(--bg)" }}
        >
          {active === null && (
            <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full" style={{ background: "var(--skin-primary,#6c5ce7)", color: "var(--skin-primary-text,#fff)" }}>
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="text-[14px] font-extrabold" style={{ color: "var(--ink)" }}>System</div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--gray)" }}>Follows the light/dark toggle</div>
          <div className="mt-3 flex gap-2">
            <div className="h-9 flex-1 rounded-lg border" style={{ background: "var(--bg)", borderColor: "var(--line)" }} title="Background" />
            <div className="h-9 flex-1 rounded-lg border" style={{ background: "var(--bg-2)", borderColor: "var(--line)" }} title="Surface" />
            <div className="h-9 flex-1 rounded-lg" style={{ background: "var(--skin-primary,#6c5ce7)" }} title="Primary" />
          </div>
          <div
            aria-hidden="true"
            className="mt-3 w-full rounded-lg px-3 py-2 text-center text-[12.5px] font-bold"
            style={{ background: "var(--skin-primary,#6c5ce7)", color: "var(--skin-primary-text,#fff)" }}
          >
            Preview button
          </div>
        </button>
        {COLOR_THEME_LIST.map((theme) => {
          const isActive = theme.id === active;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setColorTheme(theme.id)}
              aria-pressed={isActive}
              className={cn(
                "relative overflow-hidden rounded-2xl border-2 p-4 text-left transition",
                isActive ? "border-[var(--skin-primary,#6c5ce7)]" : "border-[var(--line)] hover:border-[var(--line-2)]"
              )}
              style={{ background: theme.colors.background }}
            >
              {isActive && (
                <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full" style={{ background: theme.colors.primary, color: theme.colors.buttonText }}>
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="text-[14px] font-extrabold" style={{ color: theme.colors.text }}>{theme.name}</div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: theme.colors.mutedText }}>{theme.tagline}</div>

              <div className="mt-3 flex gap-2">
                <div className="h-9 flex-1 rounded-lg border" style={{ background: theme.colors.background, borderColor: theme.colors.border }} title="Background" />
                <div className="h-9 flex-1 rounded-lg border" style={{ background: theme.colors.surface, borderColor: theme.colors.border }} title="Surface" />
                <div className="h-9 flex-1 rounded-lg" style={{ background: theme.colors.primary }} title="Primary" />
              </div>

              {/* A styled <div>, not a nested <button> — this card is
                  already a <button> (invalid, and not keyboard-reachable
                  HTML to boot), so this is purely a visual preview of what
                  .btn-primary looks like in this theme, not a second real
                  control. */}
              <div
                aria-hidden="true"
                className="mt-3 w-full rounded-lg px-3 py-2 text-center text-[12.5px] font-bold"
                style={{ background: theme.colors.primary, color: theme.colors.buttonText }}
              >
                Preview button
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
