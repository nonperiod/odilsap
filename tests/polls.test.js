import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePoll,normalizeSubmission,addToAggregate} from '../src/poll-domain.js';
test('Poll definitions reject duplicate, missing and oversized options',()=>{
 assert.throws(()=>normalizePoll({title:'?',type:'single',options:['a','a']}));
 assert.throws(()=>normalizePoll({title:'?',type:'multiple',options:['a']}));
 assert.throws(()=>normalizePoll({title:'?',type:'quiz',options:[]}));
 assert.deepEqual(normalizePoll({title:' Free ',type:'text',options:['ignored']}),{title:'Free',type:'text',options:[]});
});
test('Single/multiple/text answers are validated and counted without exposing answer text',()=>{
 const p=normalizePoll({title:'?',type:'multiple',options:['a','b']});
 const a=normalizeSubmission(p,{choices:[0,1],name:' Student '});
 assert.deepEqual(addToAggregate(p,{responseCount:2,counts:[1,2]},a),{responseCount:3,counts:[2,3]});
 for(const choices of [[],[0,0],[-1],[2],[0.5],['0']])assert.throws(()=>normalizeSubmission(p,{choices}));
 assert.throws(()=>normalizeSubmission({...p,type:'single'},{choices:[0,1]}));
 const text=normalizeSubmission({...p,type:'text',options:[]},{text:' personal ',name:''});
 assert.deepEqual(addToAggregate({...p,options:[]},null,text),{responseCount:1,counts:[]});
 assert.throws(()=>normalizeSubmission({...p,type:'text'},{text:' '}));
});
import {aggregateResponses} from '../src/polls-store.js';
test('Management aggregation counts submissions and selected options, and excludes all private fields',()=>{
 const poll={type:'multiple',options:['A','B','C']};
 const rows=[{userId:'one',name:'Private name',text:'Private text',choices:[0,2]},{userId:'two',name:'Another',choices:[1,2]}];
 const summary=aggregateResponses(poll,rows);
 assert.deepEqual(summary,{responseCount:2,counts:[1,1,2]});
 assert.deepEqual(aggregateResponses({type:'text',options:[]},[{text:'private',choices:[]}]),{responseCount:1,counts:[]});
});
