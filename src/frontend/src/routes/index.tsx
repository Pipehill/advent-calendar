import { createFileRoute } from '@tanstack/react-router';
import * as m from '../generated/paraglide/messages.js';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <section className="landing-welcome" aria-labelledby="welcome-heading">
      <h1 id="welcome-heading">{m.landing_heading()}</h1>
      <p>{m.landing_description()}</p>
    </section>
  );
}
