#!/usr/bin/env python3
import json,re,sqlite3,sys
from pathlib import Path

START,END=2017,2025
FINAL={2017:{3:1,1:2,8:3,12:4,10:5,5:6,6:7,4:8,9:9,2:10,11:11,7:12},2018:{4:1,1:2,3:3,9:4,7:5,14:6,5:7,6:8,13:9,15:10,11:11,8:12}}
KNOWN={
'{FACABF18-8353-4007-83E6-0962A870FB65}':'George Travis','{AA315F1C-BD33-466B-B957-9CD596A34D89}':'Jared Hall','{BC03B527-5EBB-4094-B93D-7E3B670D3609}':'Kyle Fowler','{15065ABE-4502-449A-8123-76C28506E06D}':'Bryan Hunt','{17F7DFE0-C849-4652-86AC-723DBEF508AC}':'Bryan Hunt','{D2A3BA81-320E-4EA2-9C36-B02F7439AC48}':'Brian Heino','{BD2A33C0-1FF6-4BB4-AA33-C01FF6CBB45B}':'Vincent Cannarozzi','{C19F89F4-148C-4C4F-BFDA-7DA05E0839DC}':'James Brochu','{D448C8DD-83C3-4C9B-8E18-0C6842D29C00}':'JD Daley','{F0195AC7-78B8-4577-AEB7-D471AC5D64EF}':'Thomas Speer','{557F5048-981A-445C-95A1-EC1487D98327}':'Thomas Speer','{ED477261-26A1-4CE7-9177-D9AFDD087AAB}':'Collin Krum','{08C42AF9-ED50-4BD6-9CA5-58C7C2B2F442}':'German Haro','{B44F52B3-EAA6-4863-9C6B-82578AFE2C69}':'Trevor Hash'}

def clean(v):return re.sub(r'\s+',' ',v or '').strip()
def owner(row):
    if row['owner_id'] in KNOWN:return KNOWN[row['owner_id']]
    raw=clean(f"{clean(row['first_name'])} {clean(row['last_name'])}") or clean(row['display_name'])
    return ' '.join(p if p.isupper() else p.capitalize() for p in raw.split())

def main():
    root=Path(__file__).resolve().parents[1]
    db=Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else root/'1048_gate.db'
    if not db.exists():raise SystemExit(f'Database not found: {db}\nRun: python3 scripts/export_seasons.py /path/to/1048_gate.db')
    con=sqlite3.connect(db);con.row_factory=sqlite3.Row
    seasons=[]
    for year in range(START,END+1):
        league=con.execute('select league_name from seasons where year=?',(year,)).fetchone()['league_name']
        rows=con.execute('select t.*,o.display_name,o.first_name,o.last_name from teams t left join owners o on o.year=t.year and o.owner_id=t.owner_id where t.year=?',(year,)).fetchall()
        standings=[]
        for r in rows:
            finish=FINAL.get(year,{}).get(int(r['team_id'])) or int(r['final_standing'] or 0)
            wins,losses,ties=int(r['wins']),int(r['losses']),int(r['ties'] or 0)
            record=f'{wins}-{losses}'+(f'-{ties}' if ties else '')
            pf,pa=round(float(r['points_for']),2),round(float(r['points_against']),2)
            standings.append([finish,int(r['standing']),clean(r['team_name']),owner(r),record,pf,pa,round(pf-pa,2)])
        standings.sort(key=lambda x:x[0])
        if [x[0] for x in standings]!=list(range(1,13)):raise RuntimeError(f'{year}: incomplete final finishes')
        seasons.append([year,league,standings[0][3],standings[0][2],standings])
    con.close()
    out=root/'data'/'seasons.json';out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({'schemaVersion':2,'seasonRange':[START,END],'seasons':seasons},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Wrote {out} ({len(seasons)} seasons)')

if __name__=='__main__':main()
