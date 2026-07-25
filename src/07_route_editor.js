// ═══════════════════════════════════════════════════════════════════════════
// FILE: 07_route_editor.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// ROUTE EDITOR
// ============================================================
// Functionality for building patrol routes from scratch and managing them.
// The legacy `updateRouteList` in 03_ui.js is overridden here with a richer version
// that shows usage counts, per-route actions, and a "Create new route" button.

// State for the "place waypoints" tool. When placeRouteMode is true, left-clicks
// in the viewport add a waypoint to the route being built. Esc or right-click finishes.
var placeRouteMode=false;
var placeRouteIdx=-1;// which route we're building into

// ====================== ROUTE USAGE ANALYSIS ======================
// Returns a map: { routeIdx -> [entity references that use this route] }
// Used to display "in use by 3" badges and to highlight cross-references.
function getRouteUsage(){
var usage={};
if(!hzm||!hzm.routes)return usage;
for(var i=0;i<gclEntities.length;i++){
var e=gclEntities[i];
if(e.type==="WATCHER"&&e.route!==undefined){
if(!usage[e.route])usage[e.route]=[];
usage[e.route].push(e);}}
return usage;}

// ====================== ROUTE LIST PANEL ======================
// Override the basic route list with one that shows usage and per-route actions.
function updateRouteList(){
var p=document.getElementById("routeListPanel");if(!p||!hzm)return;
var usage=getRouteUsage();
// Use the shared collapsible panel header so this panel can be hidden like others.
// Count non-empty routes for the title.
var nonEmptyTotal=0;
for(var ic=0;ic<hzm.routes.length;ic++)if(hzm.routes[ic].waypoints.length>0)nonEmptyTotal++;
var headerExtra='';
if(placeRouteMode){
headerExtra='<span style="color:#ffcc44;font-size:9px;margin-left:6px">PLACING — Esc to finish</span>';}
var html=panelHeader("routes","Routes ("+nonEmptyTotal+")","#00ff88",headerExtra);
// If collapsed, stop here — render only the header
if(panelCollapsed["routes"]){p.innerHTML=html;return;}
// Action buttons row (top-of-panel controls)
html+='<div style="padding:4px;display:flex;align-items:center;gap:4px">';
if(placeRouteMode){
html+='<span style="color:#ffcc44;font-size:9px">PLACING: route '+placeRouteIdx+' ('+(hzm.routes[placeRouteIdx]?hzm.routes[placeRouteIdx].waypoints.length:0)+' WPs) — Esc/right-click to finish</span>';}
else{
html+='<button onclick="newRoute()" class="btn" style="font-size:9px;color:#44ccaa" title="Find empty route slot and start placing waypoints">+ New Route</button>';}
html+='</div>';
html+='<div style="max-height:300px;overflow-y:auto">';
// Show routes that have waypoints, plus an "Empty slots" summary at the end
var nonEmptyCount=0;
for(var i=0;i<hzm.routes.length;i++){var rt=hzm.routes[i];
if(rt.waypoints.length===0)continue;
nonEmptyCount++;
var isSel=selRoute===i;
var users=usage[i]||[];
var userTxt=users.length>0?users.map(function(u){return u.name}).join(", "):'<span style="color:#665522">unused</span>';
html+='<div style="padding:3px 6px;border-bottom:1px solid #112;'+(isSel?'background:#112211':'')+'">';
html+='<div onclick="selectRoute('+i+')" ondblclick="focusRoute('+i+')" style="cursor:pointer;color:'+(isSel?'#ffffff':'#00ff88')+'">';
html+='<b>Route '+i+'</b> <span style="color:#446688;font-size:9px">('+rt.waypoints.length+' WPs)</span>';
html+='<span style="color:#88aacc;font-size:9px;margin-left:6px">→ '+userTxt+'</span>';
// Patrol cycle time estimate (rough — based on assumed walk speed)
var pt=computePatrolTime(i);
if(pt&&pt.time>0){html+='<span style="color:#778899;font-size:9px;margin-left:6px">≈'+pt.str+'</span>';}
html+='</div>';
if(isSel){
// Action buttons for selected route
html+='<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">';
html+='<button onclick="appendToRoute('+i+')" class="btn" style="font-size:9px;color:#44ccaa" title="Continue placing waypoints on this route">+ Add WPs</button>';
html+='<button onclick="reverseRoute('+i+')" class="btn" style="font-size:9px" title="Flip patrol direction (start↔end)">⇄ Reverse</button>';
html+='<button onclick="mirrorRoute('+i+',\'x\')" class="btn" style="font-size:9px" title="Mirror across X axis (flips Z values)">↔X</button>';
html+='<button onclick="mirrorRoute('+i+',\'z\')" class="btn" style="font-size:9px" title="Mirror across Z axis (flips X values)">↔Z</button>';
html+='<button onclick="duplicateRoute('+i+')" class="btn" style="font-size:9px;color:#aaccff" title="Copy to next empty slot">⎘ Duplicate</button>';
html+='<button onclick="snapRouteToFloor('+i+')" class="btn" style="font-size:9px;color:#ccaa88" title="Snap all waypoints Y to floor below">↓ Snap Y</button>';
html+='<button onclick="deleteRoute('+i+')" class="btn danger" style="font-size:9px" title="Clear all waypoints (slot stays for reuse)">× Delete</button>';
html+='</div>';}
html+='</div>';}
if(nonEmptyCount===0){
html+='<div style="padding:6px;color:#665522;font-size:9px;text-align:center">No routes defined yet. Click "+ New Route" to create one.</div>';}
// Count of empty slots available
var emptySlots=0;
for(var i2=0;i2<hzm.routes.length;i2++)if(hzm.routes[i2].waypoints.length===0)emptySlots++;
html+='<div style="padding:4px 6px;color:#446688;font-size:9px;text-align:center;border-top:1px solid #112">';
html+=emptySlots+' empty slot'+(emptySlots===1?"":"s")+' available (of '+hzm.routes.length+' total)';
html+='</div></div>';
p.innerHTML=html;}

// ====================== ROUTE OPERATIONS ======================

// Create a new route: find the first empty slot, switch to placement mode.
function newRoute(){
if(!hzm){alert("Load an HZM first");return;}
// Stages with no original route table (e.g. s17a) end up with hzm.routes empty.
// Grow it to the full 32-slot capacity so we have somewhere to put new routes.
if(!hzm.routes)hzm.routes=[];
while(hzm.routes.length<32){
hzm.routes.push({idx:hzm.routes.length,count:0,waypoints:[],origOff:0});}
// Find first empty slot
var slot=-1;
for(var i=0;i<hzm.routes.length;i++){
if(hzm.routes[i].waypoints.length===0){slot=i;break;}}
if(slot<0){alert("No empty route slots available — delete an unused route first");return;}
placeRouteIdx=slot;
placeRouteMode=true;
selRoute=slot;selWP=-1;
// Use the existing "click" tool for raycasting; we'll intercept clicks while placeRouteMode is true
setT("click");
document.getElementById("coordinfo").textContent="PLACEMENT MODE — Left-click in viewport to add waypoints to route "+slot+". Esc or right-click to finish.";
updateRouteList();rebuild();}

// Continue placing waypoints on an existing route.
function appendToRoute(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
placeRouteIdx=ri;
placeRouteMode=true;
selRoute=ri;selWP=hzm.routes[ri].waypoints.length-1;
setT("click");
document.getElementById("coordinfo").textContent="PLACEMENT MODE — Left-click to add more waypoints to route "+ri+". Esc to finish.";
updateRouteList();}

// Exit placement mode without breaking anything.
function exitPlaceRouteMode(){
if(!placeRouteMode)return;
var addedCount=hzm.routes[placeRouteIdx]?hzm.routes[placeRouteIdx].waypoints.length:0;
placeRouteMode=false;placeRouteIdx=-1;
document.getElementById("coordinfo").textContent="Route placement finished. "+addedCount+" waypoints in route "+selRoute+".";
logUndo("add","Place WPs in route");
updateRouteList();rebuild();showProps();}

// Called by the viewport mouseup handler when in placement mode.
// pt is the world-space hit point (already snapped).
function placeRouteWaypointAt(pt){
if(!placeRouteMode||placeRouteIdx<0)return false;
if(!hzm.routes[placeRouteIdx])return false;
var rt=hzm.routes[placeRouteIdx];
// Convert from three.js coords (×S) back to engine ints
var wx=Math.round(pt.x/S),wz=Math.round(pt.z/S),wy=Math.round(pt.y/S);
// Default command word: face whichever cardinal direction is closest to the previous→new
// vector. The waypoint's "dir" field is actually a packed COMMAND word with bits 8-9
// holding the cardinal direction index (0=N, 1=E, 2=S, 3=W). Other bits stay 0 — the
// engine reads act=0 (walk-and-look) and time=0 (instant) which are sensible defaults.
var cmd=0;
if(rt.waypoints.length>0){
var prev=rt.waypoints[rt.waypoints.length-1];
var dx=wx-prev.x,dz=wz-prev.z;
if(dx!==0||dz!==0){
// Pick cardinal: compare |dx| to |dz|, then sign
var dirIdx;
if(Math.abs(dx)>Math.abs(dz)){dirIdx=(dx>0)?1:3;}// East/West
else{dirIdx=(dz>0)?0:2;}// North/South (engine convention: +Z = North)
cmd=(dirIdx&0x03)<<8;}}
rt.waypoints.push({x:wx,z:wz,y:wy,dir:cmd});
rt.count=rt.waypoints.length;
selWP=rt.waypoints.length-1;
rebuild();updateRouteList();showProps();
return true;}

// Delete all waypoints from a route (slot stays available for reuse).
function deleteRoute(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
var users=getRouteUsage()[ri]||[];
var msg="Clear all waypoints from route "+ri+"?";
if(users.length>0){
msg+="\n\nWARNING: "+users.length+" enemy entit"+(users.length===1?"y":"ies")+" reference this route:\n";
msg+=users.map(function(u){return"• "+u.name}).join("\n");
msg+="\n\nThose entities will spawn with a now-empty route and crash the stage. Continue anyway?";}
if(!confirm(msg))return;
hzm.routes[ri].waypoints=[];
hzm.routes[ri].count=0;
if(selRoute===ri){selRoute=-1;selWP=-1;}
logUndo("del","Delete route "+ri);
rebuild();updateRouteList();showProps();}

// Duplicate a route to the next available empty slot.
function duplicateRoute(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
var src=hzm.routes[ri];
if(src.waypoints.length===0){alert("Route "+ri+" is empty, nothing to duplicate");return;}
var slot=-1;
for(var i=0;i<hzm.routes.length;i++){if(hzm.routes[i].waypoints.length===0){slot=i;break;}}
if(slot<0){alert("No empty route slots available");return;}
hzm.routes[slot].waypoints=src.waypoints.map(function(w){return{x:w.x,z:w.z,y:w.y,dir:w.dir};});
hzm.routes[slot].count=hzm.routes[slot].waypoints.length;
selRoute=slot;selWP=0;
logUndo("dup","Duplicate route "+ri+" → "+slot);
rebuild();updateRouteList();showProps();
document.getElementById("coordinfo").textContent="Route "+ri+" duplicated to slot "+slot;}

// Reverse waypoint order (flip the patrol direction).
function reverseRoute(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
var rt=hzm.routes[ri];
if(rt.waypoints.length<2)return;
rt.waypoints.reverse();
// Flip each waypoint's facing direction by 180° while preserving the other
// command bits (act, time, con). The 2-bit dir field at bits 8-9 holds 0=N 1=E 2=S 3=W;
// adding 2 mod 4 turns each direction around (N↔S, E↔W).
for(var i=0;i<rt.waypoints.length;i++){
var cmd=rt.waypoints[i].dir|0;
var dirBits=(cmd>>8)&0x03;
var newDir=(dirBits+2)&0x03;
rt.waypoints[i].dir=(cmd&~0x0300)|(newDir<<8);}
logUndo("rev","Reverse route "+ri);
rebuild();updateRouteList();showProps();
document.getElementById("coordinfo").textContent="Route "+ri+" reversed — "+rt.waypoints.length+" waypoints, direction arrows now flipped";}

// Mirror a route across an axis. Useful for symmetric levels where you want a
// patrol on the opposite side of a room. Computes the axis line through the route's
// centroid, then reflects each waypoint and updates the dir bits to match.
function mirrorRoute(ri,axis){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
var rt=hzm.routes[ri];if(rt.waypoints.length===0)return;
// Find centroid
var cx=0,cz=0;
for(var i=0;i<rt.waypoints.length;i++){cx+=rt.waypoints[i].x;cz+=rt.waypoints[i].z;}
cx/=rt.waypoints.length;cz/=rt.waypoints.length;
// Direction mapping: 0=N(+Z) 1=E(+X) 2=S(-Z) 3=W(-X). When mirroring across X axis
// (flip Z), N↔S and E/W stay. When mirroring across Z axis (flip X), E↔W and N/S stay.
var dirMapX=[2,1,0,3];// for axis="x": N→S, E→E, S→N, W→W
var dirMapZ=[0,3,2,1];// for axis="z": N→N, E→W, S→S, W→E
var dirMap=axis==="x"?dirMapX:dirMapZ;
for(i=0;i<rt.waypoints.length;i++){
var wp=rt.waypoints[i];
if(axis==="x"){wp.z=Math.round(2*cz-wp.z);}
else{wp.x=Math.round(2*cx-wp.x);}
var cmd=wp.dir|0;
var dirBits=(cmd>>8)&0x03;
var newDir=dirMap[dirBits];
wp.dir=(cmd&~0x0300)|(newDir<<8);}
logUndo("mirror","Mirror route "+ri+" axis="+axis);
rebuild();updateRouteList();showProps();
document.getElementById("coordinfo").textContent="Route "+ri+" mirrored across "+axis.toUpperCase()+" axis";}

// Compute estimated patrol cycle time. Guards walk at roughly 2500 units/sec in MGS1
// (measured rough average from in-game observation; this is a sanity estimate, not
// gospel). Returns a human-readable string like "5.2s · 12,800 units".
function computePatrolTime(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return null;
var rt=hzm.routes[ri];
if(rt.waypoints.length<2)return{dist:0,time:0,str:"single waypoint"};
var WALK_SPEED=2500;// engine units per second, approximate
var dist=0;
for(var i=0;i<rt.waypoints.length-1;i++){
var a=rt.waypoints[i],b=rt.waypoints[i+1];
var dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y;
dist+=Math.sqrt(dx*dx+dz*dz+dy*dy);}
// Patrol routes loop, so include the return trip from last WP back to first
var first=rt.waypoints[0],last=rt.waypoints[rt.waypoints.length-1];
var dxL=first.x-last.x,dzL=first.z-last.z,dyL=first.y-last.y;
var loopDist=Math.sqrt(dxL*dxL+dzL*dzL+dyL*dyL);
var totalDist=dist+loopDist;
var time=totalDist/WALK_SPEED;
return{dist:Math.round(totalDist),time:time,
str:time.toFixed(1)+"s · "+Math.round(totalDist).toLocaleString()+" units"};}

// Snap each waypoint's Y to the floor directly below it (point-in-polygon test
// against floor quads, with bilinear interpolation if the floor is sloped).
function snapRouteToFloor(ri){
if(!hzm||!hzm.routes||!hzm.routes[ri])return;
var rt=hzm.routes[ri];if(rt.waypoints.length===0)return;
var changed=0;
for(var i=0;i<rt.waypoints.length;i++){
var wp=rt.waypoints[i];
var y=findFloorYAt(wp.x,wp.z);
if(y!==null&&y!==wp.y){wp.y=y;changed++;}}
logUndo("snap","Snap route "+ri+" to floor");
rebuild();updateRouteList();showProps();
document.getElementById("coordinfo").textContent="Snapped "+changed+"/"+rt.waypoints.length+" waypoints to floor Y";}

// Find the Y of the floor directly under (x, z). Returns null if no floor found.
// Handles both flat floors and axis-aligned sloped floors (bilinear interpolation).
function findFloorYAt(x,z){
if(!hzm)return null;
for(var ai=0;ai<hzm.areas.length;ai++){
var floors=hzm.areas[ai].floors;
for(var fi=0;fi<floors.length;fi++){
var fl=floors[fi];
var x1=fl.quads[0].x,x2=fl.quads[1].x,z1=fl.quads[0].z,z2=fl.quads[1].z;
if(x<Math.min(x1,x2)||x>Math.max(x1,x2))continue;
if(z<Math.min(z1,z2)||z>Math.max(z1,z2))continue;
// Inside this floor's bbox. Get corner Ys for interpolation.
var p1=fl.quads[2],p2=fl.quads[3],p3=fl.quads[4],p4=fl.quads[5];
// If all corners equal, flat — return that Y
if(p1.y===p2.y&&p2.y===p3.y&&p3.y===p4.y)return p1.y;
// Otherwise bilinear interpolate. p1 at (x1,z1), p2 at (x2,z1), p3 at (x2,z2), p4 at (x1,z2)
var fx=(x-x1)/(x2-x1),fz=(z-z1)/(z2-z1);
var y12=p1.y+(p2.y-p1.y)*fx;// top edge interp
var y43=p4.y+(p3.y-p4.y)*fx;// bottom edge interp
return Math.round(y12+(y43-y12)*fz);}}
return null;}

// Snap a single waypoint to the floor below it.
function snapWPToFloor(){
if(selRoute<0||selWP<0)return;
var wp=hzm.routes[selRoute].waypoints[selWP];
var y=findFloorYAt(wp.x,wp.z);
if(y===null){
document.getElementById("coordinfo").textContent="No floor found under WP at ("+wp.x+","+wp.z+")";
return;}
wp.y=y;
logUndo("snap","Snap WP Y");
rebuild();showProps();
document.getElementById("coordinfo").textContent="WP snapped to Y="+y;}

// Insert a waypoint BEFORE the current selWP (or at start if first).
function insertWPBefore(){
if(selRoute<0||selWP<0)return;
var rt=hzm.routes[selRoute];
var cur=rt.waypoints[selWP];
var prev=selWP>0?rt.waypoints[selWP-1]:cur;
var nwp={x:Math.round((cur.x+prev.x)/2),z:Math.round((cur.z+prev.z)/2),
y:Math.round((cur.y+prev.y)/2),dir:cur.dir};
rt.waypoints.splice(selWP,0,nwp);rt.count=rt.waypoints.length;
logUndo("add","Insert WP before");
rebuild();showProps();}

// ====================== CROSS-REFERENCE HIGHLIGHTING ======================
// When an entity is selected, highlight the route it uses. When a route is selected,
// highlight entities that use it. The rebuild() function already colors selected routes
// brighter — this hook makes the inverse work too. The actual rendering changes live
// in rebuildGCLVis (for entity emphasis) and the route rendering in rebuild().

// Called from selectGCLEntity to also highlight that entity's route.
function highlightRouteForSelectedEntity(){
if(selGCL<0)return;
var e=gclEntities[selGCL];
if(e&&e.type==="WATCHER"&&e.route!==undefined&&hzm&&hzm.routes[e.route]&&hzm.routes[e.route].waypoints.length>0){
// Auto-select the route (this triggers route to render bright)
if(selRoute!==e.route){selRoute=e.route;}}}

// ============================================================
