begin;
delete from private.transaction_trade_recovery where season_year = 2023;
insert into private.transaction_trade_recovery (season_year,espn_transaction_id,related_transaction_id,scoring_period,transaction_date_ms,team_id) values
(2023,'50b32384-d4b7-456a-b8db-3cb8127e83c3','cd33e361-782e-49d1-8470-45f9f2bf3339',10,1699461565031,9),
(2023,'8abb2bbe-a621-4400-b0d7-a526e30b0889','e8b5b4e8-fba6-42c3-a6d6-a1754b59ca65',10,1699461558956,11),
(2023,'30628c14-766f-4adc-808d-5d2ae483f874','8d3c4b52-ba53-4823-b947-5fdde9aff903',7,1697639262744,3),
(2023,'a09ba2f0-f048-472e-8996-d6bbcaddda66','c03554ee-f772-468d-a972-31ab43618542',3,1695405621616,1);
insert into private.transaction_trade_recovery_items (season_year,espn_transaction_id,item_index,item_type,player_id,player_name,from_team_id,to_team_id) values
(2023,'50b32384-d4b7-456a-b8db-3cb8127e83c3',0,'TRADE',4360310,'Trevor Lawrence',3,9),
(2023,'50b32384-d4b7-456a-b8db-3cb8127e83c3',1,'TRADE',4569987,'Jaylen Warren',9,3),
(2023,'8abb2bbe-a621-4400-b0d7-a526e30b0889',0,'TRADE',3051876,'Evan Engram',3,11),
(2023,'8abb2bbe-a621-4400-b0d7-a526e30b0889',1,'TRADE',4258173,'Nico Collins',11,3),
(2023,'30628c14-766f-4adc-808d-5d2ae483f874',0,'TRADE',3932905,'Diontae Johnson',3,4),
(2023,'30628c14-766f-4adc-808d-5d2ae483f874',1,'TRADE',4432577,'C.J. Stroud',4,3),
(2023,'a09ba2f0-f048-472e-8996-d6bbcaddda66',0,'TRADE',12483,'Matthew Stafford',1,11),
(2023,'a09ba2f0-f048-472e-8996-d6bbcaddda66',1,'TRADE',2577417,'Dak Prescott',11,1);
commit;
