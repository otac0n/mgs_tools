// ═══════════════════════════════════════════════════════════════════════════
// FILE: 12_entity_templates.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// ENTITY TEMPLATES — catalog of spawnable entity types
// ============================================================
// Derived from analyzing all 50 vanilla MGS1 GCL scripts. For each entity type
// this records:
//   - parameter signature (which -X flags it accepts, with type hints)
//   - infrastructure requirements (callback procs, COMMAND block, etc.)
//   - source stages (where the entity natively appears — useful for asset extraction)
//   - asset dependencies (model hash and texture-DAR hints, where known)
//
// The goal: let users spawn entities from one stage into another (e.g. dogs from
// the cave into the heliport) while making it obvious what additional assets need
// to be imported and what GCL infrastructure must be injected first.

// Each param: {name, type, default, description, required?}
// Types are advisory hints for the UI, not strictly enforced.
//   "int"           - single integer
//   "float"         - single float
//   "string"        - free-form (e.g. variable reference, proc name)
//   "proc"          - name of an existing proc in the GCL
//   "var"           - GCL variable reference like $f:050243, $w:0003e0, $b:foo
//   "vec3"          - "x,y,z" position triple
//   "vec3-list"     - whitespace-separated list of vec3s (used for patrol patterns)
//   "route"         - integer index into the HZM route table
//   "int-list"      - whitespace-separated list of ints (used for animation tables)
//   "char"          - single character in single-quotes (e.g. 'X', 'Z')
//   "model"         - model name (resolves to a hash for asset lookup)
//   "bool"          - true/false
//   "snd"           - sound reference (t:vc..., snd:ff...)
var ENTITY_TEMPLATES={

//================== GUARDS / AI ENEMIES ==================

WATCHER:{
description:"Standard patrol guard. Walks routes, has vision cone, raises alert on detection.",
category:"enemy",
infrastructure:{
needsCommand:true,// requires a 'chara COMMAND' block with -nWatcher listing the spawn proc
needsRoutes:true,// HZM must have route definitions with waypoints
needsCallbackProcs:["exec"],// -exec usually points to a callback proc
needsNavZones:true},// engine uses HZD nav zones for pathfinding
sourceStages:["00a","01a","02a","02b","04b","08b","11a","18a"],
modelHashHint:"genome",// uses generic genome soldier model from stg_mdl1.dar
callbackStubs:{
exec:{kind:"proc",body:"eval($f:STATEFLAG = true)",
description:"Detection/special-event callback. Vanilla pattern: set a global flag.",
allocateFlag:"STATEFLAG"}},
params:[
{name:"route",type:"route",default:0,required:true,description:"Patrol route index this guard walks (must exist + have waypoints)"},
{name:"n",type:"vec3",default:"0,0,0",required:true,description:"Spawn position X,Y,Z (MGS units). This is the position the engine uses; -pos is ignored for WATCHERs."},
{name:"life",type:"int",default:192,description:"Max HP (vanilla default 192, NOT 128)"},
{name:"f",type:"int",default:7,description:"Faint threshold (HP below which guard collapses)"},
{name:"s",type:"int",default:227,description:"Size bonus (227 ≈ typical adult)"},
{name:"b",type:"char",default:"'X'",description:"Blood type ('X'=standard splatter, 'Z'=none)"},
{name:"a",type:"char",default:"'A'",description:"Area type ('A'=default, 'S'=snow shows white breath)"},
{name:"y",type:"int",default:1,description:"Y-flag (vertical hint, typically 1)"}]},

ZAKO10:{
description:"Snow-field soldier (Sniper Wolf area). Specialized guard variant for stage 10.",
category:"enemy",
infrastructure:{
needsCommand:true,
needsRoutes:true,
needsCallbackProcs:["f","n"]},
sourceStages:["10a"],
params:[
{name:"r",type:"route",default:0,required:true,description:"Route index"},
{name:"b",type:"char",default:"'X'",description:"Blood type"},
{name:"f",type:"int",default:7,description:"Faint level"},
{name:"n",type:"int",default:29,description:"Health/N value"}]},

ZAKO11A:{
description:"Communications tower (ascent) soldier — climbing stairs AI variant.",
category:"enemy",
infrastructure:{needsCommand:true,needsRoutes:true},
sourceStages:["11a"],
params:[
{name:"r",type:"route",default:0,required:true,description:"Route index"},
{name:"n",type:"int",default:0,description:"N flag"},
{name:"l",type:"var",default:"$w:00041c",description:"Live-state variable"},
{name:"z",type:"var",default:"$w:00041e",description:"Z-state variable"}]},

ZAKO14:{
description:"Snowfield Day 2 soldier — variant of ZAKO10 with Y-flag.",
category:"enemy",
infrastructure:{needsCommand:true,needsRoutes:true},
sourceStages:["14e"],
params:[
{name:"r",type:"route",default:0,required:true,description:"Route index"},
{name:"n",type:"int",default:0,description:"N flag"},
{name:"y",type:"int",default:1,description:"Y-flag"},
{name:"l",type:"var",default:"$w:00041c",description:"Live-state variable"},
{name:"z",type:"var",default:"$w:00041e",description:"Z-state variable"}]},

DOG:{
description:"Patrol dog (cave stage). Simpler AI than WATCHER — no COMMAND needed.",
category:"enemy",
infrastructure:{
needsCommand:false,// confirmed by analysis: DOG works without COMMAND
needsRoutes:true,
needsCallbackProcs:["h","o"],// kill-handler and finalizer
needsStateVar:true},// -b points to a state variable
sourceStages:["09a","12c"],
modelHashHint:"dog0",// hash 0xc943 = mgsHash("dog0")
assetNotes:"Model + textures live in s09a's stg_mdl1.dar and stg_tex1.dar. Hash 0xc943 = 'dog0' instance.",
// Per-param stub generators. When the wizard's auto-stub option is enabled, it creates
// a fresh proc for each callback param and a fresh state-var slot for state params.
// `body` is the GCL body of the stub proc (a single eval statement matching vanilla pattern).
// `linkedTo` lets the body reference another field's auto-allocated value (e.g. the
// kill-finalizer's body needs to write into the same state-var the entity uses).
callbackStubs:{
h:{kind:"proc",body:"eval($f:STATEFLAG = true)",
description:"Kill-confirm proc (called when dog is killed). Sets a global flag so other procs can react.",
allocateFlag:"STATEFLAG"},// the wizard substitutes STATEFLAG with a freshly-allocated $f: var
o:{kind:"proc",body:"eval(STATEVAR = stack:1)",
description:"Finalizer proc (called after kill animation). Saves which dog of the pack died.",
linkedTo:"b"},// substitutes STATEVAR with the value of the -b param
b:{kind:"statevar",default:"$b:0003e0",
description:"Per-pack state variable. Each DOG instance should use a unique $b: slot."}},
params:[
{name:"r",type:"int-list",default:"1 2",required:true,description:"Route range (start end)"},
{name:"s",type:"int",default:0,description:"Speed/state flag"},
{name:"d",type:"int",default:3,description:"Difficulty/aggression"},
{name:"h",type:"proc",default:"",required:true,description:"Kill handler proc (called when dog is killed)"},
{name:"b",type:"var",default:"$b:0003e0",required:true,description:"State variable to track"},
{name:"o",type:"proc",default:"",required:true,description:"On-death finalizer proc"},
{name:"c",type:"int",default:0,description:"Continuation flag"}]},

// (WOLF2, NINJA, HIND removed from catalog per user request — wolf2 and named bosses
// are stage-specific and require significant additional work to transplant; not in the
// wizard since user prefers a focused catalog.)


//================== ANIMALS / NPCs ==================

CROW:{
description:"Crow flock. Used in atmospheric stages (s15a Caves, etc.)",
category:"animal",
infrastructure:{needsCallbackProcs:["i"]},
sourceStages:["15a","15c"],
modelHashHint:"crow",
callbackStubs:{
i:{kind:"proc",body:"eval($w:STATEVAR = $w:STATEVAR + 1)",
description:"Disturb-counter proc (called when player disturbs the flock). Increments a counter.",
allocateWord:"STATEVAR"}},
params:[
{name:"n",type:"int",default:4,required:true,description:"Number of crows in flock"},
{name:"s",type:"vec3-list",default:"-9000,4000,-6000  9000,7000,9000",required:true,description:"Bounding box corners (2 vec3s)"},
{name:"i",type:"proc",default:"",description:"Interact callback"}]},

MOUSE:{
description:"Wandering mouse. Used in cave/lab atmosphere (s00a, s10a, s13a).",
category:"animal",
infrastructure:{needsRoutes:true},// uses -nRoute
sourceStages:["00a","10a","13a"],
modelHashHint:"mouse",
params:[
{name:"nRoute",type:"route",default:1,required:true,description:"Route index for mouse"},
{name:"m",type:"int",default:2,description:"M flag"},
{name:"r",type:"int",default:380,description:"R range"},
{name:"l",type:"int",default:36,description:"L flag"},
{name:"d",type:"int",default:1,description:"D flag"}]},

CAT_IN:{
description:"Rat indoor — most common atmospheric animal. Used in dozens of stages.",
category:"animal",
sourceStages:["00a","01a","02a","02b","02c","03a","04a","04b","04c","05a","08b","11a","12a","13a","16a","18a","20a"],
modelHashHint:"cat",
params:[
{name:"c",type:"vec3-list",default:"0,0,0  100,100,100",required:true,description:"Bounding region (two corner positions)"},
{name:"a",type:"int",default:320,description:"A value"},
{name:"t",type:"int",default:90,description:"T value"}]},

HIYOKO:{
description:"Chick — appears only in s03a (cells/torture room area). Used as easter egg.",
category:"animal",
sourceStages:["03a","03d","03e"],
modelHashHint:"hiyoko",
params:[
{name:"p",type:"vec3",default:"11750,350,-500",required:true,description:"Spawn position"}]},

//================== STAGE PROPS ==================

OBSTACLE:{
description:"Static visible object (boxes, crates, scenery). Most common entity by far.",
category:"prop",
sourceStages:["all"],// in basically every stage
params:[
{name:"model",type:"model",default:"01a_o00",required:true,description:"Model name from stg_mdl1.dar"},
{name:"pos",type:"vec3",default:"0,0,0",required:true,description:"Position"},
{name:"dir",type:"vec3",default:"0,0,0",description:"Rotation"},
{name:"g",type:"int",default:0,description:"Group ID"},
{name:"t",type:"int",default:0,description:"Type flag"}]},

PUT_OBJECT:{
description:"Decorative props attached to surfaces. Used in heliport/tank-hangar for crates etc.",
category:"prop",
sourceStages:["02a","02b","02c","02d","02e"],
params:[
{name:"model",type:"model",default:"",required:true,description:"Model name"},
{name:"set",type:"int",default:0,description:"Set ID for grouping"}]},

// (DOOR removed from SpawnWiz catalog — the menu-bar "+Door" wizard handles
// all door creation since it manages the full system: keycard, zones, lamp,
// stage transitions, model loading. The SpawnWiz Step 1 screen surfaces a
// shortcut to that wizard at the top of the catalog list.)


ITEM:{
description:"Pickupable item (ration, ammo, etc.)",
category:"item",
sourceStages:["all"],
params:[
{name:"pos",type:"vec3",default:"0,0,0",required:true,description:"Position"},
{name:"box",type:"int",default:0,description:"Box ID"},
{name:"index",type:"int",default:0,description:"Item type index"},
{name:"msg",type:"int",default:0,description:"Message ID on pickup"},
{name:"num",type:"int",default:1,description:"Quantity"},
{name:"h",type:"int",default:0,description:"Height/H flag"},
{name:"x",type:"int",default:0,description:"X flag"},
{name:"exec",type:"proc",default:"",description:"Proc on pickup"}]},

CAMERA:{
description:"Security camera with vision cone. Pans across a target area; alerts on detection.",
category:"security_camera",
sourceStages:["00a","01a","02a","02b","02c","02e","04a"],
params:[
{name:"len",type:"int",default:6500,required:true,description:"View distance"},
{name:"xRange",type:"int",default:512,description:"Pan range"},
{name:"pos",type:"vec3",default:"0,4000,0",required:true,description:"Camera position"},
{name:"width",type:"int",default:800,description:"View cone width"},
{name:"dir",type:"vec3",default:"0,0,0",description:"Initial facing"},
{name:"exec",type:"proc",default:"",description:"Proc on detection"}]},

GUNCAME:{
description:"Auto-firing ceiling gun. Tracks Snake in its sight cone and fires.",
category:"security_camera",
sourceStages:["02a","04a","06a"],
assetNotes:"Uses GUNCAME type (distinct from surveillance CAMERA). Has its own field IDs: -m mode, -len, -width, -xRange, -r rotation vec3, -g group pair, -exec callback proc.",
params:[
{name:"p",type:"vec3",default:"0,4000,0",required:true,description:"Mount position"},
{name:"d",type:"vec3",default:"0,0,0",description:"Initial dir (pitch,yaw,roll, 4096=360°)"},
{name:"m",type:"int",default:1,description:"Mode (1 = standard tracking-and-fire)"},
{name:"len",type:"int",default:5000,description:"Sight distance"},
{name:"width",type:"int",default:300,description:"Sight cone width (0-1024)"},
{name:"xRange",type:"int",default:512,description:"Pan range"},
{name:"r",type:"vec3",default:"0,0,0",description:"Rotation vector (mount orientation)"},
{name:"g",type:"int-list",default:"0 0",description:"Group ID pair"},
{name:"exec",type:"proc",default:"",description:"Proc on detection/fire"}]},

SEARCH_LIGHT:{
description:"Heliport-style searchlight. Sweeps an arc; spots Snake when caught in the beam.",
category:"search_light",
sourceStages:["01a"],
assetNotes:"Vanilla MGS1: the two roof-mounted searchlights at the Heliport (s01a) — distinct entity from gun cameras (which fire) and security cameras (which pan smoothly).",
params:[
{name:"i",type:"int",default:1,description:"Light index"},
{name:"d",type:"int",default:0,description:"Direction"},
{name:"x",type:"int",default:512,description:"Pan range"},
{name:"t",type:"int",default:0,description:"Pattern type"},
{name:"w",type:"int",default:1500,description:"Beam width"},
{name:"p",type:"vec3",default:"0,0,0",required:true,description:"Mount position"},
{name:"a",type:"int",default:0,description:"Angle speed"},
{name:"h",type:"int",default:0,description:"Height/altitude"}]},

INFRARED_CENSOR:{
description:"Infrared sensor — invisible beam between two points. Triggers callback when Snake crosses.",
category:"infrared",
sourceStages:["02a","04a","09a"],
params:[
{name:"p",type:"vec3-pair",default:"0,0,0|0,2000,0",required:true,description:"Beam endpoints (start | end)"},
{name:"m",type:"vec3",default:"0,0,0",description:"Motion vector (if beam sweeps)"},
{name:"s",type:"var",default:"$w:000400",description:"Speed/state variable reference"},
{name:"e",type:"proc",default:"",description:"Trigger callback proc"},
{name:"b",type:"int-list",default:"0 0",description:"Beam params (int pair)"}]},

LAND_MINE:{
description:"Pressure plate mine. Triggered on player proximity.",
category:"mines",
sourceStages:["05a","10a","12b","12c","14e"],
params:[
{name:"pos",type:"vec3",default:"0,0,0",required:true,description:"Position"},
{name:"dir",type:"int",default:0,description:"Direction"},
{name:"e",type:"int",default:0,description:"Event ID"}]},

LIFE_UP:{
description:"Health pickup / Life Medicine.",
category:"item",
sourceStages:["04b","04c","06a","07b","08b","etc."],
params:[
{name:"m",type:"int",default:320,required:true,description:"Max HP boost"},
{name:"l",type:"int",default:0,description:"Level"},
{name:"c",type:"int",default:0,description:"Condition flag"},
{name:"e",type:"int",default:0,description:"Event ID"}]},

LAMP:{
description:"Light source (visible bulb + illumination cone).",
category:"prop",
sourceStages:["02a","02b","02c","etc."],
params:[
{name:"I",type:"int",default:255,description:"Intensity"},
{name:"S",type:"int",default:0,description:"Size"},
{name:"a",type:"vec3",default:"0,0,0",description:"Position anchor"},
{name:"b",type:"vec3",default:"0,0,0",description:"B anchor"},
{name:"c",type:"int",default:0,description:"Color/flags"},
{name:"D",type:"int",default:0,description:"D flag"},
{name:"R",type:"int",default:0,description:"R flag"}]}
};

// Get the list of categories from the catalog for the UI
// User-friendly display names for the wizard catalog and headers. Internal
// code still uses the entity type IDs (WATCHER, GUNCAME, etc.) — this is
// purely cosmetic.
var ENTITY_DISPLAY_NAMES={
WATCHER:"Genome Soldier",
ZAKO10:"Snow Soldier (s10)",
ZAKO11A:"Comm-Tower Soldier (s11a)",
ZAKO14:"Snowfield Day-2 Soldier (s14)",
DOG:"Cave Wolf / Dog",
CROW:"Crow Flock",
MOUSE:"Mouse",
CAT_IN:"Rat (indoor)",
HIYOKO:"Chick (s03a easter egg)",
OBSTACLE:"Obstacle / Crate",
PUT_OBJECT:"Surface Decoration",
LAMP:"Lamp / Light Source",
ITEM:"Pickup Item",
LIFE_UP:"Life Medicine",
CAMERA:"Security Camera",
GUNCAME:"Auto-Firing Gun Camera",
SEARCH_LIGHT:"Searchlight",
INFRARED_CENSOR:"Infrared Sensor",
LAND_MINE:"Land Mine"};
function getEntityDisplayName(entityType){
return ENTITY_DISPLAY_NAMES[entityType]||entityType;}

function getEntityCategories(){
var cats={};
for(var t in ENTITY_TEMPLATES){
var c=ENTITY_TEMPLATES[t].category;
if(!cats[c])cats[c]=[];
cats[c].push(t);}
return cats;}

// Check whether a stage can host a given entity type. Returns a report with
// missing-infrastructure flags so the spawn wizard can warn the user.
//   {ok:bool, missing:[{kind, description, fixable}], warnings:[]}
function checkStageCompatibility(entityType){
var t=ENTITY_TEMPLATES[entityType];
if(!t)return{ok:false,missing:[{kind:"unknown",description:"Unknown entity type: "+entityType,fixable:false}],warnings:[]};
var infra=t.infrastructure||{};
var report={ok:true,missing:[],warnings:[]};
// Check for COMMAND
if(infra.needsCommand){
var hasCommand=gclOrigText&&/\bchara\s+COMMAND\b/.test(gclOrigText);
if(!hasCommand){
report.ok=false;
report.missing.push({kind:"command",
description:"This stage has no 'chara COMMAND' block. "+entityType+" requires it to spawn enemy AI infrastructure.",
fixable:true});}}
// Check for routes
if(infra.needsRoutes){
var hasRoutes=hzm&&hzm.routes&&hzm.routes.some(function(r){return r.waypoints.length>0;});
if(!hasRoutes){
report.warnings.push("No HZM routes defined. Create at least one route via the Route Editor before spawning "+entityType+".");}}
// Check for nav zones (needed for WATCHER pathfinding)
if(infra.needsNavZones){
var hasNavZones=hzm&&hzm.navZones&&hzm.navZones.length>0;
if(!hasNavZones){
report.warnings.push("No HZD nav zones defined. "+entityType+" pathfinding may fail. Use AutoNZ to generate them.");}}
return report;}

// Render a chara block from a template + filled-in params + instance name.
// `paramValues` is {paramName: stringValue} mapping. Returns multi-line GCL.
function renderEntityTemplate(entityType,instanceName,paramValues){
var t=ENTITY_TEMPLATES[entityType];
if(!t)return null;
var lines=["chara "+entityType+" "+instanceName+" \\"];
var params=t.params||[];
var emitted=[];
for(var i=0;i<params.length;i++){
var p=params[i];
var val=paramValues[p.name];
if(val===undefined||val===null||val==="")continue;
emitted.push("    -"+p.name+" "+val);}
// Join with line continuations
for(var j=0;j<emitted.length;j++){
lines.push(emitted[j]+(j<emitted.length-1?" \\":""));}
return lines.join("\n");}

// ============================================================
