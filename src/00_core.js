// ═══════════════════════════════════════════════════════════════════════════
// FILE: 00_core.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// MGS1 STAGE EDITOR V1 BETA
// ============================================================
var S=0.001,SNG=250,DEG=1024/360;
var hzm=null,hzmFN="";
var selW={},colW={},newW=[];
var selF={},colF={},newF=[];
var selZ={},colZ={},newZ=[];
var undoHist=[];
var curTool="click",showFl=true,showZn=false,showRt=false,navView=false;
var placeY=0,placeH=2000,snapSize=250;
var sc3,cam3,ren3,rc3,ms3;
var wObjs=[],nwObjs=[],fObjs=[],nfObjs=[],zObjs=[],nzObjs=[],rtObjs=[],kmdObjs=[];
var sph={theta:Math.PI/4,phi:Math.PI/3,radius:30},cTgt;
var isRot=false,isPan=false,wasD=false,pMouse={x:0,y:0};
var dPt1=null,dPrev=null,hovKey=null;
var clipboard=[],movePt1=null,movePrevObjs=[];
// Gizmo system (Blender-style)
var gizmoObjs=[],gizmoAxis=null,gizmoDragging=false,gizmoDragStart=null,gizmoDragItems=null,gizmoJustUsed=false,gizType="normal";
var grabMode=false,grabAxis=null,grabStart=null,grabOrigPositions=null;
var boxSelecting=false,boxStart=null,boxDiv=null;
var kmdMode="wire",kmdFlip=false,kmdBufs=[];
var selRoute=-1,selWP=-1;
var camBookmarks=[];
// Collapsible side panel state — keyed by section id, true = collapsed
// Left-side panels default to collapsed so the user starts with a clean view.
// They click the header arrow to expand any panel they need.
// Section IDs match the ones used in panelHeader() calls throughout the codebase.
var panelCollapsed={
routes:true,
bookmark:true,
undo:true,
tex:true,
kmd:true,
gcl:false// keep entity list expanded — it's the most commonly used
};
function panelHeader(secId,title,color,extraHtml){
var col=panelCollapsed[secId]?true:false;
var arrow=col?"▶":"▼";
extraHtml=extraHtml||"";
return '<div style="padding:4px;cursor:pointer;user-select:none" onclick="togglePanelCollapse(\''+secId+'\')">'+
'<span style="color:#666;font-size:9px;margin-right:4px">'+arrow+'</span>'+
'<b style="color:'+color+'">'+title+'</b> '+extraHtml+'</div>';}
function togglePanelCollapse(secId){
panelCollapsed[secId]=!panelCollapsed[secId];
// Re-render the panels (each one checks its own collapsed state)
try{updateBookmarkUI()}catch(e){}
try{updateKMDList()}catch(e){}
try{updateGCLPanel()}catch(e){}
try{updateProcPanel()}catch(e){}
try{updateNavPanel()}catch(e){}
try{updateUndoPanel()}catch(e){}
try{updateTexPalette()}catch(e){}
try{updateZoneList()}catch(e){}
try{updateRouteList()}catch(e){}}
var measurePt1=null,measureLine=null,measureLabel=null;
// (chainMode wall-chain feature removed; was for connected wall drawing, rarely used)
var undoLog=[];
var kmdFileNames=[];var kmdVisible=[];
var gclMarkers=[];var showGcl=true;
var glbObj=null,showGlb=true;
var gclEntities=[];var showGclVis=true;var gclObjs2=[];

var selGCL=-1;
var gclOrigText="";
var ITEM_CATALOG=[
{idx:0,name:"SOCOM",box:0,num:1,msg:"SOCOM"},
{idx:0,name:"SOCOM AMMO",box:2,num:12,msg:"SOCOM/BULLET * 12"},
{idx:1,name:"FA-MAS",box:0,num:1,msg:"FA-MAS"},
{idx:1,name:"FA-MAS AMMO",box:2,num:25,msg:"FA-MAS/BULLET * 25"},
{idx:2,name:"GRENADE",box:0,num:4,msg:"GRENADE * 4"},
{idx:3,name:"NIKITA",box:0,num:1,msg:"NIKITA LAUNCHER"},
{idx:3,name:"NIKITA AMMO",box:3,num:4,msg:"NIKITA MISSILE * 4"},
{idx:4,name:"STINGER",box:0,num:1,msg:"STINGER LAUNCHER"},
{idx:4,name:"STINGER AMMO",box:3,num:5,msg:"STINGER MISSILE * 5"},
{idx:5,name:"CLAYMORE",box:0,num:3,msg:"CLAYMORE * 3"},
{idx:6,name:"C4",box:0,num:2,msg:"C4 * 2"},
{idx:7,name:"STUN GRENADE",box:0,num:3,msg:"STUN GRENADE * 3"},
{idx:8,name:"CHAFF GRENADE",box:0,num:3,msg:"CHAFF GRENADE * 3"},
{idx:9,name:"PSG1",box:0,num:1,msg:"PSG1"},
{idx:9,name:"PSG1 AMMO",box:2,num:5,msg:"PSG1/BULLET * 5"},
{idx:12,name:"CAMERA",box:1,num:1,msg:"CAMERA"},
{idx:13,name:"RATION",box:4,num:1,msg:"RATION"},
{idx:14,name:"MEDICINE",box:5,num:1,msg:"MEDICINE"},
{idx:15,name:"DIAZEPAM",box:5,num:1,msg:"DIAZEPAM"},
{idx:16,name:"PAL KEY",box:6,num:1,msg:"PAL KEY"},
{idx:17,name:"THERMAL GOGGLES",box:1,num:1,msg:"THERMAL GOGGLE"},
{idx:18,name:"NV GOGGLES",box:1,num:1,msg:"NIGHT VISION GOGGLE"},
{idx:19,name:"MINE DETECTOR",box:1,num:1,msg:"MINE DETECTOR"},
{idx:20,name:"BODY ARMOR",box:1,num:1,msg:"BODY ARMOR"},
{idx:21,name:"ROPE",box:1,num:1,msg:"ROPE"},
{idx:23,name:"CARDBOARD BOX A",box:1,num:1,msg:"CARDBOARD BOX/A"},
{idx:2,name:"CARDBOARD BOX B",box:1,num:1,msg:"CARDBOARD BOX/B"},
{idx:3,name:"CARDBOARD BOX C",box:1,num:1,msg:"CARDBOARD BOX/C"},
{idx:5,name:"GAS MASK",box:1,num:1,msg:"GAS MASK"}];
var resizeTarget=null,resizeEnd=null,resizeDragging=false;
var handleObjs=[];
var routeDragging=false,routeDragRI=-1,routeDragWI=-1;
var showNavZones=false,selNavZone=-1,navZoneObjs=[],navConnObjs=[];
var newNavZones=[];
var showFOV=false;
var selGCLSpawn=false;
// For INFRARED_CENSOR: which endpoint of the beam the gizmo edits.
//   0 = endpoint A (ent.pos)
//   1 = endpoint B (ent.beamEnd)
// Only meaningful when an IR sensor is selected. Defaults to A on every new selection.
var selGCLEndpoint=0;
var spawnPendingIdx=-1;
var surfYMode=false,lastSurfY=0,lastSurfAi=0;
// Experimental: allow injecting textured walls into chain-coordinator KMDs (like 02a.kmd)
// Default OFF — these injections typically crash the game. Toggle in toolbar to try anyway.
// (experimentalChainInject removed; 128-vert-per-block limit is the real engine constraint, enforced in encoder)
var gclProcs=[];var procPanelOpen=false;
// HZD zones parsed from GCL "hzd" commands — maps zone name to KMD list + HZM area index
// Example: gclHzdZones = { main: {kmds:['02a','02a_r4','02a_r7'], hzmArea:3, zone:0}, ELEVATOR:{...} }
var gclHzdZones={};
var navPaintActive=false,navPaintErase=false,navPaintLastPt=null,navPaintChain=[];
var navPaintSpacing=800,navPaintEraseTargets=new Set();// spacing 800, zones ~1000x1000
var boxSelMode=false;

// ==================== HZM PARSER ====================
function parseHZM(buf){
var v=new DataView(buf),d=new Uint8Array(buf);
var ver=v.getInt16(0,true),minx=v.getInt16(2,true),miny=v.getInt16(4,true),maxx=v.getInt16(6,true),maxy=v.getInt16(8,true);
var ac=v.getUint16(10,true),nz=v.getInt16(12,true),nr=v.getInt16(14,true);
var rwp=v.getUint32(0x14,true),rtb=v.getUint32(0x18,true);
var areas=[];
for(var i=0;i<ac;i++){var o=0x1c+i*24;
var zc=v.getUint16(o,true),nc=v.getUint16(o+2,true),fc=v.getUint16(o+4,true),gc=v.getUint16(o+6,true);
var no=v.getUint32(o+8,true),fo=v.getUint32(o+12,true),zo=v.getUint32(o+16,true),go=v.getUint32(o+20,true);
var nfs=[],wFlags=[],wLayers=[];
for(var n=0;n<nc;n++){var p=no+n*16;
nfs.push({idx:n,ai:i,off:p,x1:v.getInt16(p,true),z1:v.getInt16(p+2,true),y1:v.getInt16(p+4,true),h1:v.getUint16(p+6,true),
x2:v.getInt16(p+8,true),z2:v.getInt16(p+10,true),y2:v.getInt16(p+12,true),h2:v.getUint16(p+14,true)})}
for(var wi=0;wi<nc;wi++)wFlags.push(d[go+wi]);
var gridPad1=nc%2==1?d[go+nc]:0;
var lo=go+nc+(nc%2==1?1:0);for(wi=0;wi<nc;wi++)wLayers.push(d[lo+wi]);
var gridPad2=nc%2==1?d[lo+nc]:0;
var fls=[];for(var f=0;f<fc;f++){var fp=fo+f*48;var fq=[];
for(var q=0;q<6;q++)fq.push({x:v.getInt16(fp+q*8,true),z:v.getInt16(fp+q*8+2,true),y:v.getInt16(fp+q*8+4,true),h:v.getUint16(fp+q*8+6,true)});
fls.push({idx:f,ai:i,off:fp,quads:fq})}
var zns=[];for(var z=0;z<zc;z++){var zp=zo+z*32;var nm="";var nmRaw=[];
for(var bi=0;bi<14;bi++){var ch=d[zp+16+bi];nmRaw.push(ch);if(ch===0&&nm.length===0){} 
if(ch>=32&&ch<127)nm+=String.fromCharCode(ch)}
zns.push({idx:z,ai:i,x1:v.getInt16(zp,true),z1:v.getInt16(zp+2,true),y1:v.getInt16(zp+4,true),h1:v.getUint16(zp+6,true),
x2:v.getInt16(zp+8,true),z2:v.getInt16(zp+10,true),y2:v.getInt16(zp+12,true),h2:v.getUint16(zp+14,true),
// HZD_TRP layout (from libhzd fmt_hzd.h): name[12] at 16-27, id1/id2 at 28-29, name_id at 30-31.
// We previously read id1/id2 from 30-31 which was WRONG (those are name_id).
// id2==0xFF is the engine's CAMERA marker (HZD_MakeHandler uses this to find the camera region).
name:nm,nameRaw:nmRaw,id1:d[zp+28],id2:d[zp+29],nameIdRaw:v.getUint16(zp+30,true)})}
areas.push({nc:nc,fc:fc,zc:zc,gc:gc,go:go,no:no,fo:fo,zo:zo,navfaces:nfs,wFlags:wFlags,wLayers:wLayers,gridPad1:gridPad1,gridPad2:gridPad2,floors:fls,zones:zns})}
// Parse nav zones (global navmesh sectors)
var nzOff=v.getUint32(0x14,true);var nzCount=v.getInt16(0x0c,true);
var navZones=[];
for(var nzi2=0;nzi2<nzCount;nzi2++){var nzo=nzOff+nzi2*24;if(nzo+24>buf.byteLength)break;
var nzx=v.getInt16(nzo,true),nzz=v.getInt16(nzo+2,true),nzy=v.getInt16(nzo+4,true);
var nzw=v.getInt16(nzo+6,true),nzh2=v.getInt16(nzo+8,true);
var nzNears=[],nzDists=[];
for(var nb2=0;nb2<6;nb2++){nzNears.push(d[nzo+10+nb2]);nzDists.push(d[nzo+16+nb2])}
var nzPad=v.getInt16(nzo+22,true);
navZones.push({x:nzx,z:nzz,y:nzy,w:nzw,h:nzh2,nears:nzNears,dists:nzDists,pad:nzPad})}
// Parse routes. Always emit 32 slots — empty stages (no route table) still need
// the slots so the user can create new routes from scratch via the route editor.
// If rtb is 0 or invalid, all 32 slots come back empty.
var routes=[];
var rtbValid=(rtb>0&&rtb+32*8<=buf.byteLength);
for(var ri=0;ri<32;ri++){
var rc2=0,ro=0;
if(rtbValid){
var rp=rtb+ri*8;
rc2=v.getUint32(rp,true);
ro=v.getUint32(rp+4,true);}
var wps=[];
if(rc2>0&&rc2<10000&&ro>0&&ro<buf.byteLength){
for(var wi2=0;wi2<rc2;wi2++){var wp=ro+wi2*8;if(wp+8>buf.byteLength)break;
wps.push({x:v.getInt16(wp,true),z:v.getInt16(wp+2,true),y:v.getInt16(wp+4,true),dir:v.getUint16(wp+6,true)})}}
routes.push({idx:ri,count:rc2<10000?rc2:0,waypoints:wps,origOff:ro})}
return{buf:buf.slice(0),size:buf.byteLength,ac:ac,areas:areas,ver:ver,minx:minx,miny:miny,maxx:maxx,maxy:maxy,nz:nz,nr:nr,
routeData:buf.slice(nzOff),routeOff:nzOff,routeTblOff:rtb,routes:routes,navZones:navZones,nzOff:nzOff,nzCount:nzCount}}

// ==================== HZM EXPORT ====================
function rebuildHZM(){
var hdr=new ArrayBuffer(0x1c);var hv=new DataView(hdr);
hv.setInt16(0,hzm.ver,true);hv.setInt16(2,hzm.minx,true);hv.setInt16(4,hzm.miny,true);
hv.setInt16(6,hzm.maxx,true);hv.setInt16(8,hzm.maxy,true);
hv.setUint16(10,hzm.ac,true);hv.setInt16(12,hzm.nz,true);hv.setInt16(14,hzm.nr,true);
hv.setUint32(0x10,0x1c,true);
var cursor=0x1c+hzm.ac*24,areaDescs=[];
for(var ai=0;ai<hzm.ac;ai++){
var area=hzm.areas[ai],kW=[],kF2=[],kL=[];
for(var wi=0;wi<area.navfaces.length;wi++){var k=ai+"-"+wi;
if(colW[k]){kW.push({x1:30000,z1:30000,y1:0,h1:area.navfaces[wi].h1,x2:30100,z2:30100,y2:0,h2:area.navfaces[wi].h2});
kF2.push(area.wFlags[wi]);kL.push(area.wLayers[wi])}
else{kW.push(area.navfaces[wi]);kF2.push(area.wFlags[wi]);kL.push(area.wLayers[wi])}}
for(var ni=0;ni<newW.length;ni++){var nw1=newW[ni];
// Only add this wall to its target area (defaults to area 0 if unspecified)
if((nw1.targetAi||0)!==ai)continue;
var nx1=nw1.x1,nz1=nw1.z1,ny1=nw1.y1,nx2=nw1.x2,nz2=nw1.z2,ny2=nw1.y2;
if(nw1.renderOnly)continue;// textured copy of existing HZM wall — skip in HZM output
if(nx1>nx2){var tx=nx1,tz=nz1,ty=ny1;nx1=nx2;nz1=nz2;ny1=ny2;nx2=tx;nz2=tz;ny2=ty}
var wh=nw1.h||2000;kW.push({x1:nx1,z1:nz1,y1:ny1,h1:wh,x2:nx2,z2:nz2,y2:ny2,h2:wh});kF2.push(nw1.flags||0);kL.push(0)}
var kFloors=[];
for(var fi=0;fi<area.floors.length;fi++){if(!colF[ai+"-"+fi])kFloors.push(area.floors[fi])}
for(var nfi=0;nfi<newF.length;nfi++){if(newF[nfi].renderOnly)continue;if((newF[nfi].targetAi||0)!==ai)continue;kFloors.push(newF[nfi])}
// Zones: keep existing + new
// CRITICAL ORDERING: vanilla HZM zone arrays are split into two regions:
//   1) TRAP zones (id2 != 0xFF, usually 0x00 or 0x20 from name padding) — come FIRST
//   2) CAMERA zones (id2 == 0xFF as a marker) — come AFTER
// 
// The engine's HZD_MakeHandler walks zones from the start, stopping at first id2==0xFF
// (first camera). Trap iteration uses n_triggers - n_cameras items from the start.
// So new trap zones MUST be inserted BEFORE the cameras section — pushing them at
// the end means they fall into the camera region and are never checked as traps.
//
// We find the split point (first existing zone with id2==0xFF) and insert new
// trap zones there. If no cameras exist, insert at the end (all traps, no change).
var kZones=[];
// First collect existing zones (skipping any user-deleted)
var existingZones=[];
for(var zi2=0;zi2<area.zones.length;zi2++){if(!colZ[ai+"-"+zi2])existingZones.push(area.zones[zi2])}
// Find the first camera (id2 == 0xFF) in the existing zones — that's our insertion point
var firstCameraIdx=existingZones.length;// default: append at end if no cameras
for(var fci=0;fci<existingZones.length;fci++){
if(existingZones[fci].id2===0xFF){firstCameraIdx=fci;break;}}
// Build the final zone array: pre-camera traps + NEW traps + cameras
for(var k=0;k<firstCameraIdx;k++)kZones.push(existingZones[k]);
for(var nzi=0;nzi<newZ.length;nzi++)kZones.push(newZ[nzi]);
for(var k=firstCameraIdx;k<existingZones.length;k++)kZones.push(existingZones[k]);
var tw=kW.length,tf=kFloors.length,tz2=kZones.length;
var navOff=cursor,navSz=tw*16;
var gridOff=navOff+navSz,gfSz=tw,gp1=tw%2==1?1:0,glSz=tw,gp2=tw%2==1?1:0,gridSz=gfSz+gp1+glSz+gp2;
var floorOff=gridOff+gridSz,floorSz=tf*48;
var zoneOff=floorOff+floorSz,zoneSz=tz2*32;
cursor=zoneOff+zoneSz;
areaDescs.push({zc:tz2,nc:tw,fc:tf,gc:area.gc+newW.length,navOff:navOff,floorOff:floorOff,zoneOff:zoneOff,gridOff:gridOff,
walls:kW,flags:kF2,layers:kL,floors:kFloors,zones:kZones,gridPad1:area.gridPad1||0,gridPad2:area.gridPad2||0})}
// Route: rebuild with modified nav zones + new nav zones
var rwpOff=cursor;
var origNZCount=hzm.nzCount;
var newNZCount=origNZCount+newNavZones.length;
// NEW APPROACH: rebuild the entire route data block instead of copying vanilla and patching.
// This lets us add/remove waypoints freely (the old in-place patch couldn't grow routes).
// Layout:
//   [rwpOff]        nav zones        (newNZCount * 24 bytes)
//   [routeTblNew]   route table      (32 entries * 8 bytes = 256 bytes)
//   [wpDataStart]   waypoint data    (variable per route)
var nzBlockBytes=newNZCount*24;
var routeTblNew=rwpOff+nzBlockBytes;
var wpDataStart=routeTblNew+32*8;
// Pre-compute per-route waypoint offsets in the new layout
var routeOffsetsNew=new Array(hzm.routes.length);
var wpCursor=wpDataStart;
for(var ri9=0;ri9<hzm.routes.length;ri9++){
if(hzm.routes[ri9].waypoints.length>0){
routeOffsetsNew[ri9]=wpCursor;
wpCursor+=hzm.routes[ri9].waypoints.length*8;
}else{routeOffsetsNew[ri9]=0;}}
var totalSz=wpCursor;
var out=new ArrayBuffer(totalSz);var ov=new DataView(out);var od=new Uint8Array(out);
od.set(new Uint8Array(hdr),0);
ov.setUint32(0x14,rwpOff,true);
ov.setUint32(0x18,routeTblNew,true);
ov.setInt16(0x0c,newNZCount,true);
// Write area descriptors + data
for(var ai2=0;ai2<areaDescs.length;ai2++){var ad=areaDescs[ai2],ao=0x1c+ai2*24;
ov.setUint16(ao,ad.zc,true);ov.setUint16(ao+2,ad.nc,true);ov.setUint16(ao+4,ad.fc,true);ov.setUint16(ao+6,ad.gc,true);
ov.setUint32(ao+8,ad.navOff,true);ov.setUint32(ao+12,ad.floorOff,true);ov.setUint32(ao+16,ad.zoneOff,true);ov.setUint32(ao+20,ad.gridOff,true);
for(wi=0;wi<ad.walls.length;wi++){var w=ad.walls[wi],wo=ad.navOff+wi*16;
ov.setInt16(wo,w.x1,true);ov.setInt16(wo+2,w.z1,true);ov.setInt16(wo+4,w.y1,true);ov.setUint16(wo+6,w.h1,true);
ov.setInt16(wo+8,w.x2,true);ov.setInt16(wo+10,w.z2,true);ov.setInt16(wo+12,w.y2,true);ov.setUint16(wo+14,w.h2,true)}
for(fi=0;fi<ad.flags.length;fi++)od[ad.gridOff+fi]=ad.flags[fi];
if(ad.flags.length%2==1)od[ad.gridOff+ad.flags.length]=ad.gridPad1||0;
var layOff=ad.gridOff+ad.flags.length+(ad.flags.length%2==1?1:0);
for(var li=0;li<ad.layers.length;li++)od[layOff+li]=ad.layers[li];
if(ad.layers.length%2==1)od[layOff+ad.layers.length]=ad.gridPad2||0;
for(fi=0;fi<ad.floors.length;fi++){var fl=ad.floors[fi],flo=ad.floorOff+fi*48;
if(fl.quads){for(var q2=0;q2<6;q2++){ov.setInt16(flo+q2*8,fl.quads[q2].x,true);ov.setInt16(flo+q2*8+2,fl.quads[q2].z,true);
ov.setInt16(flo+q2*8+4,fl.quads[q2].y,true);ov.setUint16(flo+q2*8+6,fl.quads[q2].h,true)}}
else if(fl.ramp){
// Sloped new floor — compute corner Ys and h normal-coefficients per the discovered formula
var rLo=fl.ramp.lo,rHi=fl.ramp.hi,rAxis=fl.ramp.axis;
var rDx=fl.x2-fl.x1,rDz=fl.z2-fl.z1;
var p1y,p2y,p3y,p4y,p1h=0,p2h=0,p3h=0,p4h=0;
function _nrm(axL,dy){var L=Math.sqrt(axL*axL+dy*dy);if(L===0)return[0,256];return[Math.round(-dy/L*256),Math.round(axL/L*256)];}
if(rAxis==="x"){p1y=rLo;p4y=rLo;p2y=rHi;p3y=rHi;var nA=_nrm(rDx,rHi-rLo);p1h=nA[0]&0xFFFF;p3h=nA[1]&0xFFFF;}
else if(rAxis==="-x"){p1y=rHi;p4y=rHi;p2y=rLo;p3y=rLo;var nB=_nrm(rDx,rLo-rHi);p1h=nB[0]&0xFFFF;p3h=nB[1]&0xFFFF;}
else if(rAxis==="z"){p1y=rLo;p2y=rLo;p3y=rHi;p4y=rHi;var nC=_nrm(rDz,rHi-rLo);p2h=nC[0]&0xFFFF;p3h=nC[1]&0xFFFF;}
else{p1y=rHi;p2y=rHi;p3y=rLo;p4y=rLo;var nD=_nrm(rDz,rLo-rHi);p2h=nD[0]&0xFFFF;p3h=nD[1]&0xFFFF;}
var minY=Math.min(rLo,rHi),maxY=Math.max(rLo,rHi);
// bbox b1,b2
// CRITICAL: b1.h bit 1 (=2) means "USE FLAT Y, SKIP SLOPE INTERPOLATION".
// For ramps we must NOT set bit 1. We set bit 0 (=1) "always-inside" and clear bit 1.
// Common vanilla sloped pattern: 1 (just bit 0). We use that.
ov.setInt16(flo,fl.x1,true);ov.setInt16(flo+2,fl.z1,true);ov.setInt16(flo+4,minY,true);ov.setUint16(flo+6,1,true);
ov.setInt16(flo+8,fl.x2,true);ov.setInt16(flo+10,fl.z2,true);ov.setInt16(flo+12,maxY,true);ov.setUint16(flo+14,0,true);
// p1 (x1,z1)
ov.setInt16(flo+16,fl.x1,true);ov.setInt16(flo+18,fl.z1,true);ov.setInt16(flo+20,p1y,true);ov.setUint16(flo+22,p1h,true);
// p2 (x2,z1)
ov.setInt16(flo+24,fl.x2,true);ov.setInt16(flo+26,fl.z1,true);ov.setInt16(flo+28,p2y,true);ov.setUint16(flo+30,p2h,true);
// p3 (x2,z2)
ov.setInt16(flo+32,fl.x2,true);ov.setInt16(flo+34,fl.z2,true);ov.setInt16(flo+36,p3y,true);ov.setUint16(flo+38,p3h,true);
// p4 (x1,z2)
ov.setInt16(flo+40,fl.x1,true);ov.setInt16(flo+42,fl.z2,true);ov.setInt16(flo+44,p4y,true);ov.setUint16(flo+46,p4h,true);}
else{ov.setInt16(flo,fl.x1,true);ov.setInt16(flo+2,fl.z1,true);ov.setInt16(flo+4,fl.y1,true);ov.setUint16(flo+6,3,true);
ov.setInt16(flo+8,fl.x2,true);ov.setInt16(flo+10,fl.z2,true);ov.setInt16(flo+12,fl.y1,true);ov.setUint16(flo+14,0,true);
ov.setInt16(flo+16,fl.x1,true);ov.setInt16(flo+18,fl.z1,true);ov.setInt16(flo+20,fl.y1,true);ov.setUint16(flo+22,0,true);
ov.setInt16(flo+24,fl.x2,true);ov.setInt16(flo+26,fl.z1,true);ov.setInt16(flo+28,fl.y1,true);ov.setUint16(flo+30,0,true);
ov.setInt16(flo+32,fl.x2,true);ov.setInt16(flo+34,fl.z2,true);ov.setInt16(flo+36,fl.y1,true);ov.setUint16(flo+38,255,true);
ov.setInt16(flo+40,fl.x1,true);ov.setInt16(flo+42,fl.z2,true);ov.setInt16(flo+44,fl.y1,true);ov.setUint16(flo+46,0,true)}}
for(zi2=0;zi2<ad.zones.length;zi2++){var zn=ad.zones[zi2],zno=ad.zoneOff+zi2*32;
ov.setInt16(zno,zn.x1,true);ov.setInt16(zno+2,zn.z1,true);ov.setInt16(zno+4,zn.y1,true);ov.setUint16(zno+6,zn.h1||0,true);
ov.setInt16(zno+8,zn.x2,true);ov.setInt16(zno+10,zn.z2,true);ov.setInt16(zno+12,zn.y2,true);ov.setUint16(zno+14,zn.h2||0,true);
// Name occupies bytes 16-27 (12 bytes). For backward compatibility with the
// parser that historically read 14 bytes (16-29), we still emit up to 14
// characters into the name field — bytes 28-29 are nominally id1/id2 but
// often serve as name padding in vanilla files. The runtime engine reads
// id2 at offset 29 to detect cameras (id2==0xFF). For NEW trap zones, we
// keep id1/id2 = 0 (or whatever name padding produces), which is fine
// because the engine treats anything != 0xFF as "not a camera = is a trap".
for(var nb=0;nb<14;nb++){od[zno+16+nb]=zn.nameRaw?zn.nameRaw[nb]||0:(zn.name&&nb<zn.name.length?zn.name.charCodeAt(nb):0)}
// If the zone explicitly sets id1/id2 (e.g., 0xFF for camera marker), honor it.
// Otherwise leave whatever the name field wrote at 28-29.
if(zn.id1!==undefined)od[zno+28]=zn.id1;
if(zn.id2!==undefined)od[zno+29]=zn.id2;
// name_id at 30-31 — runtime placeholder, always 0xFFFF
ov.setUint16(zno+30,zn.nameIdRaw!==undefined?zn.nameIdRaw:0xFFFF,true);}}
// Write nav zones at rwpOff
if(hzm.navZones){for(var nzi3=0;nzi3<hzm.navZones.length;nzi3++){var nzp=rwpOff+nzi3*24;
var nzd=hzm.navZones[nzi3];
ov.setInt16(nzp,nzd.x,true);ov.setInt16(nzp+2,nzd.z,true);ov.setInt16(nzp+4,nzd.y,true);
ov.setInt16(nzp+6,nzd.w,true);ov.setInt16(nzp+8,nzd.h,true);
for(var nb4=0;nb4<6;nb4++){od[nzp+10+nb4]=nzd.nears[nb4];od[nzp+16+nb4]=nzd.dists[nb4]}
ov.setInt16(nzp+22,nzd.pad,true)}}
for(var nni=0;nni<newNavZones.length;nni++){var nnzp=rwpOff+hzm.navZones.length*24+nni*24;
var nnzd=newNavZones[nni];
ov.setInt16(nnzp,nnzd.x,true);ov.setInt16(nnzp+2,nnzd.z,true);ov.setInt16(nnzp+4,nnzd.y,true);
ov.setInt16(nnzp+6,nnzd.w,true);ov.setInt16(nnzp+8,nnzd.h,true);
for(nb4=0;nb4<6;nb4++){od[nnzp+10+nb4]=nnzd.nears[nb4];od[nnzp+16+nb4]=nnzd.dists[nb4]}
ov.setInt16(nnzp+22,nnzd.pad||0,true)}
// Write route table (32 entries, count + offset each)
for(var rti=0;rti<32;rti++){var rtp=routeTblNew+rti*8;
if(rti<hzm.routes.length&&hzm.routes[rti].waypoints.length>0){
ov.setUint32(rtp,hzm.routes[rti].waypoints.length,true);
ov.setUint32(rtp+4,routeOffsetsNew[rti],true);}
else{
// Empty route: preserve original count + offset bytes for byte-perfect round-trip.
// The engine ignores empty routes, but preserving the leftover values means our clean
// re-export of an unmodified HZM produces an identical file.
ov.setUint32(rtp,0,true);
ov.setUint32(rtp+4,(rti<hzm.routes.length?(hzm.routes[rti].origOff||0):0),true);}}
// Write waypoint data
for(var ri=0;ri<hzm.routes.length;ri++){var rt2=hzm.routes[ri];if(rt2.waypoints.length===0)continue;
var base=routeOffsetsNew[ri];
for(var wi5=0;wi5<rt2.waypoints.length;wi5++){var wp=rt2.waypoints[wi5];var wpo=base+wi5*8;
ov.setInt16(wpo,wp.x,true);ov.setInt16(wpo+2,wp.z,true);
ov.setInt16(wpo+4,wp.y,true);ov.setUint16(wpo+6,wp.dir,true)}}
return out}


// ===== RAMP → STAIRS CONVERTER =====
// Subdivides a sloped floor into N flat tread floors + N riser walls. The user
// supplies a target step rise (default 250u); we compute step count from the
// ramp's height delta. Treads inherit the original floor's texture; risers
// take the user-chosen riser texture (or fall back to the same texture if none
// is set).
//
// Returns {treads:int, risers:int, removedRamp:bool} on success, or an error
// message string on failure. The caller is responsible for triggering a rebuild
// and undo log entry.
function convertRampToStairs(floorIdx,stepRise,riserTexHash){
if(floorIdx<0||floorIdx>=newF.length)return"floor index out of range";
var fl=newF[floorIdx];
if(!fl.ramp)return"selected floor is not a ramp (use the ramp tool first, or pick a sloped floor)";
stepRise=Math.max(20,Math.abs(stepRise||80));// guard against zero/negative; vanilla MGS stairs are tight (~50-80u rise)
var lo=fl.ramp.lo,hi=fl.ramp.hi,axis=fl.ramp.axis;
var totalRise=Math.abs(hi-lo);
if(totalRise<stepRise)return"ramp rise ("+totalRise+") smaller than step rise ("+stepRise+") — nothing to do";
var nSteps=Math.max(2,Math.round(totalRise/stepRise));
// Build N treads. Axis tells us which direction the ramp climbs:
//   "x":  lo @ x1, hi @ x2; treads stack along X with width = (x2-x1)/N
//   "-x": hi @ x1, lo @ x2; treads stack reversed
//   "z":  lo @ z1, hi @ z2; treads stack along Z
//   "-z": hi @ z1, lo @ z2; treads stack reversed
var texHash=(fl.texHash!==undefined&&fl.texHash>=0)?fl.texHash:-1;
var rTex=(riserTexHash!==undefined&&riserTexHash>=0)?riserTexHash:texHash;
var x1=fl.x1,x2=fl.x2,z1=fl.z1,z2=fl.z2;
var newFloors=[],newWalls=[];
function _mkTread(tx1,tz1,tx2,tz2,ty){
return{x1:Math.round(tx1),z1:Math.round(tz1),x2:Math.round(tx2),z2:Math.round(tz2),
y1:Math.round(ty),h:0,flags:0,texHash:texHash};}
function _mkRiser(rx1,rz1,ry1,rx2,rz2,rh){
return{x1:Math.round(rx1),z1:Math.round(rz1),y1:Math.round(ry1),
x2:Math.round(rx2),z2:Math.round(rz2),y2:Math.round(ry1),
h:Math.round(rh),flags:0,texHash:rTex};}
for(var s=0;s<nSteps;s++){
// Step Y: lo + (s+1) * (totalRise/nSteps) — flat top of the s-th tread.
// (We use the END height of each tread so the top tread reaches `hi`.)
var stepFrac=(s+0.5)/nSteps;// midpoint Y for the tread top
var lowFrac=s/nSteps,highFrac=(s+1)/nSteps;
var treadY,segStart,segEnd;
if(axis==="x"){
treadY=Math.round(lo+(hi-lo)*highFrac);// tread sits at "next" height
segStart=x1+(x2-x1)*lowFrac;segEnd=x1+(x2-x1)*highFrac;
newFloors.push(_mkTread(segStart,z1,segEnd,z2,treadY));
// Riser: vertical wall at segStart (the boundary between this step and the lower one)
if(s>0){var prevY=Math.round(lo+(hi-lo)*lowFrac);var rH=treadY-prevY;
newWalls.push(_mkRiser(segStart,z1,prevY,segStart,z2,Math.abs(rH)));}}
else if(axis==="-x"){
treadY=Math.round(hi-(hi-lo)*highFrac);
segStart=x1+(x2-x1)*lowFrac;segEnd=x1+(x2-x1)*highFrac;
newFloors.push(_mkTread(segStart,z1,segEnd,z2,treadY));
if(s>0){var prevYa=Math.round(hi-(hi-lo)*lowFrac);var rHa=prevYa-treadY;
newWalls.push(_mkRiser(segStart,z1,treadY,segStart,z2,Math.abs(rHa)));}}
else if(axis==="z"){
treadY=Math.round(lo+(hi-lo)*highFrac);
segStart=z1+(z2-z1)*lowFrac;segEnd=z1+(z2-z1)*highFrac;
newFloors.push(_mkTread(x1,segStart,x2,segEnd,treadY));
if(s>0){var prevYb=Math.round(lo+(hi-lo)*lowFrac);var rHb=treadY-prevYb;
newWalls.push(_mkRiser(x1,segStart,prevYb,x2,segStart,Math.abs(rHb)));}}
else{// -z
treadY=Math.round(hi-(hi-lo)*highFrac);
segStart=z1+(z2-z1)*lowFrac;segEnd=z1+(z2-z1)*highFrac;
newFloors.push(_mkTread(x1,segStart,x2,segEnd,treadY));
if(s>0){var prevYc=Math.round(hi-(hi-lo)*lowFrac);var rHc=prevYc-treadY;
newWalls.push(_mkRiser(x1,segStart,treadY,x2,segStart,Math.abs(rHc)));}}}
// Remove the original ramp and append the new geometry
newF.splice(floorIdx,1);
for(var fii=0;fii<newFloors.length;fii++)newF.push(newFloors[fii]);
for(var wii=0;wii<newWalls.length;wii++)newW.push(newWalls[wii]);
return{treads:newFloors.length,risers:newWalls.length,removedRamp:true};}

// ============================================================
