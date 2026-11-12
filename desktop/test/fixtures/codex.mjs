// A fake Codex executable. It never contacts a provider or reads user data.
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const mode=process.env.CODEX_FIXTURE_MODE ?? 'success';
if(mode==='timeout')setInterval(()=>{},1000);
else if(mode==='oversize')process.stdout.write('x'.repeat(3*1024*1024));
else if(mode==='malformed')process.stdout.write('not-json\n');
else if(mode==='failed'){process.stdout.write(JSON.stringify({type:'turn.failed'})+'\n');process.exitCode=1;}
else {
  process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Earlier message'}})+'\n');
  const output={name:'Fixture concept',hook:'Fixture hook',script:'Fixture script',caption:'Fixture caption'};
  if(mode==='inspect')output.caption=JSON.stringify({prompt,args:process.argv.slice(2),hasApiKey:!!(process.env.OPENAI_API_KEY||process.env.CODEX_API_KEY)});
  process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(output)}})+'\n');
  process.stdout.write(JSON.stringify({type:'turn.completed'})+'\n');
}
