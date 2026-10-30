## User story

**As a** <persona>,
**I want** <goal>,
**so that** <business benefit>.

## Context

<Why this story exists and what the current problem is, in 2–5 lines. No technical solution.>

- Source ticket: [<ticket-id>](<backlog ticket url>)
- Related stories: <TASK-xx links, or "none">

## Acceptance criteria

<Keep exactly one of the two forms below and delete the other, with these instructions.>

<Checklist form, when no e2e test will cover the story:>

- [ ] <verifiable outcome>
- [ ] <verifiable outcome>

<Gherkin form, when the behaviour is observable in the application and will drive e2e tests:>

```gherkin
Feature: <feature name>

  Background:
    Given <state shared by all scenarios, only if needed>

  Scenario: <happy path behaviour>
    Given <context>
    When <user action>
    Then <observable outcome>

  Scenario: <error or edge case>
    Given <context>
    When <action>
    Then <observable outcome>
```

## Out of scope

- <What this story deliberately does not cover>

## Open questions

- <Points left unresolved after clarification, or "none">
