import {spawn} from 'node:child_process';
import {readdir, lstat} from 'node:fs/promises';
import {join} from 'node:path';

// Dedicated to the optional downloader; runJson's shared envelope stays intact.
// A byte budget also covers .part/subtitle files while the process is running.
export function runReferenceCommand(command, args, {timeout=60000, maxBytes=4*1024**2, fileBudget}={}) {
  return new Promise((resolve, reject) => {
    let done=false, size=0, output='', budgetCheck=null;
    const child=spawn(command,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','ignore']});
    function stop() {
      if(!child.pid)return;
      if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
      else try{process.kill(-child.pid,'SIGKILL');}catch{}
    }
    function finish(error) {
      if(done)return;done=true;clearTimeout(timer);clearInterval(monitor);
      if(error){stop();reject(error);}else resolve(output);
    }
    function checkBudget() {
      if(!fileBudget||done)return Promise.resolve();
      if(budgetCheck)return budgetCheck;
      budgetCheck=(async()=>{
        let bytes=0;
        for(const name of await readdir(fileBudget.directory)) {
          // yt-dlp may rename a .part file between readdir and lstat.
          const file=await lstat(join(fileBudget.directory,name)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
          if(!file)continue;
          if(!file.isFile()||file.isSymbolicLink())throw Error('Đầu ra tải video không phải file thường.');
          bytes+=file.size;
        }
        if(bytes>fileBudget.maxBytes)throw Error('Tải video vượt giới hạn dung lượng tác vụ.');
      })().finally(()=>{budgetCheck=null;});
      return budgetCheck;
    }
    const timer=setTimeout(()=>finish(Error('Tải video quá thời gian; đã dừng tiến trình local.')),timeout);
    const monitor=fileBudget?setInterval(()=>void checkBudget().catch(finish),100):undefined;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',value=>{
      if(done)return;size+=Buffer.byteLength(value);
      if(size>Math.min(maxBytes,4*1024**2))return finish(Error('Kết quả vượt giới hạn đọc.'));
      output+=value;
    });
    child.on('error',()=>finish(Error('Chưa có công cụ tải video local.')));
    child.on('close',async code=>{
      try {
        // A fast exit can happen before the first periodic budget check.
        if(budgetCheck)await budgetCheck;
        await checkBudget();
        finish(code===0?null:Error('Công cụ tải video báo lỗi; giữ tác vụ để đối soát trước khi thử lại.'));
      }catch(error){finish(error);}
    });
  });
}
