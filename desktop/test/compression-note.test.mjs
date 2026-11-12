import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {importModule} from './helpers/local-server.mjs';
const {CompressionNote}=await importModule('components/lab/compression-note.tsx');
test('compression label shows actual before/after and long quality exception; legacy take has no invented note',()=>{
  const note=compression=>renderToStaticMarkup(React.createElement(CompressionNote,{take:{compression}}));
  assert.equal(note(undefined),'');
  assert.match(note({sourceSize:19293798,size:5138022,mode:'encoded',overLimit:false}),/Đã nén: 18,4 MB → 4,9 MB/);
  assert.match(note({sourceSize:20000000,size:15709085,mode:'encoded',overLimit:true}),/Vượt 6 MB để giữ chất lượng \(15,0 MB\)/);
  assert.match(note({sourceSize:44,size:44,mode:'original',overLimit:false}),/Giữ bản nhỏ nhất/);
});
