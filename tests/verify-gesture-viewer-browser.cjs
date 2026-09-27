// Browser QA for an isolated viewer fed by real native IPC and synthetic strokes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const [url,name,screenshot]=process.argv.slice(2);
assert(/^__gesture_viewer_test_\d+$/.test(name));
const native=code=>{const out=execFileSync('hyprctl',['eval',code],{encoding:'utf8'}).trim();assert.equal(out,'ok')};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const context=await browser.newContext({viewport:{width:940,height:950}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.getElementById('connection').textContent.startsWith('Live'));
  native(`${name}.mode:tap()`);
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='Armed');
  assert.equal(await page.locator('#clear').isDisabled(),true);
  native(`${name}.mode:start({type='swipe',fingers=3,delta={x=0,y=0},time_ms=100}); ${name}.mode:update({type='swipe',fingers=3,delta={x=20,y=10},time_ms=150}); ${name}.mode:update({type='swipe',fingers=3,delta={x=20,y=10},time_ms=200})`);
  await page.waitForFunction(()=>document.getElementById('points').textContent==='3');
  assert.equal(await page.locator('#phase').textContent(),'Drawing');
  assert.equal((await page.locator('#trace').getAttribute('points')).trim().split(/\s+/).length,3);
  native(`${name}.mode:finish({type='swipe',cancelled=false,time_ms=250})`);
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='Not recognized');
  assert.match(await page.locator('#result').textContent(),/too few distinct points/);
  native(`local m=${name}.mode;m:tap();m:start({type='swipe',fingers=3,delta={x=0,y=0},time_ms=100});local x,y=60,0;for i=1,64 do local a=2*math.pi*i/64;local nx,ny=60*math.cos(a),60*math.sin(a);m:update({type='swipe',fingers=3,delta={x=nx-x,y=ny-y},time_ms=100+i*40});x,y=nx,ny end;m:finish({type='swipe',cancelled=false,time_ms=3000})`);
  try{await page.waitForFunction(()=>document.getElementById('phase').textContent==='Recognized',{},{timeout:5000})}
  catch(error){const s=await (await page.request.get(url+'/api/state')).json();console.error('Recognition observation:',{phase:s.phase,points:s.points.length,reason:s.reason,connected:s.connected});throw error}
  assert.equal(await page.locator('#result').textContent(),'Clockwise circle');
  assert.equal(await page.locator('#points').textContent(),'65');
  assert.equal(await page.locator('#source').textContent(),'Synthetic test data');
  native(`local m=${name}.mode;m:tap();m:start({type='swipe',fingers=3,delta={x=0,y=0},time_ms=100});local x,y=60,0;for i=1,96 do local a=-1.25*2*math.pi*i/96;local nx,ny=60*math.cos(a),33*math.sin(a);m:update({type='swipe',fingers=3,delta={x=nx-x,y=ny-y},time_ms=100+i*30});x,y=nx,ny end;m:finish({type='swipe',cancelled=false,time_ms=3100})`);
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='Recognized'&&document.getElementById('points').textContent==='97');
  assert.equal(await page.locator('#result').textContent(),'Counterclockwise circle');
  assert.match(await page.locator('#hint').textContent(),/Rough ovals/);
  assert.notEqual(await page.locator('#gap').textContent(),'0%');
  console.log('PASS: live UI recognizes an open-ended oval with overshoot');
  await page.screenshot({path:screenshot,fullPage:true});
  await page.getByRole('button',{name:'Clear view'}).click();
  assert.equal(await page.locator('#trace').getAttribute('points'),'');
  native(`${name}.mode:tap();${name}.mode:start({type='swipe',fingers=3,delta={x=0,y=0},time_ms=100});${name}.mode:update({type='swipe',fingers=3,delta={x=30,y=-10},time_ms=150});${name}.mode:cancel('test cancellation');${name}.mode:finish({type='swipe',cancelled=true,time_ms=200})`);
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='Cancelled');
  assert.match(await page.locator('#result').textContent(),/test cancellation/);
  await page.setViewportSize({width:390,height:760});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.request.get(url+'/__test_disconnect_events');
  await page.waitForFunction(()=>document.getElementById('connection').textContent==='Viewer disconnected',{},{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('connection').textContent.startsWith('Live'),{},{timeout:10000});
  assert.deepEqual(errors,[]);
  console.log('PASS: real Lua publisher -> native IPC -> server/SSE -> browser live trail');
  console.log('PASS: armed, drawing, rejected, recognized, cancelled, clear, reconnect, narrow layout, no page errors');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
