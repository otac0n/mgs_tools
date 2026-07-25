// ═══════════════════════════════════════════════════════════════════════════
// FILE: 15_door_wizard.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// =====================================================================
// DOOR WIZARD — comprehensive door-creation flow with auto-detection
// =====================================================================
// Three categories: Standard, Stage-Transition, Elevator.
// Pulls all stage context from analyzeStageForDoors() so the user never
// has to type proc names, level numbers, or hash IDs — just clicks
// through plain-English choices.

var doorWizState={
open:false,
step:1,
category:null,// "standard" | "stage-transition" | "elevator"
// === STANDARD DOOR fields ===
name:null,
pos:{x:0,y:0,z:0},
dirY:0,// rotation around Y axis. 0,1024,2048,3072
model:null,
animType:"sliding",// "sliding" or "elevator-style"
width:1500,
speed:100,
holdOpen:true,
linkType:"two-rooms",// "two-rooms" or "single-room"
mapA:"main",
mapB:"main",
mapBCustom:"",
keycardLevel:0,// 0 = no keycard, 1-7 = required
placeLamp:true,
lampSide:"right",// "left" or "right" of the door
soundProfile:"sliding",// "sliding","elevator","big-door","custom"
soundS1:91,soundS2:88,
// === STAGE-TRANSITION DOOR fields ===
autoOpen:true,
targetStage:"s01a",
spawnX:0,spawnY:0,spawnZ:0,
fadeSpeed:30,
// === ELEVATOR fields ===
// elevatorMode = "panel-only" (just a floor-select kiosk, works anywhere) or
//                "full" (vanilla s02a-style: door + ELEVATOR phantom map + panel)
// panel-only is the simpler, more portable choice. full mode requires the
// stage to have an elevator-interior KMD + matching HZM area.
elevatorMode:"panel-only",
// floorCount = total number of selectable floors (2-4 vanilla supports up to 4).
// floors[] = per-floor config: each entry has {targetStage, spawnX, spawnY, spawnZ}.
// Floor 0 is "current stage" (the floor you're already on — selecting it just closes
// the menu, no stage load). Floors 1+ load a different stage.
floorCount:3,
floors:[
{targetStage:"(stay on this floor)",spawnX:0,spawnY:0,spawnZ:0},
{targetStage:"s03a",spawnX:1500,spawnY:1104,spawnZ:-10000},
{targetStage:"s04a",spawnX:0,spawnY:1104,spawnZ:-9531},
{targetStage:"s05a",spawnX:0,spawnY:0,spawnZ:0}
]};

function openDoorWizard(){
if(!gclOrigText){alert("Load a stage's GCL first.");return;}
clearDoorWizardReservations();// fresh allocation pool per session
doorWizState.open=true;
doorWizState.step=1;
doorWizState.category=null;
// Default position from current click target if available
if(typeof cTgt!=="undefined"&&cTgt){
doorWizState.pos={x:Math.round(cTgt.x/S),y:0,z:Math.round(cTgt.z/S)};}
doorWizState.name=suggestDoorName();
// Pick a sensible default model from imported KMDs
if(typeof mdlSubModels!=="undefined"){
var keys=Object.keys(mdlSubModels);
for(var k=0;k<keys.length;k++){
if(/_d\d/.test(keys[k])){doorWizState.model=keys[k].replace(".kmd","");break;}}
if(!doorWizState.model&&keys.length>0)doorWizState.model=keys[0].replace(".kmd","");}
renderDoorWizard();}

function closeDoorWizard(){
var m=document.getElementById("doorWizModal");
if(m)m.remove();
doorWizState.open=false;
clearDoorWizardReservations();}

function renderDoorWizard(){
var existing=document.getElementById("doorWizModal");
if(existing)existing.remove();
var m=document.createElement("div");
m.id="doorWizModal";
m.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
var box=document.createElement("div");
box.style.cssText="background:#0d1219;border:1px solid #2a3545;border-radius:6px;padding:0;max-width:760px;max-height:92vh;width:100%;overflow:hidden;color:#aabbcc;font-family:monospace;font-size:11px;display:flex;flex-direction:column";
// Header
var header=document.createElement("div");
header.style.cssText="padding:10px 16px;background:#1a2535;display:flex;align-items:center;gap:10px;flex-shrink:0";
header.innerHTML='<b style="color:#ff8844;font-size:14px">Door Wizard</b>'+
'<span style="color:#88aacc;font-size:10px">Step '+doorWizState.step+' of '+(doorWizState.category==="elevator"?"3":"3")+'</span>'+
'<span style="flex:1"></span>'+
'<button onclick="closeDoorWizard()" class="btn danger">Close</button>';
var content=document.createElement("div");
content.id="doorWizContent";
content.style.cssText="flex:1;overflow-y:auto;padding:14px 16px";
if(doorWizState.step===1)content.innerHTML=renderDoorWizStep1();
else if(doorWizState.step===2)content.innerHTML=renderDoorWizStep2();
else if(doorWizState.step===3)content.innerHTML=renderDoorWizStep3();
box.appendChild(header);
box.appendChild(content);
m.appendChild(box);
document.body.appendChild(m);}

// ============== STEP 1: Pick door category ==============
function renderDoorWizStep1(){
var report=analyzeStageForDoors();
var html='<div style="margin-bottom:12px;color:#88ddff">';
html+='<b>What kind of door do you want to create?</b><br>';
html+='<span style="font-size:10px;color:#778">All three categories handle different gameplay needs.</span></div>';
// Stage context info
html+='<div style="margin-bottom:14px;padding:8px;background:#0a1521;border-left:3px solid #44aaff;font-size:10px;color:#aabbcc">';
html+='<b style="color:#88ccff">Current stage info (auto-detected):</b><br>';
html+='• Stage gives Snake keycard level <b style="color:#ffcc88">'+report.stagePanCardLevel+'</b> on entry<br>';
html+='• <b style="color:#ffcc88">'+report.existingDoorNames.length+'</b> existing doors, <b style="color:#ffcc88">'+report.existingLamps.length+'</b> existing lamps<br>';
html+='• Keycard pattern in use: <b style="color:#ffcc88">'+
(report.pattern==="A"?'Pattern A — shared check proc ('+report.sharedKeycardProc+'). New keycard doors will reuse this.'
:report.pattern==="B"?'Pattern B — per-door check procs. New keycard doors will get their own proc.'
:'None yet. New keycard doors will create a fresh proc using vanilla pattern.')+'</b><br>';
html+='• Available maps in this stage: <b style="color:#ffcc88">'+report.availableMaps.join(", ")+'</b>';
html+='</div>';
// Category cards
html+='<div style="display:flex;flex-direction:column;gap:8px">';
html+=renderDoorCategoryCard("standard","Standard Room Door","#44aaff",
"The most common type. A door between two rooms, with optional keycard requirement and panel lamp.",
["Slides sideways or up","Optional keycard level 1-7 — opens with that level or higher","Optional panel lamp shows green/red state","Optional room-visibility wiring (auto loads adjacent room when you walk through)"]);
html+=renderDoorCategoryCard("stage-transition","Stage Transition Door","#aa44ff",
"A door that transports you to a different stage entirely (e.g. snowfield → caves). Used at major boundaries.",
["Always auto-opens when player approaches","Triggers fade-to-black + load new stage","No keycard system — story-gated only","Sets where Snake spawns in the next stage"]);
html+=renderDoorCategoryCard("elevator","Elevator (multi-floor → stages)","#ffaa44",
"A floor-selection elevator. Walk in, press the button on the panel, pick a floor from a menu, and the game loads the target stage for that floor. Based on the iconic s02a Tank Hangar elevator.",
["2-4 selectable floors, each loads a different stage","Auto-generates: ELEVATOR_PANEL + DOOR + LAMP + per-floor procs + zones","Optional keycard required to call the elevator","Per-floor Snake spawn positions in target stages"]);
// 4th option: edit an EXISTING elevator (only meaningful if one is detected).
// Practical use case: hijack s02a's already-working elevator and point its
// floor buttons at different stages. Way simpler than generating a new one.
var existingElevators=(typeof analyzeElevatorsInStage==="function")?analyzeElevatorsInStage():[];
if(existingElevators.length>0){
var summaries=existingElevators.map(function(e){
var dests=e.floors.filter(function(f){return f.kind==="load";}).map(function(f){return f.targetStage;});
return e.name+" ("+e.floorCount+" floors → "+(dests.length>0?dests.join(", "):"all stay-here")+")";}).join("; ");
html+=renderDoorCategoryCard("edit-elevator","Edit Existing Elevator","#88ddaa",
"This stage already has an elevator. Change which stages its floor buttons load, or update the Snake-spawn coordinates for each destination. Reuses ALL the existing vanilla scaffolding — no new entities, just modified load procs.",
["Found: "+summaries,"Doesn't add new entities — modifies existing load procs in place","Optionally add a new floor (up to 4 max)","Most reliable way to get a working elevator in your build"]);
}else{
html+='<div style="padding:8px;background:#1a2030;border:1px solid #333;border-radius:4px;opacity:0.5;cursor:not-allowed">';
html+='<b style="color:#888;font-size:12px">Edit Existing Elevator</b><br>';
html+='<span style="color:#778;font-size:10px">No <code>chara ELEVATOR_PANEL</code> detected in this stage. Load a stage with a vanilla elevator (e.g. s02a Tank Hangar) to enable this option.</span>';
html+='</div>';}
html+='</div>';
return html;}

function renderDoorCategoryCard(cat,title,color,desc,bullets){
var disabled=false;// all categories now implemented
var clickHandler=disabled?"":'onclick="pickDoorCategory(\''+cat+'\')"';
var cursor=disabled?"not-allowed":"pointer";
var opacity=disabled?"0.4":"1";
var h='<div '+clickHandler+' style="padding:10px;background:#1a2030;border:1px solid '+color+';border-radius:4px;cursor:'+cursor+';opacity:'+opacity+'">';
h+='<b style="color:'+color+';font-size:12px">'+title+'</b><br>';
h+='<span style="color:#aabbcc;font-size:10px">'+desc+'</span>';
h+='<ul style="margin:4px 0 0 16px;padding:0;color:#778;font-size:9px">';
for(var i=0;i<bullets.length;i++)h+='<li>'+bullets[i]+'</li>';
h+='</ul></div>';
return h;}

function pickDoorCategory(cat){
doorWizState.category=cat;
doorWizState.step=2;
// Set sensible defaults per category
if(cat==="stage-transition"){
doorWizState.animType="elevator-style";
doorWizState.width=2000;
doorWizState.speed=70;
doorWizState.soundProfile="big-door";
doorWizState.soundS1=93;doorWizState.soundS2=90;
doorWizState.keycardLevel=0;}
else if(cat==="elevator"){
// Match s02a evtdoor: -t 2 -w 1000 -h 500 -e 98 97 (hydraulic elevator sound)
doorWizState.animType="elevator-style";
doorWizState.width=1000;
doorWizState.speed=100;
doorWizState.soundProfile="elevator";
doorWizState.soundS1=98;doorWizState.soundS2=97;
// Vanilla elevators don't use the keycard system — always 0 in elevator mode.
doorWizState.keycardLevel=0;
// Default to panel-only mode (simpler, more portable than full elevator)
if(!doorWizState.elevatorMode)doorWizState.elevatorMode="panel-only";
// Suggest a default name pattern
if(!doorWizState.name||/^door\d+$/.test(doorWizState.name))doorWizState.name="floorpanel";}
else if(cat==="edit-elevator"){
// Detect existing elevators and load their floor data into editable state
var elevs=analyzeElevatorsInStage();
if(elevs.length===0){alert("No ELEVATOR_PANEL found in current stage.");return;}
// Auto-select the first one (most stages have only one elevator)
doorWizState.editElevator={
selectedIdx:0,
elevators:elevs,
// Working copy of the floors that the user will edit
editedFloors:elevs[0].floors.map(function(f){
return{
kind:f.kind,
procName:f.procName,
loadProcName:f.loadProcName||null,
targetStage:f.targetStage||"(stay)",
spawnX:f.spawnX||0,
spawnY:f.spawnY||0,
spawnZ:f.spawnZ||0};}),
editedFloorCount:elevs[0].floorCount};}
renderDoorWizard();}

// ============== STEP 2: Door behavior ==============
function renderDoorWizStep2(){
if(doorWizState.category==="standard")return renderStandardDoorStep2();
if(doorWizState.category==="stage-transition")return renderStageTransitionStep2();
if(doorWizState.category==="elevator")return renderElevatorStep2();
if(doorWizState.category==="edit-elevator")return renderEditElevatorStep2();
return"<div>Not yet supported.</div>";}

function inputRow(label,fieldId,value,help,extraStyle){
extraStyle=extraStyle||"width:80px";
return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'+
'<span style="width:160px;color:#88aacc;font-size:10px" title="'+(help||"").replace(/"/g,"&quot;")+'">'+label+'</span>'+
'<input type="text" id="'+fieldId+'" value="'+String(value).replace(/"/g,"&quot;")+'" '+
'style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-size:11px;font-family:monospace;'+extraStyle+'">'+
(help?'<span style="color:#556;font-size:9px;flex:1">'+help+'</span>':'')+
'</div>';}

function selectRow(label,fieldId,options,selectedVal,help,onchange){
var h='<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">';
h+='<span style="width:160px;color:#88aacc;font-size:10px">'+label+'</span>';
h+='<select id="'+fieldId+'" '+(onchange?'onchange="'+onchange+'"':'')+' style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;padding:2px 6px;font-size:11px;font-family:monospace;min-width:140px">';
for(var i=0;i<options.length;i++){
var opt=options[i];
var v=typeof opt==="object"?opt.value:opt;
var lbl=typeof opt==="object"?opt.label:opt;
h+='<option value="'+v+'"'+(String(v)===String(selectedVal)?' selected':'')+'>'+lbl+'</option>';}
h+='</select>';
if(help)h+='<span style="color:#556;font-size:9px;flex:1">'+help+'</span>';
h+='</div>';
return h;}

function renderStandardDoorStep2(){
var report=analyzeStageForDoors();
var html='<div style="margin-bottom:10px"><button onclick="doorWizBack()" class="btn">← Back</button> <span style="color:#88ddff"><b>Step 2: Configure standard door</b></span></div>';
// === LOCATION + ORIENTATION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Location & Orientation</b><br>';
html+=inputRow("Door name","dwz_name",doorWizState.name,"Unique identifier. Used everywhere — keep it short.");
html+='<div style="display:flex;gap:8px;margin-bottom:6px;align-items:flex-end">';
html+='<div><span style="color:#88aacc;font-size:10px">Position X:</span> <input type="number" id="dwz_px" value="'+doorWizState.pos.x+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Y:</span> <input type="number" id="dwz_py" value="'+doorWizState.pos.y+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Z:</span> <input type="number" id="dwz_pz" value="'+doorWizState.pos.z+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<button onclick="enterDoorPlacementMode()" style="background:#1a3a2a;color:#66ccaa;border:1px solid #2a5a4a;padding:4px 10px;cursor:pointer;font-family:monospace;font-size:10px" title="Hide the wizard and place the door visually in the 3D view. Mouse to position, S to confirm, Esc to cancel.">📍 Set in 3D</button>';
html+='</div>';
html+=selectRow("Facing direction","dwz_dir",[
{value:0,label:"North / +Z (0)"},
{value:1024,label:"East / +X (1024)"},
{value:2048,label:"South / -Z (2048)"},
{value:3072,label:"West / -X (3072)"}],doorWizState.dirY,"Which way the door faces. Auto-determines room axis below.");
// Model selector — filter to KMDs that LOOK like door models. Vanilla naming
// convention: door models contain "_d" infix (e.g. 02a_d1, 04a_d2, evt_d1).
// If the user's loaded stage has no such models, the door wizard can't function;
// we surface a clear warning rather than letting them pick (e.g.) the stage's
// main geometry KMD and getting an invisible door.
var allModels=[];
var doorModels=[];
if(typeof mdlSubModels!=="undefined"){
var keys=Object.keys(mdlSubModels);
for(var k=0;k<keys.length;k++){
var clean=keys[k].replace(".kmd","");
allModels.push(clean);
// Door naming heuristic: contains "_d" followed by a digit, OR matches "evt_d"/"nst_dor"
if(/_d\d/.test(clean)||/^evt_d/.test(clean)||/_dor$/.test(clean)){
doorModels.push(clean);}}}
if(doorModels.length===0){
// No door models found — warn the user and offer all KMDs as a fallback (with note)
html+='<div style="margin-bottom:6px;padding:6px;background:#3a1a0a;border:1px solid #aa4422;border-radius:3px">';
html+='<b style="color:#ffaa66;font-size:11px">⚠ No door models detected in loaded stage</b><br>';
html+='<span style="font-size:9px;color:#ffaa88">The current stage has no KMDs whose names match the door pattern ("_d1", "_d2", "evt_d1", etc.). The door entity needs a door-shaped KMD to render correctly. Without one, the door will be invisible (only collision and lamp panel show up).</span><br>';
html+='<span style="font-size:9px;color:#ffaa88;margin-top:4px;display:block">Recommended: use <b>FromDAR</b> to import a door model from a stage that has one (e.g. s02a has 02a_d1/d2/d3/d6/d7). Then return to this wizard.</span>';
html+='</div>';
// Still let them pick, but show all KMDs (the user knows what they're doing if they bypass)
var modelOptions=allModels.length>0?allModels:["nst_dor"];
html+=selectRow("3D Model","dwz_model",modelOptions,doorWizState.model||modelOptions[0],"No door-pattern KMDs found — picking any KMD will likely give a non-door appearance.");}
else{
var modelOptions=doorModels;
html+=selectRow("3D Model","dwz_model",modelOptions,doorWizState.model||modelOptions[0],"KMD model for the door panel. Filtered to door-shaped models only.");}
html+='</div>';
// === ANIMATION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Animation</b><br>';
html+=selectRow("Animation type","dwz_anim",[
{value:"sliding",label:"Single panel (slides as one piece)"},
{value:"elevator-style",label:"Double panel (two leaves meet in middle, like elevator)"}],doorWizState.animType,"Single = one solid door panel slides aside. Double = two panels meet in the center (used for elevator-style doors and some large doors).","onDoorWizAnimChange()");
html+=inputRow("Door width","dwz_width",doorWizState.width,"How far the panel travels (default 1500). Vanilla doors: 1000-2000.");
html+=inputRow("Open speed","dwz_speed",doorWizState.speed,"How fast it opens. Default 100, slower = bigger feel.");
html+=selectRow("Auto-hold while player nearby","dwz_hold",[
{value:"true",label:"Yes (recommended)"},
{value:"false",label:"No — auto-close immediately"}],String(doorWizState.holdOpen),"With Yes, door stays open as long as you're near it. Without, slams shut.");
html+='</div>';
// === ROOM LINKAGE ===
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Room Linkage</b><br>';
html+='<span style="font-size:9px;color:#aaa">Controls whether walking through the door loads an adjacent room. The room MUST already be declared in this stage\'s GCL (or be \'main\').</span><br>';
html+=selectRow("Room setup","dwz_link",[
{value:"two-rooms",label:"Connects two rooms (auto-loads adjacent)"},
{value:"single-room",label:"Just decoration (door in one room only)"}],doorWizState.linkType,"","onDoorWizLinkChange()");
if(doorWizState.linkType==="two-rooms"){
var mapOpts=report.availableMaps.slice();
mapOpts.unshift({value:"main",label:"main (primary stage map)"});
// dedupe
var seen={};var dedupedOpts=[];
for(var moi=0;moi<mapOpts.length;moi++){
var mv=typeof mapOpts[moi]==="object"?mapOpts[moi].value:mapOpts[moi];
if(!seen[mv]){seen[mv]=1;dedupedOpts.push(mapOpts[moi]);}}
html+=selectRow("Room A (behind door)","dwz_mapA",dedupedOpts,doorWizState.mapA,"The room the player is in WHEN STANDING on the negative side of the door's facing axis.");
html+=selectRow("Room B (ahead of door)","dwz_mapB",dedupedOpts,doorWizState.mapB,"The room on the OTHER side. Pick 'main' if door leads back to main map.");
html+=inputRow("…or Room B custom hash","dwz_mapBCustom",doorWizState.mapBCustom||"","Override dropdown with custom hex like 0x76af. Leave blank to use dropdown choice.","width:120px");}
html+='</div>';
// === KEYCARD ===
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Keycard Lock</b><br>';
var keycardOpts=[{value:0,label:"None — opens for everyone"}];
for(var lv=1;lv<=7;lv++){
var note=(lv<=report.stagePanCardLevel)?" (player has this — door will open)":" (player needs to advance to open)";
keycardOpts.push({value:lv,label:"Level "+lv+" required"+note});}
html+=selectRow("Keycard requirement","dwz_keycard",keycardOpts,doorWizState.keycardLevel,"Player needs this keycard level or higher to open.","onDoorWizKeycardChange()");
if(doorWizState.keycardLevel>0){
html+='<div style="font-size:9px;color:#aaccff;margin-top:4px;padding:4px;background:#0a1421;border-left:2px solid #44aaff">';
if(report.pattern==="A")html+='✓ Will reuse existing shared check proc <b>'+report.sharedKeycardProc+'</b> — no new proc needed.';
else if(report.pattern==="B")html+='✓ Will create new per-door check proc (matches existing Pattern B in this stage).';
else html+='✓ Will create new per-door check proc (vanilla pattern).';
html+='</div>';}
html+='</div>';
// === PANEL LAMP ===
if(doorWizState.keycardLevel>0){
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Panel Lamp (keycard indicator)</b><br>';
html+=selectRow("Lamp","dwz_lamp",[
{value:"true",label:"Auto-place (green/red indicator next to door)"},
{value:"false",label:"Skip (no visual lock indicator)"}],String(doorWizState.placeLamp),"Recommended on for keycard doors.","onDoorWizLampChange()");
if(doorWizState.placeLamp){
html+=selectRow("Lamp side","dwz_lampSide",[
{value:"right",label:"Right of door"},
{value:"left",label:"Left of door"}],doorWizState.lampSide,"Which side the lamp panel mounts on (relative to door's facing direction).");}
html+='</div>';}
// === SOUND ===
html+='<div style="margin-bottom:8px;padding:8px;background:#0a1521;border-radius:3px"><b style="color:#88ccff;font-size:11px">Sound</b><br>';
html+=selectRow("Sound profile","dwz_sound",[
{value:"sliding",label:"Sliding metal (91 88) — most normal doors"},
{value:"elevator",label:"Elevator hydraulic (98 97)"},
{value:"big-door",label:"Big door (93 90) — heavy/important doors"},
{value:"custom",label:"Custom IDs"}],doorWizState.soundProfile,"","onDoorWizSoundChange()");
if(doorWizState.soundProfile==="custom"){
html+='<div style="display:flex;gap:6px">';
html+=inputRow("Sound ID 1","dwz_soundS1",doorWizState.soundS1,"","width:60px");
html+=inputRow("Sound ID 2","dwz_soundS2",doorWizState.soundS2,"","width:60px");
html+='</div>';}
html+='</div>';
// === ACTIONS ===
html+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">';
html+='<button onclick="doorWizBack()" class="btn">← Back</button>';
html+='<button onclick="doorWizGoToPreview()" class="btn" style="background:#1a3a4a;color:#88ddff;border:1px solid #2a5a6a">Preview →</button>';
html+='</div>';
return html;}

function renderStageTransitionStep2(){
var report=analyzeStageForDoors();
var stages=["s00a","s01a","s02a","s02b","s02c","s02d","s02e","s03a","s03b","s03c","s03d","s03e",
"s04a","s04b","s04c","s05a","s06a","s07a","s07b","s07c","s08a","s08b","s08c","s09a","s10a",
"s11a","s11b","s11c","s11d","s11e","s11g","s11h","s11i","s12a","s12b","s12c","s13a","s14e",
"s15a","s15b","s15c","s16a","s16b","s16c","s16d","s17a","s18a","s19a","s19b","s20a"];
var html='<div style="margin-bottom:10px"><button onclick="doorWizBack()" class="btn">← Back</button> <span style="color:#aa66ff"><b>Step 2: Configure stage-transition door</b></span></div>';
// === LOCATION + ORIENTATION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#1a0a21;border-radius:3px"><b style="color:#cc88ff;font-size:11px">Location & Orientation</b><br>';
html+=inputRow("Door name","dwz_name",doorWizState.name,"Unique identifier.");
html+='<div style="display:flex;gap:8px;margin-bottom:6px;align-items:flex-end">';
html+='<div><span style="color:#88aacc;font-size:10px">Position X:</span> <input type="number" id="dwz_px" value="'+doorWizState.pos.x+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Y:</span> <input type="number" id="dwz_py" value="'+doorWizState.pos.y+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Z:</span> <input type="number" id="dwz_pz" value="'+doorWizState.pos.z+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<button onclick="enterDoorPlacementMode()" style="background:#1a3a2a;color:#66ccaa;border:1px solid #2a5a4a;padding:4px 10px;cursor:pointer;font-family:monospace;font-size:10px" title="Hide the wizard and place the door visually in the 3D view. Mouse to position, S to confirm, Esc to cancel.">📍 Set in 3D</button>';
html+='</div>';
html+=selectRow("Facing direction","dwz_dir",[
{value:0,label:"North / +Z (0)"},
{value:1024,label:"East / +X (1024)"},
{value:2048,label:"South / -Z (2048)"},
{value:3072,label:"West / -X (3072)"}],doorWizState.dirY);
// Same door-model filter as the standard door step (see comment there).
// Also figure out which models are NATIVE to the current stage (loaded from
// the stage's own MDL DAR) vs IMPORTED via FromDAR. Non-native door models
// will likely render without textures since the stage's stg_tex DAR doesn't
// contain the texture page references their UVs point to.
var allModels=[],doorModels=[],importedNames={};
// Build set of model names that were imported (not native to current stage)
if(typeof importedModels!=="undefined"){
for(var imi=0;imi<importedModels.length;imi++){
importedNames[importedModels[imi].name]=true;
importedNames[importedModels[imi].name.replace(".kmd","")]=true;}}
if(typeof mdlSubModels!=="undefined"){
var keys=Object.keys(mdlSubModels);
for(var k=0;k<keys.length;k++){
var clean=keys[k].replace(".kmd","");
allModels.push(clean);
if(/_d\d/.test(clean)||/^evt_d/.test(clean)||/_dor$/.test(clean)){doorModels.push(clean);}}}
if(doorModels.length===0){
html+='<div style="margin-bottom:6px;padding:6px;background:#3a1a0a;border:1px solid #aa4422;border-radius:3px">';
html+='<b style="color:#ffaa66;font-size:11px">⚠ No door models detected</b><br>';
html+='<span style="font-size:9px;color:#ffaa88">Import a door KMD via FromDAR first (s14e has 14a_d1 for big sliding doors).</span></div>';}
var modelOptions=doorModels.length>0?doorModels:(allModels.length>0?allModels:["nst_dor"]);
// Annotate each option with native/imported status
var modelOptionsWithLabels=modelOptions.map(function(m){
var isImported=importedNames[m]||importedNames[m+".kmd"];
return{value:m,label:m+(isImported?" ⚠ (imported — may render untextured)":"")};});
html+=selectRow("3D Model","dwz_model",modelOptionsWithLabels,doorWizState.model||modelOptions[0],
"⚠ marked models are imported from other stages. They will render in-game but may appear untextured because their KMD references texture pages from the source stage. Either swap to a native model or also import the source stage's stg_tex DAR.");
html+=inputRow("Door width","dwz_width",doorWizState.width,"Big doors are usually 2000+.");
html+=inputRow("Open speed","dwz_speed",doorWizState.speed,"Big doors are slower. 70 is good.");
html+='</div>';
// === TRANSITION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#1a0a21;border-radius:3px"><b style="color:#cc88ff;font-size:11px">Stage Transition</b><br>';
html+=selectRow("Auto-open when player approaches","dwz_autoopen",[
{value:"true",label:"Yes — opens automatically"},
{value:"false",label:"No — requires manual trigger"}],String(doorWizState.autoOpen),"Recommended on. Player walks toward door, it opens.");
html+=selectRow("Target stage","dwz_targetStage",stages,doorWizState.targetStage,"Where the player ends up after crossing.");
html+='<div style="margin-top:4px;font-size:10px;color:#aabbcc"><b>Snake spawn position in target stage:</b></div>';
html+='<div style="display:flex;gap:8px;margin-bottom:6px">';
html+='<div><span style="color:#88aacc;font-size:10px">X:</span> <input type="number" id="dwz_spawnX" value="'+doorWizState.spawnX+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Y:</span> <input type="number" id="dwz_spawnY" value="'+doorWizState.spawnY+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Z:</span> <input type="number" id="dwz_spawnZ" value="'+doorWizState.spawnZ+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='</div>';
html+='<span style="font-size:9px;color:#aa88cc">These are world coordinates where Snake appears in the target stage. Look at the target stage in the editor to find a good spawn spot.</span><br>';
html+=inputRow("Fade speed","dwz_fadeSpeed",doorWizState.fadeSpeed,"How fast the screen fades to black. 30 = standard.");
html+='</div>';
// === SOUND ===
html+='<div style="margin-bottom:8px;padding:8px;background:#1a0a21;border-radius:3px"><b style="color:#cc88ff;font-size:11px">Sound</b><br>';
html+=selectRow("Sound profile","dwz_sound",[
{value:"big-door",label:"Big door (93 90) — recommended"},
{value:"elevator",label:"Elevator hydraulic (98 97)"},
{value:"sliding",label:"Standard sliding (91 88)"}],doorWizState.soundProfile);
html+='</div>';
// === KEYCARD (optional) ===
// Stage-transition doors can also require a keycard to open, like vanilla s14e's
// door from the underground tunnel to the hangar. Pattern matches standard doors:
// trap zone calls a shared keycard proc (Pattern A) or a per-door proc (Pattern B).
html+='<div style="margin-bottom:8px;padding:8px;background:#1a0a21;border-radius:3px"><b style="color:#cc88ff;font-size:11px">Keycard Lock (optional)</b><br>';
html+=selectRow("Require keycard","dwz_keycard",[
{value:0,label:"No — door opens for everyone"},
{value:1,label:"Lv 1 keycard required"},
{value:2,label:"Lv 2 keycard required"},
{value:3,label:"Lv 3 keycard required"},
{value:4,label:"Lv 4 keycard required"},
{value:5,label:"Lv 5 keycard required"},
{value:6,label:"Lv 6 keycard required (s14e default)"},
{value:7,label:"Lv 7 keycard required"}],doorWizState.keycardLevel,"Door rattles if player has insufficient keycard level.","onDoorWizKeycardChange()");
if(doorWizState.keycardLevel>0){
html+=selectRow("Lamp","dwz_lamp",[
{value:"true",label:"Auto-place (green/red indicator next to door)"},
{value:"false",label:"Skip (no visual lock indicator)"}],String(doorWizState.placeLamp),"Recommended on for keycard doors.","onDoorWizLampChange()");
if(doorWizState.placeLamp){
html+=selectRow("Lamp side","dwz_lampSide",[
{value:"right",label:"Right of door"},
{value:"left",label:"Left of door"}],doorWizState.lampSide,"Which side the lamp panel mounts on.");}}
html+='</div>';
html+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">';
html+='<button onclick="doorWizBack()" class="btn">← Back</button>';
html+='<button onclick="doorWizGoToPreview()" class="btn" style="background:#3a1a4a;color:#cc88ff;border:1px solid #5a2a6a">Preview →</button>';
html+='</div>';
return html;}

// ============== STEP 2 (elevator category) ==============
// Reference: vanilla s02a ELEVATOR_PANEL (Tank Hangar elevator → s03a/s04a).
//
// Two modes offered to the user:
//   panel-only: a floor-select kiosk anywhere in the world. Player walks up,
//               menu opens, picks floor, target stage loads. No door, no
//               elevator interior. Simpler and more portable.
//   full:       vanilla s02a-style. Door + ELEVATOR phantom map + panel inside.
//               Player presses action at door → door opens → walks in → menu.
//               Requires the stage to have an elevator-interior KMD + HZM area.
function renderElevatorStep2(){
var report=analyzeStageForDoors();
var stages=["s00a","s01a","s02a","s02b","s02c","s02d","s02e","s03a","s03b","s03c","s03d","s03e",
"s04a","s04b","s04c","s05a","s06a","s07a","s07b","s07c","s08a","s08b","s08c","s09a","s10a",
"s11a","s11b","s11c","s11d","s11e","s11g","s11h","s11i","s12a","s12b","s12c","s13a","s14e",
"s15a","s15b","s15c","s16a","s16b","s16c","s16d","s17a","s18a","s19a","s19b","s20a"];
var html='<div style="margin-bottom:10px"><button onclick="doorWizBack()" class="btn">← Back</button> <span style="color:#ffaa44"><b>Step 2: Configure elevator</b></span></div>';

// === MODE TOGGLE ===
// Lead with the mode choice so subsequent UI can adapt.
html+='<div style="margin-bottom:8px;padding:8px;background:#211a0a;border-radius:3px"><b style="color:#ffcc88;font-size:11px">Elevator Type</b><br>';
html+=selectRow("Mode","dwz_elevatorMode",[
{value:"panel-only",label:"Panel only — floor-select kiosk anywhere (simpler)"},
{value:"full",label:"Full elevator — door + interior + panel (vanilla s02a-style)"}],doorWizState.elevatorMode,"Panel-only is simpler and more likely to work first try. Full elevator needs the stage to provide an elevator-interior KMD.","onDoorWizElevatorModeChange()");
if(doorWizState.elevatorMode==="full"){
html+='<div style="margin-top:6px;padding:6px;background:#3a1a0a;border-left:3px solid #ff8844;font-size:10px;color:#ffaaaa">';
html+='⚠ <b>Full elevator mode</b> needs assets from vanilla s02a: an elevator-interior KMD (default: <code>02a_r6</code>) and matching HZM area. If your stage doesn\'t have these, the elevator interior won\'t render. To get working: import s02a\'s elevator KMD into your stage first, OR use Panel-only mode.';
html+='</div>';}
html+='</div>';

// === LOCATION + ORIENTATION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#211a0a;border-radius:3px"><b style="color:#ffcc88;font-size:11px">Panel '+(doorWizState.elevatorMode==="full"?"/ Door":"")+' Position</b><br>';
html+='<span style="font-size:10px;color:#aabbcc">'+(doorWizState.elevatorMode==="full"?
"Position of the elevator door. The floor-select panel will be auto-placed inside the elevator interior.":
"Position of the floor-select panel. Player walks up to this spot and the menu opens.")+'</span><br>';
html+=inputRow("Entity name","dwz_name",doorWizState.name||(doorWizState.elevatorMode==="full"?"evtdoor":"floorpanel"),"Used as entity name + zone-name prefix.");
html+='<div style="display:flex;gap:8px;margin-bottom:6px;align-items:flex-end">';
html+='<div><span style="color:#88aacc;font-size:10px">X:</span> <input type="number" id="dwz_px" value="'+doorWizState.pos.x+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Y:</span> <input type="number" id="dwz_py" value="'+doorWizState.pos.y+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<div><span style="color:#88aacc;font-size:10px">Z:</span> <input type="number" id="dwz_pz" value="'+doorWizState.pos.z+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:80px"></div>';
html+='<button onclick="enterDoorPlacementMode()" style="background:#1a3a2a;color:#66ccaa;border:1px solid #2a5a4a;padding:4px 10px;cursor:pointer;font-family:monospace;font-size:10px" title="Hide the wizard and place visually in the 3D view.">📍 Set in 3D</button>';
html+='</div>';
html+=selectRow("Facing direction","dwz_dir",[
{value:0,label:"North / +Z (0)"},
{value:1024,label:"East / +X (1024)"},
{value:2048,label:"South / -Z (2048)"},
{value:3072,label:"West / -X (3072)"}],doorWizState.dirY,doorWizState.elevatorMode==="full"?"Direction the door's visible face points (toward the player).":"Direction the panel faces (toward the player).");
// Door model — only relevant in full mode
if(doorWizState.elevatorMode==="full"){
var allModels=[],doorModels=[];
if(typeof mdlSubModels!=="undefined"){
var keys=Object.keys(mdlSubModels);
for(var k=0;k<keys.length;k++){
var clean=keys[k].replace(".kmd","");
allModels.push({value:clean,label:clean});
if(/_d\d|evt_d/i.test(clean))doorModels.push({value:clean,label:clean});}}
if(!doorWizState.model&&doorModels.length>0)doorWizState.model=doorModels[0].value;
var modelOpts=doorModels.length>0?doorModels:allModels;
html+=selectRow("Door model","dwz_model",modelOpts,doorWizState.model||"evt_d1","Choose a KMD that looks like an elevator door (e.g. evt_d1 in s02a).");}
html+='</div>';

// === FLOOR CONFIGURATION ===
html+='<div style="margin-bottom:8px;padding:8px;background:#211a0a;border-radius:3px"><b style="color:#ffcc88;font-size:11px">Floors</b><br>';
html+='<span style="font-size:10px;color:#aabbcc">Each floor is a button on the panel. Floor 0 is "stay here" (current stage). Floors 1+ load other stages.</span><br>';
html+=selectRow("Number of floors","dwz_floorCount",[
{value:2,label:"2 floors"},
{value:3,label:"3 floors"},
{value:4,label:"4 floors"}],doorWizState.floorCount,"How many floor buttons appear in the menu.","onDoorWizFloorCountChange()");
// Per-floor editor
for(var fi=0;fi<doorWizState.floorCount;fi++){
var f=doorWizState.floors[fi]||{targetStage:"",spawnX:0,spawnY:0,spawnZ:0};
html+='<div style="margin-top:6px;padding:6px;background:#0a0e14;border-left:3px solid '+(fi===0?"#666":"#ffaa44")+';border-radius:2px">';
html+='<b style="color:'+(fi===0?"#aabbcc":"#ffcc88")+';font-size:10px">Floor '+fi+(fi===0?' <span style="color:#778;font-size:9px">(current — closes menu, no stage load)</span>':'')+'</b><br>';
if(fi===0){
html+='<span style="font-size:9px;color:#778">Selecting this floor in the menu just dismisses the elevator.</span>';
}else{
var stagesOpts=stages.map(function(s){return{value:s,label:s};});
html+=selectRow("Target stage","dwz_floor"+fi+"_stage",stagesOpts,f.targetStage||"s01a","Stage that loads when this floor is selected.");
html+='<div style="display:flex;gap:8px;margin-bottom:3px;align-items:center">';
html+='<span style="color:#88aacc;font-size:9px;width:120px">Snake spawn:</span>';
html+='<div><span style="color:#88aacc;font-size:9px">X:</span> <input type="number" id="dwz_floor'+fi+'_spawnX" value="'+f.spawnX+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='<div><span style="color:#88aacc;font-size:9px">Y:</span> <input type="number" id="dwz_floor'+fi+'_spawnY" value="'+f.spawnY+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='<div><span style="color:#88aacc;font-size:9px">Z:</span> <input type="number" id="dwz_floor'+fi+'_spawnZ" value="'+f.spawnZ+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='</div>';}
html+='</div>';}
html+='</div>';

// (Keycard option intentionally removed — vanilla elevators don't use keycards.)

html+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">';
html+='<button onclick="doorWizBack()" class="btn">← Back</button>';
html+='<button onclick="doorWizGoToPreview()" class="btn" style="background:#4a3a1a;color:#ffcc88;border:1px solid #6a5a2a">Preview →</button>';
html+='</div>';
return html;}

function onDoorWizElevatorModeChange(){
captureStep2State();
renderDoorWizard();}

function onDoorWizFloorCountChange(){
captureStep2State();
renderDoorWizard();}

// Live-update wrappers for form state
function onDoorWizAnimChange(){captureStep2State();renderDoorWizard();}
function onDoorWizLinkChange(){captureStep2State();renderDoorWizard();}
function onDoorWizKeycardChange(){captureStep2State();renderDoorWizard();}
function onDoorWizLampChange(){captureStep2State();renderDoorWizard();}
function onDoorWizSoundChange(){
captureStep2State();
// Update default sound IDs to match profile
var prof=doorWizState.soundProfile;
if(prof==="sliding"){doorWizState.soundS1=91;doorWizState.soundS2=88;}
else if(prof==="elevator"){doorWizState.soundS1=98;doorWizState.soundS2=97;}
else if(prof==="big-door"){doorWizState.soundS1=93;doorWizState.soundS2=90;}
renderDoorWizard();}

function captureStep2State(){
// Snapshot every form field into doorWizState before re-render
var f=function(id){return document.getElementById(id);};
if(f("dwz_name"))doorWizState.name=f("dwz_name").value.trim()||doorWizState.name;
if(f("dwz_px"))doorWizState.pos.x=parseInt(f("dwz_px").value)||0;
if(f("dwz_py"))doorWizState.pos.y=parseInt(f("dwz_py").value)||0;
if(f("dwz_pz"))doorWizState.pos.z=parseInt(f("dwz_pz").value)||0;
if(f("dwz_dir"))doorWizState.dirY=parseInt(f("dwz_dir").value)||0;
if(f("dwz_model"))doorWizState.model=f("dwz_model").value;
if(f("dwz_anim"))doorWizState.animType=f("dwz_anim").value;
if(f("dwz_width"))doorWizState.width=parseInt(f("dwz_width").value)||1500;
if(f("dwz_speed"))doorWizState.speed=parseInt(f("dwz_speed").value)||100;
if(f("dwz_hold"))doorWizState.holdOpen=f("dwz_hold").value==="true";
if(f("dwz_link"))doorWizState.linkType=f("dwz_link").value;
if(f("dwz_mapA"))doorWizState.mapA=f("dwz_mapA").value;
if(f("dwz_mapB"))doorWizState.mapB=f("dwz_mapB").value;
if(f("dwz_mapBCustom"))doorWizState.mapBCustom=f("dwz_mapBCustom").value.trim();
if(f("dwz_keycard"))doorWizState.keycardLevel=parseInt(f("dwz_keycard").value)||0;
if(f("dwz_lamp"))doorWizState.placeLamp=f("dwz_lamp").value==="true";
if(f("dwz_lampSide"))doorWizState.lampSide=f("dwz_lampSide").value;
if(f("dwz_sound"))doorWizState.soundProfile=f("dwz_sound").value;
if(f("dwz_soundS1"))doorWizState.soundS1=parseInt(f("dwz_soundS1").value)||91;
if(f("dwz_soundS2"))doorWizState.soundS2=parseInt(f("dwz_soundS2").value)||88;
if(f("dwz_autoopen"))doorWizState.autoOpen=f("dwz_autoopen").value==="true";
if(f("dwz_targetStage"))doorWizState.targetStage=f("dwz_targetStage").value;
if(f("dwz_spawnX"))doorWizState.spawnX=parseInt(f("dwz_spawnX").value)||0;
if(f("dwz_spawnY"))doorWizState.spawnY=parseInt(f("dwz_spawnY").value)||0;
if(f("dwz_spawnZ"))doorWizState.spawnZ=parseInt(f("dwz_spawnZ").value)||0;
if(f("dwz_fadeSpeed"))doorWizState.fadeSpeed=parseInt(f("dwz_fadeSpeed").value)||30;
// === Elevator fields ===
if(f("dwz_elevatorMode"))doorWizState.elevatorMode=f("dwz_elevatorMode").value;
if(f("dwz_floorCount")){
var newCount=parseInt(f("dwz_floorCount").value)||3;
if(newCount!==doorWizState.floorCount){
// Grow floors[] array if needed (preserve existing entries)
while(doorWizState.floors.length<newCount){
doorWizState.floors.push({targetStage:"s01a",spawnX:0,spawnY:0,spawnZ:0});}
doorWizState.floorCount=newCount;}}
// Per-floor inputs
for(var ci=0;ci<doorWizState.floorCount;ci++){
var fl=doorWizState.floors[ci]||{targetStage:"",spawnX:0,spawnY:0,spawnZ:0};
if(f("dwz_floor"+ci+"_stage"))fl.targetStage=f("dwz_floor"+ci+"_stage").value;
if(f("dwz_floor"+ci+"_spawnX"))fl.spawnX=parseInt(f("dwz_floor"+ci+"_spawnX").value)||0;
if(f("dwz_floor"+ci+"_spawnY"))fl.spawnY=parseInt(f("dwz_floor"+ci+"_spawnY").value)||0;
if(f("dwz_floor"+ci+"_spawnZ"))fl.spawnZ=parseInt(f("dwz_floor"+ci+"_spawnZ").value)||0;
doorWizState.floors[ci]=fl;}
// === Edit-elevator fields ===
// When editing an existing elevator, we capture its per-floor state via a
// separate helper since the field IDs use a different prefix (dwz_editFloor...).
if(doorWizState.category==="edit-elevator"&&typeof captureEditElevatorState==="function"){
captureEditElevatorState();}}

function doorWizBack(){
captureStep2State();
doorWizState.step=Math.max(1,doorWizState.step-1);
if(doorWizState.step===1)doorWizState.category=null;
renderDoorWizard();}

function doorWizGoToPreview(){
captureStep2State();
doorWizState.step=3;
renderDoorWizard();}

// ============== STEP 3: Preview + commit ==============
function renderDoorWizStep3(){
var artifacts=generateDoorArtifacts(doorWizState);
var html='<div style="margin-bottom:10px"><button onclick="doorWizBack()" class="btn">← Back</button> <span style="color:#88ddff"><b>Step 3: Preview & commit</b></span></div>';
html+='<div style="margin-bottom:8px;font-size:10px;color:#aabbcc">The wizard will inject the following pieces into your GCL and HZM:</div>';
// === Summary cards ===
for(var i=0;i<artifacts.summary.length;i++){
var s=artifacts.summary[i];
html+='<div style="margin-bottom:6px;padding:6px;background:'+(s.action==="create"?"#0a2a1a":"#1a1a0a")+';border-left:3px solid '+(s.action==="create"?"#44cc88":"#ffcc44")+';font-size:10px">';
html+='<b style="color:'+(s.action==="create"?"#44cc88":"#ffcc88")+'">'+(s.action==="create"?"CREATE":"REUSE")+'</b> '+s.what+'<br>';
html+='<span style="color:#aabbcc;font-size:9px">'+s.detail+'</span>';
html+='</div>';}
// === GCL preview ===
html+='<div style="margin-top:10px"><b style="color:#88ddff;font-size:11px">Generated GCL</b></div>';
html+='<pre style="background:#0a0e14;color:#aabbcc;padding:8px;border-radius:3px;border:1px solid #1a2535;font-size:9px;white-space:pre-wrap;max-height:240px;overflow-y:auto">'+
artifacts.gclPreview.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</pre>';
// === Actions ===
html+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">';
html+='<button onclick="doorWizBack()" class="btn">← Back</button>';
html+='<button onclick="commitDoorWizard()" class="btn" style="background:#1a3a1a;color:#44ccaa;border:1px solid #2a5a2a"><b>Add Door to Stage</b></button>';
html+='</div>';
return html;}

// ============== GCL artifact generation ==============
// Returns {gclPreview, doorEntity, lampEntity, ntrapBlocks, procBlocks, hzmZone, summary}
function generateDoorArtifacts(state){
var report=analyzeStageForDoors();
var out={summary:[],gclPreview:"",doorEntity:null,lampEntity:null,
ntrapBlocks:[],procBlocks:[],hzmZone:null,stageChangeProc:null,
// edit-elevator specific:
gclEdits:null};
if(state.category==="standard")_genStandardDoor(state,report,out);
else if(state.category==="stage-transition")_genStageTransitionDoor(state,report,out);
else if(state.category==="elevator")_genElevator(state,report,out);
else if(state.category==="edit-elevator")_genEditElevator(state,report,out);
return out;}

function _genStandardDoor(state,report,out){
var name=state.name;
// From decomp (door.c): -t IS THE LEAF COUNT (number of door panels).
//   -t 1 = single panel (one slab slides aside). Most common.
//   -t 2 = double panel (two leaves meet in middle, like elevator entrance).
// The -v param controls vertical animation extent. Used by both types when
// the door has a vertical motion component (vanilla doors typically include
// it at 2250 for door2/door4 in s02a). Safer to always emit -v when set.
var dT=state.animType==="elevator-style"?2:1;
// Build the chara DOOR block
var doorLines=["chara DOOR "+name+" \\"];
doorLines.push("    -p "+state.pos.x+","+state.pos.y+","+state.pos.z+" \\");
doorLines.push("    -d 0,"+state.dirY+",0 \\");
doorLines.push("    -m "+(state.model||"nst_dor")+" \\");
doorLines.push("    -t "+dT+" \\");
doorLines.push("    -w "+state.width+" \\");
if(state.speed!==100)doorLines.push("    -s "+state.speed+" \\");
// CRITICAL: vanilla schema observed across all s02a keycard doors:
//   door1: -t 2, NO -v, NO -h, NO -f          (double-panel, model 02a_d3)
//   door2: -t 1, -v 2250, NO -h, NO -f        (single-panel, model 02a_d2)
//   door4: -t 1, -v 2250, NO -h, NO -f        (single-panel, model 02a_d1)
//   evtdoor: -t 2, -h 500, -f unknownProc71   (elevator with floor-switch callback)
//
// Rules derived:
//   -v 2250 is REQUIRED for single-panel doors (-t 1) — the engine needs this to know
//     how far the leaf travels vertically during animation. Without it the door has
//     zero vertical motion extent and renders invisible (collapsed).
//   -h is ONLY used by special doors (the elevator door uses it for player-hold-open).
//     Keycard doors DO NOT use -h. They auto-close after open.
//   -f is ONLY used by special doors (elevator floor-switching). Keycard doors DO NOT
//     use -f. The keycard check lives in the ntrap zone, NOT in the door's callback.
//     Adding -f to a keycard door calls the proc with wrong argument shape (engine
//     passes argv[message_type, F0, map_num] but the proc expects 7 stack args set
//     by the ntrap's call() invocation).
if(dT===1)doorLines.push("    -v 2250 \\");
// Visual offset — vanilla doors universally have -u 250 for proper alignment with floor
doorLines.push("    -u 250 \\");
// Room linkage (-g)
if(state.linkType==="two-rooms"){
// Axis: 1=Z, 2=X. Determined by door facing.
// Facing 0 or 2048 = N/S → blocks Z axis → -g 1
// Facing 1024 or 3072 = E/W → blocks X axis → -g 2
var axis=(state.dirY===0||state.dirY===2048)?1:2;
var mapB=state.mapBCustom||state.mapB;
doorLines.push("    -g "+axis+" "+state.mapA+" "+mapB+" \\");}
// Determine keycard callback proc for the ntrap zone (NOT for -f on the door).
// procName is consumed below by the ntrap generator.
var procName=null;
if(state.keycardLevel>0){
if(report.pattern==="A"){
procName=report.sharedKeycardProc;
out.summary.push({action:"reuse",what:"existing keycard check proc <b>"+procName+"</b>",
detail:"Pattern A is in use in this stage. New ntrap will pass level "+state.keycardLevel+" via stack:2 — no new proc needed."});}
else{
// Pattern B (or none) — generate new per-door proc
var pn=reserveNextProcNumber();
procName="unknownProc"+pn;
out.summary.push({action:"create",what:"new keycard check proc <b>"+procName+"</b>",
detail:"Pattern B style — level "+state.keycardLevel+" hardcoded in proc body. Sets lamp on accept, blinks lamp on deny."});
out.procBlocks.push(_buildPatternBKeycardProc(procName,name,state.keycardLevel,state.placeLamp?out._lampHash:null));}}
// Sound effect pair (always last flag before close)
doorLines.push("    -e "+state.soundS1+" "+state.soundS2);
// NOTE: deliberately NOT emitting -f or -h here. Both would cause the door to
// receive wrong-shaped callback args or stay-open too long. Vanilla keycard doors
// match this exact schema.
out.doorEntity=doorLines.join("\n");
out.summary.unshift({action:"create",what:"<b>chara DOOR "+name+"</b>",
detail:"Position ("+state.pos.x+","+state.pos.y+","+state.pos.z+"), "+state.animType+" animation, "+
(state.keycardLevel>0?"keycard Lv"+state.keycardLevel+" required":"opens for everyone")+
(state.linkType==="two-rooms"?", links "+state.mapA+" ↔ "+(state.mapBCustom||state.mapB):"")});
// Lamp (if keycard)
if(state.keycardLevel>0&&state.placeLamp){
var lampHash=reserveNextLampHash();
out._lampHash=lampHash;// store for proc body
// Position the lamp NEXT to the door (not on it), flush with the wall.
// Lateral offset = half door width + 250 clearance. Recessed 200 units toward
// player's side. Rotation always 0,0,0 — vanilla lamp panels auto-orient.
var lampOffset=_lampOffsetForSide(state.dirY,state.lampSide,state.width);
var lampX=state.pos.x+lampOffset.x;
var lampY=state.pos.y+1800;// at chest/eye height
var lampZ=state.pos.z+lampOffset.z;
var lampLines=["chara LAMP  "+lampHash+"  "+lampX+","+lampY+","+lampZ+"  0,0,0  500,400,0 \\"];
lampLines.push("    -I dr_lamp_off \\");
lampLines.push("    -S \\");
lampLines.push("    -a 0xdd19 0 5 0xdd19 dr_lamp_off 5 0xca87 3 \\");
lampLines.push("    -b 0xdd19 0 5 0xdd19 dr_lamp_on 5 0xca87 3");
out.lampEntity=lampLines.join("\n");
out.summary.push({action:"create",what:"<b>chara LAMP "+lampHash+"</b> (keycard panel)",
detail:"Placed on "+state.lampSide+" side of door at "+(lampX)+","+lampY+","+lampZ+". Shows green on accept, red blink on deny."});
// Re-emit door proc if we built it earlier without the lamp hash
if(procName&&out.procBlocks.length>0&&report.pattern!=="A"){
out.procBlocks[out.procBlocks.length-1]=_buildPatternBKeycardProc(procName,name,state.keycardLevel,lampHash);}}
// NTrap zones. HZM zone name field is 14 bytes — truncate door name to keep
// "tr_<name>" at or below that.
var trapZoneName="tr_"+(name.length>11?name.substring(0,11):name);
if(state.keycardLevel>0){
// Pattern A: call(sharedProc, doorname, level, stack:3, stack:2, stack:4, lamphash, stack:7)
// Pattern B: call(perdoorProc, ...same shape but proc has level baked in)
var lampRef=state.placeLamp&&out._lampHash?out._lampHash:"0";
if(report.pattern==="A"){
out.ntrapBlocks.push(_buildPatternATrap(trapZoneName,procName,name,state.keycardLevel,lampRef));}
else{
out.ntrapBlocks.push(_buildPatternBTrap(trapZoneName,procName,name,state.keycardLevel,lampRef));}
out.summary.push({action:"create",what:"<b>ntrap "+trapZoneName+"</b> (keycard trigger)",
detail:"Calls "+procName+" with door="+name+", level="+state.keycardLevel+(state.placeLamp?", lamp="+lampRef:"")});}
// HZM zone (auto-placed at door threshold)
out.hzmZone=_buildHzmZoneForDoor(trapZoneName,state);
out.summary.push({action:"create",what:"<b>HZM trap zone "+trapZoneName+"</b>",
detail:"4-wall box auto-placed at door threshold (2000×800 units, perpendicular to door)."});
// Assemble preview
var parts=[];
if(out.doorEntity)parts.push("# === Door entity ===\n"+out.doorEntity);
if(out.lampEntity)parts.push("# === Lamp entity ===\n"+out.lampEntity);
if(out.ntrapBlocks.length>0)parts.push("# === Trap zone (calls the keycard check) ===\n"+out.ntrapBlocks.join("\n"));
if(out.procBlocks.length>0)parts.push("# === Callback proc ===\n"+out.procBlocks.join("\n"));
out.gclPreview=parts.join("\n\n");}

function _genStageTransitionDoor(state,report,out){
var name=state.name;
// === DOOR ENTITY ===
// Schema based on vanilla s14e door (the gold-standard stage-transition door):
//   chara DOOR 14a_d2 -p ... -d ... -m 14a_d2 -t 2 -w 2000 -s 70 -u 0 -h 400 -v 4000 -e 93 90
//
// Key flag explanations:
//   -t 2  = double-panel (vertically split door, slides upward in two halves)
//   -w    = total width of doorway
//   -s 70 = slower than normal door (default 100). Big doors move slowly.
//   -u 0  = no vertical visual offset (big door starts at floor)
//   -h    = hold-open delay in frames after player leaves trap (400 = ~13 sec at 30fps)
//   -v    = vertical animation extent (how far the panels travel up). 4000 for big doors.
//   -e    = sound pair. 93/90 is the heavy hangar door rumble.
// NOTE: no -c 1 here. -c only applies for -t 1 (single panel) doors per door.c source.
var doorLines=["chara DOOR "+name+" \\"];
doorLines.push("    -p "+state.pos.x+","+state.pos.y+","+state.pos.z+" \\");
doorLines.push("    -d 0,"+state.dirY+",0 \\");
doorLines.push("    -m "+(state.model||"nst_dor")+" \\");
doorLines.push("    -t 2 \\");
doorLines.push("    -w "+state.width+" \\");
doorLines.push("    -s "+state.speed+" \\");
doorLines.push("    -u 0 \\");
doorLines.push("    -h 400 \\");
doorLines.push("    -v 4000 \\");
doorLines.push("    -e "+state.soundS1+" "+state.soundS2);
out.doorEntity=doorLines.join("\n");
out.summary.push({action:"create",what:"<b>chara DOOR "+name+"</b>",
detail:"Big sliding door for stage transition. Sound "+state.soundS1+"/"+state.soundS2+". Loads "+state.targetStage+" when crossed."});

// === STAGE-CHANGE PROC ===
// Sets Snake's spawn coordinates in the target stage, then calls `load`.
// Pattern from vanilla unknownProc3 in s14e (which loads s15a):
//   eval($f:000001 = false)         # mark stage not first-load
//   eval($w:snake_pos_x = X)        # spawn position in target stage
//   eval($w:snake_pos_y = Y)
//   eval($w:snake_pos_z = Z)
//   eval($w:000002 = dir)           # spawn facing direction
//   eval($w:000004 = 0)             # spawn stance
//   load "<target>" -map main -s 1  # load it
var stageChangeProcNum=reserveNextProcNumber();
var stageChangeProc="unknownProc"+stageChangeProcNum;
out.stageChangeProc=stageChangeProc;
var procLines=["proc "+stageChangeProc+" {"];
procLines.push("    eval($f:000001 = false)");
procLines.push("    eval($w:snake_pos_x = "+state.spawnX+")");
procLines.push("    eval($w:snake_pos_y = "+state.spawnY+")");
procLines.push("    eval($w:snake_pos_z = "+state.spawnZ+")");
// Spawn facing: opposite of door facing (so snake appears facing INTO target room)
// Door at dirY=0 (faces +Z) → in target, snake should face +Z (continues movement)
procLines.push("    eval($w:000002 = "+state.dirY+")");
procLines.push("    eval($w:000004 = 0)");
procLines.push("    load \""+state.targetStage+"\" \\");
procLines.push("        -map   main \\");
procLines.push("        -s     1");
procLines.push("}");
out.procBlocks.push(procLines.join("\n"));
out.summary.push({action:"create",what:"<b>proc "+stageChangeProc+"</b>",
detail:"Loads "+state.targetStage+", spawns Snake at ("+state.spawnX+","+state.spawnY+","+state.spawnZ+")"});

// === HZM ZONE NAMES ===
// HZM name field is 14 bytes. Truncate door name so "tr_<n>_a" / "tr_<n>_x" fit.
var doorNameForZone=name.length>10?name.substring(0,10):name;
var approachZoneName="tr_"+doorNameForZone+"_a";
var crossZoneName="tr_"+doorNameForZone+"_x";

// === LAMP + KEYCARD CHECK PROC (if keycard required) ===
// Vanilla s14e pattern: stage-transition doors CAN require a keycard (s14e's
// hangar door needs Lv6 — see unknownProc25). When keycard required:
//   1. Generate a lamp panel beside the door (same as standard keycard doors)
//   2. Reuse stage's existing keycard proc (Pattern A) or generate a new one (B)
//   3. The approach zone becomes a keycard-check ntrap instead of auto-open trap
// When no keycard: the approach zone is a plain auto-open trap.
var procName=null;
if(state.keycardLevel>0){
if(report.pattern==="A"){
procName=report.sharedKeycardProc;
out.summary.push({action:"reuse",what:"existing keycard check proc <b>"+procName+"</b>",
detail:"Pattern A detected — reusing shared keycard proc for level "+state.keycardLevel+"."});}
else{
var pn=reserveNextProcNumber();
procName="unknownProc"+pn;
out.summary.push({action:"create",what:"new keycard check proc <b>"+procName+"</b>",
detail:"Pattern B — level "+state.keycardLevel+" hardcoded. Lights lamp on accept, rattles on deny."});
out.procBlocks.push(_buildPatternBKeycardProc(procName,name,state.keycardLevel,null));}}
// Lamp emission
if(state.keycardLevel>0&&state.placeLamp){
var lampHash=reserveNextLampHash();
out._lampHash=lampHash;
var lampOffset=_lampOffsetForSide(state.dirY,state.lampSide,state.width);
var lampX=state.pos.x+lampOffset.x;
var lampY=state.pos.y+1800;
var lampZ=state.pos.z+lampOffset.z;
var lampLines=["chara LAMP  "+lampHash+"  "+lampX+","+lampY+","+lampZ+"  0,0,0  500,400,0 \\"];
lampLines.push("    -I dr_lamp_off \\");
lampLines.push("    -S \\");
lampLines.push("    -a 0xdd19 0 5 0xdd19 dr_lamp_off 5 0xca87 3 \\");
lampLines.push("    -b 0xdd19 0 5 0xdd19 dr_lamp_on 5 0xca87 3");
out.lampEntity=lampLines.join("\n");
out.summary.push({action:"create",what:"<b>chara LAMP "+lampHash+"</b> (keycard panel)",
detail:"On "+state.lampSide+" side of door at ("+lampX+","+lampY+","+lampZ+"). Green on accept, red on deny."});
// Re-emit Pattern B proc with the lamp hash baked in (we built it without)
if(procName&&report.pattern!=="A"&&out.procBlocks.length>0){
out.procBlocks[out.procBlocks.length-1]=_buildPatternBKeycardProc(procName,name,state.keycardLevel,lampHash);}}

// === APPROACH TRAP ===
// Two flavors:
//   No keycard: plain `trap <zone> SNAKE anything? { mesg <door> enter/leave ... }`
//     — sends open/close messages to the door entity directly.
//   With keycard: `ntrap <zone> anything? -i -exec { call(<keycardProc>, ...) }`
//     — calls the keycard check proc which opens the door only if pan_card matches.
// In both cases the zone is named tr_<name>_a (approach).
if(state.keycardLevel>0){
var lampRef=state.placeLamp&&out._lampHash?out._lampHash:"0";
if(report.pattern==="A"){
out.ntrapBlocks.push(_buildPatternATrap(approachZoneName,procName,name,state.keycardLevel,lampRef));}
else{
out.ntrapBlocks.push(_buildPatternBTrap(approachZoneName,procName,name,state.keycardLevel,lampRef));}
out.summary.push({action:"create",what:"<b>ntrap "+approachZoneName+"</b> (keycard check)",
detail:"Calls "+procName+" with door="+name+", level="+state.keycardLevel+(state.placeLamp?", lamp="+lampRef:"")+". Door opens only if keycard valid."});}
else if(state.autoOpen){
out.ntrapBlocks.push(_buildAutoOpenTrap(approachZoneName,name));
out.summary.push({action:"create",what:"<b>trap "+approachZoneName+"</b>",
detail:"Auto-opens door when Snake approaches; closes when she leaves."});}

// === CROSS NTRAP (stage transition) ===
// When Snake enters the cross zone (which sits at/past the doorway), trigger
// the cinematic walk-through-and-fade sequence, then load the next stage.
// Mirrors vanilla s14e's pattern: run_move forces Snake to walk to a fixed
// point inside the doorway, fade to black, delay, then call the load proc.
out.ntrapBlocks.push(_buildStageChangeTrap(crossZoneName,name,state,stageChangeProc));
out.summary.push({action:"create",what:"<b>ntrap "+crossZoneName+"</b>",
detail:"Triggers fade and stage load. Snake walks through the doorway, screen fades, "+state.targetStage+" loads."});

// === HZM ZONES (both auto-placed) ===
// The door's "facing direction" is the side its visible/textured front face
// points toward (verified: matches the ghost arrow direction, which points +Z
// when dirY=0). Player approaches from that front side and walks through to
// the back.
//
//   tr_<name>_a (approach, where player walks IN) → IN FRONT of door
//     = same side as facing direction → offsetForward < 0
//   tr_<name>_x (cross, fires the stage transition once Snake has crossed)
//     → BEHIND the door (transitional / "after entering" side)
//     = opposite of facing direction → offsetForward > 0
//
// CRITICAL: the approach zone is needed whenever EITHER autoOpen=true OR
// keycardLevel>0 — both flows have an approach trap that needs the zone.
// Previously only autoOpen created the zone; with keycard but no autoOpen,
// the keycard trap referenced a nonexistent zone and never fired.
out.hzmZones=[];
if(state.autoOpen||state.keycardLevel>0){
var approachZone=_buildHzmZoneForDoor(approachZoneName,state,-1500);
out.hzmZones.push(approachZone);}
var crossZone=_buildHzmZoneForDoor(crossZoneName,state,500);
out.hzmZones.push(crossZone);
out.summary.push({action:"create",what:"<b>HZM trap zones (2)</b>",
detail:approachZoneName+" placed 1500u in front of the door (player-approach side); "+crossZoneName+" placed 500u behind the door (transition fires here once Snake crosses through)."});
out.hzmZone=out.hzmZones[0];// legacy single-zone API

// === ASSEMBLE GCL PREVIEW ===
var parts=[];
if(out.procBlocks.length>0)parts.push("# === Procs ===\n"+out.procBlocks.join("\n\n"));
parts.push("# === Door entity ===\n"+out.doorEntity);
if(out.lampEntity)parts.push("# === Lamp entity ===\n"+out.lampEntity);
parts.push("# === Trap zones ===\n"+out.ntrapBlocks.join("\n"));
out.gclPreview=parts.join("\n\n");}

// ============== ELEVATOR GENERATOR ==============
// Generates a multi-floor elevator system. Reference: vanilla s02a Tank Hangar
// elevator (lines 1740-1845 of 02a.gcl) which loads s03a/s04a/etc from a single
// panel. The bundle has many parts — see _genElevator inline comments for each.
//
// Per s02a evtdoor / ELEVATOR_PANEL evpanel structure:
//   1. `hzd ELEVATOR` declaration — "phantom" map containing the elevator cabin
//   2. `chara DOOR <name>` — the elevator door (uses `-f <callback>` UNLIKE keycard
//      doors; the callback toggles ELEVATOR map visibility)
//   3. `chara ELEVATOR_PANEL` — the in-game floor selection UI
//   4. `chara LAMP` (if keycard required)
//   5. Door callback proc — `map -plus/-minus ELEVATOR` based on door state
//   6. Per-floor procs — set snake_pos + call load proc (one per non-zero floor)
//   7. Per-floor LOAD procs — actual `load "sXXa"` invocations
//   8. Trap zones — evarea (camera/zone trigger), evpanel (open menu),
//      evbutton (press button → motion+camera+menu)
//
// CRITICAL: zone names must be UNIQUE if user adds multiple elevators. We prefix
// with the elevator name so a user's "evt2" elevator gets "evt2_area" etc.
function _genElevator(state,report,out){
var name=state.name||"floorpanel";
var safeName=name.replace(/[^a-zA-Z0-9_]/g,"_").substring(0,8);
var mode=state.elevatorMode||"panel-only";

// =====================================================================
// Shared logic (both modes)
// =====================================================================
//
// Per-floor procs: each non-stay floor gets two procs:
//   - A LOAD proc (sets snake_pos in target stage + load "sXXa")
//   - A FLOOR proc (plays elevator ding + calls LOAD proc)
// Floor 0 = "stay here" (empty proc that just closes the menu).
//
// The ELEVATOR_PANEL's -e flag lists one proc per floor in order.
var floorProcNames=[];
for(var fi=0;fi<state.floorCount;fi++){
var f=state.floors[fi];
if(fi===0||!f||!f.targetStage||f.targetStage.indexOf("stay")>=0){
var emptyPN=reserveNextProcNumber();
var emptyName="unknownProc"+emptyPN;
out.procBlocks.push("proc "+emptyName+" {\n}");
floorProcNames.push(emptyName);
continue;}
// LOAD proc
var loadPN=reserveNextProcNumber();
var loadName="unknownProc"+loadPN;
var loadLines=["proc "+loadName+" {"];
loadLines.push("    eval($f:000001 = false)");
loadLines.push("    eval($w:snake_pos_x = "+f.spawnX+")");
loadLines.push("    eval($w:snake_pos_y = "+f.spawnY+")");
loadLines.push("    eval($w:snake_pos_z = "+f.spawnZ+")");
loadLines.push("    eval($w:000002 = 0)");
loadLines.push("    eval($w:000004 = 0)");
loadLines.push("    load \""+f.targetStage+"\" \\");
loadLines.push("        -map   main \\");
loadLines.push("        -s     1");
loadLines.push("}");
out.procBlocks.push(loadLines.join("\n"));
// FLOOR proc — vanilla pattern from s02a unknownProc69
var floorPN=reserveNextProcNumber();
var floorName="unknownProc"+floorPN;
var floorLines=["proc "+floorName+" {"];
floorLines.push("    sound \\");
floorLines.push("        -x     snd:01ffff0b");
floorLines.push("    eval($w:000088 = stack:1)");
floorLines.push("    eval($f:030081 = true)");
floorLines.push("    sound \\");
floorLines.push("        -x     snd:01ffff06");
floorLines.push("    eval($b:0002e6 = 0)");
floorLines.push("    call("+loadName+")");
floorLines.push("}");
out.procBlocks.push(floorLines.join("\n"));
floorProcNames.push(floorName);
out.summary.push({action:"create",what:"<b>Floor "+fi+" → "+f.targetStage+"</b>",
detail:"Procs "+floorName+" + "+loadName+". On select: sound, set snake to ("+f.spawnX+","+f.spawnY+","+f.spawnZ+"), load "+f.targetStage});}

// =====================================================================
// Geometry: compute axes once based on door/panel facing
// =====================================================================
var dirY=state.dirY||0;
var dx=state.pos.x,dy=state.pos.y,dz=state.pos.z;
// "Forward" = the direction the panel/door's face points (toward the player)
// "Backward" = away from the player (into the elevator interior)
// "Left/Right" = perpendicular to facing
var fwdX=0,fwdZ=0,leftX=0,leftZ=0;
if(dirY===0){fwdZ=1;leftX=-1;}        // faces +Z, "left" = -X
else if(dirY===2048){fwdZ=-1;leftX=1;}// faces -Z, "left" = +X
else if(dirY===1024){fwdX=1;leftZ=1;} // faces +X, "left" = +Z
else{fwdX=-1;leftZ=-1;}                // faces -X, "left" = -Z
// Player's facing dir when standing at the panel (facing the panel): opposite
// of the panel's facing. Used for ntrap -dir constraints.
var playerDir=(dirY+2048)%4096;

// =====================================================================
// PANEL-ONLY MODE
// =====================================================================
// Generates just a floor-select kiosk. The ELEVATOR_PANEL entity sits in
// the world at state.pos with its face pointing at the player. One trap
// zone covers a ~1500x1500 area in front of it; entering the zone opens
// the menu via `mesg <panel> select`.
//
// No door, no interior map, no -f callback proc. The panel is purely a
// floor-selection UI placed in the existing stage geometry.
if(mode==="panel-only"){
// Place the panel slightly inset from the user's pos (so it visually mounts
// on a wall behind the trigger zone)
var panelX=dx-fwdX*200;
var panelZ=dz-fwdZ*200;
var panelY=dy+1500;// chest height
var btnX=dx-fwdX*100+(-leftX)*300;
var btnZ=dz-fwdZ*100+(-leftZ)*300;
var btnY=dy+1850;
var curX=panelX;
var curZ=panelZ;
var curY=panelY+100;

var panelLines=["chara ELEVATOR_PANEL "+name+" \\"];
panelLines.push("    -p "+panelX+" "+panelY+" "+panelZ+" 0 "+dirY+" 0 138 512 0 1000 0xb42 \\");
panelLines.push("    -b "+btnX+" "+btnY+" "+btnZ+" 0 0 0 500 500 0 500 0x729e 0x8a6a \\");
panelLines.push("    -n "+state.floorCount+" \\");
panelLines.push("    -c "+curX+" "+curY+" "+curZ+" 0 4050 0 4200 3800 \\");
panelLines.push("    -e "+floorProcNames.join(" ")+" \\");
panelLines.push("    -f 0 \\");
// -r is required by the engine but we don't have a real door — use the panel's own name.
// The panel will message itself, which is a no-op for door state.
panelLines.push("    -r "+name+" \\");
panelLines.push("    -t 0");
out.elevatorPanelEntity=panelLines.join("\n");
out.summary.push({action:"create",what:"<b>chara ELEVATOR_PANEL "+name+"</b>",
detail:state.floorCount+" floors. Panel at ("+panelX+","+panelY+","+panelZ+"). Walk near it to open the floor menu."});

// Single trap zone: player walks into it, menu opens.
// Generous size (3000x3000) so player can trigger from a reasonable distance.
var panelZone=safeName+"_zn";
if(panelZone.length>14)panelZone=panelZone.substring(0,14);
out.hzmZones=[];
out.hzmZones.push({
name:panelZone,
corners:[
{x:dx-1500,z:dz-1500},
{x:dx+1500,z:dz-1500},
{x:dx+1500,z:dz+1500},
{x:dx-1500,z:dz+1500}],
y:dy,h:2000});

// ntrap: player enters zone → open menu. No facing/button constraints — fires
// on entry. This is the SIMPLEST possible trigger.
out.ntrapBlocks.push(
"ntrap "+panelZone+" SNAKE \\\n"+
"    -mask  enter \\\n"+
"    -exec  {\n"+
"        mesg "+name+" select\n"+
"    }");

out.summary.push({action:"create",what:"<b>HZM trap zone "+panelZone+"</b>",
detail:"3000×3000 box centered at panel position. Walking into it sends `select` to the panel, opening the floor menu."});
out.summary.push({action:"create",what:"<b>1 ntrap entry</b>",
detail:"Fires on Snake entry; opens the menu via `mesg "+name+" select`."});

// Assemble preview
var parts=[];
if(out.procBlocks.length>0)parts.push("# === Floor procs ===\n"+out.procBlocks.join("\n\n"));
parts.push("# === Floor-select panel ===\n"+out.elevatorPanelEntity);
parts.push("# === Trap zone ===\n"+out.ntrapBlocks.join("\n\n"));
out.gclPreview=parts.join("\n\n");
return;}// END panel-only mode

// =====================================================================
// FULL ELEVATOR MODE (vanilla s02a-style)
// =====================================================================

// ===== STEP 1: HZD ELEVATOR declaration =====
// The phantom map for the elevator interior. Hardcoded to use 02a_r6 as a
// fallback — user must override if their stage has a different elevator KMD.
var elevatorKmd="02a_r6";
if(typeof mdlSubModels!=="undefined"){
var keys=Object.keys(mdlSubModels);
for(var k=0;k<keys.length;k++){
var clean=keys[k].replace(".kmd","");
if(/_r6$/i.test(clean)){elevatorKmd=clean;break;}}}
var stagePrefix=elevatorKmd.split("_")[0];
out.hzdDeclaration="hzd ELEVATOR \\\n"+
"    -kmd   "+elevatorKmd+" \\\n"+
"    -lit   "+stagePrefix+" \\\n"+
"    -hzm   "+stagePrefix+" 3 \\\n"+
"    -d     1 0 \\\n"+
"    -zone  5";
out.summary.push({action:"create",what:"<b>hzd ELEVATOR</b>",
detail:"Phantom map for elevator interior. KMD '"+elevatorKmd+"'. Door's -f callback toggles its visibility."});

// ===== STEP 2: Door callback proc =====
// Toggles ELEVATOR map visibility based on door state. Matches vanilla
// unknownProc71 in s02a.
var doorCbPN=reserveNextProcNumber();
var doorCbName="unknownProc"+doorCbPN;
var doorCbLines=["proc "+doorCbName+" {"];
doorCbLines.push("    if (stack:1 == enter) {");
doorCbLines.push("        map \\");
doorCbLines.push("            -plus  ELEVATOR");
doorCbLines.push("    } else {");
doorCbLines.push("        if ($f:020081 == false) {");
doorCbLines.push("            map \\");
doorCbLines.push("                -minus ELEVATOR");
doorCbLines.push("        }");
doorCbLines.push("    }");
doorCbLines.push("    mesg "+name+"_panel 0x8591 stack:1");
doorCbLines.push("}");
out.procBlocks.push(doorCbLines.join("\n"));
out.summary.push({action:"create",what:"<b>proc "+doorCbName+"</b> (door callback)",
detail:"Toggles ELEVATOR map visibility on door open/close."});

// ===== STEP 3: chara DOOR =====
var doorLines=["chara DOOR "+name+" \\"];
doorLines.push("    -p "+state.pos.x+","+state.pos.y+","+state.pos.z+" \\");
doorLines.push("    -d 0,"+state.dirY+",0 \\");
doorLines.push("    -m "+(state.model||"evt_d1")+" \\");
doorLines.push("    -t 2 \\");
doorLines.push("    -w "+state.width+" \\");
doorLines.push("    -f "+doorCbName+" \\");
doorLines.push("    -h 500 \\");
doorLines.push("    -e "+state.soundS1+" "+state.soundS2);
out.doorEntity=doorLines.join("\n");
out.summary.push({action:"create",what:"<b>chara DOOR "+name+"</b>",
detail:"Elevator door at ("+state.pos.x+","+state.pos.y+","+state.pos.z+"). Has -f callback that manages ELEVATOR map visibility."});

// ===== STEP 4: chara ELEVATOR_PANEL =====
// Inside the elevator interior. Position computed relative to door:
// 1500 units "into elevator" (-fwd direction) and 1500 to the left.
var panelX=dx-fwdX*1500+leftX*1500;
var panelZ=dz-fwdZ*1500+leftZ*1500;
var panelY=dy+1500;
var btnEX=dx-fwdX*1000+(-leftX)*1500;
var btnEZ=dz-fwdZ*1000+(-leftZ)*1500;
var btnEY=dy+1850;
var curX=panelX+leftX*200;
var curZ=panelZ+leftZ*200;
var curY=panelY+100;
// Panel rotation: panel sits on the "left" wall of the elevator interior.
// Its face should point toward the player (interior center).
var panelRotY=0;
if(leftX===-1)panelRotY=1024;// on -X wall, faces +X
else if(leftX===1)panelRotY=3072;
else if(leftZ===-1)panelRotY=0;
else if(leftZ===1)panelRotY=2048;

var panelLines=["chara ELEVATOR_PANEL "+name+"_panel \\"];
panelLines.push("    -p "+panelX+" "+panelY+" "+panelZ+" 0 "+panelRotY+" 0 138 512 0 1000 0xb42 \\");
panelLines.push("    -b "+btnEX+" "+btnEY+" "+btnEZ+" 0 0 0 500 500 0 500 0x729e 0x8a6a \\");
panelLines.push("    -n "+state.floorCount+" \\");
panelLines.push("    -c "+curX+" "+curY+" "+curZ+" 0 4050 0 4200 3800 \\");
panelLines.push("    -e "+floorProcNames.join(" ")+" \\");
panelLines.push("    -f 0 \\");
panelLines.push("    -r "+name+" \\");
panelLines.push("    -t 0");
out.elevatorPanelEntity=panelLines.join("\n");
out.summary.push({action:"create",what:"<b>chara ELEVATOR_PANEL "+name+"_panel</b>",
detail:state.floorCount+" floors. Panel at ("+panelX+","+panelY+","+panelZ+") inside elevator interior."});

// ===== STEP 5: HZM zones + trap/ntraps =====
// Three zones matching vanilla s02a layout:
//   - <name>_area: large box around the door area (covers approach + interior)
//   - <name>_btn:  outside-button zone (just in front of door, 1000x1000)
//   - <name>_pnl:  inside-panel zone (at panel's world position)
// All sized for the door's facing direction.
var areaZone=safeName+"_area";
var btnZone=safeName+"_btn";
var pnlZone=safeName+"_pnl";
if(areaZone.length>14)areaZone=areaZone.substring(0,14);
if(btnZone.length>14)btnZone=btnZone.substring(0,14);
if(pnlZone.length>14)pnlZone=pnlZone.substring(0,14);

// Area zone: 5000x5000 centered on door (covers approach + interior)
out.hzmZones=[];
out.hzmZones.push({
name:areaZone,
corners:[
{x:dx-2500,z:dz-2500},
{x:dx+2500,z:dz-2500},
{x:dx+2500,z:dz+2500},
{x:dx-2500,z:dz+2500}],
y:dy,h:2000});
// Button zone: 1000x1000 in FRONT of door (player's approach side)
var bzX=dx+fwdX*750;
var bzZ=dz+fwdZ*750;
out.hzmZones.push({
name:btnZone,
corners:[
{x:bzX-500,z:bzZ-500},
{x:bzX+500,z:bzZ-500},
{x:bzX+500,z:bzZ+500},
{x:bzX-500,z:bzZ+500}],
y:dy,h:2000});
// Panel zone: 1500x1500 at panel's world position (inside elevator)
out.hzmZones.push({
name:pnlZone,
corners:[
{x:panelX-750,z:panelZ-750},
{x:panelX+750,z:panelZ-750},
{x:panelX+750,z:panelZ+750},
{x:panelX-750,z:panelZ+750}],
y:dy,h:2000});

// === Trap definitions ===
// trap <area> anything? anything? — area state tracker
out.ntrapBlocks.push(
"trap "+areaZone+" anything? anything? {\n"+
"    mesg "+name+"_panel stack:3 stack:2\n"+
"    if (stack:2 == SNAKE) {\n"+
"        if (stack:3 == enter) {\n"+
"            eval($f:020081 = true)\n"+
"        } else {\n"+
"            eval($f:020081 = false)\n"+
"        }\n"+
"    }\n"+
"}");
// ntrap <area> SNAKE -mask enter -c — camera switch on entry
out.ntrapBlocks.push(
"ntrap "+areaZone+" SNAKE \\\n"+
"    -mask  enter \\\n"+
"    -c");
// ntrap <btn>: outside button. Player must face the door (dir = playerDir).
// On action press: send `enter` to the door directly, opening it.
// This is simpler than vanilla's panel-mediated open (mesg <panel> 0x121f
// after delay) but achieves the same observable result.
out.ntrapBlocks.push(
"ntrap "+btnZone+" SNAKE \\\n"+
"    -mask  enter \\\n"+
"    -dir   "+playerDir+" \\\n"+
"    -button 0 \\\n"+
"    -stance 0 \\\n"+
"    -exec  {\n"+
"        mesg SNAKE motion 2 "+playerDir+" -1 -1 0\n"+
"        sound \\\n"+
"            -e     0 63 96\n"+
"        delay \\\n"+
"            -time  13 \\\n"+
"            -exec  {\n"+
"                mesg "+name+" enter SNAKE 0 0\n"+
"            }\n"+
"    }");
// ntrap <pnl>: inside panel. Player walks near panel → menu opens.
out.ntrapBlocks.push(
"ntrap "+pnlZone+" SNAKE \\\n"+
"    -mask  enter \\\n"+
"    -exec  {\n"+
"        mesg "+name+"_panel select\n"+
"    }");

out.summary.push({action:"create",what:"<b>HZM trap zones (3)</b>",
detail:areaZone+" (5000u area+camera), "+btnZone+" (outside button, action-press), "+pnlZone+" (inside panel, auto-open)."});
out.summary.push({action:"create",what:"<b>4 trap/ntrap entries</b>",
detail:"area tracker + camera switch + outside button-press (opens door) + inside panel trigger (opens menu)."});

// ===== Asset dependency warning =====
out.summary.push({action:"reuse",what:"<b>⚠ Asset dependencies</b>",
detail:"hzd ELEVATOR uses KMD '"+elevatorKmd+"' for interior. Panel uses textures 0xb42, 0x729e, 0x8a6a. If your stage doesn't have these, the elevator interior or panel may render incorrectly. Vanilla s02a is the reference."});

// Assemble preview
var parts=[];
if(out.hzdDeclaration)parts.push("# === ELEVATOR phantom map ===\n"+out.hzdDeclaration);
if(out.procBlocks.length>0)parts.push("# === Floor procs + door callback ===\n"+out.procBlocks.join("\n\n"));
parts.push("# === Elevator door ===\n"+out.doorEntity);
if(out.elevatorPanelEntity)parts.push("# === Floor-select panel ===\n"+out.elevatorPanelEntity);
parts.push("# === Trap zones ===\n"+out.ntrapBlocks.join("\n\n"));
out.gclPreview=parts.join("\n\n");}
// Helpers
function _lampOffsetForSide(facingY,side,doorWidth){
// Vanilla lamp placement: panel sits NEXT to the door (not on it), flush with the
// wall but slightly recessed toward the player's side.
//
// Two components to the offset:
//   1. Lateral (perpendicular to door facing): puts lamp beside the door.
//      Magnitude = (doorWidth/2) + 250 — far enough that the lamp isn't on the
//      door's geometry. Direction depends on side (right=+90° from facing).
//   2. Wall-recess (opposite to door facing): pulls lamp slightly toward player's
//      room. Magnitude = 200. Vanilla uses ~500 but 200 keeps the lamp visually
//      on the wall surface for most door models.
//
// Door facing N (+Z, dirY=0):    right=+X, recess=-Z
// Door facing E (+X, dirY=1024): right=-Z, recess=-X
// Door facing S (-Z, dirY=2048): right=-X, recess=+Z
// Door facing W (-X, dirY=3072): right=+Z, recess=+X
var lateral=(doorWidth||1500)/2+250;// half door + clearance
var recess=200;// pull lamp toward player's room so it visually mounts on the wall
var sign=(side==="right")?1:-1;
if(facingY===0)   return{x:sign*lateral, z:-recess};      // N facing
if(facingY===1024)return{x:-recess,      z:-sign*lateral};// E facing
if(facingY===2048)return{x:-sign*lateral,z:+recess};      // S facing
if(facingY===3072)return{x:+recess,      z:+sign*lateral};// W facing
return{x:lateral,z:0};}

function _buildPatternAKeycardProc(procName){
// Canonical s02a unknownProc32 — shared across all keycard doors in stage
var s=["proc "+procName+" {"];
s.push("    if (stack:3 == enter) {");
s.push("        if ($w:pan_card >= stack:2 && (stack:4 != SNAKE || $w:equipped_item == 17)) {");
s.push("            if (stack:4 != 0x50ae) {");
s.push("                mesg stack:6 on dr_lamp_on");
s.push("            }");
s.push("            mesg stack:1 stack:3 stack:4 stack:5 0");
s.push("        } else {");
s.push("            if (stack:7 == 0) {");
s.push("                if (stack:4 == SNAKE && $w:equipped_item == 17) {");
s.push("                    sound \\");
s.push("                        -e     0 63 35");
s.push("                    mesg stack:6 0xbcd2 0x61");
s.push("                }");
s.push("            }");
s.push("            mesg stack:1 0x1aaa stack:4 stack:5 15");
s.push("        }");
s.push("    } else {");
s.push("        if (stack:7 == 0) {");
s.push("            mesg stack:6 on dr_lamp_off");
s.push("        }");
s.push("        mesg stack:1 stack:3 stack:4 stack:5 15");
s.push("    }");
s.push("}");
return s.join("\n");}

function _buildPatternBKeycardProc(procName,doorName,level,lampHash){
// s04a unknownProc65 style — level hardcoded, lamp ref hardcoded
var lampLine=lampHash?lampHash:"0";
var s=["proc "+procName+" {"];
s.push("    if ($w:pan_card >= "+level+" && (stack:2 != SNAKE || $w:equipped_item == 17)) {");
if(lampHash){
s.push("        if (stack:2 != 0x50ae) {");
s.push("            mesg "+lampHash+" on dr_lamp_on");
s.push("        }");}
s.push("        mesg "+doorName+" stack:3 stack:2 stack:6 15");
s.push("    } else {");
s.push("        if (stack:7 == 0) {");
if(lampHash){
s.push("            if (stack:2 == SNAKE && $w:equipped_item == 17) {");
s.push("                mesg "+lampHash+" 0xbcd2 0x61");
s.push("                sound \\");
s.push("                    -e     0 63 35");
s.push("            }");}
s.push("        }");
s.push("        mesg "+doorName+" 0x1aaa stack:2 stack:6 15");
s.push("    }");
s.push("}");
return s.join("\n");}

function _buildPatternATrap(zoneName,procName,doorName,level,lampHash){
return"ntrap "+zoneName+" anything? \\\n"+
"    -mask  anything? \\\n"+
"    -i     \\\n"+
"    -exec  {\n"+
"        call("+procName+", "+doorName+", "+level+", stack:3, stack:2, stack:4, "+lampHash+", stack:7)\n"+
"    }";}

function _buildPatternBTrap(zoneName,procName,doorName,level,lampHash){
// Pattern B trap uses -proc not -exec (matches s04a vanilla)
return"ntrap "+zoneName+" anything? \\\n"+
"    -mask  enter \\\n"+
"    -i     \\\n"+
"    -proc  "+procName+"\n"+
"ntrap "+zoneName+" anything? \\\n"+
"    -mask  leave \\\n"+
"    -i     \\\n"+
"    -exec  {\n"+
"        if (stack:7 == 0) {\n"+
"            mesg "+(lampHash!=="0"?lampHash:doorName)+" on dr_lamp_off\n"+
"        }\n"+
"        mesg "+doorName+" stack:3 stack:2 stack:6 15\n"+
"    }";}

function _buildAutoOpenTrap(zoneName,doorName){
return"trap "+zoneName+" SNAKE anything? {\n"+
"    if (stack:3 == enter) {\n"+
"        mesg "+doorName+" enter SNAKE 0 0\n"+
"    } else {\n"+
"        mesg "+doorName+" leave stack:2 stack:6 30\n"+
"    }\n"+
"}";}

function _buildStageChangeTrap(zoneName,doorName,state,procName){
// Match vanilla s14e pattern:
//   ntrap <zone> SNAKE -mask enter -c -exec {
//     if (stack:7 == 2) {
//       mesg nikita kill           # cancel nikita rockets if shooting
//     } else {
//       pad -resume                # disable player input
//       sound -x snd:01ffff0b      # transition whoosh sound
//       mesg SNAKE run_move <dest> 1000,16,-1   # walk Snake to dest
//       chara FADE_IN_OUT 0x1f8b -m 0 -speed <speed>   # fade out
//       delay -time 32 -exec { call(<load proc>) }     # delay then load
//     }
//   }
// 
// Compute run_move destination: 1500 units past the door in the direction
// the player is traveling. Vanilla pattern: Snake walks OPPOSITE the door's
// facing direction — the door faces toward where Snake came from, so she
// walks AWAY from the facing direction to go through it.
// Examples from vanilla 14e:
//   Door at (0,0,14750) faces -Z (dirY=2048) → run_move dest (0,0,17000) walks +Z
//   Door at (2000,0,-20375) faces +Z (dirY=0) → run_move dest (2000,0,-22250) walks -Z
var dx=0,dz=0;
if(state.dirY===0)dz=-1500;        // door faces +Z, walk -Z (through to behind)
else if(state.dirY===2048)dz=1500; // door faces -Z, walk +Z
else if(state.dirY===1024)dx=-1500;// door faces +X, walk -X
else dx=1500;                      // door faces -X, walk +X
var runMoveX=state.pos.x+dx;
var runMoveZ=state.pos.z+dz;
var runMoveY=state.pos.y;
var fadeSpeed=state.fadeSpeed||30;
return"ntrap "+zoneName+" SNAKE \\\n"+
"    -mask  enter \\\n"+
"    -c     \\\n"+
"    -exec  {\n"+
"        if (stack:7 == 2) {\n"+
"            mesg nikita kill\n"+
"        } else {\n"+
"            pad \\\n"+
"                -resume\n"+
"            sound \\\n"+
"                -x     snd:01ffff0b\n"+
"            mesg SNAKE  run_move  "+runMoveX+","+runMoveY+","+runMoveZ+"  1000,16,-1\n"+
"            chara FADE_IN_OUT 0x1f8b \\\n"+
"                -m     0 \\\n"+
"                -speed "+fadeSpeed+"\n"+
"            delay \\\n"+
"                -time  32 \\\n"+
"                -exec  {\n"+
"                    call("+procName+")\n"+
"                }\n"+
"        }\n"+
"    }";}

function _buildHzmZoneForDoor(zoneName,state,offsetForward){
// Place a HZD trap zone (axis-aligned 3D bounding box) at/around the door.
//
// Vanilla pattern (verified against s02a trdoor1/2/4): the zone STRADDLES the door
// position. For a door facing E/W (dirY=1024 or 3072), the zone is wider along Z
// (perpendicular to door's facing) and narrower along X (parallel to facing).
// The zone is centered on door X,Z.
//
// Vanilla trdoor1 box: x in [11500, 14000] (width 2500), z in [-9000, -5000] (depth 4000)
// Door1 position: (12250, 0, -7000) → box centered roughly on the door (slight asymmetry
// due to original level designer's preference, not engine requirement).
//
//   offsetForward = 0   → zone centered on door (straddle, for standard doors)
//   offsetForward < 0   → zone shifted FORWARD (the door's facing direction)
//   offsetForward > 0   → zone shifted BACKWARD (away from facing direction)
//
// "Forward" = the +direction the door's normal points. dirY=0 means facing +Z, so
// forward = +Z. dirY=2048 means facing -Z, so forward = -Z. etc.
offsetForward=offsetForward||0;
var x=state.pos.x,z=state.pos.z;
// Make zone size proportional to door width so it visually lines up.
// Vanilla trdoor1: door1 has -w 1500. Zone width parallel-to-door is 2500.
// So zone parallel extent ≈ door_width + 1000.
// Zone perpendicular extent (depth the player walks through) is roughly 4000 in
// vanilla. We use door_width + 2500 for generous coverage.
var doorW=state.width||1500;
var halfWidth=(doorW+1000)/2;     // parallel to door face — straddles door + 500u each side
var halfDepth=(doorW+2500)/2;     // perpendicular (along facing) — generous depth
var p1,p2,p3,p4;
if(state.dirY===0){
// Facing +Z: door's normal is +Z. Depth axis = Z. Width axis = X.
// "Forward" = +Z, so offsetForward positive means push zone toward +Z.
// But the convention is: offsetForward < 0 means "in front of door (+Z side)".
// Actually vanilla doors don't use offsetForward — they straddle. We default to 0.
var zCenter=z+(-offsetForward);// negative offset → +Z (forward), positive → -Z
p1={x:x-halfWidth,z:zCenter-halfDepth};p2={x:x+halfWidth,z:zCenter-halfDepth};
p3={x:x+halfWidth,z:zCenter+halfDepth};p4={x:x-halfWidth,z:zCenter+halfDepth};}
else if(state.dirY===2048){
// Facing -Z: depth axis = Z, forward direction = -Z
var zCenter=z+offsetForward;// negative offset → -Z (forward), positive → +Z
p1={x:x-halfWidth,z:zCenter-halfDepth};p2={x:x+halfWidth,z:zCenter-halfDepth};
p3={x:x+halfWidth,z:zCenter+halfDepth};p4={x:x-halfWidth,z:zCenter+halfDepth};}
else if(state.dirY===1024){
// Facing +X: depth axis = X, width axis = Z, forward = +X
var xCenter=x+(-offsetForward);
p1={x:xCenter-halfDepth,z:z-halfWidth};p2={x:xCenter-halfDepth,z:z+halfWidth};
p3={x:xCenter+halfDepth,z:z+halfWidth};p4={x:xCenter+halfDepth,z:z-halfWidth};}
else{
// Facing -X (dirY=3072): depth axis = X, forward = -X
var xCenter=x+offsetForward;
p1={x:xCenter-halfDepth,z:z-halfWidth};p2={x:xCenter-halfDepth,z:z+halfWidth};
p3={x:xCenter+halfDepth,z:z+halfWidth};p4={x:xCenter+halfDepth,z:z-halfWidth};}
return{name:zoneName,corners:[p1,p2,p3,p4],y:state.pos.y,h:2000};}

// ============== COMMIT ==============
function commitDoorWizard(){
captureStep2State();
var artifacts=generateDoorArtifacts(doorWizState);
if(typeof gclOrigText!=="string")gclOrigText="";

// === EDIT-ELEVATOR PATH ===
// This category doesn't add a door bundle — it surgically modifies existing
// procs and the ELEVATOR_PANEL's flags. Handle that case here and return
// before the regular bundle-injection logic runs.
if(doorWizState.category==="edit-elevator"&&artifacts.gclEdits){
gclOrigText=_applyElevatorEdits(gclOrigText,artifacts.gclEdits);
// Re-parse so editor picks up changes
if(typeof parseGCLScript==="function")parseGCLScript(gclOrigText);
if(typeof parseProcList==="function")parseProcList(gclOrigText);
if(typeof rebuildGCLVis==="function")rebuildGCLVis();
if(typeof updateGCLPanel==="function")updateGCLPanel();
if(typeof rebuild==="function")rebuild();
closeDoorWizard();
var msg="Elevator edits applied.\n\nSummary:\n";
for(var ei=0;ei<artifacts.summary.length;ei++){
var s=artifacts.summary[ei];
msg+="  "+(s.action==="create"?"+ ":s.action==="modify"?"~ ":"  ")+s.what.replace(/<[^>]+>/g,"")+"\n";}
msg+="\nNext steps:\n";
msg+="• View the changes in ViewGCL\n";
msg+="• Test in-game — the existing elevator should now load the new target stages\n";
msg+="• ExpGCL to write the changes to file";
alert(msg);
return;}

// === STEP 1: Inject the keycard check proc (if generated) at the proc region ===
// Procs are top-of-file (or below the file header comments). Must appear BEFORE any
// reference to them in the entity region. For Pattern A reuse, this is empty.
var procInjection="";
for(var pi=0;pi<artifacts.procBlocks.length;pi++)procInjection+="\n"+artifacts.procBlocks[pi]+"\n";
if(procInjection){
var firstProcMatch=gclOrigText.match(/^proc\s+\w+\s*\{/m);
var insertPos=firstProcMatch?firstProcMatch.index:0;
gclOrigText=gclOrigText.substring(0,insertPos)+procInjection+"\n"+gclOrigText.substring(insertPos);}

// === STEP 2: Inject the door bundle as one map-bound chunk ===
// CRITICAL: every chara/ntrap captures the current `map -area` context as its `where`
// field at script execution. If we inject the door, lamp, and ntraps outside any map
// block, they bind to whatever the last `map -area` was — which may be the wrong map
// or even a variable. The door's model won't render, the lamp won't receive messages,
// the trap won't fire.
//
// The fix is to wrap the bundle in its own `map -area main <link>` block matching the
// rooms the door connects. This guarantees the bundle is bound to a real map context
// the player can be in.
//
// Vanilla pattern (s02a door1, lines 1984-2031):
//     map -area main 0x76ae      ← bind context
//     ntrap angle_a SNAKE ...     ← camera ntrap (we skip this for now)
//     ntrap trdoor1 anything?     ← keycard check trap
//     ntrap trdoor1 SNAKE ...     ← camera-on-cross trap (we skip this for now)
//     ntrap angle11 SNAKE ...     ← another camera trap (skip)
//     chara DOOR door1 ...        ← the door
//     chara LAMP 0x351f ...       ← the keycard panel
//
// Build our equivalent bundle as one big string.
var bundleParts=[];
// Determine the map context for the bundle
var mapContext="main";
if(doorWizState.category==="standard"&&doorWizState.linkType==="two-rooms"){
var linkedMap=doorWizState.mapBCustom||doorWizState.mapB;
// If linked map is "main" (degenerate case), just `main`. Otherwise main + linked.
if(linkedMap&&linkedMap!=="main"&&linkedMap!==doorWizState.mapA){
mapContext="main "+linkedMap;}}
bundleParts.push("map \\\n    -area  "+mapContext);
for(var ti=0;ti<artifacts.ntrapBlocks.length;ti++)bundleParts.push(artifacts.ntrapBlocks[ti]);
if(artifacts.doorEntity)bundleParts.push(artifacts.doorEntity);
if(artifacts.lampEntity)bundleParts.push(artifacts.lampEntity);
// Elevator-only: the ELEVATOR_PANEL goes in the bundle after the door
if(artifacts.elevatorPanelEntity)bundleParts.push(artifacts.elevatorPanelEntity);
// For stage-transition doors, the stage-change proc also needs to be at proc level (handled in step 1)
// Plus any extra blocks generated (the auto-open trap, the cross trap) are in ntrapBlocks already.
var bundleText="\n\n# ----- Door bundle generated by Door Wizard -----\n"+
bundleParts.join("\n")+"\n# ----- End door bundle -----\n\n";

// Elevator-only: inject the `hzd ELEVATOR ...` declaration near the existing
// hzd block. Look for the first `hzd ` line — the new declaration goes RIGHT
// before it so all hzd declarations are clustered together.
if(artifacts.hzdDeclaration){
var hzdRe=/^hzd\s+\w+/m;
var hzdMatch=gclOrigText.match(hzdRe);
if(hzdMatch){
gclOrigText=gclOrigText.substring(0,hzdMatch.index)+
artifacts.hzdDeclaration+"\n"+
gclOrigText.substring(hzdMatch.index);}
else{
// No existing hzd lines — prepend to file
gclOrigText=artifacts.hzdDeclaration+"\n\n"+gclOrigText;}}

// Find insertion point: just BEFORE the next `map -area` statement that follows the
// last existing `chara DOOR` or entity block, OR just before `chara MOTION_SEQUENCE`
// (which marks the start of the cinematic/sequence region — entities live before it).
var bundleInsertPos=-1;
// Strategy 1: insert before MOTION_SEQUENCE
var motSeqMatch=gclOrigText.match(/\n\s*chara\s+MOTION_SEQUENCE\b/);
if(motSeqMatch){bundleInsertPos=motSeqMatch.index;}
// Strategy 2: if no MOTION_SEQUENCE, append before the last `chara` block
if(bundleInsertPos<0){
var lastCharaMatch=null,m;
var charaRe=/\n\s*chara\s+\w+/g;
while((m=charaRe.exec(gclOrigText))!==null)lastCharaMatch=m;
if(lastCharaMatch){
// Find end of that chara block (next non-continuation line)
var afterStart=lastCharaMatch.index+lastCharaMatch[0].length;
var nl=gclOrigText.indexOf("\n",afterStart);
while(nl>=0&&gclOrigText.substring(0,nl).endsWith("\\")){nl=gclOrigText.indexOf("\n",nl+1);}
bundleInsertPos=nl>=0?nl+1:gclOrigText.length;}}
// Strategy 3: append at end if nothing else found
if(bundleInsertPos<0)bundleInsertPos=gclOrigText.length;

gclOrigText=gclOrigText.substring(0,bundleInsertPos)+bundleText+gclOrigText.substring(bundleInsertPos);

// Re-parse so the new procs/entities show up in the editor's panels
if(typeof parseGCLScript==="function"){parseGCLScript(gclOrigText);}
if(typeof parseProcList==="function"){parseProcList(gclOrigText);}

// The newly-inserted door+lamp will be picked up by parseGCLScript as proper entities.
// We DON'T add them to gclEntities manually anymore — that caused duplicate emission
// in buildGCLText.

// 3. Inject the HZM trap zone (auto-placed 4-wall box) into the editor's HZM state.
//    The user can later edit/redraw it via the existing zone editor.
//
// CRITICAL: HZD trap zones are 3D BOUNDING BOXES, not 2D rects. The engine's
// CheckTrapBounds (libhzd/trap.c) does:
//    if (pos->x < box->p1.x || pos->x >= box->p2.x ||
//        pos->z < box->p1.z || pos->z >= box->p2.z ||
//        pos->y < box->p1.y || pos->y >= box->p2.y)  return 0;
//
// The player's Y position MUST fall in [b1.y, b2.y). If b1.y == b2.y, the zone
// has zero vertical extent and the trap NEVER fires regardless of how big the
// X/Z extent is. This was the cause of all the "trap zone doesn't fire" symptoms —
// we were writing the same Y value to both top and bottom of the box.
//
// Vanilla trdoor2 has b1.y=4250, b2.y=6500 (a 2250-unit-tall trap volume).
// We give a 2000-unit-tall volume from door floor up, which covers any
// reasonable standing/crouching/jumping height.
// Stage-transition doors generate TWO zones (approach + cross). Standard doors
// generate one. We handle both via the unified hzmZones array.
var zonesToAdd=artifacts.hzmZones||(artifacts.hzmZone?[artifacts.hzmZone]:[]);
if(zonesToAdd.length>0&&typeof newZ!=="undefined"){
for(var hzi=0;hzi<zonesToAdd.length;hzi++){
var z=zonesToAdd[hzi];
var floorY=z.y||0;
var topY=floorY+2000;// 2000-unit-tall trap volume so the player's Y is always inside
newZ.push({
name:z.name,
x1:z.corners[0].x,z1:z.corners[0].z,y1:floorY,
x2:z.corners[2].x,z2:z.corners[2].z,y2:topY,
// h1/h2: the 4th short of each HZD_VEC corner. Engine doesn't read this for
// trap zones (CheckTrapBounds only uses x,z,y). Vanilla uses 0xFFFE as a
// historical marker. We match that for file structure consistency.
h1:0xFFFE,h2:0xFFFE,
// id1/id2: CRITICAL — id2=0xFF marks a CAMERA in HZD_MakeHandler scan.
// For trap zones, id2 MUST be != 0xFF. Vanilla traps use 0x00 (null-padded
// name) or 0x20 (space-padded). We use 0x00 to be safe.
id1:0x00,id2:0x00});}}
// 4. Refresh visuals
if(typeof rebuildGCLVis==="function")rebuildGCLVis();
if(typeof updateGCLPanel==="function")updateGCLPanel();
if(typeof rebuild==="function")rebuild();
if(typeof rebuildNavZones==="function")rebuildNavZones();
closeDoorWizard();
// Final user-facing summary
var msg="Door '"+doorWizState.name+"' added.\n\n";
msg+="Summary of what was created:\n";
for(var si=0;si<artifacts.summary.length;si++){
var s=artifacts.summary[si];
msg+="  "+(s.action==="create"?"+ ":"~ ")+s.what.replace(/<[^>]+>/g,"")+"\n";}
msg+="\nNext steps:\n";
msg+="• View the changes in ViewGCL\n";
msg+="• Test in-game — door should "+(doorWizState.keycardLevel>0?"require Lv"+doorWizState.keycardLevel+" keycard":"open for anyone")+"\n";
if(doorWizState.category==="stage-transition")msg+="• When you walk through the door, the game should load "+doorWizState.targetStage+"\n";
msg+="• ExpGCL + ExpHZM to write the changes to files";
alert(msg);}

// ==================== VISUAL PLACEMENT MODE ====================
// When the user clicks "Set in 3D" inside the door wizard:
//   1. We capture all current wizard state into doorWizState (already happens via captureStep2State())
//   2. Hide the wizard modal (don't destroy it — preserves form values)
//   3. Spawn a ghost door (a translucent green box) in the 3D scene at the
//      current position with the current rotation
//   4. Listen for mousemove on the canvas to update the ghost's position
//   5. Listen for 'S' key to confirm: copy ghost position to doorWizState.pos,
//      remove ghost, show modal again with updated values
//   6. Listen for 'Escape' to cancel: just remove ghost, show modal as-is

var _doorPlacementGhost=null;
var _doorPlacementListeners=null;
var _doorPlacementCoordOverlay=null;
var _doorPlacementOriginalPos=null;// snapshot for cancel
var _doorPlacementOriginalDirY=null;

function enterDoorPlacementMode(){
// Save current form values first so we don't lose them when we hide the modal
if(typeof captureStep2State==="function")captureStep2State();
// Pick up any user edits to the X/Y/Z inputs that captureStep2State might miss
var pxEl=document.getElementById("dwz_px"),pyEl=document.getElementById("dwz_py"),pzEl=document.getElementById("dwz_pz");
if(pxEl)doorWizState.pos.x=parseInt(pxEl.value)||0;
if(pyEl)doorWizState.pos.y=parseInt(pyEl.value)||0;
if(pzEl)doorWizState.pos.z=parseInt(pzEl.value)||0;
var dirEl=document.getElementById("dwz_dir");
if(dirEl)doorWizState.dirY=parseInt(dirEl.value)||0;
// Snapshot for cancel — must do this AFTER picking up form edits but BEFORE any
// mouse movement modifies the live values.
_doorPlacementOriginalPos={x:doorWizState.pos.x,y:doorWizState.pos.y,z:doorWizState.pos.z};
_doorPlacementOriginalDirY=doorWizState.dirY;
// Hide the wizard modal (but keep it in DOM so values persist)
var modal=document.getElementById("doorWizModal");
if(modal)modal.style.display="none";
// Create the ghost door — a translucent box approximating the door's footprint.
// Size: width = state.width (default 1500), height = 2000, depth = 200 (door is thin).
// Door's local axes: width = perpendicular to facing direction; depth = along facing.
if(!sc3){alert("3D scene not ready");return;}
var w=(doorWizState.width||1500)*S;
var depth=200*S;
var height=2000*S;
// Body of the ghost door — translucent green box
var geom=new THREE.BoxGeometry(w,height,depth);
var mat=new THREE.MeshBasicMaterial({color:0x44ff88,transparent:true,opacity:0.4,depthWrite:false});
_doorPlacementGhost=new THREE.Mesh(geom,mat);
// FRONT-FACE STRIPE: a bright red plane stuck onto the +Z face of the door so
// the "front" is immediately obvious from any angle. Slightly larger than the
// door's width/height so it visually wraps the front edge.
var stripeGeom=new THREE.PlaneGeometry(w*1.02,height*1.02);
var stripeMat=new THREE.MeshBasicMaterial({color:0xff3366,transparent:true,opacity:0.65,side:THREE.DoubleSide,depthWrite:false});
var stripe=new THREE.Mesh(stripeGeom,stripeMat);
stripe.position.set(0,0,depth*0.51);// just past the front face (+Z side)
_doorPlacementGhost.add(stripe);
// PROJECTING ARROW: a big cone pointing out the front of the door, well clear
// of the body so direction is unmistakable. ConeGeometry defaults to +Y pointing;
// we tilt it 90° around X so it points +Z (the door's local front).
var arrowLen=1200*S;
var arrowR=400*S;
var arrowGeom=new THREE.ConeGeometry(arrowR,arrowLen,8);
var arrowMat=new THREE.MeshBasicMaterial({color:0xff3366,transparent:true,opacity:0.9,depthWrite:false});
var arrow=new THREE.Mesh(arrowGeom,arrowMat);
arrow.position.set(0,0,depth*0.5+arrowLen*0.5+100*S);// floats just past front face (+Z side)
arrow.rotation.x=Math.PI/2;// point along +Z (matches the KMD door's visible/textured face)
_doorPlacementGhost.add(arrow);
// Edge wireframe on the box body to make the door outline pop
var edges=new THREE.EdgesGeometry(geom);
var edgesMat=new THREE.LineBasicMaterial({color:0x88ffaa});
var edgesObj=new THREE.LineSegments(edges,edgesMat);
_doorPlacementGhost.add(edgesObj);
// Set initial position and rotation
_updateGhostTransform();
sc3.add(_doorPlacementGhost);
// Build a small overlay div for live coordinate display + instructions
_doorPlacementCoordOverlay=document.createElement("div");
_doorPlacementCoordOverlay.id="doorPlacementOverlay";
_doorPlacementCoordOverlay.style.cssText="position:fixed;top:50px;left:50%;transform:translateX(-50%);background:rgba(10,30,20,0.95);color:#88ffaa;border:1px solid #44aa66;padding:8px 14px;border-radius:4px;font-family:monospace;font-size:12px;z-index:10000;pointer-events:none;text-align:center;line-height:1.5";
_doorPlacementCoordOverlay.innerHTML='<b style="color:#88ffaa">📍 Door Placement Mode</b><br>'+
'<span id="dwz_liveCoords">X='+doorWizState.pos.x+' Y='+doorWizState.pos.y+' Z='+doorWizState.pos.z+'</span><br>'+
'<span style="font-size:10px;color:#aabbcc">Move mouse to position • <b style="color:#88ffaa">S</b> = confirm • <b style="color:#ff8888">Esc</b> = cancel • <b style="color:#aabbcc">R</b> = rotate 90°</span>';
document.body.appendChild(_doorPlacementCoordOverlay);
// Attach listeners
var vp=document.getElementById("viewport")||document.querySelector("canvas");
var onMove=function(e){
if(typeof gPt!=="function")return;
var pt=gPt(e);
if(!pt)return;
// Snap to existing wall/floor endpoints if available
var snapped=(typeof snapPt==="function")?snapPt(pt.x,pt.z):{x:pt.x,z:pt.z};
doorWizState.pos.x=Math.round(snapped.x/S);
doorWizState.pos.z=Math.round(snapped.z/S);
_updateGhostTransform();
var lc=document.getElementById("dwz_liveCoords");
if(lc)lc.textContent="X="+doorWizState.pos.x+" Y="+doorWizState.pos.y+" Z="+doorWizState.pos.z;};
var onKey=function(e){
if(e.key==="s"||e.key==="S"){
e.preventDefault();
exitDoorPlacementMode(true);}
else if(e.key==="Escape"){
e.preventDefault();
exitDoorPlacementMode(false);}
else if(e.key==="r"||e.key==="R"){
e.preventDefault();
// Rotate 90° clockwise: 0 → 1024 → 2048 → 3072 → 0
doorWizState.dirY=(doorWizState.dirY+1024)%4096;
_updateGhostTransform();
var lc=document.getElementById("dwz_liveCoords");
if(lc)lc.textContent="X="+doorWizState.pos.x+" Y="+doorWizState.pos.y+" Z="+doorWizState.pos.z+" (facing dirY="+doorWizState.dirY+")";}};
if(vp)vp.addEventListener("mousemove",onMove);
document.addEventListener("keydown",onKey);
_doorPlacementListeners={vp:vp,onMove:onMove,onKey:onKey};}

function _updateGhostTransform(){
if(!_doorPlacementGhost)return;
_doorPlacementGhost.position.set(doorWizState.pos.x*S,(doorWizState.pos.y+1000)*S,doorWizState.pos.z*S);
// Rotate to match how the actual door entity is rendered in rebuildGCLVis():
//   rebuildGCLVis uses `rotation.y = dirY * 2π/4096` (no negation).
// Previously the ghost negated this, putting the front-face arrow on the wrong
// side: e.g. dirY=1024 (East) → arrow pointed West. Removing the negation
// makes the ghost's facing direction match the in-game door's facing.
_doorPlacementGhost.rotation.y=doorWizState.dirY*(Math.PI*2/4096);}

function exitDoorPlacementMode(confirmed){
// On CANCEL: restore the snapshot we took on entry, so the user's typed values
// (or whatever they had before) come back. On CONFIRM: keep the current live
// values (mouse position last hovered).
if(!confirmed&&_doorPlacementOriginalPos){
doorWizState.pos.x=_doorPlacementOriginalPos.x;
doorWizState.pos.y=_doorPlacementOriginalPos.y;
doorWizState.pos.z=_doorPlacementOriginalPos.z;
doorWizState.dirY=_doorPlacementOriginalDirY;}
_doorPlacementOriginalPos=null;
_doorPlacementOriginalDirY=null;
// Remove ghost
if(_doorPlacementGhost&&sc3){
sc3.remove(_doorPlacementGhost);
if(_doorPlacementGhost.geometry)_doorPlacementGhost.geometry.dispose();
_doorPlacementGhost=null;}
// Remove overlay
if(_doorPlacementCoordOverlay){_doorPlacementCoordOverlay.remove();_doorPlacementCoordOverlay=null;}
// Remove event listeners
if(_doorPlacementListeners){
if(_doorPlacementListeners.vp)_doorPlacementListeners.vp.removeEventListener("mousemove",_doorPlacementListeners.onMove);
document.removeEventListener("keydown",_doorPlacementListeners.onKey);
_doorPlacementListeners=null;}
// Show the modal again (re-render to pick up new pos values)
var modal=document.getElementById("doorWizModal");
if(modal)modal.style.display="";// restore to default display
if(typeof renderDoorWizard==="function")renderDoorWizard();}

// ==================== EDIT EXISTING ELEVATOR ====================
//
// Workflow:
//   Step 1 (already wired): user picks "Edit Existing Elevator" → we detect
//     vanilla elevators and stash them in doorWizState.editElevator.
//   Step 2 (this file):    show editable floor list + add-floor button
//   Step 3 (preview):      show diff of GCL changes that will be made
//   commit:                actually rewrite the GCL load procs in place
//
// Edits we support:
//   - Change a floor's target stage         (modify `load "sXXa"` in the load proc)
//   - Change a floor's Snake spawn coords   (modify $w:snake_pos_x/y/z lines)
//   - Convert a "stay" floor to a "load" floor (generate new floor proc + load proc, link)
//   - Convert a "load" floor back to "stay" (clear the floor proc body)
//   - Add a brand new floor up to count=4   (bump -n in panel, extend -e proc list)

function renderEditElevatorStep2(){
var stages=["s00a","s01a","s02a","s02b","s02c","s02d","s02e","s03a","s03b","s03c","s03d","s03e",
"s04a","s04b","s04c","s05a","s06a","s07a","s07b","s07c","s08a","s08b","s08c","s09a","s10a",
"s11a","s11b","s11c","s11d","s11e","s11g","s11h","s11i","s12a","s12b","s12c","s13a","s14e",
"s15a","s15b","s15c","s16a","s16b","s16c","s16d","s17a","s18a","s19a","s19b","s20a"];
var ed=doorWizState.editElevator;
if(!ed||!ed.elevators||ed.elevators.length===0){
return'<div style="color:#ff8888">No elevator data — please go back and try again.</div>';}
var elev=ed.elevators[ed.selectedIdx||0];

var html='<div style="margin-bottom:10px"><button onclick="doorWizBack()" class="btn">← Back</button> <span style="color:#88ddaa"><b>Step 2: Edit Existing Elevator</b></span></div>';

// Context panel
html+='<div style="margin-bottom:8px;padding:8px;background:#0a2a1a;border-left:3px solid #44cc88;font-size:10px;color:#aabbcc">';
html+='<b style="color:#88ddaa">Elevator detected: <code>'+elev.name+'</code></b><br>';
html+='Linked door: <code>'+(elev.doorName||"(none)")+'</code><br>';
html+='Floor count: '+elev.floorCount;
if(elev.panelPos)html+=' | Panel position: ('+elev.panelPos.x+', '+elev.panelPos.y+', '+elev.panelPos.z+')';
html+='</div>';

// Multi-elevator picker (rare — most stages have only one)
if(ed.elevators.length>1){
html+='<div style="margin-bottom:8px;padding:8px;background:#211a0a;border-radius:3px">';
html+='<b style="color:#ffcc88;font-size:11px">Multiple elevators found</b><br>';
var elevatorOpts=ed.elevators.map(function(e,i){return{value:i,label:e.name+" ("+e.floorCount+" floors)"};});
html+=selectRow("Editing","dwz_editElevIdx",elevatorOpts,ed.selectedIdx||0,"Which elevator to edit.","onDoorWizEditElevatorPick()");
html+='</div>';}

// Per-floor editor
html+='<div style="margin-bottom:8px;padding:8px;background:#211a0a;border-radius:3px">';
html+='<b style="color:#ffcc88;font-size:11px">Floor Buttons</b><br>';
html+='<span style="font-size:10px;color:#aabbcc">Each floor button can either stay here (no stage load) or load a target stage with Snake spawning at given coordinates.</span><br>';

for(var fi=0;fi<ed.editedFloorCount;fi++){
var f=ed.editedFloors[fi]||{kind:"stay",procName:"(none)",targetStage:"(stay)",spawnX:0,spawnY:0,spawnZ:0};
var isStay=(f.kind==="stay"||f.targetStage==="(stay)"||!f.targetStage);
html+='<div style="margin-top:6px;padding:6px;background:#0a0e14;border-left:3px solid '+(isStay?"#666":"#88ddaa")+';border-radius:2px">';
html+='<b style="color:'+(isStay?"#aabbcc":"#88ffaa")+';font-size:10px">Floor '+fi+'</b> ';
html+='<span style="color:#778;font-size:9px">';
if(f.procName)html+='(proc: <code>'+f.procName+'</code>';
if(f.loadProcName)html+=' → <code>'+f.loadProcName+'</code>';
if(f.procName)html+=')';
html+='</span><br>';
// Stay/Load toggle
html+=selectRow("Behavior","dwz_editFloor"+fi+"_mode",[
{value:"stay",label:"Stay here (close menu, no stage load)"},
{value:"load",label:"Load target stage"}],isStay?"stay":"load","","onDoorWizEditFloorModeChange("+fi+")");
if(!isStay){
var stagesOpts=stages.map(function(s){return{value:s,label:s};});
html+=selectRow("Target stage","dwz_editFloor"+fi+"_stage",stagesOpts,f.targetStage,"Stage to load when this floor is selected.");
html+='<div style="display:flex;gap:8px;margin-bottom:3px;align-items:center">';
html+='<span style="color:#88aacc;font-size:9px;width:120px">Snake spawn:</span>';
html+='<div><span style="color:#88aacc;font-size:9px">X:</span> <input type="number" id="dwz_editFloor'+fi+'_spawnX" value="'+f.spawnX+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='<div><span style="color:#88aacc;font-size:9px">Y:</span> <input type="number" id="dwz_editFloor'+fi+'_spawnY" value="'+f.spawnY+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='<div><span style="color:#88aacc;font-size:9px">Z:</span> <input type="number" id="dwz_editFloor'+fi+'_spawnZ" value="'+f.spawnZ+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-family:monospace;width:70px;font-size:10px"></div>';
html+='</div>';}
html+='</div>';}

// Add floor button — only if count < 4 (vanilla cap)
if(ed.editedFloorCount<4){
html+='<button onclick="addElevatorFloor()" style="margin-top:8px;background:#1a3a2a;color:#88ddaa;border:1px solid #2a5a4a;padding:6px 12px;cursor:pointer;font-family:monospace;font-size:11px">+ Add Floor (currently '+ed.editedFloorCount+'/4)</button>';
}else{
html+='<div style="margin-top:8px;font-size:10px;color:#778">Max 4 floors reached.</div>';}
html+='</div>';

html+='<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">';
html+='<button onclick="doorWizBack()" class="btn">← Back</button>';
html+='<button onclick="doorWizGoToPreview()" class="btn" style="background:#1a4a3a;color:#88ddaa;border:1px solid #2a6a5a">Preview Changes →</button>';
html+='</div>';
return html;}

// Event handlers
function onDoorWizEditElevatorPick(){
captureEditElevatorState();
var idx=parseInt(document.getElementById("dwz_editElevIdx").value)||0;
var ed=doorWizState.editElevator;
ed.selectedIdx=idx;
var elev=ed.elevators[idx];
ed.editedFloors=elev.floors.map(function(f){
return{kind:f.kind,procName:f.procName,loadProcName:f.loadProcName||null,
targetStage:f.targetStage||"(stay)",
spawnX:f.spawnX||0,spawnY:f.spawnY||0,spawnZ:f.spawnZ||0};});
ed.editedFloorCount=elev.floorCount;
renderDoorWizard();}

function onDoorWizEditFloorModeChange(fi){
captureEditElevatorState();
var ed=doorWizState.editElevator;
var newMode=document.getElementById("dwz_editFloor"+fi+"_mode").value;
if(newMode==="stay"){
ed.editedFloors[fi].kind="stay";
ed.editedFloors[fi].targetStage="(stay)";
}else{
ed.editedFloors[fi].kind="load";
if(!ed.editedFloors[fi].targetStage||ed.editedFloors[fi].targetStage==="(stay)"){
ed.editedFloors[fi].targetStage="s01a";}}
renderDoorWizard();}

function addElevatorFloor(){
captureEditElevatorState();
var ed=doorWizState.editElevator;
if(ed.editedFloorCount>=4)return;
ed.editedFloorCount++;
ed.editedFloors.push({
kind:"load",procName:null,loadProcName:null,
targetStage:"s01a",spawnX:0,spawnY:0,spawnZ:0});
renderDoorWizard();}

// Capture form state into doorWizState.editElevator.editedFloors
function captureEditElevatorState(){
var ed=doorWizState.editElevator;
if(!ed)return;
var f=function(id){return document.getElementById(id);};
for(var fi=0;fi<ed.editedFloorCount;fi++){
var floor=ed.editedFloors[fi];
if(!floor)continue;
var modeEl=f("dwz_editFloor"+fi+"_mode");
if(modeEl){
var mode=modeEl.value;
floor.kind=(mode==="stay")?"stay":"load";
if(mode==="stay")floor.targetStage="(stay)";}
var stageEl=f("dwz_editFloor"+fi+"_stage");
if(stageEl)floor.targetStage=stageEl.value;
var sxEl=f("dwz_editFloor"+fi+"_spawnX");
if(sxEl)floor.spawnX=parseInt(sxEl.value)||0;
var syEl=f("dwz_editFloor"+fi+"_spawnY");
if(syEl)floor.spawnY=parseInt(syEl.value)||0;
var szEl=f("dwz_editFloor"+fi+"_spawnZ");
if(szEl)floor.spawnZ=parseInt(szEl.value)||0;}}

// ==================== EDIT-ELEVATOR ARTIFACT GENERATOR ====================
//
// Doesn't generate new entities. Instead computes a list of in-place text edits
// to apply to the GCL: changes to load procs (target stage + spawn coords),
// modifications to the ELEVATOR_PANEL flags (if floor count grew), and brand
// new procs (if any "stay" floors were converted to "load" or a floor was added).
//
// Output:
//   out.gclEdits = {
//     editedLoadProcs: [{name, newSrc}, ...],   // replace existing proc bodies
//     newProcs: [{name, src}, ...],              // append new procs for added floors
//     panelEdits: {oldEntity, newEntity},        // replace ELEVATOR_PANEL block (if changed)
//     summary: [...]
//   }
function _genEditElevator(state,report,out){
var ed=state.editElevator;
if(!ed||!ed.elevators||ed.elevators.length===0){
out.summary.push({action:"error",what:"<b>No elevator to edit</b>",detail:"No elevator data captured."});
return;}
var elev=ed.elevators[ed.selectedIdx||0];
var edits={editedLoadProcs:[],newProcs:[],panelEdits:null,summary:[]};

// For each floor, decide what to do:
//   - If unchanged → skip
//   - If load proc target/spawn changed → edit existing load proc
//   - If was "stay" but now "load" → generate new floor proc + load proc, will need panel re-emission
//   - If was "load" but now "stay" → clear the floor proc body
//   - New floor (index >= original count) → generate new floor proc + load proc
var origFloorCount=elev.floorCount;
var origFloors=elev.floors;
var panelChanged=false;
var newFloorProcNames=[];// what the panel's -e flag will list after edits

for(var fi=0;fi<ed.editedFloorCount;fi++){
var newF=ed.editedFloors[fi];
var origF=origFloors[fi];// may be undefined if this is a NEW floor

if(!origF){
// Brand new floor — need to generate proc names + procs
panelChanged=true;
if(newF.kind==="stay"||newF.targetStage==="(stay)"){
var emptyPN=reserveNextProcNumber();
var emptyName="unknownProc"+emptyPN;
edits.newProcs.push({name:emptyName,src:"proc "+emptyName+" {\n}"});
newFloorProcNames.push(emptyName);
edits.summary.push({action:"create",what:"<b>New floor "+fi+" (stay)</b>",
detail:"Added empty proc "+emptyName+" — selecting this floor just closes the menu."});}
else{
var loadPN=reserveNextProcNumber();
var loadName="unknownProc"+loadPN;
edits.newProcs.push({name:loadName,src:_makeLoadProcSrc(loadName,newF.targetStage,newF.spawnX,newF.spawnY,newF.spawnZ)});
var floorPN=reserveNextProcNumber();
var floorName="unknownProc"+floorPN;
edits.newProcs.push({name:floorName,src:_makeFloorProcSrc(floorName,loadName)});
newFloorProcNames.push(floorName);
edits.summary.push({action:"create",what:"<b>New floor "+fi+" → "+newF.targetStage+"</b>",
detail:"Added "+floorName+" + "+loadName+". Loads "+newF.targetStage+" at ("+newF.spawnX+","+newF.spawnY+","+newF.spawnZ+")."});}
continue;}

// Existing floor — preserve its proc name in the panel's -e list
newFloorProcNames.push(origF.procName);

if(origF.kind==="stay"){
if(newF.kind==="stay"){
// No change
continue;}
// stay → load: generate a new load proc, rewrite the floor proc to call it
var loadPN2=reserveNextProcNumber();
var loadName2="unknownProc"+loadPN2;
edits.newProcs.push({name:loadName2,src:_makeLoadProcSrc(loadName2,newF.targetStage,newF.spawnX,newF.spawnY,newF.spawnZ)});
edits.editedLoadProcs.push({name:origF.procName,newSrc:_makeFloorProcSrc(origF.procName,loadName2)});
edits.summary.push({action:"create",what:"<b>Floor "+fi+": stay → load "+newF.targetStage+"</b>",
detail:"Rewrote "+origF.procName+" to chain into new load proc "+loadName2});
continue;}

// origF was a "load" floor
if(newF.kind==="stay"){
// load → stay: clear the floor proc body, leave load proc orphaned
edits.editedLoadProcs.push({name:origF.procName,newSrc:"proc "+origF.procName+" {\n}"});
edits.summary.push({action:"modify",what:"<b>Floor "+fi+": load → stay</b>",
detail:"Cleared "+origF.procName+" body. (Orphan load proc "+origF.loadProcName+" left in place; harmless.)"});
continue;}

// Both load — check if anything actually changed
var changed=(newF.targetStage!==origF.targetStage||
newF.spawnX!==origF.spawnX||
newF.spawnY!==origF.spawnY||
newF.spawnZ!==origF.spawnZ);
if(!changed)continue;
// Edit the load proc in place
edits.editedLoadProcs.push({
name:origF.loadProcName,
newSrc:_makeLoadProcSrc(origF.loadProcName,newF.targetStage,newF.spawnX,newF.spawnY,newF.spawnZ,
/*preserveCallToProc4=*/true)});
var diffs=[];
if(newF.targetStage!==origF.targetStage)diffs.push("target: "+origF.targetStage+" → "+newF.targetStage);
if(newF.spawnX!==origF.spawnX)diffs.push("spawnX: "+origF.spawnX+" → "+newF.spawnX);
if(newF.spawnY!==origF.spawnY)diffs.push("spawnY: "+origF.spawnY+" → "+newF.spawnY);
if(newF.spawnZ!==origF.spawnZ)diffs.push("spawnZ: "+origF.spawnZ+" → "+newF.spawnZ);
edits.summary.push({action:"modify",what:"<b>Floor "+fi+": "+origF.loadProcName+" updated</b>",
detail:diffs.join("; ")});}

// Did the floor count change? If yes, we have to rewrite the ELEVATOR_PANEL's -n and -e flags.
if(ed.editedFloorCount!==origFloorCount||panelChanged){
edits.panelEdits={
elevatorName:elev.name,
newFloorCount:ed.editedFloorCount,
newFloorProcNames:newFloorProcNames};
edits.summary.push({action:"modify",what:"<b>chara ELEVATOR_PANEL "+elev.name+"</b>",
detail:"Updated -n to "+ed.editedFloorCount+", -e to: "+newFloorProcNames.join(" ")});}

if(edits.editedLoadProcs.length===0&&edits.newProcs.length===0&&!edits.panelEdits){
edits.summary.push({action:"reuse",what:"<b>No changes</b>",
detail:"Nothing was modified. Click Back to make changes."});}

out.gclEdits=edits;
out.summary=edits.summary;

// Build preview text
var previewParts=[];
if(edits.editedLoadProcs.length>0){
previewParts.push("# === Modified procs (REPLACE in place) ===");
for(var ei=0;ei<edits.editedLoadProcs.length;ei++){
previewParts.push("# Replace existing "+edits.editedLoadProcs[ei].name+" with:");
previewParts.push(edits.editedLoadProcs[ei].newSrc);}}
if(edits.newProcs.length>0){
previewParts.push("# === New procs (APPEND) ===");
for(var ni=0;ni<edits.newProcs.length;ni++){
previewParts.push(edits.newProcs[ni].src);}}
if(edits.panelEdits){
previewParts.push("# === ELEVATOR_PANEL flag changes ===");
previewParts.push("# -n: change to "+edits.panelEdits.newFloorCount);
previewParts.push("# -e: change to "+edits.panelEdits.newFloorProcNames.join(" "));}
out.gclPreview=previewParts.join("\n\n");}

// Helper: build a load-proc source body that matches vanilla pattern.
// If preserveCallToProc4 is true, includes the `call(unknownProc4)` line that
// vanilla s02a's unknownProc7/8 have (it increments a counter — harmless to keep
// but technically optional).
function _makeLoadProcSrc(procName,targetStage,sx,sy,sz,preserveCallToProc4){
var lines=["proc "+procName+" {"];
if(preserveCallToProc4)lines.push("    call(unknownProc4)");
lines.push("    eval($f:000001 = false)");
// Use MGS's "-(NNNN)" format for negative coords, matching vanilla style
var fmt=function(v){return v<0?"-("+(-v)+")":String(v);};
lines.push("    eval($w:snake_pos_x = "+fmt(sx)+")");
lines.push("    eval($w:snake_pos_y = "+fmt(sy)+")");
lines.push("    eval($w:snake_pos_z = "+fmt(sz)+")");
lines.push("    eval($w:000002 = 0)");
lines.push("    eval($w:000004 = 0)");
lines.push("    load \""+targetStage+"\" \\");
lines.push("        -map   main \\");
lines.push("        -s     2");
lines.push("}");
return lines.join("\n");}

// Helper: build a floor-proc body (the elevator-ding + call(loadProc) pattern)
function _makeFloorProcSrc(procName,loadProcName){
var lines=["proc "+procName+" {"];
lines.push("    call(unknownProc2)");
lines.push("    eval($w:000088 = stack:1)");
lines.push("    eval($f:030081 = true)");
lines.push("    sound \\");
lines.push("        -x     snd:01ffff06");
lines.push("    eval($b:0002e6 = 0)");
lines.push("    call("+loadProcName+")");
lines.push("}");
return lines.join("\n");}

// ==================== APPLY ELEVATOR EDITS ====================
// Performs the actual text-replacement on gclText based on the edits computed
// by _genEditElevator. Returns the modified GCL.
//
// Edits applied in this order:
//   1. Replace each edited proc body in place
//   2. Append new procs at the end of the proc region (just before the first
//      non-proc statement after the procs)
//   3. Modify the ELEVATOR_PANEL's -n and -e flags (operates on both copies
//      if vanilla declared it inside an if/else block)
function _applyElevatorEdits(gclText,edits){
// === 1. Replace existing proc bodies ===
// Use brace-counting (not regex) because vanilla elevator procs frequently
// contain if/else with their own braces. A non-greedy regex stops at the
// FIRST `}` (the if-block close), leaving the else branch dangling outside
// the proc. That's the "new stage code is in the file but doesn't load"
// bug — the load you set ended up inside a truncated branch.
for(var i=0;i<edits.editedLoadProcs.length;i++){
var item=edits.editedLoadProcs[i];
var headerRe=new RegExp("(^|\\n)proc\\s+"+item.name+"\\s*\\{","");
var hm=gclText.match(headerRe);
if(hm){
var startOfProc=hm.index+(hm[1]?1:0);
var openBrace=gclText.indexOf("{",hm.index);
// Brace-count to find the matching close
var depth=1,p=openBrace+1;
while(p<gclText.length&&depth>0){
var c=gclText.charCodeAt(p);
if(c===123)depth++;
else if(c===125)depth--;
p++;}
if(depth===0){
gclText=gclText.substring(0,startOfProc)+item.newSrc+gclText.substring(p);
}else{
// Unclosed brace — bail rather than corrupt file. Append as fallback.
gclText+="\n\n"+item.newSrc+"\n";}
}else{
// Proc not found — append as a safety measure
gclText+="\n\n"+item.newSrc+"\n";}}

// === 2. Append new procs ===
if(edits.newProcs.length>0){
var newProcText="\n\n# ----- New procs from Edit Elevator -----\n";
for(var j=0;j<edits.newProcs.length;j++){
newProcText+=edits.newProcs[j].src+"\n\n";}
newProcText+="# ----- End new procs -----\n";
// Insert at the end of the proc region — find the last `^proc ...` block and
// insert after its closing brace.
var lastProcRe=/(?:^|\n)proc\s+\w+\s*\{[\s\S]*?\n\}/g;
var lastMatch=null,m;
while((m=lastProcRe.exec(gclText))!==null)lastMatch=m;
if(lastMatch){
var insertAt=lastMatch.index+lastMatch[0].length;
gclText=gclText.substring(0,insertAt)+newProcText+gclText.substring(insertAt);
}else{
// No procs found — prepend to file
gclText=newProcText+"\n"+gclText;}}

// === 3. Modify ELEVATOR_PANEL flags ===
if(edits.panelEdits){
var pe=edits.panelEdits;
var name=pe.elevatorName;
// Vanilla may declare the panel multiple times (in if/else). Replace ALL occurrences.
// Match a full ELEVATOR_PANEL block: from `chara ELEVATOR_PANEL <name>` to
// the line that doesn't end in `\` (the closing line of the chara declaration).
var panelRe=new RegExp("(chara\\s+ELEVATOR_PANEL\\s+"+name+"[\\s\\S]*?)(\\n(?!.*\\\\\\s*$))","g");
gclText=gclText.replace(panelRe,function(match,body,tail){
// Update -n value
body=body.replace(/(-n\s+)\d+/,"$1"+pe.newFloorCount);
// Update -e value (multi-word) — preserve the trailing `\` line-continuation
body=body.replace(/(-e\s+)(?:\w+\s*)+?(\\?)(\s*\n)/,function(m,prefix,bs,nl){
return prefix+pe.newFloorProcNames.join(" ")+" "+bs+nl;});
return body+tail;});}

return gclText;}

// ============================================================
