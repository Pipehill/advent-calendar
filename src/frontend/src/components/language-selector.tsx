import * as m from '../generated/paraglide/messages.js';
import { getLocale, setLocale } from '../generated/paraglide/runtime.js';

export function LanguageSelector() {
  return (
    <label className="flex items-center gap-3 text-sm text-stone-600">
      <span>{m.language_label()}</span>
      <select
        aria-label={m.language_label()}
        value={getLocale()}
        onChange={(event) => setLocale(event.target.value as 'nb' | 'en')}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800 focus-visible:outline-2 focus-visible:outline-emerald-800"
      >
        <option value="nb">Norsk</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
