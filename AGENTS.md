# Repository instructions

These rules apply to all plans and implementation work in this repository.

## Planning
- Identify the source and test modules affected by a change.
- Include documentation updates when adding a module or changing its responsibilities.

## Source code
- Put application source code under `src/`, grouped into module directories by responsibility.

## Tests
- Put test code under `test/`, grouped into modules mirroring `src/` where practical.

## Module documentation
- Include an `about.md` in every module directory under `src/` and `test/`.
- Describe what the module owns and update the description when its responsibilities change.

## Repository configuration
- Keep project-wide manifests and configuration at the root when tooling expects them there.
