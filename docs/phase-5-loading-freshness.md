# Phase 5 — Loading and freshness

The current-week board now treats checked-in HTML and browser cache as useful saved state. A successful `current-season.json` request replaces the board, records a last-known-good payload locally, and shows its `fetchedAt` time. If that request fails or returns an incomplete board, the page uses the cached payload when available and otherwise keeps the checked-in scoreboard. The board remains usable and clearly says **Saved snapshot** with its update time.

Homepage modules use one quiet skeleton while their data loads. Repeated loading copy was removed from the League Wire, Championship Odds, and Championship Banners headers. Successful weekly-edition and current-week loads share consistent, semantic `<time>` freshness labels.

This phase changes presentation and browser fallback behavior only. ESPN publishing, Supabase/auth, newspaper generation, odds calculations, archive data, light/dark behavior, and navigation are unchanged.
