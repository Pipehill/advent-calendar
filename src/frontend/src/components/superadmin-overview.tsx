import { useRef } from 'react';
import * as m from '../generated/paraglide/messages.js';
import type { RouterContext } from '../router';
import { AccountList } from './account-list';
import { SuperadminCalendarList } from './superadmin-calendar-list';
import { Button } from './ui/button';

export type OverviewTab = 'users' | 'calendars';
const tabs: OverviewTab[] = ['users', 'calendars'];

export function SuperadminOverview({
  context,
  selected,
  onSelect,
}: {
  context: RouterContext;
  selected: OverviewTab;
  onSelect: (tab: OverviewTab) => void;
}) {
  const buttons = useRef<Partial<Record<OverviewTab, HTMLButtonElement | null>>>({});
  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label={m.personal_sections()}
        className="flex gap-2 border-b border-stone-200 pb-3"
      >
        {tabs.map((tab, index) => (
          <Button
            key={tab}
            ref={(element) => {
              buttons.current[tab] = element;
            }}
            role="tab"
            id={`overview-tab-${tab}`}
            aria-controls={`overview-panel-${tab}`}
            aria-selected={selected === tab}
            tabIndex={selected === tab ? 0 : -1}
            variant={selected === tab ? 'primary' : 'secondary'}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => {
              const positions: Record<string, number> = {
                ArrowRight: (index + 1) % tabs.length,
                ArrowLeft: (index + tabs.length - 1) % tabs.length,
                Home: 0,
                End: tabs.length - 1,
              };
              const position = positions[event.key];
              if (position === undefined) return;
              event.preventDefault();
              const next = tabs[position];
              buttons.current[next]?.focus();
              onSelect(next);
            }}
          >
            {tab === 'users' ? m.personal_users_tab() : m.personal_calendars_tab()}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="overview-panel-users"
        aria-labelledby="overview-tab-users"
        hidden={selected !== 'users'}
      >
        {selected === 'users' && <AccountList context={context} actorRole="superadmin" />}
      </div>
      <div
        role="tabpanel"
        id="overview-panel-calendars"
        aria-labelledby="overview-tab-calendars"
        hidden={selected !== 'calendars'}
      >
        {selected === 'calendars' && <SuperadminCalendarList context={context} />}
      </div>
    </div>
  );
}
