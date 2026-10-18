# Documentation rules

These rules apply to all work in this repository.

## 1. README.md is project documentation

The root `README.md` must only describe the project and how it works, including
local setup, running the project, and testing. It must not mention agents, agent
tools, skills, agent instructions, or agent workflows.

Instructions for agents performing setup, running the project, testing, or other
work belong in `AGENTS.md` or under `.agents/`.

## 2. Keep AGENTS.md minimal

`AGENTS.md` must only contain what is necessary as an entry point: brief
instructions about which shared rules to read and where to find relevant
resources. Detailed rules, workflows, and plans belong in appropriate files
under `.agents/`, linked from the entry point when needed.

Avoid duplicating instructions across files. Update the file that owns the rule.

## 3. Use English for project content

Write project content in English, including documentation, agent instructions,
plans, code comments, commit messages, and pull requests.
Use consistent English terminology unless another language is required by the
content or explicitly requested by the user.

Application interface text follows the
[interface localization rules](architecture.md#interface-localization).

The user may communicate in Norwegian. Respond in Norwegian when appropriate;
this does not change the project's working language.

## 4. Preserve implemented plans as historical records

Plans marked `Status: Implemented (...)` record the decisions and work as they
stood when implemented. Do not edit, rename or delete an implemented plan without
first asking the user and receiving explicit approval for that change. This also
applies to metadata, progress checklists, corrections and supersession notices.
If the user has already explicitly approved the specific change, do not ask again.

A request to update rules, align documentation or implement a newer plan does not
authorize changes to implemented plans. Record new or superseding decisions in
the current unimplemented plan, the plan index, rules or other relevant Markdown
documentation instead. Keep the implemented plan itself unchanged to preserve
history. Other documentation may be updated within the user's authorized scope.
