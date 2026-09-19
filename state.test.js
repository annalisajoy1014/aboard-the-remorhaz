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
// and the reverse: his own regard cannot outrun his crew's by more than a little
store={}; R.setStanding('thorgrim',10);
['haldor','ingrid','kalt','ursula'].forEach(n=>R.setStanding(n,0));
eq(R.thorgrimTier(),'low','a hostile crew caps him at their opinion + 2, not his own 10');

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

// 12. recordWork: re-scores a day, never accumulates
store={};
eq(R.recordWork('haldor',1,1),4,'strong work +1');
eq(R.recordWork('haldor',1,1),4,'replaying the same day does not stack');
eq(R.recordWork('haldor',1,1),4,'...still does not stack on a third run');
eq(R.recordWork('haldor',1,-1),4,'a worse retry cannot spend regard already earned');
eq(R.recordWork('haldor',1,0),4,'nor can a merely adequate one');
eq(R.recordWork('haldor',4,1),5,'a DIFFERENT day credits separately');
// dialogue deltas are independent of the work ledger
R.adjustStanding('haldor',1); eq(R.standing('haldor'),6,'dialogue stacks on work');
eq(R.recordWork('haldor',4,-1),6,'a worse day-4 retry leaves the earlier credit standing');
// a poor FIRST attempt still costs, and improving on it recovers the ground
store={};
eq(R.recordWork('kalt',2,-1),2,'a poor first attempt costs a point');
eq(R.recordWork('kalt',2,1),4,'improving on it recovers and then some');
eq(R.recordWork('kalt',2,-1),4,'and cannot be given back');
// clamping
store={}; R.setStanding('kalt',10); eq(R.recordWork('kalt',2,1),10,'clamps at max');
store={}; R.setStanding('kalt',0);  eq(R.recordWork('kalt',2,-1),0,'clamps at min');
// out-of-range deltas are clamped to -1..+1
store={}; eq(R.recordWork('ursula',3,5),4,'delta clamped to +1');

// 13. hasSpokenTo / markSpokenTo: one exchange per person per day
store={};
eq(R.hasSpokenTo('kalt',2),false,'not spoken yet');
R.markSpokenTo('kalt',2);
eq(R.hasSpokenTo('kalt',2),true,'spoken today');
eq(R.hasSpokenTo('kalt',3),false,'tomorrow is a fresh conversation');
eq(R.hasSpokenTo('ursula',2),false,'a different person is separate');
// the ledger survives other writes
R.adjustStanding('kalt',1); R.recordWork('kalt',2,1);
eq(R.hasSpokenTo('kalt',2),true,'ledger survives sibling writes');

// 14. the farming exploit this closes, end to end
store={};
const speak=(npc,day,delta)=>{ if(R.hasSpokenTo(npc,day)) return; R.adjustStanding(npc,delta); R.markSpokenTo(npc,day); };
for(let i=0;i<20;i++) speak('haldor',1,1);
eq(R.standing('haldor'),4,'twenty reopens of the same day award exactly one point');
for(let d=2;d<=5;d++) speak('haldor',d,1);
eq(R.standing('haldor'),8,'four further days award four points');

// 15. hub and scene are separate conversations on the same day
store={};
R.markSpokenTo('haldor',4);                      // met him on deck (hub, the default scope)
eq(R.hasSpokenTo('haldor',4),true,'hub exchange spent');
eq(R.hasSpokenTo('haldor',4,'scene'),false,'the drill-floor conversation is still available');
R.markSpokenTo('haldor',4,'scene');
eq(R.hasSpokenTo('haldor',4,'scene'),true,'scene exchange now spent');
eq(R.hasSpokenTo('haldor',4,'hub'),true,'hub exchange unaffected');
// the regression this guards: one shared slot let the hub swallow the scene's delta
store={};
R.markSpokenTo('ursula',3);
eq(R.hasSpokenTo('ursula',3,'scene'),false,'navigation can still credit its own dialogue');

/* ===== nextStep(): the voyage must always have a next step ===== */
const setState = o => { store.remorhaz = JSON.stringify(o); };

// Walk the voyage doing exactly what nextStep() says, as a player would.
function walk(seed, maxSteps = 120) {
  let s = Object.assign({ currentDay: 1, completed: [], completedDays: [] }, seed);
  setState(s);
  const trail = [];
  for (let i = 0; i < maxSteps; i++) {
    const n = R.nextStep();
    if (!n.label) return { ok: false, why: `day ${n.day} had no label`, trail };
    trail.push(`${n.day}:${n.action}`);
    if (n.action === 'voyage-over') return { ok: true, trail };
    if (n.action === 'sail-on') {
      s = R.load();
      s.completedDays = [...new Set([...(s.completedDays || []), n.day])];
      s.currentDay = n.day + 1;
      setState(s); continue;
    }
    if (!n.primary) return { ok: false, why: `day ${n.day} has no primary and cannot sail on`, trail };
    s = R.load();
    if (n.action === 'brief') s.captainSpokenDay = n.day;
    else {
      s.completed = [...new Set([...(s.completed || []), n.primary])];
      if (n.action === 'landfall') {
        s.completedDays = [...new Set([...(s.completedDays || []), 9])];
        s.currentDay = 10;
      }
    }
    setState(s);
  }
  return { ok: false, why: `did not finish in ${maxSteps} steps`, trail };
}

// 12. a clean voyage reaches landfall
eq(walk({}).ok, true, 'clean voyage completes');
eq(walk({ d5KaltRequired: true }).ok, true, 'ice-damage voyage completes');

// 13. the captain briefs before the crew works, every day
store = {}; setState({ currentDay: 3, completed: [], completedDays: [] });
eq(R.nextStep().action, 'brief', 'day 3 opens with the captain');
eq(R.nextStep().primary, 'thorgrim', 'captain is the primary before briefing');
setState({ currentDay: 3, completed: [], completedDays: [], captainSpokenDay: 3 });
eq(R.nextStep().action, 'work', 'after briefing, the day is work');
eq(R.nextStep().primary, 'ursula', 'day 3 work is Ursula');

// 14. exactly one primary at a time on a multi-NPC day
setState({ currentDay: 1, completed: [], completedDays: [], captainSpokenDay: 1 });
let n1 = R.nextStep();
eq(n1.primary, 'haldor', 'day 1 starts with Haldor, not both');
eq(n1.zones.length, 2, 'both day-1 crew are still outstanding');
setState({ currentDay: 1, completed: ['haldor'], completedDays: [], captainSpokenDay: 1 });
eq(R.nextStep().primary, 'ingrid', 'day 1 moves to Ingrid after Haldor');

// 15. REGRESSION: a mid storm score must not strand the voyage on Day 8.
//     Scores 4-8 set neither skipToSyrinlya nor repairDayRequired, which left
//     Day 8 with no required crew and no advance path. The player could not
//     finish the voyage at all. nextStep() must offer a way onward.
const day8 = (flags, completed) => {
  setState(Object.assign({
    currentDay: 8, captainSpokenDay: 8,
    completed: completed || ['haldor', 'ingrid', 'kalt', 'ursula'],
    completedDays: [1, 2, 3, 4, 5, 6, 7]
  }, flags));
  return R.nextStep();
};
eq(day8({}).action, 'sail-on', 'mid storm: Day 8 sails on rather than stranding');
eq(day8({ skipToSyrinlya: true }).action, 'sail-on', 'high storm: Day 8 sails on');
eq(day8({ repairDayRequired: true }, ['haldor', 'ingrid', 'ursula']).primary, 'kalt',
   'poor storm: Day 8 sends you to Kalt');
eq(day8({ repairDayRequired: true, refishRequired: true, recookRequired: true },
        ['ursula']).zones, ['kalt', 'haldor', 'ingrid'],
   'poor storm with lost stores: all three are outstanding');

// 16. every day of every branch yields a usable instruction
[{}, { d5KaltRequired: true }, { skipToSyrinlya: true },
 { repairDayRequired: true }, { repairDayRequired: true, refishRequired: true }
].forEach((flags, fi) => {
  for (let d = 1; d <= 9; d++) {
    setState(Object.assign({ currentDay: d, completed: [], completedDays: [] }, flags));
    const n = R.nextStep();
    eq(!!n.label && n.label.length > 10, true, `branch ${fi} day ${d} has a real label`);
    eq(n.primary !== null || n.action === 'sail-on', true,
       `branch ${fi} day ${d} has somewhere to go`);
  }
});


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
