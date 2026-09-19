import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from 'jiti';
const root=mkdtempSync(path.join(tmpdir(),'pi-ephemeral-acceptance-'));
const agentDir=path.join(root,'agent'),cwd=path.join(root,'cwd'); mkdirSync(agentDir); mkdirSync(cwd);
process.env.PI_CODING_AGENT_DIR=agentDir; process.env.PI_OFFLINE='1';
writeFileSync(path.join(agentDir,'models.json'),JSON.stringify({providers:{fixture:{api:'openai-completions',baseUrl:'http://127.0.0.1:1/v1',apiKey:'offline-test',models:[{id:'fixture',contextWindow:128000,maxTokens:1024}]}}}));
writeFileSync(path.join(agentDir,'settings.json'),JSON.stringify({defaultTools:['bash','write'],compaction:{enabled:false}}));
mkdirSync(path.join(agentDir,'extensions')); writeFileSync(path.join(agentDir,'extensions','sentinel.ts'),`import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(path.join(root,'EXTENSION_EXECUTED'))},'bad'); export default ()=>{};`);
const {SessionManager}=await import('@earendil-works/pi-coding-agent');
const jiti=createJiti(import.meta.url,{interopDefault:true});
const {createEphemeral,closeEphemeral,promptEphemeral,EPHEMERAL_IDLE_MS}=await jiti.import('./ephemeral-session.ts');
const parent=SessionManager.inMemory(cwd,{id:'parent'}); parent.appendModelChange('fixture','fixture'); const user=parent.appendMessage({role:'user',content:'UNFLUSHED_SENTINEL',timestamp:1});
globalThis.__piSessions=new Map([['parent',{getSnapshotSource:()=>({manager:parent,model:{provider:'fixture',id:'fixture'}})}]]);
test.after(async()=>{for(const r of globalThis.__piEphemeralSessions?.values()??[]) await closeEphemeral(r.id,r.ownerId); rmSync(root,{recursive:true,force:true});});
test('live unflushed parent, exact tools, extension suppression, historical compaction, and nonpersistence',async()=>{
 const before=structuredClone(parent.getEntries());
 const created=await createEphemeral({parentId:'parent',ownerId:'one',kind:'side'}); const rec=globalThis.__piEphemeralSessions.get(created.id);
 assert.deepEqual(rec.session.getActiveToolNames().sort(),['find','grep','ls','read']); assert.equal(rec.session.sessionManager.isPersisted(),false);
 assert.notEqual(rec.session.sessionId,parent.getSessionId()); assert.equal(created.snapshotLeaf,user); assert.deepEqual(parent.getEntries(),before);
 assert.equal(existsSync(path.join(root,'EXTENSION_EXECUTED')),false); assert.equal(existsSync(path.join(agentDir,'sessions')),false); await closeEphemeral(created.id,'one');
 const leaf=parent.appendCompaction('COMPACTION_SENTINEL',user,1000); const alt=parent.appendMessage({role:'user',content:'ALTERNATIVE',timestamp:2});
 const historical=await createEphemeral({parentId:'parent',ownerId:'history',kind:'recap',leafId:leaf}); const h=globalThis.__piEphemeralSessions.get(historical.id);
 assert.deepEqual(h.session.getActiveToolNames(),[]); assert.equal(historical.snapshotLeaf,leaf); assert.equal(parent.getLeafId(),alt);
 const context=JSON.stringify(h.session.sessionManager.buildSessionContext().messages); assert.match(context,/COMPACTION_SENTINEL/); assert.doesNotMatch(context,/ALTERNATIVE/); await closeEphemeral(historical.id,'history');
});
test('expiry uses bounded clock, wrong owner cannot close, duplicate close is safe',async(t)=>{
 const c=await createEphemeral({parentId:'parent',ownerId:'expiry',kind:'side'}); const rec=globalThis.__piEphemeralSessions.get(c.id);
 // Only app lifecycle timers are accelerated; real SDK construction ran above.
 clearTimeout(rec.timer); t.mock.timers.enable({apis:['setTimeout']});
 const original=rec.session.prompt; rec.session.prompt=async()=>{rec.session.sessionManager.appendMessage({role:'assistant',content:[{type:'text',text:'OWN_ANSWER'}],stopReason:'stop',timestamp:3});};
 await promptEphemeral(c.id,'expiry','test'); rec.session.prompt=original;
 await closeEphemeral(c.id,'wrong-owner'); assert.equal(globalThis.__piEphemeralSessions.has(c.id),true);
 t.mock.timers.tick(EPHEMERAL_IDLE_MS+1); await new Promise(resolve=>setImmediate(resolve));
 assert.equal(globalThis.__piEphemeralSessions.has(c.id),false); await Promise.all([closeEphemeral(c.id,'expiry'),closeEphemeral(c.id,'expiry')]);
});
test('pre-aborted creation and recap rejection of inherited-only answers',async()=>{
 const ctl=new AbortController(); ctl.abort(); await assert.rejects(createEphemeral({parentId:'parent',ownerId:'cancelled',kind:'side',signal:ctl.signal}),/cancelled/);
 const mid=new AbortController(); const pending=createEphemeral({parentId:'parent',ownerId:'mid-create',kind:'side',signal:mid.signal}); mid.abort(); await assert.rejects(pending,/cancelled/);
 const c=await createEphemeral({parentId:'parent',ownerId:'empty',kind:'recap'}); const r=globalThis.__piEphemeralSessions.get(c.id); r.session.prompt=async()=>{};
 await assert.rejects(promptEphemeral(c.id,'empty','test'),/did not produce/); await closeEphemeral(c.id,'empty');
 assert.equal(existsSync(path.join(root,'EXTENSION_EXECUTED')),false);
 assert.deepEqual(JSON.parse(readFileSync(path.join(agentDir,'settings.json'),'utf8')),{defaultTools:['bash','write'],compaction:{enabled:false}});
});

test('reservation, close-before-create, creation/close race and recap overlap', async()=>{
 const id='late-request',ownerId='pending-owner';
 await closeEphemeral(id,ownerId);
 await assert.rejects(createEphemeral({id,parentId:'parent',ownerId,kind:'side'}),/cancelled/);
 const pending=createEphemeral({id:'pending-sdk',parentId:'parent',ownerId,kind:'side'});
 await assert.rejects(createEphemeral({parentId:'parent',ownerId,kind:'side'}),/already active/);
 const outcome=assert.rejects(pending,/cancelled/);
 await closeEphemeral('pending-sdk',ownerId); await outcome;
 assert.equal(globalThis.__piEphemeralSessions.has('pending-sdk'),false);
 const recap=createEphemeral({parentId:'parent',ownerId,kind:'recap'});
 await assert.rejects(createEphemeral({parentId:'parent',ownerId,kind:'recap'}),/already active/);
 const c=await recap; await closeEphemeral(c.id,ownerId);
});

test('recap waits for prompt settlement, preserves boundary through compaction and disposes on errors',async()=>{
 const {runRecap,SIDE_BOUNDARY}=await jiti.import('./ephemeral-session.ts');
 const c=await createEphemeral({parentId:'parent',ownerId:'settlement',kind:'recap'});
 const r=globalThis.__piEphemeralSessions.get(c.id); const session=r.session;
 assert.match(session.systemPrompt,new RegExp(SIDE_BOUNDARY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 let release; const pending=new Promise(resolve=>{release=resolve;}); let settled=false;
 session.prompt=async()=>{
  session.sessionManager.appendMessage({role:'assistant',content:[{type:'text',text:'PREMATURE'}],stopReason:'error',timestamp:4});
  await pending;
  session.sessionManager.appendCompaction('SIDE_SUMMARY',session.sessionManager.getLeafId(),100);
  session.sessionManager.appendMessage({role:'assistant',content:[{type:'text',text:'RETRIED_OWN_ANSWER'}],stopReason:'stop',timestamp:5});
 };
 const result=promptEphemeral(c.id,'settlement','test').then(value=>{settled=true;return value;});
 await new Promise(resolve=>setImmediate(resolve)); assert.equal(settled,false); release();
 const answer=await result; assert.equal(answer.answer,'RETRIED_OWN_ANSWER');
 assert.doesNotMatch(JSON.stringify(answer.messages),/UNFLUSHED_SENTINEL|ALTERNATIVE|COMPACTION_SENTINEL/);
 await closeEphemeral(c.id,'settlement');
 // Exercise the same runRecap finally path with an actual SDK rejected prompt (no paid provider).
 const ctl=new AbortController(); const recap=runRecap({id:'recap-cancel',parentId:'parent',ownerId:'finally',signal:ctl.signal}); ctl.abort();
 await assert.rejects(recap,/cancelled|abort/i); assert.equal(globalThis.__piEphemeralSessions.has('recap-cancel'),false);
});

test('prompt timeout, abort and heartbeat expiry dispose exactly once',async(t)=>{
 const {heartbeatEphemeral,EPHEMERAL_PROMPT_MS}=await jiti.import('./ephemeral-session.ts');
 for(const mode of ['timeout','abort']) {
  const c=await createEphemeral({parentId:'parent',ownerId:mode,kind:'side'}); const r=globalThis.__piEphemeralSessions.get(c.id),session=r.session;
  let settle; let disposals=0; const dispose=session.dispose.bind(session);
  session.dispose=()=>{disposals++;dispose();}; session.prompt=()=>new Promise(resolve=>{settle=resolve;}); session.abort=async()=>{settle?.();};
  clearTimeout(r.timer); t.mock.timers.enable({apis:['setTimeout']});
  const ctl=new AbortController(); const promise=promptEphemeral(c.id,mode,'test',ctl.signal);
  const rejected=assert.rejects(promise,/timed out|cancelled/);
  if(mode==='timeout')t.mock.timers.tick(EPHEMERAL_PROMPT_MS+1); else ctl.abort();
  await rejected; await closeEphemeral(c.id,mode);
  assert.equal(disposals,1); assert.equal(globalThis.__piEphemeralSessions.has(c.id),false); t.mock.timers.reset();
 }
 const c=await createEphemeral({parentId:'parent',ownerId:'heartbeat',kind:'side'}),r=globalThis.__piEphemeralSessions.get(c.id);
 clearTimeout(r.timer); t.mock.timers.enable({apis:['setTimeout']}); heartbeatEphemeral(c.id,'heartbeat');
 t.mock.timers.tick(EPHEMERAL_IDLE_MS-1); heartbeatEphemeral(c.id,'heartbeat'); t.mock.timers.tick(2);
 assert.equal(globalThis.__piEphemeralSessions.has(c.id),true);
 t.mock.timers.tick(EPHEMERAL_IDLE_MS); await new Promise(resolve=>setImmediate(resolve));
 assert.equal(globalThis.__piEphemeralSessions.has(c.id),false);
});
