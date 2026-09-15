/*
  state.test.js — contract tests for state.js
  Run with:  node state.test.js

  No framework and no dependencies, because the game has no build step and
  should stay that way. These cover the failure modes that actually shipped:
  stat keys read in the wrong spelling, retries overwriting a better run,
  and the two superseded rapport currencies folding into `standing` exactly
  once.
*/
const fs=require('fs'), path=require('path');
let store={};
global.window={};
global.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
eval(fs.readFileSync(path.join(__dirname,'state.js'),'utf8'));
const R=global.window.Remorhaz;
let pass=0,fail=0;
const eq=(a,b,m)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:(fail++,console.log('FAIL',m,'got',JSON.stringify(a),'want',JSON.stringify(b)));};

// 1. stat normalization: long-lowercase (as character-select writes)
store.remorhaz=JSON.stringify({selectedCharacter:{id:'irene',name:'Irene "Eye" Ladell',stats:{strength:2,dexterity:0,intelligence:-1,wisdom:-2,charisma:1,constitution:2}}});
eq(R.stat('strength'),2,'long key strength');
eq(R.stat('STR'),2,'short key STR reads same value');
eq(R.stat('wisdom'),-2,'negative stat');
eq(R.statLabel('STR'),'+2','label positive');
eq(R.statLabel('WIS'),'-2','label negative');
eq(R.charId(),'irene','charId from id');

// 2. charId fallback by name (save written before id existed)
store.remorhaz=JSON.stringify({selectedCharacter:{name:'Lucy Lei',stats:{DEX:2}}});
eq(R.charId(),'lucy','charId falls back to name');
eq(R.stat('dexterity'),2,'short-uppercase stored data still reads');

// 3. no character at all
store={};
eq(R.stat('strength'),0,'no character -> 0');
eq(R.charId(),'relyt','no character -> relyt');
eq(R.hasCharacter(),false,'hasCharacter false');

// 4. standing defaults + tiers
store={};
eq(R.standing('haldor'),3,'standing default 3');
eq(R.standingTier('haldor'),'low','3 is low');
R.setStanding('haldor',5); eq(R.standingTier('haldor'),'mid','5 is mid');
R.setStanding('haldor',7); eq(R.standingTier('haldor'),'high','7 is high');
eq(R.adjustStanding('haldor',5),10,'clamps at 10');
eq(R.adjustStanding('haldor',-99),0,'clamps at 0');

// 5. migration from old influence + rapport
store.remorhaz=JSON.stringify({influence:{thorgrim:2,haldor:6,ingrid:2,kalt:2,ursula:2},haldorRapport:1,ursulaRapport:-2,kaltRapport:0});
eq(R.standing('haldor'),8,'influence 6 +1 +rapport 1 = 8');
eq(R.standing('thorgrim'),3,'influence 2 -> neutral 3');
eq(R.standing('ursula'),1,'influence 2 +1 + rapport -2 = 1');
eq(R.load().standingMigratedAt,'v1','migration stamped');
// migration must not re-run and re-fold rapport
R.adjustStanding('ursula',2); eq(R.standing('ursula'),3,'no double migration');

// 6. thorgrim blend: own low, crew high -> pulled up but not to crew level
store={};
R.setStanding('thorgrim',2);
['haldor','ingrid','kalt','ursula'].forEach(n=>R.setStanding(n,10));
const tb=R.thorgrimStanding();
eq(Math.round(tb*100)/100, Math.round((2*0.65+10*0.35)*100)/100,'thorgrim blend math');
eq(R.thorgrimTier(),'mid','blend lifts low self to mid, not high');
// and the reverse: high self, hostile crew
store={}; R.setStanding('thorgrim',10);
['haldor','ingrid','kalt','ursula'].forEach(n=>R.setStanding(n,0));
eq(R.thorgrimTier(),'high','own 10 + crew 0 -> 6.5 rounds to 7 = high');

// 7. recordRun: worse retry must not overwrite
store={};
R.recordRun('navigationScore',24,{ursulaRapport:2,navigatorBonus:true});
eq(R.recordRun('navigationScore',9,{ursulaRapport:-2,navigatorBonus:false}),false,'worse run rejected');
eq(R.load().navigationScore,24,'score preserved');
eq(R.load().navigatorBonus,true,'bonus preserved (fields move together)');
eq(R.recordRun('navigationScore',28,{ursulaRapport:1,navigatorBonus:true}),true,'better run accepted');
eq(R.load().navigationScore,28,'better score written');

// 8. markComplete idempotent
store={};
R.markComplete('haldor',1); R.markComplete('haldor',1);
eq(R.load().completed,['haldor'],'no duplicate npc');
eq(R.load().completedDays,[1],'no duplicate day');

// 9. patch re-reads (no stale clobber)
store={}; R.patch({a:1}); const stale=R.load(); R.patch({b:2});
R.patch({c:3}); eq(R.load().b,2,'patch preserves other keys');

// 10. corrupt save survives
store.remorhaz='{{{not json';
eq(R.stat('strength'),0,'corrupt save -> 0');
eq(R.standing('kalt'),3,'corrupt save -> default standing');

// 11. mood bias mapping
store={}; R.setStanding('kalt',9); eq(R.standingMoodBias('kalt'),2,'standing 9 -> +2 mood');
R.setStanding('kalt',0); eq(R.standingMoodBias('kalt'),-2,'standing 0 -> -2 mood');
R.setStanding('kalt',4); eq(R.standingMoodBias('kalt'),0,'standing 4 -> 0 mood');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
