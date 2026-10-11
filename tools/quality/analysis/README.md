# Advisory analyzer dependencies

This separate npm package pins jscpd 5.4.1 and its platform-specific native binary.
Run `node tools/quality/install-analysis.mjs` from the repository root to install
from the lockfile. Developer setup runs this command and reuses a matching installation.
The installed wrapper and native binary support Windows x64/ARM64, macOS x64/ARM64,
and Linux x64/ARM64 with GNU or musl. Unsupported architectures fail explicitly.

These packages are separate from container linter dependencies. MegaLinter's bundled
jscpd version is not used or enabled as a copy/paste gate. Both the MCP launcher and
CLI reports resolve the same installed 5.4.1 binary and `.jscpd.json` settings.
