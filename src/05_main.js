// ═══════════════════════════════════════════════════════════════════════════
// FILE: 05_main.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ==================== THREE.JS INIT ====================
function initGL(){var vp=document.getElementById("viewport");if(!vp)return;
var w=vp.clientWidth,h=vp.clientHeight;if(w<10||h<10){setTimeout(initGL,200);return}
sc3=new THREE.Scene();sc3.background=new THREE.Color(0x0a0e14);
cam3=new THREE.PerspectiveCamera(60,w/h,0.1,500);cTgt=new THREE.Vector3(0,0,0);
ren3=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});ren3.setSize(w,h);ren3.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
vp.appendChild(ren3.domElement);rc3=new THREE.Raycaster();ms3=new THREE.Vector2();
ren3.domElement.addEventListener("webglcontextlost",function(ev){ev.preventDefault();window.glLost=true;},false);
ren3.domElement.addEventListener("webglcontextrestored",function(){window.glLost=false;try{rebuild();}catch(_){}try{if(typeof LIT3D!=="undefined"){if(LIT3D.preview){LIT3D.preview=false;LIT3D_setLitPreview(true);}else if(LIT3D.lights&&LIT3D.lights.length){LIT3D_rebuild();}}}catch(_){}},false);
sc3.add(new THREE.GridHelper(80,80,0x333333,0x1a2535));sc3.add(new THREE.AxesHelper(5));
sc3.add(new THREE.AmbientLight(0xffffff,0.6));
var dl=new THREE.DirectionalLight(0xffffff,0.5);dl.position.set(10,20,10);sc3.add(dl);
uCam();rebuild();
(function anim(){requestAnimationFrame(anim);if(window.glLost)return;ren3.render(sc3,cam3)})();
window.addEventListener("resize",function(){var w2=vp.clientWidth,h2=vp.clientHeight;cam3.aspect=w2/h2;cam3.updateProjectionMatrix();ren3.setSize(w2,h2)});
var cv=ren3.domElement;

// MOUSEDOWN
cv.addEventListener("mousedown",function(e){pMouse={x:e.clientX,y:e.clientY};wasD=false;gizmoJustUsed=false;
// Spawn wizard position-picker: if active, this click sets the field and re-opens the wizard.
// Runs before everything else so it intercepts the click cleanly.
if(e.button===0&&window.spawnWizPickField){
var pPt=gPt(e);
if(pPt&&typeof spawnWizFinishPick==="function"){
var px=Math.round(pPt.x/S),pz=Math.round(pPt.z/S),py=Math.round((placeY||0));
spawnWizFinishPick(px,py,pz);}
e.preventDefault();return;}
// Camera angle handles: highest priority — drag pos/target spheres
if(e.button===0&&selCamAngle>=0&&camHandleObjs.length>0){
var ch=getHits(e,["camhandle"]);
if(ch.length>0){var h0=ch[0].object;
if(h0.userData&&h0.userData.type==="camhandle"){
var ca=camAngles[selCamAngle];
camHandleDrag={
handle:h0.userData.handle,// 'pos' or 'tgt'
startX:e.clientX,startY:e.clientY,
origPos:{...ca.setPos},
origTgt:{...ca.setTarget}};
e.stopPropagation();return}}}
if(e.button===2||(e.button===0&&e.altKey)){
// Right-click: check if clicking KMD face in tex mode
if(delFaceMode&&kmdMode==="tex"&&darLoaded&&e.button===2){
var vp=document.getElementById("viewport"),r=vp.getBoundingClientRect();
var mx2=((e.clientX-r.left)/r.width)*2-1,my2=-((e.clientY-r.top)/r.height)*2+1;
var rc2=new THREE.Raycaster();rc2.setFromCamera({x:mx2,y:my2},cam3);
// Raycast against KMD textured meshes only
var kmdMeshes=[];for(var ki2=0;ki2<kmdObjs.length;ki2++){if(kmdObjs[ki2].userData&&kmdObjs[ki2].userData.type==="kmdtex")kmdMeshes.push(kmdObjs[ki2])}
var hits3=rc2.intersectObjects(kmdMeshes,false);
if(hits3.length>0){var hit=hits3[0];var hitMesh=hit.object;
if(hitMesh.userData.faceRefs){
// Each KMD quad = 2 triangles, so faceIndex/2 = quad index in this group
var quadIdx=Math.floor(hit.faceIndex/2);
if(quadIdx<hitMesh.userData.faceRefs.length){var ref=hitMesh.userData.faceRefs[quadIdx];
// Scope the deletion key to the specific KMD so Restore can target one
// KMD without disturbing others. Falls back to legacy key shape if the
// mesh wasn't tagged with kmdIdx.
var _ki=hitMesh.userData.kmdIdx;
var dk=(_ki!==undefined)?(_ki+"-"+ref.block+"-"+ref.face):(ref.block+"-"+ref.face);
if(kmdDeletedFaces[dk]){delete kmdDeletedFaces[dk]}else{kmdDeletedFaces[dk]=true}
var wasDeleted=!!kmdDeletedFaces[dk];
logUndo(wasDeleted?"kmdDel":"kmdRestore",(wasDeleted?"Del":"Restore")+" KMD "+(_ki!==undefined?kmdFileNames[_ki]+" ":"")+"B"+ref.block+"F"+ref.face);
rebuildKMD();
document.getElementById("coordinfo").textContent="KMD face "+(kmdDeletedFaces[dk]?"DELETED":"RESTORED")+": block "+ref.block+" face "+ref.face;
e.preventDefault();return}}}}
isRot=true}
else if(e.button===1)isPan=true;
else if(e.button===0&&curTool==="navpaint"){
// Prevent orbit/pan when painting
isRot=false;isPan=false;
navPaintActive=true;navPaintLastPt=null;navPaintChain=[];navPaintEraseTargets=new Set();
// Place first zone immediately on mousedown if not erase mode
if(!navPaintErase){var pt0=gPt(e);if(pt0)placeNavPaintZone(e,pt0)}}
else if(e.button===0&&(curTool==="drawwall"||curTool==="drawfloor"||curTool==="drawzone"||curTool==="drawnz")){var pt=gPt(e);if(pt){
var raw={x:snp(pt.x),z:snp(pt.z)};var snapped=snapPt(raw.x,raw.z);var sx=snapped.x,sz=snapped.z;
if(!dPt1){dPt1={x:sx,z:sz}}else{
if(curTool==="drawwall"){
// Compute targetAi from wall midpoint. SurfY-set lastSurfAi takes precedence if user explicitly picked.
var nwX1=Math.round(dPt1.x/S),nwZ1=Math.round(dPt1.z/S),nwX2=Math.round(sx/S),nwZ2=Math.round(sz/S);
var autoAi=findHzmAreaForPoint((nwX1+nwX2)/2,placeY,(nwZ1+nwZ2)/2);
newW.push({x1:nwX1,z1:nwZ1,y1:placeY,x2:nwX2,z2:nwZ2,y2:placeY,h:placeH,flags:0,texHash:activeTexHash,uvMode:uvTileMode,targetAi:autoAi});undoHist.push("w");logUndo("add","New wall in area "+autoAi);}
else if(curTool==="drawfloor"){var fx1=Math.round(Math.min(dPt1.x,sx)/S),fz1=Math.round(Math.min(dPt1.z,sz)/S);
var fx2=Math.round(Math.max(dPt1.x,sx)/S),fz2=Math.round(Math.max(dPt1.z,sz)/S);
var fAutoAi=findHzmAreaForPoint((fx1+fx2)/2,placeY,(fz1+fz2)/2);
newF.push({x1:fx1,z1:fz1,y1:placeY,x2:fx2,z2:fz2,texHash:activeTexHash,uvMode:uvTileMode,targetAi:fAutoAi});undoHist.push("f");logUndo("add","New floor in area "+fAutoAi)}
else if(curTool==="drawzone"){var zx1=Math.round(Math.min(dPt1.x,sx)/S),zz1=Math.round(Math.min(dPt1.z,sz)/S);
var zx2=Math.round(Math.max(dPt1.x,sx)/S),zz2=Math.round(Math.max(dPt1.z,sz)/S);
var zname=prompt("Zone name (e.g. trdoor1, angle_a):","newzone");if(zname===null)zname="newzone";
newZ.push({x1:zx1,z1:zz1,y1:placeY,h1:0,x2:zx2,z2:zz2,y2:placeY,h2:0,name:zname,id1:0,id2:0});undoHist.push("z");logUndo("add","New zone: "+zname)}
else if(curTool==="drawnz"){
// Count only non-zeroed (non-deleted) existing navzones plus new ones
var deletedNZ=hzm.navZones.filter(function(z){return z.w===0&&z.h===0}).length;
var totalNZNow=hzm.navZones.length+newNavZones.length-deletedNZ;
if(totalNZNow>=255){var p3=document.getElementById("navPanel");if(p3)p3.innerHTML+='<div style="color:#ff3355;padding:6px"><b>Cannot add zone!</b><br>Max 255 zones (indices 0-254).<br>Index 255 = 0xFF = "no connection" marker.<br><br>Instead: select a nearby existing zone and resize it (change W/H) to cover the gap.</div>';
dPt1=null;if(dPrev){sc3.remove(dPrev);dPrev=null}rebuild();uUI();pMouse={x:e.clientX,y:e.clientY};return}
var nzCx=Math.round((dPt1.x+sx)/(2*S)),nzCz=Math.round((dPt1.z+sz)/(2*S));
var nzW2=Math.round(Math.abs(sx-dPt1.x)/(2*S)),nzH3=Math.round(Math.abs(sz-dPt1.z)/(2*S));
if(nzW2<100)nzW2=100;if(nzH3<100)nzH3=100;
newNavZones.push({x:nzCx,z:nzCz,y:placeY,w:nzW2,h:nzH3,nears:[255,255,255,255,255,255],dists:[0,0,0,0,0,0],pad:0});
undoHist.push("nz");logUndo("add","New NavZone at ("+nzCx+","+nzCz+")");
if(!showNavZones){showNavZones=true;var _nzB=document.getElementById("btnNZ");if(_nzB)_nzB.classList.add("active")}
selNavZone=hzm.navZones.length+newNavZones.length-1;
rebuildNavZones();updateNavPanel()}
dPt1=null;if(dPrev){sc3.remove(dPrev);dPrev=null}rebuild();uUI()}}}
else if(e.button===0&&curTool==="routeadd"){var pt3=gPt(e);if(pt3){
var rx=Math.round(snp(pt3.x)/S),rz=Math.round(snp(pt3.z)/S);
if(selRoute>=0){hzm.routes[selRoute].waypoints.push({x:rx,z:rz,y:placeY,dir:0});hzm.routes[selRoute].count=hzm.routes[selRoute].waypoints.length;
logUndo("add","WP to route "+selRoute);rebuild();uUI();updateRouteList()}else{alert("Select a route first by clicking a waypoint")}}}
else if(e.button===0&&skewMode){
// SKEW MODE: check gizmo first, then corners
var gAxisSk=getGizmoHit(e);
if(gAxisSk){gizmoDragging=true;gizmoJustUsed=true;gizmoAxis=gAxisSk;gizmoDragStart={x:e.clientX,y:e.clientY};
window._gizmoLastWorld=null;// will be initialized on first mousemove
gizmoDragItems=saveGrabPositions();
document.getElementById("coordinfo").textContent="Skew dragging "+gAxisSk.toUpperCase();return}
// Raycast against corner spheres
var svp=document.getElementById("viewport"),sr=svp.getBoundingClientRect();
var smx=((e.clientX-sr.left)/sr.width)*2-1,smy=-((e.clientY-sr.top)/sr.height)*2+1;
var src=new THREE.Raycaster();src.setFromCamera({x:smx,y:smy},cam3);
var skHits=src.intersectObjects(skewCornerObjs,false);
if(skHits.length>0){var skud=skHits[0].object.userData;
var clickedWall=skud.wallIdx,clickedFloor=skud.floorIdx,clickedCorner=skud.corner;
// First click or same object: set corner 1
if(skewCorner<0||(clickedWall!==skewWallIdx||clickedFloor!==skewFloorIdx)){
skewWallIdx=clickedWall;skewFloorIdx=clickedFloor;skewCorner=clickedCorner;skewCorner2=-1;
gizType="skew";rebuildGizmo();rebuildSkewCorners();
var skL=skewWallIdx>=0?"wall":"floor";
document.getElementById("coordinfo").textContent="Corner "+skewCorner+" selected — click another for edge mode, or drag gizmo"}
else if(clickedCorner===skewCorner){skewCorner=-1;skewCorner2=-1;gizType="normal";rebuildGizmo();rebuildSkewCorners();
document.getElementById("coordinfo").textContent="Corner deselected"}
else if(skewCorner2<0){skewCorner2=clickedCorner;gizType="skew";rebuildGizmo();rebuildSkewCorners();
document.getElementById("coordinfo").textContent="Edge mode: corners "+skewCorner+" & "+skewCorner2+" — drag gizmo to move edge"}
else{skewCorner=clickedCorner;skewCorner2=-1;rebuildGizmo();rebuildSkewCorners();
document.getElementById("coordinfo").textContent="Corner "+skewCorner+" selected"}}}
else if(e.button===0&&curTool==="measure"){var pt5=gPt(e);if(pt5){
var mx=snp(pt5.x),mz=snp(pt5.z);
if(!measurePt1){measurePt1={x:mx,z:mz}}
else{showMeasure(measurePt1.x,measurePt1.z,mx,mz);measurePt1=null}}}
else if(e.button===0&&curTool==="resize"){
var rHits=[];ms3.x=((e.clientX-document.getElementById("viewport").getBoundingClientRect().left)/document.getElementById("viewport").getBoundingClientRect().width)*2-1;
ms3.y=-((e.clientY-document.getElementById("viewport").getBoundingClientRect().top)/document.getElementById("viewport").getBoundingClientRect().height)*2+1;
rc3.setFromCamera(ms3,cam3);rHits=rc3.intersectObjects(handleObjs);
if(rHits.length>0){var hud=rHits[0].object.userData;resizeTarget=hud;resizeDragging=true}}
else if(e.button===0&&curTool==="click"){
// Grab mode: left click confirms
if(grabMode){grabMode=false;logUndo("move","Grab move");grabAxis=null;grabOrigPositions=null;rebuild();rebuildGizmo();rebuildNavZones();showProps();return}
// Check gizmo click first
var gAxis=getGizmoHit(e);
if(gAxis){gizmoDragging=true;gizmoJustUsed=true;gizmoAxis=gAxis;gizmoDragStart={x:e.clientX,y:e.clientY};
window._gizmoLastWorld=null;
if(gizType!=="skew")gizType="normal";
gizmoDragItems=saveGrabPositions();
document.getElementById("coordinfo").textContent="Dragging "+gAxis.toUpperCase();
return}
// Check for route WP drag
var rtHits=getHits(e,["route"]);
if(rtHits.length>0){routeDragging=true;routeDragRI=rtHits[0].object.userData.ri;routeDragWI=rtHits[0].object.userData.wi;
selRoute=routeDragRI;selWP=routeDragWI;selW={};selF={};selZ={};rebuild();rebuildGizmo();rebuildNavZones();uUI();showProps();return}
// Box select (from B key or BoxSel button)
if(window._boxMode||boxSelMode){boxSelecting=true;boxStart={x:e.clientX,y:e.clientY};
if(!boxDiv){boxDiv=document.createElement("div");boxDiv.style.cssText="position:absolute;border:1px solid #00ccff;background:rgba(0,204,255,0.1);pointer-events:none;z-index:20;display:none";
document.getElementById("viewport").appendChild(boxDiv)}}}});

// MOUSEMOVE
cv.addEventListener("mousemove",function(e){var dx=e.clientX-pMouse.x,dy=e.clientY-pMouse.y;if(Math.abs(dx)>2||Math.abs(dy)>2)wasD=true;
window._lastMouseX=e.clientX;window._lastMouseY=e.clientY;
// Camera handle drag — update pos or target on every mousemove
if(camHandleDrag&&selCamAngle>=0){
var ca=camAngles[selCamAngle];if(ca&&ca.setPos&&ca.setTarget){
var pt=gPt(e);// ground-plane intersection in world units
if(pt){
// pt is in scaled world units (X*S, *, Z*S). Convert back to game units.
var gx=Math.round(pt.x/S),gz=Math.round(pt.z/S);
if(e.shiftKey){
// Shift held: adjust Y based on cursor Y delta (no horizontal change)
var dyY=-(e.clientY-camHandleDrag.startY)*4;// up = +Y, sensitivity factor
if(camHandleDrag.handle==="pos"){ca.setPos.y=Math.round(camHandleDrag.origPos.y+dyY)}
else{ca.setTarget.y=Math.round(camHandleDrag.origTgt.y+dyY)}}
else{
if(camHandleDrag.handle==="pos"){ca.setPos.x=gx;ca.setPos.z=gz}
else{ca.setTarget.x=gx;ca.setTarget.z=gz}}
ca.modified=true;rebuildCamAngles();
// Live update prop panel inputs without rebuilding entire panel
function setVal(id,v){var el=document.getElementById(id);if(el)el.value=v;var el2=document.getElementById(id+"R");if(el2)el2.value=v}
setVal("cspx",ca.setPos.x);setVal("cspy",ca.setPos.y);setVal("cspz",ca.setPos.z);
setVal("cstx",ca.setTarget.x);setVal("csty",ca.setTarget.y);setVal("cstz",ca.setTarget.z);
document.getElementById("coordinfo").textContent="Drag camera "+(camHandleDrag.handle==="pos"?"position":"target")+" — Shift+drag for Y";
return}}}
// Box select drawing
if(boxSelecting&&boxStart){
if(!boxDiv){boxDiv=document.createElement("div");boxDiv.style.cssText="position:absolute;border:1px solid #00ccff;background:rgba(0,204,255,0.1);pointer-events:none;z-index:20;display:none";document.getElementById("viewport").appendChild(boxDiv)}
var vp2=document.getElementById("viewport").getBoundingClientRect();
var bx1=Math.min(boxStart.x,e.clientX)-vp2.left,by1=Math.min(boxStart.y,e.clientY)-vp2.top;
var bw=Math.abs(e.clientX-boxStart.x),bh=Math.abs(e.clientY-boxStart.y);
if(bw>5||bh>5){boxDiv.style.display="block";boxDiv.style.left=bx1+"px";boxDiv.style.top=by1+"px";boxDiv.style.width=bw+"px";boxDiv.style.height=bh+"px"}}
if(isRot){
if(fpsMode){
// FPS: temporarily orbit from camera position with tiny radius
if(!window._fpsSaved){window._fpsSaved={tgt:cTgt.clone(),rad:sph.radius};cTgt.copy(cam3.position);sph.radius=0.01}
sph.theta-=dx*0.003;sph.phi=Math.max(0.1,Math.min(Math.PI-0.1,sph.phi-dy*0.003));
uCam();drawCamGizmo()}
else if(e.shiftKey){var rv=new THREE.Vector3(),uv=new THREE.Vector3();rv.setFromMatrixColumn(cam3.matrixWorld,0);uv.setFromMatrixColumn(cam3.matrixWorld,1);
var sp=sph.radius*0.002;cTgt.add(rv.multiplyScalar(-dx*sp));cTgt.add(uv.multiplyScalar(dy*sp));uCam()}
else{sph.theta-=dx*0.005;sph.phi=Math.max(0.1,Math.min(Math.PI-0.1,sph.phi-dy*0.005));uCam();drawCamGizmo()}}
else if(isPan){var rv=new THREE.Vector3(),uv=new THREE.Vector3();rv.setFromMatrixColumn(cam3.matrixWorld,0);uv.setFromMatrixColumn(cam3.matrixWorld,1);
var sp=sph.radius*0.002;cTgt.add(rv.multiplyScalar(-dx*sp));cTgt.add(uv.multiplyScalar(dy*sp));uCam()}
else if(navPaintActive&&curTool==="navpaint"){var npPt=gPt(e);if(npPt){
if(navPaintErase){
// Erase mode: raycast navzone meshes, only mark zones on same floor level (within 2500Y of placeY)
var nzHits2=getHits(e,["navzone"]);
var allNZE=getAllNZ();
for(var nhi=0;nhi<nzHits2.length;nhi++){var nzObj=nzHits2[nhi].object;
if(nzObj.userData&&nzObj.userData.idx!==undefined){
var ei2=nzObj.userData.idx;
var ez2=allNZE[ei2];
if(ez2&&Math.abs(ez2.y-placeY)>2500)continue;// skip different floor level
if(!navPaintEraseTargets.has(ei2)){navPaintEraseTargets.add(ei2);
if(nzObj.material)nzObj.material.color.setHex(0xff2222)}}}
}else{
// Paint mode: place zones along drag path
placeNavPaintZone(e,npPt)}}}
else if((curTool==="drawwall"||curTool==="drawfloor"||curTool==="drawzone"||curTool==="drawnz")&&dPt1){var pt=gPt(e);if(pt){if(dPrev)sc3.remove(dPrev);
var raw={x:snp(pt.x),z:snp(pt.z)};var snapped=snapPt(raw.x,raw.z);var sx=snapped.x,sz=snapped.z;
if(curTool==="drawwall"){var gg=new THREE.BufferGeometry();gg.setAttribute("position",new THREE.BufferAttribute(new Float32Array([dPt1.x,placeY*S+0.05,dPt1.z,sx,placeY*S+0.05,sz]),3));
dPrev=new THREE.Line(gg,new THREE.LineBasicMaterial({color:0xffaa00}));sc3.add(dPrev)}
else{var fw=Math.abs(sx-dPt1.x),fd=Math.abs(sz-dPt1.z);if(fw>0.001&&fd>0.001){
var clr=curTool==="drawzone"?0xcc8822:curTool==="drawnz"?0x2266aa:0xff8800;
var pg=new THREE.PlaneGeometry(fw,fd);dPrev=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:clr,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
dPrev.rotation.x=-Math.PI/2;dPrev.position.set((dPt1.x+sx)/2,placeY*S+0.05,(dPt1.z+sz)/2);sc3.add(dPrev)}}}}
// Gizmo drag - incremental movement
else if(gizmoDragging&&gizmoDragItems){
// World-space projection drag. Convert the cursor's screen position to a
// world-space point on a plane through the gizmo origin, then take the
// delta along the dragged axis. This is 1:1 with the cursor regardless
// of zoom or camera angle — fixes the previous jumpy/sluggish behavior.
var _gizCenter=(typeof getSelCenter==="function")?getSelCenter():null;
if(!_gizCenter){
// Fall back to pixel-delta if center is unavailable
_gizCenter={x:0,y:0,z:0};}
var _vp=document.getElementById("viewport"),_r=_vp.getBoundingClientRect();
ms3.x=((e.clientX-_r.left)/_r.width)*2-1;ms3.y=-((e.clientY-_r.top)/_r.height)*2+1;
rc3.setFromCamera(ms3,cam3);
var _wp=new THREE.Vector3();
if(gizmoAxis==="y"){
// Vertical plane through the gizmo origin, normal facing the camera.
// Build it with setFromNormalAndCoplanarPoint so the plane's `constant`
// is computed correctly for the FULL 3D origin (not just XZ).
var _camDir=new THREE.Vector3();cam3.getWorldDirection(_camDir);
// Use the XZ-projected camera direction so the plane is purely vertical.
// If the camera is looking straight down (top view), the projected dir
// shrinks to zero — fall back to +Z so Y drag still works.
_camDir.y=0;
if(_camDir.lengthSq()<0.01)_camDir.set(0,0,1);
else _camDir.normalize();
var _yOrigin=new THREE.Vector3(_gizCenter.x*S,_gizCenter.y*S,_gizCenter.z*S);
var _yPlane=new THREE.Plane();
_yPlane.setFromNormalAndCoplanarPoint(_camDir,_yOrigin);
rc3.ray.intersectPlane(_yPlane,_wp);}
else{
// Ground plane at the gizmo's Y
var _xzPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-_gizCenter.y*S);
rc3.ray.intersectPlane(_xzPlane,_wp);}
if(!_wp||!isFinite(_wp.x))return;
// Convert from Three.js units to MGS units and compute delta from last position
var _wx=_wp.x/S,_wy=_wp.y/S,_wz=_wp.z/S;
if(!window._gizmoLastWorld){
// First mousemove: initialize the accumulator and skip emitting a delta.
// Prevents the item from snapping to wherever the cursor lands on first move.
window._gizmoLastWorld={x:Math.round(_wx),y:Math.round(_wy),z:Math.round(_wz)};
return;}
var _last=window._gizmoLastWorld;
var gDeltaX=0,gDeltaY=0,gDeltaZ=0;
if(gizmoAxis==="x")gDeltaX=Math.round(_wx-_last.x);
else if(gizmoAxis==="y")gDeltaY=Math.round(_wy-_last.y);
else if(gizmoAxis==="z")gDeltaZ=Math.round(_wz-_last.z);
// Update last-world so the next move uses an incremental delta from here
if(gizmoAxis==="x")_last.x=Math.round(_wx);
else if(gizmoAxis==="y")_last.y=Math.round(_wy);
else if(gizmoAxis==="z")_last.z=Math.round(_wz);
document.getElementById("coordinfo").textContent=gizmoAxis.toUpperCase()+": Δ"+gDeltaX+","+gDeltaY+","+gDeltaZ;
if(gDeltaX||gDeltaY||gDeltaZ){
// Skew mode: move individual vertex
if(gizType==="skew"&&skewCorner>=0){
var skObj=skewWallIdx>=0?newW[skewWallIdx]:skewFloorIdx>=0?newF[skewFloorIdx]:null;
if(skObj&&skObj.verts){
skObj.verts[skewCorner].x+=gDeltaX;skObj.verts[skewCorner].y+=gDeltaY;skObj.verts[skewCorner].z+=gDeltaZ;
if(skewCorner2>=0){skObj.verts[skewCorner2].x+=gDeltaX;skObj.verts[skewCorner2].y+=gDeltaY;skObj.verts[skewCorner2].z+=gDeltaZ}}
rebuild();rebuildSkewCorners();rebuildGizmo()}
else{
// Apply incremental delta directly to current positions
for(var gi=0;gi<gizmoDragItems.length;gi++){var it=gizmoDragItems[gi];
if(it.type==="nw"||it.type==="ew"){it.ref.x1+=gDeltaX;it.ref.z1+=gDeltaZ;it.ref.y1+=gDeltaY;
it.ref.x2+=gDeltaX;it.ref.z2+=gDeltaZ;it.ref.y2+=gDeltaY;
if(it.ref.verts){for(var vi2=0;vi2<it.ref.verts.length;vi2++){it.ref.verts[vi2].x+=gDeltaX;it.ref.verts[vi2].z+=gDeltaZ;it.ref.verts[vi2].y+=gDeltaY}}}
else if(it.type==="nf"){it.ref.x1+=gDeltaX;it.ref.z1+=gDeltaZ;it.ref.x2+=gDeltaX;it.ref.z2+=gDeltaZ;it.ref.y1+=gDeltaY;
if(it.ref.verts){for(var fvi=0;fvi<it.ref.verts.length;fvi++){it.ref.verts[fvi].x+=gDeltaX;it.ref.verts[fvi].z+=gDeltaZ;it.ref.verts[fvi].y+=gDeltaY}}}
else if(it.type==="ef"){for(var qi=0;qi<6;qi++){it.ref.quads[qi].x+=gDeltaX;it.ref.quads[qi].z+=gDeltaZ;it.ref.quads[qi].y+=gDeltaY}}
else if(it.type==="nz2"||it.type==="ez"){it.ref.x1+=gDeltaX;it.ref.z1+=gDeltaZ;it.ref.x2+=gDeltaX;it.ref.z2+=gDeltaZ;it.ref.y1+=gDeltaY;if(it.ref.y2!==undefined)it.ref.y2+=gDeltaY}
else if(it.type==="navz"){it.ref.x+=gDeltaX;it.ref.z+=gDeltaZ;it.ref.y+=gDeltaY}
else if(it.type==="wp"){it.ref.x+=gDeltaX;it.ref.z+=gDeltaZ;it.ref.y+=gDeltaY}
else if(it.type==="gclpos"){it.ref.x+=gDeltaX;it.ref.z+=gDeltaZ;it.ref.y+=gDeltaY;
}}
rebuild();rebuildGizmo();rebuildNavZones();rebuildGCLVis()}}
document.getElementById("coordinfo").textContent=gizmoAxis.toUpperCase()+": "+gDeltaX+","+gDeltaY+","+gDeltaZ}
// Grab mode (G key)
else if(grabMode&&grabOrigPositions){var gpt=gPt(e);if(gpt){
var gmx=Math.round(snp(gpt.x)/S),gmz=Math.round(snp(gpt.z)/S);
var gdx2=gmx-Math.round(grabStart.x/S),gdz2=gmz-Math.round(grabStart.z/S);
var gdy2=0;
if(grabAxis==="y"){var vyDelta=-(e.clientY-(gizmoDragStart.y||e.clientY))*sph.radius*0.08;gdy2=Math.round(vyDelta/snapSize)*snapSize;gdx2=0;gdz2=0}
else if(grabAxis==="x"){gdz2=0}
else if(grabAxis==="z"){gdx2=0}
applyGrabDelta(grabOrigPositions,gdx2,gdy2,gdz2);
rebuild();rebuildGizmo();rebuildNavZones();rebuildGCLVis();
document.getElementById("coordinfo").textContent="Grab"+(grabAxis?" "+grabAxis.toUpperCase():"")+" dx="+gdx2+" dy="+gdy2+" dz="+gdz2+" [Click=OK Esc=cancel]"}}
else if(curTool==="resize"&&resizeDragging&&resizeTarget){var rpt=gPt(e);if(rpt){
var rsx=Math.round(snp(rpt.x)/S),rsz=Math.round(snp(rpt.z)/S);
var rk=resizeTarget.key,re=resizeTarget.end,rot=resizeTarget.objType;
if(rot==="wall"){
if(rk.indexOf("nw-")===0){var ridx=parseInt(rk.substr(3));var rw=newW[ridx];if(rw){if(re==="p1"){rw.x1=rsx;rw.z1=rsz}else{rw.x2=rsx;rw.z2=rsz}}}
else{var rps=rk.split("-"),rai=parseInt(rps[0]),rni=parseInt(rps[1]);var rnf=hzm.areas[rai]&&hzm.areas[rai].navfaces[rni];
if(rnf){if(re==="p1"){rnf.x1=rsx;rnf.z1=rsz}else{rnf.x2=rsx;rnf.z2=rsz}}}}
else if(rot==="floor"){
if(rk.indexOf("nf-")===0){var rfidx=parseInt(rk.substr(3));var rf=newF[rfidx];if(rf){
if(re==="c1"){rf.x1=rsx;rf.z1=rsz}else if(re==="c2"){rf.x2=rsx;rf.z2=rsz}
else if(re==="c3"){rf.x1=rsx;rf.z2=rsz}else if(re==="c4"){rf.x2=rsx;rf.z1=rsz}}}
else{var rfps=rk.split("-"),rfai=parseInt(rfps[0]),rffi=parseInt(rfps[1]);var rfl=hzm.areas[rfai]&&hzm.areas[rfai].floors[rffi];
if(rfl){var q0=rfl.quads[0],q1=rfl.quads[1];
if(re==="c1"){q0.x=rsx;q0.z=rsz;rfl.quads[2].x=rsx;rfl.quads[2].z=rsz;rfl.quads[5].x=rsx}
else if(re==="c2"){q1.x=rsx;q1.z=rsz;rfl.quads[3].x=rsx;rfl.quads[4].x=rsx;rfl.quads[4].z=rsz}
else if(re==="c3"){q0.x=rsx;q1.z=rsz;rfl.quads[2].x=rsx;rfl.quads[5].x=rsx;rfl.quads[5].z=rsz;rfl.quads[4].z=rsz}
else if(re==="c4"){q1.x=rsx;q0.z=rsz;rfl.quads[3].x=rsx;rfl.quads[3].z=rsz;rfl.quads[2].z=rsz}}}}
// Zone resize: only newZ zones (nz-* keys). 4 corners map to (x1/x2, z1/z2)
// the same way floors do. The zone's Y range (y1/y2) is preserved — only
// XZ extents change. To edit Y, use the zone's properties panel.
else if(rot==="zone"){
if(rk.indexOf("nz-")===0){var zidx=parseInt(rk.substr(3));var rzn=newZ[zidx];if(rzn){
if(re==="c1"){rzn.x1=rsx;rzn.z1=rsz}else if(re==="c2"){rzn.x2=rsx;rzn.z2=rsz}
else if(re==="c3"){rzn.x1=rsx;rzn.z2=rsz}else if(re==="c4"){rzn.x2=rsx;rzn.z1=rsz}}}}
rebuild();document.getElementById("coordinfo").textContent="Resize: "+rsx+","+rsz}}
else if(routeDragging&&routeDragRI>=0){var rpt2=gPt(e);if(rpt2){
var rdx=Math.round(snp(rpt2.x)/S),rdz=Math.round(snp(rpt2.z)/S);
var rwp4=hzm.routes[routeDragRI].waypoints[routeDragWI];
if(rwp4){rwp4.x=rdx;rwp4.z=rdz;rebuild();
document.getElementById("coordinfo").textContent="WP "+routeDragRI+":"+routeDragWI+" -> ("+rdx+","+rdz+")"}}}
else if(!gizmoDragging&&!grabMode){
var hoverTypes=showNavZones?["navzone"]:["wall","floor","zone","route","navzone"];
var hits=getHits(e,hoverTypes);var nk=hits.length>0?hits[0].object.userData.key||hits[0].object.userData.type:null;if(nk!==hovKey){hovKey=nk;rebuild()}
var he=document.getElementById("hoverinfo");
if(hovKey&&hits.length>0){var ud=hits[0].object.userData;
if(ud.type==="route"){he.textContent="Route "+ud.ri+" WP "+ud.wi;he.style.display="block"}
else if(ud.type==="navzone"){var nzi4=ud.idx;var allNZH=getAllNZ();var nzd2=allNZH[nzi4];
if(nzd2){var nConns=0;for(var nc2=0;nc2<6;nc2++)if(nzd2.nears[nc2]!==255)nConns++;
he.textContent="NavZone "+nzi4+" ("+nzd2.x+","+nzd2.z+") "+nzd2.w+"x"+nzd2.h+" ["+nConns+" connections]";he.style.display="block"}}
else if(ud.type==="zone"){var zps=ud.key.split("-"),zai=parseInt(zps[0]),zni=parseInt(zps[1]);
var znm=hzm.areas[zai]&&hzm.areas[zai].zones[zni];he.textContent="Zone: "+(znm?znm.name:ud.key);he.style.display="block"}
else if(ud.key.indexOf("nw-")===0||ud.key.indexOf("nf-")===0){he.textContent="NEW "+ud.type;he.style.display="block"}
else{var pk=ud.key.split("-"),pai=parseInt(pk[0]),pni=parseInt(pk[1]);
if(ud.type==="wall"&&hzm.areas[pai]){var pnf=hzm.areas[pai].navfaces[pni],pwf=hzm.areas[pai].wFlags[pni]||0;
var fb=[];if(pwf&1)fb.push("NC");if(pwf&2)fb.push("NN");if(pwf&4)fb.push("NP");if(!pwf)fb.push("FULL");
he.textContent="wall["+pni+"] ("+pnf.x1+","+pnf.z1+")→("+pnf.x2+","+pnf.z2+") h="+pnf.h1+" ["+fb.join("|")+"]";he.style.display="block"}
else{he.textContent=ud.type+"["+ud.key+"]";he.style.display="block"}}}
else{he.style.display="none"}
var gp=gPt(e);if(gp){
var surfHint=surfYMode?" [SurfY ON — click a floor/wall to lock Y]":"";
document.getElementById("coordinfo").textContent="x:"+Math.round(gp.x/S)+" z:"+Math.round(gp.z/S)+" y:"+placeY+surfHint}}
pMouse={x:e.clientX,y:e.clientY}});

// MOUSEUP
cv.addEventListener("mouseup",function(e){
// Camera handle drag end: commit with undo
if(camHandleDrag){
var ca=camAngles[selCamAngle];
if(ca){
// Only log undo if something actually changed
var changed=(camHandleDrag.handle==="pos"&&(ca.setPos.x!==camHandleDrag.origPos.x||ca.setPos.y!==camHandleDrag.origPos.y||ca.setPos.z!==camHandleDrag.origPos.z))
||(camHandleDrag.handle==="tgt"&&(ca.setTarget.x!==camHandleDrag.origTgt.x||ca.setTarget.y!==camHandleDrag.origTgt.y||ca.setTarget.z!==camHandleDrag.origTgt.z));
if(changed)logUndo("edit","Drag camera "+camHandleDrag.handle+" "+ca.proc);
showCamAngleProps();}
camHandleDrag=null;return}
// Eyedropper: handled FIRST so geometry overlays and other tool gates don't interfere.
// Only raycasts against KMD textured meshes; click is a one-shot pickup.
if(e.button===0&&curTool==="eyedrop"){
var clickMoved=Math.abs(e.clientX-pMouse.x)+Math.abs(e.clientY-pMouse.y);
if(clickMoved<15){
var eyeHits=getHits(e,["kmdtex"]);
if(eyeHits.length>0&&eyeHits[0].object&&eyeHits[0].object.userData&&eyeHits[0].object.userData.hash!==undefined){
activeTexHash=eyeHits[0].object.userData.hash;updateTexPalette();
var tnameE=darTextures[activeTexHash]?darTextures[activeTexHash].name:"hash 0x"+activeTexHash.toString(16);
document.getElementById("coordinfo").textContent="Picked texture: "+tnameE;
setT("click");}
else{
document.getElementById("coordinfo").textContent="Eyedropper: no textured KMD face under cursor. Make sure 'Textured' KMD mode is on and a stg_tex DAR (+TEX) is loaded. Esc to cancel.";}}
return}
// NavPaint finalize
if(e.button===0&&navPaintActive&&curTool==="navpaint"){
navPaintActive=false;
if(navPaintErase){
// Delete all marked zones
var targets=Array.from(navPaintEraseTargets).sort(function(a,b){return b-a});
var hzmLen=hzm.navZones.length;
var deleted=0;
// First pass: zero out existing zones (preserves index ordering)
for(var ti=0;ti<targets.length;ti++){var tIdx=targets[ti];
if(tIdx<hzmLen){hzm.navZones[tIdx].w=0;hzm.navZones[tIdx].h=0;deleted++}}
// Second pass: splice new zones in reverse order
for(var ti2=0;ti2<targets.length;ti2++){var tIdx2=targets[ti2];
if(tIdx2>=hzmLen){var nni=tIdx2-hzmLen;if(nni>=0&&nni<newNavZones.length){newNavZones.splice(nni,1);deleted++}}}
navPaintEraseTargets=new Set();
if(deleted>0){logUndo("del","NavErase ("+deleted+" zones)");rebuildNavZones();updateNavPanel();
document.getElementById("coordinfo").textContent="NavErase: deleted "+deleted+" zone"+(deleted!==1?"s":"");}
}else{
if(navPaintChain.length>0){
// Connect stroke endpoints to existing navmesh
autoConnectNavZones();
logUndo("add","NavPaint ("+navPaintChain.length+" zones)");
updateNavPanel();}
navPaintChain=[];navPaintLastPt=[];}
return}
// Box select completion
if(e.button===0&&boxSelecting&&boxStart&&(curTool==="click"||boxSelMode)){
var bw2=Math.abs(e.clientX-boxStart.x),bh2=Math.abs(e.clientY-boxStart.y);
if(bw2>5||bh2>5){
var vp3=document.getElementById("viewport").getBoundingClientRect();
var sx1=Math.min(boxStart.x,e.clientX),sy1=Math.min(boxStart.y,e.clientY);
var sx2=Math.max(boxStart.x,e.clientX),sy2=Math.max(boxStart.y,e.clientY);
if(!e.shiftKey){selW={};selF={};selZ={}}
function toScreen(wx,wy,wz){var v3=new THREE.Vector3(wx,wy,wz);v3.project(cam3);
return{x:(v3.x+1)/2*vp3.width+vp3.left,y:(-v3.y+1)/2*vp3.height+vp3.top}}
for(var ai=0;ai<hzm.areas.length;ai++){
for(var ni=0;ni<hzm.areas[ai].navfaces.length;ni++){var nf=hzm.areas[ai].navfaces[ni];var wk=ai+"-"+ni;if(colW[wk])continue;
var sp=toScreen((nf.x1+nf.x2)/2*S,nf.y1*S,(nf.z1+nf.z2)/2*S);
if(sp.x>=sx1&&sp.x<=sx2&&sp.y>=sy1&&sp.y<=sy2)selW[wk]=true}
for(var fi=0;fi<hzm.areas[ai].floors.length;fi++){var fl=hzm.areas[ai].floors[fi];var fk=ai+"-"+fi;if(colF[fk])continue;
var fp=toScreen((fl.quads[0].x+fl.quads[1].x)/2*S,fl.quads[0].y*S,(fl.quads[0].z+fl.quads[1].z)/2*S);
if(fp.x>=sx1&&fp.x<=sx2&&fp.y>=sy1&&fp.y<=sy2)selF[fk]=true}}
for(var ni2=0;ni2<newW.length;ni2++){var nw2=newW[ni2];
var np=toScreen((nw2.x1+nw2.x2)/2*S,nw2.y1*S,(nw2.z1+nw2.z2)/2*S);
if(np.x>=sx1&&np.x<=sx2&&np.y>=sy1&&np.y<=sy2)selW["nw-"+ni2]=true}
for(ni2=0;ni2<newF.length;ni2++){var nfl=newF[ni2];
var nfp=toScreen((nfl.x1+nfl.x2)/2*S,nfl.y1*S,(nfl.z1+nfl.z2)/2*S);
if(nfp.x>=sx1&&nfp.x<=sx2&&nfp.y>=sy1&&nfp.y<=sy2)selF["nf-"+ni2]=true}
rebuild();rebuildGizmo();uUI();showProps()}
boxSelecting=false;boxStart=null;window._boxMode=false;boxSelMode=false;
var bsBtn=document.getElementById("btnBoxSel");if(bsBtn)bsBtn.classList.remove("active");
if(boxDiv)boxDiv.style.display="none"}
// Normal single click - skip if gizmo was just used
else if(e.button===0&&curTool==="click"&&!routeDragging&&!gizmoJustUsed){
var clickDist=Math.abs(e.clientX-pMouse.x)+Math.abs(e.clientY-pMouse.y);
if(clickDist<15){
// Route placement mode: every click adds a waypoint at the cursor surface point
if(placeRouteMode){
var pwPt=gPt(e);
if(pwPt){placeRouteWaypointAt(pwPt);return;}}
if(showNavZones){var nzPt=gPt(e);if(nzPt&&hzm.navZones){
var nzHit=-1,nzBestD=Infinity;
var allNZClick=hzm.navZones.concat(newNavZones);
var clickX=nzPt.x/S,clickZ=nzPt.z/S;
for(var nzi5=0;nzi5<allNZClick.length;nzi5++){var nz5=allNZClick[nzi5];
if(nz5.w===0&&nz5.h===0)continue;
var dx5=Math.abs(clickX-nz5.x),dz5=Math.abs(clickZ-nz5.z);
if(dx5<=nz5.w&&dz5<=nz5.h){var d5=dx5+dz5;if(d5<nzBestD){nzBestD=d5;nzHit=nzi5}}}
if(nzHit<0){for(nzi5=0;nzi5<allNZClick.length;nzi5++){nz5=allNZClick[nzi5];
if(nz5.w===0&&nz5.h===0)continue;
var d6=Math.sqrt(Math.pow(clickX-nz5.x,2)+Math.pow(clickZ-nz5.z,2));
if(d6<2000&&d6<nzBestD){nzBestD=d6;nzHit=nzi5}}}
if(nzHit>=0){selectNavZone(nzHit);rebuild();rebuildGizmo();uUI()}
else{selNavZone=-1;rebuildNavZones();updateNavPanel()}}
}else{
var hitTypes=["wall","floor","zone","route","gcl","gcl_spawn","kmdtex","skewcorner","camangle"];
var hits=getHits(e,hitTypes);
if(hits.length>0){var h0=hits[0],o=h0.object,k=o.userData.key,t=o.userData.type;
if(t==="skewcorner"&&skewMode){
skewWallIdx=o.userData.wallIdx;skewCorner=o.userData.corner;
gizType="skew";rebuildGizmo();rebuildSkewCorners();
document.getElementById("coordinfo").textContent="Skew corner "+skewCorner+" — drag gizmo to move vertex";return}
if(t==="camangle"){selCamAngle=o.userData.camIdx;rebuildCamAngles();showCamAngleProps();return}
if(t==="gcl_spawn"){selW={};selF={};selZ={};selRoute=-1;selWP=-1;selNavZone=-1;selCamAngle=-1;
selGCL=o.userData.gclIdx;selGCLSpawn=true;
rebuildGCLVis();showGCLProps();updateGCLPanel();rebuild();rebuildGizmo();uUI();
document.getElementById("coordinfo").textContent="SPAWN POINT selected — G to grab, edit SX/SY/SZ in panel";return}
if(t==="gcl"){selW={};selF={};selZ={};selRoute=-1;selWP=-1;selNavZone=-1;
selectGCLEntity(o.userData.gclIdx);
// If the click hit an IR sensor endpoint sphere, also switch to that endpoint
if(typeof o.userData.irEndpoint==="number"&&typeof selectIREndpoint==="function"){
selectIREndpoint(o.userData.irEndpoint);}
rebuild();rebuildGizmo();uUI()}
else{
if(!e.shiftKey){var wasAlreadySel=(t==="wall"||k.indexOf("nw-")===0)?selW[k]:(t==="floor"||k.indexOf("nf-")===0)?selF[k]:t==="zone"?selZ[k]:false;if(!wasAlreadySel){selW={};selF={};selZ={};selGCL=-1}}
if(t==="wall"||k.indexOf("nw-")===0){if(!e.shiftKey&&selW[k]){delete selW[k]}else{selW[k]=true};selRoute=-1;selWP=-1}
else if(t==="floor"||k.indexOf("nf-")===0){if(!e.shiftKey&&selF[k]){delete selF[k]}else{selF[k]=true};selRoute=-1;selWP=-1}
else if(t==="zone"){if(!e.shiftKey&&selZ[k]){delete selZ[k]}else{selZ[k]=true};selRoute=-1;selWP=-1}
else if(t==="route"){selRoute=o.userData.ri;selWP=o.userData.wi;selW={};selF={};selZ={}}
else if(t==="navzone"){selectNavZone(o.userData.idx)}
// SurfY click-capture: when mode is on, lock Y from clicked floor or wall
if(surfYMode&&(t==="floor"||t==="wall"||k.indexOf("nf-")===0||k.indexOf("nw-")===0)){
var capY=null,capAi=0;
if(k.indexOf("nf-")===0){var nfci=parseInt(k.substr(3));if(newF[nfci]){capY=newF[nfci].y1;capAi=newF[nfci].targetAi||0}}
else if(t==="floor"&&k.indexOf("-")>0){var cfps=k.split("-");capAi=parseInt(cfps[0]);var cfl=hzm.areas[capAi]&&hzm.areas[capAi].floors[parseInt(cfps[1])];if(cfl)capY=cfl.quads[0].y}
else if(k.indexOf("nw-")===0){var nwci=parseInt(k.substr(3));if(newW[nwci]){capY=newW[nwci].y1;capAi=newW[nwci].targetAi||0}}
else if(t==="wall"&&k.indexOf("-")>0){var cwps=k.split("-");capAi=parseInt(cwps[0]);var cwf=hzm.areas[capAi]&&hzm.areas[capAi].navfaces[parseInt(cwps[1])];if(cwf)capY=cwf.y1}
if(capY!==null){setYFromSurface(capY);lastSurfAi=capAi;
document.getElementById("coordinfo").textContent="SurfY locked to Y="+capY+" area="+capAi+" — click SurfY again to confirm & deactivate"}}
selGCL=-1;rebuild();rebuildGizmo();uUI();showProps()}}
else if(!e.shiftKey&&!skewMode){selW={};selF={};selZ={};selRoute=-1;selWP=-1;selGCL=-1;rebuild();rebuildGizmo();uUI();showProps()}}}}
isRot=false;isPan=false;boxSelecting=false;boxStart=null;if(boxDiv)boxDiv.style.display="none";
if(gizmoDragging){gizmoDragging=false;
if(gizType==="skew"){
// Keep the corner/edge selected so the user can drag again without
// re-clicking. The gizmo + orbs stay live until they press spacebar to
// exit transform mode, click empty space to deselect, or click a
// different orb.
logUndo("skew","Skew vertex");
// gizType stays "skew", skewCorner / skewCorner2 stay set
}
else{logUndo("move","Gizmo "+gizmoAxis);gizType="normal"}
// Persistent selection: keep the gizmo and selection live so the user can
// continue dragging the same axis or switch axes without re-clicking. The
// gizmo closes only on spacebar/Esc, or when the user clicks empty space to
// deselect. We do NOT clear gizmoAxis/gizmoDragItems for the same reason.
gizmoAxis=null;gizmoDragItems=null;showProps();rebuildGizmo();rebuildSkewCorners()}
if(resizeDragging){resizeDragging=false;logUndo("resize","Resize "+resizeTarget.objType);resizeTarget=null;showProps()}
if(routeDragging){routeDragging=false;logUndo("move","Move WP "+routeDragRI+":"+routeDragWI);routeDragRI=-1;routeDragWI=-1;showProps()}});

cv.addEventListener("wheel",function(e){e.preventDefault();sph.radius=Math.max(1,Math.min(200,sph.radius*(e.deltaY>0?1.1:0.9)));uCam()},{passive:false});
cv.addEventListener("contextmenu",function(e){e.preventDefault();
// In route placement mode, right-click finishes
if(placeRouteMode){exitPlaceRouteMode();return}
// Right-click: add waypoint to selected route at click position
if(selRoute>=0&&hzm.routes[selRoute]){var rpt3=gPt(e);if(rpt3){
var rx2=Math.round(snp(rpt3.x)/S),rz2=Math.round(snp(rpt3.z)/S);
var rt3=hzm.routes[selRoute];
var insertIdx=selWP>=0?selWP+1:rt3.waypoints.length;
var prevWP=rt3.waypoints[Math.max(0,insertIdx-1)];
var newWP={x:rx2,z:rz2,y:prevWP?prevWP.y:0,dir:prevWP?prevWP.dir:128};
rt3.waypoints.splice(insertIdx,0,newWP);rt3.count=rt3.waypoints.length;
selWP=insertIdx;logUndo("add","Add WP to route "+selRoute);
rebuild();rebuildGizmo();uUI();updateRouteList();showProps()}}})}

// ==================== FILE HANDLING ====================
function hFile(file){if(!file)return;hzmFN=file.name;var r=new FileReader();
r.onload=function(e){try{hzm=parseHZM(e.target.result);selW={};colW={};newW=[];selF={};colF={};newF=[];selZ={};colZ={};newZ=[];newNavZones=[];undoHist=[];undoSnapshots=[];undoPtr=-1;clipboard=[];selRoute=-1;selWP=-1;selNavZone=-1;selGCL=-1;showEd();takeSnapshot("File loaded")}catch(err){alert("Parse failed: "+err.message)}};r.readAsArrayBuffer(file)}

// Load multiple HZM files: first is the base (same as hFile), then each
// remaining HZM is merged via mergeHZM. Used by PSX stages where collision
// is split across multiple files (e.g. s01a has 4: 20/21/24/26_*.hzm).
// PC stages with a single HZM also pass through this cleanly.
function hFiles(fileList){
if(!fileList||fileList.length===0)return;
var files=Array.prototype.slice.call(fileList);
var first=files[0];
hzmFN=first.name;
var r=new FileReader();
r.onload=function(e){
try{
hzm=parseHZM(e.target.result);
selW={};colW={};newW=[];selF={};colF={};newF=[];selZ={};colZ={};newZ=[];
newNavZones=[];undoHist=[];undoSnapshots=[];undoPtr=-1;clipboard=[];
selRoute=-1;selWP=-1;selNavZone=-1;selGCL=-1;
showFl=true;// show collision floors (incl. sloped stairs/ramps) on load
showEd();
takeSnapshot("Loaded "+first.name);
}catch(err){alert("Parse failed for "+first.name+": "+err.message);return;}
// Merge remaining HZMs sequentially
var idx=1;
function mergeNext(){
if(idx>=files.length){
if(files.length>1){
// Show a summary toast so user knows multi-HZM worked
console.log("hFiles: merged "+(files.length-1)+" additional HZM(s) into base");
takeSnapshot("Merged "+(files.length-1)+" HZM(s)");
}
return;
}
var f=files[idx++];
var mr=new FileReader();
mr.onload=function(me){
try{ mergeHZM(me.target.result); }
catch(err){ console.warn("Merge failed for "+f.name+": "+err.message); }
mergeNext();
};
mr.readAsArrayBuffer(f);
}
mergeNext();
};
r.readAsArrayBuffer(first);
}

// ==================== UI ====================
function _getDropBgBlobUrl(){
// Cache: only convert once per page load.
if(window._dropBgBlobUrl)return window._dropBgBlobUrl;
if(typeof DROP_SCREEN_BG!=="string"||!DROP_SCREEN_BG)return "";
try{
// Strip the data:image/jpeg;base64, prefix
var b64=DROP_SCREEN_BG.replace(/^data:[^,]+,/,"");
var bin=atob(b64);
var bytes=new Uint8Array(bin.length);
for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
var blob=new Blob([bytes],{type:"image/jpeg"});
window._dropBgBlobUrl=URL.createObjectURL(blob);
return window._dropBgBlobUrl;
}catch(e){console.warn("Drop bg decode failed:",e);return "";}}

function showDrop(){
var bgUrl=_getDropBgBlobUrl();
document.getElementById("app").innerHTML=
'<div style="position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#0a0e14;z-index:1">'
+(bgUrl?'<img src="'+bgUrl+'" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.85;z-index:0;pointer-events:none" alt="">':'')
+'<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(rgba(10,14,20,0.30),rgba(10,14,20,0.65));z-index:1;pointer-events:none"></div>'
+'<div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:32px">'
  +'<div style="text-align:center">'
    +'<h1 style="color:#ff4488;font-family:\'OrbitronSuite\',\'Bahnschrift\',\'Agency FB\',\'Eurostile\',sans-serif;font-weight:800;font-size:32px;letter-spacing:5px;text-transform:uppercase;text-shadow:0 2px 12px rgba(0,0,0,0.8);margin-bottom:6px">MGS1 Modding Suite</h1>'
    +'<p style="color:#aac;font-size:12px;opacity:0.8;text-shadow:0 1px 4px rgba(0,0,0,0.8)">Choose a tool to get started</p>'
  +'</div>'
  +'<div style="display:flex;gap:18px;align-items:stretch;flex-wrap:wrap;justify-content:center;max-width:1080px">'
    // STAGE EDITOR TILE
    +'<div id="tileStage" style="position:relative;overflow:hidden;width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #ff4488;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(255,68,136,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#ff77aa\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#ff4488\'">'
      +'<div style="margin:-24px -24px 12px -24px;background:repeating-linear-gradient(45deg,#0a0a00 0,#0a0a00 9px,#f5c400 9px,#f5c400 18px);padding:4px 0;text-align:center"><span style="display:inline-block;background:#f5c400;color:#1a1500;font-weight:bold;font-size:9px;letter-spacing:1.5px;padding:2px 10px;border-radius:2px;font-family:\'OrbitronSuite\',sans-serif">⚠ UNDER CONSTRUCTION</span></div>'
      +'<div style="font-size:38px;margin-bottom:8px">🏗️</div>'
      +'<h2 style="color:#ff4488;font-size:14px;margin-bottom:6px;letter-spacing:1px">Stage Editor</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Walls, floors, zones, routes, KMD overlay, VR scripting</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">Drop .hzm or click to browse</p>'
    +'</div>'
    // ANIM SWAP TILE
    +'<div id="tileAnim" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #ff77cc;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(255,119,204,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#ffaadd\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#ff77cc\'">'
      +'<div style="font-size:38px;margin-bottom:8px">🎬</div>'
      +'<h2 style="color:#ff77cc;font-size:14px;margin-bottom:6px;letter-spacing:1px">Animation Swap</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Splice animations between character OAR files with 3D preview</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">Needs KMD + 2 OAR files</p>'
    +'</div>'
    // SOUND SWAP TILE
    +'<div id="tileSound" style="position:relative;overflow:hidden;width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #77ccff;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(119,204,255,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#aaddff\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#77ccff\'">'
      +'<div style="margin:-24px -24px 12px -24px;background:repeating-linear-gradient(45deg,#0a0a00 0,#0a0a00 9px,#f5c400 9px,#f5c400 18px);padding:4px 0;text-align:center"><span style="display:inline-block;background:#f5c400;color:#1a1500;font-weight:bold;font-size:9px;letter-spacing:1.5px;padding:2px 10px;border-radius:2px;font-family:\'OrbitronSuite\',sans-serif">⚠ UNDER CONSTRUCTION</span></div>'
      +'<div style="font-size:38px;margin-bottom:8px">🔊</div>'
      +'<h2 style="color:#77ccff;font-size:14px;margin-bottom:6px;letter-spacing:1px">Sound Swap</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Browse and swap sound effects in efx.mgz with in-browser preview</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">Needs efx.mgz / efx.zip</p>'
    +'</div>'
    // PSX TEXTURE VIEWER TILE
    +'<div id="tilePsxTex" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #44aacc;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(68,170,204,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#77cce6\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#44aacc\'">'
      +'<div style="font-size:38px;margin-bottom:8px">🖼</div>'
      +'<h2 style="color:#44aacc;font-size:14px;margin-bottom:6px;letter-spacing:1px">PSX Textures</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Inspect PSX stage *_0.dar texture containers (read-only)</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">PSX-format DARs only</p>'
    +'</div>'
    // ATTRIBUTE CHANGER TILE
    +'<div id="tileAttr" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #8fd48f;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(143,212,143,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#b3e6b3\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#8fd48f\'">'
      +'<div style="font-size:38px;margin-bottom:8px">⚙</div>'
      +'<h2 style="color:#8fd48f;font-size:14px;margin-bottom:6px;letter-spacing:1px">Attribute Changer</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Edit entity attributes in compiled stage GCX — enemy health, routes, FOV, item params. Includes EXE melee hitbox editor.</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">.gcx / PS-X EXE</p>'
    +'</div>'
    // CODEC EDITOR TILE
    +'<div id="tileCodec" style="position:relative;overflow:hidden;width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #6a5acd;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(106,90,205,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#9f8fff\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#6a5acd\'">'
      +'<div style="margin:-24px -24px 12px -24px;background:repeating-linear-gradient(45deg,#0a0a00 0,#0a0a00 9px,#f5c400 9px,#f5c400 18px);padding:4px 0;text-align:center"><span style="display:inline-block;background:#f5c400;color:#1a1500;font-weight:bold;font-size:9px;letter-spacing:1.5px;padding:2px 10px;border-radius:2px;font-family:\'OrbitronSuite\',sans-serif">⚠ UNDER CONSTRUCTION</span></div>'
      +'<div style="font-size:38px;margin-bottom:8px">📻</div>'
      +'<h2 style="color:#9f8fff;font-size:14px;margin-bottom:6px;letter-spacing:1px">Codec Editor</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Edit codec frequencies, call data and conversation scripts</p>'
      +'<p style="color:#8fc;font-size:9px;font-style:italic">Phase 1 — panel + script parser</p>'
    +'</div>'
    // SIGHT EDITOR TILE
    +'<div id="tileSgt" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #ffaa55;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(255,170,85,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#ffc888\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#ffaa55\'">'
      +'<div style="font-size:38px;margin-bottom:8px">🎯</div>'
      +'<h2 style="color:#ffaa55;font-size:14px;margin-bottom:6px;letter-spacing:1px">Sight Editor</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Edit weapon SIGHT / HUD vector graphics (.sgt) — reticles, scopes, gauges</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">.sgt / .stg / STAGE.DIR</p>'
    +'</div>'
    // ARCHIVE TOOL TILE
    +'<div id="tileArch" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #7ee787;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(126,231,135,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#a6f0ab\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#7ee787\'">'
      +'<div style="font-size:38px;margin-bottom:8px">📦</div>'
      +'<h2 style="color:#7ee787;font-size:14px;margin-bottom:6px;letter-spacing:1px">Archive Tool</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Unpack &amp; repack the whole stage container — stages, DARs, GCX↔GCL, auto VRAM repair</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">STAGE.DIR / stage.mgz</p>'
    +'</div>'
    // RPK STUDIO TILE
    +'<div id="tileRpk" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #39d0c8;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(57,208,200,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#6fe6df\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#39d0c8\'">'
      +'<div style="font-size:38px;margin-bottom:8px">🔫</div>'
      +'<h2 style="color:#39d0c8;font-size:14px;margin-bottom:6px;letter-spacing:1px">RPK Studio</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Edit weapon/item menu pictures (item.rpk) &amp; rename menu labels</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">.rpk / init.stg / EXE</p>'
    +'</div>'
    // PC PATCHER TILE
    +'<div id="tilePcPatcher" style="width:220px;cursor:pointer;background:rgba(8,12,18,0.92);border:2px solid #f0b429;box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 1px rgba(240,180,41,0.3);padding:24px;border-radius:6px;text-align:center;transition:transform 0.15s,border-color 0.15s" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'#ffc63f\'" onmouseout="this.style.transform=\'\';this.style.borderColor=\'#f0b429\'">'
      +'<div style="font-size:38px;margin-bottom:8px">🩹</div>'
      +'<h2 style="color:#f0b429;font-size:14px;margin-bottom:6px;letter-spacing:1px">PC Patcher</h2>'
      +'<p style="color:#aac;font-size:10px;line-height:1.4;margin-bottom:10px">Expand the mgsi.exe texture table 512 &#8594; 1024 slots — fixes crashes from swapped-in characters</p>'
      +'<p style="color:#778;font-size:9px;font-style:italic">mgsi.exe (SLPM-86247 Integral)</p>'
    +'</div>'
  +'</div>'
+'</div>'
+'<input type="file" id="fi" accept=".hzm" multiple style="display:none">'
+'</div>';
document.getElementById("app").ondragover=function(e){e.preventDefault()};
document.getElementById("app").ondrop=function(e){e.preventDefault();if(e.dataTransfer.files.length>0)hFiles(e.dataTransfer.files)};
document.getElementById("tileStage").onclick=function(){openStageEditor()};
document.getElementById("tileAnim").onclick=function(){openAnimSwapper()};
document.getElementById("tileSound").onclick=function(){openSoundSwapper()};
document.getElementById("tilePsxTex").onclick=function(){openPsxTextureViewer()};
document.getElementById("tileAttr").onclick=function(){openAttributeChanger()};
document.getElementById("tileCodec").onclick=function(){openCodecEditor()};
document.getElementById("tileSgt").onclick=function(){openSgtEditor()};
document.getElementById("tileRpk").onclick=function(){openRpkStudio()};
document.getElementById("tileArch").onclick=function(){openArchiveTool()};
document.getElementById("tilePcPatcher").onclick=function(){openPcPatcher()};
document.getElementById("fi").onchange=function(e){if(e.target.files.length>0)hFiles(e.target.files)}}

// ===== Sight (.sgt) Editor — embedded standalone tool, isolated in an iframe =====
var SGT_EDITOR_HTML_B64="PCFkb2N0eXBlIGh0bWw+CjwhLS0KPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KICBTR1QgU2lnaHQgVmlld2VyIC8gRWRpdG9yCiAgU2luZ2xlLWZpbGUuIE5vIGJ1aWxkLCBubyBkZXBlbmRlbmNpZXMuIE9wZW4gaW4gYW55IG1vZGVybiBicm93c2VyLgoKICBXSEFUIElUIElTCiAgICBWaWV3cyBhbmQgZWRpdHMgTUdTMSAoUFNYKSAiLnNndCIgZmlsZXMg4oCUIHRoZSB3ZWFwb24tc2lnaHQgLyBzY29wZSAvIEhVRAogICAgdmVjdG9yIGRpc3BsYXkgbGlzdHMuIExvYWRzIGEgcmF3IC5zZ3QsIG9yIGEgd2hvbGUgLnN0ZyAvIFNUQUdFLkRJUiAvIC5kYXIKICAgIGFuZCBwdWxscyBldmVyeSAncycgbWVtYmVyIG91dCBvZiBpdCAoaW5jbHVkaW5nIHRoZSAxNiByZXNpZGVudCBzaWdodHMgaW5zaWRlCiAgICBpbml0J3MgREFSKS4gUmVuZGVycyBlYWNoIG92ZXIgYSBuZXV0cmFsIGZpZWxkIHRoZSB3YXkgdGhlIEdQVSBjb21wb3NpdGVzIGl0LAogICAgbGV0cyB5b3UgZHJhZyB2ZXJ0aWNlcyBhbmQgZWRpdCBjb2xvcnMsIGFuZCBleHBvcnRzIGEgdmFsaWQgLnNndC4KCiAgQ1JFRElUCiAgICBUaGUgLnNndCBmb3JtYXQgd2FzIHJldmVyc2UtZW5naW5lZXJlZCBieSBvdGFjMG4gKHVuU0dULmxpbnEpLiBUaGUgcGFyc2VyCiAgICBoZXJlIGlzIGEgZGlyZWN0IHBvcnQgb2YgdGhhdCB3b3JrLiBUaGlzIHRvb2wgYWRkcyBhIGJ5dGUtZmFpdGhmdWwgcm91bmQtdHJpcAogICAgV1JJVEVSICsgYW4gZWRpdG9yIG9uIHRvcCBvZiB0aGUgcmVhZC1vbmx5IG9yaWdpbmFsLgoKICBGT1JNQVQgKHZlcmlmaWVkIGFnYWluc3QgYWxsIDY0IC5zZ3QgbWVtYmVycyBvbiBhIHJldGFpbCBkaXNjKQogICAgSGVhZGVyICgyNCBieXRlcyk6CiAgICAgIDB4MDAgdTE2IGRhdGFTaXplICAgICBleHRlbnQgb2YgZGF0YSBzZWN0aW9uID0gbWF4KHJvdy5vZmZzZXQgKyByb3dTaXplKQogICAgICAweDAyIHU4ICB1bmtub3duMQogICAgICAweDAzIHU4ICByb3dDb3VudAogICAgICAweDA0IHUzMiB0YWJsZU9mZnNldCAgKD0gMjQpCiAgICAgIDB4MDggdTMyIGRhdGFPZmZzZXQgICAoPSAyNCArIHJvd0NvdW50KjQpCiAgICAgIDB4MEMgdTMyIHB0cjMgXCAgYWJzb2x1dGUgb2Zmc2V0cyBpbnRvIHRoZSB0cmFpbGVyIHRoYXQgYmVnaW5zIGF0CiAgICAgIDB4MTAgdTMyIHB0cjQgID4gZGF0YU9mZnNldCtkYXRhU2l6ZS4gcHRyMyA9PSBkYXRhT2Zmc2V0K2RhdGFTaXplIGZvciBldmVyeQogICAgICAweDE0IHUzMiBwdHI1IC8gIGZpbGU7IHB0cjQvcHRyNSBpbmRleCBmdXJ0aGVyIGluIChvZnRlbiBlcXVhbCB0byBwdHIzKS4KICAgIFRhYmxlIChyb3dDb3VudCAqIDQpIEAgdGFibGVPZmZzZXQ6CiAgICAgIHU4IG9yZGVyLCB1OCBjb2xvclMsIHUxNiBvZmZzZXQgICAob2Zmc2V0IG9mIHRoaXMgcm93J3MgZGF0YSBpbiBkYXRhIHNlY3Rpb24pCiAgICBEYXRhIEAgZGF0YU9mZnNldCArIHJvdy5vZmZzZXQ6CiAgICAgIHUzMiBzaGFwZSwgVmVydGV4MCB7UkdCQSA0QiwgVmVjMiA0Qn0sIHRoZW4gcGVyLXNoYXBlIGV4dHJhOgogICAgICAgIDMgICBsaW5lICAgICAgICAgKyAxIFZlYzIgICAgICAgICAgICAgICAgICAgICgxNkIpCiAgICAgICAgNSAgIHBvbHlGaWxsZWQgICArIDMgVmVjMiAgICAgICAgICAgICAgICAgICAgKDI0QikgIGUyPT0weDU1NTUgLT4gdHJpYW5nbGUKICAgICAgICA2ICAgcG9seUxpbmUgICAgICsgMyBWZWMyICAgICAgICAgICAgICAgICAgICAoMjRCKSAgZWRnZS1mbiB3aW5kaW5nIHBpY2tzCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZW4gcG9seWxpbmUgdnMgb3V0bGluZQogICAgICAgIDggICBtZXNoR3JhZGllbnQgKyAzIFZlcnRleCAoUkdCQStWZWMyIGVhLikgICgzNkIpICBnb3VyYXVkIHF1YWQKICAgICAgICAyNTUgdGV4dCAgICAgICAgICsgMTYgYnl0ZXMgQVNDSUkgICAgICAgICAgICAoMjhCKQogICAgICBWZWMyIHt1MTYgdSwgdTE2IHZ9OyAweDU1NTUgaW4gZWl0aGVyIGF4aXMgPSAibm8gdmVydGV4Ii4gQ29vcmRzIGFyZSAxMi1iaXQKICAgICAgU0lHTkVEIChzdG9yZWQgMC4uNDA5NTsgdmFsdWVzID49IDIwNDggYXJlIG5lZ2F0aXZlLCByYXctNDA5NikgaW4gMzIweDIyNAogICAgICBzY3JlZW4gc3BhY2UsIHNvIEhVRCBlbGVtZW50cyBjYW4gYmxlZWQgb2ZmIHRoZSB0b3AvbGVmdCBlZGdlLiBbY3JlZGl0OiBvdGFjMG5dCiAgICAgIERpc3BsYXkgd2luZGluZzogcG9seUZpbGxlZCAmIG1lc2ggcmVvcmRlciB0byBbdjAsdjEsdjMsdjJdOyBwb2x5TGluZSBrZWVwcwogICAgICBmaWxlIG9yZGVyLgogICAgVHJhaWxlciBAIGRhdGFPZmZzZXQrZGF0YVNpemUgLi4gRU9GOgogICAgICBTZWNvbmRhcnkgc3RydWN0dXJlIHJlZmVyZW5jZWQgYnkgcHRyMy80LzUuIFNob3dzIHVwIGFzIHByaW1pdGl2ZS1pbmRleAogICAgICBsaXN0cyAoZS5nLiAwMSAwMiAwNCAwMyAuLi4pLCBsZW5ndGggMC4ufjcwMEIuIE5PVCBwYWRkaW5nLgoKICBXUklURVIgU1RSQVRFR1kKICAgIEVkaXRpbmcgZXhpc3RpbmcgcHJpbWl0aXZlcyAobW92ZSAvIHJlY29sb3IgLyByZXRleHQgLyBhbHBoYT0wIHRvIGhpZGUpIGNsb25lcwogICAgdGhlIHNvdXJjZSBhbmQgcGF0Y2hlcyBvbmx5IHRoZSBjaGFuZ2VkIGZpZWxkcyAtPiBieXRlLWlkZW50aWNhbCBleGNlcHQgeW91cgogICAgZWRpdHMuIH5oYWxmIHRoZSBmaWxlcyBoYXZlIGEgc21hbGwgaW50ZXJuYWwgZ2FwIGJlZm9yZSB0aGUgbGFzdCByb3cgKGRhdGFTaXplCiAgICBpcyB0aGUgZXh0ZW50LCBub3QgdGhlIHN1bSBvZiByb3cgc2l6ZXMpLCBzbyB0aGUgY2xvbmUgYXBwcm9hY2ggcHJlc2VydmVzIHRob3NlLgoKICAgIEFQUEVORElORyBuZXcgcHJpbWl0aXZlcyBpcyBzdXBwb3J0ZWQ6IHRoZSB3cml0ZXIga2VlcHMgdGhlIGV4aXN0aW5nIGRhdGEgKyBnYXBzLAogICAgYXBwZW5kcyB0aGUgbmV3IHJvd3MsIGNvcGllcyB0aGUgdHJhaWxlciB2ZXJiYXRpbSwgYW5kIHNoaWZ0cyBwdHIzLzQvNSBieSB0aGUKICAgIGdyb3d0aC4gRXhpc3RpbmcgcHJpbWl0aXZlIGluZGljZXMgYXJlIHVuY2hhbmdlZCwgc28gdGhlIHRyYWlsZXIncyBpbmRleC1saXN0cwogICAgc3RheSB2YWxpZC4gRGVsZXRpbmcgLyBpbnNlcnRpbmcgRVhJU1RJTkcgcHJpbWl0aXZlcyBpcyBOT1QgZXhwb3NlZCAoaXQgd291bGQKICAgIHJlbnVtYmVyIHRob3NlIGluZGV4LWxpc3RzKTsgdXNlIGFscGhhPTAgdG8gaGlkZSBpbnN0ZWFkLiBBcHBlbmRlZCBwcmltaXRpdmVzCiAgICBjYW4gYmUgZGVsZXRlZCBmcmVlbHkgKHRoZXkncmUgcGFzdCBldmVyeSByZWZlcmVuY2VkIGluZGV4KS4KCiAgICBIYXJkIGZvcm1hdCBjZWlsaW5nczogMjU1IHByaW1pdGl2ZXMgKFJvd3MgaXMgdTgpOyA2NCBLQiBkYXRhIHNlY3Rpb24KICAgIChvZmZzZXRzICsgZGF0YVNpemUgYXJlIHUxNikuIFRoZSByZWFsLXdvcmxkIGxpbWl0IGlzIHRoZSBzdGFnZSdzIGNhY2hlIC8gdGhlCiAgICByZXNpZGVudCBSQU0gYnVkZ2V0LCBub3QgdGhlIGZvcm1hdC4KCiAgICBSb3VuZC10cmlwIHZlcmlmaWVkOiBwYXJzZS0+c2VyaWFsaXplIGlzIGJ5dGUtaWRlbnRpY2FsIGZvciBhbGwgNjQgc2lnaHRzIG9uCiAgICBhIHJldGFpbCBkaXNjOyBhcHBlbmQgcmVmbG93IHZlcmlmaWVkIHRvIHByZXNlcnZlIGV2ZXJ5IG9yaWdpbmFsIHByaW1pdGl2ZSBhbmQKICAgIHRoZSBmdWxsIHRyYWlsZXIuCgogIFRoZSBkZWNvZGUvcmVuZGVyL3NlcmlhbGl6ZSBsb2dpYyBsaXZlcyBpbiB0aGUgYFNHVGAgb2JqZWN0IChwYXJzZSwgc3ZnLAogIHNlcmlhbGl6ZSwgZGlzcGxheU9mLCBleHRyYWN0U3RnL0Rhci9EaXIpOyB0aGUgYEFwcGAgb2JqZWN0IGlzIGp1c3QgdGhlIFVJLgo9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQotLT4KPGh0bWwgbGFuZz0iZW4iPgo8aGVhZD4KPG1ldGEgY2hhcnNldD0idXRmLTgiPgo8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEiPgo8dGl0bGU+U0dUIMK3IFNpZ2h0IEVkaXRvcjwvdGl0bGU+CjxzdHlsZT4KICA6cm9vdHsKICAgIC0tYmc6IzA4MGIwYTsgLS1wYW5lbDojMGUxMzExOyAtLXBhbmVsMjojMTIxOTE2OyAtLWxpbmU6IzFkMjcyMzsKICAgIC0tZ3JlZW46IzdlZTc4NzsgLS1ncmVlbi1kaW06IzNmNmI0NjsgLS1hbWJlcjojZTBhMzNhOyAtLXJlZDojZTA2YzYzOyAtLWJsdWU6Izc5YzBmZjsKICAgIC0tdGV4dDojYzZkMmNiOyAtLW11dGVkOiM2OTc5NmY7IC0tZmllbGQ6Izg4ODg4ODsKICAgIC0tbW9ubzp1aS1tb25vc3BhY2UsIkpldEJyYWlucyBNb25vIiwiU0ZNb25vLVJlZ3VsYXIiLCJDYXNjYWRpYSBDb2RlIixDb25zb2xhcyxtb25vc3BhY2U7CiAgfQogICp7Ym94LXNpemluZzpib3JkZXItYm94fQogIGh0bWwsYm9keXttYXJnaW46MDtoZWlnaHQ6MTAwJX0KICBib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLXRleHQpO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxM3B4O2xpbmUtaGVpZ2h0OjEuNDU7CiAgICAtd2Via2l0LWZvbnQtc21vb3RoaW5nOmFudGlhbGlhc2VkO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47bWluLWhlaWdodDoxMDAlfQogIGF7Y29sb3I6dmFyKC0tZ3JlZW4pfQogIGhlYWRlcntib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTtwYWRkaW5nOjE0cHggMjBweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6YmFzZWxpbmU7Z2FwOjE2cHg7CiAgICBmbGV4LXdyYXA6d3JhcDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcsIzBjMTEwZiwjMDgwYjBhKX0KICAuYnJhbmR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDoxMHB4fQogIC5icmFuZCAuc3F7YWxpZ24tc2VsZjpjZW50ZXI7d2lkdGg6MTFweDtoZWlnaHQ6MTFweDtiYWNrZ3JvdW5kOnZhcigtLWdyZWVuKTtib3gtc2hhZG93OjAgMCAxMHB4IHZhcigtLWdyZWVuKTsKICAgIGFuaW1hdGlvbjpibGluayAyLjRzIHN0ZXBzKDEpIGluZmluaXRlfQogIEBrZXlmcmFtZXMgYmxpbmt7MCUsOTIle29wYWNpdHk6MX05MyUsMTAwJXtvcGFjaXR5Oi4yNX19CiAgaDF7Zm9udC1zaXplOjE1cHg7bWFyZ2luOjA7bGV0dGVyLXNwYWNpbmc6LjMyZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS10ZXh0KX0KICBoMSBie2NvbG9yOnZhcigtLWdyZWVuKX0KICAuc3Vie2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTFweDtsZXR0ZXItc3BhY2luZzouMTRlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2V9CiAgLnNwYWNlcntmbGV4OjF9CiAgLm1ldGF7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMXB4O2xldHRlci1zcGFjaW5nOi4xZW19CiAgLm1ldGEgYntjb2xvcjp2YXIoLS1hbWJlcik7Zm9udC13ZWlnaHQ6NjAwfQogIC5idG57Zm9udDppbmhlcml0O2ZvbnQtc2l6ZToxMnB4O2xldHRlci1zcGFjaW5nOi4xMmVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtjb2xvcjp2YXIoLS1iZyk7CiAgICBiYWNrZ3JvdW5kOnZhcigtLWdyZWVuKTtib3JkZXI6MDtwYWRkaW5nOjhweCAxNnB4O2N1cnNvcjpwb2ludGVyO3RyYW5zaXRpb246ZmlsdGVyIC4xMnM7cG9zaXRpb246cmVsYXRpdmU7ei1pbmRleDoxfQogIC5idG46aG92ZXJ7ZmlsdGVyOmJyaWdodG5lc3MoMS4xMil9CiAgLmJ0bjpkaXNhYmxlZHtvcGFjaXR5Oi40O2N1cnNvcjpkZWZhdWx0fQogIC5idG4uZ2hvc3R7YmFja2dyb3VuZDojMGUxMzExO2NvbG9yOnZhcigtLWdyZWVuKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWdyZWVuLWRpbSl9CiAgLmJ0bi5naG9zdDpob3Zlcntib3JkZXItY29sb3I6dmFyKC0tZ3JlZW4pO2JhY2tncm91bmQ6IzBlMWExMn0KICAuYnRuLndhcm57YmFja2dyb3VuZDojMGUxMzExO2NvbG9yOnZhcigtLWFtYmVyKTtib3JkZXI6MXB4IHNvbGlkICM1YTQ0MjF9CiAgLmJ0bi53YXJuOmhvdmVye2JvcmRlci1jb2xvcjp2YXIoLS1hbWJlcik7YmFja2dyb3VuZDojMWExNDA4fQogIG1haW57ZmxleDoxO3BhZGRpbmc6MjBweDtvdmVyZmxvdzphdXRvfQogIC5kcm9we2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUpO3BhZGRpbmc6NjBweCAyNHB4O3RleHQtYWxpZ246Y2VudGVyO2NvbG9yOnZhcigtLW11dGVkKTsKICAgIHRyYW5zaXRpb246Ym9yZGVyLWNvbG9yIC4xNXMsYmFja2dyb3VuZCAuMTVzO21heC13aWR0aDo3NjBweDttYXJnaW46NnZoIGF1dG99CiAgLmRyb3AuaG90e2JvcmRlci1jb2xvcjp2YXIoLS1ncmVlbik7YmFja2dyb3VuZDojMGMxMzBmO2NvbG9yOnZhcigtLXRleHQpfQogIC5kcm9wIGgye2ZvbnQtc2l6ZToxOHB4O2xldHRlci1zcGFjaW5nOi4yZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXRleHQpO21hcmdpbjowIDAgNnB4fQogIC5kcm9wIHB7bWFyZ2luOjZweCAwO2ZvbnQtc2l6ZToxMnB4fQogIC5kcm9wIC5hY2NlbnR7Y29sb3I6dmFyKC0tZ3JlZW4pfSAuZHJvcCBjb2Rle2NvbG9yOnZhcigtLWFtYmVyKX0KICAuZHJvcCAuaGludHttYXJnaW4tdG9wOjIycHg7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQogIC5ncmlke2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMTkwcHgsMWZyKSk7Z2FwOjE0cHh9CiAgLmNhcmR7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmJvcmRlci1jb2xvciAuMTJzLHRyYW5zZm9ybSAuMTJzOwogICAgZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbn0KICAuY2FyZDpob3Zlcntib3JkZXItY29sb3I6dmFyKC0tZ3JlZW4tZGltKTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMnB4KX0KICAuY2FyZC5kaXJ0eXtib3JkZXItY29sb3I6dmFyKC0tYW1iZXIpfQogIC5jYXJkIC52aWV3e2JhY2tncm91bmQ6dmFyKC0tZmllbGQpO3Bvc2l0aW9uOnJlbGF0aXZlfQogIC5jYXJkIC52aWV3IHN2Z3tkaXNwbGF5OmJsb2NrO3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99CiAgLmNhcmQgLmNhcHtwYWRkaW5nOjhweCAxMHB4O2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lfQogIC5jYXJkIC5uYW1le2NvbG9yOnZhcigtLWdyZWVuKTtmb250LXNpemU6MTJweH0gLmNhcmQuZGlydHkgLm5hbWV7Y29sb3I6dmFyKC0tYW1iZXIpfQogIC5jYXJkIC5zcmN7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMHB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZX0KICAuY2FyZCAubntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEwcHh9CiAgLnNjYW57cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtwb2ludGVyLWV2ZW50czpub25lO21peC1ibGVuZC1tb2RlOm92ZXJsYXk7b3BhY2l0eTouNTsKICAgIGJhY2tncm91bmQ6cmVwZWF0aW5nLWxpbmVhci1ncmFkaWVudCgwZGVnLHJnYmEoMCwwLDAsLjIyKSAwIDFweCx0cmFuc3BhcmVudCAxcHggM3B4KX0KICAvKiBkZXRhaWwgLyBlZGl0b3IgKi8KICAuZGV0YWlse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7YmFja2dyb3VuZDpyZ2JhKDYsOSw4LC45NSk7ZGlzcGxheTpub25lO3otaW5kZXg6MjA7cGFkZGluZzoxOHB4fQogIC5kZXRhaWwub3BlbntkaXNwbGF5OmZsZXg7Z2FwOjE2cHg7YWxpZ24taXRlbXM6c3RyZXRjaH0KICAuc3RhZ2V7ZmxleDoxO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47bWluLXdpZHRoOjB9CiAgLmJhcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMnB4O3BhZGRpbmc6MCAycHggMTJweDtmbGV4LXdyYXA6d3JhcH0KICAuYmFyIC50aXRsZXtjb2xvcjp2YXIoLS1ncmVlbik7bGV0dGVyLXNwYWNpbmc6LjFlbTtmb250LXNpemU6MTVweH0KICAuYmFyIC50aXRsZS5kaXJ0eXtjb2xvcjp2YXIoLS1hbWJlcil9CiAgLmJhciAuZGltc3tjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjExcHg7dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlfQogIC5iYXIgLmdycHtkaXNwbGF5OmZsZXg7Z2FwOjhweDttYXJnaW4tbGVmdDphdXRvfQogIC5yZW5kZXJ7ZmxleDoxO2JhY2tncm91bmQ6dmFyKC0tZmllbGQpO3Bvc2l0aW9uOnJlbGF0aXZlO2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjsKICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7b3ZlcmZsb3c6aGlkZGVufQogIC5yZW5kZXIgc3Zne21heC13aWR0aDoxMDAlO21heC1oZWlnaHQ6MTAwJTt3aWR0aDphdXRvO2hlaWdodDphdXRvO3RvdWNoLWFjdGlvbjpub25lfQogIC5zaWRle3dpZHRoOjMzMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHg7bWluLWhlaWdodDowfQogIC5wYW5lbGJveHtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tcGFuZWwpO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47bWluLWhlaWdodDowfQogIC5wYW5lbGJveCAuaGVhZHtwYWRkaW5nOjlweCAxMnB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTFweDsKICAgIGxldHRlci1zcGFjaW5nOi4xNGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47YWxpZ24taXRlbXM6Y2VudGVyfQogIC5yb3dze292ZXJmbG93OmF1dG99CiAgLmluc3B7ZmxleDoxO21pbi1oZWlnaHQ6MTIwcHh9CiAgLnJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI0cHggNzBweCAxZnI7Z2FwOjhweDtwYWRkaW5nOjZweCAxMnB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkICMxMzFhMTc7CiAgICBmb250LXNpemU6MTFweDthbGlnbi1pdGVtczpjZW50ZXI7Y3Vyc29yOnBvaW50ZXJ9CiAgLnJvdzpob3Zlciwucm93LmhvdHtiYWNrZ3JvdW5kOiMxMDIzMTY4MH0KICAucm93LnNlbHtiYWNrZ3JvdW5kOiMxMzM1MWY7b3V0bGluZToxcHggc29saWQgdmFyKC0tZ3JlZW4tZGltKTtvdXRsaW5lLW9mZnNldDotMXB4fQogIC5yb3cgLml4e2NvbG9yOnZhcigtLW11dGVkKX0gLnJvdyAuY297Y29sb3I6dmFyKC0tbXV0ZWQpO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO3doaXRlLXNwYWNlOm5vd3JhcH0KICAuc3d7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6MTBweDtoZWlnaHQ6MTBweDtib3JkZXI6MXB4IHNvbGlkICMwMDA2O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KICAudHktcG9seWdvbntjb2xvcjp2YXIoLS1ncmVlbil9IC50eS1tZXNoe2NvbG9yOnZhcigtLWFtYmVyKX0KICAudHktbGluZSwudHktcG9seWxpbmUsLnR5LXBvbHlvdXRsaW5le2NvbG9yOnZhcigtLWJsdWUpfSAudHktdGV4dHtjb2xvcjojZTA2YzlhfQogIC5lZGl0e3BhZGRpbmc6MH0KICAuZWRpdCAuYm9keXtwYWRkaW5nOjEycHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KICAuZWRpdC5lbXB0eSAuYm9keXtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjExcHh9CiAgLmZpZWxke2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjVweH0KICAuZmllbGQ+bGFiZWx7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMHB4O2xldHRlci1zcGFjaW5nOi4xZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlfQogIC52cm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTFweH0KICAudnJvdyBpbnB1dFt0eXBlPWNvbG9yXXt3aWR0aDoyOHB4O2hlaWdodDoyMnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDpub25lO3BhZGRpbmc6MDtjdXJzb3I6cG9pbnRlcn0KICAudnJvdyBpbnB1dFt0eXBlPW51bWJlcl17d2lkdGg6NTZweDtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjb2xvcjp2YXIoLS10ZXh0KTsKICAgIGZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTFweDtwYWRkaW5nOjNweCA1cHh9CiAgLnZyb3cgLmxhYntjb2xvcjp2YXIoLS1tdXRlZCk7d2lkdGg6NjBweH0KICAudnJvdyBpbnB1dFt0eXBlPXJhbmdlXXtmbGV4OjE7YWNjZW50LWNvbG9yOnZhcigtLWdyZWVuKX0KICAudnJvdyAuYXZ7Y29sb3I6dmFyKC0tbXV0ZWQpO3dpZHRoOjMwcHg7dGV4dC1hbGlnbjpyaWdodH0KICAucHRsaXN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweH0KICAucHR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2ZvbnQtc2l6ZToxMXB4fQogIC5wdCAua3tjb2xvcjp2YXIoLS1ncmVlbi1kaW0pO3dpZHRoOjQycHh9CiAgLnB0IGlucHV0e3dpZHRoOjU0cHg7YmFja2dyb3VuZDp2YXIoLS1wYW5lbDIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tdGV4dCk7Zm9udDppbmhlcml0O2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6M3B4IDVweH0KICAuZWRpdGJ0bnN7ZGlzcGxheTpmbGV4O2dhcDo4cHg7ZmxleC13cmFwOndyYXB9CiAgLmFkZGJhcnttYXJnaW4tbGVmdDphdXRvO2Rpc3BsYXk6ZmxleDtnYXA6NXB4fQogIC5hZGRie2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMDRlbTtjb2xvcjp2YXIoLS1ncmVlbik7YmFja2dyb3VuZDojMGUxMzExO2JvcmRlcjoxcHggc29saWQgdmFyKC0tZ3JlZW4tZGltKTtwYWRkaW5nOjJweCA2cHg7Y3Vyc29yOnBvaW50ZXI7cG9zaXRpb246cmVsYXRpdmU7ei1pbmRleDoxfQogIC5hZGRiOmhvdmVye2JhY2tncm91bmQ6IzBlMWExMjtib3JkZXItY29sb3I6dmFyKC0tZ3JlZW4pfQogIC5yb3cuYWRkZWQgLml4e2NvbG9yOnZhcigtLWFtYmVyKX0KICAudG9nZ2xlc3tkaXNwbGF5OmZsZXg7Z2FwOjhweDtwYWRkaW5nOjEwcHggMTJweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTtmbGV4LXdyYXA6d3JhcH0KICAudGd7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6LjA4ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLW11dGVkKTtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lOwogICAgYm9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtwYWRkaW5nOjRweCA4cHg7YmFja2dyb3VuZDojMGUxMzExO3Bvc2l0aW9uOnJlbGF0aXZlO3otaW5kZXg6MX0KICAudGcub257Y29sb3I6dmFyKC0tZ3JlZW4pO2JvcmRlci1jb2xvcjp2YXIoLS1ncmVlbi1kaW0pfQogIC5wcmltLmZsYXNoe3N0cm9rZTp2YXIoLS1ncmVlbikhaW1wb3J0YW50O3N0cm9rZS13aWR0aDoyLjVweCFpbXBvcnRhbnQ7cGFpbnQtb3JkZXI6c3Ryb2tlfQogIC5wcmltLnNlbGVjdGVke3N0cm9rZTp2YXIoLS1hbWJlcikhaW1wb3J0YW50O3N0cm9rZS13aWR0aDoxLjVweCFpbXBvcnRhbnQ7cGFpbnQtb3JkZXI6c3Ryb2tlfQogIC5oYW5kbGUtZ3tjdXJzb3I6Z3JhYn0KICAuaGFuZGxlLWcuZHJhZ3tjdXJzb3I6Z3JhYmJpbmd9CiAgLmhhbmRsZS1nIC5oaXR7ZmlsbDp0cmFuc3BhcmVudDtwb2ludGVyLWV2ZW50czphbGx9CiAgLmhhbmRsZXtmaWxsOnZhcigtLWFtYmVyKTtzdHJva2U6IzAwMDtzdHJva2Utd2lkdGg6LjU7cG9pbnRlci1ldmVudHM6bm9uZX0KICAuaGFuZGxlLWc6aG92ZXIgLmhhbmRsZXtmaWxsOnZhcigtLWdyZWVuKX0KICAuaGFuZGxlLWcuZHJhZyAuaGFuZGxle2ZpbGw6dmFyKC0tZ3JlZW4pfQogIC5lbmctb3ZlcmxheXtwb2ludGVyLWV2ZW50czpub25lfQogIC5lbmctb3ZlcmxheSB0ZXh0e2ZvbnQtZmFtaWx5Om1vbm9zcGFjZX0KICAucGFsZXR0ZXtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjRweH0KICAucGFsZXR0ZSAucGN7d2lkdGg6MThweDtoZWlnaHQ6MThweDtib3JkZXI6MXB4IHNvbGlkICMwMDA4O2N1cnNvcjpwb2ludGVyfQogIC5wYWxldHRlIC5wYzpob3ZlcntvdXRsaW5lOjFweCBzb2xpZCB2YXIoLS1ncmVlbik7b3V0bGluZS1vZmZzZXQ6MXB4fQogIC5wYWxldHRlIC5wYy5lbmd7Ym9yZGVyLWNvbG9yOnZhcigtLWFtYmVyKX0KICAub2Nyb3d7ZGlzcGxheTpmbGV4O2dhcDoxNHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KICAub2Nyb3cgLmNlbGx7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQogIC5vY3JvdyAubGFie2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTBweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2V9CiAgLm9jcm93IGlucHV0e3dpZHRoOjU0cHg7YmFja2dyb3VuZDp2YXIoLS1wYW5lbDIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tdGV4dCk7Zm9udDppbmhlcml0O2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6M3B4IDVweH0KICAucHJldmlld0NhbnZhc3tpbWFnZS1yZW5kZXJpbmc6cGl4ZWxhdGVkO21heC13aWR0aDoxMDAlO21heC1oZWlnaHQ6MTAwJTt3aWR0aDphdXRvO2hlaWdodDphdXRvfQogIC5maW5mb3tmb250LXNpemU6MTFweDtsaW5lLWhlaWdodDoxLjd9CiAgLmZpbmZvIC5re2NvbG9yOnZhcigtLW11dGVkKX0gLmZpbmZvIC52e2NvbG9yOnZhcigtLXRleHQpfQogIC5maW5mbyAubm17Y29sb3I6dmFyKC0tZ3JlZW4pfQogIC50cmFpbGVye2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLW11dGVkKTt3aGl0ZS1zcGFjZTpwcmUtd3JhcDt3b3JkLWJyZWFrOmJyZWFrLWFsbDtsaW5lLWhlaWdodDoxLjU1O21heC1oZWlnaHQ6MTUwcHg7b3ZlcmZsb3c6YXV0bzsKICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7cGFkZGluZzo4cHg7bWFyZ2luLXRvcDo2cHg7YmFja2dyb3VuZDojMGIwZjBkfQogIC50cmFpbGVyIC5zZWN7Y29sb3I6dmFyKC0tYW1iZXIpfQogIGZvb3Rlcntib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTtwYWRkaW5nOjhweCAyMHB4O2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTBweDtsZXR0ZXItc3BhY2luZzouMWVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZX0KICAuZXJye2NvbG9yOnZhcigtLXJlZCk7Zm9udC1zaXplOjExcHg7bWFyZ2luLXRvcDoxMHB4fQogIC5ub3Rle2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTBweH0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGhlYWRlcj4KICA8ZGl2IGNsYXNzPSJicmFuZCI+PHNwYW4gY2xhc3M9InNxIj48L3NwYW4+PGgxPlNHVCZuYnNwOzxiPi8vPC9iPiZuYnNwO1NpZ2h0IEVkaXRvcjwvaDE+PC9kaXY+CiAgPHNwYW4gY2xhc3M9InN1YiI+TUdTIFBTWCDCtyBlZGl0IHZlY3RvciBIVUQvc2lnaHQgZGlzcGxheSBsaXN0czwvc3Bhbj4KICA8c3BhbiBjbGFzcz0ic3BhY2VyIj48L3NwYW4+CiAgPHNwYW4gY2xhc3M9Im1ldGEiIGlkPSJtZXRhIj48L3NwYW4+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIGdob3N0IiBpZD0iY2xlYXJCdG4iIHN0eWxlPSJkaXNwbGF5Om5vbmUiPkNsZWFyPC9idXR0b24+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBpZD0ibG9hZEJ0biI+TG9hZCBmaWxlczwvYnV0dG9uPgogIDxidXR0b24gY2xhc3M9ImJ0biBnaG9zdCIgaWQ9ImV4aXRCdG4iIHRpdGxlPSJSZXR1cm4gdG8gdGhlIG1vZCBzdWl0ZSI+RXhpdDwvYnV0dG9uPgogIDxpbnB1dCB0eXBlPSJmaWxlIiBpZD0iZmlsZUlucHV0IiBtdWx0aXBsZSBhY2NlcHQ9Ii5zZ3QsLnN0ZywuZGlyLC5kYXIiIGhpZGRlbj4KPC9oZWFkZXI+Cgo8bWFpbiBpZD0ibWFpbiI+CiAgPGRpdiBjbGFzcz0iZHJvcCIgaWQ9ImRyb3AiPgogICAgPGgyPkRyb3Agc2lnaHQgZGF0YTwvaDI+CiAgICA8cD5EcmFnIDxzcGFuIGNsYXNzPSJhY2NlbnQiPi5zZ3Q8L3NwYW4+IGZpbGVzIGhlcmUsIG9yIGEgd2hvbGUgPHNwYW4gY2xhc3M9ImFjY2VudCI+LnN0Zzwvc3Bhbj4gLyA8c3BhbiBjbGFzcz0iYWNjZW50Ij5TVEFHRS5ESVI8L3NwYW4+IHRvIHB1bGwgZXZlcnkgc2lnaHQgb3V0IG9mIGl0LjwvcD4KICAgIDxwPkNsaWNrIGEgcmVzdWx0IHRvIGluc3BlY3QgYW5kIGVkaXQgaXQg4oCUIGRyYWcgcG9pbnRzLCByZWNvbG9yLCB0aGVuIGV4cG9ydCBhIHZhbGlkIDxjb2RlPi5zZ3Q8L2NvZGU+IHRvIHJlLWluamVjdCB3aXRoIDxjb2RlPm1pbnQgc3RnIHBhdGNoPC9jb2RlPi48L3A+CiAgICA8ZGl2IGNsYXNzPSJoaW50Ij5FeHBvcnRzIGFyZSBieXRlLWlkZW50aWNhbCB0byB0aGUgc291cmNlIGV4Y2VwdCB0aGUgdmFsdWVzIHlvdSBjaGFuZ2UuPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJlcnIiPjwvZGl2PgogIDwvZGl2PgogIDxkaXYgY2xhc3M9ImdyaWQiIGlkPSJncmlkIiBzdHlsZT0iZGlzcGxheTpub25lIj48L2Rpdj4KPC9tYWluPgoKPGRpdiBjbGFzcz0iZGV0YWlsIiBpZD0iZGV0YWlsIj4KICA8ZGl2IGNsYXNzPSJzdGFnZSI+CiAgICA8ZGl2IGNsYXNzPSJiYXIiPgogICAgICA8c3BhbiBjbGFzcz0idGl0bGUiIGlkPSJkVGl0bGUiPjwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9ImRpbXMiIGlkPSJkRGltcyI+PC9zcGFuPgogICAgICA8ZGl2IGNsYXNzPSJncnAiPgogICAgICAgIDxzcGFuIGNsYXNzPSJ0ZyIgaWQ9ImVkaXRUZyI+RWRpdCBtb2RlPC9zcGFuPgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBnaG9zdCIgaWQ9InVuZG9CdG4iIGRpc2FibGVkPlVuZG88L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gZ2hvc3QiIGlkPSJyZWRvQnRuIiBkaXNhYmxlZD5SZWRvPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHdhcm4iIGlkPSJyZXNldEJ0biIgZGlzYWJsZWQ+UmVzZXQ8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4iIGlkPSJleHBvcnRCdG4iPkV4cG9ydCAuc2d0PC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGdob3N0IiBpZD0iZENsb3NlIj5DbG9zZTwvYnV0dG9uPgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icmVuZGVyIiBpZD0iZFJlbmRlciI+PC9kaXY+CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0ic2lkZSI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbGJveCBlZGl0IGVtcHR5IiBpZD0iZWRpdFBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0iaGVhZCI+PHNwYW4gaWQ9ImVkaXRIZWFkIj5TZWxlY3RlZCBwcmltaXRpdmU8L3NwYW4+IDxzcGFuIGlkPSJzZWxJZCIgc3R5bGU9ImNvbG9yOnZhcigtLWFtYmVyKSI+PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJib2R5IiBpZD0iZWRpdEJvZHkiPlNlbGVjdCBhIHByaW1pdGl2ZSB0byBlZGl0LiBUdXJuIG9uIDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncmVlbikiPkVkaXQgbW9kZTwvc3Bhbj4gdG8gZHJhZyBpdHMgcG9pbnRzLjwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbGJveCBpbnNwIj4KICAgICAgPGRpdiBjbGFzcz0iaGVhZCI+UHJpbWl0aXZlcyA8c3BhbiBpZD0iZENvdW50IiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JlZW4pIj48L3NwYW4+CiAgICAgICAgPHNwYW4gY2xhc3M9ImFkZGJhciI+PGJ1dHRvbiBjbGFzcz0iYWRkYiIgZGF0YS1hZGQ9ImxpbmUiPitsaW5lPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYWRkYiIgZGF0YS1hZGQ9InBvbHlnb24iPitwb2x5PC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYWRkYiIgZGF0YS1hZGQ9Im1lc2giPitncmFkPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYWRkYiIgZGF0YS1hZGQ9InRleHQiPit0ZXh0PC9idXR0b24+PC9zcGFuPgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icm93cyIgaWQ9ImRSb3dzIj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0idG9nZ2xlcyI+CiAgICAgICAgPHNwYW4gY2xhc3M9InRnIG9uIiBkYXRhLXQ9ImdyYWQiPkdyYWRpZW50czwvc3Bhbj4KICAgICAgICA8c3BhbiBjbGFzcz0idGcgb24iIGRhdGEtdD0iZmlsbCI+RmlsbHM8L3NwYW4+CiAgICAgICAgPHNwYW4gY2xhc3M9InRnIG9uIiBkYXRhLXQ9InNjYW4iPlNjYW5saW5lczwvc3Bhbj4KICAgICAgICA8c3BhbiBjbGFzcz0idGciIGRhdGEtdD0id2lyZSI+V2lyZWZyYW1lPC9zcGFuPgogICAgICAgIDxzcGFuIGNsYXNzPSJ0ZyIgZGF0YS10PSJnb3VyYXVkIj5UcnVlIGdyYWRpZW50PC9zcGFuPgogICAgICAgIDxzcGFuIGNsYXNzPSJ0ZyIgZGF0YS10PSJvdmVybGF5Ij5FbmdpbmUgb3ZlcmxheTwvc3Bhbj4KICAgICAgICA8c3BhbiBjbGFzcz0idGciIGRhdGEtdD0ic25hcCI+U25hcCA0cHg8L3NwYW4+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+CjwvZGl2PgoKPGZvb3Rlcj5Gb3JtYXQgY3JhY2s6IG90YWMwbiDCtyB3cml0ZXIgcHJlc2VydmVzIGhlYWRlcnMsIGdhcHMgJiBpbmRleC1saXN0IHRyYWlsZXJzIMK3IG9ubHkgZWRpdGVkIGJ5dGVzIGNoYW5nZTwvZm9vdGVyPgoKPHNjcmlwdD4KLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQogKiBTR1Qg4oCUIHBhcnNlciAocmF3IGZpZWxkIG1vZGVsKSArIHJlbmRlcmVyICsgYnl0ZS1mYWl0aGZ1bCBzZXJpYWxpemVyCiAqIHdpbmRvdy5TR1QgIGRyb3AtaW4gbW9kdWxlCiAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovCmNvbnN0IFNHVCA9ICgoKSA9PiB7CiAgY29uc3QgU0VOVD0weDU1NTU7CiAgY29uc3QgaXNOYW49cD0+cC51PT09U0VOVHx8cC52PT09U0VOVDsKICAvLyBWZWMyIGNvb3JkcyBhcmUgMTItYml0IHNpZ25lZDogc3RvcmVkIDAuLjQwOTUsIHZhbHVlcyA+PSAyMDQ4IGFyZSBuZWdhdGl2ZSAocmF3LTQwOTYpLgogIGNvbnN0IGRlYz1jPT4oYyE9PVNFTlQmJmM+PTIwNDgpP2MtNDA5NjpjOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmF3IHUxNiAtPiBzaWduZWQKICBjb25zdCBlbmM9cz0+e3M9TWF0aC5tYXgoLTIwNDgsTWF0aC5taW4oMjA0NyxNYXRoLnJvdW5kKHMpKSk7cmV0dXJuIHM8MD9zKzQwOTY6czt9OyAvLyBzaWduZWQgLT4gcmF3IHUxNgogIGNvbnN0IGVkZ2U9KGEsYixjKT0+KGMudS1hLnUpKihiLnYtYS52KS0oYy52LWEudikqKGIudS1hLnUpOwogIGNvbnN0IFNJWkVTPXszOjE2LDU6MjQsNjoyNCw4OjM2LDI1NToyOH07CgogIGZ1bmN0aW9uIHBhcnNlKGJ1Zil7CiAgICBjb25zdCBkdj1uZXcgRGF0YVZpZXcoYnVmLmJ1ZmZlcixidWYuYnl0ZU9mZnNldCxidWYuYnl0ZUxlbmd0aCk7CiAgICBpZihidWYuYnl0ZUxlbmd0aDwyNCkgdGhyb3cgbmV3IEVycm9yKCd0b28gc21hbGwnKTsKICAgIGNvbnN0IGRhdGFTaXplPWR2LmdldFVpbnQxNigwLHRydWUpLCB1bmtub3duMT1kdi5nZXRVaW50OCgyKSwgcm93cz1kdi5nZXRVaW50OCgzKTsKICAgIGNvbnN0IHRhYmxlT2ZmPWR2LmdldFVpbnQzMig0LHRydWUpLCBkYXRhT2ZmPWR2LmdldFVpbnQzMig4LHRydWUpOwogICAgY29uc3QgdTI9ZHYuZ2V0VWludDMyKDEyLHRydWUpLCB1Mz1kdi5nZXRVaW50MzIoMTYsdHJ1ZSksIHU0PWR2LmdldFVpbnQzMigyMCx0cnVlKTsKICAgIGlmKHRhYmxlT2ZmK3Jvd3MqND5idWYuYnl0ZUxlbmd0aHx8ZGF0YU9mZj5idWYuYnl0ZUxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdiYWQgaGVhZGVyIG9mZnNldHMnKTsKICAgIGNvbnN0IHZlYzI9bz0+KHt1OmR2LmdldFVpbnQxNihvLHRydWUpLHY6ZHYuZ2V0VWludDE2KG8rMix0cnVlKX0pOwogICAgY29uc3QgcmdiYT1vPT4oe3I6ZHYuZ2V0VWludDgobyksZzpkdi5nZXRVaW50OChvKzEpLGI6ZHYuZ2V0VWludDgobysyKSxhOmR2LmdldFVpbnQ4KG8rMyl9KTsKICAgIGNvbnN0IHByaW1zPVtdOwogICAgZm9yKGxldCBpPTA7aTxyb3dzO2krKyl7CiAgICAgIGNvbnN0IHQ9dGFibGVPZmYraSo0OwogICAgICBjb25zdCBvcmRlcj1kdi5nZXRVaW50OCh0KSxjb2xvclM9ZHYuZ2V0VWludDgodCsxKSxvZmY9ZHYuZ2V0VWludDE2KHQrMix0cnVlKTsKICAgICAgbGV0IG89ZGF0YU9mZitvZmY7IGNvbnN0IHNoYXBlPWR2LmdldFVpbnQzMihvLHRydWUpOwogICAgICBpZighU0laRVNbc2hhcGVdKSB0aHJvdyBuZXcgRXJyb3IoJ3Vua25vd24gc2hhcGUgJytzaGFwZSk7CiAgICAgIGNvbnN0IGNvbG9yPXJnYmEobys0KSwgcHQwPXZlYzIobys4KTsgbys9MTI7CiAgICAgIGNvbnN0IHA9e2ksb3JkZXIsY29sb3JTLG9mZixzaGFwZSxjb2xvcixwb2ludHM6W3B0MF0sZXh0Q29sb3JzOm51bGwsdGV4dEJ5dGVzOm51bGwsdGV4dDpudWxsLHR5cGU6bnVsbH07CiAgICAgIGlmKHNoYXBlPT09Myl7IHAucG9pbnRzLnB1c2godmVjMihvKSk7IHAudHlwZT0nbGluZSc7IH0KICAgICAgZWxzZSBpZihzaGFwZT09PTUpeyBwLnBvaW50cy5wdXNoKHZlYzIobyksdmVjMihvKzQpLHZlYzIobys4KSk7CiAgICAgICAgcC50eXBlPWlzTmFuKHAucG9pbnRzWzNdKT8ncG9seWxpbmUnOidwb2x5Z29uJzsgfQogICAgICBlbHNlIGlmKHNoYXBlPT09Nil7IHAucG9pbnRzLnB1c2godmVjMihvKSx2ZWMyKG8rNCksdmVjMihvKzgpKTsKICAgICAgICBjb25zdCB3YT1NYXRoLnNpZ24oZWRnZShwLnBvaW50c1swXSxwLnBvaW50c1sxXSxwLnBvaW50c1syXSkpLHdiPU1hdGguc2lnbihlZGdlKHAucG9pbnRzWzFdLHAucG9pbnRzWzNdLHAucG9pbnRzWzJdKSk7CiAgICAgICAgcC50eXBlPXdhPT09d2I/J3BvbHlsaW5lJzoncG9seW91dGxpbmUnOyB9CiAgICAgIGVsc2UgaWYoc2hhcGU9PT04KXsgcC5leHRDb2xvcnM9W107IGZvcihsZXQgaz0wO2s8MztrKyspe2NvbnN0IGI9bytrKjg7cC5leHRDb2xvcnMucHVzaChyZ2JhKGIpKTtwLnBvaW50cy5wdXNoKHZlYzIoYis0KSk7fSBwLnR5cGU9J21lc2gnOyB9CiAgICAgIGVsc2UgaWYoc2hhcGU9PT0yNTUpeyBjb25zdCBieT1bXTtmb3IobGV0IGs9MDtrPDE2O2srKylieS5wdXNoKGR2LmdldFVpbnQ4KG8raykpO3AudGV4dEJ5dGVzPWJ5O3AudGV4dD1TdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmJ5LmZpbHRlcihjPT5jKSk7cC50eXBlPSd0ZXh0JzsgfQogICAgICBwcmltcy5wdXNoKHApOwogICAgfQogICAgcmV0dXJuIHtyb3dzLHRhYmxlT2ZmLGRhdGFPZmYsZGF0YVNpemUsdW5rbm93bjEsdTIsdTMsdTQscHJpbXMsX2J1ZjpuZXcgVWludDhBcnJheShidWYpfTsKICB9CgogIC8vIGRlcml2ZSBvbi1zY3JlZW4gZHJhdyBvcmRlciArIGNvbG9ycyBmcm9tIHRoZSByYXcgbW9kZWwgKGNvb3JkcyBkZWNvZGVkIHRvIHNpZ25lZCkKICBmdW5jdGlvbiBkaXNwbGF5T2YocCl7CiAgICBjb25zdCBEPXE9Pih7dTpkZWMocS51KSx2OmRlYyhxLnYpfSk7CiAgICBpZihwLnR5cGU9PT0nbGluZScpIHJldHVybiB7cHRzOltwLnBvaW50c1swXSxwLnBvaW50c1sxXV0ubWFwKEQpLHN0cm9rZTp0cnVlfTsKICAgIGlmKHAudHlwZT09PSdwb2x5bGluZScpewogICAgICBjb25zdCBwdHM9KHAuc2hhcGU9PT01P1twLnBvaW50c1swXSxwLnBvaW50c1sxXSxwLnBvaW50c1syXV06W3AucG9pbnRzWzBdLHAucG9pbnRzWzFdLHAucG9pbnRzWzJdLHAucG9pbnRzWzNdXSkuZmlsdGVyKHE9PiFpc05hbihxKSkubWFwKEQpOwogICAgICByZXR1cm4ge3B0cyxzdHJva2U6dHJ1ZX07CiAgICB9CiAgICBpZihwLnR5cGU9PT0ncG9seW91dGxpbmUnKSByZXR1cm4ge3B0czpbcC5wb2ludHNbMF0scC5wb2ludHNbMV0scC5wb2ludHNbMl0scC5wb2ludHNbM11dLmZpbHRlcihxPT4haXNOYW4ocSkpLm1hcChEKSxzdHJva2U6dHJ1ZSxjbG9zZWQ6dHJ1ZX07CiAgICBpZihwLnR5cGU9PT0ncG9seWdvbicpIHJldHVybiB7cHRzOltwLnBvaW50c1swXSxwLnBvaW50c1sxXSxwLnBvaW50c1szXSxwLnBvaW50c1syXV0uZmlsdGVyKHE9PiFpc05hbihxKSkubWFwKEQpLGZpbGw6dHJ1ZX07CiAgICBpZihwLnR5cGU9PT0nbWVzaCcpIHJldHVybiB7cHRzOltwLnBvaW50c1swXSxwLnBvaW50c1sxXSxwLnBvaW50c1szXSxwLnBvaW50c1syXV0ubWFwKEQpLAogICAgICBjb2xzOltwLmNvbG9yLHAuZXh0Q29sb3JzWzBdLHAuZXh0Q29sb3JzWzJdLHAuZXh0Q29sb3JzWzFdXSxtZXNoOnRydWV9OwogICAgaWYocC50eXBlPT09J3RleHQnKSByZXR1cm4ge3B0czpbRChwLnBvaW50c1swXSldLHRleHQ6cC50ZXh0fTsKICAgIHJldHVybiB7cHRzOltEKHAucG9pbnRzWzBdKV19OwogIH0KCiAgY29uc3QgY3NzPWM9PmByZ2JhKCR7Yy5yfSwke2MuZ30sJHtjLmJ9LCR7KGMuYS8yNTUpLnRvRml4ZWQoMyl9KWA7CiAgY29uc3QgcHM9cHRzPT5wdHMubWFwKHA9PmAke3AudX0sJHtwLnZ9YCkuam9pbignICcpOwogIGZ1bmN0aW9uIGVzYyhzKXtyZXR1cm4gKHN8fCcnKS5yZXBsYWNlKC9bJjw+XS9nLGM9Pih7JyYnOicmYW1wOycsJzwnOicmbHQ7JywnPic6JyZndDsnfVtjXSkpO30KCiAgZnVuY3Rpb24gc3ZnKHBhcnNlZCxvcHRzPXt9KXsKICAgIGNvbnN0IHtncmFkPXRydWUsZmlsbD10cnVlLHdpcmU9ZmFsc2Usc2VsPS0xLGhhbmRsZXM9ZmFsc2Usdmlld0JveD0nMCAwIDMyMCAyMjQnLGZyYW1lPWZhbHNlfT1vcHRzOwogICAgY29uc3QgZGVmcz1bXSxib2R5PVtdLGRlY289W107CiAgICBwYXJzZWQucHJpbXMuZm9yRWFjaChwPT57CiAgICAgIGNvbnN0IGQ9ZGlzcGxheU9mKHApOwogICAgICBjb25zdCBhdD1gY2xhc3M9InByaW0gcC0ke3AudHlwZX0ke3AuaT09PXNlbD8nIHNlbGVjdGVkJzonJ30iIGRhdGEtaT0iJHtwLml9ImA7CiAgICAgIGlmKHAudHlwZT09PSdsaW5lJyl7CiAgICAgICAgYm9keS5wdXNoKGA8bGluZSAke2F0fSB4MT0iJHtkLnB0c1swXS51fSIgeTE9IiR7ZC5wdHNbMF0udn0iIHgyPSIke2QucHRzWzFdLnV9IiB5Mj0iJHtkLnB0c1sxXS52fSIgc3Ryb2tlPSIke2NzcyhwLmNvbG9yKX0iIHN0cm9rZS13aWR0aD0iMSIvPmApOwogICAgICB9IGVsc2UgaWYocC50eXBlPT09J3BvbHlsaW5lJ3x8cC50eXBlPT09J3BvbHlvdXRsaW5lJyl7CiAgICAgICAgYm9keS5wdXNoKGA8cG9seWxpbmUgJHthdH0gcG9pbnRzPSIke3BzKGQucHRzKX0ke2QuY2xvc2VkPycgJytkLnB0c1swXS51KycsJytkLnB0c1swXS52OicnfSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIke2NzcyhwLmNvbG9yKX0iIHN0cm9rZS13aWR0aD0iMSIvPmApOwogICAgICB9IGVsc2UgaWYocC50eXBlPT09J3BvbHlnb24nKXsKICAgICAgICBjb25zdCBmPXdpcmU/J25vbmUnOihmaWxsP2NzcyhwLmNvbG9yKTonbm9uZScpLCBzdD13aXJlP2NzcyhwLmNvbG9yKTonbm9uZSc7CiAgICAgICAgYm9keS5wdXNoKGA8cG9seWdvbiAke2F0fSBwb2ludHM9IiR7cHMoZC5wdHMpfSIgZmlsbD0iJHtmfSIgc3Ryb2tlPSIke3N0fSIgc3Ryb2tlLXdpZHRoPSIke3dpcmU/MC41OjB9Ii8+YCk7CiAgICAgIH0gZWxzZSBpZihwLnR5cGU9PT0nbWVzaCcpewogICAgICAgIGlmKHdpcmV8fCFncmFkKXsKICAgICAgICAgIGNvbnN0IGE9ZC5jb2xzLnJlZHVjZSgocyxjKT0+KHtyOnMucitjLnIsZzpzLmcrYy5nLGI6cy5iK2MuYixhOnMuYStjLmF9KSx7cjowLGc6MCxiOjAsYTowfSk7CiAgICAgICAgICBjb25zdCBhdmc9e3I6YS5yLzR8MCxnOmEuZy80fDAsYjphLmIvNHwwLGE6YS5hLzR8MH07CiAgICAgICAgICBib2R5LnB1c2goYDxwb2x5Z29uICR7YXR9IHBvaW50cz0iJHtwcyhkLnB0cyl9IiBmaWxsPSIke3dpcmU/J25vbmUnOmNzcyhhdmcpfSIgc3Ryb2tlPSIke3dpcmU/Y3NzKGF2Zyk6J25vbmUnfSIgc3Ryb2tlLXdpZHRoPSIke3dpcmU/MC41OjB9Ii8+YCk7CiAgICAgICAgfSBlbHNlIHsKICAgICAgICAgIGNvbnN0IGdpZD1gZyR7cC5pfWAsYzA9ZC5jb2xzWzBdLGMyPWQuY29sc1syXTsKICAgICAgICAgIGRlZnMucHVzaChgPGxpbmVhckdyYWRpZW50IGlkPSIke2dpZH0iIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iJHtkLnB0c1swXS51fSIgeTE9IiR7ZC5wdHNbMF0udn0iIHgyPSIke2QucHRzWzJdLnV9IiB5Mj0iJHtkLnB0c1syXS52fSI+YAogICAgICAgICAgICArYDxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0icmdiKCR7YzAucn0sJHtjMC5nfSwke2MwLmJ9KSIgc3RvcC1vcGFjaXR5PSIkeyhjMC5hLzI1NSkudG9GaXhlZCgzKX0iLz5gCiAgICAgICAgICAgICtgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSJyZ2IoJHtjMi5yfSwke2MyLmd9LCR7YzIuYn0pIiBzdG9wLW9wYWNpdHk9IiR7KGMyLmEvMjU1KS50b0ZpeGVkKDMpfSIvPjwvbGluZWFyR3JhZGllbnQ+YCk7CiAgICAgICAgICBib2R5LnB1c2goYDxwb2x5Z29uICR7YXR9IHBvaW50cz0iJHtwcyhkLnB0cyl9IiBmaWxsPSJ1cmwoIyR7Z2lkfSkiLz5gKTsKICAgICAgICB9CiAgICAgIH0gZWxzZSBpZihwLnR5cGU9PT0ndGV4dCcpewogICAgICAgIGJvZHkucHVzaChgPHRleHQgJHthdH0geD0iJHtkLnB0c1swXS51fSIgeT0iJHtkLnB0c1swXS52fSIgZmlsbD0iJHtjc3MocC5jb2xvcil9IiBmb250LXNpemU9IjEwIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj4ke2VzYyhkLnRleHQpfTwvdGV4dD5gKTsKICAgICAgfQogICAgICBpZihoYW5kbGVzICYmIHAuaT09PXNlbCl7CiAgICAgICAgcC5wb2ludHMuZm9yRWFjaCgocSxrKT0+eyBpZihpc05hbihxKSlyZXR1cm47CiAgICAgICAgICBkZWNvLnB1c2goYDxnIGNsYXNzPSJoYW5kbGUtZyIgZGF0YS1pPSIke3AuaX0iIGRhdGEtaz0iJHtrfSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoJHtkZWMocS51KX0sJHtkZWMocS52KX0pIj48Y2lyY2xlIGNsYXNzPSJoaXQiIHI9IjgiLz48Y2lyY2xlIGNsYXNzPSJoYW5kbGUiIHI9IjMuNiIvPjwvZz5gKTsgfSk7CiAgICAgIH0KICAgIH0pOwogICAgY29uc3QgcHJlPWZyYW1lP2A8cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDYwLDgyLDcwLC44KSIgc3Ryb2tlLXdpZHRoPSIwLjYiLz5gOicnOwogICAgcmV0dXJuIGA8c3ZnIHZpZXdCb3g9IiR7dmlld0JveH0iIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc2hhcGUtcmVuZGVyaW5nPSJnZW9tZXRyaWNQcmVjaXNpb24iPmAKICAgICAgKyhkZWZzLmxlbmd0aD9gPGRlZnM+JHtkZWZzLmpvaW4oJycpfTwvZGVmcz5gOicnKStwcmUrYm9keS5qb2luKCcnKStkZWNvLmpvaW4oJycpK2A8L3N2Zz5gOwogIH0KCiAgY29uc3QgU0laRVNfVz17MzoxNiw1OjI0LDY6MjQsODozNiwyNTU6Mjh9OwogIGZ1bmN0aW9uIHdyaXRlUm93QXQoZHYsbyxwKXsKICAgIGR2LnNldFVpbnQzMihvLHAuc2hhcGUsdHJ1ZSk7CiAgICBkdi5zZXRVaW50OChvKzQscC5jb2xvci5yKTtkdi5zZXRVaW50OChvKzUscC5jb2xvci5nKTtkdi5zZXRVaW50OChvKzYscC5jb2xvci5iKTtkdi5zZXRVaW50OChvKzcscC5jb2xvci5hKTsKICAgIGR2LnNldFVpbnQxNihvKzgscC5wb2ludHNbMF0udSx0cnVlKTtkdi5zZXRVaW50MTYobysxMCxwLnBvaW50c1swXS52LHRydWUpOwogICAgbGV0IHE9bysxMjsKICAgIGlmKHAuc2hhcGU9PT0zKXtkdi5zZXRVaW50MTYocSxwLnBvaW50c1sxXS51LHRydWUpO2R2LnNldFVpbnQxNihxKzIscC5wb2ludHNbMV0udix0cnVlKTt9CiAgICBlbHNlIGlmKHAuc2hhcGU9PT01fHxwLnNoYXBlPT09Nil7Zm9yKGxldCBrPTE7azw9MztrKyspe2R2LnNldFVpbnQxNihxLHAucG9pbnRzW2tdLnUsdHJ1ZSk7ZHYuc2V0VWludDE2KHErMixwLnBvaW50c1trXS52LHRydWUpO3ErPTQ7fX0KICAgIGVsc2UgaWYocC5zaGFwZT09PTgpe2ZvcihsZXQgaz0wO2s8MztrKyspe2NvbnN0IGM9cC5leHRDb2xvcnNba107ZHYuc2V0VWludDgocSxjLnIpO2R2LnNldFVpbnQ4KHErMSxjLmcpO2R2LnNldFVpbnQ4KHErMixjLmIpO2R2LnNldFVpbnQ4KHErMyxjLmEpO2R2LnNldFVpbnQxNihxKzQscC5wb2ludHNbaysxXS51LHRydWUpO2R2LnNldFVpbnQxNihxKzYscC5wb2ludHNbaysxXS52LHRydWUpO3ErPTg7fX0KICAgIGVsc2UgaWYocC5zaGFwZT09PTI1NSl7Zm9yKGxldCBrPTA7azwxNjtrKyspZHYuc2V0VWludDgocStrLHAudGV4dEJ5dGVzW2tdKTt9CiAgfQoKICAvLyBzZXJpYWxpemUgaXMgUFVSRSAobmV2ZXIgbXV0YXRlcyBwYXJzZWQpLgogIC8vICAtIG5vIGFwcGVuZGVkIHByaW1zICAtPiBjbG9uZSBvcmlnaW5hbCAmIHBhdGNoIGluIHBsYWNlIChieXRlLWlkZW50aWNhbCBleGNlcHQgZWRpdHMpCiAgLy8gIC0gYXBwZW5kZWQgcHJpbXMgICAgIC0+IHJlZmxvdzoga2VlcCBleGlzdGluZyBkYXRhICsgZ2FwcywgYXBwZW5kIG5ldyByb3dzLCBjb3B5IHRoZQogIC8vICAgICAgICAgICAgICAgICAgICAgICAgICB0cmFpbGVyIHZlcmJhdGltLCBhbmQgc2hpZnQgVW5rbm93bjIvMy80IGJ5IHRoZSBncm93dGguCiAgZnVuY3Rpb24gc2VyaWFsaXplKHBhcnNlZCl7CiAgICBjb25zdCBoYXNOZXc9cGFyc2VkLnByaW1zLnNvbWUocD0+cC5vZmY9PW51bGwpOwogICAgaWYoIWhhc05ldyl7CiAgICAgIGNvbnN0IG91dD1wYXJzZWQuX2J1Zi5zbGljZSgpOyBjb25zdCBkdj1uZXcgRGF0YVZpZXcob3V0LmJ1ZmZlcik7CiAgICAgIGZvcihjb25zdCBwIG9mIHBhcnNlZC5wcmltcyl7IHdyaXRlUm93QXQoZHYscGFyc2VkLmRhdGFPZmYrcC5vZmYscCk7CiAgICAgICAgb3V0W3BhcnNlZC50YWJsZU9mZitwLmkqNF09cC5vcmRlcjsgb3V0W3BhcnNlZC50YWJsZU9mZitwLmkqNCsxXT1wLmNvbG9yUzsgfQogICAgICByZXR1cm4gb3V0OwogICAgfQogICAgY29uc3Qgb3JpZz1wYXJzZWQuX2J1ZjsKICAgIGNvbnN0IG9sZERhdGE9b3JpZy5zbGljZShwYXJzZWQuZGF0YU9mZixwYXJzZWQudTIpOyAgIC8vIGV4aXN0aW5nIGRhdGEgKGdhcHMgcHJlc2VydmVkKQogICAgY29uc3QgdHJhaWxlcj1vcmlnLnNsaWNlKHBhcnNlZC51Mik7ICAgICAgICAgICAgICAgICAgLy8gdmVyYmF0aW0g4oCUIGtlZXBzIGluZGV4LWxpc3RzIHZhbGlkCiAgICBsZXQgZGF0YUxlbj1vbGREYXRhLmxlbmd0aDsKICAgIGNvbnN0IG9mZk9mPW5ldyBNYXAoKTsKICAgIGZvcihjb25zdCBwIG9mIHBhcnNlZC5wcmltcyl7IG9mZk9mLnNldChwLCBwLm9mZiE9bnVsbD9wLm9mZjpkYXRhTGVuKTsgaWYocC5vZmY9PW51bGwpIGRhdGFMZW4rPVNJWkVTX1dbcC5zaGFwZV07IH0KICAgIGNvbnN0IFJvd3M9cGFyc2VkLnByaW1zLmxlbmd0aDsKICAgIGlmKFJvd3M+MjU1KSB0aHJvdyBuZXcgRXJyb3IoJ3RvbyBtYW55IHByaW1pdGl2ZXMgKG1heCAyNTUg4oCUIGhlYWRlciBSb3dzIGlzIGEgdTgpJyk7CiAgICBpZihkYXRhTGVuPjB4RkZGRikgdGhyb3cgbmV3IEVycm9yKCdkYXRhIHNlY3Rpb24gdG9vIGxhcmdlIChtYXggNjRLQiDigJQgb2Zmc2V0cyBhcmUgdTE2KScpOwogICAgY29uc3QgZGF0YU9mZnNldD0yNCtSb3dzKjQsIGRhdGFTaXplPWRhdGFMZW47CiAgICBjb25zdCBkYXRhPW5ldyBVaW50OEFycmF5KGRhdGFMZW4pOyBkYXRhLnNldChvbGREYXRhLDApOwogICAgY29uc3QgZGR2PW5ldyBEYXRhVmlldyhkYXRhLmJ1ZmZlcik7CiAgICBmb3IoY29uc3QgcCBvZiBwYXJzZWQucHJpbXMpIHdyaXRlUm93QXQoZGR2LG9mZk9mLmdldChwKSxwKTsKICAgIGNvbnN0IHRhYmxlPW5ldyBVaW50OEFycmF5KFJvd3MqNCk7CiAgICBwYXJzZWQucHJpbXMuZm9yRWFjaCgocCxpKT0+e2NvbnN0IG89b2ZmT2YuZ2V0KHApO3RhYmxlW2kqNF09cC5vcmRlcjt0YWJsZVtpKjQrMV09cC5jb2xvclM7dGFibGVbaSo0KzJdPW8mMjU1O3RhYmxlW2kqNCszXT0obz4+OCkmMjU1O30pOwogICAgY29uc3QgaGVhZD1uZXcgVWludDhBcnJheSgyNCk7IGNvbnN0IGh2PW5ldyBEYXRhVmlldyhoZWFkLmJ1ZmZlcik7CiAgICBodi5zZXRVaW50MTYoMCxkYXRhU2l6ZSx0cnVlKTsgaGVhZFsyXT1wYXJzZWQudW5rbm93bjF8fDA7IGhlYWRbM109Um93czsKICAgIGh2LnNldFVpbnQzMig0LDI0LHRydWUpOyBodi5zZXRVaW50MzIoOCxkYXRhT2Zmc2V0LHRydWUpOwogICAgY29uc3QgbmV3VTI9ZGF0YU9mZnNldCtkYXRhU2l6ZSwgZFU9bmV3VTItcGFyc2VkLnUyOwogICAgaHYuc2V0VWludDMyKDEyLG5ld1UyLHRydWUpOyBodi5zZXRVaW50MzIoMTYscGFyc2VkLnUzK2RVLHRydWUpOyBodi5zZXRVaW50MzIoMjAscGFyc2VkLnU0K2RVLHRydWUpOwogICAgY29uc3Qgb3V0PW5ldyBVaW50OEFycmF5KDI0K3RhYmxlLmxlbmd0aCtkYXRhLmxlbmd0aCt0cmFpbGVyLmxlbmd0aCk7CiAgICBvdXQuc2V0KGhlYWQsMCk7IG91dC5zZXQodGFibGUsMjQpOyBvdXQuc2V0KGRhdGEsMjQrdGFibGUubGVuZ3RoKTsgb3V0LnNldCh0cmFpbGVyLDI0K3RhYmxlLmxlbmd0aCtkYXRhLmxlbmd0aCk7CiAgICByZXR1cm4gb3V0OwogIH0KCiAgLyogY29udGFpbmVyIGV4dHJhY3Rpb24gKHN0Zy9kaXIvZGFyKSAqLwogIGZ1bmN0aW9uIGV4dHJhY3RTdGcoYnVmLGxhYmVsKXsKICAgIGNvbnN0IGR2PW5ldyBEYXRhVmlldyhidWYuYnVmZmVyLGJ1Zi5ieXRlT2Zmc2V0LGJ1Zi5ieXRlTGVuZ3RoKTsKICAgIGNvbnN0IGNmZz1bXTtsZXQgcD00OwogICAgd2hpbGUodHJ1ZSl7Y29uc3QgaGFzaD1kdi5nZXRVaW50MTYocCx0cnVlKSxtb2RlPWR2LmdldFVpbnQ4KHArMiksZXh0PWR2LmdldFVpbnQ4KHArMyksc2l6ZT1kdi5nZXRJbnQzMihwKzQsdHJ1ZSk7CiAgICAgIGlmKG1vZGU9PT0wKWJyZWFrO2NmZy5wdXNoKHtoYXNoLG1vZGUsZXh0LHNpemV9KTtwKz04O2lmKHA+YnVmLmJ5dGVMZW5ndGgpdGhyb3cgbmV3IEVycm9yKCdiYWQgc3RnJyk7fQogICAgY29uc3Qgb3V0PVtdO2xldCBwb3M9MjA0ODsKICAgIGZvcihsZXQgaT0wO2k8Y2ZnLmxlbmd0aDtpKyspe2NvbnN0IGM9Y2ZnW2ldOwogICAgICBpZihjLmV4dD09PTB4RkYpe3Bvcys9KDIwNDgtcG9zJTIwNDgpJTIwNDg7Y29udGludWU7fQogICAgICBsZXQgZGF0YTsKICAgICAgaWYoYy5tb2RlPT09MHg2Myl7Y29uc3QgbGVuPWNmZ1tpKzFdLnNpemUtYy5zaXplO2RhdGE9YnVmLnN1YmFycmF5KHBvcyxwb3MrbGVuKTtwb3MrPWxlbjt9CiAgICAgIGVsc2V7ZGF0YT1idWYuc3ViYXJyYXkocG9zLHBvcytjLnNpemUpO3Bvcys9Yy5zaXplO3Bvcys9KDIwNDgtcG9zJTIwNDgpJTIwNDg7fQogICAgICBpZihjLmV4dD09PTB4NzMpIG91dC5wdXNoKHtuYW1lOmAke2MuaGFzaH0uc2d0YCxzcmM6bGFiZWwsYnl0ZXM6ZGF0YX0pOwogICAgICBlbHNlIGlmKGMubW9kZT09PTB4NzIpe3RyeXtleHRyYWN0RGFyKGRhdGEsbGFiZWwpLmZvckVhY2goZT0+b3V0LnB1c2goZSkpO31jYXRjaChlKXt9fQogICAgfQogICAgcmV0dXJuIG91dDsKICB9CiAgZnVuY3Rpb24gZXh0cmFjdERhcihidWYsbGFiZWwpewogICAgY29uc3QgZHY9bmV3IERhdGFWaWV3KGJ1Zi5idWZmZXIsYnVmLmJ5dGVPZmZzZXQsYnVmLmJ5dGVMZW5ndGgpO2NvbnN0IG91dD1bXTtsZXQgcD0wOwogICAgd2hpbGUocCs4PD1idWYuYnl0ZUxlbmd0aCl7Y29uc3QgaWQ9ZHYuZ2V0VWludDE2KHAsdHJ1ZSksZXh0PWR2LmdldEludDE2KHArMix0cnVlKSxzaXplPWR2LmdldEludDMyKHArNCx0cnVlKTsKICAgICAgaWYoc2l6ZTw9MHx8cCs4K3NpemU+YnVmLmJ5dGVMZW5ndGgpYnJlYWs7CiAgICAgIGlmKGV4dD09PTB4NzMpb3V0LnB1c2goe25hbWU6YCR7aWR9LnNndGAsc3JjOmxhYmVsLGJ5dGVzOmJ1Zi5zdWJhcnJheShwKzgscCs4K3NpemUpfSk7cCs9OCtzaXplO30KICAgIHJldHVybiBvdXQ7CiAgfQogIGZ1bmN0aW9uIGV4dHJhY3REaXIoYnVmLGxhYmVsKXsKICAgIGNvbnN0IGR2PW5ldyBEYXRhVmlldyhidWYuYnVmZmVyLGJ1Zi5ieXRlT2Zmc2V0LGJ1Zi5ieXRlTGVuZ3RoKTtjb25zdCBuPWR2LmdldEludDMyKDAsdHJ1ZSkvMTI7Y29uc3QgZW50cz1bXTsKICAgIGZvcihsZXQgaT0wO2k8bjtpKyspe2NvbnN0IG89NCsxMippO2xldCBubT0nJztmb3IobGV0IGs9MDtrPDg7aysrKXtjb25zdCBjPWR2LmdldFVpbnQ4KG8rayk7aWYoYz49MzImJmM8MTI3KW5tKz1TdHJpbmcuZnJvbUNoYXJDb2RlKGMpO31lbnRzLnB1c2goe25hbWU6bm0udHJpbSgpLHNlYzpkdi5nZXRJbnQzMihvKzgsdHJ1ZSl9KTt9CiAgICBjb25zdCBvdXQ9W107CiAgICBmb3IobGV0IGk9MDtpPGVudHMubGVuZ3RoO2krKyl7Y29uc3Qgcz1lbnRzW2ldLnNlYyoyMDQ4LGU9KGkrMTxlbnRzLmxlbmd0aD9lbnRzW2krMV0uc2VjKjIwNDg6YnVmLmJ5dGVMZW5ndGgpOwogICAgICB0cnl7ZXh0cmFjdFN0ZyhidWYuc3ViYXJyYXkocyxlKSxlbnRzW2ldLm5hbWUpLmZvckVhY2goeD0+b3V0LnB1c2goeCkpO31jYXRjaChlKXt9fQogICAgcmV0dXJuIG91dDsKICB9CiAgLyogLS0tLSBzaWdodCBpZGVudGlmaWNhdGlvbiAoR1ZfU3RyQ29kZTogMTYtYml0IHJvdGF0ZS1sZWZ0LTUgKyBhZGQpIC0tLS0gKi8KICBmdW5jdGlvbiBzdHJDb2RlKHMpe2xldCBpZD0wO2ZvcihsZXQgaT0wO2k8cy5sZW5ndGg7aSsrKXtpZD0oKGlkPDw1KXwoaWQ+Pj4xMSkpJjB4RkZGRjtpZD0oaWQrcy5jaGFyQ29kZUF0KGkpKSYweEZGRkY7fXJldHVybiBpZDt9CiAgY29uc3QgU0lHSFRfTkFNRVM9ezB4MTVhOTonbmlraXRhJywweDU3Zjg6J3N0aW5nZXInLDB4NTFjODonc2NvcGUnLDB4ZWVlOTonY2FtZXJhJywweGIzY2Q6J2NhbWVyYV8yJywKICAgIDB4ZTJhOTonY2JfYm94JywweDEzMDM6J21hc2snLDB4MDhkYjonbHNpZ2h0JywweDg0ZGI6J2lyX2dnbGUxJywweDg0ZGM6J2lyX2dnbGUyJywweDg0ZGQ6J2lyX2dnbGUzJywKICAgIDB4ODUwNDonbnZfZ2dsZTEnLDB4ODUwNTonbnZfZ2dsZTInLDB4ODUwNjonbnZfZ2dsZTMnLDB4YTc5NjoncmlmbGUxJywweGE3OTc6J3JpZmxlMicsMHhhNzk4OidyaWZsZTMnfTsKICBjb25zdCBuYW1lT2Y9aGFzaD0+U0lHSFRfTkFNRVNbaGFzaF18fG51bGw7CgogIC8qIC0tLS0gZW5naW5lLWRyYXduIG92ZXJsYXlzIChOT1QgaW4gdGhlIHNndDsgZHJhd24gYXQgcnVudGltZSBieSB3ZWFwb24gY29kZSkgLS0tLSAqLwogIGNvbnN0IEVOR0lORV9PVkVSTEFZUz17CiAgICBuaWtpdGE6WwogICAgICB7a2luZDondGV4dCcseDoxMTYseTo5OCx0ZXh0OidFTkVNWScsY29sb3I6e3I6MTU4LGc6MTg0LGI6MTM4fSxub3RlOidsb2NrLW9uIGxhYmVsLCBibGlua3Mgwrcgcm1pc3NpbGUuYyBEcmF3RW5lbXlUZXh0J30sCiAgICAgIHtraW5kOidiYXInLHg6MzEseTozOSx3OjYwLGg6MTAsY29sb3I6e3I6MTU4LGc6MTg0LGI6MTM4fSxub3RlOidmdWVsIGdhdWdlOiBkcmFpbnMgb3ZlciBmbGlnaHQsIHR1cm5zIHJlZCA8MTVweCDCtyBybWlzc2lsZS5jJ30sCiAgICAgIHtraW5kOid0ZXh0Jyx4OjgseToxMzYsdGV4dDonKzAwMCcsY29sb3I6e3I6MTU4LGc6MTg0LGI6MTM4fSxub3RlOidtaXNzaWxlIFggcmVhZG91dCAobGl2ZSknfSwKICAgICAge2tpbmQ6J3RleHQnLHg6OCx5OjE0NCx0ZXh0OicrMDAwJyxjb2xvcjp7cjoxNTgsZzoxODQsYjoxMzh9LG5vdGU6J21pc3NpbGUgWSByZWFkb3V0IChsaXZlKSd9LAogICAgICB7a2luZDondGV4dCcseDo4LHk6MTUyLHRleHQ6JyswMDAnLGNvbG9yOntyOjE1OCxnOjE4NCxiOjEzOH0sbm90ZTonbWlzc2lsZSBaIHJlYWRvdXQgKGxpdmUpJ30sCiAgICBdLAogICAgc3RpbmdlcjpbCiAgICAgIHtraW5kOid0ZXh0Jyx4OjE4MCx5OjE2LHRleHQ6J0xPQ0tfT04nLGNvbG9yOntyOjQ2LGc6NjUsYjo2NX0sbm90ZTonbG9jayBsYWJlbCDCtyBzdG5zaWdodC5jJ30sCiAgICBdLAogIH07CiAgY29uc3Qgb3ZlcmxheUZvcj1uYW1lPT5FTkdJTkVfT1ZFUkxBWVNbbmFtZV18fG51bGw7CgogIC8qIC0tLS0gZmFpdGhmdWwgY2FudmFzIHJlbmRlcmVyICh0cnVlIGdvdXJhdWQgZm9yIGdyYWRpZW50IHF1YWRzKSAtLS0tICovCiAgZnVuY3Rpb24gYm91bmRzKHBhcnNlZCl7CiAgICBsZXQgbWlueD0wLG1pbnk9MCxtYXh4PTMyMCxtYXh5PTIyNDsKICAgIGZvcihjb25zdCBwIG9mIHBhcnNlZC5wcmltcylmb3IoY29uc3QgcSBvZiBwLnBvaW50cyl7aWYocS51PT09U0VOVCljb250aW51ZTtjb25zdCB4PWRlYyhxLnUpLHk9ZGVjKHEudik7CiAgICAgIGlmKHg8bWlueCltaW54PXg7aWYoeTxtaW55KW1pbnk9eTtpZih4Pm1heHgpbWF4eD14O2lmKHk+bWF4eSltYXh5PXk7fQogICAgcmV0dXJuIHttaW54LG1pbnksbWF4eCxtYXh5fTsKICB9CiAgZnVuY3Rpb24gX2JsZW5kKGIsaSxyLGcsYmwsYSl7Y29uc3QgaWE9YS8yNTUsbmE9MS1pYTtiW2ldPXIqaWErYltpXSpuYTtiW2krMV09ZyppYStiW2krMV0qbmE7YltpKzJdPWJsKmlhK2JbaSsyXSpuYTtiW2krM109MjU1O30KICBmdW5jdGlvbiBfdHJpKGJ1ZixXLEgsQSxjYSxCLGNiLEMsY2MpewogICAgY29uc3QgbWlueD1NYXRoLm1heCgwLE1hdGguZmxvb3IoTWF0aC5taW4oQS51LEIudSxDLnUpKSksbWF4eD1NYXRoLm1pbihXLTEsTWF0aC5jZWlsKE1hdGgubWF4KEEudSxCLnUsQy51KSkpOwogICAgY29uc3QgbWlueT1NYXRoLm1heCgwLE1hdGguZmxvb3IoTWF0aC5taW4oQS52LEIudixDLnYpKSksbWF4eT1NYXRoLm1pbihILTEsTWF0aC5jZWlsKE1hdGgubWF4KEEudixCLnYsQy52KSkpOwogICAgY29uc3QgZD0oQi52LUMudikqKEEudS1DLnUpKyhDLnUtQi51KSooQS52LUMudik7aWYoTWF0aC5hYnMoZCk8MWUtNilyZXR1cm47CiAgICBmb3IobGV0IHk9bWlueTt5PD1tYXh5O3krKylmb3IobGV0IHg9bWlueDt4PD1tYXh4O3grKyl7Y29uc3QgcHg9eCswLjUscHk9eSswLjU7CiAgICAgIGNvbnN0IGwxPSgoQi52LUMudikqKHB4LUMudSkrKEMudS1CLnUpKihweS1DLnYpKS9kLCBsMj0oKEMudi1BLnYpKihweC1DLnUpKyhBLnUtQy51KSoocHktQy52KSkvZCwgbDM9MS1sMS1sMjsKICAgICAgaWYobDE8LTAuMDAyfHxsMjwtMC4wMDJ8fGwzPC0wLjAwMiljb250aW51ZTsKICAgICAgX2JsZW5kKGJ1ZiwoeSpXK3gpKjQsIGwxKmNhLnIrbDIqY2IucitsMypjYy5yLCBsMSpjYS5nK2wyKmNiLmcrbDMqY2MuZywgbDEqY2EuYitsMipjYi5iK2wzKmNjLmIsIGwxKmNhLmErbDIqY2IuYStsMypjYy5hKTt9CiAgfQogIGZ1bmN0aW9uIF9wb2x5KGJ1ZixXLEgsUCxjKXtmb3IobGV0IGk9MTtpKzE8UC5sZW5ndGg7aSsrKV90cmkoYnVmLFcsSCxQWzBdLGMsUFtpXSxjLFBbaSsxXSxjKTt9CiAgZnVuY3Rpb24gX2xpbmUoYnVmLFcsSCxhLGIsYyl7Y29uc3Qgbj1NYXRoLm1heChNYXRoLmFicyhiLnUtYS51KSxNYXRoLmFicyhiLnYtYS52KSwxKTsKICAgIGZvcihsZXQgaT0wO2k8PW47aSsrKXtjb25zdCB4PU1hdGgucm91bmQoYS51KyhiLnUtYS51KSppL24pLHk9TWF0aC5yb3VuZChhLnYrKGIudi1hLnYpKmkvbik7aWYoeD49MCYmeDxXJiZ5Pj0wJiZ5PEgpX2JsZW5kKGJ1ZiwoeSpXK3gpKjQsYy5yLGMuZyxjLmIsYy5hKTt9fQogIGZ1bmN0aW9uIHJlbmRlckNhbnZhcyhwYXJzZWQpewogICAgY29uc3QgbT04LGJiPWJvdW5kcyhwYXJzZWQpLG94PWJiLm1pbngtbSxveT1iYi5taW55LW07CiAgICBjb25zdCBXPU1hdGgubWF4KDEsTWF0aC5jZWlsKGJiLm1heHgtYmIubWlueCsyKm0pKSxIPU1hdGgubWF4KDEsTWF0aC5jZWlsKGJiLm1heHktYmIubWlueSsyKm0pKTsKICAgIGNvbnN0IGN2PWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO2N2LndpZHRoPVc7Y3YuaGVpZ2h0PUg7CiAgICBjb25zdCBjdHg9Y3YuZ2V0Q29udGV4dCgnMmQnKTtjb25zdCBpbWc9Y3R4LmNyZWF0ZUltYWdlRGF0YShXLEgpO2NvbnN0IGJ1Zj1pbWcuZGF0YTsKICAgIGZvcihsZXQgaT0wO2k8YnVmLmxlbmd0aDtpKz00KXtidWZbaV09MTM2O2J1ZltpKzFdPTEzNjtidWZbaSsyXT0xMzY7YnVmW2krM109MjU1O30KICAgIGNvbnN0IFQ9cT0+KHt1OnEudS1veCx2OnEudi1veX0pLHRleHRzPVtdOwogICAgZm9yKGNvbnN0IHAgb2YgcGFyc2VkLnByaW1zKXtjb25zdCBkPWRpc3BsYXlPZihwKTsKICAgICAgaWYocC50eXBlPT09J3BvbHlnb24nKV9wb2x5KGJ1ZixXLEgsZC5wdHMubWFwKFQpLHAuY29sb3IpOwogICAgICBlbHNlIGlmKHAudHlwZT09PSdtZXNoJyl7Y29uc3QgUD1kLnB0cy5tYXAoVCksQz1kLmNvbHM7X3RyaShidWYsVyxILFBbMF0sQ1swXSxQWzFdLENbMV0sUFsyXSxDWzJdKTtfdHJpKGJ1ZixXLEgsUFswXSxDWzBdLFBbMl0sQ1syXSxQWzNdLENbM10pO30KICAgICAgZWxzZSBpZihwLnR5cGU9PT0nbGluZScpX2xpbmUoYnVmLFcsSCxUKGQucHRzWzBdKSxUKGQucHRzWzFdKSxwLmNvbG9yKTsKICAgICAgZWxzZSBpZihwLnR5cGU9PT0ncG9seWxpbmUnfHxwLnR5cGU9PT0ncG9seW91dGxpbmUnKXtjb25zdCBQPWQucHRzLm1hcChUKTtmb3IobGV0IGk9MDtpKzE8UC5sZW5ndGg7aSsrKV9saW5lKGJ1ZixXLEgsUFtpXSxQW2krMV0scC5jb2xvcik7aWYoZC5jbG9zZWQmJlAubGVuZ3RoKV9saW5lKGJ1ZixXLEgsUFtQLmxlbmd0aC0xXSxQWzBdLHAuY29sb3IpO30KICAgICAgZWxzZSBpZihwLnR5cGU9PT0ndGV4dCcpdGV4dHMucHVzaCh7eDpkLnB0c1swXS51LW94LHk6ZC5wdHNbMF0udi1veSx0OnAudGV4dCxjOnAuY29sb3J9KTt9CiAgICBjdHgucHV0SW1hZ2VEYXRhKGltZywwLDApO2N0eC5mb250PSc5cHggbW9ub3NwYWNlJzsKICAgIGZvcihjb25zdCB0IG9mIHRleHRzKXtjdHguZmlsbFN0eWxlPWByZ2JhKCR7dC5jLnJ9LCR7dC5jLmd9LCR7dC5jLmJ9LCR7KHQuYy5hLzI1NSkudG9GaXhlZCgzKX0pYDtjdHguZmlsbFRleHQodC50LHQueCx0LnkpO30KICAgIHJldHVybiB7Y2FudmFzOmN2LG94LG95LFcsSH07CiAgfQoKICByZXR1cm4ge3BhcnNlLHN2ZyxzZXJpYWxpemUsZGlzcGxheU9mLGV4dHJhY3RTdGcsZXh0cmFjdERhcixleHRyYWN0RGlyLFNFTlQsZGVjLGVuYyxzdHJDb2RlLG5hbWVPZixvdmVybGF5Rm9yLGJvdW5kcyxyZW5kZXJDYW52YXN9Owp9KSgpOwoKLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQogKiBBcHAg4oCUIGdyaWQgKyBlZGl0b3IKICogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi8KY29uc3QgQXBwPSgoKT0+ewogIGNvbnN0ICQ9cz0+ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzKTsKICBsZXQgaXRlbXM9W107ICAgICAgICAgIC8vIHtuYW1lLHNyYyxwYXJzZWQsb3JpZyhVaW50OEFycmF5KSxkaXJ0eX0KICBsZXQgY3VyPS0xLCBzZWw9LTEsIGVkaXRNb2RlPWZhbHNlOwogIGxldCB1bmRvPVtdLCByZWRvPVtdOwogIGNvbnN0IG9wdHM9e2dyYWQ6dHJ1ZSxmaWxsOnRydWUsc2Nhbjp0cnVlLHdpcmU6ZmFsc2UsZ291cmF1ZDpmYWxzZSxvdmVybGF5OmZhbHNlLHNuYXA6ZmFsc2V9OwogIGNvbnN0IGNsb25lPW89PkpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkobykpOwoKICBmdW5jdGlvbiBzZXRNZXRhKCl7CiAgICBjb25zdCBkPWl0ZW1zLmZpbHRlcihpPT5pLmRpcnR5KS5sZW5ndGg7CiAgICAkKCcjbWV0YScpLmlubmVySFRNTD1pdGVtcy5sZW5ndGg/YDxiPiR7aXRlbXMubGVuZ3RofTwvYj4gc2lnaHQke2l0ZW1zLmxlbmd0aD4xPydzJzonJ30ke2Q/YCDCtyA8Yj4ke2R9PC9iPiBlZGl0ZWRgOicnfWA6Jyc7CiAgICAkKCcjY2xlYXJCdG4nKS5zdHlsZS5kaXNwbGF5PWl0ZW1zLmxlbmd0aD8nJzonbm9uZSc7CiAgfQogIGZ1bmN0aW9uIGhhbmRsZUZpbGVzKGZsKXsKICAgICQoJyNlcnInKS50ZXh0Q29udGVudD0nJztjb25zdCBmaWxlcz1bLi4uZmxdO2xldCBwZW5kPWZpbGVzLmxlbmd0aDtpZighcGVuZClyZXR1cm47CiAgICBmaWxlcy5mb3JFYWNoKGY9Pntjb25zdCBmcj1uZXcgRmlsZVJlYWRlcigpO2ZyLm9ubG9hZD0oKT0+ewogICAgICB0cnl7aW5nZXN0KGYubmFtZSxuZXcgVWludDhBcnJheShmci5yZXN1bHQpKTt9Y2F0Y2goZSl7JCgnI2VycicpLnRleHRDb250ZW50PWAke2YubmFtZX06ICR7ZS5tZXNzYWdlfWA7fQogICAgICBpZigtLXBlbmQ9PT0wKXJlbmRlckdyaWQoKTt9O2ZyLnJlYWRBc0FycmF5QnVmZmVyKGYpO30pOwogIH0KICBmdW5jdGlvbiBpbmdlc3QoZm4sYnl0ZXMpewogICAgY29uc3QgbG89Zm4udG9Mb3dlckNhc2UoKTtsZXQgZXg9W107CiAgICBpZihsby5lbmRzV2l0aCgnLnNndCcpKWV4PVt7bmFtZTpmbixzcmM6J2ZpbGUnLGJ5dGVzfV07CiAgICBlbHNlIGlmKGxvLmVuZHNXaXRoKCcuc3RnJykpZXg9U0dULmV4dHJhY3RTdGcoYnl0ZXMsZm4ucmVwbGFjZSgvXC5zdGckL2ksJycpKTsKICAgIGVsc2UgaWYobG8uZW5kc1dpdGgoJy5kaXInKSlleD1TR1QuZXh0cmFjdERpcihieXRlcyxmbik7CiAgICBlbHNlIGlmKGxvLmVuZHNXaXRoKCcuZGFyJykpZXg9U0dULmV4dHJhY3REYXIoYnl0ZXMsZm4pOwogICAgZWxzZXt0cnl7U0dULnBhcnNlKGJ5dGVzKTtleD1be25hbWU6Zm4sc3JjOidmaWxlJyxieXRlc31dO31jYXRjaHtleD1TR1QuZXh0cmFjdFN0ZyhieXRlcyxmbik7fX0KICAgIGlmKCFleC5sZW5ndGgpdGhyb3cgbmV3IEVycm9yKCdubyBzaWdodCAoLnNndCkgZGF0YSBmb3VuZCcpOwogICAgZm9yKGNvbnN0IGUgb2YgZXgpe3RyeXtjb25zdCBwYXJzZWQ9U0dULnBhcnNlKGUuYnl0ZXMpO2NvbnN0IGhhc2g9aGFzaEZyb21OYW1lKGUubmFtZSk7CiAgICAgIGl0ZW1zLnB1c2goe25hbWU6ZS5uYW1lLHNyYzplLnNyYyxwYXJzZWQsb3JpZzpuZXcgVWludDhBcnJheShlLmJ5dGVzKSxkaXJ0eTpmYWxzZSxoYXNoLHNpZ2h0OlNHVC5uYW1lT2YoaGFzaCl9KTt9Y2F0Y2goZXJyKXt9fQogIH0KICBmdW5jdGlvbiBoYXNoRnJvbU5hbWUobil7Y29uc3QgbT1TdHJpbmcobikubWF0Y2goLyhcZCspLyk7cmV0dXJuIG0/cGFyc2VJbnQobVsxXSk6bnVsbDt9CiAgZnVuY3Rpb24gcmVuZGVyR3JpZCgpewogICAgc2V0TWV0YSgpO2NvbnN0IGdyaWQ9JCgnI2dyaWQnKSxkcm9wPSQoJyNkcm9wJyk7CiAgICBpZighaXRlbXMubGVuZ3RoKXtncmlkLnN0eWxlLmRpc3BsYXk9J25vbmUnO2Ryb3Auc3R5bGUuZGlzcGxheT0nJztyZXR1cm47fQogICAgZHJvcC5zdHlsZS5kaXNwbGF5PSdub25lJztncmlkLnN0eWxlLmRpc3BsYXk9Jyc7Z3JpZC5pbm5lckhUTUw9Jyc7CiAgICBpdGVtcy5mb3JFYWNoKChpdCxpZHgpPT57CiAgICAgIGNvbnN0IGNhcmQ9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7Y2FyZC5jbGFzc05hbWU9J2NhcmQnKyhpdC5kaXJ0eT8nIGRpcnR5JzonJyk7CiAgICAgIGNhcmQuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJ2aWV3Ij4ke1NHVC5zdmcoaXQucGFyc2VkLG9wdHMpfTxkaXYgY2xhc3M9InNjYW4iPjwvZGl2PjwvZGl2PmAKICAgICAgICArYDxkaXYgY2xhc3M9ImNhcCI+PHNwYW4gY2xhc3M9Im5hbWUiPiR7aXQubmFtZX0ke2l0LmRpcnR5PycgKic6Jyd9PC9zcGFuPjxzcGFuIGNsYXNzPSJzcmMiPiR7aXQuc2lnaHR8fGl0LnNyY308L3NwYW4+PC9kaXY+YAogICAgICAgICtgPGRpdiBjbGFzcz0iY2FwIiBzdHlsZT0icGFkZGluZy10b3A6MCI+PHNwYW4gY2xhc3M9Im4iPiR7aXQucGFyc2VkLnByaW1zLmxlbmd0aH0gcHJpbXM8L3NwYW4+PC9kaXY+YDsKICAgICAgY2FyZC5vbmNsaWNrPSgpPT5vcGVuRGV0YWlsKGlkeCk7Z3JpZC5hcHBlbmRDaGlsZChjYXJkKTsKICAgIH0pOwogIH0KICBmdW5jdGlvbiByZWZyZXNoQ2FyZChpZHgpewogICAgY29uc3QgY2FyZHM9JCgnI2dyaWQnKS5jaGlsZHJlbjtpZighY2FyZHNbaWR4XSlyZXR1cm47CiAgICBjb25zdCBpdD1pdGVtc1tpZHhdO2NhcmRzW2lkeF0uY2xhc3NOYW1lPSdjYXJkJysoaXQuZGlydHk/JyBkaXJ0eSc6JycpOwogICAgY2FyZHNbaWR4XS5xdWVyeVNlbGVjdG9yKCcudmlldycpLmlubmVySFRNTD1TR1Quc3ZnKGl0LnBhcnNlZCxvcHRzKSsnPGRpdiBjbGFzcz0ic2NhbiI+PC9kaXY+JzsKICAgIGNhcmRzW2lkeF0ucXVlcnlTZWxlY3RvcignLm5hbWUnKS50ZXh0Q29udGVudD1pdC5uYW1lKyhpdC5kaXJ0eT8nIConOicnKTsKICB9CgogIC8qIC0tLS0gZGV0YWlsIC8gZWRpdG9yIC0tLS0gKi8KICBmdW5jdGlvbiBvcGVuRGV0YWlsKGlkeCl7CiAgICBjdXI9aWR4O3NlbD0tMTt1bmRvPVtdO3JlZG89W107ZWRpdE1vZGU9ZmFsc2U7JCgnI2VkaXRUZycpLmNsYXNzTGlzdC5yZW1vdmUoJ29uJyk7CiAgICBjb25zdCBpdD1pdGVtc1tpZHhdOwogICAgZHJhd1JlbmRlcigpO2J1aWxkSW5zcGVjdG9yKCk7dXBkYXRlRWRpdFBhbmVsKCk7dXBkYXRlQmFycygpOwogICAgJCgnI2RldGFpbCcpLmNsYXNzTGlzdC5hZGQoJ29wZW4nKTsKICB9CiAgZnVuY3Rpb24gdXBkYXRlQmFycygpewogICAgY29uc3QgaXQ9aXRlbXNbY3VyXTsKICAgICQoJyNkVGl0bGUnKS50ZXh0Q29udGVudD1pdC5uYW1lKyhpdC5zaWdodD8nIMK3ICcraXQuc2lnaHQ6JycpKyhpdC5kaXJ0eT8nIConOicnKTsKICAgICQoJyNkVGl0bGUnKS5jbGFzc0xpc3QudG9nZ2xlKCdkaXJ0eScsaXQuZGlydHkpOwogICAgJCgnI2REaW1zJykudGV4dENvbnRlbnQ9YCR7aXQucGFyc2VkLnByaW1zLmxlbmd0aH0gcHJpbWl0aXZlcyDCtyAzMjDDlzIyNGA7CiAgICAkKCcjZENvdW50JykudGV4dENvbnRlbnQ9YCgke2l0LnBhcnNlZC5wcmltcy5sZW5ndGh9KWA7CiAgICAkKCcjdW5kb0J0bicpLmRpc2FibGVkPSF1bmRvLmxlbmd0aDsKICAgICQoJyNyZWRvQnRuJykuZGlzYWJsZWQ9IXJlZG8ubGVuZ3RoOwogICAgJCgnI3Jlc2V0QnRuJykuZGlzYWJsZWQ9IWl0LmRpcnR5OwogIH0KICBmdW5jdGlvbiBmaXRWaWV3Qm94KHBhcnNlZCl7CiAgICBsZXQgbWlueD0wLG1pbnk9MCxtYXh4PTMyMCxtYXh5PTIyNDsKICAgIGZvcihjb25zdCBwIG9mIHBhcnNlZC5wcmltcylmb3IoY29uc3QgcSBvZiBwLnBvaW50cyl7IGlmKHEudT09PVNHVC5TRU5UKWNvbnRpbnVlOwogICAgICBjb25zdCB4PVNHVC5kZWMocS51KSx5PVNHVC5kZWMocS52KTsKICAgICAgaWYoeDxtaW54KW1pbng9eDsgaWYoeTxtaW55KW1pbnk9eTsgaWYoeD5tYXh4KW1heHg9eDsgaWYoeT5tYXh5KW1heHk9eTsgfQogICAgY29uc3QgbT0xMjsgcmV0dXJuIGAke21pbngtbX0gJHttaW55LW19ICR7KG1heHgtbWlueCkrMiptfSAkeyhtYXh5LW1pbnkpKzIqbX1gOwogIH0KICBmdW5jdGlvbiBkcmF3UmVuZGVyKCl7CiAgICBjb25zdCBpdD1pdGVtc1tjdXJdO2NvbnN0IHdyYXA9JCgnI2RSZW5kZXInKTsKICAgIGlmKG9wdHMuZ291cmF1ZCl7CiAgICAgIGNvbnN0IHtjYW52YXN9PVNHVC5yZW5kZXJDYW52YXMoaXQucGFyc2VkKTsgY2FudmFzLmNsYXNzTmFtZT0ncHJldmlld0NhbnZhcyc7CiAgICAgIHdyYXAuaW5uZXJIVE1MPScnOyB3cmFwLmFwcGVuZENoaWxkKGNhbnZhcyk7CiAgICAgIGlmKG9wdHMuc2Nhbil7Y29uc3Qgc2M9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7c2MuY2xhc3NOYW1lPSdzY2FuJzt3cmFwLmFwcGVuZENoaWxkKHNjKTt9CiAgICAgIHJldHVybjsgLy8gZmFpdGhmdWwgcHJldmlldyBpcyB2aWV3LW9ubHkKICAgIH0KICAgIHdyYXAuaW5uZXJIVE1MPVNHVC5zdmcoaXQucGFyc2VkLHsuLi5vcHRzLHNlbCxoYW5kbGVzOmVkaXRNb2RlLHZpZXdCb3g6Zml0Vmlld0JveChpdC5wYXJzZWQpLGZyYW1lOnRydWV9KSsob3B0cy5zY2FuPyc8ZGl2IGNsYXNzPSJzY2FuIj48L2Rpdj4nOicnKTsKICAgIGNvbnN0IHM9d3JhcC5xdWVyeVNlbGVjdG9yKCdzdmcnKTsKICAgIHMucXVlcnlTZWxlY3RvckFsbCgnLnByaW0nKS5mb3JFYWNoKGVsPT57CiAgICAgIGVsLnN0eWxlLmN1cnNvcj0ncG9pbnRlcic7CiAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCgpPT5yb3dIb3QoZWwuZGF0YXNldC5pLHRydWUpKTsKICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsKCk9PnJvd0hvdChlbC5kYXRhc2V0LmksZmFsc2UpKTsKICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLGU9PntlLnN0b3BQcm9wYWdhdGlvbigpO3NlbGVjdCgrZWwuZGF0YXNldC5pKTt9KTsKICAgIH0pOwogICAgaWYob3B0cy5vdmVybGF5KSBkcmF3R2hvc3RzKHMpOwogICAgaWYoZWRpdE1vZGUpIHdpcmVIYW5kbGVzKHMpOwogIH0KICBjb25zdCBOUz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnOwogIGZ1bmN0aW9uIGRyYXdHaG9zdHMoc3ZnKXsKICAgIGNvbnN0IG92PWl0ZW1zW2N1cl0uc2lnaHQmJlNHVC5vdmVybGF5Rm9yKGl0ZW1zW2N1cl0uc2lnaHQpOyBpZighb3YpcmV0dXJuOwogICAgY29uc3QgZz1kb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoTlMsJ2cnKTsgZy5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywnZW5nLW92ZXJsYXknKTsKICAgIGZvcihjb25zdCBvIG9mIG92KXsgY29uc3QgY29sPWByZ2IoJHtvLmNvbG9yLnJ9LCR7by5jb2xvci5nfSwke28uY29sb3IuYn0pYDsKICAgICAgY29uc3QgdGlwPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhOUywndGl0bGUnKTsgdGlwLnRleHRDb250ZW50PSdFTkdJTkUtRFJBV04gKG5vdCBzZ3QpOiAnK28ubm90ZTsKICAgICAgaWYoby5raW5kPT09J3RleHQnKXsKICAgICAgICBjb25zdCB0PWRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhOUywndGV4dCcpO3Quc2V0QXR0cmlidXRlKCd4JyxvLngpO3Quc2V0QXR0cmlidXRlKCd5JyxvLnkpO3Quc2V0QXR0cmlidXRlKCdmaWxsJyxjb2wpO3Quc2V0QXR0cmlidXRlKCdvcGFjaXR5JywnMC41Jyk7dC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsJzEwJyk7dC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtZmFtaWx5JywnbW9ub3NwYWNlJyk7dC5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc3R5bGUnLCdpdGFsaWMnKTt0LnRleHRDb250ZW50PW8udGV4dDt0LmFwcGVuZENoaWxkKHRpcCk7Zy5hcHBlbmRDaGlsZCh0KTsKICAgICAgfSBlbHNlIGlmKG8ua2luZD09PSdiYXInKXsKICAgICAgICBjb25zdCByPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhOUywncmVjdCcpO3Iuc2V0QXR0cmlidXRlKCd4JyxvLngpO3Iuc2V0QXR0cmlidXRlKCd5JyxvLnkpO3Iuc2V0QXR0cmlidXRlKCd3aWR0aCcsby53KTtyLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JyxvLmgpO3Iuc2V0QXR0cmlidXRlKCdmaWxsJyxjb2wpO3Iuc2V0QXR0cmlidXRlKCdmaWxsLW9wYWNpdHknLCcwLjE2Jyk7ci5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsY29sKTtyLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWRhc2hhcnJheScsJzMgMicpO3Iuc2V0QXR0cmlidXRlKCdvcGFjaXR5JywnMC44NScpO3IuYXBwZW5kQ2hpbGQodGlwKTtnLmFwcGVuZENoaWxkKHIpOwogICAgICB9CiAgICB9CiAgICBzdmcuYXBwZW5kQ2hpbGQoZyk7CiAgfQogIGZ1bmN0aW9uIGJ1aWxkSW5zcGVjdG9yKCl7CiAgICBjb25zdCBpdD1pdGVtc1tjdXJdLHJvd3M9JCgnI2RSb3dzJyk7cm93cy5pbm5lckhUTUw9Jyc7CiAgICBpdC5wYXJzZWQucHJpbXMuZm9yRWFjaChwPT57CiAgICAgIGNvbnN0IGM9cC5jb2xvcjtjb25zdCBzdz1gPHNwYW4gY2xhc3M9InN3IiBzdHlsZT0iYmFja2dyb3VuZDpyZ2JhKCR7Yy5yfSwke2MuZ30sJHtjLmJ9LCR7KGMuYS8yNTUpLnRvRml4ZWQoMil9KSI+PC9zcGFuPmA7CiAgICAgIGNvbnN0IGNvb3JkPXAucG9pbnRzLmZpbHRlcihxPT5xLnUhPT1TR1QuU0VOVCkuc2xpY2UoMCwyKS5tYXAocT0+YCR7U0dULmRlYyhxLnUpfSwke1NHVC5kZWMocS52KX1gKS5qb2luKCcgJyk7CiAgICAgIGNvbnN0IHI9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7ci5jbGFzc05hbWU9J3JvdycrKHAuaT09PXNlbD8nIHNlbCc6JycpKyhwLmFkZGVkPycgYWRkZWQnOicnKTtyLmRhdGFzZXQuaT1wLmk7CiAgICAgIHIuaW5uZXJIVE1MPWA8c3BhbiBjbGFzcz0iaXgiPiR7cC5pfTwvc3Bhbj48c3BhbiBjbGFzcz0idHkgdHktJHtwLnR5cGV9Ij4ke3AudHlwZX08L3NwYW4+YAogICAgICAgICtgPHNwYW4gY2xhc3M9ImNvIj4ke3N3fSR7cC50ZXh0P2VzYyhwLnRleHQpOmNvb3JkfTwvc3Bhbj5gOwogICAgICByLm9ubW91c2VlbnRlcj0oKT0+Zmxhc2gocC5pLHRydWUpO3Iub25tb3VzZWxlYXZlPSgpPT5mbGFzaChwLmksZmFsc2UpOwogICAgICByLm9uY2xpY2s9KCk9PnNlbGVjdChwLmkpOwogICAgICByb3dzLmFwcGVuZENoaWxkKHIpOwogICAgfSk7CiAgfQogIGZ1bmN0aW9uIGVzYyhzKXtyZXR1cm4gKHN8fCcnKS5yZXBsYWNlKC9bJjw+XS9nLGM9Pih7JyYnOicmYW1wOycsJzwnOicmbHQ7JywnPic6JyZndDsnfVtjXSkpO30KICBmdW5jdGlvbiBmbGFzaChpLG9uKXtjb25zdCBlbD0kKCcjZFJlbmRlcicpLnF1ZXJ5U2VsZWN0b3IoYC5wcmltW2RhdGEtaT0iJHtpfSJdYCk7aWYoZWwpZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZmxhc2gnLG9uKTt9CiAgZnVuY3Rpb24gcm93SG90KGksb24pe2NvbnN0IHI9JCgnI2RSb3dzJykucXVlcnlTZWxlY3RvcihgLnJvd1tkYXRhLWk9IiR7aX0iXWApO2lmKHIpe3IuY2xhc3NMaXN0LnRvZ2dsZSgnaG90Jyxvbik7aWYob24pci5zY3JvbGxJbnRvVmlldyh7YmxvY2s6J25lYXJlc3QnfSk7fWZsYXNoKGksb24pO30KICBmdW5jdGlvbiBzZWxlY3QoaSl7c2VsPWk7YnVpbGRJbnNwZWN0b3IoKTtkcmF3UmVuZGVyKCk7dXBkYXRlRWRpdFBhbmVsKCk7CiAgICBjb25zdCByPSQoJyNkUm93cycpLnF1ZXJ5U2VsZWN0b3IoYC5yb3dbZGF0YS1pPSIke2l9Il1gKTtpZihyKXIuc2Nyb2xsSW50b1ZpZXcoe2Jsb2NrOiduZWFyZXN0J30pO30KCiAgZnVuY3Rpb24gcHVzaFVuZG8oKXt1bmRvLnB1c2goY2xvbmUoaXRlbXNbY3VyXS5wYXJzZWQucHJpbXMpKTtpZih1bmRvLmxlbmd0aD44MCl1bmRvLnNoaWZ0KCk7cmVkbz1bXTt1cGRhdGVCYXJzKCk7fQogIGZ1bmN0aW9uIG1hcmtEaXJ0eSgpe2NvbnN0IGl0PWl0ZW1zW2N1cl07Y29uc3QgY3VyMj1TR1Quc2VyaWFsaXplKGl0LnBhcnNlZCk7CiAgICBpdC5kaXJ0eT1jdXIyLmxlbmd0aCE9PWl0Lm9yaWcubGVuZ3RofHxjdXIyLnNvbWUoKGIsaSk9PmIhPT1pdC5vcmlnW2ldKTt1cGRhdGVCYXJzKCk7cmVmcmVzaENhcmQoY3VyKTt9CgogIC8qIC0tLS0gZWRpdCBwYW5lbCAtLS0tICovCiAgZnVuY3Rpb24gdXBkYXRlRWRpdFBhbmVsKCl7CiAgICBjb25zdCBwYW5lbD0kKCcjZWRpdFBhbmVsJyksYm9keT0kKCcjZWRpdEJvZHknKTsKICAgIGlmKHNlbDwwKXtwYW5lbC5jbGFzc0xpc3QucmVtb3ZlKCdlbXB0eScpOyQoJyNlZGl0SGVhZCcpLnRleHRDb250ZW50PSdGaWxlJzskKCcjc2VsSWQnKS50ZXh0Q29udGVudD1pdGVtc1tjdXJdLnNpZ2h0PyfCtyAnK2l0ZW1zW2N1cl0uc2lnaHQ6Jyc7CiAgICAgIGJvZHkuaW5uZXJIVE1MPWZpbGVJbmZvSFRNTCgpO3JldHVybjt9CiAgICAkKCcjZWRpdEhlYWQnKS50ZXh0Q29udGVudD0nU2VsZWN0ZWQgcHJpbWl0aXZlJzsKICAgIHBhbmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2VtcHR5Jyk7Y29uc3QgcD1pdGVtc1tjdXJdLnBhcnNlZC5wcmltc1tzZWxdOwogICAgJCgnI3NlbElkJykudGV4dENvbnRlbnQ9YCMke3NlbH0gwrcgJHtwLnR5cGV9YDsKICAgIGxldCBoPScnOwogICAgLy8gY29sb3JzCiAgICBpZihwLnR5cGU9PT0nbWVzaCcpewogICAgICBoKz1gPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5WZXJ0ZXggY29sb3JzIChnb3VyYXVkKTwvbGFiZWw+YDsKICAgICAgW1sndjAnLC0xXSxbJ3YxJywwXSxbJ3YyJywxXSxbJ3YzJywyXV0uZm9yRWFjaCgoW25tLGtdKT0+eyBoKz1jb2xvclJvdyhubSxrKTsgfSk7CiAgICAgIGgrPWA8L2Rpdj5gOwogICAgfSBlbHNlIHsKICAgICAgaCs9YDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+Q29sb3I8L2xhYmVsPiR7Y29sb3JSb3coJ3JnYicsLTEpfTwvZGl2PmA7CiAgICB9CiAgICBpZihwLnR5cGU9PT0ndGV4dCcpewogICAgICBoKz1gPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5UZXh0IChtYXggMTUgY2hhcnMpPC9sYWJlbD48ZGl2IGNsYXNzPSJ2cm93Ij48aW5wdXQgaWQ9InR4dCIgdHlwZT0idGV4dCIgbWF4bGVuZ3RoPSIxNSIgdmFsdWU9IiR7ZXNjKHAudGV4dCl9IiBzdHlsZT0id2lkdGg6MTAwJSI+PC9kaXY+PC9kaXY+YDsKICAgIH0KICAgIC8vIHBvaW50cwogICAgaCs9YDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+UG9pbnRzICgzMjDDlzIyNCwgc2lnbmVkKTwvbGFiZWw+PGRpdiBjbGFzcz0icHRsaXN0IiBpZD0icHRsaXN0Ij48L2Rpdj48L2Rpdj5gOwogICAgaCs9YDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+UGFsZXR0ZSDigJQgY2xpY2sgdG8gcmVjb2xvciAoUkdCKTwvbGFiZWw+PGRpdiBjbGFzcz0icGFsZXR0ZSIgaWQ9InBhbGV0dGUiPjwvZGl2PjwvZGl2PmA7CiAgICBoKz1gPGRpdiBjbGFzcz0iZmllbGQiPjxsYWJlbD5Sb3cgYnl0ZXM8L2xhYmVsPjxkaXYgY2xhc3M9Im9jcm93Ij5gCiAgICAgICtgPHNwYW4gY2xhc3M9ImNlbGwiPjxzcGFuIGNsYXNzPSJsYWIiPk9yZGVyPC9zcGFuPjxpbnB1dCB0eXBlPSJudW1iZXIiIGlkPSJvcmQiIG1pbj0iMCIgbWF4PSIyNTUiIHZhbHVlPSIke3Aub3JkZXJ9Ij48L3NwYW4+YAogICAgICArYDxzcGFuIGNsYXNzPSJjZWxsIj48c3BhbiBjbGFzcz0ibGFiIj5Db2xvclM8L3NwYW4+PGlucHV0IHR5cGU9Im51bWJlciIgaWQ9ImNscyIgbWluPSIwIiBtYXg9IjI1NSIgdmFsdWU9IiR7cC5jb2xvclN9Ij48L3NwYW4+PC9kaXY+PC9kaXY+YDsKICAgIGlmKHAuYWRkZWQpIGgrPWA8ZGl2IGNsYXNzPSJlZGl0YnRucyI+PGJ1dHRvbiBjbGFzcz0iYnRuIGdob3N0IiBpZD0iZHVwQnRuIj5EdXBsaWNhdGU8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gd2FybiIgaWQ9ImRlbEJ0biI+RGVsZXRlPC9idXR0b24+PC9kaXY+YDsKICAgIGVsc2UgaCs9YDxkaXYgY2xhc3M9ImVkaXRidG5zIj48YnV0dG9uIGNsYXNzPSJidG4gZ2hvc3QiIGlkPSJkdXBCdG4iPkR1cGxpY2F0ZTwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biB3YXJuIiBpZD0iaGlkZUJ0biI+SGlkZSAozrE9MCk8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gZ2hvc3QiIGlkPSJwcmltUmVzZXQiPlJlc2V0IHRoaXM8L2J1dHRvbj48L2Rpdj5gOwogICAgaWYoIWVkaXRNb2RlKSBoKz1gPGRpdiBjbGFzcz0ibm90ZSI+VGlwOiB0dXJuIG9uIEVkaXQgbW9kZSB0byBkcmFnIHBvaW50cyBvbiB0aGUgcmVuZGVyLjwvZGl2PmA7CiAgICBib2R5LmlubmVySFRNTD1oOwogICAgLy8gYnVpbGQgcG9pbnQgaW5wdXRzCiAgICBjb25zdCBwbD0kKCcjcHRsaXN0Jyk7CiAgICBwLnBvaW50cy5mb3JFYWNoKChxLGspPT57CiAgICAgIGlmKHEudT09PVNHVC5TRU5UKXtyZXR1cm47fQogICAgICBjb25zdCBkaXY9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7ZGl2LmNsYXNzTmFtZT0ncHQnOwogICAgICBkaXYuaW5uZXJIVE1MPWA8c3BhbiBjbGFzcz0iayI+cCR7a308L3NwYW4+YAogICAgICAgICtgPGlucHV0IHR5cGU9Im51bWJlciIgdmFsdWU9IiR7U0dULmRlYyhxLnUpfSIgZGF0YS1rPSIke2t9IiBkYXRhLWF4PSJ1Ij5gCiAgICAgICAgK2A8aW5wdXQgdHlwZT0ibnVtYmVyIiB2YWx1ZT0iJHtTR1QuZGVjKHEudil9IiBkYXRhLWs9IiR7a30iIGRhdGEtYXg9InYiPmA7CiAgICAgIHBsLmFwcGVuZENoaWxkKGRpdik7CiAgICB9KTsKICAgIHBsLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnA9PmlucC5vbmNoYW5nZT0oKT0+ewogICAgICBwdXNoVW5kbygpO2NvbnN0IGs9K2lucC5kYXRhc2V0Lms7Y29uc3QgcmF3PVNHVC5lbmMocGFyc2VJbnQoaW5wLnZhbHVlKXx8MCk7CiAgICAgIGl0ZW1zW2N1cl0ucGFyc2VkLnByaW1zW3NlbF0ucG9pbnRzW2tdW2lucC5kYXRhc2V0LmF4XT1yYXc7bWFya0RpcnR5KCk7ZHJhd1JlbmRlcigpOwogICAgfSk7CiAgICAvLyBjb2xvciBoYW5kbGVycwogICAgd2lyZUNvbG9ycyhwKTsKICAgIGlmKHAuYWRkZWQpeyAkKCcjZGVsQnRuJykub25jbGljaz1kZWxldGVBcHBlbmRlZDsgfQogICAgZWxzZSB7CiAgICAgICQoJyNoaWRlQnRuJykub25jbGljaz0oKT0+e3B1c2hVbmRvKCk7Y29uc3QgcHA9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXTtwcC5jb2xvci5hPTA7aWYocHAuZXh0Q29sb3JzKXBwLmV4dENvbG9ycy5mb3JFYWNoKGM9PmMuYT0wKTttYXJrRGlydHkoKTtkcmF3UmVuZGVyKCk7dXBkYXRlRWRpdFBhbmVsKCk7fTsKICAgICAgJCgnI3ByaW1SZXNldCcpLm9uY2xpY2s9KCk9PnsgLy8gcmVzdG9yZSB0aGlzIHByaW0ncyBmaWVsZHMgZnJvbSBvcmlnaW5hbCBidWZmZXIKICAgICAgICBwdXNoVW5kbygpO2NvbnN0IGZyZXNoPVNHVC5wYXJzZShpdGVtc1tjdXJdLm9yaWcpLnByaW1zW3NlbF07CiAgICAgICAgaXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXT1mcmVzaDttYXJrRGlydHkoKTtkcmF3UmVuZGVyKCk7YnVpbGRJbnNwZWN0b3IoKTt1cGRhdGVFZGl0UGFuZWwoKTt9OwogICAgfQogICAgaWYocC50eXBlPT09J3RleHQnKSAkKCcjdHh0Jykub25jaGFuZ2U9ZT0+e3B1c2hVbmRvKCk7Y29uc3Qgcz1lLnRhcmdldC52YWx1ZS5zbGljZSgwLDE1KTsKICAgICAgY29uc3QgcHA9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXTtwcC50ZXh0PXM7cHAudGV4dEJ5dGVzPUFycmF5LmZyb20oe2xlbmd0aDoxNn0sKF8saSk9Pmk8cy5sZW5ndGg/cy5jaGFyQ29kZUF0KGkpOjApO21hcmtEaXJ0eSgpO2RyYXdSZW5kZXIoKTtidWlsZEluc3BlY3RvcigpO307CiAgICAkKCcjZHVwQnRuJykub25jbGljaz1kdXBsaWNhdGVQcmltOwogICAgY29uc3Qgb3JkRWw9JCgnI29yZCcpLGNsc0VsPSQoJyNjbHMnKTsKICAgIGlmKG9yZEVsKW9yZEVsLm9uY2hhbmdlPSgpPT57cHVzaFVuZG8oKTtpdGVtc1tjdXJdLnBhcnNlZC5wcmltc1tzZWxdLm9yZGVyPU1hdGgubWF4KDAsTWF0aC5taW4oMjU1LHBhcnNlSW50KG9yZEVsLnZhbHVlKXx8MCkpO21hcmtEaXJ0eSgpO2RyYXdSZW5kZXIoKTt9OwogICAgaWYoY2xzRWwpY2xzRWwub25jaGFuZ2U9KCk9PntwdXNoVW5kbygpO2l0ZW1zW2N1cl0ucGFyc2VkLnByaW1zW3NlbF0uY29sb3JTPU1hdGgubWF4KDAsTWF0aC5taW4oMjU1LHBhcnNlSW50KGNsc0VsLnZhbHVlKXx8MCkpO21hcmtEaXJ0eSgpO2RyYXdSZW5kZXIoKTt9OwogICAgYnVpbGRQYWxldHRlKCk7CiAgfQogIGZ1bmN0aW9uIGZpbGVJbmZvSFRNTCgpewogICAgY29uc3QgaXQ9aXRlbXNbY3VyXSxwPWl0LnBhcnNlZDsgY29uc3QgdHJhaWxlcj1wLl9idWYuc2xpY2UocC51Mik7CiAgICBjb25zdCByZWwzPXAudTMtcC51MiwgcmVsND1wLnU0LXAudTI7IGxldCBoZXg9Jyc7CiAgICBmb3IobGV0IGk9MDtpPHRyYWlsZXIubGVuZ3RoO2krKyl7IGlmKGk9PT1yZWwzfHxpPT09cmVsNCloZXgrPSdcbic7IGhleCs9dHJhaWxlcltpXS50b1N0cmluZygxNikucGFkU3RhcnQoMiwnMCcpKycgJzsgfQogICAgY29uc3QgZW5nPWl0LnNpZ2h0JiZTR1Qub3ZlcmxheUZvcihpdC5zaWdodCk7CiAgICByZXR1cm4gYDxkaXYgY2xhc3M9ImZpbmZvIj5gCiAgICAgICtgPGRpdj48c3BhbiBjbGFzcz0iayI+c2lnaHQgPC9zcGFuPjxzcGFuIGNsYXNzPSJubSI+JHtpdC5zaWdodHx8Jyh1bmtub3duKSd9PC9zcGFuPjxzcGFuIGNsYXNzPSJrIj4gIGhhc2ggPC9zcGFuPjxzcGFuIGNsYXNzPSJ2Ij4ke2l0Lmhhc2h9IMK3IDB4JHsoaXQuaGFzaHx8MCkudG9TdHJpbmcoMTYpfTwvc3Bhbj48L2Rpdj5gCiAgICAgICtgPGRpdj48c3BhbiBjbGFzcz0iayI+cHJpbWl0aXZlcyA8L3NwYW4+PHNwYW4gY2xhc3M9InYiPiR7cC5wcmltcy5sZW5ndGh9PC9zcGFuPjxzcGFuIGNsYXNzPSJrIj4gLyAyNTUgICBkYXRhIDwvc3Bhbj48c3BhbiBjbGFzcz0idiI+JHtwLmRhdGFTaXplfTwvc3Bhbj48c3BhbiBjbGFzcz0iayI+QiAvIDY1NTM1PC9zcGFuPjwvZGl2PmAKICAgICAgK2A8ZGl2PjxzcGFuIGNsYXNzPSJrIj50cmFpbGVyIDwvc3Bhbj48c3BhbiBjbGFzcz0idiI+JHt0cmFpbGVyLmxlbmd0aH1CPC9zcGFuPiAke3RyYWlsZXIubGVuZ3RoPjQ/J8K3IGludGVyYWN0aXZlIHN0YXRlIChpbmRleGVzIHByaW1zKSc6J8K3IHN0YXRpYyd9PC9kaXY+PC9kaXY+YAogICAgICArYDxkaXYgY2xhc3M9ImZpZWxkIj48bGFiZWw+VHJhaWxlciBieXRlcyAmbmJzcDs8c3BhbiBjbGFzcz0ic2VjIj5wdHIzQCR7cC51Mn08L3NwYW4+IMK3IDxzcGFuIGNsYXNzPSJzZWMiPnB0cjRAJHtwLnUzfTwvc3Bhbj4gwrcgPHNwYW4gY2xhc3M9InNlYyI+cHRyNUAke3AudTR9PC9zcGFuPjwvbGFiZWw+YAogICAgICArYDxkaXYgY2xhc3M9InRyYWlsZXIiPiR7dHJhaWxlci5sZW5ndGg/aGV4LnRyaW0oKTonKG5vbmUpJ308L2Rpdj48L2Rpdj5gCiAgICAgICsoZW5nP2A8ZGl2IGNsYXNzPSJub3RlIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPkVuZ2luZSBhbHNvIGRyYXdzICR7ZW5nLmxlbmd0aH0gb3ZlcmxheShzKSBoZXJlIOKAlCB0b2dnbGUg4oCcRW5naW5lIG92ZXJsYXnigJ0uPC9kaXY+YDonJykKICAgICAgK2A8ZGl2IGNsYXNzPSJub3RlIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPlBpY2sgYSBwcmltaXRpdmUgdG8gZWRpdCwgb3IgdXNlICtsaW5lIC8gK3BvbHkgLyArZ3JhZCAvICt0ZXh0IHRvIGFkZC48L2Rpdj5gOwogIH0KICBmdW5jdGlvbiBwYWxldHRlQ29sb3JzKHBhcnNlZCl7Y29uc3Qgc2V0PW5ldyBNYXAoKTtjb25zdCBhZGQ9Yz0+e2NvbnN0IGs9Yy5yKycsJytjLmcrJywnK2MuYjtpZighc2V0LmhhcyhrKSlzZXQuc2V0KGsse3I6Yy5yLGc6Yy5nLGI6Yy5ifSk7fTsKICAgIGZvcihjb25zdCBwIG9mIHBhcnNlZC5wcmltcyl7YWRkKHAuY29sb3IpO2lmKHAuZXh0Q29sb3JzKXAuZXh0Q29sb3JzLmZvckVhY2goYWRkKTt9cmV0dXJuIFsuLi5zZXQudmFsdWVzKCldO30KICBmdW5jdGlvbiBidWlsZFBhbGV0dGUoKXsKICAgIGNvbnN0IGVsPSQoJyNwYWxldHRlJyk7IGlmKCFlbClyZXR1cm47IGVsLmlubmVySFRNTD0nJzsKICAgIGNvbnN0IG1rPShjLGVuZyk9Pntjb25zdCBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO2QuY2xhc3NOYW1lPSdwYycrKGVuZz8nIGVuZyc6JycpO2Quc3R5bGUuYmFja2dyb3VuZD1gcmdiKCR7Yy5yfSwke2MuZ30sJHtjLmJ9KWA7CiAgICAgIGQudGl0bGU9YCR7Yy5yfSwke2MuZ30sJHtjLmJ9YCsoZW5nPycgKGVuZ2luZSBjb2xvciknOicnKTsKICAgICAgZC5vbmNsaWNrPSgpPT57cHVzaFVuZG8oKTtjb25zdCBjb2w9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXS5jb2xvcjtjb2wucj1jLnI7Y29sLmc9Yy5nO2NvbC5iPWMuYjttYXJrRGlydHkoKTtkcmF3UmVuZGVyKCk7dXBkYXRlRWRpdFBhbmVsKCk7fTtlbC5hcHBlbmRDaGlsZChkKTt9OwogICAgcGFsZXR0ZUNvbG9ycyhpdGVtc1tjdXJdLnBhcnNlZCkuZm9yRWFjaChjPT5tayhjLGZhbHNlKSk7CiAgICBjb25zdCBvdj1pdGVtc1tjdXJdLnNpZ2h0JiZTR1Qub3ZlcmxheUZvcihpdGVtc1tjdXJdLnNpZ2h0KTsgaWYob3Ypb3YuZm9yRWFjaChvPT5tayhvLmNvbG9yLHRydWUpKTsKICB9CiAgZnVuY3Rpb24gZHVwbGljYXRlUHJpbSgpewogICAgaWYoY3VyPDB8fHNlbDwwKXJldHVybjsgY29uc3QgcHJpbXM9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXM7CiAgICBpZihwcmltcy5sZW5ndGg+PTI1NSl7YWxlcnROb3RlKCdNYXggMjU1IHByaW1pdGl2ZXMuJyk7cmV0dXJuO30KICAgIHB1c2hVbmRvKCk7CiAgICBjb25zdCBjcD1KU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHByaW1zW3NlbF0pKTsKICAgIGNwLmk9cHJpbXMubGVuZ3RoOyBjcC5vZmY9bnVsbDsgY3AuYWRkZWQ9dHJ1ZTsKICAgIGNwLnBvaW50cz1jcC5wb2ludHMubWFwKHE9PnEudT09PVNHVC5TRU5UP3E6e3U6U0dULmVuYyhTR1QuZGVjKHEudSkrNiksdjpTR1QuZW5jKFNHVC5kZWMocS52KSs2KX0pOwogICAgcHJpbXMucHVzaChjcCk7IGVkaXRNb2RlPXRydWU7JCgnI2VkaXRUZycpLmNsYXNzTGlzdC5hZGQoJ29uJyk7CiAgICBzZWw9Y3AuaTsgbWFya0RpcnR5KCk7IGRyYXdSZW5kZXIoKTsgYnVpbGRJbnNwZWN0b3IoKTsgdXBkYXRlRWRpdFBhbmVsKCk7CiAgfQogIGZ1bmN0aW9uIG51ZGdlKGRpcixzdGVwKXsKICAgIGlmKGN1cjwwfHxzZWw8MClyZXR1cm47IGNvbnN0IHA9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXTsgaWYoIXApcmV0dXJuOyBwdXNoVW5kbygpOwogICAgY29uc3QgZHg9ZGlyPT09J0Fycm93TGVmdCc/LXN0ZXA6ZGlyPT09J0Fycm93UmlnaHQnP3N0ZXA6MCwgZHk9ZGlyPT09J0Fycm93VXAnPy1zdGVwOmRpcj09PSdBcnJvd0Rvd24nP3N0ZXA6MDsKICAgIHAucG9pbnRzLmZvckVhY2gocT0+eyBpZihxLnU9PT1TR1QuU0VOVClyZXR1cm47IGxldCB4PVNHVC5kZWMocS51KStkeCx5PVNHVC5kZWMocS52KStkeTsgaWYob3B0cy5zbmFwKXt4PU1hdGgucm91bmQoeC80KSo0O3k9TWF0aC5yb3VuZCh5LzQpKjQ7fSBxLnU9U0dULmVuYyh4KTtxLnY9U0dULmVuYyh5KTt9KTsKICAgIG1hcmtEaXJ0eSgpOyBkcmF3UmVuZGVyKCk7IHN5bmNQb2ludElucHV0cygpOwogIH0KICBmdW5jdGlvbiBkb1JlZG8oKXtpZighcmVkby5sZW5ndGgpcmV0dXJuO3VuZG8ucHVzaChjbG9uZShpdGVtc1tjdXJdLnBhcnNlZC5wcmltcykpO2l0ZW1zW2N1cl0ucGFyc2VkLnByaW1zPXJlZG8ucG9wKCk7bWFya0RpcnR5KCk7ZHJhd1JlbmRlcigpO2J1aWxkSW5zcGVjdG9yKCk7dXBkYXRlRWRpdFBhbmVsKCk7fQogIGZ1bmN0aW9uIGNvbG9yUm93KGxhYmVsLGspewogICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJ2cm93IiBkYXRhLWNrPSIke2t9Ij5gCiAgICAgICtgPHNwYW4gY2xhc3M9ImxhYiI+JHtsYWJlbH08L3NwYW4+YAogICAgICArYDxpbnB1dCB0eXBlPSJjb2xvciIgY2xhc3M9ImNwaWNrIj5gCiAgICAgICtgPGlucHV0IHR5cGU9InJhbmdlIiBtaW49IjAiIG1heD0iMjU1IiBjbGFzcz0iYXNsaWRlIj48c3BhbiBjbGFzcz0iYXYiPjwvc3Bhbj48L2Rpdj5gOwogIH0KICBmdW5jdGlvbiBnZXRDb2xvcihwLGspe3JldHVybiBrPDA/cC5jb2xvcjpwLmV4dENvbG9yc1trXTt9CiAgY29uc3QgaGV4PWM9PicjJytbYy5yLGMuZyxjLmJdLm1hcCh4PT54LnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCcwJykpLmpvaW4oJycpOwogIGZ1bmN0aW9uIHdpcmVDb2xvcnMocCl7CiAgICAkKCcjZWRpdEJvZHknKS5xdWVyeVNlbGVjdG9yQWxsKCcudnJvd1tkYXRhLWNrXScpLmZvckVhY2gocm93PT57CiAgICAgIGNvbnN0IGs9K3Jvdy5kYXRhc2V0LmNrO2NvbnN0IGM9Z2V0Q29sb3IocCxrKTsKICAgICAgY29uc3QgcGljaz1yb3cucXVlcnlTZWxlY3RvcignLmNwaWNrJyksc2w9cm93LnF1ZXJ5U2VsZWN0b3IoJy5hc2xpZGUnKSxhdj1yb3cucXVlcnlTZWxlY3RvcignLmF2Jyk7CiAgICAgIHBpY2sudmFsdWU9aGV4KGMpO3NsLnZhbHVlPWMuYTthdi50ZXh0Q29udGVudD1jLmE7CiAgICAgIGNvbnN0IGFwcGx5PShjb21taXQpPT57Y29uc3QgY29sPWdldENvbG9yKGl0ZW1zW2N1cl0ucGFyc2VkLnByaW1zW3NlbF0sayk7CiAgICAgICAgY29uc3QgaD1waWNrLnZhbHVlO2NvbC5yPXBhcnNlSW50KGguc2xpY2UoMSwzKSwxNik7Y29sLmc9cGFyc2VJbnQoaC5zbGljZSgzLDUpLDE2KTtjb2wuYj1wYXJzZUludChoLnNsaWNlKDUsNyksMTYpOwogICAgICAgIGNvbC5hPStzbC52YWx1ZTthdi50ZXh0Q29udGVudD1zbC52YWx1ZTttYXJrRGlydHkoKTtkcmF3UmVuZGVyKCk7fTsKICAgICAgcGljay5vbmlucHV0PSgpPT5hcHBseSgpO3BpY2sub25jaGFuZ2U9KCk9PntwdXNoVW5kbygpO2FwcGx5KCk7fTsKICAgICAgc2wub25pbnB1dD0oKT0+YXBwbHkoKTtzbC5vbmNoYW5nZT0oKT0+e3B1c2hVbmRvKCk7YXBwbHkoKTt9OwogICAgfSk7CiAgfQoKICAvKiAtLS0tIGRyYWdnaW5nIGhhbmRsZXMgKGNhcHR1cmUgb24gc3RhYmxlIFNWRyByb290OyBpbi1wbGFjZSBnZW9tZXRyeSB1cGRhdGUpIC0tLS0gKi8KICBmdW5jdGlvbiB3aXJlSGFuZGxlcyhzdmcpewogICAgbGV0IGRyYWc9bnVsbCwgcGlkPW51bGw7CiAgICBjb25zdCB0b1N2Zz0oY3gsY3kpPT57Y29uc3QgcHQ9c3ZnLmNyZWF0ZVNWR1BvaW50KCk7cHQueD1jeDtwdC55PWN5O2NvbnN0IG09c3ZnLmdldFNjcmVlbkNUTSgpLmludmVyc2UoKTtjb25zdCByPXB0Lm1hdHJpeFRyYW5zZm9ybShtKTsKICAgICAgcmV0dXJuIHt1Ok1hdGgubWF4KC0yMDQ4LE1hdGgubWluKDIwNDcsTWF0aC5yb3VuZChyLngpKSksdjpNYXRoLm1heCgtMjA0OCxNYXRoLm1pbigyMDQ3LE1hdGgucm91bmQoci55KSkpfTt9OwogICAgc3ZnLnF1ZXJ5U2VsZWN0b3JBbGwoJy5oYW5kbGUtZycpLmZvckVhY2goZz0+ewogICAgICBnLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJyxlPT57ZS5wcmV2ZW50RGVmYXVsdCgpO2Uuc3RvcFByb3BhZ2F0aW9uKCk7CiAgICAgICAgcHVzaFVuZG8oKTtkcmFnPXtpOitnLmRhdGFzZXQuaSxrOitnLmRhdGFzZXQuayxnfTtwaWQ9ZS5wb2ludGVySWQ7Zy5jbGFzc0xpc3QuYWRkKCdkcmFnJyk7CiAgICAgICAgdHJ5e3N2Zy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7fWNhdGNoKF8pe319KTsKICAgIH0pOwogICAgc3ZnLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJyxlPT57aWYoIWRyYWcpcmV0dXJuOwogICAgICBjb25zdCBxPXRvU3ZnKGUuY2xpZW50WCxlLmNsaWVudFkpOyAgICAgICAgICAgICAgICAgICAgICAgLy8gcSBpcyBzaWduZWQgc2NyZWVuIHNwYWNlCiAgICAgIGlmKG9wdHMuc25hcCl7cS51PU1hdGgucm91bmQocS51LzQpKjQ7cS52PU1hdGgucm91bmQocS52LzQpKjQ7fQogICAgICBjb25zdCBwdD1pdGVtc1tjdXJdLnBhcnNlZC5wcmltc1tkcmFnLmldLnBvaW50c1tkcmFnLmtdO3B0LnU9U0dULmVuYyhxLnUpO3B0LnY9U0dULmVuYyhxLnYpOwogICAgICBkcmFnLmcuc2V0QXR0cmlidXRlKCd0cmFuc2Zvcm0nLGB0cmFuc2xhdGUoJHtxLnV9LCR7cS52fSlgKTsKICAgICAgdXBkYXRlUHJpbUVsKHN2ZyxkcmFnLmkpO30pOwogICAgY29uc3QgZW5kPSgpPT57aWYoIWRyYWcpcmV0dXJuO2RyYWcuZy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnJyk7CiAgICAgIHRyeXtpZihwaWQhPW51bGwpc3ZnLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShwaWQpO31jYXRjaChfKXt9CiAgICAgIGRyYWc9bnVsbDtwaWQ9bnVsbDttYXJrRGlydHkoKTtzeW5jUG9pbnRJbnB1dHMoKTt9OwogICAgc3ZnLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsZW5kKTtzdmcuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmNhbmNlbCcsZW5kKTtzdmcuYWRkRXZlbnRMaXN0ZW5lcignbG9zdHBvaW50ZXJjYXB0dXJlJyxlbmQpOwogIH0KICAvLyB1cGRhdGUgYSBzaW5nbGUgcHJpbWl0aXZlJ3MgZ2VvbWV0cnkgYXR0cmlidXRlcyBpbiBwbGFjZSAobm8gcmVidWlsZCkKICBmdW5jdGlvbiB1cGRhdGVQcmltRWwoc3ZnLGkpewogICAgY29uc3QgcD1pdGVtc1tjdXJdLnBhcnNlZC5wcmltc1tpXTtjb25zdCBlbD1zdmcucXVlcnlTZWxlY3RvcihgLnByaW1bZGF0YS1pPSIke2l9Il1gKTtpZighZWwpcmV0dXJuOwogICAgY29uc3QgZD1TR1QuZGlzcGxheU9mKHApOwogICAgaWYocC50eXBlPT09J2xpbmUnKXtlbC5zZXRBdHRyaWJ1dGUoJ3gxJyxkLnB0c1swXS51KTtlbC5zZXRBdHRyaWJ1dGUoJ3kxJyxkLnB0c1swXS52KTtlbC5zZXRBdHRyaWJ1dGUoJ3gyJyxkLnB0c1sxXS51KTtlbC5zZXRBdHRyaWJ1dGUoJ3kyJyxkLnB0c1sxXS52KTt9CiAgICBlbHNlIGlmKHAudHlwZT09PSd0ZXh0Jyl7ZWwuc2V0QXR0cmlidXRlKCd4JyxkLnB0c1swXS51KTtlbC5zZXRBdHRyaWJ1dGUoJ3knLGQucHRzWzBdLnYpO30KICAgIGVsc2V7bGV0IHB0cz1kLnB0cy5tYXAocT0+YCR7cS51fSwke3Eudn1gKS5qb2luKCcgJyk7aWYoZC5jbG9zZWQpcHRzKz0nICcrZC5wdHNbMF0udSsnLCcrZC5wdHNbMF0udjtlbC5zZXRBdHRyaWJ1dGUoJ3BvaW50cycscHRzKTsKICAgICAgaWYocC50eXBlPT09J21lc2gnKXtjb25zdCBnPXN2Zy5xdWVyeVNlbGVjdG9yKGAjZyR7aX1gKTtpZihnKXtnLnNldEF0dHJpYnV0ZSgneDEnLGQucHRzWzBdLnUpO2cuc2V0QXR0cmlidXRlKCd5MScsZC5wdHNbMF0udik7Zy5zZXRBdHRyaWJ1dGUoJ3gyJyxkLnB0c1syXS51KTtnLnNldEF0dHJpYnV0ZSgneTInLGQucHRzWzJdLnYpO319fQogIH0KICAvLyByZWZyZXNoIGp1c3QgdGhlIG51bWVyaWMgcG9pbnQgaW5wdXRzIGFmdGVyIGEgZHJhZyAoYXZvaWRzIHJlYnVpbGRpbmcgdGhlIHBhbmVsKQogIGZ1bmN0aW9uIHN5bmNQb2ludElucHV0cygpewogICAgaWYoc2VsPDApcmV0dXJuO2NvbnN0IHA9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXNbc2VsXTtpZighcClyZXR1cm47CiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjcHRsaXN0IC5wdCBpbnB1dCcpLmZvckVhY2goaW5wPT57Y29uc3Qgaz0raW5wLmRhdGFzZXQuaztpbnAudmFsdWU9U0dULmRlYyhwLnBvaW50c1trXVtpbnAuZGF0YXNldC5heF0pO30pOwogIH0KCiAgLyogLS0tLSBhZGQgLyBkZWxldGUgcHJpbWl0aXZlcyAtLS0tICovCiAgZnVuY3Rpb24gYWRkUHJpbSh0eXBlKXsKICAgIGlmKGN1cjwwKXJldHVybjsgY29uc3QgcHJpbXM9aXRlbXNbY3VyXS5wYXJzZWQucHJpbXM7CiAgICBpZihwcmltcy5sZW5ndGg+PTI1NSl7YWxlcnROb3RlKCdNYXggMjU1IHByaW1pdGl2ZXMgKGhlYWRlciBSb3dzIGlzIHU4KS4nKTtyZXR1cm47fQogICAgcHVzaFVuZG8oKTsKICAgIGNvbnN0IGk9cHJpbXMubGVuZ3RoLCBDPShyLGcsYixhKT0+KHtyLGcsYixhfSk7CiAgICBsZXQgcDsKICAgIGlmKHR5cGU9PT0nbGluZScpIHA9e2ksb3JkZXI6MCxjb2xvclM6MCxvZmY6bnVsbCxhZGRlZDp0cnVlLHNoYXBlOjMsdHlwZTonbGluZScsY29sb3I6QygyNTUsMjU1LDI1NSwyNTUpLHBvaW50czpbe3U6MTMwLHY6OTZ9LHt1OjE5MCx2OjEyOH1dLGV4dENvbG9yczpudWxsLHRleHRCeXRlczpudWxsLHRleHQ6bnVsbH07CiAgICBlbHNlIGlmKHR5cGU9PT0ncG9seWdvbicpIHA9e2ksb3JkZXI6MCxjb2xvclM6MCxvZmY6bnVsbCxhZGRlZDp0cnVlLHNoYXBlOjUsdHlwZToncG9seWdvbicsY29sb3I6QygyNTUsMjU1LDI1NSwxNjApLHBvaW50czpbe3U6MTMwLHY6OTB9LHt1OjE5MCx2OjkwfSx7dToxMzAsdjoxMzR9LHt1OjE5MCx2OjEzNH1dLGV4dENvbG9yczpudWxsLHRleHRCeXRlczpudWxsLHRleHQ6bnVsbH07CiAgICBlbHNlIGlmKHR5cGU9PT0nbWVzaCcpIHA9e2ksb3JkZXI6MCxjb2xvclM6MCxvZmY6bnVsbCxhZGRlZDp0cnVlLHNoYXBlOjgsdHlwZTonbWVzaCcsY29sb3I6QygyNTUsMjU1LDI1NSwyMDApLHBvaW50czpbe3U6MTMwLHY6OTB9LHt1OjE5MCx2OjkwfSx7dToxMzAsdjoxMzR9LHt1OjE5MCx2OjEzNH1dLGV4dENvbG9yczpbQygyNTUsMjU1LDI1NSwyMDApLEMoMCwwLDAsMjAwKSxDKDAsMCwwLDIwMCldLHRleHRCeXRlczpudWxsLHRleHQ6bnVsbH07CiAgICBlbHNlIGlmKHR5cGU9PT0ndGV4dCcpe2NvbnN0IHM9J1RFWFQnO3A9e2ksb3JkZXI6MCxjb2xvclM6MCxvZmY6bnVsbCxhZGRlZDp0cnVlLHNoYXBlOjI1NSx0eXBlOid0ZXh0Jyxjb2xvcjpDKDI1NSwyNTUsMTI4LDI1NSkscG9pbnRzOlt7dToxMzAsdjoxMDR9XSxleHRDb2xvcnM6bnVsbCx0ZXh0Qnl0ZXM6QXJyYXkuZnJvbSh7bGVuZ3RoOjE2fSwoXyxrKT0+azxzLmxlbmd0aD9zLmNoYXJDb2RlQXQoayk6MCksdGV4dDpzfTt9CiAgICBlbHNlIHJldHVybjsKICAgIHByaW1zLnB1c2gocCk7CiAgICBlZGl0TW9kZT10cnVlOyQoJyNlZGl0VGcnKS5jbGFzc0xpc3QuYWRkKCdvbicpOwogICAgc2VsPWk7bWFya0RpcnR5KCk7ZHJhd1JlbmRlcigpO2J1aWxkSW5zcGVjdG9yKCk7dXBkYXRlRWRpdFBhbmVsKCk7CiAgfQogIGZ1bmN0aW9uIGRlbGV0ZUFwcGVuZGVkKCl7CiAgICBpZihjdXI8MHx8c2VsPDApcmV0dXJuO3B1c2hVbmRvKCk7CiAgICBjb25zdCBwcmltcz1pdGVtc1tjdXJdLnBhcnNlZC5wcmltczsKICAgIHByaW1zLnNwbGljZShzZWwsMSk7cHJpbXMuZm9yRWFjaCgocCxrKT0+cC5pPWspOwogICAgc2VsPS0xO21hcmtEaXJ0eSgpO2RyYXdSZW5kZXIoKTtidWlsZEluc3BlY3RvcigpO3VwZGF0ZUVkaXRQYW5lbCgpOwogIH0KICBmdW5jdGlvbiBhbGVydE5vdGUobSl7Y29uc3QgZWw9JCgnI2REaW1zJyk7Y29uc3Qgbz1lbC50ZXh0Q29udGVudDtlbC50ZXh0Q29udGVudD1tO2VsLnN0eWxlLmNvbG9yPSd2YXIoLS1hbWJlciknO3NldFRpbWVvdXQoKCk9PntlbC50ZXh0Q29udGVudD1vO2VsLnN0eWxlLmNvbG9yPScnO30sMTgwMCk7fQoKICAvKiAtLS0tIGV4cG9ydCAtLS0tICovCiAgZnVuY3Rpb24gZXhwb3J0U2d0KCl7CiAgICBjb25zdCBpdD1pdGVtc1tjdXJdOwogICAgbGV0IGJ5dGVzOwogICAgdHJ5eyBieXRlcz1TR1Quc2VyaWFsaXplKGl0LnBhcnNlZCk7IH0KICAgIGNhdGNoKGVycil7IGFsZXJ0Tm90ZSgnRXhwb3J0IGJsb2NrZWQ6ICcrZXJyLm1lc3NhZ2UpOyByZXR1cm47IH0KICAgIGNvbnN0IGFwcGVuZGVkPWl0LnBhcnNlZC5wcmltcy5zb21lKHA9PnAub2ZmPT1udWxsKTsKICAgIGNvbnN0IGludGVyYWN0aXZlPWl0LnBhcnNlZC5fYnVmLnNsaWNlKGl0LnBhcnNlZC51MikubGVuZ3RoPjQ7CiAgICBpZihhcHBlbmRlZCYmaW50ZXJhY3RpdmUpIGFsZXJ0Tm90ZSgnRXhwb3J0ZWQg4oCUIG5vdGU6IGFkZGVkIHByaW1zIGFyZW7igJl0IHdpcmVkIGludG8gdGhpcyBpbnRlcmFjdGl2ZSBzY3JlZW4uJyk7CiAgICBjb25zdCBibG9iPW5ldyBCbG9iKFtieXRlc10se3R5cGU6J2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSd9KTsKICAgIGNvbnN0IGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO2EuaHJlZj1VUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO2EuZG93bmxvYWQ9aXQubmFtZTthLmNsaWNrKCk7CiAgICBzZXRUaW1lb3V0KCgpPT5VUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZiksMjAwMCk7CiAgfQoKICBmdW5jdGlvbiBpbml0KCl7CiAgICAkKCcjbG9hZEJ0bicpLm9uY2xpY2s9KCk9PiQoJyNmaWxlSW5wdXQnKS5jbGljaygpOwogICAgJCgnI2ZpbGVJbnB1dCcpLm9uY2hhbmdlPWU9PmhhbmRsZUZpbGVzKGUudGFyZ2V0LmZpbGVzKTsKICAgICQoJyNjbGVhckJ0bicpLm9uY2xpY2s9KCk9PntpdGVtcz1bXTtyZW5kZXJHcmlkKCk7fTsKICAgICQoJyNleGl0QnRuJykub25jbGljaz1leGl0VG9vbDsKICAgICQoJyNkQ2xvc2UnKS5vbmNsaWNrPSgpPT4kKCcjZGV0YWlsJykuY2xhc3NMaXN0LnJlbW92ZSgnb3BlbicpOwogICAgJCgnI2RldGFpbCcpLm9uY2xpY2s9ZT0+e2lmKGUudGFyZ2V0LmlkPT09J2RldGFpbCcpJCgnI2RldGFpbCcpLmNsYXNzTGlzdC5yZW1vdmUoJ29wZW4nKTt9OwogICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsZT0+ewogICAgICBjb25zdCBvcGVuPSQoJyNkZXRhaWwnKS5jbGFzc0xpc3QuY29udGFpbnMoJ29wZW4nKTsKICAgICAgaWYoZS5rZXk9PT0nRXNjYXBlJyl7JCgnI2RldGFpbCcpLmNsYXNzTGlzdC5yZW1vdmUoJ29wZW4nKTtyZXR1cm47fQogICAgICBpZighb3BlbilyZXR1cm47CiAgICAgIGNvbnN0IGs9ZS5rZXkudG9Mb3dlckNhc2UoKTsKICAgICAgaWYoKGUuY3RybEtleXx8ZS5tZXRhS2V5KSYmaz09PSd6JyYmIWUuc2hpZnRLZXkpe2UucHJldmVudERlZmF1bHQoKTtkb1VuZG8oKTtyZXR1cm47fQogICAgICBpZigoZS5jdHJsS2V5fHxlLm1ldGFLZXkpJiYoaz09PSd5J3x8KGs9PT0neicmJmUuc2hpZnRLZXkpKSl7ZS5wcmV2ZW50RGVmYXVsdCgpO2RvUmVkbygpO3JldHVybjt9CiAgICAgIGlmKHNlbD49MCYmWydBcnJvd1VwJywnQXJyb3dEb3duJywnQXJyb3dMZWZ0JywnQXJyb3dSaWdodCddLmluY2x1ZGVzKGUua2V5KSl7CiAgICAgICAgY29uc3QgdGFnPShlLnRhcmdldC50YWdOYW1lfHwnJykudG9Mb3dlckNhc2UoKTsgaWYodGFnPT09J2lucHV0J3x8dGFnPT09J3RleHRhcmVhJylyZXR1cm47CiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBudWRnZShlLmtleSxlLnNoaWZ0S2V5PzEwOjEpOwogICAgICB9CiAgICB9KTsKICAgICQoJyNlZGl0VGcnKS5vbmNsaWNrPSgpPT57ZWRpdE1vZGU9IWVkaXRNb2RlOyQoJyNlZGl0VGcnKS5jbGFzc0xpc3QudG9nZ2xlKCdvbicsZWRpdE1vZGUpO2RyYXdSZW5kZXIoKTt1cGRhdGVFZGl0UGFuZWwoKTt9OwogICAgJCgnI3VuZG9CdG4nKS5vbmNsaWNrPWRvVW5kbzsKICAgICQoJyNyZWRvQnRuJykub25jbGljaz1kb1JlZG87CiAgICAkKCcjcmVzZXRCdG4nKS5vbmNsaWNrPSgpPT57Y29uc3QgaXQ9aXRlbXNbY3VyXTtpdC5wYXJzZWQ9U0dULnBhcnNlKGl0Lm9yaWcpO2l0LmRpcnR5PWZhbHNlO3VuZG89W107cmVkbz1bXTtzZWw9LTE7CiAgICAgIGRyYXdSZW5kZXIoKTtidWlsZEluc3BlY3RvcigpO3VwZGF0ZUVkaXRQYW5lbCgpO3VwZGF0ZUJhcnMoKTtyZWZyZXNoQ2FyZChjdXIpO307CiAgICAkKCcjZXhwb3J0QnRuJykub25jbGljaz1leHBvcnRTZ3Q7CiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYWRkYicpLmZvckVhY2goYj0+Yi5vbmNsaWNrPSgpPT5hZGRQcmltKGIuZGF0YXNldC5hZGQpKTsKICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50b2dnbGVzIC50ZycpLmZvckVhY2godD0+dC5vbmNsaWNrPSgpPT57dC5jbGFzc0xpc3QudG9nZ2xlKCdvbicpO29wdHNbdC5kYXRhc2V0LnRdPXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpOwogICAgICBpZigkKCcjZGV0YWlsJykuY2xhc3NMaXN0LmNvbnRhaW5zKCdvcGVuJykpZHJhd1JlbmRlcigpO3JlbmRlckdyaWRTb2Z0KCk7fSk7CiAgICAvLyBkcmFnL2Ryb3AKICAgIGNvbnN0IGR6PWRvY3VtZW50LmJvZHk7CiAgICBbJ2RyYWdlbnRlcicsJ2RyYWdvdmVyJ10uZm9yRWFjaChldj0+ZHouYWRkRXZlbnRMaXN0ZW5lcihldixlPT57ZS5wcmV2ZW50RGVmYXVsdCgpOyQoJyNkcm9wJykuY2xhc3NMaXN0LmFkZCgnaG90Jyk7fSkpOwogICAgWydkcmFnbGVhdmUnLCdkcm9wJ10uZm9yRWFjaChldj0+ZHouYWRkRXZlbnRMaXN0ZW5lcihldixlPT57ZS5wcmV2ZW50RGVmYXVsdCgpO2lmKGV2PT09J2Ryb3AnfHxlLnRhcmdldD09PWRvY3VtZW50LmJvZHkpJCgnI2Ryb3AnKS5jbGFzc0xpc3QucmVtb3ZlKCdob3QnKTt9KSk7CiAgICBkei5hZGRFdmVudExpc3RlbmVyKCdkcm9wJyxlPT57ZS5wcmV2ZW50RGVmYXVsdCgpOyQoJyNkcm9wJykuY2xhc3NMaXN0LnJlbW92ZSgnaG90Jyk7aWYoZS5kYXRhVHJhbnNmZXIuZmlsZXMubGVuZ3RoKWhhbmRsZUZpbGVzKGUuZGF0YVRyYW5zZmVyLmZpbGVzKTt9KTsKICB9CiAgZnVuY3Rpb24gZXhpdFRvb2woKXsKICAgIC8vIHdoZW4gZW1iZWRkZWQgaW4gdGhlIG1vZCBzdWl0ZSwgdGhlIGhvc3Qgc2V0cyB3aW5kb3cuU0dUX0hPU1RfRVhJVCB0byBuYXZpZ2F0ZSB0byBpdHMgbGFuZGluZyBwYWdlCiAgICBpZih0eXBlb2Ygd2luZG93LlNHVF9IT1NUX0VYSVQ9PT0nZnVuY3Rpb24nKXsgd2luZG93LlNHVF9IT1NUX0VYSVQoKTsgcmV0dXJuOyB9CiAgICAvLyBzdGFuZGFsb25lIGZhbGxiYWNrOiByZXR1cm4gdG8gdGhlIGVtcHR5IGxhbmRpbmcvZHJvcCBzdGF0ZQogICAgJCgnI2RldGFpbCcpLmNsYXNzTGlzdC5yZW1vdmUoJ29wZW4nKTsgaXRlbXM9W107IGN1cj0tMTsgc2VsPS0xOyByZW5kZXJHcmlkKCk7CiAgfQogIGZ1bmN0aW9uIHJlbmRlckdyaWRTb2Z0KCl7aXRlbXMuZm9yRWFjaCgoXyxpKT0+cmVmcmVzaENhcmQoaSkpO30KICBmdW5jdGlvbiBkb1VuZG8oKXtpZighdW5kby5sZW5ndGgpcmV0dXJuO3JlZG8ucHVzaChjbG9uZShpdGVtc1tjdXJdLnBhcnNlZC5wcmltcykpO2l0ZW1zW2N1cl0ucGFyc2VkLnByaW1zPXVuZG8ucG9wKCk7bWFya0RpcnR5KCk7ZHJhd1JlbmRlcigpO2J1aWxkSW5zcGVjdG9yKCk7dXBkYXRlRWRpdFBhbmVsKCk7fQogIHJldHVybiB7aW5pdH07Cn0pKCk7CkFwcC5pbml0KCk7Cjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K";
function openSgtEditor(){
  if(document.getElementById('sgtOverlay')) return;
  var ov=document.createElement('div'); ov.id='sgtOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#0a0e14';
  var ifr=document.createElement('iframe');
  ifr.style.cssText='border:0;width:100%;height:100%;display:block';
  ifr.srcdoc=atob(SGT_EDITOR_HTML_B64);
  ifr.onload=function(){ try{ ifr.contentWindow.SGT_HOST_EXIT=function(){ closeSgtEditor(); }; }catch(e){} };
  ov.appendChild(ifr); document.body.appendChild(ov);
}
function closeSgtEditor(){ var ov=document.getElementById('sgtOverlay'); if(ov) ov.remove(); }

// Open the Stage Editor directly on an empty stage (no forced HZM picker).
// Builds a minimal valid 28-byte HZM header and runs it through the real parseHZM
// so `hzm` has exactly the shape the editor + exporter expect. Importing a real
// HZM afterward (Import > +HZM) full-loads into this blank base (see mergeHZM).
function openStageEditorBlank(){
  var ab=new ArrayBuffer(0x1c); var dv=new DataView(ab);
  dv.setUint16(10,0,true);       // ac  = 0 areas
  dv.setInt16(12,0,true);        // nz  = 0 nav zones
  dv.setInt16(14,0,true);        // nr  = 0
  dv.setUint32(0x14,0x1c,true);  // nzOff = end of buffer -> empty routeData
  dv.setUint32(0x18,0,true);     // rtb = 0 -> 32 empty route slots
  hzmFN='(new stage)';
  try{ hzm=parseHZM(ab); }catch(err){ alert('Could not start a blank stage: '+err.message); return; }
  selW={};colW={};newW=[];selF={};colF={};newF=[];selZ={};colZ={};newZ=[];
  newNavZones=[];undoHist=[];undoSnapshots=[];undoPtr=-1;clipboard=[];
  selRoute=-1;selWP=-1;selNavZone=-1;selGCL=-1;
  showFl=true;
  showEd();
  takeSnapshot('New stage');
}

// Stage tile entry: resume an in-progress stage if one exists this session,
// otherwise start a fresh blank stage. (New button clears hzm, so after New the
// tile starts blank again.)
function openStageEditor(){
  if(window.hzm) showEd();
  else openStageEditorBlank();
}

// Close the Stage Editor back to the main launcher, mirroring the other tools'
// top-right close. In-memory work is preserved, so re-opening the tile resumes it;
// use New (or load a session) to start over. The fixed #stageCloseBtn lives inside
// #app, so showDrop() rebuilding the launcher removes it automatically.
function closeStageEditor(){
  try{ LIT3D_teardown(); }catch(e){}
  showDrop();
}

function showEd(){
var tb='<div class="toolbar" style="padding-right:104px">';
tb+='<button id="stageCloseBtn" onclick="closeStageEditor()" title="Close \u2014 back to main menu" style="position:fixed;top:5px;right:7px;z-index:60;background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:monospace">\u2715 Close</button>';
tb+='<span class="title">MGS Stage Editor</span><span class="info">'+hzmFN+'</span><span class="info" id="tbi"></span><span class="sel" id="tbs"></span><span class="spacer"></span>';
// Tools
tb+='<button class="btn tb active" data-t="click" onclick="setT(\'click\')" title="Select mode (click to select objects)">SELECT</button>';
tb+='<button class="btn" id="btnBoxSel" onclick="toggleBoxSel()" title="Box Select: drag a rectangle to select walls/floors/zones">BoxSel</button>';
// === TOOLBAR: TOOLS ===
tb+='<span style="color:#556;font-size:9px;margin-right:2px">TOOLS</span>';
tb+='<button class="btn tb" data-t="drawwall" onclick="setT(\'drawwall\')" title="Draw Wall">Wall</button>';
tb+='<button class="btn tb" data-t="drawfloor" onclick="setT(\'drawfloor\')" title="Draw Floor">Floor</button>';
tb+='<button class="btn tb" data-t="drawzone" onclick="setT(\'drawzone\')" title="Draw Zone">Zone</button>';
tb+='<button class="btn tb" onclick="rampToStairsUI()" title="Convert selected ramp into N stepped treads + risers (default 250u rise per step)" style="color:#aa88ff">Stairs</button>';
// (Resize button removed — spacebar transform mode does this now.)
// (+WP button removed — handled by the route editor now.)
tb+='<button class="btn tb" id="btnAINav" onclick="toggleAINavPanel()" title="AI NavZones: open the nav-zone editor panel" style="color:#00ffaa">AI NavZones</button>';
tb+='<button class="btn tb" onclick="LIT3D_togglePanel()" title="Show stage lights (.lit) in the 3D view" style="color:#ffd24a">\uD83D\uDCA1 Lights</button>';
tb+='<button class="btn tb" data-t="eyedrop" onclick="setT(curTool===\'eyedrop\'?\'sel\':\'eyedrop\')" title="Pick texture from KMD face. Requires Textured mode + loaded stg_tex DAR. Click a KMD face to capture. Esc to cancel." style="color:#44cc88">🎨</button>';
// (Chain wall draw checkbox removed)
tb+='<span class="sep">|</span>';
// === PARAMS ===
tb+='<label class="chk">Y:<input type="number" id="yinput" value="0" step="250" class="ninput" onchange="placeY=parseInt(this.value)||0"></label>';
tb+='<button class="btn" id="btnSurfY" onclick="surfYMode=!surfYMode;var b=document.getElementById(\'btnSurfY\');b.classList.toggle(\'active\',surfYMode);document.getElementById(\'coordinfo\').textContent=surfYMode?\'SurfY ON — click any floor or wall to lock its Y height\':\'SurfY OFF — Y locked at \'+placeY" title="SurfY: click ON then click a floor/wall to lock its Y. Click OFF to confirm.">SurfY</button>';
tb+='<button class="btn" onclick="setYFromSurface(lastSurfY)" title="Re-apply last captured surface Y ('+0+')" id="btnApplyY">↑Y</button>';
tb+='<label class="chk">H:<input type="number" id="hinput" value="2000" step="250" class="ninput" onchange="placeH=parseInt(this.value)||2000"></label>';
tb+='<label class="chk">Snap:<input type="number" id="snapinput" value="250" step="50" class="ninput" onchange="setSnap(this.value)"></label>';
tb+='<label class="chk" style="color:#44cc88">UV:<select id="uvmode" onchange="uvTileMode=this.value" style="background:#0a0e14;color:#44cc88;border:1px solid #1a2535;font-size:9px"><option value="fit">Fit</option><option value="repeat">Repeat</option></select></label>';
tb+='<span class="sep">|</span>';
// === VIEW (dropdown) ===
tb+='<button class="btn" id="btnViewMenu" onclick="toggleViewMenu()" title="Visibility toggles">View ▾</button>';
tb+='<button class="btn kbtn active" data-km="wire" onclick="setKmdMode(\'wire\')" style="color:#8866cc">Wire</button>';
tb+='<button class="btn kbtn" data-km="solid" onclick="setKmdMode(\'solid\')" style="color:#8866cc">Solid</button>';
tb+='<button class="btn kbtn" data-km="both" onclick="setKmdMode(\'both\')" style="color:#8866cc">Both</button>';
tb+='<button class="btn kbtn" data-km="tex" onclick="setKmdMode(\'tex\')" style="color:#44cc88">Textured</button>';
tb+='<span class="sep">|</span>';
// === ACTIONS ===
tb+='<span style="color:#556;font-size:9px;margin-right:2px">EDIT</span>';
tb+='<button class="btn" id="bdel" onclick="doDel()" disabled>Del(0)</button>';
tb+='<button class="btn" onclick="doCopy()" title="Ctrl+C: copy with texture">Cpy</button>';
tb+='<button class="btn" onclick="doPaste()" title="Ctrl+V: paste with texture">Pst</button>';
tb+='<button class="btn" id="buw" onclick="undoLast()" disabled>Undo</button>';
tb+='<button class="btn" onclick="rstAll()">Reset</button>';
tb+='<span class="sep">|</span>';
// === KMD FACE TOOLS ===
tb+='<button class="btn" data-delfacebtn onclick="deleteKmdFaceUnderMouse()" style="color:#ff4488" title="Toggle: right-click KMD faces to delete them from this stage\'s render">RemoveKMDImg</button>';
tb+='<button class="btn" onclick="clearKmdDeleted()" style="color:#ff4488" title="Restore all deleted KMD faces (use the per-KMD Restore in the KMD side panel to scope to one KMD)">Restore All</button>';
tb+='<span class="sep">|</span>';
// === CAMERA ===
tb+='<button class="btn" onclick="camTop()" title="Top view">Top</button>';
tb+='<button class="btn" onclick="camFront()">Frt</button>';
tb+='<button class="btn" onclick="camSide()">Side</button>';
tb+='<button class="btn" onclick="camReset()">Rst</button>';
tb+='<button class="btn" onclick="saveCamBookmark()" title="Save camera bookmark">📌</button>';
tb+='<span class="sep">|</span>';
// === FILES ===
tb+='<span style="color:#556;font-size:9px;margin-right:2px">FILES</span>';
// Import dropdown — replaces +KMD/+TEX/+HZM/+MDL/ImpDAR/ImpKMD/ImpPCX buttons
tb+='<button class="btn" id="btnImportMenu" onclick="toggleImportMenu()" style="color:#ff00ff" title="Import models, textures, HZM, etc.">Import ▾</button>';
// Hidden file inputs still need to live in the DOM so the dropdown items can trigger them
tb+='<input type="file" id="kfi" accept=".kmd" multiple style="display:none" onchange="if(this.files.length)handleKMD(this.files)">';
tb+='<input type="file" id="darfi" accept=".dar" multiple style="display:none" onchange="if(this.files.length)handleDARFiles(this.files)">';
tb+='<input type="file" id="hzmfi2" accept=".hzm" style="display:none" onchange="if(this.files[0]){var r2=new FileReader();r2.onload=function(e2){mergeHZM(e2.target.result)};r2.readAsArrayBuffer(this.files[0]);this.value=\'\'}">';
tb+='<input type="file" id="mdlfi" accept=".dar" multiple style="display:none" onchange="if(this.files.length)handleMDLFiles(this.files)">';
tb+='<span class="info" id="dar-info"></span>';
tb+='<span class="info" id="mdl-info"></span>';
tb+='<button class="btn" onclick="showStats()">Stats</button>';
tb+='<span class="sep">|</span>';
// === IMPORT ===
tb+='<span style="color:#556;font-size:9px;margin-right:2px">IMPORT</span>';
tb+='<button class="btn" onclick="openSpawnWizard()" style="color:#44ccaa" title="Add a new entity (enemy, animal, prop, etc.) to the current stage with parameter wizard">SpawnWiz</button>';
tb+='<button class="btn" onclick="openDoorWizard()" style="color:#ff8844" title="Add a door with full system support: keycard, room linkage, stage transitions, panel lamp">+ Door</button>';
tb+='<input type="file" id="importDarFi" accept=".dar" multiple style="display:none" onchange="if(this.files.length)handleImportDAR(this.files)">';
tb+='<input type="file" id="importKmdFi" accept=".kmd" multiple style="display:none" onchange="if(this.files.length)handleImportKMD(this.files)">';
tb+='<input type="file" id="importPcxFi" accept=".pcx" multiple style="display:none" onchange="if(this.files.length)handleImportPCX(this.files)">';
tb+='<span class="sep">|</span>';
// === EXPORT ===
tb+='<button class="btn" id="btnExportMenu" onclick="toggleExportMenu()" style="color:#ff8844">Export ▾</button>';
tb+='<button class="btn export" onclick="exportAll()" title="Export everything: HZM + MDL + TEX + GCL (+ KMD overlay if any)">ExpAll</button>';
tb+='<span class="info" id="kmd-info"></span>';
tb+='<span class="sep">|</span>';
// (GLB overlay block removed — no longer used.)
// GCL visualizer
// (GCL toggle moved into View dropdown as "Show GCL Entities" checkbox.)
tb+='<button class="btn" onclick="clearGCLVis()" style="color:#ff4488" title="Unbind GCL script from this stage (confirmation required)">ClrGCL</button>';
tb+='<button class="btn" onclick="openGCLViewer()" style="color:#88ddff" title="Preview the full GCL text (read-only)">ViewGCL</button>';
// (InspectHZM button removed.)
// +GCL upload moved into Import dropdown. Hidden file input stays here so the dropdown can trigger it.
tb+='<input type="file" id="gclfi" accept=".gcl,.txt" style="display:none" onchange="if(this.files[0]){handleGCLFile(this.files[0]);this.value=null}">';

tb+='<span class="sep">|</span>';
// === EXTRAS ===
tb+='<button class="btn" id="btnExtrasMenu" onclick="toggleExtrasMenu()" style="color:#ff77cc" title="Animation swapper and sound tools">Extras ▾</button>';
tb+='<span class="sep">|</span>';
// Session
tb+='<button class="btn" onclick="saveSession()">Save</button>';
tb+='<button class="btn" onclick="document.getElementById(\'sfi\').click()">Load</button>';
tb+='<input type="file" id="sfi" accept=".json" style="display:none" onchange="if(this.files[0])loadSession(this.files[0])">';
tb+='<span class="sep">|</span>';
tb+='<button class="btn" onclick="confirmNewStage()" title="Discard everything and start over (with confirm)">New</button>';
tb+='</div>';
// Main area
var main='<div style="display:flex;flex:1;min-height:0">';
// Left panel: routes + bookmarks + undo
main+='<div style="width:160px;background:#0d1219;border-right:1px solid #1a2535;overflow-y:auto;font-size:10px;display:flex;flex-direction:column">';
main+='<div id="routeListPanel"></div>';
main+='<div id="navPanel" style="border-top:1px solid #1a2535"></div>';
main+='<div id="gclPanel" style="border-top:1px solid #1a2535"></div>';
main+='<div id="procPanel" style="border-top:1px solid #1a2535"></div>';
main+='<div id="bookmarkPanel"></div>';
main+='<div id="kmdListPanel"></div>';
main+='<div id="undoPanel" style="border-top:1px solid #1a2535"></div>';
main+='<div id="texPalette" style="border-top:1px solid #1a2535"></div>';
main+='<div id="vramPanel" style="border-top:1px solid #1a2535"></div>';
main+='<div id="importPanel" style="border-top:1px solid #1a2535"></div>';
main+='</div>';
// Viewport
main+='<div id="viewport" style="flex:1;position:relative;overflow:hidden">';
main+='<div class="ov" id="coordinfo" style="bottom:36px;left:8px;color:#556">x:0 z:0</div>';
main+='<div class="ov" id="hoverinfo" style="bottom:56px;left:8px;display:none"></div>';
// Camera gizmo (Blender-style)
main+='<div id="camGizmo" style="position:absolute;top:10px;right:10px;pointer-events:auto;z-index:10">';
main+='<canvas id="camGizmoCanvas" width="120" height="140" style="cursor:pointer;background:rgba(13,18,25,0.7)"></canvas>';
main+='<div style="display:flex;gap:3px;margin-top:4px;justify-content:center">';
main+='<button class="btn" onclick="camTop()" style="font-size:9px;padding:2px 5px">Top</button>';
main+='<button class="btn" onclick="camFront()" style="font-size:9px;padding:2px 5px">Front</button>';
main+='<button class="btn" onclick="camSide()" style="font-size:9px;padding:2px 5px">Side</button>';
main+='<button class="btn" onclick="camReset()" style="font-size:9px;padding:2px 5px">Reset</button>';
main+='</div></div>';
main+='</div>';
// Right panel: properties + zone list
main+='<div style="width:190px;background:#0d1219;border-left:1px solid #1a2535;overflow-y:auto;font-size:11px;display:flex;flex-direction:column">';
main+='<div id="propPanel" style="display:none;color:#88aacc"></div>';
main+='<div id="zoneListPanel" style="flex:1;color:#cc8822"></div>';
main+='</div>';
main+='</div>';
// Status
var st='<div class="status">';
st+='<span>RDrag=orbit MDrag=pan Scroll=zoom</span><span>G=grab X/Y/Z=constrain Click=place Esc=cancel</span><span>B=box select</span><span>Del=delete Ctrl+Z=undo</span>';
st+='<span class="cg">■wall</span><span style="color:#555">■nocol</span>';
st+='<span class="co">■new</span><span class="cr">■sel</span><span style="color:#8866cc">■kmd</span><span style="color:#2266aa">■navzone</span><span style="color:#ff8800">■newNZ</span>';
st+='</div>';
document.getElementById("app").innerHTML=tb+main+st;
document.onkeydown=function(e){
// Hard exit if user is typing into a text-editing element. Single-letter
// keybindings like b/g/n/p/x/y/z must not hijack typing. INPUT/SELECT are
// already guarded per-handler but TEXTAREA wasn't.
var _ae=document.activeElement;
if(_ae&&(_ae.tagName==="TEXTAREA"||_ae.isContentEditable)){
// Still let Esc through so the user can close modals while in the textarea
if(e.key!=="Escape")return;}
if(e.key==="f"||e.key==="F"){if(!e.ctrlKey&&!e.altKey&&document.activeElement.tagName!=="INPUT"&&document.activeElement.tagName!=="SELECT"){fpsMode=true}}
if(e.key===" "&&document.activeElement.tagName!=="INPUT"&&document.activeElement.tagName!=="SELECT"&&document.activeElement.tagName!=="TEXTAREA"&&!document.activeElement.isContentEditable){
e.preventDefault();
// SPACE toggles transform mode: corner orbs appear on selected new walls/
// floors. Click one corner to grab it; click two adjacent corners to grab
// the edge between them. Drag with the gizmo. (Internally this is the
// "skew" system — naming is historical.)
if(skewMode){skewMode=false;skewCorner=-1;skewCorner2=-1;skewWallIdx=-1;skewFloorIdx=-1;gizType="normal";
rebuild();rebuildSkewCorners();rebuildGizmo();document.getElementById("coordinfo").textContent="Transform OFF"}
else{var hasSelWall=false,hasSelFloor=false;
var hasVanillaWall=false,hasVanillaFloor=false;
for(var sk in selW){if(sk.indexOf("nw-")===0){hasSelWall=true;}else{hasVanillaWall=true;}}
for(var sfk in selF){if(sfk.indexOf("nf-")===0){hasSelFloor=true;}else{hasVanillaFloor=true;}}
if(hasSelWall||hasSelFloor){skewMode=true;skewCorner=-1;skewCorner2=-1;
for(var sk2 in selW){if(sk2.indexOf("nw-")===0){wallToVerts(newW[parseInt(sk2.substr(3))])}}
for(var sfk2 in selF){if(sfk2.indexOf("nf-")===0){floorToVerts(newF[parseInt(sfk2.substr(3))])}}
rebuild();rebuildSkewCorners();document.getElementById("coordinfo").textContent="TRANSFORM ON: click 1 corner, or 2 adjacent corners for edge mode"}
else if(hasVanillaWall||hasVanillaFloor){
// Vanilla walls/floors don't support the per-corner orb workflow yet —
// their internal representation (navfaces / quads) is different from new
// walls/floors. Give the user a clear status rather than no feedback.
document.getElementById("coordinfo").textContent="Corner transform only works on NEW walls/floors. Drag the gizmo to move vanilla items as a unit.";}
else{document.getElementById("coordinfo").textContent="Select a wall or floor first"}}}
if((e.key==="b"||e.key==="B")&&!grabMode&&document.activeElement.tagName!=="INPUT"){
window._boxMode=!window._boxMode;
document.getElementById("coordinfo").textContent=window._boxMode?"BOX SELECT: drag rectangle, click to confirm":"";
}
if(e.key==="Escape"){dPt1=null;movePt1=null;measurePt1=null;clearMeasure();if(dPrev&&sc3){sc3.remove(dPrev);dPrev=null}
for(var mi=0;mi<movePrevObjs.length;mi++)sc3.remove(movePrevObjs[mi]);movePrevObjs=[];
if(placeRouteMode){exitPlaceRouteMode();return}
if(grabMode){cancelGrab();return}
if(curTool==="eyedrop"){setT("click");document.getElementById("coordinfo").textContent="Eyedropper canceled";return}
gizmoDragging=false;gizmoAxis=null;
selW={};selF={};selZ={};selRoute=-1;selWP=-1;selNavZone=-1;rebuild();rebuildGizmo();rebuildNavZones();uUI();updateNavPanel()}
if(e.key==="Delete"){
if(selNavZone>=0){deleteNavZone(selNavZone);return}
doDel()}
// N/P = cycle through waypoints of the currently selected route. Wraps at endpoints.
// Skip if a text input is focused (don't hijack typing).
if((e.key==="n"||e.key==="N"||e.key==="p"||e.key==="P")&&selRoute>=0&&hzm.routes[selRoute]){
var ae=document.activeElement;
if(ae&&(ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.tagName==="SELECT"))return;
var rtN=hzm.routes[selRoute];if(rtN.waypoints.length===0)return;
var step=(e.key==="n"||e.key==="N")?1:-1;
selWP=((selWP+step)%rtN.waypoints.length+rtN.waypoints.length)%rtN.waypoints.length;
// Center camera on the new WP for follow-along editing
var nwp=rtN.waypoints[selWP];
cTgt.set(nwp.x*S,nwp.y*S,nwp.z*S);uCam();
rebuild();rebuildGizmo();showProps();updateRouteList();
document.getElementById("coordinfo").textContent="Route "+selRoute+" WP "+(selWP+1)+"/"+rtN.waypoints.length;}
function toggleKmdFaceDelete(){
// Find KMD faces under mouse from last click and toggle deletion
if(kmdMode!=="tex")return;
var hitTypes2=["kmdtex"];var hits2=getHits(window._lastClickEvent||{clientX:0,clientY:0},hitTypes2);
// Not practical - instead use selection-based approach
}
// G = Grab (Blender-style)
if(e.key==="g"||e.key==="G"){if(grabMode)return;var c=getSelCenter();if(c){
grabMode=true;grabAxis=null;grabStart={x:c.x,z:c.z};
gizmoDragStart={x:window._lastMouseX||window.innerWidth/2,y:window._lastMouseY||window.innerHeight/2};
grabOrigPositions=saveGrabPositions();
document.getElementById("coordinfo").textContent="GRAB: move mouse. X/Y/Z=constrain. Click=confirm Esc=cancel"}}
// Axis constraints during grab
// R = rotate selected items 90° clockwise around their collective centroid.
// Works on: GCL entities (door, watcher, etc — increments dir.y), walls
// (rotates endpoints), floors (rotates bbox corners + ramp axis), zones,
// nav zones. Multi-selection rotates the whole group as a rigid body around
// the group's centroid (XZ center), not each item individually.
//
// 90° CW rotation around (cx,cz):
//   new_x = cx + (z - cz)
//   new_z = cz - (x - cx)
if((e.key==="r"||e.key==="R")&&!grabMode&&!gizmoDragging&&!skewMode){
var aeR=document.activeElement;
if(aeR&&(aeR.tagName==="INPUT"||aeR.tagName==="TEXTAREA"||aeR.tagName==="SELECT"||aeR.isContentEditable))return;
if(typeof _doorPlacementMode!=="undefined"&&_doorPlacementMode)return;
if(typeof placeRouteMode!=="undefined"&&placeRouteMode)return;
// Collect all selected items into a flat list with refs we can rotate
var rotItems=[];
if(selGCL>=0&&gclEntities[selGCL])rotItems.push({kind:"gcl",ref:gclEntities[selGCL]});
for(var sWk in selW){
if(sWk.indexOf("nw-")===0){var nwi=parseInt(sWk.substr(3));if(newW[nwi])rotItems.push({kind:"newW",ref:newW[nwi]});}
else{var sWp=sWk.split("-");if(sWp.length===2){var sWai=parseInt(sWp[0]),sWni=parseInt(sWp[1]);if(hzm&&hzm.areas[sWai]&&hzm.areas[sWai].navfaces[sWni])rotItems.push({kind:"vW",ref:hzm.areas[sWai].navfaces[sWni]});}}}
for(var sFk in selF){
if(sFk.indexOf("nf-")===0){var nfi=parseInt(sFk.substr(3));if(newF[nfi])rotItems.push({kind:"newF",ref:newF[nfi]});}
else{var sFp=sFk.split("-");if(sFp.length===2){var sFai=parseInt(sFp[0]),sFfi=parseInt(sFp[1]);if(hzm&&hzm.areas[sFai]&&hzm.areas[sFai].floors[sFfi])rotItems.push({kind:"vF",ref:hzm.areas[sFai].floors[sFfi]});}}}
for(var sZk in selZ){
if(sZk.indexOf("nz-")===0){var nzi=parseInt(sZk.substr(3));if(newZ[nzi])rotItems.push({kind:"newZ",ref:newZ[nzi]});}
else{var sZp=sZk.split("-");if(sZp.length===2){var sZai=parseInt(sZp[0]),sZzi=parseInt(sZp[1]);if(hzm&&hzm.areas[sZai]&&hzm.areas[sZai].zones[sZzi])rotItems.push({kind:"vZ",ref:hzm.areas[sZai].zones[sZzi]});}}}
if(selNavZone>=0&&hzm&&hzm.navzones&&hzm.navzones[selNavZone])rotItems.push({kind:"navz",ref:hzm.navzones[selNavZone]});
if(rotItems.length===0){
document.getElementById("coordinfo").textContent="R: nothing selected to rotate";return;}
// Compute centroid (XZ only — Y doesn't change under 90° Y-axis rotation)
var cxSum=0,czSum=0,cn=0;
function _addPt(x,z){cxSum+=x;czSum+=z;cn++;}
for(var rii=0;rii<rotItems.length;rii++){var it=rotItems[rii];
if(it.kind==="gcl"){if(it.ref.pos){_addPt(it.ref.pos.x,it.ref.pos.z);}}
else if(it.kind==="newW"||it.kind==="vW"){_addPt(it.ref.x1,it.ref.z1);_addPt(it.ref.x2,it.ref.z2);}
else if(it.kind==="newF"){_addPt(it.ref.x1,it.ref.z1);_addPt(it.ref.x2,it.ref.z2);}
else if(it.kind==="vF"){if(it.ref.quads){for(var qi=0;qi<it.ref.quads.length;qi++){_addPt(it.ref.quads[qi].x,it.ref.quads[qi].z);}}}
else if(it.kind==="newZ"||it.kind==="vZ"){_addPt(it.ref.x1,it.ref.z1);_addPt(it.ref.x2,it.ref.z2);}
else if(it.kind==="navz"){_addPt(it.ref.x,it.ref.z);}}
if(cn===0)return;
var cx=Math.round(cxSum/cn),cz=Math.round(czSum/cn);
function _rot(x,z){return{x:Math.round(cx+(z-cz)),z:Math.round(cz-(x-cx))};}
// Ramp axis rotation map (90° CW): +x → -z, -z → -x, -x → +z, +z → +x
function _rotAxis(a){
if(a==="x")return"-z";
if(a==="-z")return"-x";
if(a==="-x")return"z";
if(a==="z")return"x";
return a;}
for(var roi=0;roi<rotItems.length;roi++){var rit=rotItems[roi];
if(rit.kind==="gcl"){
if(!rit.ref.dir)rit.ref.dir={x:0,y:0,z:0};
rit.ref.dir.y=((rit.ref.dir.y||0)+1024)%4096;
// Also rotate the entity's position around the group centroid (so multi-selecting
// an entity + walls/floors rotates the whole composition together).
if(rit.ref.pos){var ePos=_rot(rit.ref.pos.x,rit.ref.pos.z);rit.ref.pos.x=ePos.x;rit.ref.pos.z=ePos.z;
if(rit.ref.origPos){rit.ref.origPos.x=ePos.x;rit.ref.origPos.z=ePos.z;}}}
else if(rit.kind==="newW"||rit.kind==="vW"){
var p1=_rot(rit.ref.x1,rit.ref.z1),p2=_rot(rit.ref.x2,rit.ref.z2);
rit.ref.x1=p1.x;rit.ref.z1=p1.z;rit.ref.x2=p2.x;rit.ref.z2=p2.z;
// If the wall has a cached vertex array (from skew mode), rotate those too
if(rit.ref.verts){for(var vi=0;vi<rit.ref.verts.length;vi++){
var vp=_rot(rit.ref.verts[vi].x,rit.ref.verts[vi].z);
rit.ref.verts[vi].x=vp.x;rit.ref.verts[vi].z=vp.z;}}}
else if(rit.kind==="newF"){
var fp1=_rot(rit.ref.x1,rit.ref.z1),fp2=_rot(rit.ref.x2,rit.ref.z2);
// After rotation the (x1,z1)..(x2,z2) bbox may have its corners swapped — normalize
// so x1<x2 and z1<z2 (the rest of the code assumes that).
rit.ref.x1=Math.min(fp1.x,fp2.x);rit.ref.x2=Math.max(fp1.x,fp2.x);
rit.ref.z1=Math.min(fp1.z,fp2.z);rit.ref.z2=Math.max(fp1.z,fp2.z);
if(rit.ref.ramp&&rit.ref.ramp.axis){rit.ref.ramp.axis=_rotAxis(rit.ref.ramp.axis);}
if(rit.ref.verts){for(var vfi=0;vfi<rit.ref.verts.length;vfi++){
var vfp=_rot(rit.ref.verts[vfi].x,rit.ref.verts[vfi].z);
rit.ref.verts[vfi].x=vfp.x;rit.ref.verts[vfi].z=vfp.z;}}}
else if(rit.kind==="vF"){
if(rit.ref.quads){for(var qfi=0;qfi<rit.ref.quads.length;qfi++){
var qrp=_rot(rit.ref.quads[qfi].x,rit.ref.quads[qfi].z);
rit.ref.quads[qfi].x=qrp.x;rit.ref.quads[qfi].z=qrp.z;}}}
else if(rit.kind==="newZ"||rit.kind==="vZ"){
var zp1=_rot(rit.ref.x1,rit.ref.z1),zp2=_rot(rit.ref.x2,rit.ref.z2);
rit.ref.x1=Math.min(zp1.x,zp2.x);rit.ref.x2=Math.max(zp1.x,zp2.x);
rit.ref.z1=Math.min(zp1.z,zp2.z);rit.ref.z2=Math.max(zp1.z,zp2.z);}
else if(rit.kind==="navz"){
var np=_rot(rit.ref.x,rit.ref.z);
rit.ref.x=np.x;rit.ref.z=np.z;
// nav zone w/h are XZ half-extents — swap them since the axes swap on 90° rotation
if(rit.ref.w!==undefined&&rit.ref.h!==undefined){var tmp=rit.ref.w;rit.ref.w=rit.ref.h;rit.ref.h=tmp;}}}
if(typeof logUndo==="function")logUndo("rotate","Rotate "+rotItems.length+" item(s) 90° CW around ("+cx+","+cz+")");
rebuild();rebuildGizmo();rebuildNavZones();rebuildGCLVis();showProps();
document.getElementById("coordinfo").textContent="Rotated "+rotItems.length+" item(s) 90° CW around ("+cx+","+cz+")";}
if(grabMode){
if(e.key==="x"||e.key==="X"){grabAxis=grabAxis==="x"?null:"x";document.getElementById("coordinfo").textContent="Grab "+(grabAxis?"axis: "+grabAxis.toUpperCase():"free")}
if(e.key==="y"||e.key==="Y"){grabAxis=grabAxis==="y"?null:"y";gizmoDragStart.y=window._lastMouseY||window.innerHeight/2;document.getElementById("coordinfo").textContent="Grab "+(grabAxis?"axis: "+grabAxis.toUpperCase():"free")}
if(e.key==="z"||e.key==="Z"){grabAxis=grabAxis==="z"?null:"z";document.getElementById("coordinfo").textContent="Grab "+(grabAxis?"axis: "+grabAxis.toUpperCase():"free")}
if(e.key==="Enter"){grabMode=false;logUndo("move","Grab move");grabAxis=null;grabOrigPositions=null;rebuild();rebuildGizmo();rebuildNavZones();showProps()}}
if(e.ctrlKey&&e.key==="c"){e.preventDefault();doCopy()}
if(e.ctrlKey&&e.key==="v"){e.preventDefault();doPaste()}
if(e.ctrlKey&&e.key==="z"){e.preventDefault();undoAction()}};
document.onkeyup=function(e){if(e.key==="f"||e.key==="F"){fpsMode=false;if(window._fpsSaved){
// On F release: keep camera where it is, place target in current look direction at saved radius
var camPos=cam3.position.clone();
var lookDir=new THREE.Vector3();cam3.getWorldDirection(lookDir);
cTgt.copy(camPos).add(lookDir.multiplyScalar(window._fpsSaved.rad));
window._fpsSaved=null;
// Recompute spherical from new offset. Note: uCam uses
//   pos.x = tgt.x + r*sin(phi)*cos(theta)
//   pos.y = tgt.y + r*cos(phi)
//   pos.z = tgt.z + r*sin(phi)*sin(theta)
// So given offset = pos - tgt, recover:
//   theta = atan2(offset.z, offset.x)   ← was incorrectly atan2(offset.x, offset.z)
//   phi   = acos(offset.y / radius)
var offset=new THREE.Vector3().subVectors(camPos,cTgt);
sph.radius=offset.length();
sph.theta=Math.atan2(offset.z,offset.x);
sph.phi=Math.acos(Math.max(-1,Math.min(1,offset.y/sph.radius)));
uCam()}}};
setTimeout(function(){initGL();uUI();updateZoneList();updateRouteList();updateBookmarkUI();updateKMDList();updateNavPanel();updateGCLPanel();initCamGizmo()},100)}

// "New" button handler: confirms before discarding state, then thoroughly clears
// every piece of editor state. Without this, stale data leaks across sessions:
// new walls/floors/zones, parsed GCL entities, undo history, door-wizard proc
// reservations, etc.
function confirmNewStage(){
if(!confirm("Discard all current work and start fresh?\n\nThis clears:\n• Loaded HZM + GCL\n• New walls/floors/zones\n• Imported textures + models\n• Undo history + selections\n\nYou can re-load from a session JSON via LdSess after."))return;
// Clear all editor state. Catch missing globals (some only exist after first load).
try{hzm=null;}catch(e){}
try{gclOrigText="";}catch(e){}
try{if(typeof gclEntities!=="undefined")gclEntities.length=0;}catch(e){}
try{if(typeof newW!=="undefined")newW.length=0;}catch(e){}
try{if(typeof newF!=="undefined")newF.length=0;}catch(e){}
try{if(typeof newZ!=="undefined")newZ.length=0;}catch(e){}
try{if(typeof newNavZones!=="undefined")newNavZones.length=0;}catch(e){}
try{if(typeof importedTextures!=="undefined")importedTextures.length=0;}catch(e){}
try{if(typeof importedModels!=="undefined")importedModels.length=0;}catch(e){}
try{if(typeof darRawFiles!=="undefined")darRawFiles.length=0;}catch(e){}
try{if(typeof darTextures!=="undefined")Object.keys(darTextures).forEach(function(k){delete darTextures[k];});}catch(e){}
try{if(typeof darImportFlags!=="undefined")Object.keys(darImportFlags).forEach(function(k){delete darImportFlags[k];});}catch(e){}
try{if(typeof mdlSubModels!=="undefined")Object.keys(mdlSubModels).forEach(function(k){delete mdlSubModels[k];});}catch(e){}
try{if(typeof kmdBufs!=="undefined")kmdBufs.length=0;}catch(e){}
try{if(typeof kmdFileNames!=="undefined")kmdFileNames.length=0;}catch(e){}
try{if(typeof kmdVisible!=="undefined")kmdVisible.length=0;}catch(e){}
try{if(typeof undoHist!=="undefined")undoHist.length=0;}catch(e){}
try{if(typeof clipboard!=="undefined")clipboard.length=0;}catch(e){}
try{selW={};selF={};selZ={};colW={};colF={};colZ={};}catch(e){}
try{selGCL=-1;selRoute=-1;selWP=-1;selNavZone=-1;}catch(e){}
try{if(typeof clearDoorWizardReservations==="function")clearDoorWizardReservations();}catch(e){}
try{if(typeof window._pcxUploadsPending!=="undefined")window._pcxUploadsPending=0;}catch(e){}
// Drop the 3D scene contents
try{if(typeof rebuild==="function")rebuild();}catch(e){}
try{if(typeof rebuildNavZones==="function")rebuildNavZones();}catch(e){}
try{if(typeof rebuildGCLVis==="function")rebuildGCLVis();}catch(e){}
try{if(typeof updateImportPanel==="function")updateImportPanel();}catch(e){}
try{if(typeof updateTexPalette==="function")updateTexPalette();}catch(e){}
try{if(typeof updateVRAMPanel==="function")updateVRAMPanel();}catch(e){}
try{if(typeof updateKMDList==="function")updateKMDList();}catch(e){}
try{if(typeof updateZoneList==="function")updateZoneList();}catch(e){}
try{if(typeof showProps==="function")showProps();}catch(e){}
// Show the drop screen for a fresh start
showDrop();}

// ===== RAMP → STAIRS UI =====
// Wraps convertRampToStairs() with a user prompt and rebuild/undo plumbing.
// Requires exactly one selected newF that has a `.ramp` descriptor.
function rampToStairsUI(){
// Find the single selected new floor
var selFloorIdx=-1,count=0;
for(var k in selF){if(k.indexOf("nf-")===0){selFloorIdx=parseInt(k.substr(3));count++;}}
if(count===0){alert("Select a ramp floor first (a sloped new floor).");return;}
if(count>1){alert("Select exactly one ramp floor — multi-floor stairs conversion isn't supported.");return;}
var fl=newF[selFloorIdx];
if(!fl||!fl.ramp){alert("Selected floor isn't a ramp. Use the ramp tool to make a sloped floor first, then convert it to stairs.");return;}
var totalRise=Math.abs(fl.ramp.hi-fl.ramp.lo);
var stepRiseStr=prompt("Step rise (height per step, in MGS units):\n\nRamp total rise: "+totalRise+"\nDefault: 80 (matches vanilla MGS stair density)\nFor really tight stairs, try 50.","80");
if(!stepRiseStr)return;
var stepRise=parseInt(stepRiseStr);
if(!isFinite(stepRise)||stepRise<=0){alert("Invalid step rise.");return;}
var result=convertRampToStairs(selFloorIdx,stepRise);
if(typeof result==="string"){alert("Conversion failed: "+result);return;}
selF={};// clear selection since the original ramp is gone
if(typeof logUndo==="function")logUndo("stairs","Convert ramp → "+result.treads+" stairs + "+result.risers+" risers");
rebuild();showProps();uUI();
alert("Converted ramp to "+result.treads+" treads + "+result.risers+" risers.\n\nThe original ramp is gone. Treads inherit its texture; risers get the same (you can change them individually via the texture button).");}

// ===== AI NAVZONES WIZARD PANEL =====
// Toggling the panel ALSO toggles nav-zone visibility in 3D (folds the old NZ
// button into this single control). Opens the panel + shows nav zones; closes
// the panel + hides nav zones + clears any active nav tool, returning to
// select mode. Panel is draggable via its header bar.
function toggleAINavPanel(){
var existing=document.getElementById("ai-nav-panel");
var btn=document.getElementById("btnAINav");
if(existing){
existing.remove();
if(curTool==="drawnz"||curTool==="navpaint")setT("click");
navPaintErase=false;navPaintActive=false;
// Hide nav zones if they were shown by this panel
if(typeof showNavZones!=="undefined"&&showNavZones)toggleNavZones();
if(btn)btn.classList.remove("active");
return;}
if(btn)btn.classList.add("active");
// Show nav zones (NZ button behavior folded in)
if(typeof showNavZones!=="undefined"&&!showNavZones)toggleNavZones();
var panel=document.createElement("div");
panel.id="ai-nav-panel";
panel.style.cssText="position:fixed;top:80px;left:50%;background:#1a2535;border:1px solid #2c3e50;border-radius:4px;width:260px;color:#aac;font-family:monospace;font-size:11px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.5);user-select:none";
panel.innerHTML='<div id="aiNavHeader" style="background:#0f1a25;padding:8px 10px;cursor:move;border-bottom:1px solid #2c3e50;font-weight:bold;color:#00ffaa;font-size:12px;display:flex;justify-content:space-between;align-items:center"><span>AI NavZones Editor</span><span style="font-size:10px;opacity:0.5">⠿ drag</span></div>'
+'<div style="padding:10px">'
+'<div style="font-size:10px;opacity:0.7;margin-bottom:10px">Tools modify the AI nav graph used by enemy pathfinding.</div>'
+'<button class="btn" id="aiNavDraw" onclick="aiNavSetMode(\'draw\')" style="width:100%;margin-bottom:6px;text-align:left">+ New NavZone (click 2 points)</button>'
+'<button class="btn" id="aiNavPaint" onclick="aiNavSetMode(\'paint\')" style="width:100%;margin-bottom:6px;text-align:left;color:#00ffaa">NavPaint (drag to lay along path)</button>'
+'<button class="btn" id="aiNavErase" onclick="aiNavSetMode(\'erase\')" style="width:100%;margin-bottom:6px;text-align:left;color:#ff4444">NavErase (drag to remove)</button>'
+'<div style="border-top:1px solid #2c3e50;margin:8px 0"></div>'
+'<div id="aiNavStatus" style="font-size:10px;opacity:0.6;min-height:14px">Pick a tool above.</div>'
+'<div style="border-top:1px solid #2c3e50;margin:8px 0"></div>'
+'<button class="btn" onclick="toggleAINavPanel()" style="width:100%;color:#ff8888">Close (return to Select)</button>'
+'</div>';
document.body.appendChild(panel);
// Drag via header bar
var dragging=false,dragOff={x:0,y:0};
var header=document.getElementById("aiNavHeader");
header.addEventListener("mousedown",function(e){dragging=true;
var rect=panel.getBoundingClientRect();dragOff.x=e.clientX-rect.left;dragOff.y=e.clientY-rect.top;
panel.style.left=rect.left+"px";panel.style.top=rect.top+"px";panel.style.right="auto";panel.style.transform="none";
e.preventDefault();});
document.addEventListener("mousemove",function(e){if(!dragging)return;
panel.style.left=(e.clientX-dragOff.x)+"px";panel.style.top=(e.clientY-dragOff.y)+"px";});
document.addEventListener("mouseup",function(){dragging=false;});}

function aiNavSetMode(mode){
var btnD=document.getElementById("aiNavDraw"),btnP=document.getElementById("aiNavPaint"),btnE=document.getElementById("aiNavErase");
if(btnD)btnD.classList.remove("active");if(btnP)btnP.classList.remove("active");if(btnE)btnE.classList.remove("active");
var status=document.getElementById("aiNavStatus");
if(mode==="draw"){setT("drawnz");navPaintErase=false;if(btnD)btnD.classList.add("active");
if(status)status.textContent="Click two points on the map to define a NavZone rectangle.";}
else if(mode==="paint"){setT("navpaint");navPaintErase=false;if(btnP)btnP.classList.add("active");
if(status)status.textContent="Drag across the floor to paint NavZones along the cursor path.";}
else if(mode==="erase"){setT("navpaint");navPaintErase=true;if(btnE)btnE.classList.add("active");
if(status)status.textContent="Drag over existing NavZones to mark them for deletion. Release to delete.";}}

// ===== VIEW MENU =====
// Replaces the inline VIEW checkboxes (Fl/Zn/Rt/SubMdl/CamAng/FOV) with a
// single dropdown. Lives below the View button; click outside or click View
// again to close. Reads the live globals so checkboxes stay in sync.
function toggleViewMenu(){
var existing=document.getElementById("view-menu-popup");
if(existing){existing.remove();return;}
var btn=document.getElementById("btnViewMenu");
if(!btn)return;
var rect=btn.getBoundingClientRect();
var pop=document.createElement("div");
pop.id="view-menu-popup";
pop.style.cssText="position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:#1a2535;border:1px solid #2c3e50;border-radius:4px;padding:8px;color:#aac;font-family:monospace;font-size:11px;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,0.5);min-width:180px";
function chk(label,checked,handler,color){
return '<label class="chk" style="display:block;padding:4px 6px;cursor:pointer'+(color?";color:"+color:"")+'"><input type="checkbox"'+(checked?" checked":"")+' onchange="'+handler+'" style="margin-right:8px">'+label+'</label>';}
pop.innerHTML='<div style="font-size:10px;opacity:0.6;margin-bottom:4px;padding:0 6px">VISIBILITY</div>'
+chk("Show Floors",   typeof showFl!=="undefined"&&showFl,           "tgF(this.checked)")
+chk("Show Zones",    typeof showZn!=="undefined"&&showZn,           "tgZ(this.checked)")
+chk("Show Enemy Routes", typeof showRt!=="undefined"&&showRt,       "tgR(this.checked)")
+chk("Show GCL Entities", typeof showGclVis!=="undefined"&&showGclVis,"toggleGCLVis()","#ff4488")
+chk("Show SubModels",typeof showSubModels==="undefined"||showSubModels,"showSubModels=this.checked;rebuildSubModels()","#ff8844")
+chk("Show Camera Angles",typeof showCamAngles!=="undefined"&&showCamAngles,"showCamAngles=this.checked;rebuildCamAngles();rebuildGCLVis()","#00aaff")
+chk("Show FOV",      typeof showFOV!=="undefined"&&showFOV,         "showFOV=this.checked;rebuildGCLVis()","#ff4488");
document.body.appendChild(pop);
setTimeout(function(){
function clkAway(e){if(!pop.contains(e.target)&&e.target!==btn){pop.remove();document.removeEventListener("mousedown",clkAway);}}
document.addEventListener("mousedown",clkAway);},10);}

// ===== IMPORT MENU =====
// Replaces the row of import buttons (+KMD/+TEX/+HZM/+MDL/ImpDAR/ImpKMD/ImpPCX)
// with a single dropdown. The actual file pickers are hidden <input> elements
// triggered by .click() — same mechanism as the old buttons used.
function toggleImportMenu(){
var existing=document.getElementById("import-menu-popup");
if(existing){existing.remove();return;}
var btn=document.getElementById("btnImportMenu");
if(!btn)return;
var rect=btn.getBoundingClientRect();
var pop=document.createElement("div");
pop.id="import-menu-popup";
pop.style.cssText="position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:#1a2535;border:1px solid #2c3e50;border-radius:4px;padding:8px;color:#aac;font-family:monospace;font-size:11px;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,0.5);min-width:240px";
function row(label,onclick,title,color){
return '<button class="btn" onclick="document.getElementById(\'import-menu-popup\').remove();'+onclick+'" title="'+(title||"")+'" style="width:100%;text-align:left;margin-bottom:4px'+(color?";color:"+color:"")+'">'+label+'</button>';}
pop.innerHTML='<div style="font-size:10px;opacity:0.6;margin-bottom:6px;padding:0 4px">STAGE FILES</div>'
+row("+MDL &nbsp;— load stage model DAR",          "document.getElementById(\'mdlfi\').click()", "Load the stage MDL (model archive)", "#ff8844")
+row("+TEX &nbsp;— load stage texture DAR",        "document.getElementById(\'darfi\').click()", "Load the stage texture DAR (PCX-in-DAR)", "#44cc88")
+row("+KMD &nbsp;— load loose KMD",                "document.getElementById(\'kfi\').click()",   "Load standalone KMD model files",       "#8866cc")
+row("+HZM &nbsp;— merge second HZM",              "if(!hzm){alert(\'Load a base HZM first\')}else{document.getElementById(\'hzmfi2\').click()}", "Append another HZM area-by-area", "#44aaff")
+row("+GCL &nbsp;— load GCL script",               "document.getElementById(\'gclfi\').click()", "Load a GCL script file (entities, traps, procs)", "#ff4488")
+'<div style="font-size:10px;opacity:0.6;margin:8px 0 6px 0;padding:0 4px">FROM ANOTHER STAGE</div>'
+row("ImpDAR — pick from another stage DAR", "openImportDAR()", "Import models/textures from another stage", "#ff00ff")
+row("ImpKMD — loose KMD files",      "openImportKMD()", "Import loose KMD models",              "#ff00ff")
+row("ImpPCX — loose PCX textures",   "openImportPCX()", "Import loose PCX texture files",       "#ff00ff");
document.body.appendChild(pop);
setTimeout(function(){
function clkAway(e){if(!pop.contains(e.target)&&e.target!==btn){pop.remove();document.removeEventListener("mousedown",clkAway);}}
document.addEventListener("mousedown",clkAway);},10);}

// ===== EXPORT MENU =====
// Mirrors the Import dropdown. Bundles the individual exporters in one place
// while leaving the prominent ExpAll button inline (most-used single-click).
function toggleExportMenu(){
var existing=document.getElementById("export-menu-popup");
if(existing){existing.remove();return;}
var btn=document.getElementById("btnExportMenu");
if(!btn)return;
var rect=btn.getBoundingClientRect();
var pop=document.createElement("div");
pop.id="export-menu-popup";
pop.style.cssText="position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:#1a2535;border:1px solid #2c3e50;border-radius:4px;padding:8px;color:#aac;font-family:monospace;font-size:11px;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,0.5);min-width:240px";
function row(label,onclick,title,color){
return '<button class="btn" onclick="document.getElementById(\'export-menu-popup\').remove();'+onclick+'" title="'+(title||"")+'" style="width:100%;text-align:left;margin-bottom:4px'+(color?";color:"+color:"")+'">'+label+'</button>';}
pop.innerHTML='<div style="font-size:10px;opacity:0.6;margin-bottom:6px;padding:0 4px">INDIVIDUAL EXPORTS</div>'
+row("ExpHZM — collision/navigation file",  "doExp()",          "Export modified HZM (walls, floors, zones, routes, nav)", "#ff4488")
+row("ExpMDL — stage model DAR",            "exportDAR()",      "Export the stage MDL with any new/imported KMDs",         "#ff8844")
+row("ExpTex — stage texture DAR",          "exportTexDAR()",   "Export texture DAR with imported textures",               "#44cc88")
+row("ExpKMD — current KMD overlay",        "exportKMD()",      "Export the standalone modified KMD",                      "#8866cc")
+row("ExpGCL — script (entities, traps)",   "exportGCL()",      "Export modified GCL script",                              "#ff4488");
document.body.appendChild(pop);
setTimeout(function(){
function clkAway(e){if(!pop.contains(e.target)&&e.target!==btn){pop.remove();document.removeEventListener("mousedown",clkAway);}}
document.addEventListener("mousedown",clkAway);},10);}

function toggleExtrasMenu(){
var existing=document.getElementById("extras-menu-popup");
if(existing){existing.remove();return;}
var btn=document.getElementById("btnExtrasMenu");
if(!btn)return;
var rect=btn.getBoundingClientRect();
var pop=document.createElement("div");
pop.id="extras-menu-popup";
pop.style.cssText="position:fixed;top:"+(rect.bottom+4)+"px;left:"+rect.left+"px;background:#1a2535;border:1px solid #2c3e50;border-radius:4px;padding:8px;color:#aac;font-family:monospace;font-size:11px;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,0.5);min-width:260px";
function row(label,onclick,title,color,disabled){
return '<button class="btn" '+(disabled?'disabled ':'')+'onclick="document.getElementById(\'extras-menu-popup\').remove();'+onclick+'" title="'+(title||"")+'" style="width:100%;text-align:left;margin-bottom:4px'+(color?";color:"+color:"")+(disabled?";opacity:0.4":"")+'">'+label+'</button>';}
pop.innerHTML='<div style="font-size:10px;opacity:0.6;margin-bottom:6px;padding:0 4px">ANIMATION</div>'
+row("🎬 Animation Swapper", "openAnimSwapper()", "Load KMD + target OAR + donor OAR and swap animations", "#ff77cc")
+'<div style="font-size:10px;opacity:0.6;margin:8px 0 6px;padding:0 4px">SOUND</div>'
+row("🔊 Sound Swapper", "openSoundSwapper()", "Load efx.mgz (or efx.zip) and swap individual WAV sound effects", "#7cf")
+row("🖼 PSX Textures",  "openPsxTextureViewer()", "Inspect PSX MGS1 stage texture DARs (*_0.dar)", "#4ac")
+'<div style="font-size:10px;opacity:0.6;margin:8px 0 6px;padding:0 4px">GAME CODE</div>'
+row("⚙ Attribute Changer", "openAttributeChanger()", "Edit entity attributes (enemy health, routes, FOV, item params...) inside compiled PSX stage .gcx files", "#8fd48f")
+row("🥋 Melee Hitboxes", "openMeleeEditor()", "Edit melee attack hitboxes (PUNCH structs) directly in a compiled PS-X EXE", "#ff9a66");
document.body.appendChild(pop);
setTimeout(function(){
function clkAway(e){if(!pop.contains(e.target)&&e.target!==btn){pop.remove();document.removeEventListener("mousedown",clkAway);}}
document.addEventListener("mousedown",clkAway);},10);}

showDrop();

// ============================================================
