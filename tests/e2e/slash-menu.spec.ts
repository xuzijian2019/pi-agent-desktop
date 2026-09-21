import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {AGENT_DIR,SESSIONS_DIR,WORK_ROOT} from './sandbox';

const input=(page:Page)=>page.locator('.chat-composer textarea');
const menu=(page:Page)=>page.getByRole('listbox',{name:'Commands',exact:true});
async function command(page:Page,text:string){await input(page).fill(text); await input(page).press('Enter');}
async function project(page:Page){const cwd=path.join(WORK_ROOT,randomUUID());await mkdir(cwd,{recursive:true});await page.goto(`/?cwd=${encodeURIComponent(cwd)}`);await expect(input(page)).toBeEditable();return cwd;}
test.beforeAll(async()=>{
 await mkdir(path.join(AGENT_DIR,'extensions'),{recursive:true});
 await writeFile(path.join(AGENT_DIR,'settings.json'),JSON.stringify({defaultProvider:'local-slash',defaultModel:'fixture-a',defaultThinkingLevel:'off',compaction:{enabled:false}}));
 await writeFile(path.join(AGENT_DIR,'models.json'),JSON.stringify({providers:{'local-slash':{api:'openai-completions',baseUrl:'http://127.0.0.1:1/v1',apiKey:'offline-only',models:['fixture-a','fixture-b'].map(id=>({id,name:id,reasoning:true,contextWindow:128000,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}))}}}));
 await writeFile(path.join(AGENT_DIR,'extensions','commands.ts'),`export default function(pi){ for(const name of ['zebra',...Array.from({length:18},(_,i)=>'custom-'+i)])pi.registerCommand(name,{description:'Custom command with a longer description for the command list',handler:async(_args,ctx)=>{ctx.ui.notify('EXTENSION_COMMAND_OK','info')}}) }`);
});
async function seed(page:Page,request:APIRequestContext){
 const cwd=path.join(WORK_ROOT,randomUUID());await mkdir(cwd,{recursive:true});const id=randomUUID(),timestamp=new Date().toISOString();
 const dir=path.join(SESSIONS_DIR,'--'+cwd.replace(/^\//,'').replaceAll('/','-')+'--');await mkdir(dir,{recursive:true});const file=path.join(dir,`${timestamp.replaceAll(':','-')}_${id}.jsonl`);
 const assistant={role:'assistant',content:[{type:'text',text:'ANSWER_FOR_COPY'}],api:'openai-completions',provider:'local-slash',model:'fixture-a',stopReason:'stop',timestamp:Date.now(),usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
 const entries=[{type:'session',version:3,id,cwd,timestamp},{type:'model_change',id:'model001',parentId:null,provider:'local-slash',modelId:'fixture-a',timestamp},{type:'thinking_level_change',id:'think001',parentId:'model001',thinkingLevel:'off',timestamp}, {type:'message',id:'user0001',parentId:'think001',timestamp,message:{role:'user',content:'First question',timestamp:Date.now()}},{type:'message',id:'answer01',parentId:'user0001',timestamp,message:assistant},{type:'message',id:'user0002',parentId:'answer01',timestamp,message:{role:'user',content:'Second question',timestamp:Date.now()}},{type:'message',id:'answer02',parentId:'user0002',timestamp,message:assistant}];
 await writeFile(file,entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
 // A normal API creation invalidates discovery's cache after external fixture writes.
 await request.post('/api/agent/new',{data:{cwd,type:'ensure_session',persistPreferences:false}});
 await page.goto(`/?session=${id}`); await expect(page.getByText('Second question',{exact:true})).toBeVisible();await expect(input(page)).toBeEditable();return{id,cwd,file};
}

test('compact command rows, predictable keyboard navigation, search, completion and narrow layout',async({page})=>{
 await project(page);await input(page).fill('/');await expect(menu(page).getByRole('option')).toHaveCount(40);
 const options=menu(page).getByRole('option');const boxes=await options.evaluateAll(nodes=>nodes.slice(0,8).map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,height:r.height}}));
 expect(new Set(boxes.map(b=>b.x)).size).toBe(1);expect(Math.max(...boxes.map(b=>b.height))).toBeLessThanOrEqual(40);
 expect((await menu(page).boundingBox())!.height).toBeLessThan(341);
 expect((await page.locator('.composer-completion-popover.is-slash').boundingBox())!.y).toBeGreaterThanOrEqual(48);
 const first=await input(page).getAttribute('aria-activedescendant');await input(page).press('ArrowDown');expect(await input(page).getAttribute('aria-activedescendant')).not.toBe(first);
 await input(page).press('ArrowUp');expect(await input(page).getAttribute('aria-activedescendant')).toBe(first);
 await input(page).press('ArrowUp');await expect(options.last()).toHaveAttribute('aria-selected','true');await expect(options.last()).toBeInViewport();
 const selected=await input(page).getAttribute('aria-activedescendant');await input(page).press('ArrowLeft');expect(await input(page).getAttribute('aria-activedescendant')).toBe(selected);
 await input(page).fill('/zeb');await expect(options).toHaveCount(1);await input(page).press('Tab');await expect(input(page)).toHaveValue('/zebra ');await expect(menu(page)).toHaveCount(0);
 await input(page).fill('/');await expect(menu(page)).toBeVisible();await page.screenshot({path:test.info().outputPath('slash-desktop.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Theme: Dark'}).click();await expect(menu(page)).toBeVisible();await page.screenshot({path:test.info().outputPath('slash-desktop-dark.png'),animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.sidebar-container')).toHaveClass(/sidebar-closed/);await expect(menu(page)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:test.info().outputPath('slash-mobile.png'),animations:'disabled'});
 await input(page).press('Escape');await expect(menu(page)).toHaveCount(0);await expect(input(page)).toHaveValue('/');
});

test('native UI commands open existing settings, auth, trust, hotkeys and resume controls',async({page})=>{
 await project(page);
 for(const name of ['settings','login','logout','trust','hotkeys']){
  await command(page,'/'+name);await expect(page.getByRole('dialog').first()).toBeVisible();await expect(input(page)).toHaveValue('');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 await command(page,'/resume');await expect(page.getByRole('searchbox',{name:'Search all conversations...',exact:true})).toBeFocused();
});

test('native model/thinking commands use SDK actions; invalid arguments never become prompts',async({page,request})=>{
 const p=await seed(page,request);const sent:string[]=[];page.on('request',req=>{if(req.method()==='POST'&&req.url().endsWith(`/api/agent/${p.id}`))sent.push(req.postDataJSON().type)});
 await command(page,'/model');await expect(page.locator('.composer-model-panel')).toBeVisible();await page.keyboard.press('Escape');
 await command(page,'/model local-slash/fixture-b');await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.model?.id).toBe('fixture-b');
 await command(page,'/thinking high');await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.thinkingLevel).toBe('high');
 await command(page,'/thinking impossible');await expect(page.getByRole('alert').filter({hasText:'supported thinking level'})).toBeVisible();await expect(input(page)).toHaveValue('/thinking impossible');
 expect(sent).not.toContain('prompt');expect(sent).not.toContain('follow_up');
});

test('session commands rename, show stats, export, choose a fork and navigate to a new session',async({page,request,context})=>{
 const p=await seed(page,request);await command(page,'/name Renamed from slash');await expect(page).toHaveTitle(/Renamed from slash/);
 await command(page,'/session');await expect(page.getByRole('dialog')).toContainText('Total tokens');await page.keyboard.press('Escape');
 await command(page,'/tree');await expect(page.getByRole('button',{name:'Forks',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 const popupPromise=context.waitForEvent('page');await command(page,'/export');const popup=await popupPromise;await popup.waitForLoadState();expect(popup.url()).toContain(`/api/sessions/${p.id}/export`);await popup.close();
 await command(page,'/fork');const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Choose a user message');await dialog.getByRole('button',{name:'2. Second question'}).click();
 await expect(page).not.toHaveURL(new RegExp(p.id));await expect(page).toHaveURL(/session=/);await expect(page.locator('p').filter({hasText:/^First question$/})).toBeVisible();
 await command(page,'/new');await expect(page).toHaveURL(/cwd=/);await expect(input(page)).toHaveValue('');
 expect(await readFile(p.file,'utf8')).not.toContain('/fork');
});

test('streaming native commands stay local; extension commands still execute normally',async({page,request})=>{
 const p=await seed(page,request);await command(page,'!sleep 5');await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isBashRunning).toBe(true);
 await command(page,'/model');await expect(page.getByRole('alert').filter({hasText:'Wait for the current task'})).toBeVisible();
 await input(page).fill('/model');await input(page).press('Control+Enter');await expect(page.getByRole('alert').filter({hasText:'Wait for the current task'})).toBeVisible();
 await command(page,'/hotkeys');await expect(page.getByRole('dialog')).toBeVisible();expect((await (await request.get(`/api/agent/${p.id}`)).json()).state.isBashRunning).toBe(true);await page.keyboard.press('Escape');
 await expect.poll(async()=> (await (await request.get(`/api/agent/${p.id}`)).json()).state?.isBashRunning).toBe(false);
 await command(page,'/zebra');await expect(input(page)).toHaveValue('/zebra ');await input(page).press('Enter');await expect(page.getByText('EXTENSION_COMMAND_OK',{exact:true})).toBeVisible();
 expect(await readFile(p.file,'utf8')).not.toContain('/model');
});

test('async native command completion preserves a newer draft',async({page,request})=>{
 const p=await seed(page,request);let release!:()=>void;let arrived=false;const barrier=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/agent/${p.id}`,async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().type==='set_session_name'){const response=await route.fetch();arrived=true;await barrier;await route.fulfill({response});}else await route.continue();});
 await command(page,'/name Pending rename');await expect.poll(()=>arrived).toBe(true);await input(page).fill('KEEP NEW DRAFT');release();
 await expect(page).toHaveTitle(/Pending rename/);await expect(input(page)).toHaveValue('KEEP NEW DRAFT');
});
