import { Ellipsis, KeyRound, UserCheck, UserMinus, UserPlus, UserX } from 'lucide-react';
import { type Ref, useRef } from 'react';
import * as m from '../generated/paraglide/messages.js';
import type { AccountAction } from '../lib/account-form-values';
import type { AccountMetadata } from '../server/accounts';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function accountActionLabel(action: AccountAction, target: AccountMetadata) {
  if (action === 'reset') return m.admin_reset();
  if (action === 'status') return target.enabled ? m.admin_disable() : m.admin_enable();
  return target.role === 'calendarUser' ? m.admin_promote() : m.admin_demote();
}

export function AccountActions({
  target,
  actorRole,
  disabled,
  triggerRef,
  onSelect,
  onFormFocus,
}: {
  target: AccountMetadata;
  actorRole: string;
  disabled: boolean;
  triggerRef: Ref<HTMLButtonElement>;
  onSelect: (action: AccountAction) => void;
  onFormFocus: () => void;
}) {
  const openingForm = useRef(false);
  if (target.role === 'superadmin' || !['superadmin', 'calendarAdmin'].includes(actorRole))
    return null;
  const actions =
    actorRole === 'superadmin' ? (['reset', 'status', 'role'] as const) : (['reset'] as const);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          size="icon"
          variant="quiet"
          disabled={disabled}
          aria-label={m.admin_account_actions({ name: target.name, username: target.username })}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (openingForm.current) {
            // Radix would otherwise restore the trigger after the form receives focus.
            event.preventDefault();
            openingForm.current = false;
            onFormFocus();
          }
        }}
      >
        {actions.map((action) => {
          const Icon =
            action === 'reset'
              ? KeyRound
              : action === 'status'
                ? target.enabled
                  ? UserX
                  : UserCheck
                : target.role === 'calendarUser'
                  ? UserPlus
                  : UserMinus;
          return (
            <DropdownMenuItem
              key={action}
              disabled={disabled}
              onSelect={() => {
                openingForm.current = true;
                onSelect(action);
              }}
            >
              <Icon aria-hidden="true" />
              {accountActionLabel(action, target)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
