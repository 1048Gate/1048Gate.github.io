begin;
delete from private.transaction_trade_recovery where season_year = 2025;
insert into private.transaction_trade_recovery (season_year,espn_transaction_id,related_transaction_id,scoring_period,transaction_date_ms,team_id) values
(2025,'e21a4aa3-67d6-4ef4-b530-d5b461b5b115','7ecfd0dc-f163-4f5d-8938-9bc793c4e69c',6,1760038787982,4),
(2025,'3bea5014-1149-4812-aa79-a42b62c38d6b','cdc58db5-a0c3-417f-aa9b-50cb1da5b9ee',5,1759440508927,1);
insert into private.transaction_trade_recovery_items (season_year,espn_transaction_id,item_index,item_type,player_id,player_name,from_team_id,to_team_id) values
(2025,'e21a4aa3-67d6-4ef4-b530-d5b461b5b115',0,'TRADE',3916433,'Jakobi Meyers',11,4),
(2025,'e21a4aa3-67d6-4ef4-b530-d5b461b5b115',1,'TRADE',4426388,'Jameson Williams',4,11),
(2025,'e21a4aa3-67d6-4ef4-b530-d5b461b5b115',2,'TRADE',4429615,'Zay Flowers',11,4),
(2025,'e21a4aa3-67d6-4ef4-b530-d5b461b5b115',3,'TRADE',4685382,'Omarion Hampton',4,11),
(2025,'3bea5014-1149-4812-aa79-a42b62c38d6b',0,'TRADE',4035687,'Michael Pittman Jr.',1,14),
(2025,'3bea5014-1149-4812-aa79-a42b62c38d6b',1,'TRADE',4241389,'CeeDee Lamb',14,1),
(2025,'3bea5014-1149-4812-aa79-a42b62c38d6b',2,'TRADE',4360569,'Jordan Mason',1,14),
(2025,'3bea5014-1149-4812-aa79-a42b62c38d6b',3,'TRADE',4685415,'Travis Hunter',14,1);
commit;
