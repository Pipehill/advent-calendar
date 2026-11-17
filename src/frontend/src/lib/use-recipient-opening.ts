import { useEffect, useRef, useState } from 'react';
import { errorCode } from '../components/error-state';
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
  const [timing, setTiming] = useState<{ number: number; request: number } | null>(null);
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
  const lockedDoor =
    !error && !failure && timing
      ? calendar?.doors.find((door) => door.number === timing.number && door.state === 'locked')
      : undefined;
  useEffect(() => {
    if (timing && !lockedDoor) setTiming(null);
  }, [timing, lockedDoor]);
  useEffect(() => {
    if (presentation && !visible) {
      setPresentation(null);
      context.queryClient.removeQueries({ queryKey: context.trpc.recipient.image.queryKey() });
    }
  }, [presentation, visible, context]);

  const open = async (number: number, origin: HTMLButtonElement) => {
    if (busy.current || error) return;
    const door = current.current?.doors.find((door) => door.number === number);
    const request = ++epoch.current;
    setFailure(null);
    setTiming(door?.state === 'locked' ? { number, request } : null);
    if (door?.state !== 'available') return;
    busy.current = true;
    setPending(true);
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
      let failure = cause;
      if (errorCode(cause) === 'CONFLICT') {
        try {
          // A conflict can also mean empty/changed content; only a fresh board confirms time lock.
          await context.queryClient.cancelQueries({
            queryKey: context.trpc.recipient.get.queryKey({ id, scope }),
            exact: true,
          });
          const board = await context.queryClient.fetchQuery({
            ...context.trpc.recipient.get.queryOptions({ id, scope }),
            staleTime: 0,
            gcTime: 0,
          });
          if (
            request === epoch.current &&
            board.doors.some((door) => door.number === number && door.state === 'locked')
          ) {
            setTiming({ number, request });
            return;
          }
        } catch (refreshFailure) {
          failure = refreshFailure;
        }
      }
      if (request === epoch.current) setFailure(failure);
    } finally {
      if (request === epoch.current) {
        busy.current = false;
        setPending(false);
        void refresh();
      }
    }
  };
  return {
    presentation: visible,
    pending,
    failure,
    lockedDoor,
    timingRequest: timing?.request,
    open,
    close,
  };
}
