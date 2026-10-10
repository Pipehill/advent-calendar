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
plans, code comments, user interface text, commit messages, and pull requests.
Use consistent English terminology unless another language is required by the
content or explicitly requested by the user.

The user may communicate in Norwegian. Respond in Norwegian when appropriate;
this does not change the project's working language.
