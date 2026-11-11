import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {prepareTestBuild,removeTestBuild} from '../desktop/test/helpers/local-server.mjs';

const [mode,...args]=process.argv.slice(2);
const build=await prepareTestBuild(mode);
try{
  console.log('Built one shared '+mode+' test bundle: '+build.buildRoot);
  const child=spawn(process.execPath,['--test',...args],{
    stdio:'inherit',env:{...process.env,HERMES_TEST_BUILD_DIR:build.buildRoot},
  });
  const [code,signal]=await once(child,'exit');
  process.exitCode=signal?1:code;
}finally{await removeTestBuild(build.buildRoot);}
