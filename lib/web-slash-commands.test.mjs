import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { BUILTIN_SLASH_COMMANDS as cli } from '../node_modules/@earendil-works/pi-coding-agent/dist/core/slash-commands.js';
const {WEB_SLASH_COMMANDS,parseWebSlashCommand}=await createJiti(import.meta.url).import('./web-slash-commands.ts');
test('Web commands map to actual installed Pi CLI commands, with no duplicate names',()=>{
 const names=WEB_SLASH_COMMANDS.map(c=>c.name);
 assert.equal(new Set(names).size,names.length);
 for(const name of names.filter(name=>!["side","btw","recap"].includes(name))) assert.ok(cli.some(c=>c.name===name),name);
 assert.ok(["side","btw","recap"].every(name=>names.includes(name)));
 assert.ok(names.includes('model')&&names.includes('thinking')&&names.includes('resume')&&names.includes('fork'));
});
test('command parsing retains arguments and leaves extension/skill prompts untouched',()=>{
 assert.equal(parseWebSlashCommand('/MODEL provider/model-id').argument,'provider/model-id');
 assert.equal(parseWebSlashCommand('/thinking high').idle,true);
 assert.equal(parseWebSlashCommand('/new').argument,'');
 for(const input of ['/newest','hello /model','/skill:review','/custom-extension','/']) assert.equal(parseWebSlashCommand(input),null);
});
