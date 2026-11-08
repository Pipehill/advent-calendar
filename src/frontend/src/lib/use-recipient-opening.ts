import { useEffect, useRef, useState } from 'react';
import type { RecipientCalendarDto, RecipientOpeningDto } from '../generated/backend';
import type { RouterContext } from '../router';
import { recipientContentCurrent } from './recipient-presentation';

export type DoorPresentation = { result: RecipientOpeningDto; origin: HTMLButtonElement };

export function useRecipientOpening(
  context: RouterContext,
  id: string,
  scope: string,
  calendar: RecipientCalendarDto | undefined,
  error: unknown,
  refresh: () => Promise<unknown>,
) {
  const [presentation, setPresentation] = useState<DoorPresentation | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const current = useRef(calendar);
  current.current = calendar;
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const close = () => {
    epoch.current++;
    setPresentation(null);
    context.queryClient.removeQueries({ queryKey: context.trpc.recipient.image.queryKey() });
  };
  // Render-time validation also withholds stale content before this cleanup effect.
  const visible =
    !error && presentation && recipientContentCurrent(calendar, presentation.result)
      ? presentation
      : null;
  useEffect(() => {
    if (presentation && !visible) {
      setPresentation(null);
      context.queryClient.removeQueries({ queryKey: context.trpc.recipient.image.queryKey() });
    }
  }, [presentation, visible, context]);

  const open = async (number: number, origin: HTMLButtonElement) => {
    if (
      busy.current ||
      current.current?.doors.find((door) => door.number === number)?.state !== 'available'
    )
      return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    const request = ++epoch.current;
    try {
      const result = await context.auth.openRecipientDoor({ id, number, scope });
      if (request !== epoch.current) return;
      context.queryClient.setQueryData(
        context.trpc.recipient.get.queryKey({ id, scope }),
        (board) =>
          board
            ? {
                ...board,
                doors: board.doors.map((door) =>
                  door.number === number ? { ...door, openedAt: result.openedAt } : door,
                ),
              }
            : board,
      );
      const validated =
        current.current?.lastModifiedAt === result.lastModifiedAt
          ? current.current
          : await context.queryClient.fetchQuery({
              ...context.trpc.recipient.get.queryOptions({ id, scope }),
              staleTime: 0,
              gcTime: 0,
            });
      if (request === epoch.current && recipientContentCurrent(validated, result))
        setPresentation({ result, origin });
    } catch (cause) {
      if (request === epoch.current) setFailure(cause);
    } finally {
      if (request === epoch.current) {
        busy.current = false;
        setPending(false);
        void refresh();
      }
    }
  };
  return { presentation: visible, pending, failure, open, close };
}
