import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_DIR, SESSIONS_DIR, WORK_ROOT } from './sandbox';

type Wire = { messages: Array<{role: string; content: unknown}>; tools?: Array<{function: {name: string}}> };
const calls: Wire[] = [];
const held: ServerResponse[] = [];
let recapMode: 'ok' | 'hold' | 'error' = 'ok';
const server = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  const body = JSON.parse(raw) as Wire; calls.push(body);
  const last = body.messages.at(-1)!;
  const text = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
  const isRecap = text.includes('Summarize the inherited conversation');
  if (isRecap && recapMode === 'error') { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:'LOCAL_RECAP_ERROR',type:'invalid_request_error'}})); return; }
  res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
  const chunk = (delta: unknown, reason: string | null = null) => res.write(`data: ${JSON.stringify({id:'local',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason:reason}]})}\n\n`);
  chunk({role:'assistant'});
  if (text.includes('PARENT_HOLD') || text.includes('SIDE_HOLD') || (isRecap && recapMode === 'hold')) { chunk({content:'WORKING_LOCAL'}); held.push(res); return; }
  if (text.includes('READ_FIXTURE') && last.role !== 'tool') {
    chunk({tool_calls:[{index:0,id:'call_read',type:'function',function:{name:'read',arguments:JSON.stringify({path: path.join(WORK_ROOT,'read-only.txt')})}}]});
    chunk({}, 'tool_calls');
  } else {
    chunk({content: isRecap ? '## Goal\nLOCAL_RECAP_OK' : last.role === 'tool' ? `READ_OK ${text}` : 'LOCAL_SIDE_OK'});
    chunk({}, 'stop');
  }
  res.end('data: [DONE]\n\n');
});
function finishHeld() { for (const res of held.splice(0)) if (!res.destroyed) { res.write(`data: ${JSON.stringify({id:'local',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{content:' FINISHED_LOCAL'},finish_reason:'stop'}]})}\n\n`); res.end('data: [DONE]\n\n'); } }
test.beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = (server.address() as {port:number}).port;
  await mkdir(AGENT_DIR,{recursive:true});
  await writeFile(path.join(AGENT_DIR,'models.json'),JSON.stringify({providers:{'local-acceptance':{api:'openai-completions',baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'offline-fixture-only',models:[{id:'fixture',reasoning:false,contextWindow:128000,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}}));
  await writeFile(path.join(AGENT_DIR,'settings.json'),JSON.stringify({defaultProvider:'local-acceptance',defaultModel:'fixture',defaultThinkingLevel:'off',compaction:{enabled:false},retry:{enabled:false},autoUpdate:false}));
  await writeFile(path.join(WORK_ROOT,'read-only.txt'),'READ_SENTINEL');
});
test.afterEach(() => { finishHeld(); recapMode='ok'; });
test.afterAll(async () => { finishHeld(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); });
async function seed(request:APIRequestContext) {
  const id=randomUUID(), cwd=path.join(WORK_ROOT,id); await mkdir(cwd,{recursive:true});
  const dir=path.join(SESSIONS_DIR,`--${cwd.replace(/^\//,'').replaceAll('/','-')}--`); await mkdir(dir,{recursive:true});
  const timestamp=new Date().toISOString(); const file=path.join(dir,`${timestamp.replaceAll(':','-')}_${id}.jsonl`);
  const entries=[{type:'session',version:3,id,cwd,timestamp},{type:'model_change',id:'model001',parentId:null,provider:'local-acceptance',modelId:'fixture',timestamp},{type:'thinking_level_change',id:'think001',parentId:'model001',thinkingLevel:'off',timestamp},{type:'message',id:'user0001',parentId:'think001',timestamp,message:{role:'user',content:'INHERITED_PARENT_ONLY',timestamp:Date.now()}},{type:'message',id:'assist01',parentId:'user0001',timestamp,message:{role:'assistant',content:[{type:'text',text:'INHERITED_ANSWER_ONLY'}],api:'openai-completions',provider:'local-acceptance',model:'fixture',stopReason:'stop',timestamp:Date.now(),usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}}];
  const original=entries.map(e=>JSON.stringify(e)).join('\n')+'\n'; await writeFile(file,original); const refresh=await request.post('/api/agent/new',{data:{cwd,type:'ensure_session',provider:'local-acceptance',modelId:'fixture',persistPreferences:false}}); expect(refresh.ok(),await refresh.text()).toBeTruthy(); return {id,cwd,file,original};
}
async function open(page:Page) { const p=await seed(page.request); await page.request.patch(`/api/sessions/${p.id}`,{data:{name:`Acceptance ${p.id}`}}); p.original=await readFile(p.file,'utf8'); await page.goto(`/?session=${p.id}`); await expect(page.getByPlaceholder('Message…',{exact:false})).toBeEditable(); await expect(page.getByText('INHERITED_ANSWER_ONLY',{exact:true})).toBeVisible(); return p; }
async function command(page:Page,text:string,key='Enter') { const input=page.locator('.chat-composer textarea'); await input.fill(text); if(text.startsWith('/') && !text.includes(' ')) await input.press('Escape'); await input.press(key); }
async function sideCreate(request:APIRequestContext,parentId:string,ownerId=randomUUID()) { const res=await request.post('/api/ephemeral',{data:{parentId,ownerId,kind:'side'}}); expect(res.ok(),await res.text()).toBeTruthy(); return {...(await res.json()).data,ownerId}; }
async function close(request:APIRequestContext,s:{id:string;ownerId:string}) { await request.delete(`/api/ephemeral/${s.id}?ownerId=${s.ownerId}`); }

test('SDK/provider/browser: read-only side follow-up, return, recap and no parent JSONL pollution',async({page,request})=>{
  const p=await open(page); const settings=await readFile(path.join(AGENT_DIR,'settings.json'),'utf8'); const start=calls.length;
  await command(page,'/btw READ_FIXTURE'); const panel=page.getByRole('region',{name:'Side chat',exact:true});
  await expect(panel).toBeVisible(); await expect(panel.getByText(/READ_OK/)).toBeVisible(); await expect(panel).not.toContainText('INHERITED_ANSWER_ONLY');
  expect(calls.slice(start)[0].tools?.map(t=>t.function.name).sort()).toEqual(['find','grep','ls','read']);
  await panel.locator('textarea').fill('Follow up'); await panel.locator('textarea').press('Enter'); await expect(panel).toContainText('LOCAL_SIDE_OK');
  expect(new URL(page.url()).searchParams.get('session')).toBe(p.id);
  await panel.getByRole('button',{name:'Return to main'}).click(); await expect(panel).toHaveCount(0);
  await command(page,'/recap'); await expect(page.getByText('LOCAL_RECAP_OK',{exact:true})).toBeVisible();
  expect(calls.at(-1)?.tools ?? []).toEqual([]);
  expect(await readFile(p.file,'utf8')).toBe(p.original); expect(await readFile(path.join(AGENT_DIR,'settings.json'),'utf8')).toBe(settings);
  const listed=(await (await request.get('/api/sessions')).json()).sessions; expect(listed.filter((s:{cwd:string})=>s.cwd===p.cwd).map((s:{id:string})=>s.id)).toEqual([p.id]);
  expect((await readdir(path.dirname(p.file))).length).toBe(1);
});

test('API: owner isolation, mutation rejection, concurrent creation and cleanup',async({request})=>{
 const p=await seed(request); const ownerId=randomUUID();
 const results=await Promise.all([1,2].map(()=>request.post('/api/ephemeral',{data:{parentId:p.id,ownerId,kind:'side'}})));
 const created=[]; for(const r of results) if(r.ok()) created.push({...((await r.json()).data),ownerId});
 expect.soft(created.length,'one side per owning view even during creation').toBe(1);
 for(const s of created){
  await request.delete(`/api/ephemeral/${s.id}?ownerId=wrong-owner`);
  expect((await request.post(`/api/ephemeral/${s.id}`,{data:{ownerId:'wrong-owner',message:'test'}})).status()).toBe(409);
  expect((await request.post(`/api/ephemeral/${s.id}`,{data:{ownerId,type:'set_tools',tools:['bash']}})).status()).toBe(400);
  expect((await request.post(`/api/ephemeral/${s.id}`,{data:{ownerId,message:'test'}})).ok()).toBeTruthy();
  await close(request,s); expect((await request.post(`/api/ephemeral/${s.id}`,{data:{ownerId,message:'test'}})).status()).toBe(409);
 }
});

test('running parent: local command dispatch must snapshot latest unflushed turn',async({page,request})=>{
 const p=await open(page); await command(page,'PARENT_HOLD LATEST_TURN_SENTINEL');
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 const start=calls.length; const input=page.locator('.chat-composer textarea'); await input.fill('/btw current state?'); await input.press('Control+Enter');
 const panel=page.getByRole('region',{name:'Side chat',exact:true}); await expect(panel).toBeVisible(); await expect(panel).toContainText('LOCAL_SIDE_OK');
 expect.soft(JSON.stringify(calls.slice(start)[0].messages),'side includes current completed user message').toContain('LATEST_TURN_SENTINEL');
 expect((await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 await panel.getByRole('button',{name:'Return to main'}).click(); finishHeld();
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(false);
 expect(await readFile(p.file,'utf8')).not.toContain('/btw');
});

test('invalid local commands display useful errors and never call provider',async({page})=>{
 await open(page); const start=calls.length;
 await command(page,'/side');
 await expect.soft(page.getByText('Usage: /side <question> (or /btw <question>)',{exact:true})).toBeVisible({timeout:2000});
 expect(calls.length).toBe(start); await expect(page.getByPlaceholder('Message…',{exact:false})).toHaveValue('/side');
});

test('recap: pending cancellation control and navigation must not retain stale card',async({page})=>{
 const p=await open(page); recapMode='hold'; await command(page,'/recap');
 await expect.poll(()=>calls.some(c=>JSON.stringify(c.messages.at(-1)).includes('Summarize the inherited conversation'))).toBe(true);
 await expect.soft(page.getByRole('button',{name:/cancel recap/i})).toBeVisible({timeout:1500});
 await page.keyboard.press('Control+Alt+n'); await expect(page).toHaveURL(/cwd=/); finishHeld();
 await expect(page.getByText('WORKING_LOCAL FINISHED_LOCAL',{exact:true})).toHaveCount(0);
 const link=page.locator(`a[href="?session=${p.id}"]`); await link.click(); await expect(page).toHaveURL(new RegExp(p.id));
 await expect.soft(page.getByText('WORKING_LOCAL FINISHED_LOCAL',{exact:true})).toHaveCount(0,{timeout:2000});
});

test('side: narrow layout, focus isolation, nested command rejection and refresh cleanup',async({page,request})=>{
 const p=await open(page); await page.setViewportSize({width:390,height:844}); await command(page,'/side test');
 const panel=page.getByRole('region',{name:'Side chat',exact:true}); await expect(panel).toContainText('LOCAL_SIDE_OK');
 await expect(panel.locator('textarea')).toBeFocused();
 const main=page.getByPlaceholder('Message…',{exact:false});
 expect.soft(await main.evaluate(el=>!!el.closest('[inert]')),'hidden main composer must be inert').toBe(true);
 const start=calls.length; await panel.locator('textarea').fill('/unknown'); await panel.locator('textarea').press('Enter');
 await expect.soft(panel.getByRole('alert')).toBeVisible({timeout:1500});
 expect.soft(calls.length,'unknown side commands rejected locally').toBe(start);
 await panel.getByRole('button',{name:'Return to main'}).click();
 const s=await sideCreate(request,p.id); await close(request,s);
 await page.reload(); await expect(panel).toHaveCount(0);
});

test('recap error retains previous result and exposes failure',async({page})=>{
 await open(page); await command(page,'/recap'); await expect(page.getByText('LOCAL_RECAP_OK',{exact:true})).toBeVisible();
 recapMode='error'; const start=calls.length; await command(page,'/recap'); await expect.poll(()=>calls.length).toBeGreaterThan(start);
 await expect(page.getByText('Generating recap…',{exact:true})).toHaveCount(0);
 await expect(page.getByText('LOCAL_RECAP_OK',{exact:true})).toBeVisible();
 await expect.soft(page.getByText(/temporary model did not produce|LOCAL_RECAP_ERROR/)).toBeVisible({timeout:2000});
});

test('keyboard: tab must not enter hidden parent composer and Escape must not abort parent',async({page,request})=>{
 const p=await open(page); await command(page,'PARENT_HOLD FOCUS_SENTINEL');
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 await command(page,'/side focus test'); const panel=page.getByRole('region',{name:'Side chat',exact:true}); await expect(panel).toContainText('LOCAL_SIDE_OK');
 await panel.locator('textarea').focus(); let reachedMain=false;
 for(let i=0;i<25;i++){await page.keyboard.press('Shift+Tab'); reachedMain=await page.locator('.chat-composer textarea').evaluate(el=>document.activeElement===el); if(reachedMain)break;}
 await page.screenshot({path:test.info().outputPath('side-focus.png')});
 expect.soft(reachedMain,'Tab must remain outside hidden main composer').toBe(false);
 if(reachedMain){await page.keyboard.press('Escape'); await expect.soft.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming,{timeout:2000}).toBe(true);}
 await panel.getByRole('button',{name:'Return to main'}).click(); finishHeld();
});

test('side Stop aborts only side; UI shows question while waiting; parent finishes normally',async({page,request})=>{
 const p=await open(page); await command(page,'PARENT_HOLD STOP_SENTINEL');
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 await command(page,'/btw SIDE_HOLD INITIAL_SIDE_QUESTION'); const panel=page.getByRole('region',{name:'Side chat',exact:true}); await expect(panel).toContainText('Thinking');
 await expect.soft(panel).toContainText('INITIAL_SIDE_QUESTION',{timeout:1500});
 await panel.getByRole('button',{name:'Stop',exact:true}).click(); await expect(panel).toHaveCount(0);
 expect((await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true); finishHeld();
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(false);
});

test('pending creation navigation closes the child that finishes later',async({page,request})=>{
 const p=await open(page); let created:{id:string;ownerId:string}|undefined; let release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 // Delay delivery after the real API/SDK creates its child, exercising a network race.
 await page.route('**/api/ephemeral',async route=>{const response=await route.fetch(); const body=await response.json(); created={...body.data,ownerId:route.request().postDataJSON().ownerId}; await barrier; await route.fulfill({response}).catch(()=>{});});
 await command(page,'/side pending'); await expect.poll(()=>created?.id).toBeTruthy();
 await page.keyboard.press('Control+Alt+n'); await expect(page).toHaveURL(/cwd=/); release();
 await expect(page.getByRole('region',{name:'Side chat',exact:true})).toHaveCount(0);
 const response=await request.post(`/api/ephemeral/${created!.id}`,{data:{ownerId:created!.ownerId,message:'test still alive'}});
 expect.soft(response.status(),'navigation must clean up the created child').toBe(409);
 await close(request,created!); expect(await readFile(p.file,'utf8')).not.toContain('test still alive');
});

test('recap completion must preserve text typed while recap was pending',async({page})=>{
 await open(page); recapMode='hold'; await command(page,'/recap');
 await expect(page.getByText('Generating recap…',{exact:true})).toBeVisible();
 await expect.poll(()=>held.length).toBeGreaterThan(0); const input=page.locator('.chat-composer textarea'); await input.fill('UNSENT_DRAFT_TYPED_DURING_RECAP'); finishHeld();
 await expect(page.getByText('Generating recap…',{exact:true})).toHaveCount(0);
 await expect(input).toHaveValue('UNSENT_DRAFT_TYPED_DURING_RECAP');
});

test('recap cancel and modifier commands leave the running parent and new draft intact',async({page,request})=>{
 const p=await open(page); await command(page,'PARENT_HOLD CANCEL_SENTINEL');
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 const start=calls.length; recapMode='hold'; await command(page,'/recap','Alt+Enter');
 await expect.poll(()=>calls.length).toBeGreaterThan(start);
 const input=page.locator('.chat-composer textarea');await input.fill('KEEP_CANCEL_DRAFT');
 await page.getByRole('button',{name:'Cancel recap',exact:true}).click();await expect(page.getByText('Generating recap…',{exact:true})).toHaveCount(0);
 await expect(input).toHaveValue('KEEP_CANCEL_DRAFT');expect((await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);
 await command(page,'/btw','Control+Enter');await expect(page.getByText('Usage: /side <question> (or /btw <question>)',{exact:true})).toBeVisible();
 await command(page,'/side escape test','Alt+Enter'); const panel=page.getByRole('region',{name:'Side chat',exact:true});await expect(panel).toContainText('LOCAL_SIDE_OK');
 await panel.getByRole('button',{name:'Return to main'}).focus();await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 expect((await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(true);finishHeld();
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isStreaming).toBe(false);
 expect(await readFile(p.file,'utf8')).not.toMatch(/\/side|\/btw|\/recap|KEEP_CANCEL_DRAFT/);
});

test('refresh closes the actual UI-owned child and reconnect heartbeat preserves brief outages',async({page,context,request})=>{
 await open(page);await page.clock.install();let child:{id:string;ownerId:string}|undefined;let heartbeats=0;
 page.on('request',req=>{if(req.url().endsWith('/api/ephemeral')&&req.method()==='POST')child=req.postDataJSON();if(req.url().includes('/api/ephemeral/')&&req.method()==='PATCH')heartbeats++;});
 await command(page,'/side reconnect');const panel=page.getByRole('region',{name:'Side chat',exact:true});await expect(panel).toContainText('LOCAL_SIDE_OK');
 await context.setOffline(true);await page.clock.fastForward(31_000);await context.setOffline(false);await page.clock.fastForward(31_000);await expect.poll(()=>heartbeats).toBeGreaterThan(0);
 await panel.locator('textarea').fill('after reconnect');await panel.locator('textarea').press('Enter');await expect(panel.locator('textarea')).toHaveValue('');await expect(panel.getByRole('status')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:test.info().outputPath('side-mobile.png'),animations:'disabled'});
 await page.reload();await expect(panel).toHaveCount(0);
 await expect.poll(async()=> (await request.post(`/api/ephemeral/${child!.id}`,{data:{ownerId:child!.ownerId,message:'after refresh'}})).status()).toBe(409);
});

test('historical compacted branch and parent scroll container survive side and recap',async({page,request})=>{
 const p=await seed(request);const entries=(await readFile(p.file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));const assistant=entries.at(-1).message;const timestamp=new Date().toISOString();
 const historical=[{type:'message',id:'histuser',parentId:'assist01',timestamp,message:{role:'user',content:'HISTORICAL_QUESTION',timestamp:Date.now()}},{type:'compaction',id:'histcomp',parentId:'histuser',timestamp,summary:'COMPACTED_BRANCH_SENTINEL',firstKeptEntryId:'histuser',tokensBefore:1000},{type:'message',id:'histleaf',parentId:'histcomp',timestamp,message:{...assistant,content:[{type:'text',text:'HISTORICAL_LEAF\n\n'+Array.from({length:70},(_,i)=>`History line ${i}.\n`).join('\n')}]}},{type:'message',id:'altleaf1',parentId:'assist01',timestamp,message:{...assistant,content:[{type:'text',text:'ACTIVE_ALTERNATIVE_LEAF'}]}}];
 await writeFile(p.file,entries.concat(historical).map(entry=>JSON.stringify(entry)).join('\n')+'\n');await request.patch(`/api/sessions/${p.id}`,{data:{name:'Historical acceptance'}});await page.goto(`/?session=${p.id}`);
 await expect(page.getByText('ACTIVE_ALTERNATIVE_LEAF',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Forks',exact:true}).click();await page.locator('span').filter({hasText:/^HISTORICAL_LEAF/}).click();
 await expect(page.getByText('History line 30.',{exact:false})).toBeVisible();await page.keyboard.press('Escape');
 const scroller=page.locator('.chat-window .overflow-y-auto.pt-4');await scroller.evaluate(el=>{el.scrollTop=250;el.setAttribute('data-acceptance-scroll','kept');});const top=await scroller.evaluate(el=>el.scrollTop);
 const start=calls.length;await command(page,'/side branch question');const panel=page.getByRole('region',{name:'Side chat',exact:true});await expect(panel).toContainText('LOCAL_SIDE_OK');
 expect(JSON.stringify(calls.slice(start)[0].messages)).toContain('COMPACTED_BRANCH_SENTINEL');expect(JSON.stringify(calls.slice(start)[0].messages)).not.toContain('ACTIVE_ALTERNATIVE_LEAF');
 await panel.getByRole('button',{name:'Return to main'}).click();expect(new URL(page.url()).searchParams.get('session')).toBe(p.id);await expect(scroller).toHaveAttribute('data-acceptance-scroll','kept');expect(await scroller.evaluate(el=>el.scrollTop)).toBe(top);
 await command(page,'/recap');await expect(page.getByText('LOCAL_RECAP_OK',{exact:true})).toBeVisible();expect(JSON.stringify(calls.at(-1)?.messages)).toContain('COMPACTED_BRANCH_SENTINEL');expect(JSON.stringify(calls.at(-1)?.messages)).not.toContain('ACTIVE_ALTERNATIVE_LEAF');
 await expect(page.getByRole('region',{name:'Conversation recap',exact:true})).toBeInViewport();
 await page.screenshot({path:test.info().outputPath('recap-desktop.png'),animations:'disabled'});
});
