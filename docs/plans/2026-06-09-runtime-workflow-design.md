# Playwright Flow Studio Runtime Workflow Design

## Goal

Extend the existing local HTML/ESM editor without replacing its framework. The
IDE can copy and run external MJS files, run the current generated workflow,
start or reuse an Edge CDP instance, represent loops and explicit block-end
anchors, and save reusable tasks.

## Architecture

- Frontend: existing HTML, CSS and browser ESM modules.
- Local service: Node built-in HTTP server, bound to `127.0.0.1`.
- Storage: `runtime/scripts` for copied runnable scripts and `runtime/tasks`
  for reusable task definitions and module tasks.
- Runtime: child Node processes execute with the IDE root as their working
  directory, so copied scripts resolve the IDE's `node_modules/playwright`.
- Bootstrap: CMD calls PowerShell. PowerShell uses system Node or downloads an
  official portable Node LTS runtime, installs Playwright locally when missing,
  starts the server and opens the default browser.

## Workflow Model

Conditions, loops and structured tasks own nested child steps. Their end markers
are virtual UI entries, not executable steps, so selecting an end marker inserts
the next operation after the whole block without adding no-op code to MJS.
Element locators share an optional `nthEnabled` and `nthIndex`. Page keyboard
actions choose between Playwright `keyboard.type` and `keyboard.press`.

## Safety And Errors

The server only accepts local CDP endpoints and `.mjs` or `.js` script paths.
Running a script requires an explicit UI confirmation. Process output is bounded
in memory and exposed through polling endpoints. Node downloads are verified
against the SHA-256 list published with the selected official Node release.

## Verification

Unit tests cover nested insertion, end markers, recursive duplication, loops,
tasks, generic `.nth()`, keyboard modes, MJS parsing and runtime script copying.
Browser verification covers service health, node insertion, generated code and
the runtime toolbar.
