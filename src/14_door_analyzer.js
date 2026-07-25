// ═══════════════════════════════════════════════════════════════════════════
// FILE: 14_door_analyzer.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// =====================================================================
// STAGE ANALYZER — scans the loaded GCL/HZM and produces a snapshot of
// everything the door wizard needs to make decisions WITHOUT asking the user.
// =====================================================================
// The wizard treats this as authoritative. If the analyzer says "Pattern A
// is in use with sharedProc=unknownProc32", the wizard reuses that proc.
// If it says "no keycard pattern detected yet", the wizard generates a new
// Pattern B per-door proc.

// Output structure (returned by analyzeStageForDoors):
//   {
//     pattern: "A" | "B" | "none",   // detected keycard pattern in this stage
//     sharedKeycardProc: string|null,// proc name if Pattern A; else null
//     sharedCameraProc: string|null, // proc that handles camera angle changes (for trdoor SNAKE traps)
//     existingProcNumbers: Set<int>, // all unknownProcN numbers in use, for collision-free new names
//     availableMaps: string[],       // all map names/hashes discoverable in this stage
//     stagePanCardLevel: int,        // what level Snake has on entering this stage (from eval($w:pan_card = N))
//     existingLamps: string[],       // hashes of lamps already placed (so we don't collide on placement)
//     existingDoorNames: string[],   // existing door names (so we can suggest unique new names)
//     doorTrapZones: Map<doorName, zoneName>,  // existing door→zone bindings (for reference)
//     nextNewDoorIndex: int,         // suggested next "door_N" suffix
//   }

function analyzeStageForDoors(){
var report={
pattern:"none",
sharedKeycardProc:null,
sharedCameraProc:null,
existingProcNumbers:new Set(),
availableMaps:["main"],
stagePanCardLevel:1,
existingLamps:[],
existingDoorNames:[],
doorTrapZones:new Map(),
nextNewDoorIndex:1};
if(typeof gclOrigText!=="string"||!gclOrigText)return report;
var txt=gclOrigText.replace(/\r/g,"");
// === Pattern detection ===
// Walk every proc body and check what it contains.
// Pattern A: a proc body contains "pan_card >= stack:2" AND has door-check telltales
//   (sends 0x1aaa "denied" mesg, or sends "enter" to a chara variable)
// Pattern B: a proc body contains "pan_card >= <int>" AND has the same door telltales
// WITHOUT the telltales, the pan_card reference is likely a progression check, not a
// door (e.g. "if pan_card >= 1 then spawn this enemy"). Misidentifying those as door
// procs leads us to generate keycard logic that references procs that don't actually
// behave like door checks.
function _looksLikeDoorProc(body){
// Telltale signs of a real door check proc:
//   - sends 0x1aaa (the engine's "denied/rattle" message) to something
//   - OR mesgs something with stack:3 stack:2 stack:6 (door open call shape)
return /0x1aaa\b/.test(body)||/mesg\s+\w+\s+stack:3\s+stack:2\s+stack:[56]/.test(body);}
var procBodyRe=/^proc\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
var pbm;
while((pbm=procBodyRe.exec(txt))!==null){
var procName=pbm[1];
var body=pbm[2];
if(/pan_card\s*>=\s*stack:2/.test(body)&&_looksLikeDoorProc(body)){
report.pattern="A";
report.sharedKeycardProc=procName;
break;}}
if(report.pattern==="none"){
procBodyRe.lastIndex=0;
while((pbm=procBodyRe.exec(txt))!==null){
if(/pan_card\s*>=\s*\d+/.test(pbm[2])&&_looksLikeDoorProc(pbm[2])){
report.pattern="B";
break;}}}
// === Camera proc for the SNAKE trap (e.g. unknownProc33 in s02a) ===
// Heuristic: a proc that uses 'camera -set' and is called from a SNAKE trap
// near a door. Pattern: proc whose body has "camera \\" and "-set".
var cameraProcRe=/^proc\s+(\w+)\s*\{[\s\S]*?camera\s*\\\s*[\s\S]*?-set\b[\s\S]*?^\}/gm;
var cMatch=cameraProcRe.exec(txt);
if(cMatch)report.sharedCameraProc=cMatch[1];
// === All existing proc numbers ===
var procNumRe=/\bunknownProc(\d+)\b/g;
var pnm;
while((pnm=procNumRe.exec(txt))!==null){
report.existingProcNumbers.add(parseInt(pnm[1]));}
// === Discoverable maps ===
// Look at every "map -area" declaration. The grammar is:
//   map \
//       -area  <map1> [<map2>] [<map3>] ...
// Each map identifier is either "main" or a 0xNNNN hex hash. Anything else is
// noise (regex matching too greedily into the next line).
var mapSet=new Set(["main"]);
var mapAreaRe=/^\s*-area\s+([^\n]+)/gm;
var mam;
while((mam=mapAreaRe.exec(txt))!==null){
var parts=mam[1].split(/\s+/);
for(var pi=0;pi<parts.length;pi++){
var part=parts[pi].trim();
if(part==="main"||/^0x[0-9a-fA-F]{1,8}$/.test(part)){
mapSet.add(part);}}}
// Also scan existing -g flags on doors for map references
var doorGRe=/-g\s+\d+\s+(\S+)\s+(\S+)/g;
var dgm;
while((dgm=doorGRe.exec(txt))!==null){
if(dgm[1]==="main"||/^0x[0-9a-fA-F]{1,8}$/.test(dgm[1]))mapSet.add(dgm[1]);
if(dgm[2]==="main"||/^0x[0-9a-fA-F]{1,8}$/.test(dgm[2]))mapSet.add(dgm[2]);}
report.availableMaps=Array.from(mapSet).sort();
// === Stage's pan_card level ===
// Look for the first "eval($w:pan_card = N)" assignment. Picks the integer.
var pcm=/eval\(\$w:pan_card\s*=\s*(\d+)\)/.exec(txt);
if(pcm)report.stagePanCardLevel=parseInt(pcm[1]);
// === Existing lamp hashes ===
// Anything declared as "chara LAMP <name>" — capture the name.
var lampRe=/chara\s+LAMP\s+(\S+)/g;
var lm;
while((lm=lampRe.exec(txt))!==null){report.existingLamps.push(lm[1]);}
// === Existing doors and their associated trap zones ===
var doorRe=/chara\s+DOOR\s+(\S+)/g;
var dm;
while((dm=doorRe.exec(txt))!==null){
report.existingDoorNames.push(dm[1]);
// If the door name follows the pattern "door<N>", track the highest N+1
var doorIdxMatch=/^door(\d+)$/.exec(dm[1]);
if(doorIdxMatch){
var idx=parseInt(doorIdxMatch[1]);
if(idx>=report.nextNewDoorIndex)report.nextNewDoorIndex=idx+1;}}
// Match existing trap zones to doors. Pattern: "call(<procname>, <doorname>, <level>, ..."
// We look for ntrap blocks that reference both a doorname and a known proc.
var trapCallRe=/ntrap\s+(\w+)[\s\S]*?call\(\w+,\s*(\w+)/g;
var tm;
while((tm=trapCallRe.exec(txt))!==null){
report.doorTrapZones.set(tm[2],tm[1]);}
return report;}

// Get a fresh unknownProcN number that isn't in use. Multiple calls return
// distinct numbers because we accumulate them in a transient set.
var _doorWizardProcReservations=new Set();
function reserveNextProcNumber(){
var report=analyzeStageForDoors();
var n=1;
while(report.existingProcNumbers.has(n)||_doorWizardProcReservations.has(n))n++;
_doorWizardProcReservations.add(n);
return n;}
function clearDoorWizardReservations(){_doorWizardProcReservations.clear();}

// Generate a unique lamp hash (4-digit hex) not used elsewhere in the GCL.
// MGS1 vanilla uses hashes like 0x351f. We pick something in the same range
// but verify it's free.
var _doorWizardLampReservations=new Set();
function reserveNextLampHash(){
var report=analyzeStageForDoors();
var used=new Set(report.existingLamps.map(function(x){return x.toLowerCase();}));
// Try a few candidates in a "safe" hash range, picking the first that's free
var candidates=[];
for(var base=0x3700;base<=0x4000;base+=3){
candidates.push("0x"+base.toString(16).padStart(4,"0"));}
for(var i=0;i<candidates.length;i++){
if(!used.has(candidates[i])&&!_doorWizardLampReservations.has(candidates[i])){
_doorWizardLampReservations.add(candidates[i]);
return candidates[i];}}
return"0x9999";}// fallback shouldn't happen

// Suggest a unique door name. Prefers "door1", "door2", etc.
function suggestDoorName(){
var report=analyzeStageForDoors();
var n=report.nextNewDoorIndex;
var existing=new Set(report.existingDoorNames);
while(existing.has("door"+n))n++;
return"door"+n;}

// ==================== ELEVATOR DETECTION + INTROSPECTION ====================
//
// Vanilla MGS stages can contain `chara ELEVATOR_PANEL` entries that drive the
// floor-selection elevator UI. This is a totally separate mechanism from the
// regular door system. To let the user EDIT (rather than CREATE) an existing
// elevator, we detect them here and walk the proc chain to figure out what
// each floor button currently does.
//
// Flow we trace for each elevator:
//   chara ELEVATOR_PANEL <name>  ...  -n <count>  -e <floorProc0> <floorProc1> ... -r <doorName> ...
//   For each floor proc:
//     - if empty body         → "stay here" (no stage load)
//     - if calls another proc → walk into it; if THAT proc has a `load "..."`,
//       we extract target stage + snake_pos coords
//
// Returns an array of detected elevators. Empty if none.
function analyzeElevatorsInStage(){
var gclText=(typeof gclOrigText==="string")?gclOrigText:"";
var elevators=[];
if(!gclText)return elevators;

// Find all ELEVATOR_PANEL entities. Match through the next chara/proc/trap/map/hzd boundary.
var panelRe=/chara\s+ELEVATOR_PANEL\s+(\S+)([\s\S]*?)(?=\n\s*(?:chara|proc|trap|ntrap|map\s|hzd\s|call\(|if\s|else|\#)|$)/g;
var pm;
while((pm=panelRe.exec(gclText))!==null){
var name=pm[1];
// Collapse line-continuations: "<backslash>\r\n   " becomes a single space.
// Without this, flag-extraction regexes fail because the body contains stray
// backslashes that are neither word nor space characters.
var body=pm[2].replace(/\\\s*\r?\n\s*/g," ");
// Extract key flags
var nMatch=body.match(/-n\s+(\d+)/);
var eMatch=body.match(/-e\s+((?:\w+\s+)+?)(?=-[a-z]\s|$)/);
var rMatch=body.match(/-r\s+(\S+)/);
var pMatch=body.match(/-p\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
if(!nMatch||!eMatch)continue;
var floorCount=parseInt(nMatch[1]);
var procNames=eMatch[1].trim().split(/\s+/).slice(0,floorCount);
var doorName=rMatch?rMatch[1]:null;
var panelPos=pMatch?{x:parseInt(pMatch[1]),y:parseInt(pMatch[2]),z:parseInt(pMatch[3])}:null;
// Walk each floor proc
var floors=[];
for(var fi=0;fi<procNames.length;fi++){
floors.push(_traceFloorProc(gclText,procNames[fi]));}
elevators.push({
name:name,
floorCount:floorCount,
floorProcNames:procNames,
floors:floors,
doorName:doorName,
panelPos:panelPos});}
// Dedupe by name: vanilla s02a declares the panel twice inside an if/else block.
// Keep the first occurrence per unique name.
var seen={},deduped=[];
for(var di=0;di<elevators.length;di++){
if(!seen[elevators[di].name]){seen[elevators[di].name]=true;deduped.push(elevators[di]);}}
return deduped;}

// For a given floor proc name, return what it does:
//   {procName, kind:"stay"}                                 — empty proc
//   {procName, kind:"load", loadProcName, targetStage, spawnX, spawnY, spawnZ}
//   {procName, kind:"other", calls:[...]}                   — has calls but no load
//   null if proc not found
function _traceFloorProc(gclText,procName){
var procRe=new RegExp("proc\\s+"+procName+"\\s*\\{([\\s\\S]*?)\\n\\s*\\}","m");
var m=gclText.match(procRe);
if(!m)return{procName:procName,kind:"missing"};
var body=m[1];
// If proc is empty (just whitespace), it's a "stay here" floor
if(!/\S/.test(body))return{procName:procName,kind:"stay"};
// Find call() targets in this proc
var callRe=/call\((\w+)/g;
var calls=[],cm;
while((cm=callRe.exec(body))!==null)calls.push(cm[1]);
// For each call target, check if THAT proc has a load statement
for(var ci=0;ci<calls.length;ci++){
var calledName=calls[ci];
var trace=_extractLoadInfo(gclText,calledName);
if(trace){
return{procName:procName,kind:"load",loadProcName:calledName,
targetStage:trace.targetStage,
spawnX:trace.spawnX,spawnY:trace.spawnY,spawnZ:trace.spawnZ};}}
// No load found
return{procName:procName,kind:"other",calls:calls};}

// Given a proc name, extract load info if it contains a `load "sXXa"` statement.
// Handles MGS's coordinate format including negation: snake_pos_z = -(10000)
function _extractLoadInfo(gclText,procName){
var procRe=new RegExp("proc\\s+"+procName+"\\s*\\{([\\s\\S]*?)\\n\\s*\\}","m");
var m=gclText.match(procRe);
if(!m)return null;
var body=m[1];
var loadM=body.match(/load\s+"([^"]+)"/);
if(!loadM)return null;
var parseCoord=function(s){
if(!s)return 0;
// "-(NNNN)" means negative NNNN
var negM=s.match(/-\(\s*(\d+)\s*\)/);
if(negM)return-parseInt(negM[1]);
return parseInt(s);};
var xM=body.match(/snake_pos_x\s*=\s*(-?\(?\s*-?\d+\s*\)?)/);
var yM=body.match(/snake_pos_y\s*=\s*(-?\(?\s*-?\d+\s*\)?)/);
var zM=body.match(/snake_pos_z\s*=\s*(-?\(?\s*-?\d+\s*\)?)/);
return{
targetStage:loadM[1],
spawnX:xM?parseCoord(xM[1]):0,
spawnY:yM?parseCoord(yM[1]):0,
spawnZ:zM?parseCoord(zM[1]):0};}

// ==================== STAGE-TRANSITION DOOR DETECTION ====================
//
// A door is a stage-transition door if an ntrap exists in the GCL whose -exec
// block ends up calling a proc that contains `load "sXXa"`. Vanilla pattern:
//
//   ntrap <zoneName> SNAKE -mask enter -c -exec {
//     ...
//     mesg SNAKE run_move <runMoveTarget> 1000,16,-1
//     chara FADE_IN_OUT ...
//     delay -time 32 -exec { call(<loadProcName>) }
//   }
//
// where <loadProcName> contains `load "sXXa" -map main -s 2`.
//
// We detect this by:
//   1. For each chara DOOR <name>, look for an ntrap whose name contains <name>
//      (e.g. tr_<name>_x). If not found by name, fall through to the looser
//      check: any ntrap whose exec block contains a call() to a proc that has
//      a `load` statement.
//   2. Walk that proc and extract target stage + spawn coords.
//
// Returns {isTransition:bool, targetStage, spawnX, spawnY, spawnZ, loadProcName,
//          crossZoneName, runMoveTarget:{x,y,z}, fadeSpeed} or null.
function analyzeStageTransitionForDoor(doorName){
var gclText=(typeof gclOrigText==="string")?gclOrigText:"";
if(!gclText||!doorName)return null;
// Walk every ntrap statement. Use brace-counting (not regex) for the body
// because stage-transition execs have multi-level nesting (if/else/delay/exec)
// that simple regex can't capture.
var candidates=[];
var headerRe=/ntrap\s+(\S+)\s+(\S+)/g;
var hm;
while((hm=headerRe.exec(gclText))!==null){
var zoneName=hm[1];
var actor=hm[2];
// Find the opening brace of the exec body. The "-exec {" may be many tokens
// after the header — flags like -mask, -i, -c, etc. Scan forward.
var braceIdx=gclText.indexOf("{",hm.index+hm[0].length);
if(braceIdx<0)continue;
// Verify the brace belongs to THIS ntrap, not a subsequent statement: bail
// out if we encounter "ntrap " or "trap " or a top-level non-flag token
// before the brace. Cheap check: bail if a newline-then-"chara"/"proc"/"map"
// appears first.
var preBrace=gclText.substring(hm.index+hm[0].length,braceIdx);
if(/\n\s*(?:chara|proc|map\s|hzd|ntrap|trap)\b/.test(preBrace))continue;
// Brace-count to find the matching closing brace
var depth=1,p=braceIdx+1;
while(p<gclText.length&&depth>0){
var c=gclText.charCodeAt(p);
if(c===123)depth++;// '{'
else if(c===125)depth--;// '}'
p++;}
if(depth!==0)continue;// unclosed brace, give up
var body=gclText.substring(braceIdx,p);// includes both braces
// Look for call(<proc>) anywhere in the body
var callMatches=[...body.matchAll(/call\((\w+)/g)];
for(var ci=0;ci<callMatches.length;ci++){
var calledProc=callMatches[ci][1];
var loadInfo=_extractLoadInfo(gclText,calledProc);
if(loadInfo){
var rmMatch=body.match(/run_move\s+(-?\d+),(-?\d+),(-?\d+)/);
var fadeMatch=body.match(/FADE_IN_OUT[\s\S]*?-speed\s+(\d+)/);
candidates.push({
zoneName:zoneName,
loadProcName:calledProc,
targetStage:loadInfo.targetStage,
spawnX:loadInfo.spawnX,spawnY:loadInfo.spawnY,spawnZ:loadInfo.spawnZ,
runMoveTarget:rmMatch?{x:+rmMatch[1],y:+rmMatch[2],z:+rmMatch[3]}:null,
fadeSpeed:fadeMatch?+fadeMatch[1]:30,
ntrapBodyStart:hm.index,
mentionsDoor:body.indexOf(doorName)>=0||zoneName.indexOf(doorName)>=0});
break;}}}
if(candidates.length===0)return null;
var best=candidates.find(function(c){return c.mentionsDoor;})||candidates[0];
return{
isTransition:true,
crossZoneName:best.zoneName,
loadProcName:best.loadProcName,
targetStage:best.targetStage,
spawnX:best.spawnX,spawnY:best.spawnY,spawnZ:best.spawnZ,
runMoveTarget:best.runMoveTarget,
fadeSpeed:best.fadeSpeed};}

// Replace the load proc body in place. Used by the properties-panel edit
// flow to update target stage / spawn coords without re-running the door wizard.
// Returns the modified gclText.
function updateStageTransitionLoadProc(gclText,loadProcName,newTargetStage,newSpawnX,newSpawnY,newSpawnZ){
// Find proc start with brace-count to handle nested if/else inside the body
var headerRe=new RegExp("(^|\\n)proc\\s+"+loadProcName+"\\s*\\{","");
var hm=gclText.match(headerRe);
if(!hm)return gclText;// proc not found
var startOfProc=hm.index+(hm[1]?1:0);
var openBrace=gclText.indexOf("{",hm.index);
var depth=1,p=openBrace+1;
while(p<gclText.length&&depth>0){
var c=gclText.charCodeAt(p);
if(c===123)depth++;else if(c===125)depth--;
p++;}
if(depth!==0)return gclText;// unclosed, bail rather than corrupt
var oldBody=gclText.substring(startOfProc,p);
// Preserve any leading `call(unknownProcN)` line (vanilla counter increment)
var preserveCall=oldBody.match(/(call\(\w+\))/);
var fmt=function(v){return v<0?"-("+(-v)+")":String(v);};
var newLines=["proc "+loadProcName+" {"];
if(preserveCall)newLines.push("    "+preserveCall[1]);
newLines.push("    eval($f:000001 = false)");
newLines.push("    eval($w:snake_pos_x = "+fmt(newSpawnX)+")");
newLines.push("    eval($w:snake_pos_y = "+fmt(newSpawnY)+")");
newLines.push("    eval($w:snake_pos_z = "+fmt(newSpawnZ)+")");
newLines.push("    eval($w:000002 = 0)");
newLines.push("    eval($w:000004 = 0)");
newLines.push("    load \""+newTargetStage+"\" \\");
newLines.push("        -map   main \\");
newLines.push("        -s     2");
newLines.push("}");
return gclText.substring(0,startOfProc)+newLines.join("\n")+gclText.substring(p);}

// ============================================================
