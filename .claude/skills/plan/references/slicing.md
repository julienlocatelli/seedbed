# Slicing a story

Split a story into **vertical slices**: each slice crosses every layer it needs (data, API, UI, tests) and delivers something a user can see or use. Then list the technical tasks of each slice.

## The demo test

Ask: "How would we show this slice in a sprint review?" If the answer needs something the end user cannot do (run a SQL query, call an endpoint with cURL), it is a horizontal slice: a task, not a slice.

| Horizontal (avoid) | Vertical (prefer) |
| --- | --- |
| Build the search SQL query | Search by area and number of rooms |
| Create the search API endpoint | Add the property type filter |
| Develop the search UI | Add the building age filter |
| Write the search tests | Add amenities |

Horizontal slices deliver no value on their own, chain dependencies (database blocks back end blocks front end), integrate late, delay feedback and hide technical debt.

## SPIDR

| Technique | Principle | Example |
| --- | --- | --- |
| **S**pike | Isolate a technical unknown in a time-boxed investigation | Validate the payment API feasibility |
| **P**aths | Split by scenario: happy path first, then edge and error cases | Successful login → wrong password → locked account |
| **I**nterfaces | Split by distinct user entry point | Search from the menu → search from the URL |
| **D**ata | Split by data type or CRUD operation | List → create → edit → delete |
| **R**ules | Split by independent business rule | Discount above 50 € → free delivery above 100 € |

Other vertical axes:

- **Workflow steps:** first and last step first (where the value is), then the steps in between.
- **Persona or role:** one slice per user type.
- **Platform:** same behaviour on web, mobile or API, one slice each.
- **Simple, then complex:** ship the simplest version with the most value first.

## When a horizontal slice is acceptable

Only in three cases, each labelled on the board and justified in the plan:

1. **Foundation:** platform work with no user-visible step before completion, such as replacing an authentication provider or a deployment pipeline. Say it is a project-sized piece and why it cannot be cut vertically.
2. **Spike:** a time-boxed investigation whose output is knowledge (a document, a prototype, a measure), not product code.
3. **Reusable component:** an isolated component reused across screens, such as a date picker, always followed by a slice that integrates it in a real user context.

## Rule of thumb

If a slice delivers nothing a user can use, it is not a slice, it is a task. The goal is not a small slice but a demonstrable one that delivers value.

## Tasks

Inside a slice, tasks are concrete and small: one change each, named after the file, module or behaviour it touches, so `/implement` can update its status independently. Include the tests and the verification a slice needs as tasks of that slice.
