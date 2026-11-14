# 0002. The configuration lives in the page URL

## Status

accepted

## Context

- The service stores nothing: no account, no saved templates on the server, no history.
- People still need to come back to a style, hand it to someone else, or put it in a ticket.
- A WiFi password or a vCard is part of the configuration, and under
  [0001](0001-the-browser-renders-the-api-is-a-second-surface.md) it must not reach a server.
- The page is public and indexable, so a crawler will follow whatever appears in a link.
- The API takes the same configuration and has to agree with the page on what it means.

## Decision

We will carry the whole configuration in the fragment of the page URL, and nowhere else.

- A browser never sends the fragment to a server, so a shared link carries a WiFi password no
  further than the recipient's own tab.
- Sharing, bookmarking and reproducing a style need no storage and no account.
- The same structure, written as JSON, is what the API accepts, so there is one definition of a
  configuration rather than two.

## Consequences

- Positive: a style is shareable and reproducible without the service remembering anything.
- Positive: nothing in the configuration can appear in an access log, a crawler index or a
  referrer header.
- Negative: the URL grows with the payload, and a long vCard or a guided payload such as a SEPA
  transfer makes an ugly link. It stays under what browsers accept, but it is not pretty.
- Negative: the fragment becomes a public format. Changing it breaks links people kept, so it
  carries a version and changes by adding a version, not by editing one.
- Neutral: a link is only as private as wherever it was pasted, which the page has to say out
  loud next to the share action.

## Alternatives considered

### Query parameters instead of the fragment

- Simpler, and survives more link handling intact.
- Rejected because a query string is sent to the server, lands in access logs and travels in
  referrer headers. For a WiFi password that is the whole problem again.

### Short ids pointing at stored configurations

- Short, pretty links, no length limit.
- Rejected because it reintroduces a store, a lifetime, a deletion story and a payload sitting on
  a server, all of which the product is defined against.

### No sharing at all

- Nothing to design, nothing to version.
- Rejected because coming back to a style is the ordinary case for a recurring event, and the
  alternative is people rebuilding it from a screenshot.

## References

- Concept: [../concepts/qarr.md](../concepts/qarr.md)
- Related: [0001. The browser renders, the API is a second surface](0001-the-browser-renders-the-api-is-a-second-surface.md)
