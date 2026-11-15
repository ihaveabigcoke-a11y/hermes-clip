// Synthetic images, isolated workspace, no external requests or Muse sends.
import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';

await officeUI('T-057',[],async({page,origin,screenshot})=>{
 await page.goto(origin+'/?view=characters');
 await page.getByRole('button',{name:'Thêm nhân vật',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Tên',{exact:true}).fill('Bông');
 const pictures=await page.evaluate(()=>['#fff','#101010','#efbf63'].map(color=>{
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;
  const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,240,240);
  c.fillStyle='#88a94a';c.beginPath();c.arc(120,120,70,0,Math.PI*2);c.fill();
  c.fillStyle='#202524';for(const x of [98,142]){c.beginPath();c.arc(x,110,6,0,Math.PI*2);c.fill();}
  c.fillRect(99,145,42,5);return canvas.toDataURL('image/png').split(',')[1];
 }));
 await dialog.getByLabel('Thêm ảnh nhân vật').setInputFiles(pictures.map((data,i)=>({name:'fixture-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
 await page.waitForFunction(()=>document.querySelectorAll('.character-edit-images img').length===3);
 await page.waitForFunction(()=>!document.querySelector('.character-form')?.disabled);
 const measurements=[];
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:width===1366?900:1080});
  await dialog.locator('.character-edit-images img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  const result=await dialog.evaluate(root=>{
   const label=root.querySelector('.character-image-label'),button=root.querySelector('.character-edit-images button'),style=getComputedStyle(button),rect=button.getBoundingClientRect();
   const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(v=>{const n=Number(v)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   const fg=luminance(style.color),bg=luminance(style.backgroundColor),contrast=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
   const icon=label.querySelector('svg').getBoundingClientRect(),text=document.createRange();text.selectNodeContents(label.lastChild);const textRect=text.getBoundingClientRect();
   return {contrast,background:style.backgroundColor,border:style.borderColor,width:rect.width,height:rect.height,labelAligned:Math.abs((icon.y+icon.height/2)-(textRect.y+textRect.height/2))<5,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(result.background,'rgb(32, 37, 36)');assert.equal(result.border,'rgb(255, 255, 255)');
  assert.ok(result.contrast>=4.5);assert.ok(result.width>=24&&result.height>=24);assert.equal(result.labelAligned,true);assert.equal(result.overflow,false);
  measurements.push({viewport:width,...result});await screenshot('characters-edit-'+width);
 }
 const sourceUrls=await dialog.locator('.character-edit-images img').evaluateAll(images=>images.map(i=>i.getAttribute('src')));
 const remove=dialog.getByRole('button',{name:'Bỏ ảnh 1',exact:true});await remove.focus();
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 assert.ok(await remove.evaluate(b=>b.matches(':focus-visible')));await remove.press('Enter');
 assert.equal(await dialog.locator('.character-edit-images img').count(),2);
 await dialog.getByRole('button',{name:'Lưu nhân vật',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.reload();await page.getByRole('heading',{name:'@Bông',exact:true}).waitFor();
 assert.equal(await page.locator('.character-thumbnails img').count(),2);
 for(const url of sourceUrls)assert.equal((await page.request.get(origin+url)).status(),200);
 return {measurements,keyboardRemove:true,reloadPreserved:true,originalAssetsPreserved:true,museSends:0};
});
