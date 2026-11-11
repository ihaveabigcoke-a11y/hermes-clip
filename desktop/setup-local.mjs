import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {enablePortableMediaTools} from './src/runtime-tools.mjs';
const root=dirname(fileURLToPath(import.meta.url));
enablePortableMediaTools(root);
function npm(command){const result=process.platform==='win32'?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm '+command],{cwd:root,stdio:'inherit'}):spawnSync('npm',command.split(' '),{cwd:root,stdio:'inherit'});if(result.error||result.status!==0)throw Error('npm '+command+' failed. Read the error above.');}

function ensureElectron() {
  const installer=join(root,'node_modules/electron/install.js');
  for(let attempt=1;attempt<=3;attempt++) {
    const result=spawnSync(process.execPath,[installer],{cwd:root,stdio:'inherit',timeout:240000});
    if(!result.error&&result.status===0)return;
    if(attempt<3)console.warn(`Electron installation failed (attempt ${attempt}/3). Retrying only the Electron binary.`);
  }
  throw Error('Electron could not be downloaded. Check the network, then run START-LOCAL.cmd again. Existing dependencies and workspace data were kept.');
}

try {
  if(Number(process.versions.node.split('.')[0])<24)throw Error('Install Node.js 24 LTS or newer from https://nodejs.org/en/download.');
  if(!existsSync(join(root,'local-dist/ui/index.html')))throw Error('The local UI is missing. Extract the complete Product-Lab-Local ZIP.');
  const dependencies=['electron','playwright','zod','proxy-chain'];
  if(dependencies.some(name=>!existsSync(join(root,'node_modules',name,'package.json')))) {
    console.log('First run: installing locked desktop dependencies. Internet is required.');
    npm('ci');
  }
  ensureElectron();
  npm('run browser:install');
  if(['ffmpeg','ffprobe'].some(tool=>spawnSync(tool,['-version'],{stdio:'ignore',windowsHide:true,timeout:5000}).status!==0))console.warn('FFmpeg/ffprobe missing: install them on PATH or place both in desktop/tools/ffmpeg/bin. Profile login still works, but generation validation and merging stay blocked.');
  npm('start');
} catch(error){console.error(error.message);process.exitCode=1;}
