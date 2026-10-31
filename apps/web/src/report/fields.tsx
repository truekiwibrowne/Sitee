import type { AnswerValue, TemplateField } from '@site-streak/shared';

// One input per template field type. Big targets throughout: these get used with
// gloves on, in the sun, one-handed.

type FieldProps<F extends TemplateField['type']> = {
  field: Extract<TemplateField, { type: F }>;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
};

export function PickListField({ field, value, onChange }: FieldProps<'pickList'>) {
  return (
    <div role="radiogroup" aria-label={field.label} className="grid grid-cols-2 gap-2">
      {field.options.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && !field.required ? null : option)}
            className={`press min-h-12 rounded-btn border-2 px-3 font-black ${
              on ? 'border-ink bg-ink text-white shadow-chunky-ink' : 'border-card-line bg-white text-ink shadow-chunky-locked'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function NumberField({ field, value, onChange }: FieldProps<'number'>) {
  const n = typeof value === 'number' ? value : null;
  const clamp = (v: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, v));
  const step = (delta: number) => onChange(clamp((n ?? field.min ?? 0) + delta));
  const stepper = 'press size-12 shrink-0 rounded-btn border-2 border-card-line bg-white text-2xl font-black shadow-chunky-locked';

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={stepper} onClick={() => step(-1)} aria-label={`Less ${field.label}`}>
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        aria-label={field.label}
        className="min-h-12 w-full min-w-0 rounded-btn border-2 border-card-line bg-white px-4 text-center text-2xl font-black focus:border-yellow focus:outline-none"
        value={n ?? ''}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      <button type="button" className={stepper} onClick={() => step(1)} aria-label={`More ${field.label}`}>
        +
      </button>
      {field.unit && <span className="shrink-0 font-black text-muted">{field.unit}</span>}
    </div>
  );
}

export function TextField({ field, value, onChange }: FieldProps<'text'>) {
  return (
    <textarea
      aria-label={field.label}
      rows={3}
      maxLength={field.maxLength}
      className="w-full rounded-btn border-2 border-card-line bg-white px-4 py-3 text-lg font-bold focus:border-yellow focus:outline-none"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value === '' && !field.required ? null : e.target.value)}
    />
  );
}

type PhotoProps = {
  field: Extract<TemplateField, { type: 'photo' }>;
  ids: string[];
  urls: Record<string, string>;
  busy: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
};

export function PhotoField({ field, ids, urls, busy, onAdd, onRemove }: PhotoProps) {
  const full = field.maxPhotos !== undefined && ids.length >= field.maxPhotos;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {ids.map((id, i) => (
          <div key={id} className="relative aspect-square overflow-hidden rounded-btn border-2 border-card-line bg-locked">
            {urls[id] && <img src={urls[id]} alt={`${field.label} ${i + 1}`} className="size-full object-cover" />}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-ink/80 text-lg font-black text-white"
            >
              ×
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-btn border-2 border-dashed border-yellow-shadow bg-white text-sm font-black disabled:opacity-60"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#24324A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
            {busy ? 'Saving…' : 'Take photo'}
          </button>
        )}
      </div>
      {field.minPhotos > 0 && (
        <span className={`text-sm font-bold ${ids.length >= field.minPhotos ? 'text-teal-shadow' : 'text-muted'}`}>
          {ids.length} of {field.minPhotos} photos
        </span>
      )}
    </div>
  );
}
