import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ErrorState, errorCode } from '../components/error-state';
import { Card, CardContent } from '../components/ui/card';
import * as m from '../generated/paraglide/messages.js';

export const Route = createFileRoute('/calendars/$id')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.trpc.calendar.get.queryOptions({ id: params.id }),
      );
      return { failure: null };
    } catch (error) {
      return { failure: errorCode(error) };
    }
  },
  pendingComponent: () => <p role="status">{m.loading()}</p>,
  component: CalendarPage,
});

function CalendarPage() {
  const { id } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const { failure } = Route.useLoaderData();
  const query = useQuery({ ...trpc.calendar.get.queryOptions({ id }), enabled: !failure });
  if (failure || query.error) return <ErrorState code={failure || errorCode(query.error)} />;
  if (!query.data) return <p role="status">{m.loading()}</p>;
  return (
    <>
      <div className="mb-10 text-center">
        <h1 className="break-words font-serif text-4xl leading-tight text-emerald-950 sm:text-5xl">
          {query.data.title}
        </h1>
        <p className="mt-4 text-stone-600">{m.calendar_subtitle()}</p>
      </div>
      <ol
        aria-label={m.doors_label()}
        className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6"
      >
        {query.data.doors.map((door) => (
          <li key={door.number} aria-label={m.door_label({ number: String(door.number) })}>
            <Card className="door-tile">
              <CardContent className="flex aspect-square items-center justify-center p-4">
                <span className="font-serif text-4xl text-emerald-950">{door.number}</span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
