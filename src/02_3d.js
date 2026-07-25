// ═══════════════════════════════════════════════════════════════════════════
// FILE: 02_3d.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ==================== CAMERA + HELPERS ====================
function uCam(){if(!cam3)return;cam3.position.set(cTgt.x+sph.radius*Math.sin(sph.phi)*Math.cos(sph.theta),cTgt.y+sph.radius*Math.cos(sph.phi),cTgt.z+sph.radius*Math.sin(sph.phi)*Math.sin(sph.theta));cam3.lookAt(cTgt)}
function camTop(){sph.theta=0;sph.phi=0.01;uCam();drawCamGizmo()}
function camFront(){sph.theta=0;sph.phi=Math.PI/2;uCam();drawCamGizmo()}
function camSide(){sph.theta=Math.PI/2;sph.phi=Math.PI/2;uCam();drawCamGizmo()}
function camReset(){sph={theta:Math.PI/4,phi:Math.PI/3,radius:30};cTgt=new THREE.Vector3(0,0,0);uCam();drawCamGizmo()}

function drawCamGizmo(){
var cv2=document.getElementById("camGizmoCanvas");if(!cv2)return;
var ctx=cv2.getContext("2d");var cx=60,cy=60,r=45;
ctx.clearRect(0,0,120,140);
// Background circle
ctx.beginPath();ctx.arc(cx,cy,r+5,0,Math.PI*2);ctx.fillStyle="rgba(13,18,25,0.8)";ctx.fill();
ctx.strokeStyle="#1a2535";ctx.lineWidth=1;ctx.stroke();
// Project 3D axes to 2D based on current camera angle
var st2=Math.sin(sph.theta),ct2=Math.cos(sph.theta),sp2=Math.sin(sph.phi),cp2=Math.cos(sph.phi);
var axes=[
{label:"X",color:"#ff3333",dx:ct2,dy:-cp2*st2,dz:0},
{label:"Y",color:"#33ff33",dx:0,dy:cp2,dz:0},
{label:"Z",color:"#3388ff",dx:st2,dy:cp2*ct2,dz:0}];
axes.sort(function(a,b){return(a.dx*st2+a.dy*cp2)-(b.dx*st2+b.dy*cp2)});
for(var i=0;i<axes.length;i++){var ax=axes[i];
var px=cx+ax.dx*r*0.8,py=cy-ax.dy*r*0.8;
ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);ctx.strokeStyle=ax.color;ctx.lineWidth=2;ctx.stroke();
ctx.beginPath();ctx.arc(px,py,10,0,Math.PI*2);ctx.fillStyle=ax.color;ctx.fill();
ctx.fillStyle="#fff";ctx.font="bold 10px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(ax.label,px,py)}
ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fillStyle="#888";ctx.fill();
// Hand/pan icon below gizmo
ctx.fillStyle="rgba(13,18,25,0.8)";ctx.fillRect(40,118,40,18);ctx.strokeStyle="#1a2535";ctx.strokeRect(40,118,40,18);
ctx.fillStyle="#88aacc";ctx.font="10px monospace";ctx.textAlign="center";ctx.fillText("☝ Pan",60,130)}

function initCamGizmo(){
var cv2=document.getElementById("camGizmoCanvas");if(!cv2)return;
var isDrag=false,isPanGz=false,lastX=0,lastY=0;
cv2.addEventListener("mousedown",function(e){
var rect=cv2.getBoundingClientRect();var my=e.clientY-rect.top;
if(my>118){isPanGz=true}else{isDrag=true}
lastX=e.clientX;lastY=e.clientY;e.stopPropagation();e.preventDefault()});
// Use document-level listeners so dragging works when cursor moves off gizmo
document.addEventListener("mousemove",function(e){if(!isDrag&&!isPanGz)return;
var dx=e.clientX-lastX,dy=e.clientY-lastY;
if(isPanGz||e.shiftKey){
var rv=new THREE.Vector3(),uv=new THREE.Vector3();rv.setFromMatrixColumn(cam3.matrixWorld,0);uv.setFromMatrixColumn(cam3.matrixWorld,1);
var sp=sph.radius*0.002;cTgt.add(rv.multiplyScalar(-dx*sp));cTgt.add(uv.multiplyScalar(dy*sp));uCam()}
else{sph.theta-=dx*0.01;sph.phi=Math.max(0.1,Math.min(Math.PI-0.1,sph.phi-dy*0.01));uCam();drawCamGizmo()}
lastX=e.clientX;lastY=e.clientY});
document.addEventListener("mouseup",function(){isDrag=false;isPanGz=false});
cv2.addEventListener("wheel",function(e){e.preventDefault();e.stopPropagation();
sph.radius=Math.max(1,Math.min(200,sph.radius*(e.deltaY>0?1.1:0.9)));uCam()},{passive:false});
drawCamGizmo()}

function snapPt(wx,wz){
if(!hzm)return{x:wx,z:wz};
var bestD=snapSize*2*S,bx=wx,bz=wz;
// Snap to wall endpoints
for(var ai=0;ai<hzm.areas.length;ai++){var nfs=hzm.areas[ai].navfaces;
for(var ni=0;ni<nfs.length;ni++){if(colW[ai+"-"+ni])continue;var nf=nfs[ni];
var pts=[{x:nf.x1*S,z:nf.z1*S},{x:nf.x2*S,z:nf.z2*S}];
for(var pi=0;pi<pts.length;pi++){var d=Math.sqrt((wx-pts[pi].x)**2+(wz-pts[pi].z)**2);
if(d<bestD){bestD=d;bx=pts[pi].x;bz=pts[pi].z}}}}
for(var i=0;i<newW.length;i++){var pts2=[{x:newW[i].x1*S,z:newW[i].z1*S},{x:newW[i].x2*S,z:newW[i].z2*S}];
for(var pi2=0;pi2<pts2.length;pi2++){var d2=Math.sqrt((wx-pts2[pi2].x)**2+(wz-pts2[pi2].z)**2);
if(d2<bestD){bestD=d2;bx=pts2[pi2].x;bz=pts2[pi2].z}}}
// Snap to floor corners
for(ai=0;ai<hzm.areas.length;ai++){var fls=hzm.areas[ai].floors;
for(var fi=0;fi<fls.length;fi++){if(colF[ai+"-"+fi])continue;var fl=fls[fi];
var fpts=[{x:fl.quads[0].x*S,z:fl.quads[0].z*S},{x:fl.quads[1].x*S,z:fl.quads[1].z*S},
{x:fl.quads[0].x*S,z:fl.quads[1].z*S},{x:fl.quads[1].x*S,z:fl.quads[0].z*S}];
for(pi=0;pi<fpts.length;pi++){var d3=Math.sqrt((wx-fpts[pi].x)**2+(wz-fpts[pi].z)**2);
if(d3<bestD){bestD=d3;bx=fpts[pi].x;bz=fpts[pi].z}}}}
for(i=0;i<newF.length;i++){var nfl=newF[i];
var nfpts=[{x:nfl.x1*S,z:nfl.z1*S},{x:nfl.x2*S,z:nfl.z2*S},{x:nfl.x1*S,z:nfl.z2*S},{x:nfl.x2*S,z:nfl.z1*S}];
for(pi=0;pi<nfpts.length;pi++){var d4=Math.sqrt((wx-nfpts[pi].x)**2+(wz-nfpts[pi].z)**2);
if(d4<bestD){bestD=d4;bx=nfpts[pi].x;bz=nfpts[pi].z}}}
return{x:bx,z:bz}}
function snp(v){return Math.round(v/(snapSize*S))*(snapSize*S)}

// ==================== 3D SCENE REBUILD ====================
function rebuild(){if(!sc3||!hzm)return;
var i;
for(i=0;i<wObjs.length;i++)sc3.remove(wObjs[i]);for(i=0;i<nwObjs.length;i++)sc3.remove(nwObjs[i]);
for(i=0;i<fObjs.length;i++)sc3.remove(fObjs[i]);for(i=0;i<nfObjs.length;i++)sc3.remove(nfObjs[i]);
for(i=0;i<zObjs.length;i++)sc3.remove(zObjs[i]);for(i=0;i<nzObjs.length;i++)sc3.remove(nzObjs[i]);
for(i=0;i<rtObjs.length;i++)sc3.remove(rtObjs[i]);
for(i=0;i<movePrevObjs.length;i++)sc3.remove(movePrevObjs[i]);movePrevObjs=[];
wObjs=[];nwObjs=[];fObjs=[];nfObjs=[];zObjs=[];nzObjs=[];rtObjs=[];

// === WALLS ===
for(var ai=0;ai<hzm.areas.length;ai++){var nfs=hzm.areas[ai].navfaces;
for(var ni=0;ni<nfs.length;ni++){var nf=nfs[ni],k=ai+"-"+ni;if(colW[k])continue;
var iS=!!selW[k],iH=hovKey===k,wf=hzm.areas[ai].wFlags[ni]||0;
var c,op;
c=iS?0xff3355:iH?0x66ffaa:(wf&0x01)?0x555555:(wf&0x04)?0x22aacc:0x22cc66;op=iS?0.65:iH?0.5:(wf&0x01)?0.15:0.3;
var x1=nf.x1*S,z1=nf.z1*S,y1=nf.y1*S,x2=nf.x2*S,z2=nf.z2*S,y2=nf.y2*S,h=nf.h1*S;
var g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array([x1,y1,z1,x2,y2,z2,x2,y2+h,z2,x1,y1,z1,x2,y2+h,z2,x1,y1+h,z1]),3));g.computeVertexNormals();
var m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:op,side:THREE.DoubleSide,depthWrite:false}));m.userData={key:k,type:"wall"};sc3.add(m);wObjs.push(m);
var eg=new THREE.BufferGeometry();eg.setAttribute("position",new THREE.BufferAttribute(new Float32Array([x1,y1,z1,x2,y2,z2,x1,y1+h,z1,x2,y2+h,z2,x1,y1,z1,x1,y1+h,z1,x2,y2,z2,x2,y2+h,z2]),3));
var el=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:c}));el.userData={key:k,type:"wall",isE:1};sc3.add(el);wObjs.push(el)}}
// New walls
for(i=0;i<newW.length;i++){var w=newW[i],wh2=(w.h||2000)*S;
var wx1,wz1,wy1,wx2,wz2,wy2,wx3,wy3,wz3,wx4,wy4,wz4;
if(w.verts){wx1=w.verts[0].x*S;wy1=w.verts[0].y*S;wz1=w.verts[0].z*S;
wx2=w.verts[1].x*S;wy2=w.verts[1].y*S;wz2=w.verts[1].z*S;
wx3=w.verts[2].x*S;wy3=w.verts[2].y*S;wz3=w.verts[2].z*S;
wx4=w.verts[3].x*S;wy4=w.verts[3].y*S;wz4=w.verts[3].z*S}
else{wx1=w.x1*S;wz1=w.z1*S;wy1=w.y1*S;wx2=w.x2*S;wz2=w.z2*S;wy2=w.y2*S;
wx3=wx2;wy3=wy2+wh2;wz3=wz2;wx4=wx1;wy4=wy1+wh2;wz4=wz1}
var iNS=!!selW["nw-"+i];
var wg=new THREE.BufferGeometry();wg.setAttribute("position",new THREE.BufferAttribute(new Float32Array([wx1,wy1,wz1,wx2,wy2,wz2,wx3,wy3,wz3,wx1,wy1,wz1,wx3,wy3,wz3,wx4,wy4,wz4]),3));
var wMat;
if(w.texHash>=0&&darTextures[w.texHash]){
// Textured wall - compute UVs based on wall dimensions
var wLen=Math.sqrt((wx2-wx1)*(wx2-wx1)+(wy2-wy1)*(wy2-wy1)+(wz2-wz1)*(wz2-wz1));
var wHt=Math.sqrt((wx4-wx1)*(wx4-wx1)+(wy4-wy1)*(wy4-wy1)+(wz4-wz1)*(wz4-wz1));
var wUvMode=w.uvMode||uvTileMode;
var uScale=wUvMode==="repeat"?wLen/(wHt||1):1;
wg.setAttribute("uv",new THREE.BufferAttribute(new Float32Array([0,1,uScale,1,uScale,0, 0,1,uScale,0,0,0]),2));
wMat=new THREE.MeshBasicMaterial({map:darTextures[w.texHash].tex,side:THREE.DoubleSide,transparent:iNS,opacity:iNS?0.8:1.0})}
else{wMat=new THREE.MeshBasicMaterial({color:iNS?0xff3355:0xffaa00,transparent:true,opacity:iNS?0.65:0.5,side:THREE.DoubleSide})}
var wm=new THREE.Mesh(wg,wMat);
wm.userData={key:"nw-"+i,type:"wall"};sc3.add(wm);nwObjs.push(wm)}

// === FLOORS ===
if(showFl){for(ai=0;ai<hzm.areas.length;ai++){var fls=hzm.areas[ai].floors;for(var fi=0;fi<fls.length;fi++){var fl=fls[fi],fk=ai+"-"+fi;if(colF[fk])continue;
var iFS=!!selF[fk];
// Floors have 6 vectors in `quads`: [0,1]=bbox (b1,b2), [2,3,4,5]=actual quad corners (p1..p4).
// Engine bilinearly interpolates Y across the 4 corners — that's how stairs/ramps work.
// Render using the corner positions, not the bbox, so slope is visible.
var c1=fl.quads[2],c2=fl.quads[3],c3=fl.quads[4],c4=fl.quads[5];
// Skip degenerate (some floors have all corners at 0,0,0)
var hasCorners=(c1.x||c1.z)||(c2.x||c2.z)||(c3.x||c3.z)||(c4.x||c4.z);
var fw=Math.abs(fl.quads[1].x-fl.quads[0].x)*S,fd=Math.abs(fl.quads[1].z-fl.quads[0].z)*S;if(fw<0.001||fd<0.001)continue;
// Detect sloped (any 2 corners with different Y)
var corners=[c1,c2,c3,c4];
var isSloped=false;if(hasCorners){for(var ci=1;ci<4;ci++)if(corners[ci].y!==corners[0].y){isSloped=true;break}}
fl.isSloped=isSloped;
var fc3=iFS?0xff3355:(isSloped?0x44aa88:0x1a3a5c);
var fop=iFS?0.55:(isSloped?0.45:0.2);
var fm,fg;
if(hasCorners){
// Custom geometry from the 4 corner points (in their actual XYZ)
fg=new THREE.BufferGeometry();
var positions=new Float32Array([
c1.x*S,c1.y*S,c1.z*S,
c2.x*S,c2.y*S,c2.z*S,
c3.x*S,c3.y*S,c3.z*S,
c1.x*S,c1.y*S,c1.z*S,
c3.x*S,c3.y*S,c3.z*S,
c4.x*S,c4.y*S,c4.z*S]);
fg.setAttribute("position",new THREE.BufferAttribute(positions,3));
fg.computeVertexNormals();
fg.computeBoundingSphere();// required so frustum culling doesn't drop the floor when zoomed out
fm=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:fc3,transparent:true,opacity:fop,side:THREE.DoubleSide}));
fm.position.set(0,0,0);
}else{
// Fallback to bbox plane for degenerate floors
fg=new THREE.PlaneGeometry(fw,fd);
fm=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:fc3,transparent:true,opacity:fop,side:THREE.DoubleSide}));
fm.rotation.x=-Math.PI/2;fm.position.set(((fl.quads[0].x+fl.quads[1].x)/2)*S,fl.quads[0].y*S,((fl.quads[0].z+fl.quads[1].z)/2)*S);}
fm.userData={key:fk,type:"floor"};sc3.add(fm);fObjs.push(fm);
// For sloped floors, add a wireframe overlay so the slope is more visible
if(isSloped){
var wfg=new THREE.BufferGeometry();
wfg.setAttribute("position",new THREE.BufferAttribute(new Float32Array([
c1.x*S,c1.y*S,c1.z*S, c2.x*S,c2.y*S,c2.z*S,
c2.x*S,c2.y*S,c2.z*S, c3.x*S,c3.y*S,c3.z*S,
c3.x*S,c3.y*S,c3.z*S, c4.x*S,c4.y*S,c4.z*S,
c4.x*S,c4.y*S,c4.z*S, c1.x*S,c1.y*S,c1.z*S]),3));
wfg.computeBoundingSphere();
var wfm=new THREE.LineSegments(wfg,new THREE.LineBasicMaterial({color:0x88ffcc,transparent:true,opacity:0.7}));
sc3.add(wfm);fObjs.push(wfm)}}}}
// New floors
for(i=0;i<newF.length;i++){var nfl=newF[i];
var iNFS=!!selF["nf-"+i];var nfMat;
var fx1,fy1,fz1,fx2,fy2,fz2,fx3,fy3,fz3,fx4,fy4,fz4;
if(nfl.verts){fx1=nfl.verts[0].x*S;fy1=nfl.verts[0].y*S;fz1=nfl.verts[0].z*S;
fx2=nfl.verts[1].x*S;fy2=nfl.verts[1].y*S;fz2=nfl.verts[1].z*S;
fx3=nfl.verts[2].x*S;fy3=nfl.verts[2].y*S;fz3=nfl.verts[2].z*S;
fx4=nfl.verts[3].x*S;fy4=nfl.verts[3].y*S;fz4=nfl.verts[3].z*S}
else if(nfl.ramp){
// Ramp: compute per-corner Y per axis. Corner order matches encoder: p1@(x1,z1), p2@(x2,z1), p3@(x2,z2), p4@(x1,z2)
var rLo=nfl.ramp.lo,rHi=nfl.ramp.hi,rAx=nfl.ramp.axis;
var rp1y,rp2y,rp3y,rp4y;
if(rAx==="x"){rp1y=rLo;rp4y=rLo;rp2y=rHi;rp3y=rHi;}
else if(rAx==="-x"){rp1y=rHi;rp4y=rHi;rp2y=rLo;rp3y=rLo;}
else if(rAx==="z"){rp1y=rLo;rp2y=rLo;rp3y=rHi;rp4y=rHi;}
else{rp1y=rHi;rp2y=rHi;rp3y=rLo;rp4y=rLo;}
fx1=nfl.x1*S;fy1=rp1y*S;fz1=nfl.z1*S;
fx2=nfl.x2*S;fy2=rp2y*S;fz2=nfl.z1*S;
fx3=nfl.x2*S;fy3=rp3y*S;fz3=nfl.z2*S;
fx4=nfl.x1*S;fy4=rp4y*S;fz4=nfl.z2*S;}
else{var fy=nfl.y1*S||0;
fx1=nfl.x1*S;fy1=fy;fz1=nfl.z1*S;fx2=nfl.x2*S;fy2=fy;fz2=nfl.z1*S;
fx3=nfl.x2*S;fy3=fy;fz3=nfl.z2*S;fx4=nfl.x1*S;fy4=fy;fz4=nfl.z2*S}
var nfg=new THREE.BufferGeometry();
nfg.setAttribute("position",new THREE.BufferAttribute(new Float32Array([fx1,fy1,fz1,fx2,fy2,fz2,fx3,fy3,fz3, fx1,fy1,fz1,fx3,fy3,fz3,fx4,fy4,fz4]),3));
nfg.setAttribute("uv",new THREE.BufferAttribute(new Float32Array([0,0,1,0,1,1, 0,0,1,1,0,1]),2));
nfg.computeVertexNormals();
nfg.computeBoundingSphere();
if(nfl.texHash>=0&&darTextures[nfl.texHash]){
nfMat=new THREE.MeshBasicMaterial({map:darTextures[nfl.texHash].tex,side:THREE.DoubleSide,transparent:iNFS,opacity:iNFS?0.8:1.0})}
else{var rampColor=nfl.ramp?0x44ccaa:0xff8800;nfMat=new THREE.MeshBasicMaterial({color:iNFS?0xff3355:rampColor,transparent:true,opacity:iNFS?0.5:(nfl.ramp?0.55:0.35),side:THREE.DoubleSide})}
var nfm=new THREE.Mesh(nfg,nfMat);
nfm.userData={key:"nf-"+i,type:"floor"};sc3.add(nfm);nfObjs.push(nfm)}

// === ZONES ===
if(showZn){
// Build a zone-name → GCL-references map once per frame. Used to color zones
// based on what trap/ntrap statements reference them. Without this, every
// zone looked identical and the user had to guess which zones were active.
var _zoneRefs=(typeof getZoneReferences==="function")?getZoneReferences():{};
for(ai=0;ai<hzm.areas.length;ai++){var zns=hzm.areas[ai].zones;for(var zi2=0;zi2<zns.length;zi2++){var zn=zns[zi2];
var zk2=ai+"-"+zi2;if(colZ[zk2])continue;
var iZS=!!selZ[zk2];
var zw=Math.abs(zn.x2-zn.x1)*S,zd=Math.abs(zn.z2-zn.z1)*S;if(zw<0.001||zd<0.001)continue;
// Decide zone color based on type:
//   - id2==0xFF → CAMERA zone (engine marker) → blue
//   - GCL has `ntrap <name>` referencing it → orange (player-action trigger)
//   - GCL has `trap <name>` referencing it → yellow (auto-fire)
//   - none → gray (orphan / unreferenced)
var zoneRefs=_zoneRefs[zn.name]||[];
var hasNtrap=false,hasTrap=false;
for(var rri=0;rri<zoneRefs.length;rri++){
if(zoneRefs[rri].kind==="ntrap")hasNtrap=true;
else if(zoneRefs[rri].kind==="trap")hasTrap=true;}
var zc2;
if(iZS)zc2=0xff3355;// selected (red) overrides
else if(zn.id2===0xFF)zc2=0x4488ff;// camera (blue)
else if(hasNtrap)zc2=0xff8800;// ntrap (orange)
else if(hasTrap)zc2=0xffcc00;// trap (yellow)
else zc2=0x666666;// orphan (gray)
// Render as a 3D BOX with the zone's Y range so the user can see vertical
// extent. Previously was a flat plane which hid the "y1==y2 trap never
// fires" footgun.
var zyMin=Math.min(zn.y1,zn.y2),zyMax=Math.max(zn.y1,zn.y2);
var zh=Math.max((zyMax-zyMin)*S,0.05);// give 0-height zones a sliver so they're visible
var zg=new THREE.BoxGeometry(zw,zh,zd);
var zmat=new THREE.MeshBasicMaterial({color:zc2,transparent:true,opacity:iZS?0.35:0.18,side:THREE.DoubleSide,depthWrite:false});
var zm=new THREE.Mesh(zg,zmat);
zm.position.set(((zn.x1+zn.x2)/2)*S,(zyMin+zh/2/S)*S,((zn.z1+zn.z2)/2)*S);
zm.userData={key:zk2,type:"zone"};sc3.add(zm);zObjs.push(zm);
// Edge lines so we can see the box outline even at low opacity
var edgesG=new THREE.EdgesGeometry(zg);
var edgesM=new THREE.LineBasicMaterial({color:zc2,transparent:true,opacity:iZS?0.9:0.6});
var edgesMesh=new THREE.LineSegments(edgesG,edgesM);
edgesMesh.position.copy(zm.position);
edgesMesh.userData={key:zk2,type:"zone"};sc3.add(edgesMesh);zObjs.push(edgesMesh);
// Warn visually if y1==y2 — trap never fires in that case
if(zn.id2!==0xFF&&zn.y1===zn.y2){
var warnG=new THREE.EdgesGeometry(zg);
var warnM=new THREE.LineBasicMaterial({color:0xff0000,transparent:true,opacity:0.8});
var warnMesh=new THREE.LineSegments(warnG,warnM);
warnMesh.position.copy(zm.position);warnMesh.position.y+=0.05;
sc3.add(warnMesh);zObjs.push(warnMesh);}
// Zone label
if(zn.name){var canvas2=document.createElement("canvas");canvas2.width=256;canvas2.height=32;var ctx2=canvas2.getContext("2d");
ctx2.fillStyle=iZS?"#ff3355":(zn.id2===0xFF?"#4488ff":(hasNtrap?"#ff8800":(hasTrap?"#ffcc00":"#888888")));
ctx2.font="16px monospace";ctx2.fillText(zn.name,4,20);
var tex=new THREE.CanvasTexture(canvas2);var spMat=new THREE.SpriteMaterial({map:tex,transparent:true,opacity:0.85});
var sp=new THREE.Sprite(spMat);sp.scale.set(zw*0.8,zw*0.1,1);sp.position.set(((zn.x1+zn.x2)/2)*S,zyMax*S+0.15,((zn.z1+zn.z2)/2)*S);
sc3.add(sp);zObjs.push(sp)}}}}
// New zones
for(i=0;i<newZ.length;i++){var nzn=newZ[i];var nzk="nz-"+i;
var isNZS=!!selZ[nzk];
var nzw=Math.abs(nzn.x2-nzn.x1)*S,nzd=Math.abs(nzn.z2-nzn.z1)*S;if(nzw>0.001&&nzd>0.001){
var nzg=new THREE.PlaneGeometry(nzw,nzd);var nzm=new THREE.Mesh(nzg,new THREE.MeshBasicMaterial({color:isNZS?0xff3355:0xff8800,transparent:true,opacity:isNZS?0.3:0.15,side:THREE.DoubleSide}));
nzm.rotation.x=-Math.PI/2;nzm.position.set(((nzn.x1+nzn.x2)/2)*S,nzn.y1*S+0.02,((nzn.z1+nzn.z2)/2)*S);
nzm.userData={key:nzk,type:"zone"};sc3.add(nzm);nzObjs.push(nzm);
if(nzn.name){var nzc=document.createElement("canvas");nzc.width=256;nzc.height=32;var nzctx=nzc.getContext("2d");
nzctx.fillStyle=isNZS?"#ff3355":"#ff8800";nzctx.font="16px monospace";nzctx.fillText(nzn.name,4,20);
var nztex=new THREE.CanvasTexture(nzc);var nzsp=new THREE.Sprite(new THREE.SpriteMaterial({map:nztex,transparent:true,opacity:0.7}));
nzsp.scale.set(nzw*0.8,nzw*0.1,1);nzsp.position.set(((nzn.x1+nzn.x2)/2)*S,nzn.y1*S+0.15,((nzn.z1+nzn.z2)/2)*S);
sc3.add(nzsp);nzObjs.push(nzsp)}}}
// === RESIZE HANDLES ===
for(i=0;i<handleObjs.length;i++)sc3.remove(handleObjs[i]);handleObjs=[];
if(curTool==="resize"){
// Only show handles on SELECTED items. Previously handles appeared on
// every wall/floor/zone in the stage which was overwhelming. Now the
// user has to select an item first (which they're already doing to
// interact with it), then handles appear only on that item.
// Wall endpoint handles (vanilla)
for(ai=0;ai<hzm.areas.length;ai++){var nfs2=hzm.areas[ai].navfaces;
for(ni=0;ni<nfs2.length;ni++){var k2=ai+"-"+ni;if(colW[k2])continue;
if(!selW[k2])continue;// only selected
var nf2=nfs2[ni];
var pts=[{x:nf2.x1*S,y:nf2.y1*S,z:nf2.z1*S,end:"p1",key:k2},{x:nf2.x2*S,y:nf2.y2*S,z:nf2.z2*S,end:"p2",key:k2}];
for(var pi=0;pi<pts.length;pi++){var hp=pts[pi];
var hg=new THREE.SphereGeometry(0.12,6,6);var hm=new THREE.Mesh(hg,new THREE.MeshBasicMaterial({color:0x00ffff}));
hm.position.set(hp.x,hp.y,hp.z);hm.userData={type:"handle",key:hp.key,end:hp.end,objType:"wall"};sc3.add(hm);handleObjs.push(hm)}}}
// New wall handles (selected only)
for(i=0;i<newW.length;i++){var nwk="nw-"+i;if(!selW[nwk])continue;
var nw2=newW[i];
var npts=[{x:nw2.x1*S,y:nw2.y1*S,z:nw2.z1*S,end:"p1",key:nwk},{x:nw2.x2*S,y:nw2.y2*S,z:nw2.z2*S,end:"p2",key:nwk}];
for(pi=0;pi<npts.length;pi++){var nhp=npts[pi];
var nhg=new THREE.SphereGeometry(0.12,6,6);var nhm=new THREE.Mesh(nhg,new THREE.MeshBasicMaterial({color:0xffaa00}));
nhm.position.set(nhp.x,nhp.y,nhp.z);nhm.userData={type:"handle",key:nhp.key,end:nhp.end,objType:"wall"};sc3.add(nhm);handleObjs.push(nhm)}}
// Floor corner handles (vanilla, selected only)
if(showFl){for(ai=0;ai<hzm.areas.length;ai++){var fls2=hzm.areas[ai].floors;
for(fi=0;fi<fls2.length;fi++){var fk2=ai+"-"+fi;if(colF[fk2])continue;
if(!selF[fk2])continue;
var fl2=fls2[fi];
var fcorners=[{x:fl2.quads[0].x*S,z:fl2.quads[0].z*S,y:fl2.quads[0].y*S,end:"c1"},{x:fl2.quads[1].x*S,z:fl2.quads[1].z*S,y:fl2.quads[1].y*S,end:"c2"},
{x:fl2.quads[0].x*S,z:fl2.quads[1].z*S,y:fl2.quads[0].y*S,end:"c3"},{x:fl2.quads[1].x*S,z:fl2.quads[0].z*S,y:fl2.quads[0].y*S,end:"c4"}];
for(pi=0;pi<fcorners.length;pi++){var fhp=fcorners[pi];
var fhg=new THREE.SphereGeometry(0.12,6,6);var fhm=new THREE.Mesh(fhg,new THREE.MeshBasicMaterial({color:0x22aacc}));
fhm.position.set(fhp.x,fhp.y,fhp.z);fhm.userData={type:"handle",key:fk2,end:fhp.end,objType:"floor"};sc3.add(fhm);handleObjs.push(fhm)}}}
// New floor corners (selected only)
for(i=0;i<newF.length;i++){var nfk2="nf-"+i;if(!selF[nfk2])continue;
var nfl2=newF[i];
var nfcorners=[{x:nfl2.x1*S,z:nfl2.z1*S,y:nfl2.y1*S,end:"c1"},{x:nfl2.x2*S,z:nfl2.z2*S,y:nfl2.y1*S,end:"c2"},
{x:nfl2.x1*S,z:nfl2.z2*S,y:nfl2.y1*S,end:"c3"},{x:nfl2.x2*S,z:nfl2.z1*S,y:nfl2.y1*S,end:"c4"}];
for(pi=0;pi<nfcorners.length;pi++){var nfhp=nfcorners[pi];
var nfhg=new THREE.SphereGeometry(0.12,6,6);var nfhm=new THREE.Mesh(nfhg,new THREE.MeshBasicMaterial({color:0xff8800}));
nfhm.position.set(nfhp.x,nfhp.y,nfhp.z);nfhm.userData={type:"handle",key:nfk2,end:nfhp.end,objType:"floor"};sc3.add(nfhm);handleObjs.push(nfhm)}}}
// Zone corners — only on selected newZ zones.
for(i=0;i<newZ.length;i++){var nzkH="nz-"+i;if(!selZ[nzkH])continue;
var nzz=newZ[i];
var nzcorners=[{x:nzz.x1*S,z:nzz.z1*S,y:nzz.y1*S,end:"c1"},{x:nzz.x2*S,z:nzz.z2*S,y:nzz.y1*S,end:"c2"},
{x:nzz.x1*S,z:nzz.z2*S,y:nzz.y1*S,end:"c3"},{x:nzz.x2*S,z:nzz.z1*S,y:nzz.y1*S,end:"c4"}];
for(pi=0;pi<nzcorners.length;pi++){var nzhp=nzcorners[pi];
var nzhg=new THREE.SphereGeometry(0.12,6,6);var nzhm=new THREE.Mesh(nzhg,new THREE.MeshBasicMaterial({color:0xff66ff}));
nzhm.position.set(nzhp.x,nzhp.y,nzhp.z);nzhm.userData={type:"handle",key:nzkH,end:nzhp.end,objType:"zone"};sc3.add(nzhm);handleObjs.push(nzhm)}}}

// === ROUTES ===
if(showRt){var routeColors=[0xff0000,0x00ff00,0x0066ff,0xffff00,0xff00ff,0x00ffff,0xff8800,0x88ff00,0x0088ff,0xff0088,
0x00ff88,0x8800ff,0xff4444,0x44ff44,0x4444ff,0xffff44,0xff44ff,0x44ffff,0xff8844,0x88ff44,0x4488ff,0xff4488,0x44ff88,0x8844ff,
0xcc0000,0x00cc00,0x0000cc,0xcccc00,0xcc00cc,0x00cccc,0xcc8800,0x88cc00];
for(var ri=0;ri<hzm.routes.length;ri++){var rt=hzm.routes[ri];if(rt.waypoints.length<1)continue;
// Route isolation: when a route is selected, hide all others so the selected one is easy
// to see/edit. When nothing is selected, show all routes (default overview).
if(selRoute>=0&&selRoute!==ri)continue;
var rc3c=routeColors[ri%routeColors.length];var isSR=selRoute===ri;
// Route lines
if(rt.waypoints.length>1){var rlv=[];
for(var wi4=0;wi4<rt.waypoints.length;wi4++){var wp=rt.waypoints[wi4];rlv.push(wp.x*S,wp.y*S+0.05,wp.z*S)}
var rlg=new THREE.BufferGeometry();rlg.setAttribute("position",new THREE.Float32BufferAttribute(rlv,3));
var rlm=new THREE.Line(rlg,new THREE.LineBasicMaterial({color:isSR?0xffffff:rc3c,linewidth:2}));sc3.add(rlm);rtObjs.push(rlm);
// Direction arrows on each segment midpoint. Small triangle pointing from current
// waypoint toward the next. Makes patrol direction visually obvious — and reverse
// becomes immediately observable since the arrows flip.
for(var ai2=0;ai2<rt.waypoints.length-1;ai2++){
var w1=rt.waypoints[ai2],w2=rt.waypoints[ai2+1];
var mx=(w1.x+w2.x)/2*S,mz=(w1.z+w2.z)/2*S,my=(w1.y+w2.y)/2*S+0.06;
var sdx=w2.x-w1.x,sdz=w2.z-w1.z;
var sLen=Math.sqrt(sdx*sdx+sdz*sdz);if(sLen<0.001)continue;
var ufx=sdx/sLen,ufz=sdz/sLen;// unit forward
var urx=-ufz,urz=ufx;// unit right (perpendicular)
var arrowLen=0.35,arrowHalf=0.18;
var tipX=mx+ufx*arrowLen*0.5,tipZ=mz+ufz*arrowLen*0.5;
var bL=mx-ufx*arrowLen*0.5+urx*arrowHalf,bLz=mz-ufz*arrowLen*0.5+urz*arrowHalf;
var bR=mx-ufx*arrowLen*0.5-urx*arrowHalf,bRz=mz-ufz*arrowLen*0.5-urz*arrowHalf;
var arrG=new THREE.BufferGeometry();arrG.setAttribute("position",new THREE.Float32BufferAttribute([
tipX,my,tipZ, bL,my,bLz, bR,my,bRz],3));
var arrM=new THREE.Mesh(arrG,new THREE.MeshBasicMaterial({color:isSR?0xffffff:rc3c,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
sc3.add(arrM);rtObjs.push(arrM);}}
// Waypoint markers
for(wi4=0;wi4<rt.waypoints.length;wi4++){var wp2=rt.waypoints[wi4];
var isWPS=isSR&&selWP===wi4;
// Start/end emphasis — first WP gets green, last WP gets red, with a slightly larger
// sphere so you can see them at a glance. Single-WP routes (rare) just get start.
var isFirst=(wi4===0);
var isLast=(wi4===rt.waypoints.length-1&&rt.waypoints.length>1);
var sphRadius=isWPS?0.30:(isFirst||isLast?0.22:0.15);
var sphColor=isWPS?0xffffff:(isFirst?0x00ff44:(isLast?0xff3333:rc3c));
var wpg=new THREE.SphereGeometry(sphRadius,10,10);
var wpm=new THREE.Mesh(wpg,new THREE.MeshBasicMaterial({color:sphColor}));
wpm.position.set(wp2.x*S,wp2.y*S+0.05,wp2.z*S);
wpm.userData={key:"rt-"+ri+"-"+wi4,type:"route",ri:ri,wi:wi4};sc3.add(wpm);rtObjs.push(wpm);
// Vision cone (triangle showing facing direction).
// Extract just the dir bits from the packed command field (bits 8-9). Values 0-3 map
// to N/E/S/W cardinal directions. Using the whole command field as an angle was the
// previous behavior but produced bogus cones for any waypoint with act/time/con bits set.
var dirBits=(wp2.dir>>8)&0x03;
var dirRad=dirBits*Math.PI*0.5;// 0=0 (N), 1=π/2 (E), 2=π (S), 3=3π/2 (W)
var coneLen=1.2,coneHalf=0.5;
var fwdX=Math.sin(dirRad),fwdZ=Math.cos(dirRad);
var rightX=Math.cos(dirRad),rightZ=-Math.sin(dirRad);
var tipX2=wp2.x*S+fwdX*coneLen,tipZ2=wp2.z*S+fwdZ*coneLen;
var l1X=wp2.x*S+rightX*coneHalf,l1Z=wp2.z*S+rightZ*coneHalf;
var l2X=wp2.x*S-rightX*coneHalf,l2Z=wp2.z*S-rightZ*coneHalf;
var cg2=new THREE.BufferGeometry();cg2.setAttribute("position",new THREE.Float32BufferAttribute([
l1X,wp2.y*S+0.04,l1Z, tipX2,wp2.y*S+0.04,tipZ2, l2X,wp2.y*S+0.04,l2Z],3));
var cm2=new THREE.Mesh(cg2,new THREE.MeshBasicMaterial({color:isWPS?0xffffff:rc3c,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
sc3.add(cm2);rtObjs.push(cm2);
// Cone outline
var cog=new THREE.BufferGeometry();cog.setAttribute("position",new THREE.Float32BufferAttribute([
wp2.x*S,wp2.y*S+0.05,wp2.z*S, tipX2,wp2.y*S+0.05,tipZ2, l1X,wp2.y*S+0.05,l1Z,wp2.x*S,wp2.y*S+0.05,wp2.z*S, l2X,wp2.y*S+0.05,l2Z,tipX2,wp2.y*S+0.05,tipZ2],3));
var col=new THREE.LineSegments(cog,new THREE.LineBasicMaterial({color:isWPS?0xffffff:rc3c}));sc3.add(col);rtObjs.push(col);
// Label: 1-indexed waypoint number, with START/END tags on extremities so direction
// is obvious. The label is large enough to read while panning around at typical zoom.
var labelText=(wi4+1)+"";
if(isFirst&&rt.waypoints.length>1)labelText="1 START";
else if(isLast)labelText=labelText+" END";
// Add route number prefix only when ALL routes are visible (selRoute<0), so the user
// knows which route each label belongs to. When isolated, the label is uncluttered.
if(selRoute<0)labelText="R"+ri+" · "+labelText;
var lc=document.createElement("canvas");
// Width auto-scales with text length so longer labels don't get truncated
lc.width=Math.max(96,labelText.length*11);lc.height=32;
var lctx=lc.getContext("2d");
// Black outline so labels are readable on any background color
lctx.font="bold 16px monospace";
lctx.strokeStyle="#000000";lctx.lineWidth=4;
lctx.strokeText(labelText,2,20);
lctx.fillStyle=isWPS?"#ffffff":(isFirst?"#33ff66":(isLast?"#ff5555":"#"+rc3c.toString(16).padStart(6,"0")));
lctx.fillText(labelText,2,20);
var ltex=new THREE.CanvasTexture(lc);
var lsp=new THREE.Sprite(new THREE.SpriteMaterial({map:ltex,transparent:true,depthTest:false}));
// Sprite scale matches the canvas aspect ratio
lsp.scale.set(lc.width/128,lc.height/128,1);
lsp.position.set(wp2.x*S,wp2.y*S+0.45,wp2.z*S);
lsp.renderOrder=10;// draw labels above the rest so they're always visible
sc3.add(lsp);rtObjs.push(lsp)}}}
// Refresh KMD list panel — capacity bars and routing previews depend on newW/newF
try{updateKMDList()}catch(e){console.warn("updateKMDList in rebuild failed:",e)}
}

// ==================== RAYCASTING ====================
function getHits(e,types){var vp=document.getElementById("viewport"),r=vp.getBoundingClientRect();
ms3.x=((e.clientX-r.left)/r.width)*2-1;ms3.y=-((e.clientY-r.top)/r.height)*2+1;
rc3.setFromCamera(ms3,cam3);var tg=[];
if(types.indexOf("wall")>=0){for(var i=0;i<wObjs.length;i++)if(wObjs[i].userData.key&&!wObjs[i].userData.isE)tg.push(wObjs[i]);
for(i=0;i<nwObjs.length;i++)if(nwObjs[i].userData.key)tg.push(nwObjs[i])}
if(types.indexOf("floor")>=0){for(i=0;i<fObjs.length;i++)if(fObjs[i].userData.key)tg.push(fObjs[i]);
for(i=0;i<nfObjs.length;i++)if(nfObjs[i].userData.key)tg.push(nfObjs[i])}
if(types.indexOf("zone")>=0){for(i=0;i<zObjs.length;i++)if(zObjs[i].userData&&zObjs[i].userData.key&&zObjs[i].userData.type==="zone")tg.push(zObjs[i]);
for(i=0;i<nzObjs.length;i++)if(nzObjs[i].userData&&nzObjs[i].userData.key&&nzObjs[i].userData.type==="zone")tg.push(nzObjs[i])}
if(types.indexOf("route")>=0){for(i=0;i<rtObjs.length;i++)if(rtObjs[i].userData&&rtObjs[i].userData.type==="route")tg.push(rtObjs[i])}
if(types.indexOf("navzone")>=0){for(i=0;i<navZoneObjs.length;i++)if(navZoneObjs[i].userData&&navZoneObjs[i].userData.type==="navzone")tg.push(navZoneObjs[i])}
if(types.indexOf("gcl")>=0){for(i=0;i<gclObjs2.length;i++)if(gclObjs2[i].userData&&gclObjs2[i].userData.type==="gcl")tg.push(gclObjs2[i])}
if(types.indexOf("gcl_spawn")>=0){for(i=0;i<gclObjs2.length;i++)if(gclObjs2[i].userData&&gclObjs2[i].userData.type==="gcl_spawn")tg.push(gclObjs2[i])}
if(types.indexOf("camangle")>=0){for(i=0;i<camAngleObjs.length;i++)if(camAngleObjs[i].userData&&camAngleObjs[i].userData.type==="camangle")tg.push(camAngleObjs[i])}
if(types.indexOf("kmdtex")>=0){for(i=0;i<kmdObjs.length;i++)if(kmdObjs[i].userData&&kmdObjs[i].userData.type==="kmdtex")tg.push(kmdObjs[i])}
if(types.indexOf("camhandle")>=0){for(i=0;i<camHandleObjs.length;i++)if(camHandleObjs[i].mesh.userData&&camHandleObjs[i].mesh.userData.type==="camhandle")tg.push(camHandleObjs[i].mesh)}
return rc3.intersectObjects(tg)}

function gPt(e){var vp=document.getElementById("viewport"),r=vp.getBoundingClientRect();
ms3.x=((e.clientX-r.left)/r.width)*2-1;ms3.y=-((e.clientY-r.top)/r.height)*2+1;
rc3.setFromCamera(ms3,cam3);var pl=new THREE.Plane(new THREE.Vector3(0,1,0),-placeY*S),pt=new THREE.Vector3();
rc3.ray.intersectPlane(pl,pt);return pt}


// ============================================================
