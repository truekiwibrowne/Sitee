import type { ButtonHTMLAttributes } from 'react';

const variants = {
  yellow: 'bg-yellow text-ink shadow-chunky-yellow',
  ink: 'bg-ink text-white shadow-chunky-ink',
  teal: 'bg-teal text-white shadow-chunky-teal',
  coral: 'bg-coral text-white shadow-chunky-coral',
  ghost: 'bg-white text-ink border-2 border-card-line shadow-chunky-locked',
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  /** Spaced capitals, as on the main call-to-action buttons in the mockups. */
  caps?: boolean;
};

/** Chunky rounded button that presses down onto its shadow on tap. */
export function Button({ variant = 'yellow', caps = true, className = '', type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={`press min-h-12 rounded-btn px-5 font-black disabled:opacity-50 disabled:active:translate-y-0 ${caps ? 'tracking-wider uppercase' : ''} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
