import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Execute the real migration in isolated PostgreSQL; no Supabase/ESPN requests.
const db=new PGlite();
try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const name of ['20260825010000_011_transaction_archive_base.sql','20261017130000_transaction_snapshot_reconciliation.sql','20261023120000_transaction_snapshot_player_card_sources.sql']){
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  }
  const tx=(id,count=1,season=2025)=>({season_year:season,espn_transaction_id:id,transaction_type:'WAIVER',item_count:count,raw_data:{id}});
  const item=(id,index=0,season=2025)=>({season_year:season,espn_transaction_id:id,item_index:index,player_name:`Player ${index}`});
  let clock=0;
  const snapshot=(transactions,items,complete=false,season=2025)=>({season,league_id:1237285,source:'ESPN mTransactions2',fetched_at:new Date(Date.UTC(2026,0,1,0,0,clock++)).toISOString(),snapshot_complete:complete,transaction_count:transactions.length,item_count:items.length,transactions,items});
  const apply=async data=>(await db.query('select public.import_transaction_snapshot($1::jsonb)',[JSON.stringify(data)])).rows;
  const rows=async table=>(await db.query(`select * from public.${table} order by season_year,espn_transaction_id${table.endsWith('_items')?',item_index':''}`)).rows;
  await apply(snapshot([tx('keep',2),tx('obsolete')],[item('keep'),item('keep',1),item('obsolete')]));
  const original=(await rows('league_transactions')).find(x=>x.espn_transaction_id==='keep');
  const originalItem=(await rows('league_transaction_items')).find(x=>x.espn_transaction_id==='keep');
  await apply(snapshot([tx('other-season',1,2024)],[item('other-season',0,2024)],false,2024));
  await db.exec("insert into public.league_transactions(season_year,espn_transaction_id,transaction_type) values(2025,'manual','WAIVER'),(2025,'draft','DRAFT');");
  // A partial snapshot cannot prune omitted transactions or item indices.
  await apply(snapshot([tx('keep')],[item('keep')]));
  assert.equal((await rows('league_transaction_items')).filter(x=>x.espn_transaction_id==='keep').length,2);
  assert.ok((await rows('league_transactions')).some(x=>x.espn_transaction_id==='obsolete'));
  const corrected=snapshot([{...tx('keep'),team_name:'Corrected team'}],[{...item('keep'),player_name:'Corrected player'}],true);
  await apply(corrected);
  const stored=await rows('league_transactions');
  assert.deepEqual(stored.map(x=>x.espn_transaction_id),['other-season','draft','keep','manual']);
  assert.equal(stored.find(x=>x.espn_transaction_id==='keep').id,original.id);
  assert.equal(stored.find(x=>x.espn_transaction_id==='keep').team_name,'Corrected team');
  const keptItems=(await rows('league_transaction_items')).filter(x=>x.espn_transaction_id==='keep');
  assert.equal(keptItems.length,1);assert.equal(keptItems[0].id,originalItem.id);assert.equal(keptItems[0].player_name,'Corrected player');
  await apply(corrected);assert.equal((await rows('league_transactions')).length,4); // idempotent
  const unchanged=JSON.stringify(await rows('league_transactions'));
  const invalid=[snapshot([tx('keep'),tx('keep')],[item('keep')],true),snapshot([tx('keep',2)],[item('keep')],true),snapshot([tx('keep')],[item('keep',0,2024)],true),{...corrected,fetched_at:'2020-01-01T00:00:00Z'}];
  for(const data of invalid){await assert.rejects(apply(data));assert.equal(JSON.stringify(await rows('league_transactions')),unchanged);}
  // Force failure after parent upsert: the entire call, including updates/deletes, rolls back.
  await db.exec("alter table public.league_transaction_items add constraint test_failure check(player_name<>'FAIL');");
  await assert.rejects(apply(snapshot([{...tx('keep'),team_name:'MUST ROLL BACK'}],[{...item('keep'),player_name:'FAIL'}],true)));
  assert.equal(JSON.stringify(await rows('league_transactions')),unchanged);
  await apply(snapshot([],[]));assert.equal((await rows('league_transactions')).length,4);
  await apply(snapshot([],[],true));assert.deepEqual((await rows('league_transactions')).map(x=>x.espn_transaction_id),['other-season','draft','manual']);
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    await assert.rejects(apply(snapshot([],[],true)));
    await assert.rejects(db.query('select * from public.transaction_import_state'));
    await db.exec('reset role');
  }
  await db.exec('set role service_role');await apply(snapshot([],[]));await db.exec('reset role');
  console.log('Transaction reconciliation: actual PostgreSQL migration passed corrected/duplicate/partial/empty/failed imports, stable IDs, stale snapshots, rollback and role restrictions.');
}finally{await db.close();}
