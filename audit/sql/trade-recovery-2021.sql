begin;
delete from private.transaction_trade_recovery where season_year = 2021;
insert into private.transaction_trade_recovery (season_year,espn_transaction_id,related_transaction_id,scoring_period,transaction_date_ms,team_id) values
(2021,'e10accbc-84a9-4a36-8585-15bd4a209b9f','7089ae9b-62c2-4a82-8e8a-4630b2f97d12',10,1636656781188,3),
(2021,'3b379768-0815-49fd-aa83-60b655b9455c','463705ec-aa14-45bc-b9f8-1657e6849c91',10,1636656735187,11),
(2021,'d04119a8-20ae-4fb2-9d9d-b95a28bedb6b','4157bed0-922d-4c47-af8a-80609fc382df',9,1636043597661,9),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b','daa2539f-9314-404c-9be8-d07b70f185f9',4,1632847489738,3),
(2021,'9643b601-763c-4fb0-b81b-2594ef0c2c6c','32423d60-139e-4199-abd6-200dfb8b39aa',4,1632847456560,9);
insert into private.transaction_trade_recovery_items (season_year,espn_transaction_id,item_index,item_type,player_id,player_name,from_team_id,to_team_id) values
(2021,'e10accbc-84a9-4a36-8585-15bd4a209b9f',0,'TRADE',16731,'Brandin Cooks',3,1),
(2021,'e10accbc-84a9-4a36-8585-15bd4a209b9f',1,'TRADE',16733,'Odell Beckham Jr.',1,3),
(2021,'e10accbc-84a9-4a36-8585-15bd4a209b9f',2,'TRADE',16799,'Allen Robinson II',3,1),
(2021,'3b379768-0815-49fd-aa83-60b655b9455c',0,'TRADE',12483,'Matthew Stafford',11,4),
(2021,'3b379768-0815-49fd-aa83-60b655b9455c',1,'TRADE',13295,'Emmanuel Sanders',11,4),
(2021,'3b379768-0815-49fd-aa83-60b655b9455c',2,'TRADE',13982,'Julio Jones',4,11),
(2021,'3b379768-0815-49fd-aa83-60b655b9455c',3,'TRADE',4045163,'Miles Sanders',4,11),
(2021,'d04119a8-20ae-4fb2-9d9d-b95a28bedb6b',0,'TRADE',3916433,'Jakobi Meyers',9,13),
(2021,'d04119a8-20ae-4fb2-9d9d-b95a28bedb6b',1,'TRADE',4035676,'Zack Moss',9,13),
(2021,'d04119a8-20ae-4fb2-9d9d-b95a28bedb6b',2,'TRADE',4046692,'Chase Claypool',13,9),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',0,'TRADE',15072,'Marvin Jones Jr.',3,5),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',1,'TRADE',15847,'Travis Kelce',5,3),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',2,'TRADE',16799,'Allen Robinson II',5,3),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',3,'TRADE',3115364,'Leonard Fournette',5,3),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',4,'TRADE',4241372,'Marquise Brown',3,5),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',5,'TRADE',4241457,'Najee Harris',3,5),
(2021,'6aefd9e6-9730-412b-b3f3-6dc8693c0c3b',6,'TRADE',4360248,'Kyle Pitts',3,5),
(2021,'9643b601-763c-4fb0-b81b-2594ef0c2c6c',0,'TRADE',2576925,'Darren Waller',13,9),
(2021,'9643b601-763c-4fb0-b81b-2594ef0c2c6c',1,'TRADE',3040151,'George Kittle',9,13),
(2021,'9643b601-763c-4fb0-b81b-2594ef0c2c6c',2,'TRADE',3916433,'Jakobi Meyers',13,9),
(2021,'9643b601-763c-4fb0-b81b-2594ef0c2c6c',3,'TRADE',4242214,'Clyde Edwards-Helaire',9,13);
commit;
