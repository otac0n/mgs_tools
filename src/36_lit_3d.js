// ============================================================================
// Lights in 3D — render a stage's .lit (DG_LIT) point lights inside the Stage
// Editor's THREE scene (sc3). Each light becomes a colored marker + a wireframe
// radius sphere at its world position (world*S), optionally a real THREE.PointLight
// preview. Loads a raw .lit or pulls every .lit out of a .stg / STAGE.DIR / .dar.
// Coordinate space matches the stage geometry: scene = world * S  (S in 00_core.js).
// Editing lights still lives in the standalone Lighting Editor; this is the in-context
// 3D visualization the geometry gives it meaning.
// ============================================================================
var LIT3D = { lights:[], name:"", objs:[], pts:[], markers:[], on:true, rings:true, preview:false,
              sel:-1, edit3d:false, sets:null, curSet:0, drag:null };

// ---- parse DG_LIT: u32 count + count*16B {svec pos, u16 bright, u16 radius, rgb+cd} ----
function LIT3D_parse(buf){
  var dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  if(buf.byteLength<4) throw new Error("too small");
  var n=dv.getUint32(0,true);
  if(4+n*16>buf.byteLength) throw new Error("bad count "+n);
  var out=[];
  for(var i=0;i<n;i++){var o=4+i*16;
    out.push({vx:dv.getInt16(o,true),vy:dv.getInt16(o+2,true),vz:dv.getInt16(o+4,true),
      bright:dv.getUint16(o+8,true),radius:dv.getUint16(o+10,true),
      r:buf[o+12],g:buf[o+13],b:buf[o+14]});}
  return out;
}
// ---- container extraction (ext 'l' = 0x6c) from .stg / DIR / .dar ----
function LIT3D_fromStg(buf,label){
  var dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),cfg=[],p=4;
  while(true){var mode=buf[p+2],ext=buf[p+3],size=dv.getInt32(p+4,true),hash=dv.getUint16(p,true);
    if(mode===0)break;cfg.push({hash:hash,mode:mode,ext:ext,size:size});p+=8;if(p>buf.byteLength)throw new Error("bad stg");}
  var out=[],pos=2048;
  for(var i=0;i<cfg.length;i++){var c=cfg[i];
    if(c.ext===0xFF){pos+=(2048-pos%2048)%2048;continue;}
    var data;
    if(c.mode===0x63){var len=cfg[i+1].size-c.size;data=buf.subarray(pos,pos+len);pos+=len;}
    else{data=buf.subarray(pos,pos+c.size);pos+=c.size;pos+=(2048-pos%2048)%2048;}
    if(c.ext===0x6c)out.push({name:c.hash+".lit",bytes:data});
    else if(c.mode===0x72){try{LIT3D_fromDar(data).forEach(function(e){out.push(e);});}catch(e){}}
  }
  return out;
}
function LIT3D_fromDar(buf){
  var dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),out=[],p=0;
  while(p+8<=buf.byteLength){var id=dv.getUint16(p,true),ext=dv.getInt16(p+2,true),size=dv.getInt32(p+4,true);
    if(size<=0||p+8+size>buf.byteLength)break;
    if(ext===0x6c)out.push({name:id+".lit",bytes:buf.subarray(p+8,p+8+size)});p+=8+size;}
  return out;
}
function LIT3D_fromDir(buf){
  var dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),n=dv.getInt32(0,true)/12,ents=[];
  for(var i=0;i<n;i++){var o=4+12*i,nm="";for(var k=0;k<8;k++){var cc=buf[o+k];if(cc>=32&&cc<127)nm+=String.fromCharCode(cc);}
    ents.push({name:nm.replace(/\s+$/,""),sec:dv.getInt32(o+8,true)});}
  var out=[];
  for(var j=0;j<ents.length;j++){var s=ents[j].sec*2048,e=(j+1<ents.length?ents[j+1].sec*2048:buf.byteLength);
    try{LIT3D_fromStg(buf.subarray(s,e),ents[j].name).forEach(function(x){out.push(x);});}catch(er){}}
  return out;
}

// ---- TRUE lit preview: swap the stage's unlit (Basic) surface materials to
//      Lambert so the .lit PointLights actually shade them, and dim the editor's
//      default ambient/directional so the stage lighting reads. Fully reversible. ----
function LIT3D_setLitPreview(on){
  LIT3D.preview=on;
  if(!sc3){return;}
  // dim / restore the default helper lights added at scene init
  sc3.traverse(function(o){
    if(o.isAmbientLight){
      if(on){ if(o.userData._oi==null)o.userData._oi=o.intensity; o.intensity=0.42; }
      else if(o.userData._oi!=null){ o.intensity=o.userData._oi; o.userData._oi=null; }
    }
    if(o.isDirectionalLight){
      if(on){ if(o.userData._oi==null)o.userData._oi=o.intensity; o.intensity=0.18; }
      else if(o.userData._oi!=null){ o.intensity=o.userData._oi; o.userData._oi=null; }
    }
  });
  // swap surface materials (walls/floors/KMD) between Basic <-> Lambert
  sc3.traverse(function(o){
    if(!o.isMesh)return;
    if(o.userData&&o.userData.type==="lit")return;           // leave our markers unlit/bright
    if(on){
      if(o.userData&&o.userData._litMat)return;               // already swapped
      var m=o.material;
      if(!m||m.type!=="MeshBasicMaterial")return;
      if(o.geometry&&!o.geometry.attributes.normal){try{o.geometry.computeVertexNormals();}catch(e){}}
      o.userData=o.userData||{};o.userData._litMat=m;
      o.material=new THREE.MeshLambertMaterial({
        color:m.color?m.color.getHex():0xffffff, map:m.map||null,
        transparent:m.transparent, opacity:m.opacity, side:m.side, depthWrite:m.depthWrite});
    } else if(o.userData&&o.userData._litMat){
      if(o.material&&o.material.dispose)o.material.dispose();
      o.material=o.userData._litMat;o.userData._litMat=null;
    }
  });
  LIT3D_rebuild();   // (re)adds markers + the actual point lights when preview is on
}

// ---- clear + (re)build the 3D light objects in sc3 ----
function LIT3D_clear(){
  var i,o;
  for(i=0;i<LIT3D.objs.length;i++){o=LIT3D.objs[i];sc3.remove(o);
    if(o.geometry&&o.geometry.dispose)o.geometry.dispose();
    if(o.material&&o.material.dispose)o.material.dispose();}
  for(i=0;i<LIT3D.pts.length;i++)sc3.remove(LIT3D.pts[i]);
  LIT3D.objs=[];LIT3D.pts=[];LIT3D.markers=[];
}
var LIT3D_MAXPL=8;   // cap live point lights (matches runtime DG_TmpLightList = nearest 8)
function LIT3D_rebuild(){
  if(!sc3)return;
  LIT3D_clear();
  if(!LIT3D.on){LIT3D_status();return;}
  // choose which lights get a real PointLight: nearest LIT3D_MAXPL to the camera target.
  // Adding a PointLight per light recompiles every lit material's shader, so this MUST be bounded.
  var plAllow={};
  if(LIT3D.preview){
    var cx=(typeof cTgt!=="undefined"&&cTgt)?cTgt.x:0,cy=(typeof cTgt!=="undefined"&&cTgt)?cTgt.y:0,cz=(typeof cTgt!=="undefined"&&cTgt)?cTgt.z:0;
    var arr=[];
    for(var q=0;q<LIT3D.lights.length;q++){var Lq=LIT3D.lights[q];
      var dx=Lq.vx*S-cx,dy=Lq.vy*S-cy,dz=Lq.vz*S-cz;arr.push({i:q,d:dx*dx+dy*dy+dz*dz});}
    arr.sort(function(a,b){return a.d-b.d;});
    for(var w=0;w<arr.length&&w<LIT3D_MAXPL;w++)plAllow[arr[w].i]=1;
  }
  for(var i=0;i<LIT3D.lights.length;i++){
    var L=LIT3D.lights[i];
    var col=(L.r<<16)|(L.g<<8)|L.b;
    var x=L.vx*S,y=L.vy*S,z=L.vz*S,g={mk:null,sel:null,ring:null,pl:null};
    var isSel=(i===LIT3D.sel);
    var mk=new THREE.Mesh(new THREE.SphereGeometry(isSel?0.5:0.35,12,8),new THREE.MeshBasicMaterial({color:col}));
    mk.position.set(x,y,z);mk.userData={litIndex:i,type:"lit"};sc3.add(mk);LIT3D.objs.push(mk);g.mk=mk;
    if(isSel){
      var sm=new THREE.Mesh(new THREE.SphereGeometry(0.7,14,10),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.9}));
      sm.position.set(x,y,z);sm.userData={type:"lit"};sc3.add(sm);LIT3D.objs.push(sm);g.sel=sm;
    }
    if(LIT3D.rings&&L.radius>0){
      // unit sphere scaled to radius — radius edits just change .scale, never realloc geometry
      var rm=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.18}));
      rm.scale.setScalar(Math.max(0.05,L.radius*S));
      rm.position.set(x,y,z);rm.userData={type:"lit"};sc3.add(rm);LIT3D.objs.push(rm);g.ring=rm;
    }
    if(LIT3D.preview&&plAllow[i]){
      var pl=new THREE.PointLight(col,Math.min(6,(L.bright||0)/300),Math.max(0.001,L.radius*S)*3.2,1.4);
      pl.position.set(x,y,z);sc3.add(pl);LIT3D.pts.push(pl);g.pl=pl;
    }
    LIT3D.markers[i]=g;
  }
  LIT3D_status();
}
// fast per-light update — position/color/intensity/radius WITHOUT allocating geometry
function LIT3D_syncOne(i){
  var g=LIT3D.markers[i],L=LIT3D.lights[i];if(!g||!L)return;
  var x=L.vx*S,y=L.vy*S,z=L.vz*S,rgb=[L.r/255,L.g/255,L.b/255];
  if(g.mk){g.mk.position.set(x,y,z);g.mk.material.color.setRGB(rgb[0],rgb[1],rgb[2]);}
  if(g.sel)g.sel.position.set(x,y,z);
  if(g.ring){g.ring.position.set(x,y,z);g.ring.material.color.setRGB(rgb[0],rgb[1],rgb[2]);g.ring.scale.setScalar(Math.max(0.05,L.radius*S));}
  if(g.pl){g.pl.position.set(x,y,z);g.pl.color.setRGB(rgb[0],rgb[1],rgb[2]);g.pl.intensity=Math.min(6,(L.bright||0)/300);g.pl.distance=Math.max(0.001,L.radius*S)*3.2;}
}

// ---- load .lit / .stg / DIR / .dar ----
function LIT3D_loadFiles(fileList){
  var arr=[].slice.call(fileList),pend=arr.length;if(!pend)return;
  var collected=[];
  arr.forEach(function(f){var fr=new FileReader();fr.onload=function(){
    try{
      var bytes=new Uint8Array(fr.result),lo=f.name.toLowerCase(),ex=[];
      if(lo.slice(-4)===".lit")ex=[{name:f.name,bytes:bytes}];
      else if(lo.slice(-4)===".stg")ex=LIT3D_fromStg(bytes,f.name);
      else if(lo.slice(-4)===".dir")ex=LIT3D_fromDir(bytes);
      else if(lo.slice(-4)===".dar")ex=LIT3D_fromDar(bytes);
      else{try{LIT3D_parse(bytes);ex=[{name:f.name,bytes:bytes}];}catch(e){ex=LIT3D_fromStg(bytes,f.name);}}
      ex.forEach(function(e){try{collected.push({name:e.name,lights:LIT3D_parse(e.bytes)});}catch(er){}});
    }catch(err){}
    if(--pend===0)LIT3D_afterLoad(collected);
  };fr.readAsArrayBuffer(f);});
}
function LIT3D_afterLoad(sets){
  if(!sets.length){LIT3D_status("no .lit data found");return;}
  // combine every extracted set; label with count
  LIT3D.sets=sets;LIT3D_useSet(0);
  LIT3D_buildSetPicker();
}
function LIT3D_useSet(idx){
  var s=LIT3D.sets[idx];if(!s)return;
  LIT3D.curSet=idx;LIT3D.lights=s.lights;LIT3D.name=s.name;LIT3D.sel=-1;
  LIT3D_rebuild();LIT3D_frameCamera();LIT3D_renderList();LIT3D_renderEdit();
}
// aim the orbit camera at the loaded lights so they're on screen
function LIT3D_frameCamera(){
  if(!LIT3D.lights.length||typeof cTgt==="undefined")return;
  var mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
  LIT3D.lights.forEach(function(L){mnx=Math.min(mnx,L.vx);mxx=Math.max(mxx,L.vx);
    mny=Math.min(mny,L.vy);mxy=Math.max(mxy,L.vy);mnz=Math.min(mnz,L.vz);mxz=Math.max(mxz,L.vz);});
  cTgt.set(((mnx+mxx)/2)*S,((mny+mxy)/2)*S,((mnz+mxz)/2)*S);
  if(typeof sph!=="undefined"){var span=Math.max(mxx-mnx,mxz-mnz,mxy-mny)*S;sph.radius=Math.max(8,span*1.4);}
  if(typeof uCam==="function")uCam();
}

// ---- editing: select / add / duplicate / delete / export ----
function LIT3D_select(i){
  LIT3D.sel=i;LIT3D_rebuild();LIT3D_renderList();LIT3D_renderEdit();
}
var LIT3D_clampS16=function(v){return Math.max(-32768,Math.min(32767,parseInt(v,10)||0));};
function LIT3D_addLight(){
  if(!LIT3D.lights)return;
  var c=LIT3D.lights.length?LIT3D.lights[LIT3D.lights.length-1]:{vx:0,vy:6400,vz:0};
  LIT3D.lights.push({vx:c.vx,vy:c.vy,vz:c.vz,bright:2000,radius:2500,r:200,g:220,b:200});
  LIT3D.sel=LIT3D.lights.length-1;
  if(LIT3D.sets&&LIT3D.sets[LIT3D.curSet])LIT3D.sets[LIT3D.curSet].lights=LIT3D.lights;
  LIT3D_rebuild();LIT3D_renderList();LIT3D_renderEdit();
}
function LIT3D_dupLight(){
  if(LIT3D.sel<0)return;var L=LIT3D.lights[LIT3D.sel];
  LIT3D.lights.splice(LIT3D.sel+1,0,{vx:L.vx,vy:L.vy,vz:L.vz,bright:L.bright,radius:L.radius,r:L.r,g:L.g,b:L.b});
  LIT3D.sel++;LIT3D_rebuild();LIT3D_renderList();LIT3D_renderEdit();
}
function LIT3D_delLight(){
  if(LIT3D.sel<0)return;LIT3D.lights.splice(LIT3D.sel,1);LIT3D.sel=-1;
  LIT3D_rebuild();LIT3D_renderList();LIT3D_renderEdit();
}
function LIT3D_serialize(lights){
  var out=new Uint8Array(4+lights.length*16),dv=new DataView(out.buffer);
  dv.setUint32(0,lights.length,true);
  for(var i=0;i<lights.length;i++){var L=lights[i],o=4+i*16;
    dv.setInt16(o,L.vx|0,true);dv.setInt16(o+2,L.vy|0,true);dv.setInt16(o+4,L.vz|0,true);dv.setInt16(o+6,L.pad|0||0,true);
    dv.setUint16(o+8,L.bright&0xffff,true);dv.setUint16(o+10,L.radius&0xffff,true);
    out[o+12]=L.r&0xff;out[o+13]=L.g&0xff;out[o+14]=L.b&0xff;out[o+15]=(L.cd|0)&0xff;}
  return out;
}
function LIT3D_export(){
  if(!LIT3D.lights.length){LIT3D_status("nothing to export");return;}
  var bytes=LIT3D_serialize(LIT3D.lights);
  var blob=new Blob([bytes],{type:"application/octet-stream"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=(LIT3D.name&&/\.lit$/i.test(LIT3D.name))?LIT3D.name:(LIT3D.name||"lights")+".lit";
  a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1500);
  LIT3D_status("exported "+a.download+" ("+LIT3D.lights.length+" lights)");
}

// ---- in-scene drag: raycast markers, move on a plane (X/Z, or Y with Shift) ----
function LIT3D_ndc(e){
  var vp=document.getElementById("viewport"),r=vp.getBoundingClientRect();
  ms3.x=((e.clientX-r.left)/r.width)*2-1;ms3.y=-((e.clientY-r.top)/r.height)*2+1;
  rc3.setFromCamera(ms3,cam3);
}
function LIT3D_planeHit(e,yMode){
  LIT3D_ndc(e);var L=LIT3D.lights[LIT3D.sel];if(!L)return null;var pt=new THREE.Vector3(),plane;
  if(yMode){var n=new THREE.Vector3();cam3.getWorldDirection(n);n.y=0;if(n.lengthSq()<1e-6)n.set(0,0,1);n.normalize();
    plane=new THREE.Plane().setFromNormalAndCoplanarPoint(n,new THREE.Vector3(L.vx*S,L.vy*S,L.vz*S));}
  else plane=new THREE.Plane(new THREE.Vector3(0,1,0),-(L.vy*S));
  return rc3.ray.intersectPlane(plane,pt)?pt:null;
}
function LIT3D_onDown(e){
  if(!LIT3D.edit3d)return;
  LIT3D_ndc(e);
  var picks=rc3.intersectObjects(LIT3D.objs,false),hit=null;
  for(var k=0;k<picks.length;k++){var ud=picks[k].object.userData;if(ud&&ud.litIndex!=null){hit=ud.litIndex;break;}}
  if(hit==null)return;                 // let the stage editor handle empty clicks
  e.stopPropagation();e.preventDefault();
  LIT3D.sel=hit;LIT3D.drag={i:hit};
  try{ren3.domElement.setPointerCapture(e.pointerId);}catch(_){}
  LIT3D_rebuild();LIT3D_renderList();LIT3D_renderEdit();
}
function LIT3D_onMove(e){
  if(!LIT3D.drag)return;e.stopPropagation();
  var pt=LIT3D_planeHit(e,e.shiftKey);if(!pt)return;var L=LIT3D.lights[LIT3D.drag.i];
  if(e.shiftKey){L.vy=LIT3D_clampS16(pt.y/S);}
  else{L.vx=LIT3D_clampS16(pt.x/S);L.vz=LIT3D_clampS16(pt.z/S);}
  LIT3D_syncOne(LIT3D.drag.i);LIT3D_editValues();
}
function LIT3D_onUp(e){
  if(!LIT3D.drag)return;e.stopPropagation();
  try{ren3.domElement.releasePointerCapture(e.pointerId);}catch(_){}
  LIT3D.drag=null;LIT3D_renderList();
}
function LIT3D_setEdit3D(on){
  LIT3D.edit3d=on;var cv=ren3&&ren3.domElement;if(!cv)return;
  if(on){cv.addEventListener("pointerdown",LIT3D_onDown,true);
    cv.addEventListener("pointermove",LIT3D_onMove,true);
    cv.addEventListener("pointerup",LIT3D_onUp,true);
    cv.addEventListener("pointercancel",LIT3D_onUp,true);}
  else{cv.removeEventListener("pointerdown",LIT3D_onDown,true);
    cv.removeEventListener("pointermove",LIT3D_onMove,true);
    cv.removeEventListener("pointerup",LIT3D_onUp,true);
    cv.removeEventListener("pointercancel",LIT3D_onUp,true);LIT3D.drag=null;}
}

// ---- floating control panel (lives over the viewport) ----
function LIT3D_togglePanel(){
  var p=document.getElementById("lit3dPanel");
  if(p){p.remove();return;}
  p=document.createElement("div");p.id="lit3dPanel";
  p.style.cssText="position:fixed;top:44px;right:8px;z-index:70;width:236px;max-height:calc(100vh - 90px);overflow:auto;background:rgba(10,14,16,0.97);"
    +"border:1px solid #ffd24a;border-radius:6px;padding:10px;font:11px/1.5 monospace;color:#c6d2cb;box-shadow:0 6px 24px rgba(0,0,0,.6)";
  p.innerHTML='<div style="color:#ffd24a;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between">'
    +'<span>\uD83D\uDCA1 STAGE LIGHTS</span><span id="lit3dX" style="cursor:pointer;color:#889">\u2715</span></div>'
    +'<label class="btn" style="display:block;text-align:center;background:#16221c;border:1px solid #2a3a30;border-radius:4px;padding:5px;cursor:pointer;margin-bottom:8px">Load .lit / .stg / DIR<input type="file" id="lit3dFile" accept=".lit,.stg,.dir,.dar,.bin" multiple style="display:none"></label>'
    +'<div id="lit3dSets" style="margin-bottom:8px"></div>'
    +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="lit3dOn" checked> Show lights</label>'
    +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="lit3dRings" checked> Radius spheres</label>'
    +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="lit3dPrev"> Light the geometry</label>'
    +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#ffd24a"><input type="checkbox" id="lit3dEdit3D"> Edit in 3D (drag markers)</label>'
    +'<div style="display:flex;gap:6px;margin:8px 0"><button id="lit3dAdd" style="flex:1;background:#16221c;border:1px solid #2a3a30;border-radius:4px;color:#c6d2cb;font:inherit;font-size:10px;padding:4px;cursor:pointer">+ Light</button>'
    +'<button id="lit3dExport" style="flex:1;background:#16221c;border:1px solid #8bd450;border-radius:4px;color:#8bd450;font:inherit;font-size:10px;padding:4px;cursor:pointer">Export .lit</button></div>'
    +'<div id="lit3dList" style="max-height:118px;overflow:auto;border:1px solid #1d2723;border-radius:4px;margin-bottom:8px"></div>'
    +'<div id="lit3dEdit"></div>'
    +'<div id="lit3dStatus" style="margin-top:8px;color:#69796f;font-size:10px">No .lit loaded</div>'
    +'<div style="margin-top:6px;color:#556;font-size:9px">Markers sit at world*S, aligned to the stage geometry. Editing is in the Lighting Editor tile.</div>';
  document.body.appendChild(p);
  document.getElementById("lit3dX").onclick=function(){p.remove();};
  document.getElementById("lit3dFile").onchange=function(e){LIT3D_loadFiles(e.target.files);};
  document.getElementById("lit3dOn").onchange=function(e){LIT3D.on=e.target.checked;LIT3D_rebuild();};
  document.getElementById("lit3dRings").onchange=function(e){LIT3D.rings=e.target.checked;LIT3D_rebuild();};
  document.getElementById("lit3dPrev").onchange=function(e){LIT3D_setLitPreview(e.target.checked);};
  document.getElementById("lit3dEdit3D").onchange=function(e){LIT3D_setEdit3D(e.target.checked);};
  document.getElementById("lit3dAdd").onclick=LIT3D_addLight;
  document.getElementById("lit3dExport").onclick=LIT3D_export;
  LIT3D_buildSetPicker();LIT3D_renderList();LIT3D_renderEdit();LIT3D_status();
}
function LIT3D_buildSetPicker(){
  var host=document.getElementById("lit3dSets");if(!host)return;
  if(!LIT3D.sets||LIT3D.sets.length<2){host.innerHTML="";return;}
  var sel='<select id="lit3dSel" style="width:100%;background:#0e1311;color:#c6d2cb;border:1px solid #2a3a30;border-radius:4px;padding:3px;font:inherit">';
  for(var i=0;i<LIT3D.sets.length;i++)sel+='<option value="'+i+'"'+(i===LIT3D.curSet?" selected":"")+'>'+LIT3D.sets[i].name+" ("+LIT3D.sets[i].lights.length+")</option>";
  sel+="</select>";host.innerHTML=sel;
  document.getElementById("lit3dSel").onchange=function(e){LIT3D_useSet(+e.target.value);LIT3D_buildSetPicker();};
}
function LIT3D_status(msg){
  var el=document.getElementById("lit3dStatus");if(!el)return;
  if(msg){el.textContent=msg;return;}
  el.innerHTML=LIT3D.lights.length?("<b style='color:#8bd450'>"+LIT3D.name+"</b> \u00b7 "+LIT3D.lights.length+" lights"):"No .lit loaded";
}

// ---- panel: light list + per-light editor (ported from the Lighting Editor tile) ----
function LIT3D_renderList(){
  var host=document.getElementById("lit3dList");if(!host)return;
  if(!LIT3D.lights||!LIT3D.lights.length){host.innerHTML='<div style="padding:6px;color:#69796f;font-size:10px">no lights</div>';return;}
  var h="";
  for(var i=0;i<LIT3D.lights.length;i++){var L=LIT3D.lights[i];
    var bg=(i===LIT3D.sel)?"background:#13351f;":"";
    h+='<div data-i="'+i+'" class="lit3dRow" style="'+bg+'display:flex;align-items:center;gap:6px;padding:3px 6px;cursor:pointer;font-size:10px;border-bottom:1px solid #131a17">'
      +'<span style="color:#69796f;width:16px">'+i+'</span>'
      +'<span style="width:10px;height:10px;border-radius:2px;border:1px solid #0008;background:rgb('+L.r+','+L.g+','+L.b+')"></span>'
      +'<span style="color:#889;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+L.vx+','+L.vy+','+L.vz+' r'+L.radius+'</span></div>';
  }
  host.innerHTML=h;
  var rows=host.querySelectorAll(".lit3dRow");
  for(var k=0;k<rows.length;k++)rows[k].onclick=function(){LIT3D_select(+this.getAttribute("data-i"));};
}
function LIT3D_renderEdit(){
  var host=document.getElementById("lit3dEdit");if(!host)return;
  if(LIT3D.sel<0||!LIT3D.lights[LIT3D.sel]){host.innerHTML='<div style="color:#69796f;font-size:10px">select a light (list above, or click a marker in 3D)</div>';return;}
  var L=LIT3D.lights[LIT3D.sel];
  var hx=function(n){return ("0"+((n&0xff).toString(16))).slice(-2);};
  var inp="width:100%;background:#0e1311;border:1px solid #1d2723;color:#c6d2cb;font:inherit;font-size:10px;padding:2px 4px";
  var btn="flex:1;background:#16221c;border:1px solid #2a3a30;border-radius:4px;color:#c6d2cb;font:inherit;font-size:10px;padding:4px;cursor:pointer";
  var dbtn="flex:1;background:#16221c;border:1px solid #5a4421;border-radius:4px;color:#e0a24a;font:inherit;font-size:10px;padding:4px;cursor:pointer";
  host.innerHTML='<div style="color:#ffd24a;font-size:10px;margin-bottom:4px">LIGHT #'+LIT3D.sel+'</div>'
    +'<div style="display:flex;gap:4px;margin-bottom:5px">'
      +'<div style="flex:1"><div style="color:#69796f;font-size:9px;text-align:center">X</div><input id="l3x" type="number" value="'+L.vx+'" style="'+inp+'"></div>'
      +'<div style="flex:1"><div style="color:#69796f;font-size:9px;text-align:center">Y</div><input id="l3y" type="number" value="'+L.vy+'" style="'+inp+'"></div>'
      +'<div style="flex:1"><div style="color:#69796f;font-size:9px;text-align:center">Z</div><input id="l3z" type="number" value="'+L.vz+'" style="'+inp+'"></div>'
    +'</div>'
    +'<div style="color:#69796f;font-size:9px">Brightness <span id="l3bv">'+L.bright+'</span></div><input id="l3b" type="range" min="0" max="4096" value="'+L.bright+'" style="width:100%;accent-color:#ffd24a">'
    +'<div style="color:#69796f;font-size:9px">Radius <span id="l3rv">'+L.radius+'</span></div><input id="l3r" type="range" min="0" max="8192" value="'+L.radius+'" style="width:100%;accent-color:#ffd24a">'
    +'<div style="display:flex;align-items:center;gap:6px;margin:5px 0"><input id="l3c" type="color" value="#'+hx(L.r)+hx(L.g)+hx(L.b)+'" style="width:36px;height:24px;border:1px solid #1d2723;background:none;padding:0;cursor:pointer"><span id="l3crgb" style="color:#69796f;font-size:10px">'+L.r+','+L.g+','+L.b+'</span></div>'
    +'<div style="display:flex;gap:6px"><button id="l3dup" style="'+btn+'">Duplicate</button><button id="l3del" style="'+dbtn+'">Delete</button></div>';
  document.getElementById("l3x").onchange=function(){L.vx=LIT3D_clampS16(this.value);LIT3D_syncOne(LIT3D.sel);LIT3D_renderList();};
  document.getElementById("l3y").onchange=function(){L.vy=LIT3D_clampS16(this.value);LIT3D_syncOne(LIT3D.sel);LIT3D_renderList();};
  document.getElementById("l3z").onchange=function(){L.vz=LIT3D_clampS16(this.value);LIT3D_syncOne(LIT3D.sel);LIT3D_renderList();};
  document.getElementById("l3b").oninput=function(){L.bright=+this.value;document.getElementById("l3bv").textContent=L.bright;LIT3D_syncOne(LIT3D.sel);};
  document.getElementById("l3r").oninput=function(){L.radius=+this.value;document.getElementById("l3rv").textContent=L.radius;
    var gg=LIT3D.markers[LIT3D.sel];
    if(LIT3D.rings&&L.radius>0&&(!gg||!gg.ring))LIT3D_rebuild(); else LIT3D_syncOne(LIT3D.sel);};
  document.getElementById("l3r").onchange=function(){LIT3D_renderList();};
  document.getElementById("l3c").oninput=function(){var v=this.value;L.r=parseInt(v.slice(1,3),16);L.g=parseInt(v.slice(3,5),16);L.b=parseInt(v.slice(5,7),16);document.getElementById("l3crgb").textContent=L.r+','+L.g+','+L.b;LIT3D_syncOne(LIT3D.sel);};
  document.getElementById("l3c").onchange=function(){LIT3D_renderList();};
  document.getElementById("l3dup").onclick=LIT3D_dupLight;
  document.getElementById("l3del").onclick=LIT3D_delLight;
}
// live-update the X/Y/Z fields during a 3D drag without rebuilding the panel
function LIT3D_editValues(){
  if(LIT3D.sel<0)return;var L=LIT3D.lights[LIT3D.sel];
  var x=document.getElementById("l3x"),y=document.getElementById("l3y"),z=document.getElementById("l3z");
  if(x)x.value=L.vx;if(y)y.value=L.vy;if(z)z.value=L.vz;
}

// ---- teardown: called when the Stage Editor closes — revert lit preview,
//      detach 3D-edit listeners, remove all light objects, and kill the panel ----
function LIT3D_teardown(){
  try{ if(LIT3D.preview)LIT3D_setLitPreview(false); }catch(e){}
  try{ if(LIT3D.edit3d)LIT3D_setEdit3D(false); }catch(e){}
  try{ LIT3D_clear(); }catch(e){}
  var p=document.getElementById("lit3dPanel");if(p)p.remove();
}
