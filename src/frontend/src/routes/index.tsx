import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/calendars/$id',
      params: { id: '5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026' },
    });
  },
});
