export function AccountOptions({
  accounts,
}: {
  accounts: { id: string; name: string; username: string }[];
}) {
  return accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.username})
    </option>
  ));
}
