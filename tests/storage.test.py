"""Run the exact application CAS SQL against an isolated SQLite database."""
import sqlite3,re,pathlib,json
root=pathlib.Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
db.executescript((root/'drizzle/0000_icy_zodiak.sql').read_text().replace('--> statement-breakpoint',''))
s=(root/'lib/lab/server.ts').read_text()
sql=re.search(r'`(INSERT INTO lab_records.*?)`',s,re.S).group(1)
def save(owner,record_id,revision):
    db.execute(sql,(owner,record_id,'product',json.dumps({'name':'QA'}),1,1,revision,owner,owner,record_id,revision))
    return db.execute('select changes()').fetchone()[0]
assert save('owner-a','r_qa',0)==1
assert save('owner-a','r_qa',0)==0
assert save('owner-a','r_qa',1)==1
assert save('owner-a','r_qa',1)==0
assert save('owner-b','r_qa',0)==1
assert save('owner-a','new-with-stale-rev',3)==0
assert db.execute('select count(*) from lab_records where owner_id=?',('owner-a',)).fetchone()[0]==1
assert db.execute('select revision from lab_records where owner_id=? and id=?',('owner-a','r_qa')).fetchone()[0]==2
print('PASS: create/update, stale revision, duplicate create, owner isolation, missing-record revision')
