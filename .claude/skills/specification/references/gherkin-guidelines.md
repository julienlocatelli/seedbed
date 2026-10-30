# Gherkin guidelines

Acceptance criteria describe behaviour the user can observe. They are not test scripts.

## Rules

- One scenario covers one behaviour, with exactly one `When`.
- Write declarative steps: `When I log in with valid credentials`, not `When I click the "Submit" button`.
- `Then` states an observable outcome: what the user sees or receives. Never internal state (tables, classes, queues, HTTP codes) unless the persona is an API consumer.
- Each story has at least one happy-path scenario and one error or edge-case scenario.
- Use `Scenario Outline` with `Examples` when only data changes between scenarios.
- Repeated keywords become `And`; never start a block with `And` or `But`.
- Keep `Given → When → Then` order and at most 6 steps per scenario.
- Use `Background` only for context shared by every scenario of the feature.
- Name scenarios after the behaviour (`Rejects an expired password`), not the test (`Test 3`).
- Write in English, present tense, first person or the persona's name.

## Example

```gherkin
Feature: Local user login

  Scenario: Logs in with valid credentials
    Given I have a local account
    When I log in with my email and password
    Then I am redirected to my dashboard

  Scenario Outline: Rejects invalid credentials
    Given I have a local account
    When I log in with <field> incorrect
    Then I see the message "Invalid email or password"

    Examples:
      | field    |
      | email    |
      | password |
```
