import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';

// Runs the REAL daily-workflow pipeline offline (fetch_trade_history.py --input ->
// adapt_trade_history_for_import.py -> import_transactions_to_supabase.prepare_import)
// and feeds its output through the real migrations in PGlite. No ESPN/Supabase calls.
const root=fileURLToPath(new URL('..',import.meta.url));
const scripts=join(root,'scripts');
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const tmp=mkdtempSync(join(tmpdir(),'tx-import-sources-'));
const run=(args)=>execFileSync(python,args,{cwd:root,env:{...process.env,PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']}).toString();

// ESPN kona_playercard response shape consumed by fetch_trade_history.normalize_playercard.
const card=(id,name,transactions)=>({id,player:{id,fullName:name,transactions}});
const waiver={id:'w-1',type:'WAIVER',status:'EXECUTED',teamId:3,scoringPeriodId:6,processDate:1790000000000,items:[
  {type:'ADD',playerId:101,fromTeamId:0,toTeamId:3,toLineupSlotId:20},
  {type:'DROP',playerId:202,fromTeamId:3,toTeamId:0,fromLineupSlotId:20}]};
const trade={id:'t-2',type:'TRADE_ACCEPT',status:'EXECUTED',teamId:3,scoringPeriodId:7,processDate:1790600000000,relatedTransactionId:'t-2p',items:[
  {type:'TRADE',playerId:303,fromTeamId:3,toTeamId:5},{type:'TRADE',playerId:404,fromTeamId:5,toTeamId:3}]};
const roster={season:2026,standings:[{teamId:3,team:'Gate Crashers'},{teamId:5,team:'Ten Forty'}]};
writeFileSync(join(tmp,'roster.json'),JSON.stringify(roster));

function workflowSnapshot(season,players,tag){
  const raw=join(tmp,`${tag}-kona.json`),fetched=join(tmp,`${tag}-fetched.json`),adapted=join(tmp,`${tag}-adapted.json`);
  writeFileSync(raw,JSON.stringify({players}));
  run([join(scripts,'fetch_trade_history.py'),'--input',raw,'--season',String(season),'--league-id','1237285','--output',fetched]);
  run([join(scripts,'adapt_trade_history_for_import.py'),'--input',fetched,'--roster',join(tmp,'roster.json'),'--output',adapted]);
  const prepared=run(['-c','import json,sys;sys.path.insert(0,sys.argv[2]);from import_transactions_to_supabase import prepare_import;print(json.dumps(prepare_import(json.load(open(sys.argv[1],encoding="utf-8")))))',adapted,scripts]);
  return JSON.parse(prepared);
}

const migrationFile='20261023120000_transaction_snapshot_player_card_sources.sql';
const db=new PGlite();
try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const name of ['20260825010000_011_transaction_archive_base.sql','20261017130000_transaction_snapshot_reconciliation.sql',migrationFile]){
    await db.exec(readFileSync(join(root,'supabase','migrations',name),'utf8'));
  }
  // Migration is safe to re-run.
  await db.exec(readFileSync(join(root,'supabase','migrations',migrationFile),'utf8'));
  const fn=(await db.query("select prosecdef,proconfig,proacl::text acl from pg_proc where proname='import_transaction_snapshot'")).rows;
  assert.equal(fn.length,1);assert.equal(fn[0].prosecdef,false);
  assert.deepEqual(fn[0].proconfig,['search_path=public, pg_temp']);
  assert.match(fn[0].acl,/service_role=X/);assert.doesNotMatch(fn[0].acl,/(^|[{,])(anon|authenticated)?=X/);

  const apply=async data=>(await db.query('select public.import_transaction_snapshot($1::jsonb) r',[JSON.stringify(data)])).rows[0].r;
  const strip=rows=>rows.map(({updated_at,...rest})=>rest);
  const txs=async(season=2026)=>strip((await db.query('select * from public.league_transactions where season_year=$1 order by espn_transaction_id',[season])).rows);
  const items=async(season=2026)=>strip((await db.query('select * from public.league_transaction_items where season_year=$1 order by espn_transaction_id,item_index',[season])).rows);
  const byId=(rows,id)=>rows.find(r=>r.espn_transaction_id===id);

  // Existing production-style mTransactions2 rows (richer data, ESPN item order differs from player-card sort).
  const rich=(season,team,bid)=>({season,league_id:1237285,source:'ESPN mTransactions2',fetched_at:`${season}-01-01T00:00:00Z`,snapshot_complete:false,transaction_count:1,item_count:2,
    transactions:[{season_year:season,espn_transaction_id:'w-1',scoring_period:6,transaction_type:'WAIVER',status:'EXECUTED',team_id:3,team_name:team,member_id:'{MEMBER-3}',bid_amount:bid,transaction_date_ms:1790000000000,transaction_date:'2026-09-21T13:33:20Z',item_count:2,
      raw_data:{id:'w-1',type:'WAIVER',status:'EXECUTED',teamId:3,bidAmount:bid,memberId:'{MEMBER-3}',scoringPeriodId:6,processDate:1790000000000}}],
    items:[{season_year:season,espn_transaction_id:'w-1',item_index:0,item_type:'DROP',player_id:202,player_name:'Beta Player',from_team_id:3,from_team_name:team,to_team_id:0,to_team_name:'',raw_data:{type:'DROP',playerId:202,fromTeamId:3,toTeamId:0,isKeeper:false}},
      {season_year:season,espn_transaction_id:'w-1',item_index:1,item_type:'ADD',player_id:101,player_name:'Alpha Player',from_team_id:0,from_team_name:'',to_team_id:3,to_team_name:team,raw_data:{type:'ADD',playerId:101,fromTeamId:0,toTeamId:3,isKeeper:false}}]});
  await apply(rich(2026,'Original Name',12));
  const before=await txs(),beforeItems=await items();

  // 1. Actual workflow output (kona source) is accepted; this is the H1 failure.
  const kona=workflowSnapshot(2026,[card(101,'Alpha Player',[waiver]),card(202,'Beta Player',[waiver]),card(303,'Gamma Player',[trade]),card(404,'Delta Player',[trade])],'kona');
  assert.equal(kona.source,'ESPN kona_playercard');assert.equal(kona.snapshot_complete,false);
  assert.equal(byId(kona.transactions,'w-1').member_id,null);assert.equal(byId(kona.transactions,'w-1').bid_amount,null);
  assert.deepEqual(await apply(kona),{transactions:2,items:4,reconciled:false});
  let stored=await txs();
  // 2. Existing mTransactions2 row is not degraded.
  assert.deepEqual(byId(stored,'w-1'),byId(before,'w-1'));
  assert.deepEqual(await items().then(r=>r.filter(x=>x.espn_transaction_id==='w-1')),beforeItems);
  // New transaction is inserted from the adapter output.
  const t2=byId(stored,'t-2');
  assert.equal(t2.team_name,'Gate Crashers');assert.equal(t2.item_count,2);assert.equal(t2.raw_data.relatedTransactionId,'t-2p');
  assert.deepEqual((await items()).filter(x=>x.espn_transaction_id==='t-2').map(x=>[x.item_index,x.player_name,x.to_team_name]),[[0,'Gamma Player','Ten Forty'],[1,'Delta Player','Gate Crashers']]);

  // 3. Idempotent repeat of the same snapshot.
  const snapTx=JSON.stringify(await txs()),snapItems=JSON.stringify(await items());
  await apply(kona);
  assert.equal(JSON.stringify(await txs()),snapTx);assert.equal(JSON.stringify(await items()),snapItems);

  // 4. A non-authoritative snapshot never deletes, even when it omits rows or claims completeness.
  const partial=workflowSnapshot(2026,[card(303,'Gamma Player',[trade]),card(404,'Delta Player',[trade])],'partial');
  await apply(partial);
  assert.equal(JSON.stringify(await txs()),snapTx);assert.equal(JSON.stringify(await items()),snapItems);
  await assert.rejects(apply({...partial,snapshot_complete:true}),/may reconcile/);
  await assert.rejects(apply({...partial,transactions:[],items:[],transaction_count:0,item_count:0,snapshot_complete:true}),/may reconcile/);
  assert.equal(JSON.stringify(await txs()),snapTx);assert.equal(JSON.stringify(await items()),snapItems);

  // 5. Unknown / fallback / missing sources are rejected.
  for(const source of ['ESPN trade-history adapter','Unknown feed',null]){
    await assert.rejects(apply({...kona,source}),/Invalid transaction snapshot identity/);
  }
  assert.equal(JSON.stringify(await txs()),snapTx);

  // 6. mTransactions2 is still accepted and remains authoritative (overwrites values).
  const later=new Date(Date.now()+3600_000).toISOString();
  const m2=rich(2026,'Renamed Team',15);
  await apply({...m2,fetched_at:later});
  stored=await txs();
  assert.equal(byId(stored,'w-1').bid_amount,'15');assert.equal(byId(stored,'w-1').team_name,'Renamed Team');
  assert.ok(byId(stored,'t-2'),'partial mTransactions2 import does not delete');

  // 7. Obsolete fetched_at is still rejected for the kona source.
  await assert.rejects(apply(kona),/Obsolete transaction snapshot/);

  // 8. Older-season manual dispatch: adapter omits current-season names; coalesce keeps 2025 data.
  await apply(rich(2025,'Team of 2025',7));
  const before2025=await txs(2025),items2025=await items(2025);
  const old=workflowSnapshot(2025,[card(101,'Alpha Player',[waiver]),card(202,'Beta Player',[waiver]),card(303,'Gamma Player',[trade]),card(404,'Delta Player',[trade])],'old');
  assert.ok(old.transactions.every(t=>t.team_name===null),'roster season mismatch must not stamp names');
  await apply(old);
  const after2025=await txs(2025);
  assert.deepEqual(byId(after2025,'w-1'),byId(before2025,'w-1'));
  assert.deepEqual((await items(2025)).filter(x=>x.espn_transaction_id==='w-1'),items2025);
  assert.equal(byId(after2025,'t-2').team_name,null);

  // Browser roles still cannot execute.
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);await assert.rejects(apply(kona));await db.exec('reset role');
  }
  console.log('Transaction import sources: real kona workflow output accepted without degrading mTransactions2 rows; idempotent, never deletes, unknown/obsolete rejected, grants preserved.');
}finally{await db.close();rmSync(tmp,{recursive:true,force:true});}
