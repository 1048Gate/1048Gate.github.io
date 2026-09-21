# Week 1 — Trust and archive first paint

From the Sept 21, 2026 logged-out review. No visual-system rewrite.

## Transaction archive

- Default category is All activity, not Accepted trades.
- The heading and result count follow the selected filter.
- The filter is stored in the hash (`#transactions`, `#transactions?type=trades`).
- Reset returns to All activity. The existing Jump to trades control still selects accepted trades.

## Live freshness

- Stamps use relative time plus an explicit ET clock.
- `Live` is reserved for a fresh board that still has a live matchup.
- ESPN fetch failure keeps the last snapshot and says the feed is reconnecting.
- A Refresh button is injected next to the week stamp.
