// ═══════════════════════════════════════════════════════════════════════════
// FILE: 01_gcl.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ==================== GLB TEXTURED OVERLAY ====================
function handleGLB(f){if(!f||!sc3)return;var r=new FileReader();
r.onload=function(e){try{
if(glbObj){sc3.remove(glbObj);glbObj=null}
var loader=new THREE.GLTFLoader();
loader.parse(e.target.result,"",function(gltf){
glbObj=gltf.scene;glbObj.scale.set(S,S,S);
if(kmdFlip2){glbObj.rotation.x=-Math.PI/2}
glbObj.visible=showGlb;sc3.add(glbObj);
document.getElementById("glb-info").textContent="GLB loaded"
},function(err){document.getElementById("glb-info").textContent="GLB error: "+err.message})}catch(err){document.getElementById("glb-info").textContent="GLB fail: "+err}};
r.readAsArrayBuffer(f)}
function toggleGlb(){if(!glbObj)return;showGlb=!showGlb;glbObj.visible=showGlb;document.getElementById("btnGlb").classList.toggle("active",showGlb)}
function clearGlb(){if(glbObj){sc3.remove(glbObj);glbObj=null}document.getElementById("glb-info").textContent=""}




// ==================== GCL VISUALIZER ====================
function parseGCLScript(text){
gclEntities=[];selGCL=-1;
var lines=text.replace(/\r/g,"").split("\n");var fullText=lines.join("\n");
var charaRe=/chara\s+(\w+)\s+(\S+)\s*((?:\\\n|[^}])*?)(?=\n\s*(?:chara|mesg|eval|map|trap|ntrap|if|else|}|radio|func|delay|call|hzd|proc|#|$))/g;
var m;
while((m=charaRe.exec(fullText))!==null){
var type=m[1],name=m[2],params=m[3].replace(/\\\n/g," ");
var ent={type:type,name:name,raw:params};
var pm=params.match(/-pos\s+(-?\d+),(-?\d+),(-?\d+)/);if(pm)ent.pos={x:+pm[1],y:+pm[2],z:+pm[3]};
if(!ent.pos){pm=params.match(/-p\s+(-?\d+),(-?\d+),(-?\d+)/);if(pm)ent.pos={x:+pm[1],y:+pm[2],z:+pm[3]}}
var nm2=params.match(/-n\s+(-?\d+),(-?\d+),(-?\d+)/);if(nm2)ent.spawnPos={x:+nm2[1],y:+nm2[2],z:+nm2[3]};
var dm=params.match(/-dir\s+(-?\d+),(-?\d+),(-?\d+)/);if(dm)ent.dir={x:+dm[1],y:+dm[2],z:+dm[3]};
if(!ent.dir){dm=params.match(/-d\s+(-?\d+),(-?\d+),(-?\d+)/);if(dm)ent.dir={x:+dm[1],y:+dm[2],z:+dm[3]}}
var rm2=params.match(/-route\s+(\d+)/);if(rm2)ent.route=+rm2[1];
var mm2=params.match(/-model\s+(\S+)/);if(mm2)ent.model=mm2[1];
if(!ent.model){mm2=params.match(/-m\s+(\S+)/);if(mm2)ent.model=mm2[1]}
var hm=params.match(/-h\s+(\d+)/);if(hm)ent.height=+hm[1];
var im=params.match(/-index\s+(\d+)/);if(im)ent.itemIndex=+im[1];
var num=params.match(/-num\s+(\d+)/);if(num)ent.num=+num[1];
var msg=params.match(/-msg\s+"([^"]+)"/);if(msg)ent.msg=msg[1];
var box=params.match(/-box\s+(\d+)/);if(box)ent.box=+box[1];
// CAMERA-specific parameters (sight cone). Long names: -len, -width, -xRange.
// Engine only checks first char so -l, -w, -x equivalents also work.
if(type==="CAMERA"||type==="CAMERA2"){
var lenM=params.match(/-len\s+(\d+)|-l\s+(\d+)(?!\w)/);if(lenM)ent.camLen=+(lenM[1]||lenM[2]);
var widM=params.match(/-width\s+(\d+)|-w\s+(\d+)(?!\w)/);if(widM)ent.camWidth=+(widM[1]||widM[2]);
var xrM=params.match(/-xRange\s+(\d+)|-x\s+(\d+)(?!\w)/);if(xrM)ent.camXRange=+(xrM[1]||xrM[2]);
var execM=params.match(/-exec\s+(\w+)|-e\s+(\w+)(?!\w)/);if(execM)ent.execProc=execM[1]||execM[2];}
// GUNCAME — auto-firing ceiling gun. Same sight-cone fields as CAMERA but with
// a different name space (gunLen/gunWidth/etc) so the property panel can render
// it independently of the standard surveillance camera.
if(type==="GUNCAME"){
var gmM=params.match(/-m\s+(\d+)/);if(gmM)ent.gunMode=+gmM[1];
var glenM=params.match(/-len\s+(\d+)/);if(glenM)ent.gunLen=+glenM[1];
var gwidM=params.match(/-width\s+(\d+)/);if(gwidM)ent.gunWidth=+gwidM[1];
var gxrM=params.match(/-xRange\s+(\d+)/);if(gxrM)ent.gunXRange=+gxrM[1];
var grM=params.match(/-r\s+(-?\d+),(-?\d+),(-?\d+)/);if(grM)ent.gunRotation={x:+grM[1],y:+grM[2],z:+grM[3]};
var ggM=params.match(/-g\s+(-?\d+\s+-?\d+)/);if(ggM)ent.gunGroup=ggM[1];
var gxM=params.match(/-exec\s+(\w+)/);if(gxM)ent.gunExec=gxM[1];}
// INFRARED_CENSOR — IR tripwire beam between TWO endpoints. The -pos field has
// TWO vec3 triples separated by whitespace. -move is the sweep direction
// (vertical sweep is the common pattern). -speed is sweep rate (literal or var).
// -b is a 2-int behavior pair; vanilla uses "60 0" everywhere it appears.
if(type==="INFRARED_CENSOR"){
// -pos has two consecutive vec3 triples: X1,Y1,Z1  X2,Y2,Z2
var irPosM=params.match(/-pos\s+(-?\d+),(-?\d+),(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)/);
if(irPosM){
ent.pos={x:+irPosM[1],y:+irPosM[2],z:+irPosM[3]};
ent.beamEnd={x:+irPosM[4],y:+irPosM[5],z:+irPosM[6]};}
var irMvM=params.match(/-move\s+(-?\d+),(-?\d+),(-?\d+)/);
if(irMvM)ent.beamMove={x:+irMvM[1],y:+irMvM[2],z:+irMvM[3]};
// -speed can be a literal int OR a $w: variable reference. Store as string.
var irSpM=params.match(/-speed\s+(\$\w:\w+|\d+)/);
if(irSpM)ent.beamSpeed=irSpM[1];
var irBM=params.match(/-b\s+(-?\d+\s+-?\d+)/);
if(irBM)ent.beamBehavior=irBM[1];
var irExM=params.match(/-e\s+(\w+)/);
if(irExM)ent.beamCallback=irExM[1];}
// DOOR — complete schema decoded from FoxDie decomp (source/thing/door.c).
//   -t   door type (1 = sliding wall, 2 = elevator)
//   -w   leaf width (animation distance the door panel travels). Default 1000.
//   -s   speed (how fast leaf opens). Default 100.
//   -u   vertical offset for elevator-style doors. Default 0.
//   -h   HZD segment number for hit/collision. Default 0.
//   -v   vertical animation extent. Default 2500.
//   -f   callback proc — fires on every enter/leave event.
//   -g   "axis map1 map2" — side-room loader: axis (1=Z, 2=X) picks which map
//        to switch to based on player side of door. THIS is the room-drawing wiring.
//   -e   sound effect pair (2 small ints, e.g. "91 88" for sliding, "98 97" for elevator).
//   -a   animation timing.
if(type==="DOOR"){
var dtM=params.match(/-t\s+(\d+)/);if(dtM)ent.doorT=+dtM[1];
var dwM=params.match(/-w\s+(\d+)/);if(dwM)ent.doorW=+dwM[1];
var dsM=params.match(/-s\s+(\d+)/);if(dsM)ent.doorS=+dsM[1];
var duM=params.match(/-u\s+(\d+)/);if(duM)ent.doorU=+duM[1];
var dhM=params.match(/-h\s+(\d+)/);if(dhM)ent.doorH=+dhM[1];
var dvM=params.match(/-v\s+(\d+)/);if(dvM)ent.doorV=+dvM[1];
var dfM=params.match(/-f\s+(\w+)/);if(dfM)ent.doorF=dfM[1];
// -g format: "<axis> <map1> <map2>" where maps can be either keywords (main) or hex (0x76af)
var dgM=params.match(/-g\s+(\d+)\s+(\S+)\s+(\S+)/);
if(dgM){ent.doorG={axis:+dgM[1],map1:dgM[2],map2:dgM[3]};}
// -e format: "<int1> <int2>"
var deM=params.match(/-e\s+(\d+)\s+(\d+)/);
if(deM)ent.doorE={s1:+deM[1],s2:+deM[2]};
var daM=params.match(/-a\s+(\d+)/);if(daM)ent.doorA=+daM[1];
}
// WATCHER-specific AI parameters
if(type==="WATCHER"){
// Spawn node — engine reads this, not -pos
var nM=params.match(/-n\s+(-?\d+),(-?\d+),(-?\d+)/);if(nM){ent.spawnPos={x:+nM[1],y:+nM[2],z:+nM[3]};
if(!ent.pos)ent.pos={x:+nM[1],y:+nM[2],z:+nM[3]}}
var bM=params.match(/-b\s+'(\w)'/);if(bM)ent.bloodType=bM[1];
var fM=params.match(/-f\s+(\d+)/);if(fM)ent.faint=+fM[1];
var lM=params.match(/-life\s+(\d+)/);if(lM)ent.life=+lM[1];
var aM=params.match(/-a\s+'(\w)'/);if(aM)ent.areaType=aM[1];
var sM=params.match(/-s\s+(-?\d+)/);if(sM)ent.sizeBonus=+sM[1];
var yM=params.match(/-y\s+(\d+)/);if(yM)ent.yFlag=+yM[1];
var jM=params.match(/-j\s+(\d+)/);if(jM)ent.jFlag=+jM[1];
var gM=params.match(/-g\s+(\d+)/);if(gM)ent.gFlag=+gM[1];
var hWatcher=params.match(/-h\s+(\d+)/);if(hWatcher)ent.hFlag=+hWatcher[1];
var eM=params.match(/-e\s+(\w+)/);if(eM)ent.deathProc=eM[1];}
// Store original values for export matching
if(ent.pos)ent.origPos={x:ent.pos.x,y:ent.pos.y,z:ent.pos.z};
if(ent.dir)ent.origDir={x:ent.dir.x,y:ent.dir.y,z:ent.dir.z};
if(ent.itemIndex!==undefined)ent.origIndex=ent.itemIndex;
if(ent.box!==undefined)ent.origBox=ent.box;
ent.origName=name;
gclEntities.push(ent)}
var snakeM=fullText.match(/chara\s+SNAKE\s+SNAKE\s*\\?\n\s*-pos\s+(-?\d+),(-?\d+),(-?\d+)\s*\\?\n\s*-dir\s+(-?\d+),(-?\d+),(-?\d+)/);
if(snakeM)gclEntities.push({type:"SNAKE",name:"SNAKE",pos:{x:+snakeM[1],y:+snakeM[2],z:+snakeM[3]},dir:{x:+snakeM[4],y:+snakeM[5],z:+snakeM[6]}});
else{var snakeM2=fullText.match(/chara\s+SNAKE\s+SNAKE\s*\\?\n\s*-pos\s+(-?\d+),(-?\d+),(-?\d+)/);
if(snakeM2)gclEntities.push({type:"SNAKE",name:"SNAKE",pos:{x:+snakeM2[1],y:+snakeM2[2],z:+snakeM2[3]}})}
// Parse camera angles from proc definitions
camAngles=[];
var procRe=/proc\s+(\w+)\s*\{([\s\S]*?)\n\}/g;var pm3;
while((pm3=procRe.exec(fullText))!==null){var procName=pm3[1],procBody=pm3[2];
if(procBody.indexOf("camera")<0)continue;
var camMatch=procBody.match(/camera\s+([\s\S]*?)(?=\n\s*(?:\}|[a-z]))/);
if(!camMatch)camMatch=procBody.match(/camera([\s\S]*)/);
if(!camMatch)continue;
var camParams=camMatch[1].replace(/\\\r?\n/g," ").replace(/\n/g," ").replace(/\s+/g," ").trim();
if(camParams.indexOf("-bound")<0&&camParams.indexOf("-set")<0)continue;
var ca={proc:procName,raw:camParams,type:"tracking"};
var bm=camParams.match(/-bound\s+(-?\d+),(-?\d+),(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)/);
if(bm)ca.bound={x1:+bm[1],y1:+bm[2],z1:+bm[3],x2:+bm[4],y2:+bm[5],z2:+bm[6]};
var lm2=camParams.match(/-limit\s+(-?\d+),(-?\d+),(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)/);
if(lm2)ca.limit={x1:+lm2[1],y1:+lm2[2],z1:+lm2[3],x2:+lm2[4],y2:+lm2[5],z2:+lm2[6]};
var rm3=camParams.match(/-rot\s+(-?\d+),(-?\d+),(-?\d+)/);
if(rm3)ca.rot={pitch:+rm3[1],yaw:+rm3[2],roll:+rm3[3]};
var tm2=camParams.match(/-track\s+(\d+)/);if(tm2)ca.track=+tm2[1];
// Fixed camera: -set with 4 prefix flags + 2 vec3 (comma-separated coords)
// Format: -set [//] cam_id param1 interp type pos_x,pos_y,pos_z tgt_x,tgt_y,tgt_z [alert_mask]
// The leading "//" is a decompile artifact representing camera slot 0; treat as optional and as flag1=0 if present.
var setCommaRe=/-set\s+(?:(\/\/)\s+)?(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)(?:\s+(-?\d+))?/;
var sm2=camParams.match(setCommaRe);
if(sm2){ca.type="fixed";
ca.setSlashPrefix=!!sm2[1];// preserve the // marker
ca.setCamId=+sm2[2];ca.setParam1=+sm2[3];ca.setInterp=+sm2[4];ca.setCamType=+sm2[5];
ca.setPos={x:+sm2[6],y:+sm2[7],z:+sm2[8]};
ca.setTarget={x:+sm2[9],y:+sm2[10],z:+sm2[11]};
if(sm2[12]!==undefined)ca.setAlertMask=+sm2[12];}
// Alternate format: all space-separated (no commas)
if(!sm2){var setSpaceRe=/-set\s+(?:(\/\/)\s+)?(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?/;
var sm3=camParams.match(setSpaceRe);
if(sm3){ca.type="fixed";
ca.setSlashPrefix=!!sm3[1];
ca.setCamId=+sm3[2];ca.setParam1=+sm3[3];ca.setInterp=+sm3[4];ca.setCamType=+sm3[5];
ca.setPos={x:+sm3[6],y:+sm3[7],z:+sm3[8]};
ca.setTarget={x:+sm3[9],y:+sm3[10],z:+sm3[11]};
if(sm3[12]!==undefined)ca.setAlertMask=+sm3[12];
ca.setUsesSpaces=true;}}
// store original raw params for export diff patching — must be set on EACH camera, not just the last
ca.origRaw=camParams;ca.modified=false;
camAngles.push(ca)}
console.log("Parsed "+camAngles.length+" camera angles from GCL");

// Parse trap/ntrap statements — these are camera/event trigger zones
trapZones=[];
// Two forms:
// 1) trap NAME TARGET COND { body }  — block form with condition and body
// 2) ntrap NAME TARGET \  -opt val \  ...  — line-continuation form with options
// Both reference HZD zone NAME (matches names from HZM zones).
var trapRe=/(n?trap)\s+(\w+)\s+(\S+)(?:\s+(\w+))?\s*([\{\\])/g;
var trapMatch;
while((trapMatch=trapRe.exec(fullText))!==null){
var tkind=trapMatch[1],tzone=trapMatch[2],ttarget=trapMatch[3],tcond=trapMatch[4]||"",tStart=trapMatch.index+trapMatch[0].length;
var tBody="";
if(trapMatch[5]==="{"){
// Block form — find matching closing }
var depth=1,ti=tStart;
while(ti<fullText.length&&depth>0){var c=fullText[ti];if(c==="{")depth++;else if(c==="}")depth--;ti++;}
tBody=fullText.substring(tStart,ti-1);}
else{
// Line continuation form (ntrap with options on continuation lines)
var tBuf="",ci=tStart;
while(ci<fullText.length){
// find end of current line
var eol=fullText.indexOf("\n",ci);if(eol<0)eol=fullText.length;
var line=fullText.substring(ci,eol);
tBuf+=line+"\n";
// check if line ends with continuation backslash
var trimmed=line.replace(/\r$/,"").trimEnd();
if(!trimmed.endsWith("\\"))break;
ci=eol+1;}
tBody=tBuf;}
// Find calls inside body: 'call procName' or 'mesg' etc.
var calledProcs=[];
var callRe=/\bcall\s+(\w+)/g;var cm;
while((cm=callRe.exec(tBody))!==null)calledProcs.push(cm[1]);
trapZones.push({kind:tkind,zoneName:tzone,target:ttarget,cond:tcond,body:tBody.trim(),calledProcs:calledProcs});}
console.log("Parsed "+trapZones.length+" trap/ntrap statements");
return gclEntities}

function rebuildGCLVis(){
for(var i=0;i<gclObjs2.length;i++)sc3.remove(gclObjs2[i]);gclObjs2=[];
if(!showGclVis||gclEntities.length===0)return;
var colors={SNAKE:0x00ff00,WATCHER:0xff4444,CAMERA:0xffff00,CAMERA2:0xffff44,ITEM:0x44aaff,
OBSTACLE:0x888888,DYNAMIC_SEGMENT:0xff8800,MOUSE:0x886644,SEARCH_LIGHT:0xffff88,
EMITTER:0x664488,PATO_LAMP:0xffaa44,COMMAND:0xff0088,ENV_SOUND:0x448866,DOOR:0xff8844,
DOOR2:0xcc7744,SHUTER:0xcc6644,DOG:0xcc8844,WOLF2:0xaa6633,LAND_MINE:0xff6644,
INFRARED_CENSOR:0xff44aa,LIFE_UP:0x44ffaa,ELEVATOR:0x8888ff,ELEVATOR_PANEL:0x6666ff,
PUT_OBJECT:0x666666,PUTHZD:0x445566,PSYOBJ:0xaa44cc,CHAIR:0x886633,
LAMP:0xddcc88,GLASS:0x99ccff,CINEMA:0xaa88aa,CAT_IN:0x77aaaa,
VIBRATE:0xcc6688,GUNCAME:0xffcc44};
// Map GCL entity types to MDL model filenames
var mdlMap={CAMERA:"s_camera.kmd",SEARCH_LIGHT:"cam_arm.kmd",WATCHER:"ippanhei.kmd"};
for(i=0;i<gclEntities.length;i++){var ent=gclEntities[i];

var pos=ent.pos||ent.spawnPos;if(!pos)continue;
var c2=colors[ent.type]||0xff4488;
var isSel3=selGCL===i;
// Cross-reference highlight: when a route is selected, entities using that route
// glow cyan so you can spot them instantly. The selected entity itself still
// gets the regular white selection color.
var isXRef=!isSel3&&selRoute>=0&&ent.type==="WATCHER"&&ent.route===selRoute;
if(isXRef)c2=0x00ffff;
// MGS angle→radians: 4096 units = 2π. Y axis (yaw).
var dirY=(ent.dir?ent.dir.y:0)/4096*Math.PI*2;
// Determine model: GCL -m field first, then type map, then fallback
var mdlName=null;
if(ent.model){mdlName=ent.model+".kmd";if(!mdlSubModels[mdlName])mdlName=ent.model}
if(!mdlName||!mdlSubModels[mdlName])mdlName=mdlMap[ent.type]||null;
var usedModel=false;
if(mdlName&&mdlSubModels[mdlName]){
var mkd=loadKMD(mdlSubModels[mdlName].buf);
if(mkd.tris.length>0){
// TEXTURED PATH: if textures are loaded AND the KMD has texture groups,
// render each group as its own mesh with the right texture map applied.
// This lets doors, obstacles, tanks, etc. show their actual textures in
// the editor — invaluable for diagnosing texture-loading problems and
// for seeing what models look like before exporting.
var hasTexGroups=darLoaded&&mkd.texGroups&&Object.keys(mkd.texGroups).length>0;
// Switch to textured rendering whenever the KMD has texture groups, even
// for selected entities (selection feedback comes via a wireframe overlay
// added below — the underlying texture should stay visible just like
// walls/floors stay textured when selected in textured view mode).
if(hasTexGroups){
var tgKeys2=Object.keys(mkd.texGroups);
for(var tgi=0;tgi<tgKeys2.length;tgi++){
var tgHash=parseInt(tgKeys2[tgi]);
var tgGrp=mkd.texGroups[tgHash];
if(!tgGrp||tgGrp.positions.length===0)continue;
var tgMat;
if(darTextures[tgHash]){
tgMat=new THREE.MeshBasicMaterial({map:darTextures[tgHash].tex,side:THREE.BackSide,transparent:true,opacity:0.95});
}else{
// Missing texture in current VRAM — show magenta to flag it visually.
// Keep DoubleSide so it's visible from any angle (it's a diagnostic).
tgMat=new THREE.MeshBasicMaterial({color:0xff00ff,side:THREE.DoubleSide,transparent:true,opacity:0.5});}
var tgGeo=new THREE.BufferGeometry();
tgGeo.setAttribute("position",new THREE.Float32BufferAttribute(tgGrp.positions,3));
tgGeo.setAttribute("uv",new THREE.Float32BufferAttribute(tgGrp.uvs,2));
var tgMesh=new THREE.Mesh(tgGeo,tgMat);
tgMesh.position.set(pos.x*S,pos.y*S,pos.z*S);tgMesh.rotation.y=dirY;
tgMesh.userData={type:"gcl",gclIdx:i};sc3.add(tgMesh);gclObjs2.push(tgMesh);}
// Selection overlay: when this entity is selected, draw a colored wireframe
// on top of the textured mesh so the user can still see the texture AND know
// it's selected. Without this, selecting a textured entity drops it back to
// a solid colored shell — exactly the bug the user reported.
if(isSel3){
var oTrisSel=[];for(var lsi=0;lsi<mkd.tris.length;lsi+=3){
oTrisSel.push(mkd.tris[lsi],mkd.tris[lsi+1],mkd.tris[lsi+2]);}
var selGeo=new THREE.BufferGeometry();
selGeo.setAttribute("position",new THREE.Float32BufferAttribute(oTrisSel,3));
var selMat=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.6});
var selMesh=new THREE.Mesh(selGeo,selMat);
selMesh.position.set(pos.x*S,pos.y*S,pos.z*S);selMesh.rotation.y=dirY;
selMesh.userData={type:"gcl",gclIdx:i};sc3.add(selMesh);gclObjs2.push(selMesh);}
usedModel=true;}
if(!usedModel){
// FALLBACK: colored shell. Used when no textures loaded, when selected
// (so the highlight color shows), or when KMD has no UV data.
// Keep geometry centered at origin so rotation works correctly
var oTris=[];for(var li=0;li<mkd.tris.length;li+=3){
oTris.push(mkd.tris[li],mkd.tris[li+1],mkd.tris[li+2])}
var mgeo=new THREE.BufferGeometry();mgeo.setAttribute("position",new THREE.Float32BufferAttribute(oTris,3));mgeo.computeVertexNormals();
var mmat=new THREE.MeshPhongMaterial({color:isSel3?0xffffff:c2,transparent:true,opacity:0.7,side:THREE.DoubleSide,flatShading:true});
var mmesh=new THREE.Mesh(mgeo,mmat);
mmesh.position.set(pos.x*S,pos.y*S,pos.z*S);mmesh.rotation.y=dirY;
if(ent.type==="CAMERA"&&(showCamAngles||isSel3)){mmat.depthTest=false;mmesh.renderOrder=8;}
mmesh.userData={type:"gcl",gclIdx:i};sc3.add(mmesh);gclObjs2.push(mmesh);
var wmat=new THREE.MeshBasicMaterial({color:isSel3?0xffffff:c2,wireframe:true,transparent:true,opacity:0.3});
var wmesh=new THREE.Mesh(mgeo.clone(),wmat);
wmesh.position.set(pos.x*S,pos.y*S,pos.z*S);wmesh.rotation.y=dirY;
if(ent.type==="CAMERA"&&(showCamAngles||isSel3)){wmat.depthTest=false;wmesh.renderOrder=8;}
wmesh.userData={type:"gcl",gclIdx:i};sc3.add(wmesh);gclObjs2.push(wmesh);
usedModel=true;}}}
// Built-in Snake model fallback
if(!usedModel&&ent.type==="SNAKE"){
var snkTris=getSnakeModel();
// Keep geometry at origin for rotation support
var oTris2=[];for(var si=0;si<snkTris.length;si+=3){
oTris2.push(snkTris[si],snkTris[si+1],snkTris[si+2])}
var sgeo=new THREE.BufferGeometry();sgeo.setAttribute("position",new THREE.Float32BufferAttribute(oTris2,3));sgeo.computeVertexNormals();
var smat=new THREE.MeshPhongMaterial({color:isSel3?0xffffff:0x00ff00,transparent:true,opacity:0.8,side:THREE.DoubleSide,flatShading:true});
var smesh=new THREE.Mesh(sgeo,smat);
smesh.position.set(pos.x*S,pos.y*S,pos.z*S);smesh.rotation.y=dirY;
smesh.userData={type:"gcl",gclIdx:i};sc3.add(smesh);gclObjs2.push(smesh);usedModel=true}
if(!usedModel){
var sz2=ent.type==="SNAKE"?0.5:ent.type==="WATCHER"?0.4:ent.type==="ITEM"?0.25:0.2;
var g3=new THREE.SphereGeometry(sz2,8,8);
var m3mat=new THREE.MeshBasicMaterial({color:isSel3?0xffffff:c2});
if(ent.type==="CAMERA"&&(showCamAngles||isSel3)){m3mat.depthTest=false;}
var m3=new THREE.Mesh(g3,m3mat);
m3.position.set(pos.x*S,pos.y*S+0.1,pos.z*S);m3.rotation.y=dirY;
if(ent.type==="CAMERA"&&(showCamAngles||isSel3))m3.renderOrder=8;
m3.userData={type:"gcl",gclIdx:i};sc3.add(m3);gclObjs2.push(m3)}
// --- WATCHER: 60° red FOV cone + ghost click sphere (mirrors CAMERA treatment) ---
if(ent.type==="WATCHER"){
var wGhostGeo=new THREE.SphereGeometry(0.45,8,8);
var wGhostMat=new THREE.MeshBasicMaterial({color:0xff4444,transparent:true,opacity:0.04,depthTest:false});
var wGhostSph=new THREE.Mesh(wGhostGeo,wGhostMat);
wGhostSph.position.set(pos.x*S,pos.y*S,pos.z*S);wGhostSph.renderOrder=9;
wGhostSph.userData={type:"gcl",gclIdx:i};sc3.add(wGhostSph);gclObjs2.push(wGhostSph);
if(showFOV||isSel3){
var wFovHalf=Math.PI/6;// 60° total (30° half)
var wFovLen=3.5;
var wFovCol=isSel3?0xffffff:0xff3333;
var wLAng=dirY-wFovHalf,wRAng=dirY+wFovHalf;
var wOx=pos.x*S,wOy=pos.y*S+0.06,wOz=pos.z*S;
var wLX=Math.sin(wLAng)*wFovLen,wLZ=Math.cos(wLAng)*wFovLen;
var wRX=Math.sin(wRAng)*wFovLen,wRZ=Math.cos(wRAng)*wFovLen;
var wFovGeo=new THREE.BufferGeometry();
wFovGeo.setAttribute("position",new THREE.Float32BufferAttribute([wOx,wOy,wOz,wOx+wLX,wOy,wOz+wLZ,wOx+wRX,wOy,wOz+wRZ],3));
var wFovMesh=new THREE.Mesh(wFovGeo,new THREE.MeshBasicMaterial({color:wFovCol,transparent:true,opacity:isSel3?0.28:0.15,side:THREE.DoubleSide,depthTest:false}));
wFovMesh.renderOrder=7;wFovMesh.userData={type:"gcl",gclIdx:i};sc3.add(wFovMesh);gclObjs2.push(wFovMesh);
var wFovOGeo=new THREE.BufferGeometry();
wFovOGeo.setAttribute("position",new THREE.Float32BufferAttribute([wOx,wOy,wOz,wOx+wLX,wOy,wOz+wLZ, wOx,wOy,wOz,wOx+wRX,wOy,wOz+wRZ, wOx+wLX,wOy,wOz+wLZ,wOx+wRX,wOy,wOz+wRZ],3));
var wFovLine=new THREE.LineSegments(wFovOGeo,new THREE.LineBasicMaterial({color:wFovCol,depthTest:false}));
wFovLine.renderOrder=7;sc3.add(wFovLine);gclObjs2.push(wFovLine)}
var wDir=new THREE.Vector3(Math.sin(dirY),0,Math.cos(dirY));
var wOrg=new THREE.Vector3(pos.x*S,pos.y*S+0.15,pos.z*S);
var wArrow=new THREE.ArrowHelper(wDir,wOrg,0.8,isSel3?0xffffff:0xff4444,0.28,0.18);
wArrow.traverse(function(o){if(o.isMesh||o.isLine){o.material.depthTest=false;o.renderOrder=9}});
wArrow.userData={type:"gcl",gclIdx:i};sc3.add(wArrow);gclObjs2.push(wArrow);
// Spawn point sphere — shown for all WATCHERs that have a separate spawnPos
if(ent.spawnPos&&ent.pos&&(ent.spawnPos.x!==ent.pos.x||ent.spawnPos.z!==ent.pos.z)){
var spIsSelected=(selGCLSpawn&&selGCL===i);
var spCol=spIsSelected?0xffffff:0xff8800;
var spGeo=new THREE.SphereGeometry(spIsSelected?0.38:0.22,8,8);
var spMat=new THREE.MeshBasicMaterial({color:spCol,transparent:true,opacity:spIsSelected?0.9:0.55,depthTest:false});
var spMesh=new THREE.Mesh(spGeo,spMat);
spMesh.position.set(ent.spawnPos.x*S,ent.spawnPos.y*S+0.1,ent.spawnPos.z*S);
spMesh.renderOrder=8;spMesh.userData={type:"gcl_spawn",gclIdx:i};sc3.add(spMesh);gclObjs2.push(spMesh);
// Connector line spawn→route start
var spLG=new THREE.BufferGeometry();spLG.setAttribute("position",new THREE.Float32BufferAttribute([
ent.spawnPos.x*S,ent.spawnPos.y*S+0.1,ent.spawnPos.z*S, pos.x*S,pos.y*S+0.1,pos.z*S],3));
var spLine=new THREE.Line(spLG,new THREE.LineBasicMaterial({color:0xff8800,transparent:true,opacity:0.4,depthTest:false}));
spLine.renderOrder=7;sc3.add(spLine);gclObjs2.push(spLine);
// "S" label
var spLC=document.createElement("canvas");spLC.width=48;spLC.height=24;
var spCtx=spLC.getContext("2d");spCtx.fillStyle=spIsSelected?"#fff":"#ff8800";spCtx.font="bold 13px monospace";spCtx.fillText("SP",2,17);
var spTex=new THREE.CanvasTexture(spLC);var spSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:spTex,transparent:true}));
spSpr.scale.set(0.4,0.2,1);spSpr.position.set(ent.spawnPos.x*S,ent.spawnPos.y*S+0.55,ent.spawnPos.z*S);sc3.add(spSpr);gclObjs2.push(spSpr);}}
// --- CAMERA: 45° FOV cone (always on top) + ghost click sphere ---
if(ent.type==="CAMERA"){
// Invisible-ish ghost sphere for reliable raycasting regardless of scene depth
var ghostGeo=new THREE.SphereGeometry(0.45,8,8);
var ghostMat=new THREE.MeshBasicMaterial({color:0xffff00,transparent:true,opacity:0.04,depthTest:false});
var ghostSph=new THREE.Mesh(ghostGeo,ghostMat);
ghostSph.position.set(pos.x*S,pos.y*S,pos.z*S);ghostSph.renderOrder=9;
ghostSph.userData={type:"gcl",gclIdx:i};sc3.add(ghostSph);gclObjs2.push(ghostSph);
// FOV cone: always shown for cameras, always on top when showCamAngles active
if(showFOV||isSel3||showCamAngles){
var cFovHalf=Math.PI/8;// 45° total (22.5° half)
var cFovLen=5.0;
var cFovCol=isSel3?0xffffff:0xffff22;
var cLAng=dirY-cFovHalf,cRAng=dirY+cFovHalf;
var cOx=pos.x*S,cOy=pos.y*S+0.06,cOz=pos.z*S;
var cLX=Math.sin(cLAng)*cFovLen,cLZ=Math.cos(cLAng)*cFovLen;
var cRX=Math.sin(cRAng)*cFovLen,cRZ=Math.cos(cRAng)*cFovLen;
var cFovGeo=new THREE.BufferGeometry();
cFovGeo.setAttribute("position",new THREE.Float32BufferAttribute([cOx,cOy,cOz,cOx+cLX,cOy,cOz+cLZ,cOx+cRX,cOy,cOz+cRZ],3));
var cFovMesh=new THREE.Mesh(cFovGeo,new THREE.MeshBasicMaterial({color:cFovCol,transparent:true,opacity:isSel3?0.28:0.15,side:THREE.DoubleSide,depthTest:false}));
cFovMesh.renderOrder=7;cFovMesh.userData={type:"gcl",gclIdx:i};sc3.add(cFovMesh);gclObjs2.push(cFovMesh);
var cFovOGeo=new THREE.BufferGeometry();
cFovOGeo.setAttribute("position",new THREE.Float32BufferAttribute([cOx,cOy,cOz,cOx+cLX,cOy,cOz+cLZ, cOx,cOy,cOz,cOx+cRX,cOy,cOz+cRZ, cOx+cLX,cOy,cOz+cLZ,cOx+cRX,cOy,cOz+cRZ],3));
var cFovLine=new THREE.LineSegments(cFovOGeo,new THREE.LineBasicMaterial({color:cFovCol,depthTest:false}));
cFovLine.renderOrder=7;sc3.add(cFovLine);gclObjs2.push(cFovLine)}
// Forward arrow, always on top
var caDir=new THREE.Vector3(Math.sin(dirY),0,Math.cos(dirY));
var caOrg=new THREE.Vector3(pos.x*S,pos.y*S+0.15,pos.z*S);
var camArrow=new THREE.ArrowHelper(caDir,caOrg,0.8,isSel3?0xffffff:0xffff00,0.28,0.18);
camArrow.traverse(function(o){if(o.isMesh||o.isLine){o.material.depthTest=false;o.renderOrder=9}});
camArrow.userData={type:"gcl",gclIdx:i};sc3.add(camArrow);gclObjs2.push(camArrow);}
// --- GUNCAME: orange sight cone, similar to CAMERA but distinct color so users
// can tell standard surveillance cameras from auto-firing gun cameras at a glance.
if(ent.type==="GUNCAME"){
// Ghost click sphere
var ggGeo=new THREE.SphereGeometry(0.45,8,8);
var ggMat=new THREE.MeshBasicMaterial({color:0xff8800,transparent:true,opacity:0.06,depthTest:false});
var ggSph=new THREE.Mesh(ggGeo,ggMat);
ggSph.position.set(pos.x*S,pos.y*S,pos.z*S);ggSph.renderOrder=9;
ggSph.userData={type:"gcl",gclIdx:i};sc3.add(ggSph);gclObjs2.push(ggSph);
if(showFOV||isSel3||showCamAngles){
// Width is in -gunWidth units (0-1024). Convert to radians: 1024 → ~0.39 rad (~22°)
var gcWidth=(ent.gunWidth||300)/1024;
var gcLen=Math.max(2,(ent.gunLen||5000)/2000);// length scale roughly matches CAMERA's 5.0
var gcCol=isSel3?0xffffff:0xff8800;
var gcLAng=dirY-gcWidth,gcRAng=dirY+gcWidth;
var gcOx=pos.x*S,gcOy=pos.y*S+0.06,gcOz=pos.z*S;
var gcLX=Math.sin(gcLAng)*gcLen,gcLZ=Math.cos(gcLAng)*gcLen;
var gcRX=Math.sin(gcRAng)*gcLen,gcRZ=Math.cos(gcRAng)*gcLen;
var gcGeo=new THREE.BufferGeometry();
gcGeo.setAttribute("position",new THREE.Float32BufferAttribute([gcOx,gcOy,gcOz,gcOx+gcLX,gcOy,gcOz+gcLZ,gcOx+gcRX,gcOy,gcOz+gcRZ],3));
var gcMesh=new THREE.Mesh(gcGeo,new THREE.MeshBasicMaterial({color:gcCol,transparent:true,opacity:isSel3?0.32:0.18,side:THREE.DoubleSide,depthTest:false}));
gcMesh.renderOrder=7;gcMesh.userData={type:"gcl",gclIdx:i};sc3.add(gcMesh);gclObjs2.push(gcMesh);
var gcOGeo=new THREE.BufferGeometry();
gcOGeo.setAttribute("position",new THREE.Float32BufferAttribute([gcOx,gcOy,gcOz,gcOx+gcLX,gcOy,gcOz+gcLZ,gcOx,gcOy,gcOz,gcOx+gcRX,gcOy,gcOz+gcRZ,gcOx+gcLX,gcOy,gcOz+gcLZ,gcOx+gcRX,gcOy,gcOz+gcRZ],3));
var gcLine=new THREE.LineSegments(gcOGeo,new THREE.LineBasicMaterial({color:gcCol,depthTest:false}));
gcLine.renderOrder=7;sc3.add(gcLine);gclObjs2.push(gcLine);}
// Forward arrow (orange)
var ggDir=new THREE.Vector3(Math.sin(dirY),0,Math.cos(dirY));
var ggOrg=new THREE.Vector3(pos.x*S,pos.y*S+0.15,pos.z*S);
var ggArrow=new THREE.ArrowHelper(ggDir,ggOrg,0.8,isSel3?0xffffff:0xff8800,0.28,0.18);
ggArrow.traverse(function(o){if(o.isMesh||o.isLine){o.material.depthTest=false;o.renderOrder=9}});
ggArrow.userData={type:"gcl",gclIdx:i};sc3.add(ggArrow);gclObjs2.push(ggArrow);}
// --- INFRARED_CENSOR: pink beam line between two endpoints + sweep direction arrow.
// The beam is the physical alarm line; sweep arrow shows the direction it travels
// over time (large Y component = vertical sweep, the most common pattern).
if(ent.type==="INFRARED_CENSOR"){
var irPosA=pos;
var irPosB=ent.beamEnd||{x:pos.x+3000,y:pos.y,z:pos.z};
var irColor=isSel3?0xffffff:0xff44aa;
// When this IR sensor is selected, highlight the active endpoint (the one the gizmo edits)
// with a brighter color so the user knows which one will move.
var endpointAColor=(isSel3&&selGCLEndpoint===0)?0xffff44:0xff44aa;
var endpointBColor=(isSel3&&selGCLEndpoint===1)?0xffff44:0xff44aa;
var endpointAOpacity=(isSel3&&selGCLEndpoint===0)?0.55:0.10;
var endpointBOpacity=(isSel3&&selGCLEndpoint===1)?0.55:0.18;
// Click ghost: place a small sphere at endpoint A for raycast selection
var irGhost=new THREE.Mesh(new THREE.SphereGeometry(0.35,8,8),
new THREE.MeshBasicMaterial({color:endpointAColor,transparent:true,opacity:endpointAOpacity,depthTest:false}));
irGhost.position.set(irPosA.x*S,irPosA.y*S,irPosA.z*S);irGhost.renderOrder=9;
irGhost.userData={type:"gcl",gclIdx:i,irEndpoint:0};sc3.add(irGhost);gclObjs2.push(irGhost);
// Second endpoint also gets a click ghost (smaller, distinct)
var irGhostB=new THREE.Mesh(new THREE.SphereGeometry(0.30,8,8),
new THREE.MeshBasicMaterial({color:endpointBColor,transparent:true,opacity:endpointBOpacity,depthTest:false}));
irGhostB.position.set(irPosB.x*S,irPosB.y*S,irPosB.z*S);irGhostB.renderOrder=9;
// Mark as endpoint B so the click handler can switch the active endpoint
irGhostB.userData={type:"gcl",gclIdx:i,irEndpoint:1};sc3.add(irGhostB);gclObjs2.push(irGhostB);
// The beam itself — thick line A → B, always on top
var irBeamGeo=new THREE.BufferGeometry();
irBeamGeo.setAttribute("position",new THREE.Float32BufferAttribute([
irPosA.x*S,irPosA.y*S+0.02,irPosA.z*S,
irPosB.x*S,irPosB.y*S+0.02,irPosB.z*S],3));
var irBeam=new THREE.Line(irBeamGeo,new THREE.LineBasicMaterial({color:irColor,depthTest:false,linewidth:3}));
irBeam.renderOrder=8;sc3.add(irBeam);gclObjs2.push(irBeam);
// "Swept volume" — translucent quad showing where the beam sweeps to
// Build a thin parallelogram: from beam line, offset by the move vector
var bmove=ent.beamMove||{x:0,y:4000,z:0};
// Scale the move vector for display — vanilla values are in raw game units (often 3000-4000),
// scale to match the editor's coordinate scale and clamp so it's visible but not overwhelming
var displayScale=S;
var mx=bmove.x*displayScale*0.3,my=bmove.y*displayScale*0.3,mz=bmove.z*displayScale*0.3;
var irSweepGeo=new THREE.BufferGeometry();
irSweepGeo.setAttribute("position",new THREE.Float32BufferAttribute([
// Two triangles forming a quad: A, B, A+move, B, B+move, A+move
irPosA.x*S,irPosA.y*S,irPosA.z*S,
irPosB.x*S,irPosB.y*S,irPosB.z*S,
irPosA.x*S+mx,irPosA.y*S+my,irPosA.z*S+mz,
irPosB.x*S,irPosB.y*S,irPosB.z*S,
irPosB.x*S+mx,irPosB.y*S+my,irPosB.z*S+mz,
irPosA.x*S+mx,irPosA.y*S+my,irPosA.z*S+mz],3));
var irSweep=new THREE.Mesh(irSweepGeo,new THREE.MeshBasicMaterial({
color:irColor,transparent:true,opacity:isSel3?0.18:0.08,side:THREE.DoubleSide,depthTest:false}));
irSweep.renderOrder=6;irSweep.userData={type:"gcl",gclIdx:i};sc3.add(irSweep);gclObjs2.push(irSweep);
// Sweep direction arrow — from midpoint of beam, pointing in the move direction
var midX=(irPosA.x+irPosB.x)/2*S,midY=(irPosA.y+irPosB.y)/2*S,midZ=(irPosA.z+irPosB.z)/2*S;
var mlen=Math.sqrt(mx*mx+my*my+mz*mz);
if(mlen>0.001){
var moveDir=new THREE.Vector3(mx/mlen,my/mlen,mz/mlen);
var swArrow=new THREE.ArrowHelper(moveDir,new THREE.Vector3(midX,midY,midZ),
Math.min(2,mlen*0.5),irColor,0.25,0.15);
swArrow.traverse(function(o){if(o.isMesh||o.isLine){o.material.depthTest=false;o.renderOrder=9}});
sc3.add(swArrow);gclObjs2.push(swArrow);}}
// --- Single direction arrow for non-WATCHER, non-CAMERA entities ---
if(ent.type!=="WATCHER"&&ent.type!=="CAMERA"&&ent.type!=="GUNCAME"&&ent.type!=="INFRARED_CENSOR"){
var aFwdX=Math.sin(dirY),aFwdZ=Math.cos(dirY);
var aDir=new THREE.Vector3(aFwdX,0,aFwdZ).normalize();
var aOrg=new THREE.Vector3(pos.x*S,pos.y*S+0.15,pos.z*S);
var aLen=ent.type==="ITEM"?0.4:0.7;
var arrow=new THREE.ArrowHelper(aDir,aOrg,aLen,isSel3?0xffffff:c2,aLen*0.35,aLen*0.2);
arrow.userData={type:"gcl",gclIdx:i};sc3.add(arrow);gclObjs2.push(arrow);}
// --- Labels ---
var lc2=document.createElement("canvas");lc2.width=200;lc2.height=32;var lctx2=lc2.getContext("2d");
lctx2.fillStyle=isSel3?"#ffffff":"#"+c2.toString(16).padStart(6,"0");lctx2.font="11px monospace";
var label=ent.type;if(ent.name!==ent.type)label+=" "+ent.name;if(ent.route!==undefined)label+=" rt:"+ent.route;
if(ent.msg)label=ent.msg;
lctx2.fillText(label,2,16);
var ltex2=new THREE.CanvasTexture(lc2);var lsp2=new THREE.Sprite(new THREE.SpriteMaterial({map:ltex2,transparent:true}));
lsp2.scale.set(1.5,0.25,1);lsp2.position.set(pos.x*S,pos.y*S+0.6,pos.z*S);sc3.add(lsp2);gclObjs2.push(lsp2);
if(ent.type==="WATCHER"&&ent.route!==undefined&&hzm&&hzm.routes[ent.route]){
var rt4=hzm.routes[ent.route];if(rt4.waypoints.length>0){var wp0=rt4.waypoints[0];
var lg2=new THREE.BufferGeometry();lg2.setAttribute("position",new THREE.Float32BufferAttribute([
pos.x*S,pos.y*S+0.1,pos.z*S, wp0.x*S,wp0.y*S+0.1,wp0.z*S],3));
var lm3=new THREE.Line(lg2,new THREE.LineBasicMaterial({color:c2,transparent:true,opacity:0.5}));
sc3.add(lm3);gclObjs2.push(lm3)}}
if(ent.type==="DYNAMIC_SEGMENT"){var pm2=ent.raw.match(/-p\s+(-?\d+),(-?\d+),(-?\d+)\s+(-?\d+),(-?\d+),(-?\d+)/);
if(pm2){var dx1=+pm2[1]*S,dy1=+pm2[2]*S,dz1=+pm2[3]*S,dx2=+pm2[4]*S,dy2=+pm2[5]*S,dz2=+pm2[6]*S;
var dh=(ent.height||2000)*S;
var dg=new THREE.BufferGeometry();dg.setAttribute("position",new THREE.Float32BufferAttribute([
dx1,dy1,dz1,dx2,dy2,dz2,dx2,dy2+dh,dz2,dx1,dy1,dz1,dx2,dy2+dh,dz2,dx1,dy1+dh,dz1],3));
var dm=new THREE.Mesh(dg,new THREE.MeshBasicMaterial({color:0xff8800,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
sc3.add(dm);gclObjs2.push(dm)}}}}

function selectGCLEntity(idx){selGCL=idx;selGCLSpawn=false;
// Reset IR endpoint selection to A on every new entity selection
selGCLEndpoint=0;
// Auto-highlight the route this entity uses (if it's a WATCHER with a valid route).
// Lets the user instantly see what path the guard walks.
if(typeof highlightRouteForSelectedEntity==="function")highlightRouteForSelectedEntity();
rebuildGCLVis();showGCLProps();updateGCLPanel();rebuild();
if(typeof updateRouteList==="function")updateRouteList();}

// Switch which endpoint of an INFRARED_CENSOR the 3D gizmo edits. Call with 0 (A)
// or 1 (B). Triggers a rebuild so the gizmo moves to the new endpoint.
function selectIREndpoint(endpoint){
if(selGCL<0||selGCL>=gclEntities.length)return;
var ge=gclEntities[selGCL];
if(ge.type!=="INFRARED_CENSOR")return;
selGCLEndpoint=endpoint===1?1:0;
// Ensure beamEnd exists so the gizmo has something to attach to
if(selGCLEndpoint===1&&!ge.beamEnd){
ge.beamEnd={x:(ge.pos&&ge.pos.x+3000)||3000,y:(ge.pos&&ge.pos.y)||0,z:(ge.pos&&ge.pos.z)||0};}
rebuildGizmo();
showGCLProps();}

// Door type changed (sliding vs elevator) → swap sound effect defaults to match vanilla.
// Only swaps if the current sound IDs are at the OLD type's defaults; if the user
// has already customized them, we respect their choice.
function onDoorTypeChange(){
if(selGCL<0||selGCL>=gclEntities.length)return;
var ent=gclEntities[selGCL];
if(ent.type!=="DOOR")return;
var newT=parseInt(document.getElementById("gdoorT").value)||1;
var de1E=document.getElementById("gdoorE1"),de2E=document.getElementById("gdoorE2");
if(de1E&&de2E){
var s1=parseInt(de1E.value)||0,s2=parseInt(de2E.value)||0;
// Was at sliding default (91,88)? Switch to elevator default (98,97).
if(newT===2&&s1===91&&s2===88){de1E.value=98;de2E.value=97;}
// Was at elevator default (98,97)? Switch to sliding default (91,88).
else if(newT===1&&s1===98&&s2===97){de1E.value=91;de2E.value=88;}}
ent.doorT=newT;}

// Room-loader axis changed → re-render panel so the Map A/B fields appear/disappear.
// Must apply current panel state first so we don't lose user edits.
function onDoorAxisChange(){
if(selGCL<0||selGCL>=gclEntities.length)return;
applyGCLProps(selGCL);
showGCLProps();}
function showGCLProps(){
var panel=document.getElementById("propPanel");if(!panel)return;
if(selGCL<0||selGCL>=gclEntities.length){return}
var ent=gclEntities[selGCL];var pos=ent.pos||ent.spawnPos||{x:0,y:0,z:0};
var pstyle='style="width:58px;background:#0a0e14;color:#ff4488;border:1px solid #1a2535;border-radius:2px;font-size:11px;font-family:monospace;padding:1px 3px;margin:1px"';
// Catalog info at top of panel
var catEntry=ENTITY_CATALOG[ent.type];
var catColor=catEntry?'#'+catEntry.color.toString(16).padStart(6,"0"):'#ff4488';
var html='<div style="padding:6px">';
if(catEntry){
html+='<div style="background:#0a1a18;padding:4px 6px;margin-bottom:4px;border-left:3px solid '+catColor+';border-radius:2px">';
html+='<b style="color:'+catColor+'">'+catEntry.label+'</b> <span style="color:#556;font-size:9px">('+ent.type+' '+ent.name+')</span><br>';
html+='<span style="color:#88a;font-size:9px">'+catEntry.desc+'</span>';
html+='</div>';
}else{
html+='<b style="color:#ff4488">'+ent.type+' '+ent.name+'</b><br>';
}
html+='X:<input type="number" id="gx" value="'+pos.x+'" '+pstyle+'> Z:<input type="number" id="gz" value="'+pos.z+'" '+pstyle+'><br>';
html+='Y:<input type="number" id="gy" value="'+pos.y+'" '+pstyle+'><br>';
// Direction (all entity types)
html+='Dir Y:<input type="number" id="gdir" value="'+((ent.dir&&ent.dir.y)||0)+'" '+pstyle+'> ('+(Math.round(((ent.dir&&ent.dir.y)||0)/4096*360))+'&deg;)<br>';
// WATCHER and CAMERA both get the Dir Y slider
if(ent.type==="WATCHER"||ent.type==="CAMERA"){
html+='<input type="range" id="gdirSlider" min="0" max="4095" value="'+((ent.dir&&ent.dir.y)||0)+'" style="width:140px" oninput="document.getElementById(\'gdir\').value=this.value"><br>';}
// CAMERA also gets Dir X / Dir Z for full -d triplet control
if(ent.type==="CAMERA"){
html+='Dir X:<input type="number" id="gdirx" value="'+((ent.dir&&ent.dir.x)||0)+'" '+pstyle+'><br>';
html+='<input type="range" id="gdirxR" min="0" max="4095" value="'+((ent.dir&&ent.dir.x)||0)+'" style="width:140px" oninput="document.getElementById(\'gdirx\').value=this.value"><br>';
html+='Dir Z:<input type="number" id="gdirz" value="'+((ent.dir&&ent.dir.z)||0)+'" '+pstyle+'><br>';
html+='<input type="range" id="gdirzR" min="0" max="4095" value="'+((ent.dir&&ent.dir.z)||0)+'" style="width:140px" oninput="document.getElementById(\'gdirz\').value=this.value"><br>';
html+='<span style="font-size:8px;color:#556">-d x,y,z → pitch,yaw,roll | 4096=360°</span><br>';
// Sight-cone params required for radar visibility
html+='<div style="margin-top:4px;padding:3px;background:#0a1a2a;border-radius:2px">';
html+='<b style="color:#ffcc66;font-size:9px">SIGHT CONE</b><br>';
html+='Length:<input type="number" id="gcamLen" value="'+(ent.camLen||4000)+'" '+pstyle+' title="How far the cone reaches">';
html+=' Width:<input type="number" id="gcamW" value="'+(ent.camWidth||256)+'" '+pstyle+' title="Cone half-width (max 512)"><br>';
html+='Pan Range:<input type="number" id="gcamXR" value="'+(ent.camXRange||480)+'" '+pstyle+' title="Side-to-side pan angle (max 1024). 0 = stationary"><br>';
html+='<span style="font-size:8px;color:#556">All three required for in-game radar</span>';
html+='</div>';}
// GUNCAME — auto-firing ceiling gun. Same shape as CAMERA panel but with own field IDs.
// Surface the params modders typically tweak: direction, sight length/width, pan range,
// and the optional detect callback proc.
if(ent.type==="GUNCAME"){
html+='Dir X:<input type="number" id="ggdirx" value="'+((ent.dir&&ent.dir.x)||0)+'" '+pstyle+'><br>';
html+='<input type="range" id="ggdirxR" min="0" max="4095" value="'+((ent.dir&&ent.dir.x)||0)+'" style="width:140px" oninput="document.getElementById(\'ggdirx\').value=this.value"><br>';
html+='Dir Z:<input type="number" id="ggdirz" value="'+((ent.dir&&ent.dir.z)||0)+'" '+pstyle+'><br>';
html+='<input type="range" id="ggdirzR" min="0" max="4095" value="'+((ent.dir&&ent.dir.z)||0)+'" style="width:140px" oninput="document.getElementById(\'ggdirz\').value=this.value"><br>';
html+='<span style="font-size:8px;color:#556">-d x,y,z → pitch,yaw,roll | 4096=360°</span><br>';
html+='<div style="margin-top:4px;padding:3px;background:#3a1f0a;border-radius:2px">';
html+='<b style="color:#ffaa44;font-size:9px">GUN CAMERA SIGHT CONE</b><br>';
html+='Mode:<input type="number" id="ggMode" value="'+(ent.gunMode||1)+'" '+pstyle+' title="1 = standard tracking-and-fire">';
html+=' Length:<input type="number" id="ggLen" value="'+(ent.gunLen||5000)+'" '+pstyle+' title="Sight distance"><br>';
html+='Width:<input type="number" id="ggWidth" value="'+(ent.gunWidth||300)+'" '+pstyle+' title="Cone width">';
html+=' Pan:<input type="number" id="ggXR" value="'+(ent.gunXRange||512)+'" '+pstyle+' title="Pan range (0 = stationary)"><br>';
var grot=ent.gunRotation||{x:512,y:0,z:0};
html+='Rot:<input type="text" id="ggRot" value="'+grot.x+','+grot.y+','+grot.z+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:90px" title="Rotation triple -r x,y,z">';
html+=' Grp:<input type="text" id="ggGrp" value="'+(ent.gunGroup||"5 2")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:50px" title="-g group ID pair"><br>';
html+='Detect Callback:<input type="text" id="ggExec" value="'+(ent.gunExec||"")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:120px" title="Optional proc called when Snake is spotted"><br>';
html+='<span style="font-size:8px;color:#556">Auto-tracks + fires when Snake enters the cone</span>';
html+='</div>';}
// INFRARED_CENSOR — IR tripwire beam between two endpoints. The first endpoint is
// in ent.pos (the standard X/Y/Z fields above). The second endpoint needs its own
// editor since this is the only entity type with two positions.
if(ent.type==="INFRARED_CENSOR"){
var be=ent.beamEnd||{x:(ent.pos&&ent.pos.x+3000)||0,y:(ent.pos&&ent.pos.y)||0,z:(ent.pos&&ent.pos.z)||0};
var bmv=ent.beamMove||{x:0,y:4000,z:0};
html+='<div style="margin-top:4px;padding:3px;background:#2a0a2a;border-radius:2px">';
html+='<b style="color:#ff66cc;font-size:9px">IR BEAM</b><br>';
// Endpoint mode toggle — controls which endpoint the 3D gizmo edits.
// Without this you can only drag endpoint A; endpoint B has to be edited by typing numbers.
var epAStyle=selGCLEndpoint===0?"background:#aa44aa;color:#fff;border:1px solid #ff66cc":"background:#1a0a1a;color:#aa66aa;border:1px solid #4a2a4a";
var epBStyle=selGCLEndpoint===1?"background:#aa44aa;color:#fff;border:1px solid #ff66cc":"background:#1a0a1a;color:#aa66aa;border:1px solid #4a2a4a";
html+='<div style="margin:3px 0;font-size:9px;color:#aaa">Gizmo edits:</div>';
html+='<button onclick="selectIREndpoint(0)" style="'+epAStyle+';padding:2px 8px;font-size:10px;cursor:pointer;border-radius:2px;margin-right:3px" title="Big sphere — beam start">Endpoint A</button>';
html+='<button onclick="selectIREndpoint(1)" style="'+epBStyle+';padding:2px 8px;font-size:10px;cursor:pointer;border-radius:2px" title="Small sphere — beam end">Endpoint B</button><br>';
html+='<span style="font-size:8px;color:#aaa">Or click either sphere in 3D view to switch.</span><br>';
html+='<span style="font-size:8px;color:#aaa">Endpoint A is the entity position above. Endpoint B:</span><br>';
html+='End X:<input type="number" id="girEndX" value="'+be.x+'" '+pstyle+'>';
html+=' End Y:<input type="number" id="girEndY" value="'+be.y+'" '+pstyle+'>';
html+=' End Z:<input type="number" id="girEndZ" value="'+be.z+'" '+pstyle+'><br>';
html+='<span style="font-size:8px;color:#556">Beam runs in a straight line from A to B</span><br>';
html+='<div style="margin-top:3px"><b style="color:#ff66cc;font-size:9px">SWEEP</b><br>';
html+='Move X:<input type="number" id="girMvX" value="'+bmv.x+'" '+pstyle+'>';
html+=' Y:<input type="number" id="girMvY" value="'+bmv.y+'" '+pstyle+' title="Vertical sweep — common pattern is large Y">';
html+=' Z:<input type="number" id="girMvZ" value="'+bmv.z+'" '+pstyle+'><br>';
html+='Speed:<input type="text" id="girSpeed" value="'+(ent.beamSpeed||"100")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:80px" title="Literal int (e.g. 100) or var ref (e.g. $w:00043c)">';
html+=' Behavior:<input type="text" id="girBehav" value="'+(ent.beamBehavior||"60 0")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:60px" title="-b 2-int pair. Vanilla uses 60 0"><br>';
html+='Trigger Callback:<input type="text" id="girCb" value="'+(ent.beamCallback||"")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:120px" title="Optional proc called when beam is crossed">';
html+='</div></div>';}
// Route (WATCHER)
if(ent.type==="WATCHER"){
// Route dropdown listing all routes with waypoint counts. Routes with 0 waypoints
// will CRASH THE STAGE if assigned to a WATCHER — show in red and mark as invalid.
html+='Route: <select id="groute" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:200px">';
if(hzm&&hzm.routes){
// Only list routes that have waypoints. Empty routes can crash the stage and aren't useful options.
var anyListed=false;
for(var rIdx=0;rIdx<hzm.routes.length;rIdx++){
var rt=hzm.routes[rIdx];
var rn=rt&&rt.waypoints?rt.waypoints.length:0;
if(rn===0)continue;
var rSel=(ent.route===rIdx)?" selected":"";
html+='<option value="'+rIdx+'"'+rSel+'>Route '+rIdx+' ('+rn+' waypoints)</option>';
anyListed=true;}
if(!anyListed)html+='<option value="0">(no valid routes in this stage)</option>';
}else{
html+='<option value="'+(ent.route||0)+'">Route '+(ent.route||0)+' (HZM not loaded)</option>';
}
html+='</select><br>';
// Validation warning only if user somehow has an empty route assigned (e.g. legacy data)
if(hzm&&hzm.routes&&hzm.routes[ent.route]){
var rN=hzm.routes[ent.route].waypoints?hzm.routes[ent.route].waypoints.length:0;
if(rN===0){
html+='<div style="background:#3a0a0a;padding:3px;margin:2px 0;border-radius:2px;font-size:9px;color:#ff8866">';
html+='⚠ <b>Invalid route:</b> Route '+ent.route+' has 0 waypoints. Pick a different route from the dropdown above.';
html+='</div>';}
}
// AI Parameters — required for guards to actually function (see, shoot, react)
html+='<div style="margin-top:4px;padding:4px;background:#1a0a0a;border-radius:2px">';
html+='<b style="color:#ff8888;font-size:9px">AI PARAMETERS</b> <span style="font-size:8px;color:#776">— required for guards to detect &amp; shoot</span><br>';
html+='Health (-life):<input type="number" id="gwLife" value="'+(ent.life||192)+'" '+pstyle+' title="Max HP. Higher = more shots to kill. Default 192"><br>';
html+='Faint Threshold (-f):<input type="number" id="gwFaint" value="'+(ent.faint||7)+'" '+pstyle+' title="HP below which guard collapses unconscious. Typical 7"><br>';
html+='Size Bonus (-s):<input type="number" id="gwSize" value="'+(ent.sizeBonus!==undefined?ent.sizeBonus:227)+'" '+pstyle+' title="Added to base scale. 227 ≈ adult human. Default 227"><br>';
html+='Blood Type (-b):<select id="gwBlood" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:70px">';
html+='<option value="X"'+((ent.bloodType||"X")==="X"?" selected":"")+">X (red)</option>";
html+='<option value="Z"'+((ent.bloodType)==="Z"?" selected":"")+">Z (none)</option>";
html+='<option value="S"'+((ent.bloodType)==="S"?" selected":"")+">S (snow)</option>";
html+='</select><br>';
html+='Area Type (-a):<select id="gwArea" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:10px;width:120px">';
html+='<option value="A"'+((ent.areaType||"A")==="A"?" selected":"")+">A (default)</option>";
html+='<option value="S"'+((ent.areaType)==="S"?" selected":"")+">S (snow / white breath)</option>";
html+='</select><br>';
html+='Y-flag (-y):<input type="number" id="gwY" value="'+(ent.yFlag||1)+'" '+pstyle+' title="Vertical positioning hint. Typically 1"><br>';
html+='</div>';
if(ent.spawnPos){
var sp=ent.spawnPos;
var isSpSel=selGCLSpawn;
var isPending=spawnPendingIdx===selGCL;
html+='<div style="margin-top:4px;padding:4px;border:1px solid '+(isPending?'#ffaa00':isSpSel?'#ff8800':'#1a2535')+';border-radius:2px">';
html+='<b style="color:'+(isPending?'#ffaa00':'#ff8800')+';font-size:9px">SPAWN POINT'+(isSpSel?' ✦ (SP sphere selected)':'')+'</b><br>';
html+='SX: <span style="color:#ff8800">'+sp.x+'</span> SZ: <span style="color:#ff8800">'+sp.z+'</span> SY: <span style="color:#ff8800">'+sp.y+'</span><br>';
if(isPending){
html+='<div style="color:#ffaa00;font-size:9px;margin:3px 0">Move the guard to the desired spawn<br>location, then click below:</div>';
html+='<button onclick="confirmChangeSpawn('+selGCL+')" class="btn" style="font-size:9px;color:#ffaa00;border-color:#886600">Set New Spawn Position</button> ';
html+='<button onclick="spawnPendingIdx=-1;showGCLProps()" class="btn" style="font-size:9px">Cancel</button>';
}else{
html+='<button onclick="startChangeSpawn('+selGCL+')" class="btn" style="font-size:9px;color:#ff8800">Change Spawn</button>';
}
html+='</div>';
}}
// Model (DOOR, OBSTACLE, any with -m)
if(ent.type==="DOOR"||ent.model!==undefined){
html+='Model:<select id="gmodel" '+pstyle.replace("58px","140px")+'>';
var mdlNames=Object.keys(mdlSubModels).sort();
for(var mi=0;mi<mdlNames.length;mi++){var mn=mdlNames[mi].replace(".kmd","");
html+='<option value="'+mn+'"'+(mn===(ent.model||"")?' selected':'')+'>'+mn+'</option>'}
if(mdlNames.length===0)html+='<option value="'+(ent.model||"nst_dor")+'">'+(ent.model||"nst_dor")+'</option>';
html+='</select><br>'}
// === COMPREHENSIVE DOOR PROPERTY PANEL ===
// Surfaces every door schema field decoded from FoxDie's door.c. The most important
// ones for modders are -t (type), -g (room-loader wiring), and -f (callback proc).
// -e sound IDs swap defaults based on -t: sliding doors use "91 88", elevators use "98 97".
if(ent.type==="DOOR"){
html+='<div style="margin-top:6px;padding:4px;background:#2a1a0a;border-radius:2px;border:1px solid #5a3a1a">';
html+='<b style="color:#ff8844;font-size:10px">DOOR PARAMETERS</b><br>';
// Type selector (sliding vs elevator) — affects default sound effect pair
var doorT=ent.doorT||1;
html+='Type:<select id="gdoorT" onchange="onDoorTypeChange()" '+pstyle.replace("58px","120px")+'>';
html+='<option value="1"'+(doorT===1?' selected':'')+'>1 — Single panel (slides sideways)</option>';
html+='<option value="2"'+(doorT===2?' selected':'')+'>2 — Double panel (stage transitions, elevators)</option>';
html+='</select><br>';
// Width / speed / vertical
html+='Width:<input type="number" id="gdoorW" value="'+(ent.doorW||1500)+'" '+pstyle+' title="Animation distance the leaf travels. Default 1000.">';
html+=' Speed:<input type="number" id="gdoorS" value="'+(ent.doorS||100)+'" '+pstyle+' title="How fast the door opens. Default 100."><br>';
html+='V-Ext:<input type="number" id="gdoorV" value="'+(ent.doorV||2500)+'" '+pstyle+' title="Vertical animation extent. Default 2500.">';
html+=' V-Off:<input type="number" id="gdoorU" value="'+(ent.doorU||0)+'" '+pstyle+' title="Vertical offset for elevator-style doors. Default 0."><br>';
// Hit detection segment
html+='HZD Seg:<input type="number" id="gdoorH" value="'+(ent.doorH||0)+'" '+pstyle+' title="HZD segment for hit/collision detection. Default 0."><br>';
// Sound effect pair
var de=ent.doorE||(doorT===2?{s1:98,s2:97}:{s1:91,s2:88});
html+='Sound:<input type="number" id="gdoorE1" value="'+de.s1+'" '+pstyle+' title="Sound effect ID 1">';
html+=' <input type="number" id="gdoorE2" value="'+de.s2+'" '+pstyle+' title="Sound effect ID 2"><br>';
html+='<span style="font-size:8px;color:#aa8866">Sliding: 91 88 | Elevator: 98 97</span><br>';
// === ROOM LOADER (-g) ===
html+='<div style="margin-top:4px;padding:3px;background:#1a0a1a;border-radius:2px">';
html+='<b style="color:#ff66cc;font-size:9px">ROOM LOADER (-g)</b><br>';
html+='<span style="font-size:8px;color:#aaa">Which map gets drawn when player passes through. Pick "Disabled" if door is in a single room.</span><br>';
var dg=ent.doorG;
var gAxisVal=dg?dg.axis:0;
html+='Axis:<select id="gdoorGAxis" onchange="onDoorAxisChange()" '+pstyle.replace("58px","100px")+'>';
html+='<option value="0"'+(gAxisVal===0?' selected':'')+'>Disabled</option>';
html+='<option value="1"'+(gAxisVal===1?' selected':'')+'>1 — Z-axis</option>';
html+='<option value="2"'+(gAxisVal===2?' selected':'')+'>2 — X-axis</option>';
html+='</select><br>';
if(gAxisVal>0){
// Show map dropdowns populated with discovered maps from gclHzdZones + "main"
var mapOptions=['main'];
if(typeof gclHzdZones!=="undefined"){
for(var hk in gclHzdZones){if(mapOptions.indexOf(hk)<0)mapOptions.push(hk);}}
var dg_map1=dg?dg.map1:"main";
var dg_map2=dg?dg.map2:"main";
html+='Map A:<select id="gdoorGMap1" '+pstyle.replace("58px","110px")+'>';
for(var moi=0;moi<mapOptions.length;moi++){
html+='<option value="'+mapOptions[moi]+'"'+(mapOptions[moi]===dg_map1?' selected':'')+'>'+mapOptions[moi]+'</option>';}
// Also let user type a custom hash like 0x76af
html+='</select> ';
html+='<input type="text" id="gdoorGMap1Custom" value="" placeholder="or 0xNNNN" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:9px;width:60px"><br>';
html+='Map B:<select id="gdoorGMap2" '+pstyle.replace("58px","110px")+'>';
for(moi=0;moi<mapOptions.length;moi++){
html+='<option value="'+mapOptions[moi]+'"'+(mapOptions[moi]===dg_map2?' selected':'')+'>'+mapOptions[moi]+'</option>';}
html+='</select> ';
html+='<input type="text" id="gdoorGMap2Custom" value="" placeholder="or 0xNNNN" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:9px;width:60px"><br>';
html+='<span style="font-size:8px;color:#aa66aa">Player on negative side of axis loads Map A; positive side loads Map B.</span>';}
html+='</div>';
// === KEYCARD REQUIRED ===
html+='<div style="margin-top:4px;padding:3px;background:#0a1a2a;border-radius:2px">';
html+='<b style="color:#44ccff;font-size:9px">KEYCARD REQUIRED</b><br>';
html+='<span style="font-size:8px;color:#aaa">Vanilla pattern: trap zone calls a check proc that compares $w:pan_card.</span><br>';
var dkc=ent.doorKeycard||0;
html+='Level:<select id="gdoorKC" '+pstyle.replace("58px","90px")+' title="0 = no keycard needed (door opens for everyone)">';
for(var kc=0;kc<=7;kc++){
var lbl=kc===0?"0 — None (auto-open)":kc;
html+='<option value="'+kc+'"'+(kc===dkc?' selected':'')+'>'+lbl+'</option>';}
html+='</select><br>';
if(dkc>0){
html+='<span style="font-size:8px;color:#88aaff">Will auto-generate a keycard-check trap zone on export. The door will only open when player holds keycard level ≥ '+dkc+'.</span>';}
else if(ent.doorF){
html+='<span style="font-size:8px;color:#aa8888">Custom callback -f set: '+ent.doorF+' — keycard helper disabled. Clear it to use the helper.</span>';}
else{
html+='<span style="font-size:8px;color:#88cc88">Door will open automatically for anyone.</span>';}
html+='</div>';
// Custom callback proc (advanced, for users who want to write their own)
html+='Custom -f Proc:<input type="text" id="gdoorF" value="'+(ent.doorF||"")+'" style="background:#0a0e14;color:#aabbcc;border:1px solid #1a2535;font-size:9px;width:120px" title="Override the keycard helper with a custom callback proc name. Leave blank to use the keycard helper.">';
html+='<br><span style="font-size:8px;color:#556">Leave blank to use the Keycard Required setting above.</span>';
// === STAGE TRANSITION (if detected) ===
// If this door has an associated cross-trap that loads a target stage,
// surface the target stage + spawn coords for editing right here.
if(typeof analyzeStageTransitionForDoor==="function"){
var transInfo=analyzeStageTransitionForDoor(ent.name);
if(transInfo){
// Stash on entity so applyGCLProps can find the proc name to edit
ent._transitionInfo=transInfo;
html+='<div style="margin-top:6px;padding:4px;background:#1a0a2a;border:1px solid #4a2a6a;border-radius:2px">';
html+='<b style="color:#cc88ff;font-size:9px">STAGE TRANSITION</b><br>';
html+='<span style="font-size:8px;color:#aa88cc">Crossing this door triggers fade + load. Editing here updates the load proc <code style="color:#ddaaff">'+transInfo.loadProcName+'</code> in place.</span><br>';
// Target stage dropdown
var stages=["s00a","s01a","s02a","s02b","s02c","s02d","s02e","s03a","s03b","s03c","s03d","s03e",
"s04a","s04b","s04c","s05a","s06a","s07a","s07b","s07c","s08a","s08b","s08c","s09a","s10a",
"s11a","s11b","s11c","s11d","s11e","s11g","s11h","s11i","s12a","s12b","s12c","s13a","s14e",
"s15a","s15b","s15c","s16a","s16b","s16c","s16d","s17a","s18a","s19a","s19b","s20a"];
html+='Target:<select id="gdoorTargetStage" '+pstyle.replace("58px","100px")+'>';
for(var si=0;si<stages.length;si++){
html+='<option value="'+stages[si]+'"'+(stages[si]===transInfo.targetStage?' selected':'')+'>'+stages[si]+'</option>';}
html+='</select><br>';
// Spawn coords
html+='<span style="color:#aa88cc;font-size:9px">Snake spawn:</span><br>';
html+='X:<input type="number" id="gdoorSpawnX" value="'+transInfo.spawnX+'" '+pstyle+'> ';
html+='Y:<input type="number" id="gdoorSpawnY" value="'+transInfo.spawnY+'" '+pstyle+'> ';
html+='Z:<input type="number" id="gdoorSpawnZ" value="'+transInfo.spawnZ+'" '+pstyle+'><br>';
html+='<button onclick="applyDoorTransition('+selGCL+')" class="btn" style="margin-top:3px;background:#2a1a4a;color:#cc88ff;border:1px solid #4a2a6a;font-size:9px">Apply Transition Changes</button>';
html+='</div>';}}
html+='</div>';}
if(ent.type==="ITEM"){
html+='<br><b>Item:</b><br><select id="gitemsel" onchange="autoFillItem()" '+pstyle.replace("58px","180px")+'>';
for(var ii=0;ii<ITEM_CATALOG.length;ii++){var ic=ITEM_CATALOG[ii];
var isMatch=ent.itemIndex===ic.idx&&ent.box===ic.box;
html+='<option value="'+ii+'"'+(isMatch?' selected':'')+'>'+ic.name+' (idx:'+ic.idx+' box:'+ic.box+')</option>'}
html+='</select><br>';
html+='Box:<input type="number" id="gbox" value="'+(ent.box||0)+'" '+pstyle+'>';
html+=' Qty:<input type="number" id="gnum" value="'+(ent.num||1)+'" '+pstyle+'><br>';
html+='<span style="font-size:8px;color:#556">box0=weapon box2=ammo box4=ration box1=equip</span><br>'}
html+='<button onclick="applyGCLProps('+selGCL+')" class="btn" style="margin-top:4px">Apply</button>';
html+=' <button onclick="deleteGCLEntity('+selGCL+')" class="btn danger" style="margin-top:4px">Delete</button>';
if(typeof psxGcx!=="undefined"&&psxGcx&&gclEntities[selGCL]&&gclEntities[selGCL].psxCmd){
html+=' <button onclick="duplicateSelectedGCLEntity()" class="btn" style="margin-top:4px;color:#88ff88;border-color:#2a6a2a" title="Clone this GCX entity with a new name, placed +1000 on X. Then Save .gcx / Save STAGE.DIR.">Duplicate</button>';}
html+='<br>';
if(ent.type==="ITEM")html+='<button onclick="addGCLItem()" class="btn" style="margin-top:2px;color:#44aaff">+ New Item</button>';
// Show GCL output preview
html+='<div style="margin-top:6px;padding:4px;background:#0a0e14;border:1px solid #1a2535;border-radius:2px;font-size:9px;color:#667;max-height:80px;overflow-y:auto">';
if(ent.type==="SNAKE"){html+='chara SNAKE SNAKE \\<br>&nbsp;&nbsp;-pos '+pos.x+','+pos.y+','+pos.z;
if(ent.dir)html+=' \\<br>&nbsp;&nbsp;-dir '+ent.dir.x+','+ent.dir.y+','+ent.dir.z}
else if(ent.type==="ITEM"){var catP=ITEM_CATALOG.find(function(c){return c.idx===ent.itemIndex&&c.box===ent.box});
var isWrapped2=gclOrigText&&gclOrigText.indexOf("unknownProc10")>=0&&gclOrigText.indexOf("$f:040001")>=0;
if(isWrapped2&&ent.origName&&ent.origName.indexOf("0xnew")>=0){
html+='<span style="color:#ffaa00">WRAPPED FORMAT</span><br>';
html+='call(unknownProc10, $b:auto)<br>';
html+='if ($f:040001) {<br>';
html+='&nbsp;&nbsp;chara ITEM 0xeeba \\<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-pos '+pos.x+','+pos.y+','+pos.z+' \\<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-box '+(ent.box||0)+' \\<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-index '+(ent.itemIndex||0)+' \\<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-num '+(ent.num||1)+' \\<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-msg "'+(catP?catP.msg:(ent.msg||"ITEM"))+'"<br>';
html+='&nbsp;&nbsp;&nbsp;&nbsp;-x { eval($b:auto) }<br>';
html+='}'
}else{
html+='chara ITEM '+ent.name+' \\<br>&nbsp;&nbsp;-pos '+pos.x+','+pos.y+','+pos.z+' \\<br>&nbsp;&nbsp;-box '+(ent.box||0)+' \\<br>&nbsp;&nbsp;-index '+(ent.itemIndex||0)+' \\<br>&nbsp;&nbsp;-num '+(ent.num||1)+' \\<br>&nbsp;&nbsp;-msg "'+(catP?catP.msg:(ent.msg||"ITEM"))+'"'}}
else if(ent.type==="WATCHER"){html+='chara WATCHER '+ent.name+' \\<br>&nbsp;&nbsp;-route '+(ent.route||0);
if(ent.spawnPos)html+=' \\<br>&nbsp;&nbsp;-n '+ent.spawnPos.x+','+ent.spawnPos.y+','+ent.spawnPos.z;
if(ent.dir)html+=' \\<br>&nbsp;&nbsp;-dir '+ent.dir.x+','+ent.dir.y+','+ent.dir.z}
else if(ent.type==="CAMERA"){html+='chara CAMERA '+ent.name+' \\<br>&nbsp;&nbsp;-p '+pos.x+','+pos.y+','+pos.z;
if(ent.dir)html+=' \\<br>&nbsp;&nbsp;-d '+ent.dir.x+','+ent.dir.y+','+ent.dir.z}
else if(ent.type==="DOOR"){html+='chara DOOR '+ent.name+' \\<br>&nbsp;&nbsp;-p '+pos.x+','+pos.y+','+pos.z;
if(ent.dir)html+=' \\<br>&nbsp;&nbsp;-d '+ent.dir.x+','+ent.dir.y+','+ent.dir.z;
html+=' \\<br>&nbsp;&nbsp;-m '+(ent.model||'nst_dor')+' \\<br>&nbsp;&nbsp;-t 2 -w 1500'}
else{html+=ent.type+' '+ent.name;if(ent.pos)html+=' -pos '+pos.x+','+pos.y+','+pos.z}
html+='</div>';
// References section — shows other places in the GCL that mention this entity
if(typeof renderReferencesHTML==="function"&&ent.name){
html+=renderReferencesHTML(ent.name,"References to "+ent.name,8);}
html+='</div>';panel.innerHTML=html;panel.style.display="block"}

function applyGCLProps(idx){var ent=gclEntities[idx];
var x=parseInt(document.getElementById("gx").value)||0;
var z=parseInt(document.getElementById("gz").value)||0;
var y=parseInt(document.getElementById("gy").value)||0;
if(ent.pos){ent.pos.x=x;ent.pos.z=z;ent.pos.y=y}
else if(ent.spawnPos){ent.spawnPos.x=x;ent.spawnPos.z=z;ent.spawnPos.y=y}
else{ent.pos={x:x,y:y,z:z}}
var dirEl=document.getElementById("gdir");if(dirEl){
if(!ent.dir)ent.dir={x:0,y:0,z:0};ent.dir.y=parseInt(dirEl.value)||0}
// CAMERA: also read dir.x and dir.z
if(ent.type==="CAMERA"){
var dxEl=document.getElementById("gdirx");if(dxEl&&ent.dir)ent.dir.x=parseInt(dxEl.value)||0;
var dzEl=document.getElementById("gdirz");if(dzEl&&ent.dir)ent.dir.z=parseInt(dzEl.value)||0;
// Sight cone params
var cLenEl=document.getElementById("gcamLen");if(cLenEl)ent.camLen=parseInt(cLenEl.value)||4000;
var cWEl=document.getElementById("gcamW");if(cWEl)ent.camWidth=parseInt(cWEl.value)||256;
var cXREl=document.getElementById("gcamXR");if(cXREl)ent.camXRange=parseInt(cXREl.value)||480;}
// GUNCAME: dir + sight cone + tracking params (mirrors CAMERA but with own field IDs)
if(ent.type==="GUNCAME"){
var ggdx=document.getElementById("ggdirx");if(ggdx&&ent.dir)ent.dir.x=parseInt(ggdx.value)||0;
var ggdz=document.getElementById("ggdirz");if(ggdz&&ent.dir)ent.dir.z=parseInt(ggdz.value)||0;
var ggMo=document.getElementById("ggMode");if(ggMo)ent.gunMode=parseInt(ggMo.value)||1;
var ggLn=document.getElementById("ggLen");if(ggLn)ent.gunLen=parseInt(ggLn.value)||5000;
var ggWi=document.getElementById("ggWidth");if(ggWi)ent.gunWidth=parseInt(ggWi.value)||300;
var ggXR=document.getElementById("ggXR");if(ggXR)ent.gunXRange=parseInt(ggXR.value)||512;
var ggRt=document.getElementById("ggRot");
if(ggRt){var rp=ggRt.value.split(",");if(rp.length===3){ent.gunRotation={x:parseInt(rp[0])||0,y:parseInt(rp[1])||0,z:parseInt(rp[2])||0};}}
var ggGr=document.getElementById("ggGrp");if(ggGr)ent.gunGroup=ggGr.value.trim()||"5 2";
var ggEx=document.getElementById("ggExec");if(ggEx)ent.gunExec=ggEx.value.trim();}
// INFRARED_CENSOR: second endpoint, sweep direction/speed/behavior
if(ent.type==="INFRARED_CENSOR"){
var irEX=document.getElementById("girEndX"),irEY=document.getElementById("girEndY"),irEZ=document.getElementById("girEndZ");
if(irEX&&irEY&&irEZ){
ent.beamEnd={x:parseInt(irEX.value)||0,y:parseInt(irEY.value)||0,z:parseInt(irEZ.value)||0};}
var irMX=document.getElementById("girMvX"),irMY=document.getElementById("girMvY"),irMZ=document.getElementById("girMvZ");
if(irMX&&irMY&&irMZ){
ent.beamMove={x:parseInt(irMX.value)||0,y:parseInt(irMY.value)||0,z:parseInt(irMZ.value)||0};}
var irSp=document.getElementById("girSpeed");if(irSp)ent.beamSpeed=irSp.value.trim()||"100";
var irBh=document.getElementById("girBehav");if(irBh)ent.beamBehavior=irBh.value.trim()||"60 0";
var irCb=document.getElementById("girCb");if(irCb)ent.beamCallback=irCb.value.trim();}
// DOOR save-back: read every panel field into the entity. The export emitter
// in buildGCLText reads these fields and produces the proper -t/-w/-s/-u/-h/-v/-g/-e/-f flags.
if(ent.type==="DOOR"){
var dtE=document.getElementById("gdoorT");if(dtE)ent.doorT=parseInt(dtE.value)||1;
var dwE=document.getElementById("gdoorW");if(dwE)ent.doorW=parseInt(dwE.value)||1500;
var dsE=document.getElementById("gdoorS");if(dsE)ent.doorS=parseInt(dsE.value)||100;
var duE=document.getElementById("gdoorU");if(duE)ent.doorU=parseInt(duE.value)||0;
var dhE=document.getElementById("gdoorH");if(dhE)ent.doorH=parseInt(dhE.value)||0;
var dvE=document.getElementById("gdoorV");if(dvE)ent.doorV=parseInt(dvE.value)||2500;
var de1E=document.getElementById("gdoorE1"),de2E=document.getElementById("gdoorE2");
if(de1E&&de2E)ent.doorE={s1:parseInt(de1E.value)||0,s2:parseInt(de2E.value)||0};
// Room-loader (-g): axis + 2 maps. The map fields can either be dropdown selections
// OR a custom hash typed into the adjacent text box (overrides the dropdown).
var dgAxE=document.getElementById("gdoorGAxis");
if(dgAxE){
var axisVal=parseInt(dgAxE.value)||0;
if(axisVal>0){
var m1E=document.getElementById("gdoorGMap1");
var m1cE=document.getElementById("gdoorGMap1Custom");
var m2E=document.getElementById("gdoorGMap2");
var m2cE=document.getElementById("gdoorGMap2Custom");
var map1=(m1cE&&m1cE.value.trim())||(m1E?m1E.value:"main");
var map2=(m2cE&&m2cE.value.trim())||(m2E?m2E.value:"main");
ent.doorG={axis:axisVal,map1:map1,map2:map2};}
else{ent.doorG=null;}}
// Keycard required: 0-7. When > 0, the export emitter will generate a check trap
// + callback proc. When 0, the door auto-opens for everyone.
var dkcE=document.getElementById("gdoorKC");
if(dkcE)ent.doorKeycard=parseInt(dkcE.value)||0;
// Custom -f proc override
var dfE=document.getElementById("gdoorF");
if(dfE){var fval=dfE.value.trim();ent.doorF=fval||null;}}
var routeEl=document.getElementById("groute");if(routeEl)ent.route=parseInt(routeEl.value)||0;
// WATCHER AI parameters
if(ent.type==="WATCHER"){
var wLifeEl=document.getElementById("gwLife");if(wLifeEl)ent.life=parseInt(wLifeEl.value)||192;
var wFaintEl=document.getElementById("gwFaint");if(wFaintEl)ent.faint=parseInt(wFaintEl.value)||7;
var wSizeEl=document.getElementById("gwSize");if(wSizeEl)ent.sizeBonus=parseInt(wSizeEl.value);
var wBloodEl=document.getElementById("gwBlood");if(wBloodEl)ent.bloodType=wBloodEl.value;
var wAreaEl=document.getElementById("gwArea");if(wAreaEl)ent.areaType=wAreaEl.value;
var wYEl=document.getElementById("gwY");if(wYEl)ent.yFlag=parseInt(wYEl.value)||1;}
var modelEl=document.getElementById("gmodel");if(modelEl)ent.model=modelEl.value;
if(ent.type==="ITEM"){var sel=document.getElementById("gitemsel");if(sel){
var catIdx=parseInt(sel.value);var cat=ITEM_CATALOG[catIdx];
if(cat){ent.itemIndex=cat.idx;ent.box=cat.box;ent.msg=cat.msg;ent.num=cat.num}}
var boxEl=document.getElementById("gbox");if(boxEl)ent.box=parseInt(boxEl.value)||0;
var numEl=document.getElementById("gnum");if(numEl)ent.num=parseInt(numEl.value)||1}

// PSX/GCX path: persist pos/dir/route changes into the GCX AST so they survive
// "Save .gcx" / "Save STAGE.DIR". These are same-width value writes (no size
// change), so no offset recompute is needed. PC stages use the gclOrigText
// path elsewhere and skip this.
if(typeof psxGcx!=="undefined"&&psxGcx&&ent.psxAstRefs&&typeof gcxWriteEntitiesBack==="function"){
gcxWriteEntitiesBack([ent]);}

logUndo("edit","Edit "+ent.type);rebuildGCLVis();showGCLProps()}

function deleteGCLEntity(idx){
if(idx<0||idx>=gclEntities.length)return;
var ent=gclEntities[idx];
var name=ent.name;
// For DOOR entities we do a much more thorough cleanup since the door wizard
// generates a whole bundle of associated artifacts (procs, traps, lamps,
// HZM zones). Without this, "Delete" only removes the entity from the
// in-memory list — the GCL text on export still contains everything.
if(ent.type==="DOOR"&&typeof gclOrigText==="string"&&gclOrigText){
// Ensure transition info is populated (the props panel sets this, but the
// user might delete from the list without clicking the door first).
if(!ent._transitionInfo&&typeof analyzeStageTransitionForDoor==="function"){
ent._transitionInfo=analyzeStageTransitionForDoor(name);}
gclOrigText=_removeDoorArtifacts(gclOrigText,name,ent);
// Also remove any HZM zones in newZ that belong to this door
if(typeof newZ!=="undefined"){
for(var zi=newZ.length-1;zi>=0;zi--){
var zn=newZ[zi].name||"";
if(_isZoneForDoor(zn,name))newZ.splice(zi,1);}}
// Remove from existing HZM zones too (if the door was vanilla / already merged)
if(typeof hzm!=="undefined"&&hzm&&hzm.areas){
for(var ai=0;ai<hzm.areas.length;ai++){
var zones=hzm.areas[ai].zones||[];
for(var zj=zones.length-1;zj>=0;zj--){
if(_isZoneForDoor(zones[zj].name||"",name))zones.splice(zj,1);}}}
// Re-parse so gclEntities reflects what's actually in the text
if(typeof parseGCLScript==="function"){parseGCLScript(gclOrigText);}
selGCL=-1;
if(typeof logUndo==="function")logUndo("del","Delete door "+name+" (artifacts)");
rebuildGCLVis();showGCLProps();updateGCLPanel();
if(typeof rebuild==="function")rebuild();
if(typeof updateZoneList==="function")updateZoneList();
return;}
// Non-DOOR: remove the chara block from gclOrigText too (using origPos
// to disambiguate entities sharing a name, like multiple infrared sensors).
// Without this, mines/items/cameras/watchers deleted from the in-memory
// list re-appear on export because gclOrigText still has them.
if(typeof gclOrigText==="string"&&gclOrigText&&ent.type&&ent.type!=="SNAKE"&&ent.origName){
gclOrigText=_removeCharaBlock(gclOrigText,ent.type,ent.origName||name,ent.origPos);
if(typeof parseGCLScript==="function")parseGCLScript(gclOrigText);
selGCL=-1;
if(typeof logUndo==="function")logUndo("del","Delete "+ent.type+" "+name);
rebuildGCLVis();showGCLProps();updateGCLPanel();
if(typeof rebuild==="function")rebuild();
return;}
// Fallback: in-memory only (for entities not yet in the file)
gclEntities.splice(idx,1);
selGCL=-1;
logUndo("del","Delete entity");
rebuildGCLVis();showGCLProps();updateGCLPanel();}

// Heuristic: does this zone name belong to a door named <doorName>?
// The wizard generates zone names in three patterns:
//   Standard door:        tr_<truncname>           (single approach zone)
//   Stage-transition:     tr_<truncname>_a         (approach)
//                         tr_<truncname>_x         (cross)
// Door name is truncated to 10 chars to fit the 14-byte HZM limit.
function _isZoneForDoor(zoneName,doorName){
if(!zoneName||!doorName)return false;
var trunc=doorName.length>10?doorName.substring(0,10):doorName;
return zoneName==="tr_"+trunc||
       zoneName==="tr_"+trunc+"_a"||
       zoneName==="tr_"+trunc+"_x";}

// Strip a door's GCL artifacts from `gclText` and return the modified text.
// Strategy:
//   1. If the door lives inside a wizard-generated bundle (delimited by
//      "# ----- Door bundle generated ... # ----- End door bundle"), drop
//      the whole bundle. This is the common case for editor-added doors.
//   2. Otherwise, do surgical removal: drop the chara DOOR block, any
//      chara LAMP block paired with it, any trap/ntrap blocks referencing
//      the door's standard zone names, and any keycard-check proc or
//      stage-load proc associated with the door.
function _removeDoorArtifacts(gclText,doorName,ent){
// === Step 1: Try bundle-level removal ===
var bundleStart="# ----- Door bundle generated by Door Wizard -----";
var bundleEnd="# ----- End door bundle -----";
var searchFrom=0;
while(true){
var bs=gclText.indexOf(bundleStart,searchFrom);
if(bs<0)break;
var be=gclText.indexOf(bundleEnd,bs);
if(be<0)break;
var slice=gclText.substring(bs,be+bundleEnd.length);
// Does this bundle contain our door?
var doorPattern=new RegExp("chara\\s+DOOR\\s+"+_escapeRe(doorName)+"\\b");
if(doorPattern.test(slice)){
// Remove the bundle plus trailing newlines for cleanup
var endIdx=be+bundleEnd.length;
while(endIdx<gclText.length&&(gclText[endIdx]==="\n"||gclText[endIdx]==="\r"))endIdx++;
// Also eat the leading newlines before the bundle marker
var startIdx=bs;
while(startIdx>0&&(gclText[startIdx-1]==="\n"||gclText[startIdx-1]==="\r"))startIdx--;
gclText=gclText.substring(0,startIdx)+"\n"+gclText.substring(endIdx);
// Also strip the stage-change load proc, since wizard-generated load procs
// are injected at top-of-file outside the bundle. Find proc that does
// load "..." and where the cross trap (now deleted) referenced it.
// We rely on the entity's _transitionInfo if it was set.
if(ent&&ent._transitionInfo&&ent._transitionInfo.loadProcName){
gclText=_removeProcByName(gclText,ent._transitionInfo.loadProcName);}
return gclText;}
searchFrom=be+bundleEnd.length;}
// === Step 2: Surgical removal (no bundle found) ===
// Remove chara DOOR block
gclText=_removeCharaBlock(gclText,"DOOR",doorName);
// Remove associated trap/ntrap blocks with names matching this door's pattern
gclText=_removeTrapsForDoor(gclText,doorName);
// Remove any LAMP block that references this door via -r (rare) or sits near
// the door entity in the file. Heuristic: lamp blocks whose name is paired
// with the door's keycard check proc — we don't have an explicit link, so
// SKIP automatic lamp removal in surgical mode. User can delete the lamp
// entity separately. (Bundle path above DOES remove the lamp since it's
// inside the bundle.)
// Remove the stage-change load proc if detected
if(ent&&ent._transitionInfo&&ent._transitionInfo.loadProcName){
gclText=_removeProcByName(gclText,ent._transitionInfo.loadProcName);}
return gclText;}

function _escapeRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

// Remove a single `chara TYPE NAME ... ` block including its line continuations.
// Stops at the first line that ISN'T a continuation (i.e., doesn't end in `\`).
function _removeCharaBlock(gclText,type,name,origPos){
// Find ALL chara TYPE NAME blocks. Each chara block can span many lines via
// `\` continuations. We need to identify the right one — entities can share
// names (e.g. infrared sensors), so we disambiguate by origPos when given.
var allMatches=[];
var re=new RegExp("(^|\\n)(\\s*)chara\\s+"+_escapeRe(type)+"\\s+"+_escapeRe(name)+"\\b","g");
var m;
while((m=re.exec(gclText))!==null){
var startOfLine=m.index+(m[1]?1:0);
// Walk forward line by line; stop when a line doesn't end with `\`
var p=startOfLine;
while(p<gclText.length){
var nl=gclText.indexOf("\n",p);
if(nl<0){p=gclText.length;break;}
var line=gclText.substring(p,nl);
var stripped=line.replace(/\r$/,"");
if(!stripped.match(/\\\s*$/)){
p=nl+1;
break;}
p=nl+1;}
allMatches.push({start:startOfLine,end:p,body:gclText.substring(startOfLine,p)});}
if(allMatches.length===0)return gclText;
// Pick which block to remove
var target=allMatches[0];
if(origPos&&allMatches.length>1){
// Match by -pos or -p coordinates
var posStr=origPos.x+","+origPos.y+","+origPos.z;
var posRe=new RegExp("(?:-pos|-p|-n)\\s+(?:-?\\d+,-?\\d+,-?\\d+\\s+)?"+_escapeRe(posStr));
for(var i=0;i<allMatches.length;i++){
if(posRe.test(allMatches[i].body)){target=allMatches[i];break;}}}
return gclText.substring(0,target.start)+gclText.substring(target.end);}

// Remove all trap/ntrap blocks whose zone name matches the door's pattern
// (tr_<truncname>_a, tr_<truncname>_x). Uses brace-counting for ntrap bodies.
function _removeTrapsForDoor(gclText,doorName){
var trunc=doorName.length>10?doorName.substring(0,10):doorName;
// Include standard-door pattern (tr_<name>) alongside transition patterns
var zoneNames=["tr_"+trunc,"tr_"+trunc+"_a","tr_"+trunc+"_x"];
// Build a regex that finds either trap or ntrap header for these zone names
var pattern=new RegExp("(?:^|\\n)\\s*(?:n)?trap\\s+("+zoneNames.map(_escapeRe).join("|")+")\\b","g");
var ranges=[];
var m;
while((m=pattern.exec(gclText))!==null){
// Find the body opening brace
var bs=gclText.indexOf("{",m.index);
if(bs<0)continue;
// Safety: bail if a new statement appears before {
var preBrace=gclText.substring(m.index+m[0].length,bs);
if(/\n\s*(?:chara|proc|map\s|hzd|ntrap|trap)\b/.test(preBrace))continue;
// Brace-count to find matching }
var depth=1,p=bs+1;
while(p<gclText.length&&depth>0){
var c=gclText.charCodeAt(p);
if(c===123)depth++;else if(c===125)depth--;
p++;}
if(depth===0){
ranges.push({start:m.index+(gclText[m.index]==="\n"?1:0),end:p});}}
// Apply removals in reverse order so earlier indices stay valid
ranges.sort(function(a,b){return b.start-a.start;});
for(var ri=0;ri<ranges.length;ri++){
var r=ranges[ri];
// Eat trailing newlines so we don't leave a blank line behind
var endIdx=r.end;
while(endIdx<gclText.length&&(gclText[endIdx]==="\n"||gclText[endIdx]==="\r"))endIdx++;
gclText=gclText.substring(0,r.start)+gclText.substring(endIdx);}
return gclText;}

// Remove a proc by name, including its full body (brace-counted).
function _removeProcByName(gclText,procName){
var re=new RegExp("(^|\\n)\\s*proc\\s+"+_escapeRe(procName)+"\\s*\\{","");
var m=gclText.match(re);
if(!m)return gclText;
var startOfLine=m.index+(m[1]?1:0);
// Find opening brace and count
var bs=gclText.indexOf("{",m.index);
if(bs<0)return gclText;
var depth=1,p=bs+1;
while(p<gclText.length&&depth>0){
var c=gclText.charCodeAt(p);
if(c===123)depth++;else if(c===125)depth--;
p++;}
if(depth!==0)return gclText;// unclosed, give up
// Eat trailing newlines
while(p<gclText.length&&(gclText[p]==="\n"||gclText[p]==="\r"))p++;
return gclText.substring(0,startOfLine)+gclText.substring(p);}

function autoFillItem(){var sel=document.getElementById("gitemsel");if(!sel)return;
var cat=ITEM_CATALOG[parseInt(sel.value)];if(!cat)return;
var boxEl=document.getElementById("gbox");if(boxEl)boxEl.value=cat.box;
var numEl=document.getElementById("gnum");if(numEl)numEl.value=cat.num}

function startChangeSpawn(idx){spawnPendingIdx=idx;showGCLProps();
document.getElementById("coordinfo").textContent="SPAWN: move the guard to the desired spawn location, then click 'Set New Spawn Position'";}
function confirmChangeSpawn(idx){var ent=gclEntities[idx];if(!ent||!ent.spawnPos)return;
var p=ent.pos||ent.spawnPos;
ent.spawnPos.x=p.x;ent.spawnPos.y=p.y;ent.spawnPos.z=p.z;
spawnPendingIdx=-1;
logUndo("edit","Set spawn "+ent.name);rebuildGCLVis();showGCLProps();
document.getElementById("coordinfo").textContent="Spawn set to ("+p.x+","+p.y+","+p.z+")";}
function addGCLItem(){var pos=cTgt?{x:Math.round(cTgt.x/S),y:0,z:Math.round(cTgt.z/S)}:{x:0,y:0,z:0};
gclEntities.push({type:"ITEM",name:"0xnew",origName:"0xnew",pos:pos,itemIndex:13,num:1,msg:"RATION",box:4,height:500});
selGCL=gclEntities.length-1;logUndo("add","Add ITEM");rebuildGCLVis();showGCLProps();updateGCLPanel()}
// Find the next sequential slot name for entities that use indexed naming.
// CAMERA→camera0, camera1...   WATCHER→enemy0...   SEARCH_LIGHT→searchli0...
// Required because COMMAND -camera/-nWatcher/-searchli proc lists index by position,
// and the in-game radar only displays entities matching the expected slot naming convention.
function nextSlotName(prefix){
var existing=[];
for(var i=0;i<gclEntities.length;i++){
var nm=gclEntities[i].name||"";
var m=nm.match(new RegExp("^"+prefix+"(\\d+)$"));
if(m)existing.push(parseInt(m[1]));}
existing.sort(function(a,b){return a-b});
// Find first gap, else use max+1
var next=0;
for(var j=0;j<existing.length;j++){
if(existing[j]===next)next++;
else if(existing[j]>next)break;}
return prefix+next;}

// Find first route with at least 1 waypoint (route 0 is often empty in vanilla,
// using it would cause the engine to dereference null waypoint data and crash on stage load).
function firstValidRoute(){
if(!hzm||!hzm.routes)return 0;
for(var ri=0;ri<hzm.routes.length;ri++){
if(hzm.routes[ri]&&hzm.routes[ri].waypoints&&hzm.routes[ri].waypoints.length>0)return ri;}
return 0;}

function addGCLWatcher(){var pos=cTgt?{x:Math.round(cTgt.x/S),y:0,z:Math.round(cTgt.z/S)}:{x:0,y:0,z:0};
var defaultRoute=firstValidRoute();
// PSX/GCX path: a new enemy must be inserted into the GCX AST (the PC-style
// gclEntities push below does not persist on PSX). Clone an existing WATCHER as
// a template — guaranteeing a valid command/option layout — then set its route
// and position. The grown GCX is carried out by Save .gcx / Save STAGE.DIR.
if(typeof psxGcx!=="undefined"&&psxGcx){
if(typeof gcxFindCharasWithContainer!=="function"||typeof gcxCloneEntity!=="function"){alert("Structural-edit functions unavailable in this build.");return;}
// Prefer the SELECTED entity as the template if it's a cloneable WATCHER, else
// use the first WATCHER in the stage. Cloning a real, in-context enemy is what
// makes the new one actually spawn — the clone is spliced into the same spawn
// proc as the template, so it inherits that proc's COMMAND registration.
var tmplEnt=null;
if(selGCL>=0&&gclEntities[selGCL]&&gclEntities[selGCL].type==="WATCHER"&&gclEntities[selGCL].psxCmd)tmplEnt=gclEntities[selGCL];
if(!tmplEnt){for(var i=0;i<gclEntities.length;i++){if(gclEntities[i].type==="WATCHER"&&gclEntities[i].psxCmd){tmplEnt=gclEntities[i];break;}}}
if(!tmplEnt){alert("Add Enemy (PSX) clones an existing WATCHER as a template, but this stage has none loaded. Load a stage that already has a WATCHER, or use Duplicate on a similar entity.");return;}
var hits=gcxFindCharasWithContainer(psxGcx),hit=null;
for(var i=0;i<hits.length;i++){if(hits[i].cmd===tmplEnt.psxCmd){hit=hits[i];break;}}
if(!hit){alert("Couldn't locate the template WATCHER in the GCX script.");return;}
var used={};for(var i=0;i<gclEntities.length;i++){if(gclEntities[i].psxNameHash!=null)used[gclEntities[i].psxNameHash]=1;}
var nn=((tmplEnt.psxNameHash||0)+1)&0xFFFF,guard=0;while(used[nn]&&guard++<0x10000)nn=(nn+1)&0xFFFF;
gcxCloneEntity(psxGcx,hit,{nameHash:nn});
if(typeof gcxBuildEntities==="function")gclEntities=gcxBuildEntities(psxGcx);
var ni=-1;for(var i=gclEntities.length-1;i>=0;i--){if(gclEntities[i].psxNameHash===nn){ni=i;break;}}
if(ni>=0){selGCL=ni;selGCLSpawn=false;var e2=gclEntities[ni];
// EXACTLY mirror the proven Duplicate recipe: keep the template's valid position
// and route (so the new enemy is guaranteed to spawn just like a duplicate),
// only nudging +1000 X so it's visibly distinct. Do NOT force a camera-derived
// position with Y=0 (drops the guard out of the playable volume) and do NOT
// change the route here. Reposition / re-route afterwards via the properties
// panel + Apply — those now persist to the GCX on PSX, and isolating them lets
// you verify spawn first, route change second.
if(e2.pos){e2.pos.x=(e2.pos.x||0)+1000;if(typeof gcxWriteEntitiesBack==="function")gcxWriteEntitiesBack([e2]);}}
logUndo("add","Add WATCHER (PSX) 0x"+nn.toString(16));rebuildGCLVis();showGCLProps();updateGCLPanel();
var _ci=document.getElementById("coordinfo");if(_ci)_ci.textContent="Added enemy 0x"+nn.toString(16)+" as a copy of "+tmplEnt.name+" (+1000 X, same route). It should spawn like the original. Drag it or change its Route in properties + Apply, then Save STAGE.DIR.";
return;}
var newName=nextSlotName("enemy");
// AI defaults matched to working in-game guards (e.g. enemy0 in s02a)
gclEntities.push({type:"WATCHER",name:newName,origName:newName,
pos:pos,spawnPos:{x:pos.x,y:pos.y,z:pos.z},
route:defaultRoute,dir:{x:0,y:0,z:0},
life:192,faint:7,sizeBonus:227,bloodType:"X",areaType:"A",yFlag:1,
isNew:true});
selGCL=gclEntities.length-1;logUndo("add","Add WATCHER "+newName);rebuildGCLVis();showGCLProps();updateGCLPanel();
document.getElementById("coordinfo").textContent="Added WATCHER "+newName+" with default route "+defaultRoute+". IMPORTANT: pick a route that has waypoints, else stage will CRASH on load.";}

function addGCLCamera(){var pos=cTgt?{x:Math.round(cTgt.x/S),y:1500,z:Math.round(cTgt.z/S)}:{x:0,y:1500,z:0};
var newName=nextSlotName("camera");
// Required CAMERA params with sensible defaults (matches working in-game cameras):
// -len 4000 -width 256 -xRange 480 -pos X,Y,Z -dir X,Y,Z -exec PROC
gclEntities.push({type:"CAMERA",name:newName,origName:newName,pos:pos,dir:{x:256,y:512,z:0},
camLen:4000,camWidth:256,camXRange:480,isNew:true});
selGCL=gclEntities.length-1;logUndo("add","Add CAMERA "+newName);rebuildGCLVis();showGCLProps();updateGCLPanel();
document.getElementById("coordinfo").textContent="Added CAMERA "+newName+" — remember to add a death proc to COMMAND -camera list";}

function addGCLDoor(){var pos=cTgt?{x:Math.round(cTgt.x/S),y:0,z:Math.round(cTgt.z/S)}:{x:0,y:0,z:0};
var mdlNames=Object.keys(mdlSubModels).filter(function(n){return n.match(/_d\d|nst_dor/)});
gclEntities.push({type:"DOOR",name:"0xnew_d",origName:"0xnew_d",pos:pos,dir:{x:0,y:0,z:0},model:mdlNames.length>0?mdlNames[0].replace(".kmd",""):"nst_dor",isNew:true});
selGCL=gclEntities.length-1;logUndo("add","Add DOOR");rebuildGCLVis();showGCLProps();updateGCLPanel()}

// Duplicate the selected GCX (PSX) entity by cloning its chara COMMAND in the
// AST (guaranteed-valid option schema), giving it an unused name hash, and
// offsetting it +1000 on X so it's visibly distinct. Refreshes the entity model
// from the AST. The grown GCX is carried out by "Save .gcx" / "Save STAGE.DIR".
function duplicateSelectedGCLEntity(){
if(typeof psxGcx==="undefined"||!psxGcx){alert("Duplicate works on GCX-loaded (PSX) stages. For PC stages use the Add buttons.");return;}
if(selGCL<0||!gclEntities[selGCL]){alert("Select an entity first.");return;}
var ent=gclEntities[selGCL];
if(!ent.psxCmd){alert("This entity isn't a GCX chara entity, so it can't be cloned this way.");return;}
if(typeof gcxFindCharasWithContainer!=="function"||typeof gcxCloneEntity!=="function"){alert("Structural-edit functions unavailable in this build.");return;}
var hits=gcxFindCharasWithContainer(psxGcx),hit=null;
for(var i=0;i<hits.length;i++){if(hits[i].cmd===ent.psxCmd){hit=hits[i];break;}}
if(!hit){alert("Couldn't locate this entity in the GCX script.");return;}
// pick a name hash not already in use
var used={};for(var i=0;i<gclEntities.length;i++){if(gclEntities[i].psxNameHash!=null)used[gclEntities[i].psxNameHash]=1;}
var nn=((ent.psxNameHash||0)+1)&0xFFFF,guard=0;while(used[nn]&&guard++<0x10000)nn=(nn+1)&0xFFFF;
gcxCloneEntity(psxGcx,hit,{nameHash:nn});
// refresh entity model from the mutated AST
if(typeof gcxBuildEntities==="function")gclEntities=gcxBuildEntities(psxGcx);
// select the new clone and offset it so it doesn't sit on top of the template
var ni=-1;for(var i=gclEntities.length-1;i>=0;i--){if(gclEntities[i].psxNameHash===nn){ni=i;break;}}
if(ni>=0){selGCL=ni;selGCLSpawn=false;var e2=gclEntities[ni];
if(e2.pos){e2.pos.x=(e2.pos.x||0)+1000;if(typeof gcxWriteEntitiesBack==="function")gcxWriteEntitiesBack([e2]);}}
if(typeof logUndo==="function")logUndo("add","Duplicate "+ent.type);
if(typeof rebuildGCLVis==="function")rebuildGCLVis();
if(typeof updateGCLPanel==="function")updateGCLPanel();
if(typeof showGCLProps==="function")showGCLProps();
if(typeof document!=="undefined"){var ci=document.getElementById("coordinfo");if(ci)ci.textContent="Duplicated "+ent.type+" as 0x"+nn.toString(16)+" (+1000 X). Save .gcx or Save STAGE.DIR to keep it.";}}

// Generic add from catalog — handles types we don't have dedicated buttons for
function addGCLEntityFromCatalog(entType){
if(!entType||!ENTITY_CATALOG[entType])return;
var pos=cTgt?{x:Math.round(cTgt.x/S),y:0,z:Math.round(cTgt.z/S)}:{x:0,y:0,z:0};
// Some types need a non-zero starting Y
if(["CAMERA","CAMERA2","SEARCH_LIGHT","GUNCAME","LAMP"].indexOf(entType)>=0)pos.y=1500;
// Use sequential slot naming for entities that REQUIRE it (radar/COMMAND linkage)
var name;
if(entType==="CAMERA"||entType==="CAMERA2")name=nextSlotName("camera");
else if(entType==="GUNCAME")name=nextSlotName("camera");// shares camera slot namespace
else if(entType==="WATCHER")name=nextSlotName("enemy");
else if(entType==="SEARCH_LIGHT")name=nextSlotName("searchli");
else name="0xnew_"+entType.toLowerCase().substring(0,3);
var ent={type:entType,name:name,origName:name,pos:pos,dir:{x:0,y:0,z:0},isNew:true};
// Type-specific defaults that match working in-game entities
if(entType==="CAMERA"||entType==="CAMERA2"){ent.dir={x:256,y:512,z:0};ent.camLen=4000;ent.camWidth=256;ent.camXRange=480}
if(entType==="DOG"||entType==="WOLF2"||entType==="MOUSE")ent.route=0;
if(entType==="WATCHER"){ent.route=0;ent.spawnPos={x:pos.x,y:pos.y,z:pos.z};
ent.life=128;ent.faint=7;ent.sizeBonus=227;ent.bloodType="X";ent.areaType="A";ent.yFlag=1;}
if(entType==="ITEM"){ent.itemIndex=13;ent.box=4;ent.msg="RATION";ent.num=1}
// Defaults for the entity types whose dedicated emitters we're adding now.
// Each field name matches a slot the emitter in 01_gcl.js will read.
if(entType==="LAND_MINE"){
ent.dir={x:0,y:1024,z:0};
ent.explodeCallback="";}
if(entType==="GUNCAME"){
ent.dir={x:0,y:0,z:0};
ent.gunMode=1;
ent.gunLen=5000;
ent.gunWidth=300;
ent.gunXRange=512;
ent.gunRotation={x:512,y:0,z:0};
ent.gunGroup="5 2";
ent.gunExec="";}
if(entType==="INFRARED_CENSOR"){
// Two endpoints — the second one is offset from the first by default
ent.beamEnd={x:pos.x+6000,y:pos.y,z:pos.z};
ent.beamMove={x:0,y:4000,z:0};// vertical sweep
ent.beamSpeed="100";// literal int (was $w:00043c in vanilla, but a literal works fine)
ent.beamBehavior="60 0";// observed default in all vanilla instances
ent.beamCallback="";}
if(entType==="SEARCH_LIGHT"){
ent.dir={x:306,y:3010,z:0};
ent.lightIndex=1;
ent.lightHeight=1100;
ent.lightWidth=1700;
ent.lightXRange=250;
ent.lightAngle=185;
ent.lightPattern="306 306 175 3";}
if(entType==="LIFE_UP"){
ent.lifeM=320;
ent.lifeCallback="";
ent.lifeC=8;
ent.lifeVar="$w:00041a";}
if(entType==="LAMP"){
ent.dir={x:0,y:2048,z:0};
ent.lampScale={x:250,y:137,z:250};
ent.lampModelHash="0xe29d";}
if(entType==="OBSTACLE"){
ent.model="01a_o00";}
if(entType==="PUT_OBJECT"){
ent.model="";
ent.putSet=pos.x+",0,"+pos.z+"  0,0,0";}// single placement by default
gclEntities.push(ent);
selGCL=gclEntities.length-1;logUndo("add","Add "+entType+" "+name);
rebuildGCLVis();showGCLProps();updateGCLPanel();
var cat=ENTITY_CATALOG[entType];
document.getElementById("coordinfo").textContent="Added "+cat.label+" ("+name+") — edit properties on the right";}

function handleGCLFile(f){if(!f)return;var r=new FileReader();
r.onload=function(e){var text=e.target.result;gclOrigText=text;parseGCLScript(text);parseHzdDeclarations(text);rebuildGCLVis();rebuildCamAngles();parseProcList(text);updateGCLPanel();updateProcPanel();rebuildSubModels();};r.readAsText(f)}

// Parse "hzd <name> -kmd a b c -hzm <stage> <area> ..." declarations from GCL
// Builds gclHzdZones map: { zoneName: {kmds:[...], hzmArea:N, zone:N} }
function parseHzdDeclarations(text){
gclHzdZones={};
// Normalize line endings
var t=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
// Match: hzd <name> <body> where body extends across backslash-continued lines.
// Continuation lines end with "\" then newline. A line WITHOUT trailing backslash ends the command.
// Pattern: capture name, then everything across "<stuff>\\\n" repetitions, then one final non-backslash line.
var re=/^hzd\s+(\S+)\s+((?:[^\n]*\\\s*\n[ \t]*)*[^\n]*)/gm;
var m;
while((m=re.exec(t))!==null){
var zname=m[1];
// Clean: remove backslash-newlines, normalize whitespace
var body=m[2].replace(/\\\s*\n/g," ").replace(/\s+/g," ").trim();
var entry={kmds:[],hzmArea:0,zone:0};
var km=body.match(/-kmd\s+([^\-]+?)(?:\s+-|\s*$)/);
if(km)entry.kmds=km[1].trim().split(/\s+/);
var hm=body.match(/-hzm\s+\S+\s+(\d+)/);
if(hm)entry.hzmArea=parseInt(hm[1]);
var zm=body.match(/-zone\s+(\d+)/);
if(zm)entry.zone=parseInt(zm[1]);
gclHzdZones[zname]=entry;}
console.log("Parsed HZD zones:",gclHzdZones);
// If MDL DAR is already loaded, retroactively load any side-room KMDs referenced by hzds
if(mdlDarFiles&&mdlDarFiles.length>0&&kmdBufs.length>0){
autoLoadHzdKmds();}}

// Auto-load all KMDs referenced by GCL hzd declarations into the editor.
// Called both from MDL DAR load (if GCL already loaded) and from GCL load (if DAR already loaded).
function autoLoadHzdKmds(){
if(!mdlDarFiles||mdlDarFiles.length===0)return;
if(!gclHzdZones||Object.keys(gclHzdZones).length===0)return;
var loadedNames={};
for(var li=0;li<kmdFileNames.length;li++)loadedNames[kmdFileNames[li]]=true;
var hzdKmds={};
for(var zn in gclHzdZones){
var zlist=gclHzdZones[zn].kmds;
for(var zi=0;zi<zlist.length;zi++)hzdKmds[zlist[zi]+".kmd"]=true;}
var addedCount=0;
for(var hkm in hzdKmds){
if(loadedNames[hkm])continue;
for(var dj=0;dj<mdlDarFiles.length;dj++){
if(mdlDarFiles[dj].name===hkm){
var ab=mdlDarFiles[dj].data.buffer.slice(mdlDarFiles[dj].data.byteOffset,mdlDarFiles[dj].data.byteOffset+mdlDarFiles[dj].data.byteLength);
kmdBufs.push(ab);kmdFileNames.push(hkm);kmdVisible.push(true);loadedNames[hkm]=true;addedCount++;
break;}}}
if(addedCount>0){
rebuildKMD();updateKMDList();
var info=document.getElementById("kmd-info");
if(info)info.textContent="KMD: "+kmdFileNames.length+" files (+"+addedCount+" auto-loaded from GCL hzd)";
console.log("Auto-loaded "+addedCount+" KMDs from GCL hzd declarations");}}
function toggleGCLVis(){showGclVis=!showGclVis;if(showGclVis)rebuildGCLVis();else{for(var i=0;i<gclObjs2.length;i++)sc3.remove(gclObjs2[i]);gclObjs2=[]}
var _gv=document.getElementById("btnGCLVis");if(_gv)_gv.classList.toggle("active",showGclVis);}
function clearGCLVis(){
// ClrGCL is destructive — it unbinds the entire GCL script from the stage,
// which means every change made through the editor's GCL flow (new doors,
// elevators, entity edits, stage-transition tweaks) will need to be redone.
// Make the user confirm explicitly.
var msg="⚠ Unbind GCL script from stage?\n\n"+
"This will REMOVE all loaded GCL data from the editor:\n"+
"  • All entities (enemies, cameras, items, doors)\n"+
"  • All procs (logic, stage transitions, elevators)\n"+
"  • All trap zones referenced by GCL\n"+
"  • Any unsaved edits to the GCL script\n\n"+
"The HZM (collision/nav data) and your imported textures/models will stay.\n\n"+
"You'll need to re-import the GCL via Import → +GCL to get it back.\n\n"+
"Continue?";
if(!confirm(msg))return;
clearGCLVisForce();}

function clearGCLVisForce(){
gclEntities=[];selGCL=-1;gclOrigText="";gclProcs=[];trapZones=[];camAngles=[];camHandleObjs=[];camHandleDrag=null;selCamAngle=-1;
for(var i=0;i<gclObjs2.length;i++)sc3.remove(gclObjs2[i]);gclObjs2=[];
updateGCLPanel();updateProcPanel();
document.getElementById("propPanel").style.display="none";}

// ==================== MULTI-HZM MERGE ====================
function mergeHZM(buf2){
if(!hzm){alert("Load a base HZM first.");return}
var h2;try{h2=parseHZM(buf2)}catch(e){alert("Failed to parse HZM: "+e.message);return}
// If the current base is an empty/new stage (0 areas), a merge would drop all
// geometry (the per-area loop is bounded by min(base,incoming) area count).
// Treat it as a full load instead so importing a real HZM after a blank open works.
if(!hzm.areas||hzm.areas.length===0){
hzm=h2;
selW={};colW={};newW=[];selF={};colF={};newF=[];selZ={};colZ={};newZ=[];
newNavZones=[];undoHist=[];undoSnapshots=[];undoPtr=-1;clipboard=[];
selRoute=-1;selWP=-1;selNavZone=-1;selGCL=-1;showFl=true;
if(typeof rebuild==="function")rebuild();
if(typeof rebuildNavZones==="function")rebuildNavZones();
if(typeof takeSnapshot==="function")takeSnapshot("Loaded "+(hzmFN||"HZM"));
return;}
var addW=0,addF=0,addZ=0,addRt=0,addNZ=0;
// Merge areas: append walls/floors/zones from h2 into matching areas of hzm
for(var ai=0;ai<Math.min(hzm.areas.length,h2.areas.length);ai++){
var a1=hzm.areas[ai],a2=h2.areas[ai];
for(var ni=0;ni<a2.navfaces.length;ni++){
var nf=a2.navfaces[ni];
a1.navfaces.push({idx:a1.navfaces.length,ai:ai,off:0,
x1:nf.x1,z1:nf.z1,y1:nf.y1,h1:nf.h1,x2:nf.x2,z2:nf.z2,y2:nf.y2,h2:nf.h2,
texHash:nf.texHash||(-1),uvMode:nf.uvMode||"fit"});
a1.wFlags.push(a2.wFlags[ni]||0);a1.wLayers.push(a2.wLayers[ni]||0);
a1.nc++;addW++}
for(var fi=0;fi<a2.floors.length;fi++){
var fl=a2.floors[fi];
a1.floors.push({idx:a1.floors.length,ai:ai,off:0,quads:fl.quads,
texHash:fl.texHash||(-1),uvMode:fl.uvMode||"fit"});
a1.fc++;addF++}
for(var zi=0;zi<a2.zones.length;zi++){
var zn=a2.zones[zi];
a1.zones.push({idx:a1.zones.length,ai:ai,off:0,
x1:zn.x1,z1:zn.z1,y1:zn.y1,h1:zn.h1,x2:zn.x2,z2:zn.z2,y2:zn.y2,h2:zn.h2,
name:zn.name,nameRaw:zn.nameRaw,id1:zn.id1,id2:zn.id2});
a1.zc++;addZ++}}
// Merge routes: append non-empty routes, remapping into first free slots
for(var ri=0;ri<h2.routes.length;ri++){
if(h2.routes[ri].waypoints.length===0)continue;
// Find first empty route slot in hzm
var placed=false;
for(var rj=0;rj<32;rj++){
if(hzm.routes[rj].waypoints.length===0){
hzm.routes[rj]={idx:rj,count:h2.routes[ri].waypoints.length,waypoints:h2.routes[ri].waypoints.slice()};
placed=true;addRt++;break}}
if(!placed)console.warn("mergeHZM: no empty route slots for route "+ri)}
// Merge navZones
for(var nzi=0;nzi<h2.navZones.length;nzi++){
hzm.navZones.push(JSON.parse(JSON.stringify(h2.navZones[nzi])));
hzm.nzCount=(hzm.nzCount||0)+1;addNZ++}
logUndo("add","Merge HZM (+"+addW+"w +"+addF+"f +"+addZ+"z +"+addRt+"rt +"+addNZ+"nz)");
rebuild();rebuildNavZones();rebuildGCLVis();
document.getElementById("coordinfo").textContent=
"Merged HZM: +"+addW+" walls, +"+addF+" floors, +"+addZ+" zones, +"+addRt+" routes, +"+addNZ+" navzones"}

// Build the full modified GCL text in memory. Returns {text, errors}.
// Used by both exportGCL (download) and viewGCL (popup viewer) so they share the same pipeline.
// If errors is non-empty, text is still produced (so the viewer can show what would have been
// exported even when validation fails — useful for debugging).
function buildGCLText(){
if(gclEntities.length===0)return{text:"",errors:["No GCL loaded"]};
// PRE-EXPORT VALIDATION: known crash conditions get flagged here.
var validationErrors=[];
for(var vi=0;vi<gclEntities.length;vi++){
var vent=gclEntities[vi];if(!vent.isNew)continue;
if(vent.type==="WATCHER"){
var vr=vent.route;
if(!hzm||!hzm.routes||!hzm.routes[vr]||!hzm.routes[vr].waypoints||hzm.routes[vr].waypoints.length===0){
validationErrors.push("WATCHER "+vent.name+" uses route "+vr+" which has 0 waypoints — stage will crash on load.");}}}
// Note: validationErrors are returned at the end so callers can decide what to do.
// Detect original line-ending style — many GCL→GCX converters REQUIRE CRLF and will
// silently produce broken GCX (causing instant stage-load crash) if the file is LF-only.
var origIsCRLF=(gclOrigText||"").indexOf("\r\n")>=0;
var out=(gclOrigText||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
// Apply position modifications to original text
for(var i=0;i<gclEntities.length;i++){var ent=gclEntities[i];
if(!ent.pos&&!ent.spawnPos)continue;
var pos=ent.pos||ent.spawnPos;
// SNAKE position replacement
if(ent.type==="SNAKE"&&ent.name==="SNAKE"){
out=out.replace(/(chara\s+SNAKE\s+SNAKE\s*\\\s*\n\s*-pos\s+)-?\d+,-?\d+,-?\d+/,
"$1"+pos.x+","+pos.y+","+pos.z);
if(ent.dir){out=out.replace(/(chara\s+SNAKE\s+SNAKE[\s\S]*?-dir\s+)-?\d+,-?\d+,-?\d+/,
"$1"+ent.dir.x+","+ent.dir.y+","+ent.dir.z)}}
// CAMERA: patch -p position and -d direction in existing GCL text
if(ent.type==="CAMERA"&&ent.origName&&ent.origName.indexOf("0xnew")<0){
var camNameEsc=ent.origName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
// patch -p x,y,z (uses origPos to locate, replaces with new pos)
if(ent.origPos){
var camPosEsc=(ent.origPos.x+","+ent.origPos.y+","+ent.origPos.z).replace(/-/g,"\\-");
var camPRe=new RegExp("(chara\\s+CAMERA\\s+"+camNameEsc+"[\\s\\S]*?-p\\s+)"+camPosEsc);
out=out.replace(camPRe,"$1"+pos.x+","+pos.y+","+pos.z)}
// patch -d dx,dy,dz (uses origDir to locate)
if(ent.dir&&ent.origDir){
var camDirEsc=(ent.origDir.x+","+ent.origDir.y+","+ent.origDir.z).replace(/-/g,"\\-");
var camDRe=new RegExp("(chara\\s+CAMERA\\s+"+camNameEsc+"[\\s\\S]*?-d\\s+)"+camDirEsc);
out=out.replace(camDRe,"$1"+ent.dir.x+","+ent.dir.y+","+ent.dir.z);
// update origDir to the new value so re-exports chain correctly
ent.origDir={x:ent.dir.x,y:ent.dir.y,z:ent.dir.z}}
// update origPos for chained re-export
if(ent.origPos){ent.origPos={x:pos.x,y:pos.y,z:pos.z}}}
// WATCHER: patch spawnPos (-n) and dir
if(ent.type==="WATCHER"&&ent.origName&&ent.origName.indexOf("0xnew")<0){
var wtNameEsc=ent.origName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
if(ent.origPos){
var wtPosEsc=(ent.origPos.x+","+ent.origPos.y+","+ent.origPos.z).replace(/-/g,"\\-");
// WATCHER pos can be -pos or -n
var wtPosRe=new RegExp("(chara\\s+WATCHER\\s+"+wtNameEsc+"[\\s\\S]*?(?:-pos|-n)\\s+)"+wtPosEsc);
out=out.replace(wtPosRe,"$1"+pos.x+","+pos.y+","+pos.z);
ent.origPos={x:pos.x,y:pos.y,z:pos.z}}
if(ent.dir&&ent.origDir){
var wtDirEsc=(ent.origDir.x+","+ent.origDir.y+","+ent.origDir.z).replace(/-/g,"\\-");
var wtDirRe=new RegExp("(chara\\s+WATCHER\\s+"+wtNameEsc+"[\\s\\S]*?-dir\\s+)"+wtDirEsc);
out=out.replace(wtDirRe,"$1"+ent.dir.x+","+ent.dir.y+","+ent.dir.z);
ent.origDir={x:ent.dir.x,y:ent.dir.y,z:ent.dir.z}}}
// DOOR: patch -p position and -d direction in existing GCL text.
//
// Without this handler, moving a door in the editor (via the properties panel
// or 3D drag) updates ent.pos in memory but the exported GCL still has the old
// coords — the round-trip silently loses your changes.
//
// Same pattern as CAMERA: locate by origName, anchor on origPos to disambiguate
// from other instances. Uses -p with COMMA-separated (not space-separated) coords
// because that's what the door wizard emits and what vanilla 02a/14e use.
if(ent.type==="DOOR"&&ent.origName&&ent.origName.indexOf("0xnew")<0){
var drNameEsc=ent.origName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
if(ent.origPos){
var drPosEsc=(ent.origPos.x+","+ent.origPos.y+","+ent.origPos.z).replace(/-/g,"\\-");
var drPRe=new RegExp("(chara\\s+DOOR\\s+"+drNameEsc+"[\\s\\S]*?-p\\s+)"+drPosEsc);
out=out.replace(drPRe,"$1"+pos.x+","+pos.y+","+pos.z);
ent.origPos={x:pos.x,y:pos.y,z:pos.z};}
if(ent.dir&&ent.origDir){
var drDirEsc=(ent.origDir.x+","+ent.origDir.y+","+ent.origDir.z).replace(/-/g,"\\-");
var drDRe=new RegExp("(chara\\s+DOOR\\s+"+drNameEsc+"[\\s\\S]*?-d\\s+)"+drDirEsc);
out=out.replace(drDRe,"$1"+ent.dir.x+","+ent.dir.y+","+ent.dir.z);
ent.origDir={x:ent.dir.x,y:ent.dir.y,z:ent.dir.z};}}
// ITEM: find by name AND original position, replace pos+index+num+msg
if(ent.type==="ITEM"&&ent.origPos&&ent.origName&&ent.origName.indexOf("0xnew")<0){
var op=ent.origPos;
var nameEsc=ent.origName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
var posEsc=(op.x+","+op.y+","+op.z).replace(/-/g,"\\-");
// Replace -pos
var posRe=new RegExp("(chara\\s+ITEM\\s+"+nameEsc+"\\s*\\\\[\\s\\S]*?-pos\\s+)"+posEsc);
out=out.replace(posRe,"$1"+pos.x+","+pos.y+","+pos.z);
// Now match the NEW position to find the block and replace -index, -num, -msg
var newPosEsc=(pos.x+","+pos.y+","+pos.z).replace(/-/g,"\\-");
var idxRe=new RegExp("(chara\\s+ITEM\\s+"+nameEsc+"\\s*\\\\[\\s\\S]*?-pos\\s+"+newPosEsc+"[\\s\\S]*?-index\\s+)\\d+");
out=out.replace(idxRe,"$1"+(ent.itemIndex!==undefined?ent.itemIndex:13));
var numRe=new RegExp("(chara\\s+ITEM\\s+"+nameEsc+"\\s*\\\\[\\s\\S]*?-pos\\s+"+newPosEsc+"[\\s\\S]*?-num\\s+)\\d+");
out=out.replace(numRe,"$1"+(ent.num||1));
var cat=ITEM_CATALOG.find(function(c){return c.idx===ent.itemIndex&&c.box===ent.box});
var newMsg=cat?cat.msg:(ent.msg||"ITEM");
var msgRe=new RegExp('(chara\\s+ITEM\\s+'+nameEsc+'\\s*\\\\[\\s\\S]*?-pos\\s+'+newPosEsc+'[\\s\\S]*?-msg\\s+")[^"]*"');
out=out.replace(msgRe,'$1'+newMsg+'"');
// Replace -box
var boxRe=new RegExp("(chara\\s+ITEM\\s+"+nameEsc+"\\s*\\\\[\\s\\S]*?-pos\\s+"+newPosEsc+"[\\s\\S]*?-box\\s+)\\d+");
out=out.replace(boxRe,"$1"+(ent.box||0))}}
// Append new items - detect stage format and use proper wrapper
var newItems=[];
var isWrappedStage=out.indexOf("unknownProc10")>=0&&out.indexOf("$f:040001")>=0;
// Find highest $b: address used in file for unique new addresses
var highestAddr=0;
var addrMatches=out.match(/\$b:([0-9a-f]{6})/gi);
if(addrMatches){for(var am=0;am<addrMatches.length;am++){
var av=parseInt(addrMatches[am].substring(3),16);if(av>highestAddr)highestAddr=av}}
var nextAddr=highestAddr+1;

for(i=0;i<gclEntities.length;i++){var ent2=gclEntities[i];
if(ent2.type==="ITEM"&&ent2.origName&&ent2.origName.indexOf("0xnew")>=0){
var cat3=ITEM_CATALOG.find(function(c){return c.idx===ent2.itemIndex&&c.box===ent2.box});
var itemMsg2=cat3?cat3.msg:(ent2.msg||"ITEM");var p2=ent2.pos||{x:0,y:0,z:0};
var addrHex=nextAddr.toString(16).padStart(6,"0");nextAddr++;

if(isWrappedStage){
// Full wrapped format with save tracking
newItems.push(
"    call(unknownProc10, $b:"+addrHex+")\n"+
"    if ($f:040001) {\n"+
"        chara ITEM 0xeeba \\\n"+
"            -pos   "+p2.x+","+p2.y+","+p2.z+" \\\n"+
"            -h     500 \\\n"+
"            -box   "+(ent2.box||0)+" \\\n"+
"            -index "+(ent2.itemIndex||13)+" \\\n"+
"            -num   "+(ent2.num||1)+" \\\n"+
'            -msg   "'+itemMsg2+'" \\\n'+
"            -x     {\n"+
"                eval($b:"+addrHex+" = $b:000000)\n"+
"            }\n"+
"    }")}
else{
// Bare format (00a style)
newItems.push(
"    chara ITEM 0xeeba \\\n"+
"        -pos   "+p2.x+","+p2.y+","+p2.z+" \\\n"+
"        -h     500 \\\n"+
"        -box   "+(ent2.box||0)+" \\\n"+
"        -index "+(ent2.itemIndex||13)+" \\\n"+
"        -num   "+(ent2.num||1)+" \\\n"+
'        -msg   "'+itemMsg2+'"')}}}
if(newItems.length>0){
var insertPt=out.lastIndexOf("\neval($s:");
if(insertPt<0)insertPt=out.lastIndexOf("\n}\n");
if(insertPt>0){out=out.substring(0,insertPt)+"\n    # === ADDED ITEMS ===\n"+newItems.join("\n")+"\n"+out.substring(insertPt)}
else{out+="\n# === ADDED ITEMS ===\n"+newItems.join("\n")+"\n"}}
// Append new WATCHER/CAMERA/DOOR entities
var newEntities=[];
for(i=0;i<gclEntities.length;i++){var ent3=gclEntities[i];
if(!ent3.isNew)continue;var p3=ent3.pos||{x:0,y:0,z:0};var d3=ent3.dir||{x:0,y:0,z:0};
if(ent3.type==="WATCHER"){
// WATCHER param schema (from FoxDie decomp + observed working in-game guards):
//   -route N        patrol route number (REQUIRED — must exist in routes)
//   -n X,Y,Z        starting node / spawn position (REQUIRED — engine ignores -pos for WATCHERs)
//   -b 'X'          blood type ('X' = standard splatter, 'Z' = none)
//   -f N            faint HP threshold (HP below which guard collapses, typical 7-10)
//   -life N         max health (typical 128, vanilla default 192)
//   -a 'A'          area type ('A' = default, 'S' = snow shows white breath)
//   -s N            size bonus (added to base scale; 227 ≈ typical adult)
//   -y N            Y-flag / vertical hint (typically 1)
// Without these, guards spawn but don't enter active vision/combat state.
var sp=ent3.spawnPos||p3;
var watcherLine="chara WATCHER "+ent3.name+" \\\n"+
"    -route "+(ent3.route||0)+" \\\n"+
"    -b     '"+(ent3.bloodType||"X")+"' \\\n"+
"    -f     "+(ent3.faint||7)+" \\\n"+
"    -life  "+(ent3.life||128)+" \\\n"+
"    -n     "+sp.x+","+sp.y+","+sp.z+" \\\n"+
"    -a     '"+(ent3.areaType||"A")+"' \\\n"+
"    -s     "+(ent3.sizeBonus!==undefined?ent3.sizeBonus:227)+" \\\n"+
"    -y     "+(ent3.yFlag||1);
newEntities.push(watcherLine)}
if(ent3.type==="CAMERA"){
// Use full param set so the camera shows on radar with vision cone in-game.
// Matches the format of working in-game cameras: -len -width -xRange -pos -dir -exec
var camLen=ent3.camLen||4000;
var camW=ent3.camWidth||256;
var camXR=ent3.camXRange||480;
var camLine="chara CAMERA "+ent3.name+" \\\n"+
"    -len   "+camLen+" \\\n"+
"    -width "+camW+" \\\n"+
"    -xRange "+camXR+" \\\n"+
"    -pos   "+p3.x+","+p3.y+","+p3.z+" \\\n"+
"    -dir   "+d3.x+","+d3.y+","+d3.z;
if(ent3.execProc)camLine+=" \\\n    -exec  "+ent3.execProc;
newEntities.push(camLine)}
if(ent3.type==="DOOR"){
// Full door schema emitter — matches the vanilla GCL grammar decoded from door.c.
// Fields are read from the entity; missing ones use the same defaults the engine uses.
var dT=ent3.doorT||1;
var dW=ent3.doorW||1500;
var dS=ent3.doorS;// may be undefined → omit if default
var dU=ent3.doorU;
var dH=ent3.doorH;
var dV=ent3.doorV;
var dA=ent3.doorA;
var dE=ent3.doorE||(dT===2?{s1:98,s2:97}:{s1:91,s2:88});
var dG=ent3.doorG;
// Decide what callback proc to use for -f.
// - If the user typed an explicit doorF, use it as-is
// - Else if doorKeycard > 0, generate a name like <doorname>_keycheck. We'll
//   inject the proc body and trap zone later.
// - Else no -f flag at all (door auto-opens)
var dF=ent3.doorF;
var keycardLevel=ent3.doorKeycard||0;
var autoGenKeycardProc=null;
if(!dF&&keycardLevel>0){
autoGenKeycardProc=ent3.name+"_keycheck";
dF=autoGenKeycardProc;}
// Build the chara block
var doorLines=["chara DOOR "+ent3.name+" \\"];
doorLines.push("    -p "+p3.x+","+p3.y+","+p3.z+" \\");
doorLines.push("    -d "+d3.x+","+d3.y+","+d3.z+" \\");
doorLines.push("    -m "+(ent3.model||"nst_dor")+" \\");
doorLines.push("    -t "+dT+" \\");
doorLines.push("    -w "+dW+(dS||dU||dH||dV||dG||dE||dF||dA?" \\":""));
// Build remaining flag lines, only including ones that are set
var optLines=[];
if(dS!==undefined&&dS!==100)optLines.push("    -s "+dS);
if(dU!==undefined&&dU!==0)optLines.push("    -u "+dU);
if(dH!==undefined&&dH!==0)optLines.push("    -h "+dH);
if(dV!==undefined&&dV!==2500)optLines.push("    -v "+dV);
if(dG)optLines.push("    -g "+dG.axis+" "+dG.map1+" "+dG.map2);
optLines.push("    -e "+dE.s1+" "+dE.s2);
if(dF)optLines.push("    -f "+dF);
if(dA!==undefined&&dA!==16)optLines.push("    -a "+dA);
// Stitch — every line except the last needs a trailing backslash
for(var doi=0;doi<optLines.length;doi++){
doorLines.push(optLines[doi]+(doi<optLines.length-1?" \\":""));}
newEntities.push(doorLines.join("\n"));
// If we auto-generated a keycard-check proc, queue its body + trap zone for injection.
// We collect these into a side array (newDoorKeycardProcs) and inject after the main
// emission loop — they need to land in the script-body region, not the chara region.
if(autoGenKeycardProc){
if(!ent3._keycardArtifacts)ent3._keycardArtifacts={};
ent3._keycardArtifacts.procName=autoGenKeycardProc;
ent3._keycardArtifacts.trapName="tr_"+ent3.name;
ent3._keycardArtifacts.requiredLevel=keycardLevel;}}
// LAND_MINE — vanilla syntax: -pos x,y,z  -dir x,y,z  -e procname
// e.g. chara LAND_MINE 0xd959  -pos 0,0,22000  -dir 0,1024,0  -e unknownProc48
if(ent3.type==="LAND_MINE"){
var mineLine="chara LAND_MINE "+ent3.name+" \\\n"+
"    -pos   "+p3.x+","+p3.y+","+p3.z+" \\\n"+
"    -dir   "+d3.x+","+d3.y+","+d3.z;
if(ent3.explodeCallback)mineLine+=" \\\n    -e     "+ent3.explodeCallback;
newEntities.push(mineLine)}
// GUNCAME — auto-firing ceiling gun. Real vanilla pattern from s03a:
// chara GUNCAME camera1  -m 1  -len 5000  -width 300  -pos X,Y,Z  -dir X,Y,Z
//                        -xRange 512  -r 512,0,0  -g 5 2  -exec unknownProcN
if(ent3.type==="GUNCAME"){
var r=ent3.gunRotation||{x:512,y:0,z:0};
var gunLine="chara GUNCAME "+ent3.name+" \\\n"+
"    -m     "+(ent3.gunMode||1)+" \\\n"+
"    -len   "+(ent3.gunLen||5000)+" \\\n"+
"    -width "+(ent3.gunWidth||300)+" \\\n"+
"    -pos   "+p3.x+","+p3.y+","+p3.z+" \\\n"+
"    -dir   "+d3.x+","+d3.y+","+d3.z+" \\\n"+
"    -xRange "+(ent3.gunXRange||512)+" \\\n"+
"    -r     "+r.x+","+r.y+","+r.z+" \\\n"+
"    -g     "+(ent3.gunGroup||"5 2");
if(ent3.gunExec)gunLine+=" \\\n    -exec  "+ent3.gunExec;
newEntities.push(gunLine)}
// INFRARED_CENSOR — IR tripwire beam between TWO points. Vanilla:
// chara INFRARED_CENSOR 0xb3a1  -pos X1,Y1,Z1  X2,Y2,Z2  -move 0,3670,0  -speed 100 (or $w:00043c)  -b 60 0
if(ent3.type==="INFRARED_CENSOR"){
var b2=ent3.beamEnd||{x:p3.x+3000,y:p3.y,z:p3.z};
var bm=ent3.beamMove||{x:0,y:3670,z:0};
var beamLine="chara INFRARED_CENSOR "+ent3.name+" \\\n"+
"    -pos   "+p3.x+","+p3.y+","+p3.z+"  "+b2.x+","+b2.y+","+b2.z+" \\\n"+
"    -move  "+bm.x+","+bm.y+","+bm.z+" \\\n"+
"    -speed "+(ent3.beamSpeed||"100");
if(ent3.beamBehavior)beamLine+=" \\\n    -b     "+ent3.beamBehavior;
if(ent3.beamCallback)beamLine+=" \\\n    -e     "+ent3.beamCallback;
newEntities.push(beamLine)}
// SEARCH_LIGHT — roving searchlight. Vanilla pattern (s01a):
// chara SEARCH_LIGHT searchli0  -i 1  -h 1100  -x 250  -w 1700  -d X,Y,Z  -p X,Y,Z  -a 185  -t 306 306 175 3  -z 0
if(ent3.type==="SEARCH_LIGHT"){
var slLine="chara SEARCH_LIGHT "+ent3.name+" \\\n"+
"    -i "+(ent3.lightIndex||1)+" \\\n"+
"    -h "+(ent3.lightHeight||1100)+" \\\n"+
"    -x "+(ent3.lightXRange||250)+" \\\n"+
"    -w "+(ent3.lightWidth||1700)+" \\\n"+
"    -d "+d3.x+","+d3.y+","+d3.z+" \\\n"+
"    -p "+p3.x+","+p3.y+","+p3.z+" \\\n"+
"    -a "+(ent3.lightAngle||185)+" \\\n"+
"    -t "+(ent3.lightPattern||"306 306 175 3")+" \\\n"+
"    -z 0";
newEntities.push(slLine)}
// LIFE_UP — health pickup. Vanilla (s04b):
// chara LIFE_UP 0xf9da  -m 320  -e unknownProc53  -c 8  -l $w:00041a
if(ent3.type==="LIFE_UP"){
var luLine="chara LIFE_UP "+ent3.name+" \\\n"+
"    -m "+(ent3.lifeM||320)+" \\\n"+
"    -c "+(ent3.lifeC||8)+" \\\n"+
"    -l "+(ent3.lifeVar||"$w:00041a");
if(ent3.lifeCallback)luLine+=" \\\n    -e "+ent3.lifeCallback;
newEntities.push(luLine)}
// LAMP — unusual positional-arg syntax: chara LAMP <hash> pos_vec3  dir_vec3  scale_vec3
// followed by flag-based -I -S -a -b -c. We emit a simplified form: just the header line
// plus -I hash. The full -a/-b/-c stuff requires manual editing if user wants it.
//
// EXCEPTION: when the lamp was created by the door wizard, customRaw contains the
// full lamp with proper -I dr_lamp_off, -a/-b animation programs, etc. Use that.
if(ent3.type==="LAMP"){
if(ent3.customRaw){newEntities.push(ent3.customRaw);}
else{
var sc=ent3.lampScale||{x:250,y:137,z:250};
var lampLine="chara LAMP  "+ent3.name+"  "+p3.x+","+p3.y+","+p3.z+"  "+d3.x+","+d3.y+","+d3.z+"  "+sc.x+","+sc.y+","+sc.z+" \\\n"+
"    -I "+(ent3.lampModelHash||"0xe29d")+" \\\n"+
"    -S";
newEntities.push(lampLine)}}
// OBSTACLE — placed model with collision. Vanilla: chara OBSTACLE 0xhash  -pos x,y,z  -dir x,y,z  -model name
if(ent3.type==="OBSTACLE"){
var obLine="chara OBSTACLE "+ent3.name+" \\\n"+
"    -pos   "+p3.x+","+p3.y+","+p3.z+" \\\n"+
"    -dir   "+d3.x+","+d3.y+","+d3.z+" \\\n"+
"    -model "+(ent3.model||"01a_o00");
newEntities.push(obLine)}
// PUT_OBJECT — multi-instance prop placement. Vanilla:
// chara PUT_OBJECT 0xhash  -model name  -set posXYZ  rotXYZ  posXYZ  rotXYZ ...
// The -set value is a whitespace-separated list of pos/rot pairs.
if(ent3.type==="PUT_OBJECT"){
var poLine="chara PUT_OBJECT "+ent3.name+" \\\n"+
"    -model "+(ent3.model||"01a_o00")+" \\\n"+
"    -set   "+(ent3.putSet||p3.x+",0,"+p3.z+"  0,0,0");
newEntities.push(poLine)}
// Spawn-wizard entities: if customRaw is set and the type wasn't already handled above,
// use the verbatim block from the wizard. This catches DOG, CROW, MOUSE, HIYOKO, etc.
// — anything the wizard supports but the editor doesn't have a dedicated emitter for.
if(ent3.customRaw&&ent3.type!=="WATCHER"&&ent3.type!=="CAMERA"&&ent3.type!=="CAMERA2"&&ent3.type!=="DOOR"&&
ent3.type!=="LAND_MINE"&&ent3.type!=="GUNCAME"&&ent3.type!=="INFRARED_CENSOR"&&
ent3.type!=="SEARCH_LIGHT"&&ent3.type!=="LIFE_UP"&&ent3.type!=="LAMP"&&
ent3.type!=="OBSTACLE"&&ent3.type!=="PUT_OBJECT"){
newEntities.push(ent3.customRaw);}}

// AUTO-GENERATE KEYCARD INFRASTRUCTURE for any DOOR with doorKeycard > 0.
// Vanilla pattern (canonical example: s02a's unknownProc32 + trdoor1/trdoor2/trdoor4):
//
//   proc <doorname>_keycheck {
//       if (stack:3 == enter) {
//           if ($w:pan_card >= stack:2 && (stack:4 != SNAKE || $w:equipped_item == 17)) {
//               mesg stack:1 stack:3 stack:4 stack:5 0          # OPEN
//           } else {
//               mesg stack:1 0x1aaa stack:4 stack:5 15          # LOCKED (denied)
//           }
//       } else {
//           mesg stack:1 stack:3 stack:4 stack:5 15              # close on leave
//       }
//   }
//   ntrap tr_<doorname> SNAKE -mask anything? -i -exec {
//       call(<doorname>_keycheck, <doorname>, <level>, stack:3, stack:2, stack:4, 0x0, stack:7)
//   }
//
// IMPORTANT: the door's -f param must reference <doorname>_keycheck (already done in emitter).
// The trap zone is a NAMED zone — it needs to exist in HZM zones too, but since our
// existing trap zones in vanilla games are written this way, we'll inject the GCL ntrap
// block and let users add the matching named zone manually (or via an existing HZD zone).
// For doors that use -g (room loader), the trap zone NAME should match an existing HZM zone
// for the door's threshold; we use `tr_<doorname>` as a placeholder.
var newKeycardProcs=[];
var newKeycardTraps=[];
for(var ki=0;ki<gclEntities.length;ki++){
var kent=gclEntities[ki];
if(!kent.isNew||kent.type!=="DOOR"||!kent._keycardArtifacts)continue;
var ka=kent._keycardArtifacts;
// The check proc — exactly the vanilla pattern, parameterized for cleanliness
newKeycardProcs.push(
"proc "+ka.procName+" {\n"+
"    if (stack:3 == enter) {\n"+
"        if ($w:pan_card >= stack:2 && (stack:4 != SNAKE || $w:equipped_item == 17)) {\n"+
"            mesg stack:1 stack:3 stack:4 stack:5 0\n"+
"        } else {\n"+
"            if (stack:4 == SNAKE && $w:equipped_item == 17) {\n"+
"                sound \\\n"+
"                    -e     0 63 35\n"+
"                mesg stack:6 0xbcd2 0x61\n"+
"            }\n"+
"            mesg stack:1 0x1aaa stack:4 stack:5 15\n"+
"        }\n"+
"    } else {\n"+
"        mesg stack:1 stack:3 stack:4 stack:5 15\n"+
"    }\n"+
"}");
// The trap zone that calls the check proc with the required keycard level
newKeycardTraps.push(
"ntrap "+ka.trapName+" anything? \\\n"+
"    -mask  anything? \\\n"+
"    -i     \\\n"+
"    -exec  {\n"+
"        call("+ka.procName+", "+kent.name+", "+ka.requiredLevel+", stack:3, stack:2, stack:4, 0x0, stack:7)\n"+
"    }");}
// Inject the procs near the top (before script body — same place as other proc defs).
// Inject the trap zones with the other ntrap statements (search for an existing one).
if(newKeycardProcs.length>0){
// Find the first existing proc to insert before
var firstProcIdx=out.search(/^proc\s+\w+\s*\{/m);
if(firstProcIdx<0)firstProcIdx=0;
out=out.substring(0,firstProcIdx)+newKeycardProcs.join("\n\n")+"\n\n"+out.substring(firstProcIdx);}
if(newKeycardTraps.length>0){
// Find an existing ntrap/trap to insert near; if none, append before the entity-block insertion point
var firstTrapIdx=out.search(/^(?:n?trap)\s+\w+/m);
if(firstTrapIdx>=0){
out=out.substring(0,firstTrapIdx)+newKeycardTraps.join("\n\n")+"\n\n"+out.substring(firstTrapIdx);}
else{
// Append at end
out+="\n"+newKeycardTraps.join("\n\n")+"\n";}}

// AUTO-PATCH COMMAND: each new WATCHER/CAMERA must be wrapped in its own proc; that proc's
// name goes into COMMAND's -nWatcher / -camera list. The COMMAND coordinator calls these
// procs on stage init AND registers the entities in its alert/combat tracking system.
// Without this wiring, entities spawn but never enter active vision/combat state.
var newWatchers=[],newCameras=[];
for(var nei=0;nei<gclEntities.length;nei++){var enX=gclEntities[nei];
if(!enX.isNew)continue;
if(enX.type==="WATCHER")newWatchers.push(enX);
else if(enX.type==="CAMERA"||enX.type==="CAMERA2")newCameras.push(enX);}

if(newWatchers.length>0||newCameras.length>0){
// Find next free unknownProcN number
var maxProcNum=0;
var procNumRe=/\bunknownProc(\d+)\b/g;var pnm;
while((pnm=procNumRe.exec(out))!==null){var n=parseInt(pnm[1]);if(n>maxProcNum)maxProcNum=n;}

var spawnProcs=[];
var newNWatcherProcs=[];
var newCameraProcs=[];

// WATCHER spawn procs — each WATCHER wrapped in `proc unknownProcN { map -area main; chara WATCHER ... }`
for(var wi=0;wi<newWatchers.length;wi++){
maxProcNum++;
var pName="unknownProc"+maxProcNum;
var w=newWatchers[wi];
var sp=w.spawnPos||w.pos||{x:0,y:0,z:0};
var charaBody="    chara WATCHER "+w.name+" \\\n"+
"        -route "+(w.route||0)+" \\\n"+
"        -b     '"+(w.bloodType||"X")+"' \\\n"+
"        -f     "+(w.faint||7)+" \\\n"+
"        -life  "+(w.life||192)+" \\\n"+
"        -n     "+sp.x+","+sp.y+","+sp.z+" \\\n"+
"        -a     '"+(w.areaType||"A")+"' \\\n"+
"        -s     "+(w.sizeBonus!==undefined?w.sizeBonus:227)+" \\\n"+
"        -y     "+(w.yFlag||1);
spawnProcs.push("proc "+pName+" {\n    map \\\n        -area  main\n"+charaBody+"\n}");
newNWatcherProcs.push(pName);
w._exported=true;}

// CAMERA spawn procs (each camera ALSO gets a detect-callback proc as its -exec target)
for(var ci2=0;ci2<newCameras.length;ci2++){
var c=newCameras[ci2];
maxProcNum++;var execName="unknownProc"+maxProcNum;
spawnProcs.push("proc "+execName+" {\n    eval($f:000390 = true)\n}");
maxProcNum++;var pNameC="unknownProc"+maxProcNum;
var cp=c.pos||{x:0,y:0,z:0};var cd=c.dir||{x:256,y:512,z:0};
var camBody="    chara CAMERA "+c.name+" \\\n"+
"        -len   "+(c.camLen||4000)+" \\\n"+
"        -width "+(c.camWidth||256)+" \\\n"+
"        -xRange "+(c.camXRange||480)+" \\\n"+
"        -pos   "+cp.x+","+cp.y+","+cp.z+" \\\n"+
"        -dir   "+cd.x+","+cd.y+","+cd.z+" \\\n"+
"        -exec  "+execName;
spawnProcs.push("proc "+pNameC+" {\n    map \\\n        -area  main\n"+camBody+"\n}");
newCameraProcs.push(pNameC);
c._exported=true;}

// Patch COMMAND -nWatcher list
if(newNWatcherProcs.length>0){
var nwRe=/(-nWatcher\s+(?:\w+\s+)+)(\\?)/;
if(nwRe.test(out)){
out=out.replace(nwRe,function(match,p1,p2){
return p1.replace(/\s+$/,"")+" "+newNWatcherProcs.join(" ")+" "+p2;});}
else{console.warn("exportGCL: COMMAND -nWatcher not found, new watchers won't be registered");}}

// Patch COMMAND -camera list
if(newCameraProcs.length>0){
var ncRe=/(-camera\s+(?:\w+\s+)+)(\\?)/;
if(ncRe.test(out)){
out=out.replace(ncRe,function(match,p1,p2){
return p1.replace(/\s+$/,"")+" "+newCameraProcs.join(" ")+" "+p2;});}}

// CRITICAL: Insert new procs right after the LAST existing top-level proc that contains
// a `chara WATCHER` spawn. This places them in the same region as proc55/56/57 in vanilla
// stages — and crucially BEFORE the COMMAND-containing proc. The GCL→GCX converter
// appears to be single-pass: COMMAND's -nWatcher list references proc names, and those
// procs must be defined EARLIER in the file or the converter produces a broken GCX
// (causing instant stage-load crash). Inserting after MOTION_SEQUENCE or after the
// COMMAND proc both cause this failure mode.
var procsBlock=spawnProcs.join("\n\n")+"\n\n";
var insertPt=null;
// Find every top-level `proc <name> {` declaration
var procDeclRe=/^proc\s+(\w+)\s*\{/gm;
var allProcs=[];var pdm;
while((pdm=procDeclRe.exec(out))!==null)allProcs.push({name:pdm[1],start:pdm.index});
// For each top-level proc, walk forward to find its closing brace AND check if it contains
// a `chara WATCHER` statement. Track the END of the LAST such proc.
for(var pi=0;pi<allProcs.length;pi++){
var pd=allProcs[pi];
var depth=0,j=pd.start;
while(j<out.length){
var ch=out[j];
if(ch==="{")depth++;
else if(ch==="}"){depth--;if(depth===0)break;}
j++;}
if(j>=out.length)continue;
var procBody=out.substring(pd.start,j+1);
if(/chara\s+WATCHER\b/.test(procBody)){
insertPt=j+1;// end of this proc — keep updating as we find later ones
}}
if(insertPt===null){
// Fallback: before MOTION_SEQUENCE (won't work with single-pass converters but better than failure)
var motionMatch=out.match(/^chara\s+MOTION_SEQUENCE/m);
insertPt=motionMatch?motionMatch.index:out.length;}
// Insert with a blank line separator (matches vanilla proc separation)
out=out.substring(0,insertPt)+"\n\n"+procsBlock+out.substring(insertPt);}

// Suppress now-handled WATCHER/CAMERA entries from the top-level entity dump.
// (newEntities was built earlier; filter out entries whose entity got wrapped in a spawn proc.)
var legacyEntities=[];
var newEntIdx=0;
for(var lei=0;lei<gclEntities.length;lei++){
if(!gclEntities[lei].isNew)continue;
var et=gclEntities[lei].type;
// All the types that have dedicated emitters in newEntities. Walk in matching
// order so newEntIdx stays aligned with what was actually pushed.
var dedicatedTypes={WATCHER:1,CAMERA:1,CAMERA2:1,DOOR:1,LAND_MINE:1,GUNCAME:1,
INFRARED_CENSOR:1,SEARCH_LIGHT:1,LIFE_UP:1,LAMP:1,OBSTACLE:1,PUT_OBJECT:1};
var wasPushed=(dedicatedTypes[et]===1)||
(gclEntities[lei].customRaw&&!dedicatedTypes[et]);
if(wasPushed){
if(!gclEntities[lei]._exported)legacyEntities.push(newEntities[newEntIdx]);
newEntIdx++;}}
if(legacyEntities.length>0){
var entityBlock="\n"+legacyEntities.join("\n")+"\n";
var entInsertPt=out.search(/^chara\s+MOTION_SEQUENCE/m);
if(entInsertPt<0)entInsertPt=out.length;
out=out.substring(0,entInsertPt)+entityBlock+out.substring(entInsertPt);}
// Patch modified in-game camAngle proc definitions
for(var ci=0;ci<camAngles.length;ci++){var ca2=camAngles[ci];
if(!ca2.modified||!ca2.origRaw||!ca2.proc)continue;
// Rebuild the camera params from edited values
var newCamLine="camera";
if(ca2.bound){newCamLine+=" -bound "+ca2.bound.x1+","+ca2.bound.y1+","+ca2.bound.z1+" "+ca2.bound.x2+","+ca2.bound.y2+","+ca2.bound.z2}
if(ca2.limit){newCamLine+=" -limit "+ca2.limit.x1+","+ca2.limit.y1+","+ca2.limit.z1+" "+ca2.limit.x2+","+ca2.limit.y2+","+ca2.limit.z2}
if(ca2.rot){newCamLine+=" -rot "+ca2.rot.pitch+","+ca2.rot.yaw+","+ca2.rot.roll}
if(ca2.track!==undefined){newCamLine+=" -track "+ca2.track}
if(ca2.setPos&&ca2.setTarget){
// Real -set format: [//] cam_id param1 interp type  pos_x,y,z  tgt_x,y,z  [alert_mask]
var setPrefix=ca2.setSlashPrefix?"// ":"";
var camId=ca2.setCamId!==undefined?ca2.setCamId:1;
var param1=ca2.setParam1!==undefined?ca2.setParam1:1;
var interp=ca2.setInterp!==undefined?ca2.setInterp:1;
var camType=ca2.setCamType!==undefined?ca2.setCamType:0;
newCamLine+=" -set "+setPrefix+camId+" "+param1+" "+interp+" "+camType+
" "+ca2.setPos.x+","+ca2.setPos.y+","+ca2.setPos.z+
" "+ca2.setTarget.x+","+ca2.setTarget.y+","+ca2.setTarget.z;
if(ca2.setAlertMask!==undefined)newCamLine+=" "+ca2.setAlertMask;}
// Escape the origRaw for use in a regex.
// IMPORTANT: GCL uses backslash for line continuation; whitespace gaps in the source
// can contain \\, \r, \n. Standard \s+ doesn't match \\, so we use [\s\\\\]+ instead.
var origEsc=ca2.origRaw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"[\\s\\\\]+");
var camLineRe=new RegExp("(proc\\s+"+ca2.proc.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s*\\{[\\s\\S]*?)camera[\\s\\\\]+"+origEsc);
var replaced=out.replace(camLineRe,"$1"+newCamLine);
if(replaced!==out){out=replaced;ca2.origRaw=newCamLine.replace(/^camera\s*/,"");ca2.modified=false}
else{console.warn("exportGCL: could not patch camAngle proc "+ca2.proc+" — pattern did not match. origRaw was: "+ca2.origRaw)}}
// Restore original line ending style — converters that require CRLF will crash the game otherwise
if(origIsCRLF)out=out.replace(/\r\n/g,"\n").replace(/\n/g,"\r\n");
return{text:out,errors:validationErrors};}

function exportGCL(){
var r=buildGCLText();
if(!r.text){
// PSX/GCX load path: there's no PC-dialect text buffer (gclOrigText is empty),
// so serialize the parsed AST the same way the GCL viewer does. This is the
// human-readable decompiled script for inspection/diffing; structural PSX
// edits go back through "Save .gcx" (AST → byte-identical GCX), not this text.
if(typeof psxGcx!=="undefined"&&psxGcx&&typeof gcxAstToGCL==="function"){
var txt=gcxAstToGCL(psxGcx);
var fn=((typeof psxGcxName==="string"&&psxGcxName)?psxGcxName.replace(/\.gcx$/i,""):"scenerio")+".gcl";
var ap=document.createElement("a");
ap.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));
ap.download=fn;document.body.appendChild(ap);ap.click();
setTimeout(function(){document.body.removeChild(ap)},200);
return;}
return;}
if(r.errors.length>0){
if(!confirm("Validation warnings — file may crash the game:\n\n• "+r.errors.join("\n\n• ")+"\n\nDownload anyway?"))return;}
var a=document.createElement("a");
a.href=URL.createObjectURL(new Blob([r.text],{type:"text/plain"}));
a.download="scenerio_modified.gcl";document.body.appendChild(a);a.click();
setTimeout(function(){document.body.removeChild(a)},200);}

function exportGCLSummary(){
// Generate a readable summary of all modifications
var lines=["# === GCL MODIFICATIONS SUMMARY ===","# Generated by MGS1 Stage Editor V1 Beta",""];
for(var i=0;i<gclEntities.length;i++){var ent=gclEntities[i];
var pos=ent.pos||ent.spawnPos;if(!pos)continue;
if(ent.type==="SNAKE"){
lines.push("# SNAKE spawn position:");
lines.push("chara SNAKE SNAKE \\");
lines.push("    -pos   "+pos.x+","+pos.y+","+pos.z+" \\");
if(ent.dir)lines.push("    -dir   "+ent.dir.x+","+ent.dir.y+","+ent.dir.z+" \\");
lines.push("");
}
if(ent.type==="ITEM"&&ent.name.indexOf("0xnew")>=0){
var cat2=ITEM_CATALOG.find(function(c){return c.idx===ent.itemIndex});
lines.push("# NEW ITEM: "+(cat2?cat2.name:"ITEM"));
lines.push("chara ITEM 0xeeba \\");
lines.push("    -pos   "+pos.x+","+pos.y+","+pos.z+" \\");
lines.push("    -h     500 \\");
lines.push("    -box   "+(ent.box||4)+" \\");
lines.push("    -index "+(ent.itemIndex||13)+" \\");
lines.push("    -num   "+(ent.num||1)+" \\");
lines.push('    -msg   "'+(cat2?cat2.name:"ITEM")+'"');
lines.push("")}
if(ent.type==="WATCHER"){
lines.push("# ENEMY: "+ent.name+" route="+ent.route);
if(ent.spawnPos)lines.push("#   spawn: "+ent.spawnPos.x+","+ent.spawnPos.y+","+ent.spawnPos.z);
lines.push("")}}
return lines.join("\n")}

function updateGCLPanel(){var p=document.getElementById("gclPanel");if(!p)return;
if(gclEntities.length===0){p.innerHTML="";return}
var groups={};for(var i=0;i<gclEntities.length;i++){var t=gclEntities[i].type;if(!groups[t])groups[t]=[];groups[t].push(i)}
var typeColors={SNAKE:"#00ff00",WATCHER:"#ff4444",CAMERA:"#ffff00",ITEM:"#44aaff",DOOR:"#ff8844",
OBSTACLE:"#888888",DYNAMIC_SEGMENT:"#ff8800",SEARCH_LIGHT:"#ffff88",MOUSE:"#886644",COMMAND:"#ff0088"};
var isWrappedStg=gclOrigText&&gclOrigText.indexOf("unknownProc10")>=0&&gclOrigText.indexOf("$f:040001")>=0;
var wrapTag=' <span style="font-size:8px;color:'+(isWrappedStg?'#ffaa00':'#44cc88')+'">'+(isWrappedStg?'WRAPPED':'BARE')+'</span>';
var html=panelHeader("gcl","GCL Entities ("+gclEntities.length+")","#ff4488",wrapTag);
if(panelCollapsed.gcl){p.innerHTML=html;return}
html+='<div style="padding:4px"><div style="display:flex;flex-wrap:wrap;gap:2px">';
html+='<button class="btn" onclick="addGCLWatcher()" style="font-size:9px;padding:1px 4px;color:#ff4444">+Enemy</button>';
html+='<button class="btn" onclick="addGCLCamera()" style="font-size:9px;padding:1px 4px;color:#ffff00">+Camera</button>';
html+='<button class="btn" onclick="addGCLDoor()" style="font-size:9px;padding:1px 4px;color:#ff8844">+Door</button>';
html+='<button class="btn" onclick="addGCLItem()" style="font-size:9px;padding:1px 4px;color:#44aaff">+Item</button>';
html+='<button class="btn" onclick="exportGCL()" style="font-size:9px;padding:1px 4px;color:#ff4488">ExpGCL</button>';
// Catalog-driven entity dropdown for less-common types
html+='<select class="btn" onchange="addGCLEntityFromCatalog(this.value);this.value=\'\'" style="font-size:9px;padding:1px 4px;color:#88ddff;background:#0a0e14;border:1px solid #1a2535">';
html+='<option value="">+ Add Other Entity...</option>';
var catGroups=getCatalogByCategory();
var catOrder=["enemy","hazard","pickup","environment","system"];
var catLabels={enemy:"Enemies",hazard:"Hazards",pickup:"Pickups",environment:"Environment",system:"System"};
for(var ci=0;ci<catOrder.length;ci++){var cn=catOrder[ci];if(!catGroups[cn])continue;
html+='<optgroup label="'+catLabels[cn]+'">';
for(var ti=0;ti<catGroups[cn].length;ti++){var tt=catGroups[cn][ti];
html+='<option value="'+tt+'">'+ENTITY_CATALOG[tt].label+'</option>';}
html+='</optgroup>';}
html+='</select>';
html+='</div></div>';
html+='<div style="max-height:300px;overflow-y:auto">';
var typeOrder=["SNAKE","WATCHER","CAMERA","SEARCH_LIGHT","DOOR","ITEM","OBSTACLE","DYNAMIC_SEGMENT","COMMAND","MOUSE","EMITTER","PATO_LAMP","ENV_SOUND"];
for(var ti=0;ti<typeOrder.length;ti++){var tName=typeOrder[ti];if(!groups[tName])continue;
var tc=typeColors[tName]||"#ff4488";
html+='<div style="padding:2px 6px;font-size:9px;font-weight:bold;color:'+tc+';border-bottom:1px solid #1a2535;background:#0a0e14">'+tName+' ('+groups[tName].length+')</div>';
for(var gi=0;gi<groups[tName].length;gi++){var idx=groups[tName][gi];var ent=gclEntities[idx];
var pos=ent.pos||ent.spawnPos;var isSel4=selGCL===idx;
var info=ent.msg||ent.name||"";
if(ent.route!==undefined)info+=" rt:"+ent.route;
if(ent.model)info+=" mdl:"+ent.model;
if(pos)info+=" ("+pos.x+","+pos.z+")";
html+='<div style="display:flex;align-items:center;padding:1px 6px;cursor:pointer;font-size:9px;border-bottom:1px solid #111;'+(isSel4?'background:#331122;color:#fff':'color:'+tc)+'">';
html+='<span onclick="selectGCLEntity('+idx+')" ondblclick="focusGCLEntity('+idx+')" style="flex:1" title="Click=select DblClick=focus">'+info+'</span>';
html+='<span onclick="event.stopPropagation();deleteGCLEntity('+idx+')" style="color:#ff3355;cursor:pointer;padding:0 3px" title="Delete">&times;</span></div>'}}
// Any types not in typeOrder
for(var tName2 in groups){if(typeOrder.indexOf(tName2)<0){
html+='<div style="padding:2px 6px;font-size:9px;font-weight:bold;color:#ff4488;border-bottom:1px solid #1a2535">'+tName2+' ('+groups[tName2].length+')</div>';
for(gi=0;gi<groups[tName2].length;gi++){idx=groups[tName2][gi];ent=gclEntities[idx];pos=ent.pos||ent.spawnPos;isSel4=selGCL===idx;
html+='<div onclick="selectGCLEntity('+idx+')" ondblclick="focusGCLEntity('+idx+')" style="padding:1px 6px;cursor:pointer;font-size:9px;border-bottom:1px solid #111;'+(isSel4?'background:#331122;color:#fff':'color:#ff4488')+'">'+
(ent.msg||ent.name||"")+'</div>'}}}
html+='</div>';p.innerHTML=html}

function focusGCLEntity(idx){var ent=gclEntities[idx];var pos=ent.pos||ent.spawnPos;if(!pos)return;
cTgt.set(pos.x*S,pos.y*S,pos.z*S);sph.radius=10;uCam();drawCamGizmo()}


// Apply stage-transition edits: rewrite the load proc to use the new target
// stage and spawn coords. Called by the door props panel's "Apply Transition
// Changes" button when the door is detected as a stage-transition door.
function applyDoorTransition(idx){
if(idx<0||idx>=gclEntities.length)return;
var ent=gclEntities[idx];
var info=ent._transitionInfo;
if(!info||!info.loadProcName){alert("Door is not a stage-transition door — no load proc to edit.");return;}
var tsEl=document.getElementById("gdoorTargetStage");
var sxEl=document.getElementById("gdoorSpawnX");
var syEl=document.getElementById("gdoorSpawnY");
var szEl=document.getElementById("gdoorSpawnZ");
if(!tsEl||!sxEl||!syEl||!szEl){alert("Form fields missing.");return;}
var newTarget=tsEl.value;
var newSX=parseInt(sxEl.value)||0;
var newSY=parseInt(syEl.value)||0;
var newSZ=parseInt(szEl.value)||0;
if(typeof updateStageTransitionLoadProc!=="function"){alert("updateStageTransitionLoadProc helper not loaded.");return;}
var newText=updateStageTransitionLoadProc(gclOrigText,info.loadProcName,newTarget,newSX,newSY,newSZ);
if(newText===gclOrigText){alert("Failed to update proc — could not find proc body matching pattern.");return;}
gclOrigText=newText;
// Re-parse so subsequent reads pick up the change
if(typeof parseGCLScript==="function")parseGCLScript(gclOrigText);
if(typeof showGCLProps==="function")showGCLProps();
if(typeof logUndo==="function")logUndo("door","Updated transition to "+newTarget);
alert("Updated load proc "+info.loadProcName+":\nTarget: "+newTarget+"\nSpawn: ("+newSX+","+newSY+","+newSZ+")\n\nClick ExpGCL to write changes to file.");}

// Build a lookup of zone name -> list of {kind, ai, actor, mask, mentionsDoor} where
// kind is "trap" or "ntrap". The 3D renderer uses this to color HZM zones
// based on what GCL statements reference them.
// Returns: { "zonename": [{kind:"trap"|"ntrap", actor:"SNAKE", mask:"enter"}, ...], ... }
var _zoneRefCache=null;
var _zoneRefCacheText=null;
function getZoneReferences(){
var gclText=(typeof gclOrigText==="string")?gclOrigText:"";
if(_zoneRefCache&&_zoneRefCacheText===gclText)return _zoneRefCache;
var refs={};
// Match `trap <name>` and `ntrap <name>` headers. Don't require a body
// (camera angle ntraps without a body are still references).
var re=/(^|\n)\s*(n?trap)\s+(\S+)(?:\s+(\S+))?/g;
var m;
while((m=re.exec(gclText))!==null){
var kind=m[2];
var zname=m[3];
var actor=m[4]||"";
// Skip if zname is a keyword or starts with a flag dash
if(!zname||zname[0]==="-"||zname[0]==="{")continue;
if(!refs[zname])refs[zname]=[];
refs[zname].push({kind:kind,actor:actor});}
_zoneRefCache=refs;
_zoneRefCacheText=gclText;
return refs;}

// ============================================================
