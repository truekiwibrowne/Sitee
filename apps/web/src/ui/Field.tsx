import type { InputHTMLAttributes, ReactNode } from 'react';

export const inputClass =
  'min-h-12 w-full rounded-btn border-2 border-card-line bg-white px-4 text-lg font-bold text-ink placeholder:text-muted/60 focus:border-yellow focus:outline-none';

/** A labelled text input. */
export function TextField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      {label}
      <input className={inputClass} {...props} />
    </label>
  );
}

/** A tick box with a big tap target. */
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-btn px-1 font-bold">
      <input type="checkbox" className="size-5 accent-[#24324A]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Red message box for errors. */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-card border-2 border-coral bg-white px-4 py-3 text-coral-shadow">
      {children}
    </p>
  );
}
