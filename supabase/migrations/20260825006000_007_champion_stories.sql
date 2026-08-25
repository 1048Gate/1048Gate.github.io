-- 1048 Gate champion stories
-- Standardize the championship story for every season so the Champions
-- Timeline reads with one consistent voice (title game → season stats → milestone).
--
-- Run this in the Supabase SQL Editor. It updates only the note column and
-- preserves each champion identity row. If a season row is missing, add the
-- champion through the League Content Manager first, then run this again.

update public.league_champions
set note = 'The Flash In The Flex beat George Travis to win the 2017 championship. Jared Hall finished the regular season 10–3 with a +259.8 point differential, earning the league''s first 1048 Gate title.'
where season_year = 2017;

update public.league_champions
set note = 'Turn Goff the Lights beat George Travis 167.02–126.08 to win the 2018 championship. Kyle Fowler finished the regular season 9–4 with a +125.64 point differential, earning his first 1048 Gate title.'
where season_year = 2018;

update public.league_champions
set note = 'We''re on to Cleveland beat Trevor Hash 156.84–131.2 to win the 2019 championship. JD Daley finished the regular season 8–5 with a +25.62 point differential, earning his first 1048 Gate title.'
where season_year = 2019;

update public.league_champions
set note = 'Has a Nice Ring to it beat German Haro 165.3–107.16 to win the 2020 championship. Thomas Speer finished the regular season 7–6 with a +209.28 point differential, earning his first 1048 Gate title.'
where season_year = 2020;

update public.league_champions
set note = 'Has a Nice Ring to it beat Kyle Fowler 130.6–109.16 to win the 2021 championship. Thomas Speer finished the regular season 9–5 with a +142.56 point differential, completing the league''s first repeat and his second straight title.'
where season_year = 2021;

update public.league_champions
set note = 'A, B, Ceedee, **** You beat JD Daley 134.28–81.3 to win the 2022 championship. George Travis finished the regular season 8–6 with a +178.9 point differential, earning his first 1048 Gate title.'
where season_year = 2022;

update public.league_champions
set note = 'Crown The King beat JD Daley 126.12–121.2 to win the 2023 championship. Jared Hall finished the regular season 9–5 with a +150.28 point differential, earning his second 1048 Gate title.'
where season_year = 2023;

update public.league_champions
set note = 'The Diddlers beat George Travis 161.22–135.48 to win the 2024 championship. Jared Hall finished the regular season 11–3 with a +182.4 point differential, completing the repeat and his third 1048 Gate title.'
where season_year = 2024;

update public.league_champions
set note = 'The Swifties beat Collin Krum 129.64–107.88 to win the 2025 championship. Thomas Speer finished the regular season 11–3 with a +389.98 point differential, earning his third 1048 Gate title and tying the all-time league record.'
where season_year = 2025;
