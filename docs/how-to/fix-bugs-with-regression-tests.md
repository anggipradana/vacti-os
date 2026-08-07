---
title: 'How to Fix Bugs with Regression Tests'
description: Pin every bug fix with a reproducing test, and test live sites systematically rather than by sampling
category: how-to
tags:
  - bugs
  - regression
  - testing
  - live-testing
  - quality
created: 2026-06-22
---

# How to Fix Bugs with Regression Tests

## When you find and fix a bug

**Rule**: Every fix lands with a test that would have failed before the fix and passes after it,
in the **same commit or PR**. No exceptions - not for trivial fixes, not for cosmetic defects,
not for hotfixes.

Choose the test form that matches the defect:

- **Behavioral / functional bug** - add the unit, integration, or E2E test that reproduces it.
- **Visual / UI regression** - add a DOM assertion, computed-style assertion, or Playwright
  snapshot assertion.
- **Content / copy / i18n bug** - add a test asserting the corrected string or translation.
- **API regression** - add an integration or E2E test asserting the correct response.

A fix without a pinning test is incomplete: the bug is free to return silently.

## When testing a live site

Sampling reliably misses cross-surface inconsistencies and invariant violations. Apply these
enumerate-not-sample checks on every live-site test run, whether automated or manual:

1. **Shared-control x surface matrix** - exercise every shared control on every surface it
   appears on and assert consistent behavior across all of them.
2. **Per-control URL round-trip** - change every interactive control, verify the URL updates,
   reload, and verify the state restores.
3. **Declared-invariant conformance** - verify each documented invariant holds for every
   applicable element, not just a sample.
4. **Raw/unstyled native-element audit** - enumerate every interactive element and assert no
   raw native controls coexist with styled design-system components on the same surface.
5. **Usability probes** - scan every label for jargon, probe hidden controls for
   discoverability, identify cross-view redundancy, and verify input units and currency
   symbols are consistent.
6. **Recurrence + diff memory + completeness critic** - re-check prior defect classes,
   re-verify surfaces adjacent to recent changes, and end with "what did we NOT enumerate?"

## Related

- [How to Run Tests](./run-tests.md) - which test level to use and how to run each tier.
</content>
