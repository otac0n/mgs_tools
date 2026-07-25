// ═══════════════════════════════════════════════════════════════════════════
// FILE: 04_textures.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ==================== KMD OVERLAY ====================
var kmdFlip2=false;
function loadKMD(buf,kmdIdxHint){
var v=new DataView(buf),d=new Uint8Array(buf),numTotal=v.getUint32(4,true);
var allLines=[],allTris=[];
var texGroups={};var faceList=[];// hash -> {positions:[], uvs:[]}
// Character armature: accumulate each block's bone world position from localPos
// (i32 @ +0x20/24/28) + parent (i32 @ +0x2C), so multi-part character models
// don't collapse to the origin. Rigid stage KMDs have localPos=0 -> no change.
var kmdBoneWP=[];
for(var _kb=0;_kb<numTotal;_kb++){var _ko=0x20+_kb*88;
  if(_ko+0x30>buf.byteLength){kmdBoneWP.push([0,0,0]);continue;}
  var _kw=[v.getInt32(_ko+0x20,true),v.getInt32(_ko+0x24,true),v.getInt32(_ko+0x28,true)];
  var _kp=v.getInt32(_ko+0x2C,true);
  if(_kp>=0&&_kp<kmdBoneWP.length){_kw[0]+=kmdBoneWP[_kp][0];_kw[1]+=kmdBoneWP[_kp][1];_kw[2]+=kmdBoneWP[_kp][2];}
  kmdBoneWP.push(_kw);}
for(var bi=0;bi<numTotal;bi++){var bo=0x20+bi*88;if(bo+88>buf.byteLength)break;
var nv=v.getUint32(bo+52,true),vo=v.getUint32(bo+56,true),nf=v.getUint32(bo+4,true),fo=v.getUint32(bo+60,true);
var uvo2=v.getUint32(bo+76,true),tno2=v.getUint32(bo+80,true);
if(nv===0||nv>50000||vo>=buf.byteLength)continue;
var verts=[];var _bw=kmdBoneWP[bi]||[0,0,0];for(var vi=0;vi<nv;vi++){var vp=vo+vi*8;if(vp+8>buf.byteLength)break;
var vx=(v.getInt16(vp,true)+_bw[0])*S,vy=(v.getInt16(vp+2,true)+_bw[1])*S,vz=(v.getInt16(vp+4,true)+_bw[2])*S;
if(kmdFlip2)verts.push({x:vx,y:vz,z:vy});else verts.push({x:vx,y:vy,z:vz})}
if(nf>0&&nf<50000&&fo<buf.byteLength){
for(var fi2=0;fi2<nf;fi2++){var fp=fo+fi2*4;if(fp+4>buf.byteLength)break;
var i0=d[fp],i1=d[fp+1],i2=d[fp+2],i3=d[fp+3];
if(i0>=nv||i1>=nv||i2>=nv||i3>=nv)continue;
var v0=verts[i0],v1=verts[i1],v2=verts[i2],v3=verts[i3];if(!v0||!v1||!v2||!v3)continue;
allLines.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z);allLines.push(v1.x,v1.y,v1.z,v2.x,v2.y,v2.z);
allLines.push(v2.x,v2.y,v2.z,v3.x,v3.y,v3.z);allLines.push(v3.x,v3.y,v3.z,v0.x,v0.y,v0.z);
allTris.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z,v2.x,v2.y,v2.z);
allTris.push(v0.x,v0.y,v0.z,v2.x,v2.y,v2.z,v3.x,v3.y,v3.z);
// Read UV and texture hash for textured mode
if(darLoaded&&uvo2>0&&uvo2<buf.byteLength&&tno2>0&&tno2<buf.byteLength){
var uvp=uvo2+fi2*8,thp=tno2+fi2*2;
if(uvp+8<=buf.byteLength&&thp+2<=buf.byteLength){
var th2=v.getUint16(thp,true);
// Skip deleted faces in rendering. Keys are per-KMD when kmdIdxHint is given
// ("kmdIdx-block-face"); we also honor the legacy "block-face" shape so old
// sessions / undo entries keep working.
var _scopedKey=kmdIdxHint!==undefined?(kmdIdxHint+"-"+bi+"-"+fi2):null;
var _legacyKey=bi+"-"+fi2;
if((_scopedKey&&kmdDeletedFaces[_scopedKey])||kmdDeletedFaces[_legacyKey]){faceList.push({block:bi,face:fi2,hash:th2,deleted:true,tri:[]});continue}
var u0=d[uvp]/256,uv0=d[uvp+1]/256,u1=d[uvp+2]/256,uv1=d[uvp+3]/256;
var u2=d[uvp+4]/256,uv2=d[uvp+5]/256,u3=d[uvp+6]/256,uv3=d[uvp+7]/256;
if(!texGroups[th2])texGroups[th2]={positions:[],uvs:[],faceRefs:[]};
var tg3=texGroups[th2];
// Tri 1: v0,v1,v2
tg3.positions.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z,v2.x,v2.y,v2.z);
tg3.uvs.push(u0,uv0,u1,uv1,u2,uv2);
// Tri 2: v0,v2,v3
tg3.positions.push(v0.x,v0.y,v0.z,v2.x,v2.y,v2.z,v3.x,v3.y,v3.z);
tg3.uvs.push(u0,uv0,u2,uv2,u3,uv3);
tg3.faceRefs.push({block:bi,face:fi2});
// Store per-face info for deletion
faceList.push({block:bi,face:fi2,hash:th2,
tri:[v0.x,v0.y,v0.z,v1.x,v1.y,v1.z,v2.x,v2.y,v2.z,v0.x,v0.y,v0.z,v2.x,v2.y,v2.z,v3.x,v3.y,v3.z]})}}}}}
return{lines:allLines,tris:allTris,texGroups:texGroups,faceList:faceList}}

// ==================== DAR/PCX TEXTURE PIPELINE ====================
var darTextures={};
var kmdDeletedFaces={};// "blockIdx-faceIdx" -> true// hash -> {name, canvas, tex}
var darLoaded=false;
var darRawFiles=[];// raw PCX data for VRAM analysis. Each entry has {name, data, darSource, isImport?}
// Per-DAR-source flag: should this DAR's textures be treated as "imported" (i.e., relocatable
// during repack and flagged for collision detection)?  Map from DAR filename to bool.
// Keys are darSource strings (e.g. "stg_tex4.dar"). When user toggles a DAR via the VRAM
// popup, we update both this map AND retroactively update darRawFiles entries.
var darImportFlags={};
var selTexHash=-1;// currently selected texture hash
var wallTextures={};// "nw-N" -> {hash, mesh} texture assigned to new walls
var floorTextures={};// "nf-N" -> {hash, mesh}
var activeTexHash=-1;
var uvTileMode='fit';// currently selected texture for painting
// Model DAR state
var mdlDarFiles=null;// full DAR file list for re-export
var mdlSubModels={};// name -> {buf, lines}
var mdlSubObjs=[];// Three.js objects for sub-models
var showSubModels=true;
// Import system
var importedModels=[];// {name, data(Uint8Array), source}
var importedTextures=[];// {name, data(Uint8Array), source, hash, canvas, tex, vramPx, vramPy, assigned}
var importCatalog=[];// temp: files from source DAR for picking
// Camera angle system
var camAngles=[];// parsed camera angle definitions
var trapZones=[];// parsed trap/ntrap statements: {kind:'trap'|'ntrap', zoneName, target, body, calledProcs:[]}

// ====================================================
// Entity Catalog — built from scanning all 50 stage GCLs + FoxdieTeam decomp source.
// Used to drive friendly property panels and the "Add Entity" picker.
// GCL parser only matches first char of param names; long names are nicknames for the same field.
// ====================================================
var ENTITY_CATALOG={
WATCHER:{cat:"enemy",label:"Soldier (Guard)",color:0xff4444,
desc:"Patrolling guard. Walks routes, has sight cone. Requires a COMMAND entity in the stage.",
params:{
r:{lbl:"Patrol Route",t:"int",desc:"Route number — must exist in scenerio routes"},
n:{lbl:"Starting Node",t:"vec3",desc:"Initial waypoint X,Y,Z (snaps to nearest HZD address)"},
l:{lbl:"Health",t:"int",def:192,desc:"HP. 192 default."},
f:{lbl:"Faint Threshold",t:"int",def:10,desc:"HP below which guard plays faint anim"},
b:{lbl:"Blood Type",t:"char",def:"'Z'",desc:"'Z'=none, 'S'=splatter"},
a:{lbl:"Area Type",t:"char",def:"'A'",desc:"'S'=snow (white breath), 'A'=default"},
s:{lbl:"Size Bonus",t:"int",def:0,desc:"Added to scale 4096"},
h:{lbl:"Drop Item",t:"int",def:0,desc:"Item drop type (3 = next param specifies item)"},
g:{lbl:"Color Group",t:"int",def:255},
y:{lbl:"Y-flag",t:"int"},
j:{lbl:"Behavior Flag",t:"int"},
t:{lbl:"Sound Effect",t:"raw",desc:"Sound triggers (snd:HEX)"},
e:{lbl:"Death Callback",t:"proc"},
c:{lbl:"Visibility Flag",t:"flag"}}},
DOG:{cat:"enemy",label:"Wolf/Dog (Canyon)",color:0xcc8844,
desc:"Canine enemy from canyon levels. Attacks Snake on detection.",
params:{
s:{lbl:"Spawn Mode",t:"int"},
r:{lbl:"Routes",t:"int_list"},
d:{lbl:"Difficulty",t:"int",desc:"AI aggression (2-3 typical)"},
h:{lbl:"Hit Callback",t:"proc"},
b:{lbl:"State Flag",t:"var_ref"},
o:{lbl:"Spawn Callback",t:"proc"},
c:{lbl:"Variant",t:"int"},
l:{lbl:"Life",t:"int"},
p:{lbl:"Position",t:"vec3"}}},
WOLF2:{cat:"enemy",label:"Sniper Wolf (Boss)",color:0xaa6633,
desc:"Sniper Wolf boss entity. Tightly scripted — not usually added casually to other stages.",
params:{
p:{lbl:"Spawn Points",t:"vec3_list"},
u:{lbl:"Count",t:"int"},
m:{lbl:"Modes",t:"int_list"},
k:{lbl:"Kind",t:"int"},
h:{lbl:"Health/Flag",t:"int_or_var"},
o:{lbl:"Detect Radius",t:"int"},
q:{lbl:"Behavior",t:"int"},
n:{lbl:"N-count",t:"int"},
g:{lbl:"G-value",t:"int"},
e:{lbl:"Event Callback",t:"proc"},
i:{lbl:"Init Callback",t:"proc"},
j:{lbl:"J Callback",t:"proc"},
d:{lbl:"Death Callback",t:"proc"}}},
MOUSE:{cat:"enemy",label:"Rat/Mouse",color:0x886644,
desc:"Decorative rodent. Mostly visual; can be killed.",
params:{
n:{lbl:"Routes",t:"int"},
m:{lbl:"Mode",t:"int"},
r:{lbl:"Range",t:"int"},
l:{lbl:"Length",t:"int"},
d:{lbl:"Direction",t:"int"},
w:{lbl:"W-flag",t:"int",def:0},
s:{lbl:"Sound",t:"raw"},
k:{lbl:"Kill Callback",t:"proc"}}},
CAMERA:{cat:"hazard",label:"Security Camera",color:0xffff00,
desc:"Panning surveillance camera. Detects Snake in cone, triggers alarm.",
params:{
p:{lbl:"Position",t:"vec3"},
d:{lbl:"Direction",t:"vec3",desc:"yaw/pitch/roll (0-4096 = 360°)"},
l:{lbl:"Sight Length",t:"int"},
w:{lbl:"Sight Width",t:"int",desc:"Cone half-width (max 512)"},
x:{lbl:"Pan Range",t:"int",desc:"Side-to-side pan angle (max 1024). 0 = stationary"},
m:{lbl:"Mode",t:"int",def:0},
h:{lbl:"H-flag",t:"flag"},
r:{lbl:"Pan Reference",t:"str"},
e:{lbl:"Detect Callback",t:"proc"},
n:{lbl:"Camera Number",t:"str"}}},
SEARCH_LIGHT:{cat:"hazard",label:"Searchlight",color:0xffff88,
desc:"Roving searchlight beam. Spots Snake when in arc.",
params:{
p:{lbl:"Position",t:"vec3"},
d:{lbl:"Direction",t:"vec3"},
i:{lbl:"Index",t:"int"},
h:{lbl:"Height",t:"int"},
w:{lbl:"Beam Width",t:"int"},
x:{lbl:"Pan Range",t:"int"},
a:{lbl:"Angle Speed",t:"int"},
t:{lbl:"Pattern",t:"int_list"},
z:{lbl:"Z-flag",t:"int"}}},
LAND_MINE:{cat:"hazard",label:"Land Mine",color:0xff6644,
desc:"Pressure-triggered explosive. Use Mine Detector to see.",
params:{
pos:{lbl:"Position",t:"vec3"},
dir:{lbl:"Direction",t:"vec3",def:"0,1024,0"},
e:{lbl:"Explode Callback",t:"proc",desc:"Proc called when mine is stepped on (optional)"}}},
GUNCAME:{cat:"hazard",label:"Gun Camera",color:0xff8800,
desc:"Auto-firing ceiling gun camera. Tracks Snake within its arc and shoots.",
params:{
m:{lbl:"Mode",t:"int",def:1,desc:"1 = standard tracking-and-fire"},
len:{lbl:"Sight Length",t:"int",def:5000,desc:"How far it sees (in units)"},
width:{lbl:"Cone Width",t:"int",def:300,desc:"Angular sight width"},
pos:{lbl:"Position",t:"vec3"},
dir:{lbl:"Initial Direction",t:"vec3",def:"0,0,0",desc:"Starting facing direction"},
xRange:{lbl:"Pan Range",t:"int",def:512,desc:"How far left/right it sweeps"},
r:{lbl:"Rotation Vec",t:"vec3",def:"512,0,0",desc:"Rotation axis/limits"},
g:{lbl:"Group ID",t:"int_pair",def:"5 2",desc:"Two-int group identifier"},
exec:{lbl:"Detect Callback",t:"proc",desc:"Optional proc called when Snake is spotted"}}},
INFRARED_CENSOR:{cat:"hazard",label:"Infrared Sensor",color:0xff44aa,
desc:"Tripwire IR beam between two points. Triggers alarm when crossed.",
params:{
pos:{lbl:"Beam Endpoints",t:"vec3_pair",desc:"X1,Y1,Z1  X2,Y2,Z2 — beam runs between these two points"},
move:{lbl:"Motion",t:"vec3",def:"0,3670,0",desc:"Beam sweep direction"},
speed:{lbl:"Speed Var",t:"var_ref",def:"$w:00043c",desc:"Word variable controlling sweep speed"},
e:{lbl:"Trigger Callback",t:"proc",desc:"Optional proc called when beam is crossed"}}},
ITEM:{cat:"pickup",label:"Item Pickup",color:0x44aaff,
desc:"Collectable: weapon, ammo, ration, key card, etc.",
params:{
pos:{lbl:"Position",t:"vec3"},
box:{lbl:"Container",t:"int",desc:"0=floor, 4=box"},
index:{lbl:"Item Index",t:"int"},
msg:{lbl:"Display Name",t:"str",desc:"e.g. RATION, SOCOM"},
num:{lbl:"Quantity",t:"int",def:1},
h:{lbl:"Height",t:"int",def:500},
exec:{lbl:"On Pickup",t:"proc"}}},
LIFE_UP:{cat:"pickup",label:"Life Capsule",color:0x44ffaa,
desc:"Permanent max HP increase.",
params:{p:{lbl:"Position",t:"vec3"}}},
DOOR:{cat:"environment",label:"Door",color:0xff8844,
desc:"Passable door. Opens on approach.",
params:{
p:{lbl:"Position",t:"vec3"},
d:{lbl:"Direction",t:"vec3"},
m:{lbl:"Model",t:"model_ref"},
w:{lbl:"Width",t:"int"},
t:{lbl:"Door Type",t:"int"},
h:{lbl:"Height",t:"int"},
g:{lbl:"HZD Group",t:"hzd_ref"},
f:{lbl:"Trigger Callback",t:"proc"},
e:{lbl:"Hash Pair",t:"int_pair"},
u:{lbl:"Up-speed",t:"int"},
s:{lbl:"S-param",t:"int"},
v:{lbl:"V-param",t:"int"},
r:{lbl:"R-param",t:"int"},
o:{lbl:"Open Callback",t:"proc"},
a:{lbl:"A-flag",t:"int"}}},
SHUTER:{cat:"environment",label:"Shutter/Garage Door",color:0xcc6644,
desc:"Vertical sliding shutter.",
params:{
p:{lbl:"Position",t:"vec3"},
d:{lbl:"Direction",t:"vec3"},
m:{lbl:"Model",t:"model_ref"},
r:{lbl:"Range",t:"int",desc:"Open distance (sign = direction)"},
o:{lbl:"Origin",t:"int_or_var"},
h:{lbl:"Height",t:"int"},
e:{lbl:"Procs",t:"proc_list"},
a:{lbl:"Auto-open",t:"int"},
s:{lbl:"S-param",t:"int"}}},
DYNAMIC_SEGMENT:{cat:"environment",label:"Moving Platform",color:0xff8800,
desc:"Animated floor section (moving platform, conveyor).",
params:{
p:{lbl:"Path Points",t:"vec3_list"},
h:{lbl:"Height",t:"int"},
s:{lbl:"Speed",t:"int",def:1276}}},
OBSTACLE:{cat:"environment",label:"Obstacle Model",color:0x888888,
desc:"Placed model with collision (crates, walls).",
params:{
pos:{lbl:"Position",t:"vec3"},
model:{lbl:"Model",t:"model_ref"},
dir:{lbl:"Direction",t:"vec3"},
g:{lbl:"Group",t:"int"},
t:{lbl:"Type Flag",t:"int_or_var"}}},
LAMP:{cat:"environment",label:"Lamp / Light Source",color:0xffeeaa,
desc:"Light source with bulb model + illumination cone. Has unusual positional-arg syntax — see Asset Notes.",
params:{
pos:{lbl:"Position",t:"vec3",desc:"Lamp position (1st vec3 arg in chara header)"},
dir:{lbl:"Direction",t:"vec3",def:"0,2048,0",desc:"Lamp facing (2nd vec3 arg in chara header)"},
scale:{lbl:"Scale",t:"vec3",def:"250,137,250",desc:"Bulb scale (3rd vec3 arg in chara header)"},
model:{lbl:"Bulb Model Hash",t:"int_hex",def:"0xe29d",desc:"Hash of the bulb KMD model"}}},
PUT_OBJECT:{cat:"environment",label:"Decorative Object Set",color:0x886644,
desc:"Multi-instance prop (puts the same model at several positions). Used for crate stacks in heliport, etc.",
params:{
model:{lbl:"Model",t:"model_ref",desc:"Model name to place"},
set:{lbl:"Position/Rotation List",t:"vec3_pair_list",desc:"Whitespace-separated pairs: pos_x,y,z rot_x,y,z  pos_x,y,z rot_x,y,z  ..."}}},
SNAKE:{cat:"system",label:"Player Spawn",color:0x00ff00,
desc:"Snake's spawn point and starting setup.",
params:{
pos:{lbl:"Spawn Position",t:"vec3"},
dir:{lbl:"Facing",t:"vec3"},
oar:{lbl:"Animation Set",t:"oar_ref"},
model:{lbl:"Model Override",t:"model_ref"},
l:{lbl:"Initial Limit",t:"int"},
r:{lbl:"R-param",t:"int"},
t:{lbl:"T-param",t:"int_pair"}}},
COMMAND:{cat:"system",label:"Enemy Commander",color:0xff0088,
desc:"Coordinator for WATCHERs/CAMERAs/SEARCH_LIGHTs. REQUIRED if WATCHERs exist.",
params:{
nWatcher:{lbl:"Watcher Death Procs",t:"proc_list"},
camera:{lbl:"Camera Procs",t:"proc_list"},
searchli:{lbl:"Searchlight Procs",t:"proc_list"},
v:{lbl:"Vision Ranges",t:"vec3_pair"},
l:{lbl:"Vision Length Vars",t:"var_list"},
y:{lbl:"Vision Y Range",t:"int_or_var"},
t:{lbl:"Mode",t:"int"},
f:{lbl:"F-flag",t:"int"},
b:{lbl:"B-flag",t:"int"},
m:{lbl:"M-proc",t:"proc"},
a:{lbl:"A-mode",t:"int"}}}
};
// Reverse: lookup by category
function getCatalogByCategory(){
var groups={};
for(var t in ENTITY_CATALOG){var c=ENTITY_CATALOG[t].cat;if(!groups[c])groups[c]=[];groups[c].push(t)}
return groups;}
var camAngleObjs=[];// Three.js visualization objects
var showCamAngles=false;
var selCamAngle=-1;
// Camera angle drag handles: when a fixed-camera angle is selected, two draggable spheres appear
// for the camera position and look-at target. These are world-aligned, X/Z drag with Shift for Y.
var camHandleObjs=[];// handles: {type:'campos'|'camtarget', mesh}
var camHandleDrag=null;// {handle:'pos'|'tgt', startWorldX, startWorldZ, startCamX, startCamY, startCamZ}
var camPreviewMode=false;
var camPreviewSaved=null;
var delFaceMode=false;
var fpsMode=false;// hold F for first-person look
var skewMode=false;// spacebar = vertex skew
var skewCorner=-1;// which corner (0-3)
var skewCorner2=-1;// second corner for edge mode
var skewWallIdx=-1;// which wall
var skewFloorIdx=-1;// which floor
// Built-in Snake model (simple humanoid, game-scale coordinates)
var snakeModelTris=null;
function getSnakeModel(){
if(snakeModelTris)return snakeModelTris;
// Build a simple blocky humanoid ~1800 units tall
// All coords in game units, will be scaled by S when rendering
var tris=[];
function box(cx,cy,cz,wx,wy,wz){
var x0=cx-wx/2,x1=cx+wx/2,y0=cy,y1=cy+wy,z0=cz-wz/2,z1=cz+wz/2;
// 6 faces, 2 tris each = 12 tris
// Front
tris.push(x0,y0,z1,x1,y0,z1,x1,y1,z1, x0,y0,z1,x1,y1,z1,x0,y1,z1);
// Back
tris.push(x1,y0,z0,x0,y0,z0,x0,y1,z0, x1,y0,z0,x0,y1,z0,x1,y1,z0);
// Left
tris.push(x0,y0,z0,x0,y0,z1,x0,y1,z1, x0,y0,z0,x0,y1,z1,x0,y1,z0);
// Right
tris.push(x1,y0,z1,x1,y0,z0,x1,y1,z0, x1,y0,z1,x1,y1,z0,x1,y1,z1);
// Top
tris.push(x0,y1,z1,x1,y1,z1,x1,y1,z0, x0,y1,z1,x1,y1,z0,x0,y1,z0);
// Bottom
tris.push(x0,y0,z0,x1,y0,z0,x1,y0,z1, x0,y0,z0,x1,y0,z1,x0,y0,z1)}
// Torso
box(0,700,0, 500,600,250);
// Head
box(0,1300,0, 280,350,280);
// Neck
box(0,1250,0, 150,100,150);
// Left arm
box(-370,750,0, 180,550,180);
// Right arm
box(370,750,0, 180,550,180);
// Left leg
box(-130,0,0, 200,700,220);
// Right leg
box(130,0,0, 200,700,220);
// Bandana tail
box(-60,1450,-200, 80,40,180);
// Scale to editor units
var scaled=[];
for(var i=0;i<tris.length;i++)scaled.push(tris[i]*S);
snakeModelTris=scaled;
return scaled}

function mgsHash(s){var h=0;for(var i=0;i<s.length;i++){h=((h>>11)|(h<<5))&0xFFFF;h=(h+s.charCodeAt(i))&0xFFFF}return h}

function parseDar(buf){
var dv=new DataView(buf);var u8=new Uint8Array(buf);var offset=0;
var fileCount=dv.getUint32(offset,true);offset+=4;
var files=[];
for(var i=0;i<fileCount;i++){
var name="";while(offset<buf.byteLength&&u8[offset]!==0){name+=String.fromCharCode(u8[offset]);offset++}
offset++;// skip null
var pad=(4-(offset%4))%4;offset+=pad;
var flen=dv.getUint32(offset,true);offset+=4;
var fdata=new Uint8Array(buf,offset,flen);offset+=flen;
if(offset<buf.byteLength)offset++;// null terminator
files.push({name:name,data:new Uint8Array(fdata)})}
return files}

function decodePcx(data){
var bpp=data[3],planes=data[65];
var xmax=data[8]|(data[9]<<8),ymax=data[10]|(data[11]<<8);
var w=xmax+1,h=ymax+1;
var bpl=data[66]|(data[67]<<8);
var isVga=bpp===8&&planes===1,isEga=bpp===1&&planes===4;
// Header palette (16 colors at offset 16)
var hPal=[];for(var i=0;i<16;i++)hPal.push([data[16+i*3],data[16+i*3+1],data[16+i*3+2]]);
// RLE decode
var offset=128,uLen=planes*h*bpl,decoded=[];
while(decoded.length<uLen&&offset<data.length){var b=data[offset++];
if(b>=192){var cnt=b&0x3F,val=data[offset++]||0;for(var r=0;r<cnt;r++)decoded.push(val)}
else decoded.push(b)}
// Trailing VGA palette
var extPal=null;
if(isVga&&offset+769<=data.length&&data[offset]===0x0C){offset++;extPal=[];
for(i=0;i<256;i++){extPal.push([data[offset],data[offset+1],data[offset+2]]);offset+=3}}
// Create canvas
var cv2=document.createElement("canvas");cv2.width=w;cv2.height=h;
var ctx=cv2.getContext("2d");var imgd=ctx.createImageData(w,h);var px=imgd.data;
if(isVga){var pal=extPal||hPal;
for(var y=0;y<h;y++)for(var x=0;x<w;x++){var idx=decoded[y*bpl+x]||0;
var c=idx<pal.length?pal[idx]:[0,0,0];var pi=(y*w+x)*4;
px[pi]=c[0];px[pi+1]=c[1];px[pi+2]=c[2];px[pi+3]=255}}
else if(isEga){var ls=bpl*planes;
for(y=0;y<h;y++)for(x=0;x<w;x++){var bi2=Math.floor(x/8),bit=x%8,mask=1<<(7-bit);
var p1=decoded[y*ls+0*bpl+bi2]||0,p2=decoded[y*ls+1*bpl+bi2]||0;
var p3=decoded[y*ls+2*bpl+bi2]||0,p4=decoded[y*ls+3*bpl+bi2]||0;
var ci=(((p1&mask)>>(7-bit))<<0)|(((p2&mask)>>(7-bit))<<1)|(((p3&mask)>>(7-bit))<<2)|(((p4&mask)>>(7-bit))<<3);
var c2=ci<hPal.length?hPal[ci]:[0,0,0];pi=(y*w+x)*4;
px[pi]=c2[0];px[pi+1]=c2[1];px[pi+2]=c2[2];px[pi+3]=255}}
ctx.putImageData(imgd,0,0);return cv2}

function handleDARFiles(files){
var pending=files.length;
for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){try{
// Auto-detect PSX texture DAR (different format from PC DAR). Magic check:
// PSX entries have bytes [8,9,10,11] = 0x0a 0x05 0x01 0x01/0x08
// at the very start of the file. PC DARs start with a u32 filecount.
var u8 = new Uint8Array(e.target.result);
if(u8.length >= 24 && u8[8]===0x0a && u8[9]===0x05 && u8[10]===0x01 &&
   (u8[11]===0x01 || u8[11]===0x08) &&
   u8[12]===0 && u8[13]===0 && u8[14]===0 && u8[15]===0 &&
   u8[0x14]===0x40 && u8[0x15]===0x06 && u8[0x16]===0xb0 && u8[0x17]===0x04){
  // PSX format — route to dedicated handler
  handlePsxTexDAR(u8, f.name);
  pending--;
  if(pending===0){
    darLoaded=true;
    document.getElementById("dar-info").textContent=Object.keys(darTextures).length+" textures";
    if(kmdBufs.length>0)rebuildKMD();
    if(typeof updateTexPalette==="function") updateTexPalette();
    if(typeof rebuildGCLVis==="function") rebuildGCLVis();
  }
  return;
}
// Standard PC format — original path below
var darFiles=parseDar(e.target.result);
for(var j=0;j<darFiles.length;j++){var df=darFiles[j];
var nameNoExt=df.name.replace('.pcx','');
var hash=mgsHash(nameNoExt);
darRawFiles.push({name:df.name,data:df.data,darSource:f.name});
try{var canvas=decodePcx(df.data);
darTextures[hash]={name:nameNoExt,canvas:canvas,
tex:new THREE.CanvasTexture(canvas)};
darTextures[hash].tex.flipY=false;darTextures[hash].tex.magFilter=THREE.NearestFilter;darTextures[hash].tex.minFilter=THREE.NearestFilter}
catch(err2){console.log("PCX decode error for "+df.name+": "+err2)}}
pending--;if(pending===0){darLoaded=true;
document.getElementById("dar-info").textContent=Object.keys(darTextures).length+" textures";
if(kmdBufs.length>0)rebuildKMD();updateTexPalette();
// Trigger GCL entity rebuild so doors/cameras/obstacles pick up their
// textures right away. Without this, entities render as colored shells
// until some unrelated action (like ExpGCL) triggers a refresh.
if(typeof rebuildGCLVis==="function")rebuildGCLVis();}}
catch(err){console.log("DAR parse error: "+err);pending--}};
r.readAsArrayBuffer(f)})(files[i])}}

// Load a PSX-format texture DAR into the editor's darTextures map.
// Each entry's 2-byte hash (at bytes 0-1 of the entry header) matches the
// texture hash referenced by KMD faces, so we can drop them directly into
// darTextures and the existing KMD textured-render path picks them up.
//
// Returns silently — caller handles the post-load UI refresh.
function handlePsxTexDAR(u8, sourceName){
if(typeof PSXT_parseDAR !== "function" || typeof PSXT_decodeEntry !== "function"){
  console.warn("PSX texture viewer module not loaded — PSX DAR can't be decoded");
  return;
}
var entries = PSXT_parseDAR(u8);
var loaded = 0;
for(var ei=0; ei<entries.length; ei++){
  var e = entries[ei];
  var hash = u8[e.offset] | (u8[e.offset+1]<<8);
  if(darTextures[hash]){
    // Hash already loaded (probably from the other DAR of the pair). Skip.
    continue;
  }
  var r = PSXT_decodeEntry(u8, e.offset);
  if(!r.ok){
    console.log("PSX entry #"+ei+" decode failed: "+r.error);
    continue;
  }
  // Build a canvas the PC pipeline can use
  var canvas = document.createElement("canvas");
  canvas.width = r.w; canvas.height = r.h;
  var ctx = canvas.getContext("2d");
  var imgd = ctx.createImageData(r.w, r.h);
  for(var i=0; i<r.w*r.h; i++){
    var idx = r.pixels[i];
    var ci = idx * 3;
    var po = i * 4;
    imgd.data[po] = r.clut[ci];
    imgd.data[po+1] = r.clut[ci+1];
    imgd.data[po+2] = r.clut[ci+2];
    imgd.data[po+3] = 255;
  }
  ctx.putImageData(imgd, 0, 0);
  // Resolve the entry's TRUE name the same way the PSX Texture Viewer does:
  //   1. PSXT_reconstructFilename(hash, extWord) -> "11603.pcc" — the real
  //      on-disk filename extraction tools (MetalMintSolid etc.) produce.
  //      This is the canonical name for file lists / exports.
  //   2. PSXT_lookupName(hash) -> friendly decomp-harvested name when the
  //      hash is in the database (e.g. "sna_face2") — used for display.
  // Only falls back to the legacy generic psx_<hex> form if the viewer
  // module isn't loaded at all.
  var name = "psx_"+hash.toString(16).padStart(4,"0");
  var fileName = name + ".pcx";
  if(typeof PSXT_reconstructFilename === "function"){
    var _extWord = u8[e.offset+2] | (u8[e.offset+3]<<8);
    fileName = PSXT_reconstructFilename(hash, _extWord);   // e.g. "11603.pcc"
    name = fileName.replace(/\.[^.]+$/, "");               // e.g. "11603"
    if(typeof PSXT_lookupName === "function"){
      var _resolved = PSXT_lookupName(hash);
      if(_resolved && _resolved.indexOf("???") !== 0){
        // Friendly name known — prefer it for display. On a hash collision
        // ("name_a / name_b") take the first candidate (filename-safe).
        name = _resolved.split(" / ")[0];
      }
    }
  }
  darTextures[hash] = {name:name, canvas:canvas,
    tex: new THREE.CanvasTexture(canvas)};
  darTextures[hash].tex.flipY = false;
  darTextures[hash].tex.magFilter = THREE.NearestFilter;
  darTextures[hash].tex.minFilter = THREE.NearestFilter;
  // Slice the actual PCX bytes from the DAR entry. The DAR layout per entry:
  //   [8-byte preamble][PCX content...]
  // where bytes 4-7 of the preamble = PCX content size. The PCX section has
  // the SAME byte layout as PC PCX — including magic 12345 at byte 74-75 and
  // VRAM coords (px/py/cx/cy/nc) at bytes 78-87. Storing the PCX bytes here
  // lets parseVRAMSlots() decode coords correctly with no special-casing.
  var pcxSize = u8[e.offset+4] | (u8[e.offset+5]<<8) | (u8[e.offset+6]<<16) | (u8[e.offset+7]<<24);
  var pcxBytes = u8.subarray(e.offset + 8, e.offset + 8 + pcxSize);
  darRawFiles.push({
    name: fileName, data: new Uint8Array(pcxBytes),
    darSource: sourceName, isPsx: true, psxHash: hash
  });
  loaded++;
}
console.log("Loaded "+loaded+" PSX textures from "+sourceName);
}

function wallToVerts(w){
if(w.verts)return;
var y2=w.y2!==undefined?w.y2:w.y1;var h=w.h||2000;
w.verts=[{x:w.x1,y:w.y1,z:w.z1},{x:w.x2,y:y2,z:w.z2},{x:w.x2,y:y2+h,z:w.z2},{x:w.x1,y:w.y1+h,z:w.z1}]}

function floorToVerts(f){
if(f.verts)return;
var y=f.y1||0;
f.verts=[{x:f.x1,y:y,z:f.z1},{x:f.x2,y:y,z:f.z1},{x:f.x2,y:y,z:f.z2},{x:f.x1,y:y,z:f.z2}]}

var skewCornerObjs=[];
function rebuildSkewCorners(){
for(var i=0;i<skewCornerObjs.length;i++)sc3.remove(skewCornerObjs[i]);
skewCornerObjs=[];
if(!skewMode||!sc3)return;
function addCorners(verts,wallIdx,floorIdx){
for(var ci=0;ci<4;ci++){var v=verts[ci];
var isC1=(wallIdx>=0?skewWallIdx===wallIdx:skewFloorIdx===floorIdx)&&skewCorner===ci;
var isC2=(wallIdx>=0?skewWallIdx===wallIdx:skewFloorIdx===floorIdx)&&skewCorner2===ci;
var col=isC1||isC2?0x00ffff:wallIdx>=0?0xffff00:0xff8800;
var sz=isC1||isC2?0.25:0.2;
var cg=new THREE.SphereGeometry(sz,10,10);
var cm=new THREE.Mesh(cg,new THREE.MeshBasicMaterial({color:col,depthTest:false,transparent:true,opacity:0.9}));
cm.renderOrder=999;cm.position.set(v.x*S,v.y*S,v.z*S);
cm.userData={type:"skewcorner",wallIdx:wallIdx,floorIdx:floorIdx,corner:ci};
sc3.add(cm);skewCornerObjs.push(cm)}
// Draw edge line between selected corners
if((isC1||isC2)&&skewCorner>=0&&skewCorner2>=0){
var v1=verts[skewCorner],v2=verts[skewCorner2];
var elg=new THREE.BufferGeometry();elg.setAttribute("position",new THREE.Float32BufferAttribute([v1.x*S,v1.y*S,v1.z*S,v2.x*S,v2.y*S,v2.z*S],3));
var el=new THREE.Line(elg,new THREE.LineBasicMaterial({color:0x00ffff,depthTest:false,linewidth:2}));
el.renderOrder=999;sc3.add(el);skewCornerObjs.push(el)}}
for(var k in selW){if(k.indexOf("nw-")!==0)continue;
var idx=parseInt(k.substr(3));var w=newW[idx];if(!w||!w.verts)continue;
addCorners(w.verts,idx,-1)}
for(var fk in selF){if(fk.indexOf("nf-")!==0)continue;
var fidx=parseInt(fk.substr(3));var fl=newF[fidx];if(!fl||!fl.verts)continue;
addCorners(fl.verts,-1,fidx)}}

function clearKmdDeleted(){kmdDeletedFaces={};rebuildKMD();document.getElementById("coordinfo").textContent="All KMD faces restored"}

// Restore only the faces previously deleted from a specific KMD. Keys for
// per-KMD deletions are "kmdIdx-block-face"; legacy keys are "block-face"
// and can't be safely scoped, so they're left alone.
function restoreKmdFacesForIdx(kmdIdx){
var prefix=kmdIdx+"-";
var removed=0;
for(var k in kmdDeletedFaces){
// Match keys starting with "<kmdIdx>-" but not, e.g., "10-..." when looking for "1-"
if(k.indexOf(prefix)===0){var rest=k.substring(prefix.length);
// rest should be "block-face" (two integer segments)
if(/^\d+-\d+$/.test(rest)){delete kmdDeletedFaces[k];removed++;}}}
if(removed>0)logUndo("kmdRestore","Restore "+removed+" face(s) from "+(kmdFileNames[kmdIdx]||"KMD "+kmdIdx));
rebuildKMD();updateKMDList();
document.getElementById("coordinfo").textContent="Restored "+removed+" face(s) from "+(kmdFileNames[kmdIdx]||"KMD "+kmdIdx);}
function deleteKmdFaceUnderMouse(){delFaceMode=!delFaceMode;
var btn=document.querySelector('[data-delfacebtn]');if(btn)btn.style.background=delFaceMode?'#ff4488':'';if(btn)btn.style.color=delFaceMode?'#000':'#ff4488';
document.getElementById("coordinfo").textContent=delFaceMode?"DelFace ON: right-click faces to delete":"DelFace OFF"}
function selectTexture(hash){activeTexHash=parseInt(hash);updateTexPalette();rebuild()}
function applyTexToWall(idx){if(activeTexHash>=0&&newW[idx]){newW[idx].texHash=activeTexHash;logUndo("tex","Paint wall "+idx);rebuild();showProps()}}
function clearTexFromWall(idx){if(newW[idx]){newW[idx].texHash=-1;logUndo("tex","Clear wall tex "+idx);rebuild();showProps()}}
function setWallUV(idx,mode){if(newW[idx]){newW[idx].uvMode=mode;rebuild()}}
function setFloorUV(idx,mode){if(newF[idx]){newF[idx].uvMode=mode;rebuild()}}
function applyTexToFloor(idx){if(activeTexHash>=0&&newF[idx]){newF[idx].texHash=activeTexHash;logUndo("tex","Paint floor "+idx);rebuild();showProps()}}
function clearTexFromFloor(idx){if(newF[idx]){newF[idx].texHash=-1;logUndo("tex","Clear floor tex "+idx);rebuild();showProps()}}
function paintHZMWall(ai,ni){if(activeTexHash<0){alert("Select a texture first from the palette");return}
var nf=hzm.areas[ai]&&hzm.areas[ai].navfaces[ni];if(!nf)return;
// Update existing duplicate if one exists at same position, otherwise create new
for(var ei=0;ei<newW.length;ei++){var ew=newW[ei];
if(ew.x1===nf.x1&&ew.z1===nf.z1&&ew.x2===nf.x2&&ew.z2===nf.z2&&ew.y1===nf.y1){
ew.texHash=activeTexHash;ew.renderOnly=true;logUndo("tex","Update HZM wall tex "+ni);rebuild();showProps();return}}
// renderOnly:true means HZM rebuild skips this entry (collision/nav already exists in HZM)
newW.push({x1:nf.x1,z1:nf.z1,y1:nf.y1,x2:nf.x2,z2:nf.z2,y2:nf.y2,h:Math.max(nf.h1,nf.h2),flags:0,texHash:activeTexHash,renderOnly:true,targetAi:ai});
undoHist.push("w");logUndo("tex","Paint HZM wall "+ni);rebuild();showProps()}
function paintHZMFloor(ai,fi){if(activeTexHash<0){alert("Select a texture first from the palette");return}
var fl=hzm.areas[ai]&&hzm.areas[ai].floors[fi];if(!fl)return;
for(var ei2=0;ei2<newF.length;ei2++){var ef=newF[ei2];
if(ef.x1===fl.quads[0].x&&ef.z1===fl.quads[0].z&&ef.x2===fl.quads[1].x&&ef.z2===fl.quads[1].z&&ef.y1===fl.quads[0].y){
ef.texHash=activeTexHash;ef.renderOnly=true;logUndo("tex","Update HZM floor tex "+fi);rebuild();showProps();return}}
newF.push({x1:fl.quads[0].x,z1:fl.quads[0].z,y1:fl.quads[0].y,x2:fl.quads[1].x,z2:fl.quads[1].z,texHash:activeTexHash,renderOnly:true,targetAi:ai});
undoHist.push("f");logUndo("tex","Paint HZM floor "+fi);rebuild();showProps()}
function removeHZMWallTex(ai,ni){var nf=hzm.areas[ai]&&hzm.areas[ai].navfaces[ni];if(!nf)return;
for(var ei=newW.length-1;ei>=0;ei--){var ew=newW[ei];
if(ew.renderOnly&&ew.x1===nf.x1&&ew.z1===nf.z1&&ew.x2===nf.x2&&ew.z2===nf.z2&&ew.y1===nf.y1){
newW.splice(ei,1);logUndo("tex","Remove HZM wall tex "+ni);rebuild();showProps();return}}}
function removeHZMFloorTex(ai,fi){var fl=hzm.areas[ai]&&hzm.areas[ai].floors[fi];if(!fl)return;
for(var ei2=newF.length-1;ei2>=0;ei2--){var ef=newF[ei2];
if(ef.renderOnly&&ef.x1===fl.quads[0].x&&ef.z1===fl.quads[0].z&&ef.x2===fl.quads[1].x&&ef.z2===fl.quads[1].z&&ef.y1===fl.quads[0].y){
newF.splice(ei2,1);logUndo("tex","Remove HZM floor tex "+fi);rebuild();showProps();return}}}

function updateTexPalette(){var p=document.getElementById("texPalette");if(!p)return;
if(!darLoaded){p.innerHTML="";return}
var activeName=(activeTexHash>=0&&darTextures[activeTexHash])?' <span style="color:#ff0">'+darTextures[activeTexHash].name+'</span>':'';
var html=panelHeader("tex","Textures ("+Object.keys(darTextures).length+")","#44cc88",activeName);
if(panelCollapsed.tex){p.innerHTML=html;return}
html+='<div style="display:flex;flex-wrap:wrap;gap:2px;padding:4px;max-height:200px;overflow-y:auto">';
var keys=Object.keys(darTextures).sort(function(a,b){return darTextures[a].name.localeCompare(darTextures[b].name)});
for(var i=0;i<keys.length;i++){var t=darTextures[keys[i]];var isSel=parseInt(keys[i])===activeTexHash;
html+='<div onclick="selectTexture('+keys[i]+')" title="'+t.name+' ('+t.canvas.width+'x'+t.canvas.height+')" style="width:32px;height:32px;border:2px solid '+(isSel?'#ff0':'#1a2535')+';cursor:pointer;overflow:hidden">';
html+='<canvas width="32" height="32" id="tp_'+keys[i]+'" style="width:32px;height:32px"></canvas></div>'}
html+='</div>';p.innerHTML=html;
for(i=0;i<keys.length;i++){var cv3=document.getElementById("tp_"+keys[i]);
if(cv3){var ctx3=cv3.getContext("2d");ctx3.drawImage(darTextures[keys[i]].canvas,0,0,32,32)}}
updateVRAMPanel()}

function updateVRAMPanel(){var p=document.getElementById("vramPanel");if(!p)return;
if(!darLoaded||!darRawFiles||darRawFiles.length===0){p.innerHTML="";return}
var texSlots=parseVRAMSlots();
var totalPixelArea=0;for(var i=0;i<texSlots.length;i++)totalPixelArea+=texSlots[i].vw*texSlots[i].h;
var vramTotal=1024*512,fbArea=320*240*2;
var usedPct=totalPixelArea*100/vramTotal,fbPct=fbArea*100/vramTotal,freePct=Math.max(0,100-usedPct-fbPct);
var col=usedPct>70?"#cc4400":usedPct>50?"#ccaa00":"#44cc88";
// Run cheap collision check for side-panel badge (full analysis only when popup opens)
var conflictCount=0;
if(typeof getVRAMAnalysisSummary==="function"){
var sum=getVRAMAnalysisSummary();
conflictCount=sum.collisions+sum.clutCollisions+sum.tpageCrossings;}
var html='<div style="padding:4px;cursor:pointer" onclick="openVRAMPopup()"><b style="color:#ff8800">VRAM</b>';
html+=' <span style="font-size:9px;color:'+col+'">'+texSlots.length+' tex, '+Math.round(usedPct)+'% used</span>';
if(conflictCount>0)html+=' <span style="font-size:9px;color:#ff6644;background:#3a0a0a;padding:0 4px;border-radius:2px;margin-left:3px">⚠ '+conflictCount+' conflict'+(conflictCount===1?'':'s')+'</span>';
html+=' <span style="font-size:8px;color:#556">(click to expand)</span></div>';
html+='<div style="margin:2px 4px;height:10px;background:#111;border:1px solid #1a2535;border-radius:2px;overflow:hidden;display:flex;cursor:pointer" onclick="openVRAMPopup()">';
html+='<div style="width:'+fbPct+'%;background:#334;height:100%"></div>';
html+='<div style="width:'+usedPct+'%;background:'+col+';height:100%"></div>';
html+='<div style="width:'+freePct+'%;background:#0a0e14;height:100%"></div></div>';
html+='<div style="padding:2px 4px;margin-top:2px;cursor:pointer;font-size:9px;color:#b08cff;border-top:1px solid #1a2535" onclick="openCLUTPopup()">◧ <b>CLUT Inspector</b> <span style="color:#778">— palettes &amp; conflicts</span></div>';
p.innerHTML=html}

function parseVRAMSlots(){
var slots=[];
for(var i=0;i<darRawFiles.length;i++){var df=darRawFiles[i];
if(df.excluded)continue;
if(df.data.length<88)continue;var d=df.data;
var bpp=d[3],planes=d[65],w=(d[8]|d[9]<<8)+1,h=(d[10]|d[11]<<8)+1;
var magic=d[74]|d[75]<<8;if(magic!==12345)continue;
var px=d[78]|d[79]<<8,py=d[80]|d[81]<<8;
var cx=d[82]|d[83]<<8,cy=d[84]|d[85]<<8,nc=d[86]|d[87]<<8;
var isEga=bpp===1&&planes===4,isVga=bpp===8&&planes===1;
var vramW=isEga?Math.ceil(w/4):isVga?Math.ceil(w/2):w;
var nameNoExt=df.name.replace(/\.[^.]+$/,"");
// hash lookup key for darTextures. PSX entries carry their hash directly on
// the darRawFiles entry (the synthetic "psx_<hex>" name doesn't gv_strcode
// back to the original hash, so mgsHash(name) would miss). PC entries get
// the hash by name as before.
var hash=(df.psxHash!==undefined)?df.psxHash:(typeof mgsHash==="function"?mgsHash(nameNoExt):0);
slots.push({name:nameNoExt,hash:hash,px:px,py:py,vw:vramW,h:h,cx:cx,cy:cy,bpp:isEga?4:8,w:w,nc:nc,
pixelArea:vramW*h,clutArea:nc,darIdx:i,darSource:df.darSource||"",isImportTagged:!!df.isImport})}
return slots}

function closeVRAMPopup(){
var p=document.getElementById("vramPopup");if(p)p.remove();
// The magnify preview is a separate floating element. Clean it up too.
var mp=document.getElementById("vramMagnifyPreview");if(mp)mp.remove();}

// ─── Soft exclude: per-texture "don't pack me into VRAM or export" toggle ──
// excluded textures stay in darRawFiles (preserving the palette and any walls
// that reference them inside the editor) but are skipped by parseVRAMSlots
// AND by every texture-DAR export path. Toggle back at any time to restore.
// State lives on darRawFiles[i].excluded — no separate map needed.
function excludeTextureFromVRAM(darIdx){
if(!darRawFiles||!darRawFiles[darIdx])return;
darRawFiles[darIdx].excluded=true;
// Refresh UI: the VRAM popup, the side-panel summary bar, the texture palette
// (in case anything renders a "VRAM cost" badge per texture).
if(typeof updateVRAMPanel==="function")updateVRAMPanel();
if(typeof updateTexPalette==="function")updateTexPalette();
// Re-open the popup with the texture now in the Excluded section.
var existing=document.getElementById("vramPopup");
if(existing){closeVRAMPopup();openVRAMPopup();}}

function restoreExcludedTexture(darIdx){
if(!darRawFiles||!darRawFiles[darIdx])return;
darRawFiles[darIdx].excluded=false;
if(typeof updateVRAMPanel==="function")updateVRAMPanel();
if(typeof updateTexPalette==="function")updateTexPalette();
var existing=document.getElementById("vramPopup");
if(existing){closeVRAMPopup();openVRAMPopup();}}

// Toggle the import status of a loaded DAR. After toggling, the VRAM popup is
// re-rendered so collision warnings, repack button availability, and source
// coloring update immediately.
function toggleDARImport(darSource,isImport){
darImportFlags[darSource]=!!isImport;
// Also flip the isImport bit on each darRawFiles entry from this DAR so subsequent
// loads via parseVRAMSlots() pick up the tag consistently.
for(var i=0;i<darRawFiles.length;i++){
if(darRawFiles[i].darSource===darSource){
darRawFiles[i].isImport=!!isImport;}}
// Re-render the popup if open
var existing=document.getElementById("vramPopup");
if(existing){closeVRAMPopup();openVRAMPopup();}}

function openVRAMPopup(){
// Use the analysis layer so we get collision flags and source tagging
var summary=getVRAMAnalysisSummary();
var slots=summary.slots;
var totalPixelArea=0;for(var i=0;i<slots.length;i++)totalPixelArea+=slots[i].pixelArea;
var vramTotal=1024*512,fbArea=320*240*2;
var usedPct=totalPixelArea*100/vramTotal;
// Create popup overlay
var ov=document.createElement("div");ov.id="vramPopup";
ov.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:1000;display:flex;flex-direction:column;align-items:center;padding:20px;overflow-y:auto";
// Header — now includes collision/import summary
var hdr='<div style="color:#ff8800;font-size:16px;font-weight:bold;margin-bottom:8px">PS1 VRAM Layout — 1024×512 ('+Math.round(usedPct)+'% used)</div>';
// Status badges row
hdr+='<div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;justify-content:center">';
hdr+='<span style="color:#88aacc">'+summary.stage+' stage textures</span>';
if(summary.imported>0)hdr+='<span style="color:#ffaa44">'+summary.imported+' imported</span>';
if(summary.collisions>0)hdr+='<span style="background:#3a1a0a;color:#ff6644;padding:1px 6px;border-radius:2px">⚠ '+summary.collisions+' texture collision'+(summary.collisions===1?'':'s')+'</span>';
if(summary.clutCollisions>0)hdr+='<span style="background:#2a1a3a;color:#cc88ff;padding:1px 6px;border-radius:2px">⚠ '+summary.clutCollisions+' CLUT collision'+(summary.clutCollisions===1?'':'s')+'</span>';
if(summary.tpageCrossings>0)hdr+='<span style="background:#3a2a0a;color:#ffcc44;padding:1px 6px;border-radius:2px">⚠ '+summary.tpageCrossings+' TPAGE crossing'+(summary.tpageCrossings===1?'':'s')+'</span>';
hdr+='</div>';
// Legend
hdr+='<div style="display:flex;gap:14px;margin-bottom:10px;font-size:10px;color:#88aacc;flex-wrap:wrap;justify-content:center">';
hdr+='<span style="color:#334">■ Framebuffer</span>';
hdr+='<span style="color:#44cc88">■ Stage 4bpp</span>';
hdr+='<span style="color:#cc6644">■ Stage 8bpp</span>';
hdr+='<span style="color:#ffaa44">■ Imported</span>';
hdr+='<span style="color:#ff4444">■ Collision</span>';
hdr+='<span style="color:#888899">■ CLUT</span>';
hdr+='<label style="color:#88aacc;cursor:pointer"><input type="checkbox" id="vramShowRegions" checked style="vertical-align:middle"> Show repacker regions</label>';
hdr+='</div>';
// Close button
hdr+='<button onclick="closeVRAMPopup()" style="position:absolute;top:10px;right:20px;background:#661122;color:#ff6688;border:1px solid #ff3355;padding:4px 12px;cursor:pointer;font-size:12px;border-radius:3px">Close (ESC)</button>';
// CLUT Inspector button — opens the palette analysis layer (10b_clut_inspector.js)
hdr+='<button onclick="openCLUTPopup()" style="position:absolute;top:10px;left:20px;background:#2a1140;color:#cc99ff;border:1px solid #7733bb;padding:4px 12px;cursor:pointer;font-size:12px;border-radius:3px">◧ CLUT Inspector</button>';
// Canvas
hdr+='<canvas id="vramBigCanvas" width="1024" height="512" style="border:2px solid #1a2535;cursor:crosshair;image-rendering:pixelated;max-width:95vw"></canvas>';
hdr+='<div id="vramBigHover" style="color:#88aacc;font-size:12px;margin-top:6px;height:32px;text-align:center"></div>';
// Stats + analysis panel
hdr+='<div style="display:flex;gap:20px;margin-top:10px;width:100%;max-width:1024px">';
hdr+='<div style="flex:1;background:#0d1219;border:1px solid #1a2535;padding:8px;border-radius:4px;font-size:10px;color:#88aacc;max-height:400px;overflow-y:auto" id="vramTexList"></div>';
hdr+='<div style="flex:1;background:#0d1219;border:1px solid #1a2535;padding:8px;border-radius:4px;font-size:10px;color:#88aacc;max-height:400px;overflow-y:auto" id="vramOptPanel"></div>';
hdr+='</div>';
ov.innerHTML=hdr;document.body.appendChild(ov);
// ESC to close
ov.addEventListener("keydown",function(e){if(e.key==="Escape")ov.remove()});ov.tabIndex=0;ov.focus();
// Region toggle re-renders
document.getElementById("vramShowRegions").addEventListener("change",function(){drawVRAMCanvas(slots);});
// Initial draw
drawVRAMCanvas(slots);
// Texture list — collisions and imports sorted to top
renderVRAMTexList(slots);
renderVRAMAnalysisPanel(slots,summary,totalPixelArea,vramTotal,fbArea);}

// Draw the VRAM canvas. Pulled out as separate function so the region-overlay
// toggle can re-render without recreating the popup.
function drawVRAMCanvas(slots){
var cv=document.getElementById("vramBigCanvas");if(!cv)return;
var ctx=cv.getContext("2d");
ctx.fillStyle="#080810";ctx.fillRect(0,0,1024,512);
// Framebuffer
ctx.fillStyle="#1a1a2a";ctx.fillRect(0,0,320,240);ctx.fillRect(0,240,320,240);
ctx.strokeStyle="#333";ctx.lineWidth=0.5;ctx.strokeRect(0,0,320,240);ctx.strokeRect(0,240,320,240);
ctx.fillStyle="#556";ctx.font="10px monospace";ctx.fillText("FB1",140,120);ctx.fillText("FB2",140,360);
// Named region overlays (the repacker's init/stage/palettes regions)
var showRegions=document.getElementById("vramShowRegions");
if(showRegions&&showRegions.checked){
for(var rkey in VRAM_REGIONS){var r=VRAM_REGIONS[rkey];
ctx.fillStyle=r.color+"22";// very translucent
ctx.fillRect(r.x1,r.y1,r.x2-r.x1,r.y2-r.y1);
ctx.strokeStyle=r.color+"99";ctx.lineWidth=1;
ctx.strokeRect(r.x1+0.5,r.y1+0.5,r.x2-r.x1-1,r.y2-r.y1-1);
// Label in corner
ctx.fillStyle=r.color+"cc";ctx.font="bold 11px monospace";
ctx.fillText(r.label,r.x1+4,r.y1+13);}}
// Texture page grid
ctx.strokeStyle="#1a2535";ctx.lineWidth=0.5;
for(var i=0;i<=16;i++){ctx.beginPath();ctx.moveTo(i*64,0);ctx.lineTo(i*64,512);ctx.stroke()}
for(i=0;i<=2;i++){ctx.beginPath();ctx.moveTo(0,i*256);ctx.lineTo(1024,i*256);ctx.stroke()}
// Draw textures — color depends on source AND collision state
for(i=0;i<slots.length;i++){var t=slots[i];
var fillColor;
var hasCollision=t.collidesWith.length>0;
if(hasCollision)fillColor="#cc3322";// collision = red
else if(t.imported)fillColor=t.bpp===4?"#cc8833":"#bb7722";// imported = orange
else fillColor=t.bpp===4?"#226644":"#663322";// stage = subdued green/red
ctx.fillStyle=fillColor;
ctx.fillRect(t.px,t.py,Math.max(1,t.vw),Math.max(1,t.h));}
// Draw actual texture images over the colored blocks
for(i=0;i<slots.length;i++){var td=slots[i];
var tHash=(td.hash!==undefined)?td.hash:mgsHash(td.name);
if(darTextures[tHash]&&darTextures[tHash].canvas){
try{
ctx.globalAlpha=td.collidesWith.length>0?0.5:0.92;// dim colliding to show red beneath
ctx.drawImage(darTextures[tHash].canvas,td.px,td.py,Math.max(1,td.vw),Math.max(1,td.h));
ctx.globalAlpha=1.0;}
catch(de){ctx.globalAlpha=1.0}}}
// Texture borders — bright for collisions/imports so they pop
for(i=0;i<slots.length;i++){var tb=slots[i];
if(tb.collidesWith.length>0){ctx.strokeStyle="#ff4444";ctx.lineWidth=1.5;}
else if(tb.imported){ctx.strokeStyle="#ffaa44";ctx.lineWidth=1;}
else{ctx.strokeStyle=tb.bpp===4?"#44cc8866":"#cc664466";ctx.lineWidth=0.6;}
ctx.strokeRect(tb.px+0.3,tb.py+0.3,tb.vw-0.6,tb.h-0.6);}
// CLUT entries — distinct color, brighter outline if collision
for(i=0;i<slots.length;i++){var t2=slots[i];
ctx.fillStyle=t2.clutCollidesWith.length>0?"#ff66cc":"#888899";
ctx.fillRect(t2.cx,t2.cy,Math.max(1,Math.ceil(t2.nc/16)),1);}
// Hover handler — also drives a magnify preview that follows the cursor showing
// the actual texture pixels at large zoom. The preview is built lazily from the
// pre-decoded canvas in darTextures, falling back to a procedural placeholder for
// unrecognized hashes.
cv.onmousemove=function(e2){var r2=cv.getBoundingClientRect();
var sx2=1024/r2.width,sy2=512/r2.height;
var mx=Math.floor((e2.clientX-r2.left)*sx2),my=Math.floor((e2.clientY-r2.top)*sy2);
var hit=null;for(var j=0;j<slots.length;j++){var ts=slots[j];
if(mx>=ts.px&&mx<ts.px+ts.vw&&my>=ts.py&&my<ts.py+ts.h){hit=ts;break}}
var hv=document.getElementById("vramBigHover");if(!hv)return;
// Magnify preview: separate floating element near the cursor with the texture image.
// Created on demand; hidden when not over a slot.
var mp=document.getElementById("vramMagnifyPreview");
if(!mp){
mp=document.createElement("div");
mp.id="vramMagnifyPreview";
mp.style.cssText="position:fixed;pointer-events:none;z-index:10000;background:#0a0e14;border:2px solid #ff8800;padding:4px;border-radius:3px;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.8)";
document.body.appendChild(mp);}
if(hit){
var lines=[];
lines.push(hit.name+" ("+(hit.imported?"imported":"stage")+", "+hit.bpp+"bpp)");
lines.push(hit.w+"×"+hit.h+" pixels — VRAM ("+hit.px+","+hit.py+") size "+hit.vw+"×"+hit.h+" halfwords");
if(hit.collidesWith.length>0)lines.push("⚠ collides with: "+hit.collidesWith.join(", "));
if(hit.clutCollidesWith.length>0)lines.push("⚠ CLUT collides with: "+hit.clutCollidesWith.join(", "));
if(hit.crossesTPage)lines.push("⚠ crosses TPAGE boundary at column "+(Math.floor(hit.px/(hit.bpp===4?128:64))+1)*(hit.bpp===4?128:64));
hv.innerHTML=lines.join("<br>");
// Try to display the actual texture image. Prefer the hash carried on the slot
// (set by parseVRAMSlots); fall back to hashing the name for older callers.
var hash=(hit.hash!==undefined)?hit.hash:(typeof mgsHash==="function"?mgsHash(hit.name):null);
var texEntry=hash!==null&&darTextures&&darTextures[hash];
if(texEntry&&texEntry.canvas){
// Determine zoom: aim for a 3-4x preview, capped at 400px on each side
var srcW=texEntry.canvas.width,srcH=texEntry.canvas.height;
var maxDim=400;
var scale=Math.min(maxDim/srcW,maxDim/srcH,8);
if(scale<2)scale=2;
var dispW=Math.round(srcW*scale),dispH=Math.round(srcH*scale);
// Build a fresh preview canvas (NearestNeighbor scaling for crisp pixel art)
var pc=document.createElement("canvas");
pc.width=dispW;pc.height=dispH;
var pctx=pc.getContext("2d");
pctx.imageSmoothingEnabled=false;
pctx.drawImage(texEntry.canvas,0,0,dispW,dispH);
mp.innerHTML='';
mp.appendChild(pc);
var label=document.createElement("div");
label.style.cssText="color:#ff8800;font-family:monospace;font-size:10px;margin-top:3px;text-align:center";
label.textContent=hit.name+" ("+srcW+"×"+srcH+", "+hit.bpp+"bpp)";
mp.appendChild(label);
mp.style.display="block";
// Position near cursor but keep onscreen — flip to left/above if would clip
var px=e2.clientX+20,py=e2.clientY+20;
var vw=window.innerWidth,vh=window.innerHeight;
if(px+dispW+20>vw)px=e2.clientX-dispW-30;
if(py+dispH+30>vh)py=e2.clientY-dispH-40;
if(px<0)px=10;
if(py<0)py=10;
mp.style.left=px+"px";mp.style.top=py+"px";}
else{
// No decoded canvas — show the basic info still, but no preview
mp.style.display="none";}}
else{
mp.style.display="none";
var rg=getVRAMRegionAt(mx,my);
if(mx<320&&my<480)hv.textContent="Framebuffer ("+mx+","+my+")";
else if(rg)hv.textContent="Free in "+VRAM_REGIONS[rg].label+" region ("+mx+","+my+")";
else hv.textContent="Outside named region ("+mx+","+my+")";}};
// Hide the magnify preview when leaving the canvas entirely
cv.onmouseleave=function(){
var mp=document.getElementById("vramMagnifyPreview");
if(mp)mp.style.display="none";};}

// Render the side texture list, with collisions and imports sorted to top
function renderVRAMTexList(slots){
var p=document.getElementById("vramTexList");if(!p)return;
// Sort: collisions first, then imported, then by size descending
var sorted=slots.slice().sort(function(a,b){
var aPri=(a.collidesWith.length>0?0:a.imported?1:2);
var bPri=(b.collidesWith.length>0?0:b.imported?1:2);
if(aPri!==bPri)return aPri-bPri;
return b.pixelArea-a.pixelArea;});
var html='<div style="font-weight:bold;color:#ff8800;margin-bottom:4px">Textures ('+slots.length+')</div>';
html+='<div style="font-size:9px;color:#556;margin-bottom:4px">Sorted: collisions ⚠ → imported → by size · × excludes from VRAM and export</div>';
for(var i=0;i<sorted.length;i++){var s=sorted[i];
var bCol;
var prefix="";
if(s.collidesWith.length>0){bCol="#ff4444";prefix="⚠ ";}
else if(s.imported){bCol="#ffaa44";prefix="◆ ";}
else bCol=s.bpp===4?"#44cc88":"#cc6644";
html+='<div title="'+(s.collidesWith.length>0?"collides: "+s.collidesWith.join(", "):s.name)+'" style="display:flex;gap:4px;padding:1px 0;border-bottom:1px solid #111;font-size:10px;align-items:center">';
html+='<span style="color:'+bCol+';width:14px">'+prefix+s.bpp+'</span>';
html+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:'+bCol+'">'+s.name+'</span>';
html+='<span style="color:#556;width:65px;text-align:right">'+s.w+'×'+s.h+'</span>';
html+='<span style="color:#778;width:50px;text-align:right">('+s.px+','+s.py+')</span>';
html+='<span onclick="excludeTextureFromVRAM('+s.darIdx+')" style="color:#ff3355;cursor:pointer;padding:0 4px;font-size:13px;line-height:1" title="Exclude from VRAM and DAR export (reversible)">&times;</span>';
html+='</div>';}
// Excluded section — soft-removed textures still in darRawFiles but skipped by VRAM + export.
// Shown here so user can click ↺ to restore. Hidden entirely if nothing is excluded.
var excludedRows=[];
for(var ei=0;ei<darRawFiles.length;ei++){
var edf=darRawFiles[ei];
if(!edf.excluded)continue;
if(edf.data.length<88)continue;
var ed=edf.data;
var emagic=ed[74]|ed[75]<<8;if(emagic!==12345)continue;// keep the same PCX filter as parseVRAMSlots
var ew=(ed[8]|ed[9]<<8)+1,eh=(ed[10]|ed[11]<<8)+1;
var ename=edf.name.replace(/\.[^.]+$/,"");
excludedRows.push({darIdx:ei,name:ename,w:ew,h:eh});}
if(excludedRows.length>0){
html+='<div style="margin-top:10px;padding-top:6px;border-top:1px solid #1a2535;font-weight:bold;color:#886644">Excluded ('+excludedRows.length+')</div>';
html+='<div style="font-size:9px;color:#556;margin-bottom:4px">Not packed into VRAM, omitted from DAR export. ↺ to restore.</div>';
for(var xi=0;xi<excludedRows.length;xi++){var ex=excludedRows[xi];
html+='<div style="display:flex;gap:4px;padding:1px 0;border-bottom:1px solid #111;font-size:10px;align-items:center;opacity:0.55">';
html+='<span style="width:14px">·</span>';
html+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#776;text-decoration:line-through">'+ex.name+'</span>';
html+='<span style="color:#556;width:65px;text-align:right">'+ex.w+'×'+ex.h+'</span>';
html+='<span style="color:#778;width:50px;text-align:right">—</span>';
html+='<span onclick="restoreExcludedTexture('+ex.darIdx+')" style="color:#88cc44;cursor:pointer;padding:0 4px;font-size:13px;line-height:1" title="Restore: re-include in VRAM and DAR export">↺</span>';
html+='</div>';}}
p.innerHTML=html;}

// Render the right-side analysis panel — replaces the old optimizer panel
function renderVRAMAnalysisPanel(slots,summary,totalPixelArea,vramTotal,fbArea){
var p=document.getElementById("vramOptPanel");if(!p)return;
var html='<div style="font-weight:bold;color:#44cc88;margin-bottom:6px">VRAM Analysis</div>';
// Loaded DAR list — group darRawFiles by darSource. Lets the user mark which
// DARs are imported (i.e., relocatable during repack). Without this, all-from-one-load
// scenarios get tagged as stage-textures and collision detection misses overlaps
// between two normally-loaded DARs.
var darGroups={};
for(var dfi=0;dfi<darRawFiles.length;dfi++){
var src=darRawFiles[dfi].darSource||"(unknown source)";
if(!darGroups[src])darGroups[src]={count:0,isImport:!!darRawFiles[dfi].isImport};
darGroups[src].count++;
if(darRawFiles[dfi].isImport)darGroups[src].isImport=true;}
var darSources=Object.keys(darGroups);
if(darSources.length>1||(darSources.length===1&&darSources[0]!=="(unknown source)")){
html+='<div style="background:#0d1a26;padding:6px 8px;border-radius:2px;margin-bottom:8px;border:1px solid #1a2535">';
html+='<div style="font-size:10px;color:#88aacc;margin-bottom:4px"><b>Loaded DARs</b> <span style="color:#556;font-weight:normal">(check the box for character packs / mod DARs)</span></div>';
for(var dsi=0;dsi<darSources.length;dsi++){
var ds=darSources[dsi];
var g=darGroups[ds];
var isImport=g.isImport||darImportFlags[ds]||false;
html+='<label style="display:flex;align-items:center;gap:6px;font-size:10px;padding:2px 0;cursor:pointer">';
html+='<input type="checkbox" '+(isImport?"checked":"")+' onchange="toggleDARImport(\''+ds.replace(/'/g,"\\'")+'\',this.checked)">';
html+='<span style="color:'+(isImport?"#ffaa44":"#88aacc")+'">'+ds+'</span>';
html+='<span style="color:#556;font-size:9px">('+g.count+' PCX)</span>';
if(isImport)html+='<span style="color:#ffaa44;font-size:9px">→ treated as imported</span>';
html+='</label>';}
html+='</div>';}
// Conflict summary
if(summary.collisions===0&&summary.clutCollisions===0&&summary.tpageCrossings===0){
html+='<div style="background:#0a2a1a;color:#44cc88;padding:6px;border-radius:2px;margin-bottom:8px">';
html+='<b>✓ No conflicts detected</b><br><span style="font-size:9px;color:#556">All textures fit within VRAM cleanly. Adding this DAR to a stage should work in-game.</span>';
html+='</div>';}
else{
html+='<div style="background:#2a1a0a;color:#ff8866;padding:6px;border-radius:2px;margin-bottom:8px">';
html+='<b>⚠ Conflicts detected</b><br>';
if(summary.collisions>0)html+='<span style="font-size:10px">• '+summary.collisions+' texture'+(summary.collisions===1?'':'s')+' overlap in VRAM (last-write wins → wrong textures will appear in-game)</span><br>';
if(summary.clutCollisions>0)html+='<span style="font-size:10px">• '+summary.clutCollisions+' CLUT collision'+(summary.clutCollisions===1?'':'s')+' (palette overwrites → wrong colors)</span><br>';
if(summary.tpageCrossings>0)html+='<span style="font-size:10px">• '+summary.tpageCrossings+' texture'+(summary.tpageCrossings===1?'':'s')+' cross TPAGE column boundaries (will render with garbage on one side)</span><br>';
// Auto-repack button — kicks off the in-editor port of WantedThing's repacker.
// Only useful when imported textures are present. Greyed out otherwise.
var canRepack=summary.imported>0;
html+='<div style="margin-top:8px"><button onclick="runVRAMRepack()" '+(canRepack?'':'disabled')+' class="btn" style="background:'+(canRepack?'#1a3a1a':'#1a1a1a')+';color:'+(canRepack?'#44ccaa':'#556')+';border:1px solid '+(canRepack?'#2a5a2a':'#1a2535')+';padding:4px 12px;font-size:11px;cursor:'+(canRepack?'pointer':'not-allowed')+'">⚙ Auto-Repack Imported Textures</button>';
if(!canRepack)html+='<span style="font-size:9px;color:#556;margin-left:8px">Import a character pack to enable</span>';
html+='<span style="font-size:9px;color:#778;margin-left:8px">→ rewrites PCX header coords to avoid collisions</span></div>';
html+='</div>';}
// Region status — how full each named region is
html+='<div style="font-weight:bold;color:#44cc88;margin-top:8px;margin-bottom:4px">Region Usage</div>';
html+='<div style="font-size:9px;color:#556;margin-bottom:4px">These are the regions the WantedThing repacker uses for placement.</div>';
for(var rkey in VRAM_REGIONS){var rg=VRAM_REGIONS[rkey];
var rArea=(rg.x2-rg.x1)*(rg.y2-rg.y1);
var rUsed=0;
for(var i=0;i<slots.length;i++){var s=slots[i];
// Count area of this slot that falls inside this region
var ox1=Math.max(s.px,rg.x1),oy1=Math.max(s.py,rg.y1);
var ox2=Math.min(s.px+s.vw,rg.x2),oy2=Math.min(s.py+s.h,rg.y2);
if(ox2>ox1&&oy2>oy1)rUsed+=(ox2-ox1)*(oy2-oy1);}
var rPct=rArea>0?Math.round(rUsed*100/rArea):0;
var rColor=rPct>80?"#cc4400":rPct>50?"#ccaa00":"#44cc88";
html+='<div style="display:flex;gap:6px;padding:2px 0;font-size:10px">';
html+='<span style="color:'+rg.color+';font-weight:bold;width:70px">'+rg.label+'</span>';
html+='<span style="flex:1;color:#778">('+rg.x1+','+rg.y1+')-('+rg.x2+','+rg.y2+')</span>';
html+='<span style="color:'+rColor+';width:40px;text-align:right">'+rPct+'%</span>';
html+='</div>';}
// 8bpp savings hint (preserve the useful optimizer info from before)
var tex8=slots.filter(function(s2){return s2.bpp===8});
if(tex8.length>0){
var sav8=0;for(i=0;i<tex8.length;i++)sav8+=tex8[i].pixelArea/2;
html+='<div style="margin-top:8px;border-top:1px solid #1a2535;padding-top:6px">';
html+='<div style="font-weight:bold;color:#cc6644">'+tex8.length+' textures at 8bpp</div>';
html+='<div style="font-size:9px;color:#778">Converting to 4bpp would save '+Math.round(sav8)+' px ('+Math.round(sav8*100/vramTotal)+'%) — but limits to 16 colors each.</div>';
html+='</div>';}
// Capacity summary
var maxCap=vramTotal-fbArea;
var remaining=maxCap-totalPixelArea;
html+='<div style="margin-top:8px;border-top:1px solid #1a2535;padding-top:6px">';
html+='<div><b>Capacity:</b> '+maxCap+' px available</div>';
html+='<div><b>Used:</b> '+totalPixelArea+' px</div>';
html+='<div style="color:'+(remaining>0?"#44cc88":"#cc4400")+'"><b>Free:</b> '+remaining+' px ('+Math.round(remaining*100/vramTotal)+'%)</div>';
html+='</div>';
p.innerHTML=html;}

function findVRAMGaps(slots){
// Simple gap finder: scan columns in the texture region (X>=320)
var gaps=[];
// Create occupancy grid (coarse: 16px cells)
var cellW=16,cellH=16;
var gridW=1024/cellW,gridH=512/cellH;
var grid=[];for(var y=0;y<gridH;y++){grid[y]=[];for(var x=0;x<gridW;x++)grid[y][x]=false}
// Mark framebuffer
for(y=0;y<480/cellH;y++)for(x=0;x<320/cellW;x++)grid[y][x]=true;
// Mark textures
for(var i=0;i<slots.length;i++){var s=slots[i];
var sx1=Math.floor(s.px/cellW),sy1=Math.floor(s.py/cellH);
var sx2=Math.ceil((s.px+s.vw)/cellW),sy2=Math.ceil((s.py+s.h)/cellH);
for(y=sy1;y<sy2&&y<gridH;y++)for(x=sx1;x<sx2&&x<gridW;x++)grid[y][x]=true}
// Find empty rectangles (simplified: count empty cells)
var emptyCells=0;
for(y=0;y<gridH;y++)for(x=0;x<gridW;x++)if(!grid[y][x])emptyCells++;
if(emptyCells>0)gaps.push({w:emptyCells*cellW,h:cellH,cells:emptyCells});
return gaps}

// ==================== CAMERA ANGLE VISUALIZATION ====================
function rebuildCamAngles(){
for(var i=0;i<camAngleObjs.length;i++)if(sc3)sc3.remove(camAngleObjs[i]);
camAngleObjs=[];
if(!showCamAngles||!sc3||camAngles.length===0)return;
for(var i=0;i<camAngles.length;i++){var ca=camAngles[i];var isSel=selCamAngle===i;
var col=ca.type==="fixed"?0xff8800:0x00aaff;
if(isSel)col=0xffffff;
// Draw bound box
if(ca.bound){var b=ca.bound;
var bw=(b.x2-b.x1)*S,bh=(b.y2-b.y1)*S,bd=(b.z2-b.z1)*S;
if(bw>0&&bd>0){
var bg=new THREE.BoxGeometry(Math.abs(bw),Math.abs(bh),Math.abs(bd));
var bm=new THREE.Mesh(bg,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:isSel?0.15:0.06,side:THREE.DoubleSide}));
bm.position.set((b.x1+b.x2)/2*S,(b.y1+b.y2)/2*S,(b.z1+b.z2)/2*S);
bm.userData={type:"camangle",camIdx:i};sc3.add(bm);camAngleObjs.push(bm);
// Wireframe edges
var be=new THREE.BoxHelper(bm,col);be.userData={type:"camangle",camIdx:i};
sc3.add(be);camAngleObjs.push(be)}}
// Draw camera frustum/direction for tracking cameras
if(ca.rot&&ca.bound){
var tcx2=(ca.bound.x1+ca.bound.x2)/2*S;
var tcy2=Math.max(ca.bound.y1,0)*S;
var tcz2=(ca.bound.z1+ca.bound.z2)/2*S;
var pRad2=ca.rot.pitch/4096*Math.PI*2;
var yRad2=ca.rot.yaw/4096*Math.PI*2;
var dist=(ca.track||5000)*S;
var camPx=tcx2-Math.sin(yRad2)*dist*Math.cos(pRad2);
var camPy=tcy2+dist*Math.sin(pRad2);
var camPz=tcz2-Math.cos(yRad2)*dist*Math.cos(pRad2);
// Camera icon
var camG=new THREE.ConeGeometry(0.3,0.6,4);
var camM=new THREE.Mesh(camG,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.8}));
camM.position.set(camPx,camPy,camPz);camM.rotation.x=Math.PI;
camM.userData={type:"camangle",camIdx:i};sc3.add(camM);camAngleObjs.push(camM);
// Line from camera to target center
var vlg=new THREE.BufferGeometry();vlg.setAttribute("position",new THREE.Float32BufferAttribute([camPx,camPy,camPz,tcx2,tcy2,tcz2],3));
var vll=new THREE.Line(vlg,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.5}));
sc3.add(vll);camAngleObjs.push(vll)}
// Fixed camera: draw line from position to target
if(ca.type==="fixed"&&ca.setPos&&ca.setTarget){
var sp=ca.setPos,st=ca.setTarget;
// Camera icon at position
var fcG=new THREE.ConeGeometry(0.3,0.6,4);
var fcM=new THREE.Mesh(fcG,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.8}));
fcM.position.set(sp.x*S,sp.y*S,sp.z*S);fcM.rotation.x=Math.PI;
fcM.userData={type:"camangle",camIdx:i};sc3.add(fcM);camAngleObjs.push(fcM);
// Line to target
var ftlg=new THREE.BufferGeometry();ftlg.setAttribute("position",new THREE.Float32BufferAttribute([sp.x*S,sp.y*S,sp.z*S,st.x*S,st.y*S,st.z*S],3));
var ftll=new THREE.Line(ftlg,new THREE.LineBasicMaterial({color:col,linewidth:2}));
sc3.add(ftll);camAngleObjs.push(ftll);
// Target sphere
var tsg=new THREE.SphereGeometry(0.15,6,6);
var tsm=new THREE.Mesh(tsg,new THREE.MeshBasicMaterial({color:0xff4444}));
tsm.position.set(st.x*S,st.y*S,st.z*S);sc3.add(tsm);camAngleObjs.push(tsm)}
// Label
var labelPos=ca.bound?{x:(ca.bound.x1+ca.bound.x2)/2*S,y:ca.bound.y2*S+1.5,z:(ca.bound.z1+ca.bound.z2)/2*S}:
ca.setPos?{x:ca.setPos.x*S,y:ca.setPos.y*S+0.8,z:ca.setPos.z*S}:null;
if(labelPos){var lc3=document.createElement("canvas");lc3.width=200;lc3.height=24;
var lctx3=lc3.getContext("2d");lctx3.fillStyle=isSel?"#fff":"#"+col.toString(16).padStart(6,"0");
lctx3.font="10px monospace";lctx3.fillText(ca.proc+" ("+(ca.type==="fixed"?"fixed":"track")+")",2,14);
var lt3=new THREE.CanvasTexture(lc3);var ls3=new THREE.Sprite(new THREE.SpriteMaterial({map:lt3,transparent:true}));
ls3.scale.set(1.5,0.2,1);ls3.position.set(labelPos.x,labelPos.y,labelPos.z);
sc3.add(ls3);camAngleObjs.push(ls3)}}
// Rebuild drag handles for the selected camera (if any)
rebuildCamHandles()}

// Drag handles for the selected fixed camera angle's pos + target
function rebuildCamHandles(){
for(var i=0;i<camHandleObjs.length;i++)if(sc3)sc3.remove(camHandleObjs[i].mesh);
camHandleObjs=[];
if(selCamAngle<0||!sc3||!camAngles[selCamAngle])return;
var ca=camAngles[selCamAngle];
if(ca.type!=="fixed"||!ca.setPos||!ca.setTarget)return;
// Camera position handle (cyan)
var hg=new THREE.SphereGeometry(0.5,12,12);
var hpm=new THREE.Mesh(hg,new THREE.MeshBasicMaterial({color:0x00ccff,transparent:true,opacity:0.85}));
hpm.position.set(ca.setPos.x*S,ca.setPos.y*S,ca.setPos.z*S);
hpm.userData={type:"camhandle",handle:"pos",camIdx:selCamAngle};
sc3.add(hpm);camHandleObjs.push({type:"campos",mesh:hpm});
// Target handle (red)
var htm=new THREE.Mesh(hg.clone(),new THREE.MeshBasicMaterial({color:0xff4444,transparent:true,opacity:0.85}));
htm.position.set(ca.setTarget.x*S,ca.setTarget.y*S,ca.setTarget.z*S);
htm.userData={type:"camhandle",handle:"tgt",camIdx:selCamAngle};
sc3.add(htm);camHandleObjs.push({type:"camtarget",mesh:htm});
// Brighter line between them while selected
var hlg=new THREE.BufferGeometry();
hlg.setAttribute("position",new THREE.Float32BufferAttribute([ca.setPos.x*S,ca.setPos.y*S,ca.setPos.z*S,ca.setTarget.x*S,ca.setTarget.y*S,ca.setTarget.z*S],3));
var hll=new THREE.Line(hlg,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.6}));
hll.userData={type:"camhandle_line"};
sc3.add(hll);camHandleObjs.push({type:"line",mesh:hll});}

function selectCamAngle(idx){selCamAngle=idx;rebuildCamAngles();showCamAngleProps()}

function showCamAngleProps(){if(selCamAngle<0)return;
var ca=camAngles[selCamAngle];var p=document.getElementById("propPanel");if(!p)return;
p.style.display="block";
// helpers for paired number+slider fields
var ni='style="width:58px;background:#0a0e14;color:#00ccff;border:1px solid #1a2535;font-size:10px;font-family:monospace;padding:1px 2px;border-radius:2px"';
var sl='style="width:130px;vertical-align:middle"';
function nf(id,val,mn,mx,st){
return '<input type="number" id="'+id+'" value="'+val+'" '+ni+' oninput="var s=document.getElementById(\''+id+'R\');if(s)s.value=this.value"> '+
'<input type="range" id="'+id+'R" min="'+mn+'" max="'+mx+'" step="'+(st||1)+'" value="'+Math.min(mx,Math.max(mn,val))+'" '+sl+' oninput="document.getElementById(\''+id+'\').value=this.value"><br>';}
var html='<div style="padding:6px">';
html+='<b style="color:#00aaff">In-Game Camera</b><br>';
html+='<span style="color:#446688;font-size:9px">proc: '+ca.proc+' ('+ca.type+')</span><br><br>';
if(ca.type==="tracking"){
if(ca.bound){
html+='<b style="color:#556;font-size:9px">BOUND BOX</b><br>';
html+='X1: '+nf("cax1",ca.bound.x1,-30000,30000,250);
html+='Y1: '+nf("cay1",ca.bound.y1,-30000,30000,250);
html+='Z1: '+nf("caz1",ca.bound.z1,-30000,30000,250);
html+='X2: '+nf("cax2",ca.bound.x2,-30000,30000,250);
html+='Y2: '+nf("cay2",ca.bound.y2,-30000,30000,250);
html+='Z2: '+nf("caz2",ca.bound.z2,-30000,30000,250);}
if(ca.limit){
html+='<b style="color:#556;font-size:9px">LIMIT</b><br>';
html+='X1: '+nf("clx1",ca.limit.x1,-30000,30000,250);
html+='Y1: '+nf("cly1",ca.limit.y1,-30000,30000,250);
html+='Z1: '+nf("clz1",ca.limit.z1,-30000,30000,250);
html+='X2: '+nf("clx2",ca.limit.x2,-30000,30000,250);
html+='Y2: '+nf("cly2",ca.limit.y2,-30000,30000,250);
html+='Z2: '+nf("clz2",ca.limit.z2,-30000,30000,250);}
if(ca.rot){
html+='<b style="color:#556;font-size:9px">ROTATION (4096=360°)</b><br>';
html+='Pitch: '+nf("capit",ca.rot.pitch,0,4095,1);
html+='Yaw: '+nf("cayaw",ca.rot.yaw,0,4095,1)+'<span style="color:#556;font-size:9px"> → '+(Math.round(ca.rot.yaw/4096*360))+'°</span><br>';
html+='Roll: '+nf("caroll",ca.rot.roll,0,4095,1);}
if(ca.track!==undefined){
html+='<b style="color:#556;font-size:9px">TRACK DIST</b><br>';
html+='Dist: '+nf("catrack",ca.track,0,20000,100);}}
if(ca.type==="fixed"){
html+='<div style="background:#0a1a2a;padding:3px 5px;margin:2px 0;border-radius:2px;font-size:9px;color:#88aabb">';
html+='💡 <b style="color:#00ccff">Cyan sphere</b> = camera position. <b style="color:#ff4444">Red sphere</b> = look target.<br>';
html+='Drag handles in viewport. Hold <b>Shift</b> while dragging to adjust Y/height.';
html+='</div>';
if(ca.setPos){
html+='<b style="color:#00ccff;font-size:9px">CAM POSITION</b><br>';
html+='X: '+nf("cspx",ca.setPos.x,-30000,30000,250);
html+='Y: '+nf("cspy",ca.setPos.y,-10000,20000,250);
html+='Z: '+nf("cspz",ca.setPos.z,-30000,30000,250);}
if(ca.setTarget){
html+='<b style="color:#ff4444;font-size:9px">LOOK AT TARGET</b><br>';
html+='X: '+nf("cstx",ca.setTarget.x,-30000,30000,250);
html+='Y: '+nf("csty",ca.setTarget.y,-10000,20000,250);
html+='Z: '+nf("cstz",ca.setTarget.z,-30000,30000,250);}
if(ca.bound){
html+='<b style="color:#556;font-size:9px">BOUND</b><br>';
html+='X1: '+nf("cax1",ca.bound.x1,-30000,30000,250);
html+='Z1: '+nf("caz1",ca.bound.z1,-30000,30000,250);
html+='X2: '+nf("cax2",ca.bound.x2,-30000,30000,250);
html+='Z2: '+nf("caz2",ca.bound.z2,-30000,30000,250);}}
// Zone reference dropdown — informational, helps identify which trigger zone this camera belongs to
html+='<br><b style="color:#556;font-size:9px">ASSOCIATED ZONE</b> <span style="color:#446;font-size:8px">(from trap/ntrap zones in this stage)</span><br>';
html+='<select id="caZoneRef" style="background:#0a0e14;color:#88ccff;border:1px solid #1a2535;font-size:10px;padding:1px 3px;width:170px;margin-bottom:4px">';
html+='<option value="">— none —</option>';
var zoneNames=[];
for(var ti=0;ti<trapZones.length;ti++){var zn=trapZones[ti].zoneName;if(zoneNames.indexOf(zn)<0)zoneNames.push(zn)}
zoneNames.sort();
for(var zi=0;zi<zoneNames.length;zi++){
var zsel=ca.zoneRef===zoneNames[zi]?' selected':'';
html+='<option value="'+zoneNames[zi]+'"'+zsel+'>'+zoneNames[zi]+'</option>';}
html+='</select><br>';
html+='<button onclick="applyCamAngleProps('+selCamAngle+')" class="btn" style="margin-top:4px;color:#00ccff">Apply</button> ';
html+='<button onclick="previewCamAngle('+selCamAngle+')" class="btn" style="margin-top:4px;color:#00aaff">👁 Preview</button>';
if(camPreviewMode)html+=' <button onclick="exitCamPreview()" class="btn danger" style="margin-top:4px">Exit</button>';
if(ca.modified)html+='<br><span style="color:#ffaa00;font-size:9px">★ Modified — ExpGCL to save</span>';
html+='</div>';p.innerHTML=html}

function applyCamAngleProps(idx){
var ca=camAngles[idx];
function iv(id){var el=document.getElementById(id);return el?parseInt(el.value)||0:null}
if(ca.type==="tracking"){
if(ca.bound&&iv("cax1")!==null){ca.bound.x1=iv("cax1");ca.bound.y1=iv("cay1");ca.bound.z1=iv("caz1");ca.bound.x2=iv("cax2");ca.bound.y2=iv("cay2");ca.bound.z2=iv("caz2")}
if(ca.limit&&iv("clx1")!==null){ca.limit.x1=iv("clx1");ca.limit.y1=iv("cly1");ca.limit.z1=iv("clz1");ca.limit.x2=iv("clx2");ca.limit.y2=iv("cly2");ca.limit.z2=iv("clz2")}
if(ca.rot&&iv("cayaw")!==null){ca.rot.pitch=iv("capit")||0;ca.rot.yaw=iv("cayaw")||0;ca.rot.roll=iv("caroll")||0}
if(ca.track!==undefined&&iv("catrack")!==null)ca.track=iv("catrack")}
if(ca.type==="fixed"){
if(ca.setPos&&iv("cspx")!==null){ca.setPos.x=iv("cspx");ca.setPos.y=iv("cspy");ca.setPos.z=iv("cspz")}
if(ca.setTarget&&iv("cstx")!==null){ca.setTarget.x=iv("cstx");ca.setTarget.y=iv("csty");ca.setTarget.z=iv("cstz")}
if(ca.bound&&iv("cax1")!==null){ca.bound.x1=iv("cax1");ca.bound.z1=iv("caz1");ca.bound.x2=iv("cax2");ca.bound.z2=iv("caz2")}}
// Zone reference (informational, helps identify trap zone this camera goes with)
var zEl=document.getElementById("caZoneRef");if(zEl)ca.zoneRef=zEl.value||"";
ca.modified=true;
logUndo("edit","Edit camera "+ca.proc);
rebuildCamAngles();showCamAngleProps();
document.getElementById("coordinfo").textContent="Camera '"+ca.proc+"' updated — export GCL to write changes"}

function previewCamAngle(idx){
var ca=camAngles[idx];
camPreviewSaved={tgt:cTgt.clone(),theta:sph.theta,phi:sph.phi,radius:sph.radius};
camPreviewMode=true;
if(ca.type==="fixed"&&ca.setPos&&ca.setTarget){
// Fixed camera: orbit target = look-at target, compute spherical from offset
cTgt.set(ca.setTarget.x*S,ca.setTarget.y*S,ca.setTarget.z*S);
var dx=ca.setPos.x*S-cTgt.x,dy=ca.setPos.y*S-cTgt.y,dz=ca.setPos.z*S-cTgt.z;
sph.radius=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
sph.phi=Math.acos(Math.max(-1,Math.min(1,dy/sph.radius)));
sph.theta=Math.atan2(dz,dx);
uCam();drawCamGizmo()}
else if(ca.rot&&ca.bound){
// Tracking camera: target = center of bound at ground, camera elevated behind
var tcx=(ca.bound.x1+ca.bound.x2)/2;
var tcz=(ca.bound.z1+ca.bound.z2)/2;
var tcy=Math.max(ca.bound.y1,0);
var pRad=ca.rot.pitch/4096*Math.PI*2;
var yRad=ca.rot.yaw/4096*Math.PI*2;
var dist=(ca.track||5000)*S;
cTgt.set(tcx*S,tcy*S,tcz*S);
// Camera offset from target (same math as visualization)
var cdx=-Math.sin(yRad)*dist*Math.cos(pRad);
var cdy=dist*Math.sin(pRad);
var cdz=-Math.cos(yRad)*dist*Math.cos(pRad);
// Convert to uCam's spherical: x=r*sin(phi)*cos(theta), y=r*cos(phi), z=r*sin(phi)*sin(theta)
sph.radius=Math.sqrt(cdx*cdx+cdy*cdy+cdz*cdz)||1;
sph.phi=Math.acos(Math.max(-1,Math.min(1,cdy/sph.radius)));
sph.theta=Math.atan2(cdz,cdx);
uCam();drawCamGizmo()}
showCamAngleProps();document.getElementById("coordinfo").textContent="CAMERA PREVIEW: "+ca.proc+" — click Exit Preview to return"}

function exitCamPreview(){if(!camPreviewSaved)return;
cTgt.copy(camPreviewSaved.tgt);sph.theta=camPreviewSaved.theta;sph.phi=camPreviewSaved.phi;sph.radius=camPreviewSaved.radius;
camPreviewMode=false;camPreviewSaved=null;uCam();showCamAngleProps();
document.getElementById("coordinfo").textContent="Camera preview exited"}

// ==================== ASSET IMPORT SYSTEM ====================
function openImportDAR(){document.getElementById("importDarFi").click()}
function openImportKMD(){document.getElementById("importKmdFi").click()}
function openImportPCX(){document.getElementById("importPcxFi").click()}

function handleImportDAR(files){
for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){var darFiles=parseDar(e.target.result);
importCatalog=darFiles.map(function(df){return{name:df.name,data:new Uint8Array(df.data),size:df.data.length,checked:false,
isKmd:df.name.endsWith(".kmd"),isPcx:df.name.endsWith(".pcx")}});
showImportCatalog(f.name)};r.readAsArrayBuffer(f)})(files[i])}}

function showImportCatalog(darName){
var ov=document.createElement("div");ov.id="importPopup";
ov.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:1000;display:flex;flex-direction:column;align-items:center;padding:20px;overflow-y:auto";
var html='<div style="color:#00ccff;font-size:16px;font-weight:bold;margin-bottom:8px">Import from: '+darName+'</div>';
html+='<div style="display:flex;gap:8px;margin-bottom:8px">';
html+='<button onclick="importSelectAll(true)" style="background:#1a3050;color:#88aacc;border:1px solid #1a2535;padding:3px 8px;cursor:pointer;font-size:10px">Select All KMD</button>';
html+='<button onclick="importSelectAll(false)" style="background:#1a3050;color:#88aacc;border:1px solid #1a2535;padding:3px 8px;cursor:pointer;font-size:10px">Deselect All</button>';
html+='<button onclick="doImportSelected()" style="background:#00ccff;color:#000;border:none;padding:4px 16px;cursor:pointer;font-size:11px;font-weight:bold">Import Selected</button>';
html+='<button onclick="document.getElementById(\'importPopup\').remove()" style="background:#661122;color:#ff6688;border:1px solid #ff3355;padding:3px 8px;cursor:pointer;font-size:10px">Cancel</button>';
html+='</div>';
html+='<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:900px;max-height:70vh;overflow-y:auto;background:#0d1219;padding:8px;border:1px solid #1a2535;border-radius:4px">';
for(var i=0;i<importCatalog.length;i++){var f=importCatalog[i];
var col=f.isKmd?"#8866cc":f.isPcx?"#44cc88":"#556";
var sizeStr=f.size>1024?(f.size/1024).toFixed(0)+"KB":f.size+"B";
html+='<label style="display:flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid #1a2535;border-radius:3px;cursor:pointer;font-size:10px;color:'+col+';min-width:180px">';
html+='<input type="checkbox" id="ic_'+i+'" onchange="importCatalog['+i+'].checked=this.checked">';
html+=f.name+' <span style="color:#556;font-size:8px">'+sizeStr+'</span></label>'}
html+='</div>';
ov.innerHTML=html;document.body.appendChild(ov)}

function importSelectAll(kmdsOnly){
for(var i=0;i<importCatalog.length;i++){
importCatalog[i].checked=kmdsOnly?importCatalog[i].isKmd:false;
var el=document.getElementById("ic_"+i);if(el)el.checked=importCatalog[i].checked}}

function doImportSelected(){
var selected=importCatalog.filter(function(f){return f.checked});
if(selected.length===0){alert("Nothing selected");return}
var kmds=selected.filter(function(f){return f.isKmd});
var pcxs=selected.filter(function(f){return f.isPcx});
// Import KMDs
for(var i=0;i<kmds.length;i++){
importedModels.push({name:kmds[i].name,data:kmds[i].data,source:"DAR import"});
var ab=kmds[i].data.buffer.slice(kmds[i].data.byteOffset,kmds[i].data.byteOffset+kmds[i].data.byteLength);
mdlSubModels[kmds[i].name]={buf:ab,name:kmds[i].name}}
// Import PCXs
for(i=0;i<pcxs.length;i++){addImportedTexture(pcxs[i].name,pcxs[i].data,"DAR import")}
// Auto-trace: find textures needed by imported KMDs
if(kmds.length>0&&pcxs.length===0){
var neededHashes=new Set();
for(i=0;i<kmds.length;i++){
var kd=loadKMD(kmds[i].data.buffer.slice(kmds[i].data.byteOffset,kmds[i].data.byteOffset+kmds[i].data.byteLength));
if(kd.faceList)for(var j=0;j<kd.faceList.length;j++)neededHashes.add(kd.faceList[j].hash)}
// Check which hashes are NOT in current darTextures
var missingHashes=[];neededHashes.forEach(function(h){if(!darTextures[h])missingHashes.push(h)});
if(missingHashes.length>0){
var msg=kmds.length+" model(s) imported. "+missingHashes.length+" textures not found in current stage DARs.";
msg+="\n\nWant to search the source DAR for matching textures?";
if(confirm(msg)){
// Search importCatalog for matching PCXs
var found=0;
for(i=0;i<importCatalog.length;i++){var cf=importCatalog[i];
if(!cf.isPcx)continue;
var nameNoExt=cf.name.replace(/\.[^.]+$/,"");
var h2=mgsHash(nameNoExt);
if(missingHashes.indexOf(h2)>=0){addImportedTexture(cf.name,cf.data,"auto-traced");found++}}
alert("Found "+found+" matching textures. "+(missingHashes.length-found)+" still missing.")}}}
document.getElementById("importPopup").remove();
rebuildSubModels();rebuildGCLVis();updateImportPanel();updateTexPalette()}

function addImportedTexture(name,data,source){
var nameNoExt=name.replace(/\.[^.]+$/,"");
var hash=mgsHash(nameNoExt);
try{var canvas=decodePcx(data);
var tex=new THREE.CanvasTexture(canvas);tex.flipY=false;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;
// Read current VRAM position from PCX header
var px=data[78]|data[79]<<8,py=data[80]|data[81]<<8;
importedTextures.push({name:nameNoExt,pcxName:name,data:data,source:source,hash:hash,canvas:canvas,tex:tex,
vramPx:px,vramPy:py,assigned:false});
// Also add to darTextures so it appears in palette and can be painted
darTextures[hash]={name:nameNoExt,canvas:canvas,tex:tex,imported:true};
darRawFiles.push({name:name,data:data,darSource:source||"imported",isImport:true})}
catch(err){console.log("Failed to decode imported PCX "+name+": "+err)}}

function handleImportKMD(files){
for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){var data=new Uint8Array(e.target.result);
importedModels.push({name:f.name,data:data,source:"loose file"});
var ab=e.target.result;mdlSubModels[f.name]={buf:ab,name:f.name};
rebuildSubModels();rebuildGCLVis();updateImportPanel()};
r.readAsArrayBuffer(f)})(files[i])}}

function handleImportPCX(files){
// Track in-flight readers so Auto-Assign / ExpTex can warn if user tries to
// proceed while uploads haven't all completed. The bug pattern was:
// user select-many-PCXs → onload fires async → user clicks Auto-Assign
// before all onloads run → only partial set gets assigned → ExpTex misses
// the laggards.
if(typeof window._pcxUploadsPending!=="number")window._pcxUploadsPending=0;
window._pcxUploadsPending+=files.length;
for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){
addImportedTexture(f.name,new Uint8Array(e.target.result),"loose file");
window._pcxUploadsPending--;
updateImportPanel();updateTexPalette();updateVRAMPanel();};
r.onerror=function(){window._pcxUploadsPending--;};
r.readAsArrayBuffer(f)})(files[i])}}

function removeImportedModel(idx){
var m=importedModels[idx];
delete mdlSubModels[m.name];
importedModels.splice(idx,1);
rebuildSubModels();rebuildGCLVis();updateImportPanel()}

function removeImportedTexture(idx){
var t=importedTextures[idx];
delete darTextures[t.hash];
// Remove from darRawFiles
for(var i=darRawFiles.length-1;i>=0;i--){if(darRawFiles[i].name===t.pcxName)darRawFiles.splice(i,1)}
importedTextures.splice(idx,1);
updateImportPanel();updateTexPalette();updateVRAMPanel();rebuild()}

function autoAssignVRAM(){
if(typeof window._pcxUploadsPending==="number"&&window._pcxUploadsPending>0){
alert("Wait — "+window._pcxUploadsPending+" PCX upload(s) still loading. Try Auto-Assign again in a moment.");return;}
if(importedTextures.length===0){alert("No imported textures to assign");return}
var slots=parseVRAMSlots();
// Build occupancy grid (4px resolution)
var cellSz=4,gW=1024/cellSz,gH=512/cellSz;
var grid=[];for(var y=0;y<gH;y++){grid[y]=[];for(var x=0;x<gW;x++)grid[y][x]=false}
// Mark framebuffer
for(y=0;y<Math.ceil(480/cellSz);y++)for(x=0;x<Math.ceil(320/cellSz);x++)grid[y][x]=true;
// Mark existing textures
for(var i=0;i<slots.length;i++){var s=slots[i];
var sx1=Math.floor(s.px/cellSz),sy1=Math.floor(s.py/cellSz);
var sx2=Math.ceil((s.px+s.vw)/cellSz),sy2=Math.ceil((s.py+s.h)/cellSz);
for(y=sy1;y<Math.min(sy2,gH);y++)for(x=sx1;x<Math.min(sx2,gW);x++)grid[y][x]=true}
// Assign positions to imported textures
var assigned=0,failed=0;
for(i=0;i<importedTextures.length;i++){var t=importedTextures[i];
var bpp=t.data[3]===1?4:8;var w=(t.data[8]|t.data[9]<<8)+1,h=(t.data[10]|t.data[11]<<8)+1;
var vramW=Math.ceil(bpp===4?w/4:w/2);
var needW=Math.ceil(vramW/cellSz),needH=Math.ceil(h/cellSz);
// Find free rectangle
var found=false;
for(var sy=0;sy<gH-needH&&!found;sy++){for(var sx=Math.ceil(320/cellSz);sx<gW-needW&&!found;sx++){
var fits=true;for(var cy=0;cy<needH&&fits;cy++)for(var cx=0;cx<needW&&fits;cx++){if(grid[sy+cy][sx+cx])fits=false}
if(fits){
t.vramPx=sx*cellSz;t.vramPy=sy*cellSz;t.assigned=true;
// Update PCX header
t.data[78]=t.vramPx&0xFF;t.data[79]=(t.vramPx>>8)&0xFF;
t.data[80]=t.vramPy&0xFF;t.data[81]=(t.vramPy>>8)&0xFF;
// Mark grid
for(cy=0;cy<needH;cy++)for(cx=0;cx<needW;cx++)grid[sy+cy][sx+cx]=true;
assigned++;found=true}}}
if(!found)failed++}
alert("VRAM assignment: "+assigned+" placed, "+failed+" failed (no space)");
updateImportPanel();updateVRAMPanel()}

function updateImportPanel(){var p=document.getElementById("importPanel");if(!p)return;
if(importedModels.length===0&&importedTextures.length===0){p.innerHTML="";return}
var html='<div style="padding:4px"><b style="color:#ff00ff">Imports</b></div>';
if(importedModels.length>0){
html+='<div style="padding:2px 6px;font-size:9px;color:#8866cc;font-weight:bold">Models ('+importedModels.length+')</div>';
for(var i=0;i<importedModels.length;i++){
html+='<div style="display:flex;padding:1px 6px;font-size:9px;color:#8866cc;border-bottom:1px solid #111">';
html+='<span style="flex:1">'+importedModels[i].name+'</span>';
html+='<span onclick="removeImportedModel('+i+')" style="color:#ff3355;cursor:pointer;padding:0 3px" title="Remove">&times;</span></div>'}}
if(importedTextures.length>0){
html+='<div style="padding:2px 6px;font-size:9px;color:#44cc88;font-weight:bold">Textures ('+importedTextures.length+')</div>';
for(i=0;i<importedTextures.length;i++){var t=importedTextures[i];
var vramStr=t.assigned?"@("+t.vramPx+","+t.vramPy+")":"<unassigned>";
html+='<div style="display:flex;padding:1px 6px;font-size:9px;color:#44cc88;border-bottom:1px solid #111">';
html+='<span style="flex:1" title="'+t.source+'">'+t.name+' '+vramStr+'</span>';
html+='<span onclick="removeImportedTexture('+i+')" style="color:#ff3355;cursor:pointer;padding:0 3px" title="Remove">&times;</span></div>'}
html+='<div style="padding:2px 6px"><button onclick="autoAssignVRAM()" style="background:#1a3050;color:#44cc88;border:1px solid #1a2535;padding:2px 6px;cursor:pointer;font-size:9px">Auto-Assign VRAM</button></div>'}
p.innerHTML=html}

// ==================== MODEL DAR PIPELINE ====================
function handleMDLFiles(files){
var pending=files.length;
for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){try{var darFiles=parseDar(e.target.result);
mdlDarFiles=mdlDarFiles||[];
var mainKmd=null,mainName="";
for(var j=0;j<darFiles.length;j++){var df=darFiles[j];
mdlDarFiles.push({name:df.name,data:df.data});
if(df.name.endsWith(".kmd")){
// Main stage KMD: no _r _d _o suffix, largest file
var base=df.name.replace(".kmd","");
var isSub=base.match(/_[rdoRDO]\d*$|_orign$/);
if(!isSub&&(!mainKmd||df.data.length>mainKmd.length)){mainKmd=df.data;mainName=df.name}
// Store all sub-models (everything except main stage KMD)
if(isSub||df.name.match(/^(cam_|enemy|ippan|lopry|nja|nst_|s_cam|vr_)/)){var ab=df.data.buffer.slice(df.data.byteOffset,df.data.byteOffset+df.data.byteLength);
mdlSubModels[df.name]={buf:ab,name:df.name}}}}
// Auto-load main stage KMD
if(mainKmd){var ab2=mainKmd.buffer.slice(mainKmd.byteOffset,mainKmd.byteOffset+mainKmd.byteLength);
kmdBufs=[ab2];kmdFileNames=[mainName];kmdVisible=[true];
rebuildKMD();updateKMDList();
document.getElementById("kmd-info").textContent="KMD:"+mainName;
// If GCL already parsed hzd zones, load side-room KMDs too. Otherwise this runs when GCL loads.
autoLoadHzdKmds();}
pending--;if(pending===0){rebuildSubModels();rebuildGCLVis();
document.getElementById("mdl-info").textContent=Object.keys(mdlSubModels).length+" models"}}
catch(err){console.log("MDL DAR error: "+err);pending--}};
r.readAsArrayBuffer(f)})(files[i])}}

function rebuildSubModels(){
for(var i=0;i<mdlSubObjs.length;i++)if(sc3)sc3.remove(mdlSubObjs[i]);
mdlSubObjs=[];
if(!showSubModels||!sc3)return;
var names=Object.keys(mdlSubModels);
var colors={r:0x44aaff,d:0xff8844,o:0x44ff88};
// Build hash→name map once so GCX entities (which carry only -m hashes) can be
// late-resolved if the DAR is loaded after the GCX was parsed. Recognises BOTH:
//   - PC GCL filenames like "02a_o3.kmd" — hash via mgsHash(basename)
//   - PSX STAGE.DIR synthetic names like "13_28005.kmd" — hash is the decimal
//     suffix and won't match mgsHash, so parse it out directly.
var hashToName={};
for(var hi=0;hi<names.length;hi++){
var nm=names[hi];var nb=nm.replace(/\.kmd$/i,"");
hashToName[mgsHash(nb)&0xFFFF]=nm;
var pm=/^(\d+)_(\d+)$/.exec(nb);
if(pm)hashToName[parseInt(pm[2],10)&0xFFFF]=nm}
// Build a map of model-name → list of placements (each {x,y,z,rot}). Any
// entity carrying both a modelHash (set when its -m option was a STRID) and
// a position contributes. This is type-agnostic: WALL, DOOR, OBSTACLE,
// PUT_OBJECT, BREAK_OBJECT, DRUMCAN2, and anything else the engine adds all
// flow through the same path. Entities with no modelHash (their -m was a
// byte/short/string used for non-model purposes, like FADEIO -m 0) skip
// naturally.
var modelPlacements={};
for(var ge=0;ge<gclEntities.length;ge++){var ent=gclEntities[ge];
if(typeof ent.modelHash!=="number")continue;
// GCX path: if model wasn't resolved at build time (DAR not loaded yet), try now.
if(!ent.model){
var resolved=hashToName[ent.modelHash&0xFFFF];
if(resolved)ent.model=resolved.replace(/\.kmd$/i,"")}
if(!ent.model)continue;
// Try both with and without .kmd extension
var k1=ent.model+".kmd",k2=ent.model;
var found=mdlSubModels[k1]?k1:(mdlSubModels[k2]?k2:null);
if(!found)continue;
if(!modelPlacements[found])modelPlacements[found]=[];
// PUT_OBJECT / OBSTACLE -s carries multi-instance placements. When present,
// use those; otherwise fall back to ent.pos / ent.dir.
if(ent.placements&&ent.placements.length>0){
for(var pi=0;pi<ent.placements.length;pi++){var pl=ent.placements[pi];
var dY=pl.ry?pl.ry/4096*Math.PI*2:0;
modelPlacements[found].push({x:pl.x,y:pl.y,z:pl.z,rot:dY})}}
else{var pos=ent.pos||ent.spawnPos;if(!pos)continue;
var dirY=(ent.dir&&ent.dir.y)?ent.dir.y/4096*Math.PI*2:0;
modelPlacements[found].push({x:pos.x,y:pos.y,z:pos.z,rot:dirY})}}
for(var ni=0;ni<names.length;ni++){var sm=mdlSubModels[names[ni]];
var placements=modelPlacements[sm.name];
if(!placements||placements.length===0)continue;// don't render unplaced submodels
var kd=loadKMD(sm.buf);
var base=sm.name.replace(".kmd","");var suffix=base.match(/_([rdo])\d*$/);
var col=suffix?colors[suffix[1]]||0x888888:0x888888;
for(var pi=0;pi<placements.length;pi++){var pl=placements[pi];
// Textured mode: render with textures if DARs loaded
if(darLoaded&&kmdMode==="tex"&&kd.texGroups){
var tgKeys=Object.keys(kd.texGroups);
for(var ti=0;ti<tgKeys.length;ti++){var hash=parseInt(tgKeys[ti]);
var grp=kd.texGroups[hash];if(!grp||grp.positions.length===0)continue;
var mat;
if(darTextures[hash]){mat=new THREE.MeshBasicMaterial({map:darTextures[hash].tex,side:THREE.DoubleSide})}
else{mat=new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide})}
var geo=new THREE.BufferGeometry();
geo.setAttribute("position",new THREE.Float32BufferAttribute(grp.positions,3));
geo.setAttribute("uv",new THREE.Float32BufferAttribute(grp.uvs,2));
var mesh=new THREE.Mesh(geo,mat);
mesh.position.set(pl.x*S,pl.y*S,pl.z*S);mesh.rotation.y=pl.rot;
mesh.userData={type:"submodel",name:sm.name};
sc3.add(mesh);mdlSubObjs.push(mesh)}}
// Wireframe mode fallback
else if(kd.lines.length>0){
var lg=new THREE.BufferGeometry();lg.setAttribute("position",new THREE.Float32BufferAttribute(kd.lines,3));
var lm=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.35}));
lm.position.set(pl.x*S,pl.y*S,pl.z*S);lm.rotation.y=pl.rot;
lm.userData={type:"submodel",name:sm.name};sc3.add(lm);mdlSubObjs.push(lm)}}}}

function buildDar(fileList){
// Calculate total size
var totalSize=4;// file count
for(var i=0;i<fileList.length;i++){
var nameBytes=fileList[i].name.length+1;// ASCIIZ
var pad=(4-(nameBytes%4))%4;
totalSize+=nameBytes+pad+4+fileList[i].data.byteLength+1}
var out=new ArrayBuffer(totalSize);var dv=new DataView(out);var u8=new Uint8Array(out);
var offset=0;
dv.setUint32(offset,fileList.length,true);offset+=4;
for(i=0;i<fileList.length;i++){var f=fileList[i];
// Write name
for(var c=0;c<f.name.length;c++){u8[offset++]=f.name.charCodeAt(c)}
u8[offset++]=0;// null terminator
var pad2=(4-(offset%4))%4;offset+=pad2;
// Write data length
var fdata=f.data instanceof Uint8Array?f.data:new Uint8Array(f.data);
dv.setUint32(offset,fdata.byteLength,true);offset+=4;
// Write data
u8.set(fdata,offset);offset+=fdata.byteLength;
u8[offset++]=0}// null terminator
return out}

function exportDAR(){
if(!mdlDarFiles||mdlDarFiles.length===0){alert("No model DAR loaded");return}
// Route walls/floors to their KMDs by coordinate. Same helper exportKMD uses,
// so the two export paths can't drift apart.
routeNewItemsToKmds();
// Build export file list starting from original DAR
var exportFiles=[];
for(var i=0;i<mdlDarFiles.length;i++)exportFiles.push({name:mdlDarFiles[i].name,data:mdlDarFiles[i].data});
// For each loaded KMD, encode its modifications and replace in DAR
var modifiedCount=0;
var routingReport=[];
for(var ki=0;ki<kmdBufs.length;ki++){
var kname=kmdFileNames[ki];
// Count walls/floors routed to this KMD
var routedW=0,routedF=0;
for(var nwj=0;nwj<newW.length;nwj++)if(newW[nwj]._kmdIdx===ki)routedW++;
for(var nfj=0;nfj<newF.length;nfj++)if(newF[nfj]._kmdIdx===ki)routedF++;
if(routedW>0||routedF>0)routingReport.push(kname+":"+routedW+"w "+routedF+"f");
var modKmd=buildModifiedKMD(ki);
if(!modKmd)continue;
for(var di=0;di<exportFiles.length;di++){
if(exportFiles[di].name===kname){
exportFiles[di]={name:kname,data:new Uint8Array(modKmd)};
modifiedCount++;
break;}}}
if(modifiedCount===0){alert("No KMD changes to export");return}
for(i=0;i<importedModels.length;i++){
var exists=false;for(var j=0;j<exportFiles.length;j++){if(exportFiles[j].name===importedModels[i].name){exists=true;break}}
if(!exists)exportFiles.push({name:importedModels[i].name,data:importedModels[i].data})}
var darBuf=buildDar(exportFiles);
var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([darBuf]));
a.download="stg_mdl1_modified.dar";document.body.appendChild(a);a.click();
setTimeout(function(){document.body.removeChild(a)},200);
var msg="Exported DAR: "+exportFiles.length+" files, "+modifiedCount+" KMD"+(modifiedCount>1?"s":"")+" modified\nRouting: "+(routingReport.length?routingReport.join(", "):"none");
alert(msg)}

function buildModifiedKMD(kmdIdx){
// kmdIdx (optional): which KMD in kmdBufs to modify (defaults to 0 = main)
// Walls/floors are filtered by their _kmdIdx field (set by exportDAR based on coordinates).
// If _kmdIdx is undefined, the wall is included (legacy behavior for single-KMD use).
if(kmdBufs.length===0)return null;
if(kmdIdx===undefined)kmdIdx=0;
if(kmdIdx>=kmdBufs.length)return null;
function isForThisKmd(item){
return item._kmdIdx===undefined||item._kmdIdx===kmdIdx;}
var faces=[];
for(var i=0;i<newW.length;i++){var w=newW[i];if(w.texHash===undefined||w.texHash<0)continue;
if(!isForThisKmd(w))continue;
if(w.verts){faces.push({verts:w.verts.slice(),texHash:w.texHash,singleSide:!!w.singleSide})}
else{var x1=w.x1,z1=w.z1,y1=w.y1,x2=w.x2,z2=w.z2,y2=w.y2||w.y1,h=(w.h||2000);
faces.push({verts:[{x:x1,y:y1,z:z1},{x:x2,y:y2,z:z2},{x:x2,y:y2+h,z:z2},{x:x1,y:y1+h,z:z1}],texHash:w.texHash,singleSide:!!w.singleSide})}}
for(i=0;i<newF.length;i++){var f=newF[i];if(f.texHash===undefined||f.texHash<0)continue;
if(!isForThisKmd(f))continue;
// Floors default to double-sided so they render correctly when viewed from above
// (which is the normal player perspective). Single-side option still respected if explicitly set.
var floorSingle=f.singleSide===true;
if(f.verts){faces.push({verts:f.verts.slice(),texHash:f.texHash,singleSide:floorSingle})}
else{faces.push({verts:[{x:f.x1,y:f.y1,z:f.z1},{x:f.x2,y:f.y1,z:f.z1},{x:f.x2,y:f.y1,z:f.z2},{x:f.x1,y:f.y1,z:f.z2}],texHash:f.texHash,singleSide:floorSingle})}}
// Deleted faces are KMD-specific. Modern delete keys are "kmdIdx-block-face"
// (set by the face-click handler in 05_main.js). Legacy "block-face" keys
// (no kmdIdx prefix) are honored for kmdIdx=0 only — they were written when
// only one KMD was loaded. If neither this KMD's adds nor its deletes exist,
// the KMD is unchanged and we return null so the caller can skip it.
function _deleteKeysForThisKmd(){
var out={};var prefix=kmdIdx+"-";
for(var k in kmdDeletedFaces){
if(!kmdDeletedFaces[k])continue;
if(k.indexOf(prefix)===0){out[k.substring(prefix.length)]=true;}
else if(kmdIdx===0&&/^\d+-\d+$/.test(k)){out[k]=true;}}
return out;}
var myDeletes=_deleteKeysForThisKmd();
if(faces.length===0&&Object.keys(myDeletes).length===0)return null;
var buf=kmdBufs[kmdIdx],dv=new DataView(buf),u8=new Uint8Array(buf);
var totalCount=dv.getUint32(4,true);var blks=[];
var origTotalCount=totalCount;
for(i=0;i<totalCount;i++){var bo=0x20+i*88;
var fc=dv.getUint32(bo+4,true),vc=dv.getUint32(bo+52,true),nvc=dv.getUint32(bo+64,true);
var vo=dv.getUint32(bo+56,true),fo=dv.getUint32(bo+60,true);
var no=dv.getUint32(bo+68,true),nio=dv.getUint32(bo+72,true);
var uvo=dv.getUint32(bo+76,true),to=dv.getUint32(bo+80,true);
blks.push({idx:i,desc:new Uint8Array(buf.slice(bo,bo+88)),fc:fc,vc:vc,nvc:nvc,
verts:new Uint8Array(buf.slice(vo,vo+vc*8)),faces:new Uint8Array(buf.slice(fo,fo+fc*4)),
norms:new Uint8Array(buf.slice(no,no+nvc*8)),normidx:new Uint8Array(buf.slice(nio,nio+fc*4)),
uvs:new Uint8Array(buf.slice(uvo,uvo+fc*8)),texhash:new Uint8Array(buf.slice(to,to+fc*2))})}
// Delete faces (using KMD-scoped deletes computed above)
var delCount=0;
for(i=0;i<totalCount;i++){var blk=blks[i];if(blk.fc===0)continue;
var origFc=blk.fc,nwF=[],nwNI=[],nwUV=[],nwTH=[];
for(var fi3=0;fi3<origFc;fi3++){var delKey=i+"-"+fi3;
if(myDeletes[delKey]){delCount++;continue}
var fO=fi3*4;nwF.push(blk.faces[fO],blk.faces[fO+1],blk.faces[fO+2],blk.faces[fO+3]);
var niO=fi3*4;nwNI.push(blk.normidx[niO],blk.normidx[niO+1],blk.normidx[niO+2],blk.normidx[niO+3]);
var uvO=fi3*8;for(var uvi=0;uvi<8;uvi++)nwUV.push(blk.uvs[uvO+uvi]);
var thO=fi3*2;nwTH.push(blk.texhash[thO],blk.texhash[thO+1])}
var nfc=nwF.length/4;if(nfc<origFc){
blk.faces=new Uint8Array(nwF);blk.normidx=new Uint8Array(nwNI);
blk.uvs=new Uint8Array(nwUV);blk.texhash=new Uint8Array(nwTH);blk.fc=nfc;
blk.desc[4]=nfc&0xFF;blk.desc[5]=(nfc>>8)&0xFF;blk.desc[6]=(nfc>>16)&0xFF;blk.desc[7]=(nfc>>24)&0xFF}}
// Add new faces using OLD WORKING METHOD: inject into existing block (no spill blocks)
// This is the proven s00-works version. For s02, the stage will load and be playable
// but the new walls will have collision (via HZM) without texture rendering — known limitation.
// (Previously had a chain-count skip here to prevent crashes on 02a.kmd. The real crash
// cause was found via debugging: engine face vertex indices use only 7 bits, max 128 verts
// per block. That limit is now enforced in the block selection passes below.)
if(faces.length>0){
function concat(a,b){var c=new Uint8Array(a.length+b.byteLength);c.set(a instanceof Uint8Array?a:new Uint8Array(a));c.set(new Uint8Array(b),a.length);return c}
// Pre-compute: which texture hashes does each block use? Critical for picking the right
// injection target — block flag word at offset 0 encodes texture page binding, so injecting
// a face with wrong texHash into a block causes texture page conflicts → crashes.
var blockTextures={};
for(var bti=0;bti<totalCount;bti++){
var btb=blks[bti];
var btset={};
if(btb.texhash&&btb.fc>0){
for(var fhi=0;fhi<btb.fc;fhi++){
if(fhi*2+1<btb.texhash.length){
var h=btb.texhash[fhi*2]|(btb.texhash[fhi*2+1]<<8);
btset[h]=true;}}}
blockTextures[bti]=btset;}
var blockFaces2={};
for(var i2=0;i2<faces.length;i2++){var fc2=faces[i2];
var cx=(fc2.verts[0].x+fc2.verts[1].x)/2,cy=fc2.verts[0].y,cz=(fc2.verts[0].z+fc2.verts[1].z)/2;
var bestBlk=-1;
// ENGINE CONSTRAINT: face vertex indices use only 7 bits (bit 7 = special flag).
// Max vertex index = 127, so each block can hold AT MOST 128 vertices.
// Each wall adds 4 verts; only inject into a block with vc <= 124.
var MAX_VC=128;
function hasRoom(bi){return blks[bi].vc+4<=MAX_VC}
// PASS 1: find a block that contains the wall AND already uses this texture AND has room
for(var bi=0;bi<totalCount;bi++){var bd=blks[bi].desc,bdv=new DataView(bd.buffer,bd.byteOffset);
var bx1=bdv.getInt32(8,true),by1=bdv.getInt32(12,true),bz1=bdv.getInt32(16,true);
var bx2=bdv.getInt32(20,true),by2=bdv.getInt32(24,true),bz2=bdv.getInt32(28,true);
if(bx1>bx2)continue;// inverted bbox = chain-continuation block, skip
if(cx>=bx1&&cx<=bx2&&cz>=bz1&&cz<=bz2&&cy>=by1-500&&cy<=by2+500){
if(blockTextures[bi]&&blockTextures[bi][fc2.texHash]&&hasRoom(bi)){bestBlk=bi;break}}}
// PASS 2: any block that already uses this texture AND has room
if(bestBlk<0){
for(var bi3=0;bi3<totalCount;bi3++){
if(blockTextures[bi3]&&blockTextures[bi3][fc2.texHash]&&hasRoom(bi3)){bestBlk=bi3;break}}}
// PASS 3: bbox containment AND has room (fallback for textures not yet present)
if(bestBlk<0){
for(var bi4=0;bi4<totalCount;bi4++){var bd4=blks[bi4].desc,bdv4=new DataView(bd4.buffer,bd4.byteOffset);
var bx14=bdv4.getInt32(8,true),by14=bdv4.getInt32(12,true),bz14=bdv4.getInt32(16,true);
var bx24=bdv4.getInt32(20,true),by24=bdv4.getInt32(24,true),bz24=bdv4.getInt32(28,true);
if(bx14>bx24)continue;
if(cx>=bx14&&cx<=bx24&&cz>=bz14&&cz<=bz24&&cy>=by14-500&&hasRoom(bi4)){bestBlk=bi4;break}}}
// PASS 4: ANY block with room — texture won't match but at least we won't crash
if(bestBlk<0){
for(var bi5=0;bi5<totalCount;bi5++){if(hasRoom(bi5)){bestBlk=bi5;break}}}
if(bestBlk<0){
console.warn("KMD "+(kmdFileNames[kmdIdx]||"?")+" — ALL blocks at vertex capacity (128 limit). Skipping wall.");
continue;}
if(!blockFaces2[bestBlk])blockFaces2[bestBlk]=[];blockFaces2[bestBlk].push(fc2)}
for(var bk in blockFaces2){var bi2=parseInt(bk);var tgt=blks[bi2];var flist=blockFaces2[bk];
for(var fi=0;fi<flist.length;fi++){var fc3=flist[fi];var ovc=tgt.vc;var onvc=tgt.nvc;
var vb=new ArrayBuffer(32);var vdv=new DataView(vb);
for(var j=0;j<4;j++){vdv.setInt16(j*8,fc3.verts[j].x,true);vdv.setInt16(j*8+2,fc3.verts[j].y,true);vdv.setInt16(j*8+4,fc3.verts[j].z,true);vdv.setInt16(j*8+6,-1,true)}
var e1x=fc3.verts[1].x-fc3.verts[0].x,e1y=fc3.verts[1].y-fc3.verts[0].y,e1z=fc3.verts[1].z-fc3.verts[0].z;
var e2x=fc3.verts[2].x-fc3.verts[0].x,e2y=fc3.verts[2].y-fc3.verts[0].y,e2z=fc3.verts[2].z-fc3.verts[0].z;
var nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
var nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
var fb,nb,nib,uvb,tb;
if(fc3.singleSide){
fb=new Uint8Array([ovc+3,ovc+2,ovc+1,ovc]);
nb=new ArrayBuffer(8);var ndv=new DataView(nb);
ndv.setInt16(0,Math.round(nx/nl*-4096),true);ndv.setInt16(2,Math.round(ny/nl*-4096),true);ndv.setInt16(4,Math.round(nz/nl*-4096),true);ndv.setInt16(6,-1,true);
nib=new Uint8Array([onvc,onvc,onvc,onvc]);
uvb=new Uint8Array([0,0,255,0,255,255,0,255]);
tb=new ArrayBuffer(2);var tdv=new DataView(tb);tdv.setUint16(0,fc3.texHash,true);
}else{
fb=new Uint8Array([ovc+3,ovc+2,ovc+1,ovc, ovc,ovc+1,ovc+2,ovc+3]);
nb=new ArrayBuffer(16);var ndv=new DataView(nb);
ndv.setInt16(0,Math.round(nx/nl*-4096),true);ndv.setInt16(2,Math.round(ny/nl*-4096),true);ndv.setInt16(4,Math.round(nz/nl*-4096),true);ndv.setInt16(6,-1,true);
ndv.setInt16(8,Math.round(-nx/nl*-4096),true);ndv.setInt16(10,Math.round(-ny/nl*-4096),true);ndv.setInt16(12,Math.round(-nz/nl*-4096),true);ndv.setInt16(14,-1,true);
nib=new Uint8Array([onvc,onvc,onvc,onvc, onvc+1,onvc+1,onvc+1,onvc+1]);
uvb=new Uint8Array([0,0,255,0,255,255,0,255, 0,255,255,255,255,0,0,0]);
tb=new ArrayBuffer(4);var tdv=new DataView(tb);tdv.setUint16(0,fc3.texHash,true);tdv.setUint16(2,fc3.texHash,true);
}
tgt.verts=concat(tgt.verts,vb);tgt.faces=concat(tgt.faces,fb);
tgt.norms=concat(tgt.norms,nb);tgt.normidx=concat(tgt.normidx,nib);
tgt.uvs=concat(tgt.uvs,uvb);tgt.texhash=concat(tgt.texhash,tb);
var addFc=fc3.singleSide?1:2;
var addNvc=fc3.singleSide?1:2;
tgt.vc+=4;tgt.fc+=addFc;tgt.nvc+=addNvc;
var dd=new DataView(tgt.desc.buffer,tgt.desc.byteOffset);
dd.setUint32(4,tgt.fc,true);dd.setUint32(52,tgt.vc,true);dd.setUint32(64,tgt.nvc,true);
// Expand block's bbox to include new vertices. The engine uses block bbox for frustum
// culling — if new geometry sits outside the block's bbox, the engine skips rendering
// the block when the camera looks at the geometry's location. Critical when injection
// lands in a block whose bbox is elsewhere in the stage (e.g. Pass 2 texture-only match).
var bx1=dd.getInt32(8,true),by1=dd.getInt32(12,true),bz1=dd.getInt32(16,true);
var bx2=dd.getInt32(20,true),by2=dd.getInt32(24,true),bz2=dd.getInt32(28,true);
for(var vidx=0;vidx<4;vidx++){var vx=fc3.verts[vidx].x,vy=fc3.verts[vidx].y,vz=fc3.verts[vidx].z;
if(vx<bx1)bx1=vx;if(vx>bx2)bx2=vx;
if(vy<by1)by1=vy;if(vy>by2)by2=vy;
if(vz<bz1)bz1=vz;if(vz>bz2)bz2=vz;}
dd.setInt32(8,bx1,true);dd.setInt32(12,by1,true);dd.setInt32(16,bz1,true);
dd.setInt32(20,bx2,true);dd.setInt32(24,by2,true);dd.setInt32(28,bz2,true);}}}
// Rebuild with 4-byte alignment
var finalCount=blks.length;
var hdr=new Uint8Array(buf.slice(0,0x20));
// Header unchanged: old method never creates new blocks (injects into existing).
// numRenderBlocks and numTotalBlocks preserved.
var offset=0x20+finalCount*88;
for(i=0;i<finalCount;i++){if(offset%4!==0)offset+=4-(offset%4);
blks[i].nvo=offset;offset+=blks[i].verts.length;blks[i].nno=offset;offset+=blks[i].norms.length;
blks[i].nfo=offset;offset+=blks[i].faces.length;blks[i].nnio=offset;offset+=blks[i].normidx.length;
blks[i].nuvo=offset;offset+=blks[i].uvs.length;blks[i].nto=offset;offset+=blks[i].texhash.length}
var out=new ArrayBuffer(offset);var ov=new DataView(out);var ou=new Uint8Array(out);ou.set(hdr);
for(i=0;i<finalCount;i++){var d2=0x20+i*88;ou.set(blks[i].desc,d2);
ov.setUint32(d2+56,blks[i].nvo,true);ov.setUint32(d2+60,blks[i].nfo,true);
ov.setUint32(d2+68,blks[i].nno,true);ov.setUint32(d2+72,blks[i].nnio,true);
ov.setUint32(d2+76,blks[i].nuvo,true);ov.setUint32(d2+80,blks[i].nto,true)}
for(i=0;i<finalCount;i++){ou.set(blks[i].verts,blks[i].nvo);ou.set(blks[i].norms,blks[i].nno);
ou.set(blks[i].faces,blks[i].nfo);ou.set(blks[i].normidx,blks[i].nnio);
ou.set(blks[i].uvs,blks[i].nuvo);ou.set(blks[i].texhash,blks[i].nto)}
return out}

// ==================== TEXTURED KMD RENDERING ====================
function rebuildKMD(){
if(!sc3)return;for(var i=0;i<kmdObjs.length;i++)sc3.remove(kmdObjs[i]);kmdObjs=[];
for(var ki=0;ki<kmdBufs.length;ki++){
if(!kmdVisible[ki])continue;
var kd=loadKMD(kmdBufs[ki],ki);
if(kmdMode==="wire"&&kd.lines.length>0){
var lg=new THREE.BufferGeometry();lg.setAttribute("position",new THREE.Float32BufferAttribute(kd.lines,3));
var lm=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0x8866cc,transparent:true,opacity:0.5}));
sc3.add(lm);kmdObjs.push(lm)}
if(kmdMode==="solid"&&kd.tris.length>0){
var tg=new THREE.BufferGeometry();tg.setAttribute("position",new THREE.Float32BufferAttribute(kd.tris,3));tg.computeVertexNormals();
var tm=new THREE.Mesh(tg,new THREE.MeshPhongMaterial({color:0x6644aa,transparent:true,opacity:0.6,side:THREE.DoubleSide,flatShading:true}));
sc3.add(tm);kmdObjs.push(tm)}
if(kmdMode==="both"&&kd.lines.length>0){
var lg2=new THREE.BufferGeometry();lg2.setAttribute("position",new THREE.Float32BufferAttribute(kd.lines,3));
var lm2=new THREE.LineSegments(lg2,new THREE.LineBasicMaterial({color:0xaa88ee,transparent:true,opacity:0.4}));
sc3.add(lm2);kmdObjs.push(lm2);
var tg2=new THREE.BufferGeometry();tg2.setAttribute("position",new THREE.Float32BufferAttribute(kd.tris,3));tg2.computeVertexNormals();
var tm2=new THREE.Mesh(tg2,new THREE.MeshPhongMaterial({color:0x443366,transparent:true,opacity:0.35,side:THREE.DoubleSide,flatShading:true}));
sc3.add(tm2);kmdObjs.push(tm2)}
// TEXTURED MODE
if(kmdMode==="tex"&&darLoaded){
var tgKeys=Object.keys(kd.texGroups);
for(var ti=0;ti<tgKeys.length;ti++){var hash=parseInt(tgKeys[ti]);
var grp=kd.texGroups[hash];if(!grp||grp.positions.length===0)continue;
var mat;
if(darTextures[hash]){
mat=new THREE.MeshBasicMaterial({map:darTextures[hash].tex,side:THREE.DoubleSide})}
else{mat=new THREE.MeshBasicMaterial({color:0xff00ff,side:THREE.DoubleSide})}
var geo=new THREE.BufferGeometry();
geo.setAttribute("position",new THREE.Float32BufferAttribute(grp.positions,3));
geo.setAttribute("uv",new THREE.Float32BufferAttribute(grp.uvs,2));
var mesh=new THREE.Mesh(geo,mat);mesh.userData={type:"kmdtex",hash:hash,faceRefs:grp.faceRefs,kmdIdx:ki};sc3.add(mesh);kmdObjs.push(mesh)}}
// TEXTURED MODE with per-face delete support
if(kmdMode==="tex"&&darLoaded&&kd.faceList){
for(ti=0;ti<kd.faceList.length;ti++){var fl=kd.faceList[ti];
// New keys are scoped per-KMD: "kmdIdx-block-face". Read legacy "block-face"
// too so old sessions/undo entries still work.
var delKey=ki+"-"+fl.block+"-"+fl.face;
var legacyKey=fl.block+"-"+fl.face;
if(kmdDeletedFaces[delKey]||kmdDeletedFaces[legacyKey]){
// Show deleted face as red wireframe
var dg=new THREE.BufferGeometry();dg.setAttribute("position",new THREE.Float32BufferAttribute(fl.tri,3));
var dm=new THREE.Mesh(dg,new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,opacity:0.3,side:THREE.DoubleSide,wireframe:true}));
dm.userData={type:"kmdface",block:fl.block,face:fl.face,deleted:true};sc3.add(dm);kmdObjs.push(dm)}}}
}
document.getElementById("kmd-info").textContent="KMD:"+kmdBufs.length+(darLoaded?" +"+Object.keys(darTextures).length+"tex":"")}

function handleKMD(files){for(var i=0;i<files.length;i++){(function(f){var r=new FileReader();
r.onload=function(e){kmdBufs.push(e.target.result);kmdFileNames.push(f.name);kmdVisible.push(true);rebuildKMD();updateKMDList()};r.readAsArrayBuffer(f)})(files[i])}
document.getElementById("kfi").value=""}
function clearKMD(){for(var i=0;i<kmdObjs.length;i++)sc3.remove(kmdObjs[i]);kmdObjs=[];kmdBufs=[];kmdFileNames=[];kmdVisible=[];document.getElementById("kmd-info").textContent="";updateKMDList()}

function exportAll(){
doExp();// HZM
// Use the dirty-aware KMD export so multi-KMD edits don't get silently dropped.
// exportKMD() handles single-KMD direct download AND multi-KMD zip bundling,
// and skips entirely when nothing's dirty (no spurious empty downloads).
routeNewItemsToKmds();
var anyDirty=false;
for(var _ki=0;_ki<kmdBufs.length;_ki++){if(isDirtyKmd(_ki)){anyDirty=true;break;}}
if(anyDirty)exportKMD();
if(mdlDarFiles&&mdlDarFiles.length>0&&anyDirty)exportDAR();
// Export texture DAR if any textures are tagged for export — either via classic
// catalog imports, the darImportFlags toggle in the VRAM viewer, OR via implicit
// isImport flags on individual PCX files (set by ImpDAR or auto-repack).
var anyFlagged=false;
if(typeof darImportFlags!=="undefined"){
for(var k in darImportFlags){if(darImportFlags[k]){anyFlagged=true;break;}}}
var anyImplicit=false;
if(typeof darRawFiles!=="undefined"){
for(var dii=0;dii<darRawFiles.length;dii++){
if(darRawFiles[dii].isImport){anyImplicit=true;break;}}}
var hasTexExports=importedTextures.length>0||anyFlagged||anyImplicit;
if(hasTexExports)exportTexDAR();
// Export GCL too if any GCL is loaded. The user expects ExpAll to be a full
// "ship the stage" button — HZM + MDL + TEX + GCL covers all the files the
// game actually reads on stage load.
var hasGCL=(typeof gclOrigText==="string"&&gclOrigText.length>0);
if(hasGCL)exportGCL();
alert("Exported: HZM"+(modKmd?" + KMD":"")+(mdlDarFiles?" + MDL DAR":"")+(hasTexExports?" + TEX DAR":"")+(hasGCL?" + GCL":""))}

function cleanDuplicateNewWFNF(){
var origW=newW.length,origF=newF.length;
var seenW={},seenF={};
var keptW=[],keptF=[];
for(var i=0;i<newW.length;i++){var w=newW[i];
var k="w_"+w.x1+"_"+w.z1+"_"+w.x2+"_"+w.z2+"_"+w.y1+"_"+(w.h||0);
if(seenW[k]){
// Merge - prefer the one with a real texture
if(w.texHash>=0&&keptW[seenW[k]-1].texHash<0)keptW[seenW[k]-1]=w;
continue}
keptW.push(w);seenW[k]=keptW.length;}
for(var j=0;j<newF.length;j++){var f=newF[j];
var k2="f_"+f.x1+"_"+f.z1+"_"+f.x2+"_"+f.z2+"_"+f.y1;
if(seenF[k2]){
if(f.texHash>=0&&keptF[seenF[k2]-1].texHash<0)keptF[seenF[k2]-1]=f;
continue}
keptF.push(f);seenF[k2]=keptF.length;}
var rmW=origW-keptW.length,rmF=origF-keptF.length;
if(rmW===0&&rmF===0){alert("No duplicate walls or floors found.");return}
if(!confirm("Remove "+rmW+" duplicate walls and "+rmF+" duplicate floors?\n\nDuplicates have the same X1/Z1/X2/Z2/Y. The version with a texture (if any) is kept."))return;
newW=keptW;newF=keptF;
logUndo("clean","Cleaned "+rmW+" wall + "+rmF+" floor duplicates");
rebuild();showProps();
alert("Cleaned: "+rmW+" duplicate walls and "+rmF+" duplicate floors removed.")}

function exportTexDAR(){
if(typeof window._pcxUploadsPending==="number"&&window._pcxUploadsPending>0){
alert("Wait — "+window._pcxUploadsPending+" PCX upload(s) still loading. Try ExpTex again in a moment.");return;}
// Two paths to "what should be exported":
//   1. Classic: importedTextures[] holds PCXs added via ImpDAR catalog. Bundle them
//      into one new DAR (the historical behavior).
//   2. DAR-tagged: user loaded a DAR via the regular ImpTexDAR button, then checked
//      its "imported" box in the VRAM popup. Each such DAR exports as ITS OWN file
//      preserving the original DAR's name. This is the workflow used for "I already
//      have stg_tex4.dar, just repack and give it back to me."
//   3. Implicit: any darRawFiles entry with isImport=true whose darSource isn't
//      already flagged. Catches the case where user auto-repacked PCXs in-place
//      but never clicked the VRAM popup checkbox.
//
// We check all three. If none produce anything, complain.
var taggedDARs=[];// list of darSource names that are flagged as imported
if(typeof darImportFlags!=="undefined"){
for(var k in darImportFlags){if(darImportFlags[k])taggedDARs.push(k);}}
// Path 3: implicit flags from isImport bits on individual PCX files.
// Aggregate by darSource so we end up with one output DAR per source.
var implicitDARs={};
if(typeof darRawFiles!=="undefined"){
for(var di0=0;di0<darRawFiles.length;di0++){
var drf=darRawFiles[di0];
if(!drf.isImport||!drf.darSource)continue;
if(taggedDARs.indexOf(drf.darSource)>=0)continue;// already covered by Path 2
implicitDARs[drf.darSource]=true;}}
var implicitSources=Object.keys(implicitDARs);
if(importedTextures.length===0&&taggedDARs.length===0&&implicitSources.length===0){
alert("No imported textures or imported-flagged DARs.\n\nEither:\n• Use ImpDAR (catalog flow) to import individual textures, or\n• Open the VRAM viewer and check the box next to a loaded DAR to mark it as imported.");
return;}
// Ensure all VRAM positions resolved for classic-imports path
if(importedTextures.length>0){
var unassigned=importedTextures.filter(function(t){return!t.assigned});
if(unassigned.length>0){
if(!confirm(unassigned.length+" textures have no VRAM position. Auto-assign now?")){return;}
autoAssignVRAM();}}

var outputs=[];// {filename, files:[{name,data},...]}

// Path 2: for each flagged DAR, gather all PCXs whose darSource matches and bundle them.
// The PCX data has already been mutated in place by the repacker, so we just package as-is.
for(var ti=0;ti<taggedDARs.length;ti++){
var dsrc=taggedDARs[ti];
var dfiles=[];
for(var di=0;di<darRawFiles.length;di++){
if(darRawFiles[di].excluded)continue;
if(darRawFiles[di].darSource===dsrc){
dfiles.push({name:darRawFiles[di].name,data:darRawFiles[di].data});}}
if(dfiles.length>0){
// Build a sensible output filename: insert "_modified" before the extension
var srcName=dsrc.replace(/\.dar$/i,"");
outputs.push({filename:srcName+"_modified.dar",files:dfiles,sourceDAR:dsrc});}}

// Path 3 (implicit): aggregate by darSource the PCXs that have isImport=true
// but whose source DAR isn't explicitly flagged. Same packaging as Path 2.
for(var pi3=0;pi3<implicitSources.length;pi3++){
var idsrc=implicitSources[pi3];
var idfiles=[];
for(var di2=0;di2<darRawFiles.length;di2++){
if(darRawFiles[di2].excluded)continue;
if(darRawFiles[di2].darSource===idsrc){
idfiles.push({name:darRawFiles[di2].name,data:darRawFiles[di2].data});}}
if(idfiles.length>0){
var isrcName=idsrc.replace(/\.dar$/i,"");
// Tag the filename slightly differently so user knows this came from auto-detect
var ofilename=isrcName==="imported"?"stg_tex_imported.dar":isrcName+"_modified.dar";
outputs.push({filename:ofilename,files:idfiles,sourceDAR:idsrc+" (auto-detected)"});}}

// Path 1: classic catalog-imported textures. Skip if these textures came from a
// flagged DAR (avoid double-export); otherwise bundle into a fresh DAR.
var classicTexNames={};
for(var i=0;i<importedTextures.length;i++)classicTexNames[importedTextures[i].pcxName]=true;
// Check if any imported texture lives in a DAR we already exported above
var classicFiles=[];
for(i=0;i<darRawFiles.length;i++){
var df=darRawFiles[i];
if(df.excluded)continue;
if(!classicTexNames[df.name])continue;
// Skip if this PCX is part of a flagged DAR (already in outputs[])
if(df.darSource&&darImportFlags[df.darSource])continue;
classicFiles.push({name:df.name,data:df.data});}
if(classicFiles.length>0){
outputs.push({filename:"stg_tex_modified.dar",files:classicFiles,sourceDAR:"(catalog imports)"});}

if(outputs.length===0){
alert("Nothing to export. The flagged DARs and catalog imports were already filtered out somehow.");return;}

// Download each output. Browsers may pop up "allow multiple downloads" — that's fine.
var summary=[];
for(var oi=0;oi<outputs.length;oi++){
var out=outputs[oi];
var darBuf=buildDar(out.files);
var a=document.createElement("a");
a.href=URL.createObjectURL(new Blob([darBuf]));
a.download=out.filename;
document.body.appendChild(a);a.click();
(function(elt){setTimeout(function(){document.body.removeChild(elt)},200);})(a);
summary.push("• "+out.filename+" — "+out.files.length+" PCX (from "+out.sourceDAR+")");}
alert("Exported "+outputs.length+" DAR file(s):\n\n"+summary.join("\n")+"\n\nDrop these into your stage folder. Stage textures (stg_tex1/2/3) are NOT included — they don't need to change."); }
// Per-KMD per-block bbox info, used to route a (x,y,z) point to the smallest
// KMD block containing it. Module-scope so both exportDAR and exportKMD can
// reuse the same logic without duplicating the build loop. Recomputed on every
// call — KMDs and their bboxes don't change without a reload.
function _buildKmdBoxes(){
var boxes=[];
for(var bi=0;bi<kmdBufs.length;bi++){
var bbuf=kmdBufs[bi],bdv=new DataView(bbuf);
var nt=bdv.getUint32(4,true);
var blocks=[];
for(var bki=0;bki<nt;bki++){
var bo=0x20+bki*88;
var bx1=bdv.getInt32(bo+8,true);
if(bx1===0x7FFFFFFF)continue;// inverted bbox sentinel — skip chain-continuation blocks
var bx2=bdv.getInt32(bo+20,true);
var by1=bdv.getInt32(bo+12,true),by2=bdv.getInt32(bo+24,true);
var bz1=bdv.getInt32(bo+16,true),bz2=bdv.getInt32(bo+28,true);
var vol=Math.abs((bx2-bx1)*(by2-by1)*(bz2-bz1));
blocks.push({xmin:bx1,xmax:bx2,ymin:by1,ymax:by2,zmin:bz1,zmax:bz2,vol:vol});}
boxes.push({idx:bi,name:kmdFileNames[bi],blocks:blocks});}
return boxes;}

// Route a world point to the KMD whose smallest-volume block contains it.
// Two-pass: strict containment first, then with tolerance. Volumes break ties
// so stacked rooms (room 3 above room 5) don't collapse into the wrong KMD.
// Takes kmdBoxes explicitly so it has no closure dependency on the caller.
function _findKmdForPoint(boxes,x,y,z){
var bestIdx=0,bestVol=Infinity,foundMatch=false;
function tryPass(tolXZ,tolY){
for(var ki=0;ki<boxes.length;ki++){var kb=boxes[ki];
for(var bi=0;bi<kb.blocks.length;bi++){var blk=kb.blocks[bi];
if(x>=blk.xmin-tolXZ&&x<=blk.xmax+tolXZ&&z>=blk.zmin-tolXZ&&z<=blk.zmax+tolXZ&&y>=blk.ymin-tolY&&y<=blk.ymax+tolY){
if(blk.vol<bestVol){bestVol=blk.vol;bestIdx=ki;foundMatch=true}}}}}
tryPass(0,0);
if(!foundMatch)tryPass(200,500);
return foundMatch?bestIdx:0;}

// Tag each pending wall/floor with the KMD it belongs to (by coords) and its
// HZM area. Shared by exportDAR (PC, packs all into stg_mdl1.dar) and
// exportKMD (PSX, emits separate .kmd files). Safe to call from anywhere —
// has no closure dependencies.
function routeNewItemsToKmds(){
var boxes=_buildKmdBoxes();
for(var i=0;i<newW.length;i++){var w=newW[i];
if(w.texHash===undefined||w.texHash<0){w._kmdIdx=-1;continue}
var wx=(w.x1+w.x2)/2,wy=w.y1||0,wz=(w.z1+w.z2)/2;
w._kmdIdx=_findKmdForPoint(boxes,wx,wy,wz);
if(!w.renderOnly)w.targetAi=findHzmAreaForPoint(wx,wy,wz);}
for(var j=0;j<newF.length;j++){var f=newF[j];
if(f.texHash===undefined||f.texHash<0){f._kmdIdx=-1;continue}
var fx=(f.x1+f.x2)/2,fy=f.y1||0,fz=(f.z1+f.z2)/2;
f._kmdIdx=_findKmdForPoint(boxes,fx,fy,fz);
if(!f.renderOnly)f.targetAi=findHzmAreaForPoint(fx,fy,fz);}}

// Returns true if this KMD has any pending modifications: routed adds OR
// scoped face deletes. Call routeNewItemsToKmds() first so _kmdIdx is fresh.
function isDirtyKmd(kmdIdx){
for(var i=0;i<newW.length;i++){
if(newW[i]._kmdIdx===kmdIdx&&newW[i].texHash!==undefined&&newW[i].texHash>=0)return true;}
for(var j=0;j<newF.length;j++){
if(newF[j]._kmdIdx===kmdIdx&&newF[j].texHash!==undefined&&newF[j].texHash>=0)return true;}
var prefix=kmdIdx+"-";
for(var k in kmdDeletedFaces){
if(!kmdDeletedFaces[k])continue;
if(k.indexOf(prefix)===0)return true;
// Legacy unprefixed keys are only treated as belonging to KMD 0.
if(kmdIdx===0&&/^\d+-\d+$/.test(k))return true;}
return false;}

// Export all dirty KMDs. Single dirty → standalone .kmd; multiple → zip.
// Before writing anything, shows a confirm dialog with a per-KMD breakdown of
// exactly what will be applied (new walls/floors and which face deletes). This
// is your last chance to spot stale state from earlier testing — if you see
// edits you don't remember making to a KMD you didn't intend to touch, hit
// Cancel and use "Restore All" or reload before retrying.
function exportKMD(){
if(kmdBufs.length===0){alert("No KMD files loaded");return}
if(typeof JSZip==="undefined"){alert("JSZip not loaded — can't bundle multi-KMD export");return}
routeNewItemsToKmds();
var dirty=[];
for(var ki=0;ki<kmdBufs.length;ki++){if(isDirtyKmd(ki))dirty.push(ki);}
if(dirty.length===0){alert("No KMD changes to export");return}
// Build the breakdown: per-KMD list of edits about to be applied.
var lines=[];
for(var di0=0;di0<dirty.length;di0++){
var kix=dirty[di0];
var addW=0,addF=0,dels=[];
for(var wi=0;wi<newW.length;wi++){
if(newW[wi]._kmdIdx===kix&&newW[wi].texHash!==undefined&&newW[wi].texHash>=0)addW++;}
for(var fi=0;fi<newF.length;fi++){
if(newF[fi]._kmdIdx===kix&&newF[fi].texHash!==undefined&&newF[fi].texHash>=0)addF++;}
var pfx=kix+"-";
for(var dk in kmdDeletedFaces){
if(!kmdDeletedFaces[dk])continue;
if(dk.indexOf(pfx)===0){dels.push(dk.substring(pfx.length));}
else if(kix===0&&/^\d+-\d+$/.test(dk)){dels.push(dk+" (legacy)");}}
var bits=[];
if(addW>0)bits.push(addW+" new wall"+(addW>1?"s":""));
if(addF>0)bits.push(addF+" new floor"+(addF>1?"s":""));
if(dels.length>0)bits.push(dels.length+" face delete"+(dels.length>1?"s":"")+": "+dels.slice(0,6).join(",")+(dels.length>6?"…":""));
lines.push("  "+(kmdFileNames[kix]||("KMD "+kix))+" — "+bits.join("; "));}
var msg="Export "+dirty.length+" modified KMD"+(dirty.length>1?"s":"")+":\n\n"+lines.join("\n")+
"\n\nProceed?\n\nIf you see edits you didn't intend (especially face deletes on KMDs you don't recognize), Cancel and use Restore All or reload the page.";
if(!confirm(msg))return;
// Single dirty KMD: emit standalone .kmd (no zip overhead).
if(dirty.length===1){
var ki1=dirty[0];
var modKmd=buildModifiedKMD(ki1);
if(!modKmd){alert("Build failed for "+kmdFileNames[ki1]);return}
var fname=(kmdFileNames[ki1]||"stage").replace(/\.kmd$/i,"")+"_modified.kmd";
var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([modKmd]));
a.download=fname;document.body.appendChild(a);a.click();
setTimeout(function(){document.body.removeChild(a)},200);
alert("Exported "+fname+" ("+modKmd.byteLength+" bytes)");
return;}
// Multiple dirty: bundle into ZIP.
var zip=new JSZip();
var summary=[];
for(var dii=0;dii<dirty.length;dii++){
var ki2=dirty[dii];
var mod=buildModifiedKMD(ki2);
if(!mod){summary.push("  (skipped "+kmdFileNames[ki2]+" — build returned null)");continue;}
var fn=(kmdFileNames[ki2]||("kmd_"+ki2)).replace(/\.kmd$/i,"")+"_modified.kmd";
zip.file(fn,mod);
summary.push("  "+fn+" ("+mod.byteLength+" bytes)");}
zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}}).then(function(blob){
var zipName="modified_kmds_"+dirty.length+".zip";
var aZ=document.createElement("a");aZ.href=URL.createObjectURL(blob);
aZ.download=zipName;document.body.appendChild(aZ);aZ.click();
setTimeout(function(){document.body.removeChild(aZ)},200);
alert("Exported "+dirty.length+" modified KMD(s) in "+zipName+" ("+blob.size+" bytes)\n\n"+summary.join("\n")+"\n\nUnzip and drop into your stage folder, replacing the originals.");
}).catch(function(err){
alert("ZIP generation failed: "+err);});}
function flipKMD(){kmdFlip2=!kmdFlip2;rebuildKMD()}
function setKmdMode(m){kmdMode=m;rebuildKMD();rebuildSubModels();var bs=document.querySelectorAll(".kbtn");for(var i=0;i<bs.length;i++)bs[i].classList.toggle("active",bs[i].getAttribute("data-km")===m)}
function toggleKMDFile(idx){kmdVisible[idx]=!kmdVisible[idx];rebuildKMD();updateKMDList()}
function removeKMDFile(idx){kmdBufs.splice(idx,1);kmdFileNames.splice(idx,1);kmdVisible.splice(idx,1);rebuildKMD();updateKMDList()}
function updateKMDList(){var p=document.getElementById("kmdListPanel");if(!p)return;
if(kmdFileNames.length===0){p.innerHTML="";return}
var html=panelHeader("kmd","KMD Files","#8866cc");
if(panelCollapsed.kmd){p.innerHTML=html;return}
// Build a routing preview: where would each new wall go right now?
// (Mirrors the logic in exportDAR but cheap to recompute on every UI update.)
var kmdBoxes=[];
for(var bi=0;bi<kmdBufs.length;bi++){
var bbuf=kmdBufs[bi],bdv=new DataView(bbuf);
var nt=bdv.getUint32(4,true);
var blocks=[];
for(var bki=0;bki<nt;bki++){var bo=0x20+bki*88;
var bx1=bdv.getInt32(bo+8,true);
if(bx1===0x7FFFFFFF){blocks.push(null);continue}
var bx2=bdv.getInt32(bo+20,true);
var by1=bdv.getInt32(bo+12,true),by2=bdv.getInt32(bo+24,true);
var bz1=bdv.getInt32(bo+16,true),bz2=bdv.getInt32(bo+28,true);
var fc=bdv.getUint32(bo+4,true);
var vc=bdv.getUint32(bo+52,true);
var tno=bdv.getUint32(bo+80,true);
var hashes={};
for(var fhi=0;fhi<fc;fhi++){if(tno+fhi*2+1<bbuf.byteLength){hashes[bdv.getUint16(tno+fhi*2,true)]=true}}
var vol=Math.abs((bx2-bx1)*(by2-by1)*(bz2-bz1));
blocks.push({idx:bki,xmin:bx1,xmax:bx2,ymin:by1,ymax:by2,zmin:bz1,zmax:bz2,vol:vol,fc:fc,vc:vc,hashes:hashes});}
kmdBoxes.push({idx:bi,name:kmdFileNames[bi],blocks:blocks});}
// Tally pending walls per KMD per block (which block would each wall land in?)
var wallTally={};// key: "kmdIdx-blockIdx" -> wall count
var wallRouting=[];// per-wall diagnostic
for(var nwi=0;nwi<newW.length;nwi++){var w=newW[nwi];
if(w.texHash===undefined||w.texHash<0||w.renderOnly)continue;
var wx=(w.x1+w.x2)/2,wy=w.y1||0,wz=(w.z1+w.z2)/2;
// Replicate findKmdForPoint
var bestKi=0,bestVol=Infinity,foundKi=false;
function tryKiPass(tolXZ,tolY){
for(var ki=0;ki<kmdBoxes.length;ki++){var kb=kmdBoxes[ki];
for(var bki2=0;bki2<kb.blocks.length;bki2++){var blk=kb.blocks[bki2];
if(!blk)continue;
if(wx>=blk.xmin-tolXZ&&wx<=blk.xmax+tolXZ&&wz>=blk.zmin-tolXZ&&wz<=blk.zmax+tolXZ&&wy>=blk.ymin-tolY&&wy<=blk.ymax+tolY){
if(blk.vol<bestVol){bestVol=blk.vol;bestKi=ki;foundKi=true}}}}}
tryKiPass(0,0);if(!foundKi)tryKiPass(200,500);
var kmdIdx=foundKi?bestKi:0;
// Now find which block within that KMD via the same 4-pass logic
var kb2=kmdBoxes[kmdIdx];
var landingBlock=-1,landingPass=0;
function passBlk(needsTexture,needsBbox,needsRoom){
for(var pbi=0;pbi<kb2.blocks.length;pbi++){var pblk=kb2.blocks[pbi];if(!pblk)continue;
var texOk=!needsTexture||pblk.hashes[w.texHash];
var bbOk=!needsBbox||(wx>=pblk.xmin&&wx<=pblk.xmax&&wz>=pblk.zmin&&wz<=pblk.zmax&&wy>=pblk.ymin-500&&wy<=pblk.ymax+500);
var roomOk=!needsRoom||pblk.vc+4<=128;
if(texOk&&bbOk&&roomOk){landingBlock=pbi;return true}}
return false;}
if(passBlk(true,true,true))landingPass=1;
else if(passBlk(true,false,true))landingPass=2;
else if(passBlk(false,true,true))landingPass=3;
else if(passBlk(false,false,true))landingPass=4;
var key=kmdIdx+"-"+landingBlock;
wallTally[key]=(wallTally[key]||0)+1;
wallRouting.push({widx:nwi,kmdName:kmdFileNames[kmdIdx],blockIdx:landingBlock,pass:landingPass,tex:w.texHash});}
// Render KMD list with capacity bars
for(var i=0;i<kmdFileNames.length;i++){
var zoneInfo="";
if(gclHzdZones){
for(var zn in gclHzdZones){
if(gclHzdZones[zn].kmds.indexOf(kmdFileNames[i].replace(".kmd",""))>=0){
zoneInfo+=' <span style="color:#44aa66;font-size:8px">['+zn+' a'+gclHzdZones[zn].hzmArea+']</span>';break}}}
// Per-KMD restore link — only shows when this KMD has deleted faces
var hasDeletedHere=false;
var _prefix=i+"-";
for(var _dkk in kmdDeletedFaces){if(_dkk.indexOf(_prefix)===0&&/^\d+-\d+$/.test(_dkk.substring(_prefix.length))){hasDeletedHere=true;break;}}
var restoreLink=hasDeletedHere?' <span onclick="restoreKmdFacesForIdx('+i+')" style="color:#44aa88;cursor:pointer;font-size:8px;margin-right:4px;float:right" title="Restore faces deleted from this KMD only">↺ Restore</span>':'';
html+='<div style="padding:2px 4px;font-size:9px;border-bottom:1px solid #111;color:'+(kmdVisible[i]?"#8866cc":"#444")+'">'+
'<input type="checkbox" '+(kmdVisible[i]?"checked":"")+' onchange="toggleKMDFile('+i+')"> '+kmdFileNames[i]+zoneInfo+
' <span onclick="removeKMDFile('+i+')" style="color:#662222;cursor:pointer;float:right">✕</span>'+restoreLink+'</div>';
// Per-block capacity bars (only show blocks with significant fill or pending walls)
var kb=kmdBoxes[i];if(kb&&kb.blocks){
for(var bki=0;bki<kb.blocks.length;bki++){var blk=kb.blocks[bki];if(!blk)continue;
var pendingW=wallTally[i+"-"+bki]||0;
var afterVc=blk.vc+pendingW*4;
// Color: green <80, yellow 80-120, red >=124 (no room left)
var pct=Math.min(100,afterVc/128*100);
var barColor=afterVc>=124?"#aa3333":afterVc>=120?"#aa6633":afterVc>=80?"#aa9933":"#338855";
var label="blk"+bki+": "+blk.vc+(pendingW>0?"+"+(pendingW*4)+"="+afterVc:"")+"/128";
var pendingTag=pendingW>0?' <span style="color:#ffaa44">+'+pendingW+'w</span>':'';
html+='<div style="padding:0 8px 1px 12px;font-size:8px;color:#666">'+
'<div style="display:flex;align-items:center;gap:4px"><span style="min-width:90px">'+label+pendingTag+'</span>'+
'<div style="flex:1;height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden">'+
'<div style="width:'+pct+'%;height:100%;background:'+barColor+'"></div></div></div></div>';}}}
// Routing diagnostics — list each pending wall and where it goes, with pass quality
if(wallRouting.length>0){
html+='<div style="padding:4px;margin-top:4px;border-top:1px solid #222"><b style="color:#ffaa44;font-size:9px">Wall Routing ('+wallRouting.length+')</b></div>';
for(var ri=0;ri<wallRouting.length;ri++){var r=wallRouting[ri];
var passDesc=['','perfect','tex-only','bbox-only','fallback (wrong tex page!)'][r.pass]||'no room';
var passColor=['#666','#44cc88','#aacc44','#cc8844','#cc4444'][r.pass]||'#cc4444';
html+='<div style="padding:1px 8px;font-size:8px;color:#888">'+
'wall#'+r.widx+' → '+r.kmdName+' blk'+r.blockIdx+
' <span style="color:'+passColor+'">['+passDesc+']</span></div>';}
html+='<div style="padding:2px 8px;font-size:7px;color:#555">perfect=bbox+texture match, fallback=texture page mismatch (wall may render with wrong/missing texture)</div>';}
p.innerHTML=html}


// ============================================================
