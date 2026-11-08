import { type FormEvent, useRef } from 'react';

// A synchronous guard also covers repeated submits before React updates pending state.
export function useFormSubmit(submit: () => Promise<unknown>) {
  const submitting = useRef(false);
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };
}
