import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';

export const OLD_BUILD_MESSAGE='Bản build cũ hơn code. Chạy pnpm local:build';
// Walk local imports without evaluating them: a missing transitive build module must
// be reported before Electron's module loader opens its raw JavaScript error dialog.
export async function missingBuildModules(desktopRoot) {
  const seen=new Set(),missing=new Set(),buildRoot=resolve(desktopRoot,'local-dist');
  async function visit(file) {
    file=resolve(file);if(seen.has(file))return;seen.add(file);
    let source;try{source=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;if(file.startsWith(buildRoot))missing.add(file);return;}
    const imports=source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+\.mjs)['"]/g);
    for(const match of imports)await visit(resolve(dirname(file),match[1]));
  }
  await visit(join(desktopRoot,'src/main.mjs'));
  await visit(join(buildRoot,'server/routes.mjs'));
  try{await stat(join(buildRoot,'ui/index.html'));}catch(error){if(error.code!=='ENOENT')throw error;missing.add(join(buildRoot,'ui/index.html'));}
  return [...missing];
}
export async function guardDesktopStartup({desktopRoot,showMessage,quit,launch}) {
  if((await missingBuildModules(desktopRoot)).length){await showMessage(OLD_BUILD_MESSAGE);quit();return false;}
  await launch();return true;
}
