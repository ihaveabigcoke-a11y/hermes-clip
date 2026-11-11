import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {UiPreferences} from '../src/ui-preferences.mjs';

test('UI preferences persist independently of renderer origin and cannot write worker configuration', () => {
  const store = new Store(':memory:');
  try {
    const prefs = new UiPreferences(store);
    assert.equal(prefs.load({key:'chatSelection'}), null);
    prefs.save({key:'chatSelection', value:{profileId:'profile',requestId:'request'}});
    assert.deepEqual(new UiPreferences(store).load({key:'chatSelection'}), {profileId:'profile',requestId:'request'});
    assert.throws(() => prefs.save({key:'profiles',value:[] }));
    assert.throws(() => prefs.save({key:'chatDrafts',value:{a:'x'.repeat(16001)}}));
    assert.throws(() => prefs.save({key:'productionDrafts',value:{x:{prompt:'incomplete'}}}));
    assert.deepEqual(prefs.load({key:'chatSelection'}), {profileId:'profile',requestId:'request'});
    prefs.save({key:'chatDrafts',value:{main:'Draft main'},patch:true});
    prefs.save({key:'chatDrafts',value:{writer:'Draft writer'},patch:true});
    prefs.save({key:'chatDrafts',value:{main:'Edited main'},patch:true});
    assert.deepEqual(prefs.load({key:'chatDrafts'}), {main:'Edited main',writer:'Draft writer'});
  } finally {store.close();}
});

test('library filters migrate old stored values and scene classification patches preserve unrelated scenes', () => {
  const store = new Store(':memory:');
  try {
    const prefs = new UiPreferences(store);
    store.set('ui_libraryFilters',{productId:'all',type:'all',query:'old search',batch:false});
    assert.deepEqual(prefs.load({key:'libraryFilters'}),{productId:'all',type:'all',query:'old search',batch:false,category:'content',review:'all',period:'all',versions:false});
    prefs.save({key:'mediaOrganization',value:{'project:one':{category:'test',preferredTakeId:null}},patch:true});
    prefs.save({key:'mediaOrganization',value:{'project:two':{category:'content',preferredTakeId:'take'}},patch:true});
    prefs.save({key:'mediaOrganization',value:{'project:one':{category:'content',preferredTakeId:null}},patch:true});
    assert.deepEqual(new UiPreferences(store).load({key:'mediaOrganization'}),{
      'project:one':{category:'content',preferredTakeId:null},'project:two':{category:'content',preferredTakeId:'take'},
    });
    assert.throws(() => prefs.save({key:'mediaOrganization',value:{'../profile':{category:'test',preferredTakeId:null}},patch:true}));
    assert.throws(() => prefs.save({key:'mediaOrganization',value:{'project:one':{category:'approved',preferredTakeId:null}},patch:true}));
  } finally {store.close();}
});
