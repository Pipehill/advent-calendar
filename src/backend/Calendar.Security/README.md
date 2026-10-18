# Shared account policy

This database-free library supplies roles, invariant username normalization,
the role-aware Identity password validator and the Geralt Argon2id Identity hasher.
Both the API and interactive offline tool reference it. See
[backend authentication](../authentication.md) for persistence and operator workflows.

`WeakPasswords.sha256` contains sorted unique uppercase SHA-256 fingerprints of
lowercased lines from SecLists
[`Passwords/Common-Credentials/10k-most-common.txt`](https://github.com/danielmiessler/SecLists/blob/913b327317496d062bcc7cace524aaad8a693be2/Passwords/Common-Credentials/10k-most-common.txt).
The source commit is `913b327317496d062bcc7cace524aaad8a693be2`, with 10,001 nonempty
source lines. This is public weak-password data, not account hashes. No password
candidate is checked over the network. Preserve the accompanying
[SecLists MIT license](SecLists.LICENSE) when distributing the data.

To update deliberately, fetch a reviewed immutable source commit, split UTF-8 lines,
remove CR terminators and empty lines, lowercase invariantly, SHA-256 each UTF-8
value, deduplicate and sort uppercase hexadecimal fingerprints. Review source and
license changes, then rerun policy/API/offline-tool verification. No runtime
download or list update occurs at application startup.
