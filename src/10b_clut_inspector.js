// ═══════════════════════════════════════════════════════════════════════════
// FILE: 10b_clut_inspector.js  — CLUT visualizer + split-and-reassign
// ═══════════════════════════════════════════════════════════════════════════
// A CLUT is the colour palette a texture points at, living in VRAM at (Cx,Cy).
// 4bpp textures use a 16-colour CLUT (16 px wide); 8bpp use 256. Many textures
// can legitimately share one CLUT — but only if they agree on the colours. When
// two textures sit at the same (Cx,Cy) with DIFFERENT palettes, the engine
// uploads both to the same VRAM spot and the last one wins, so the other renders
// with the wrong colours. This module visualises every CLUT and, on request,
// resolves those conflicts by moving the losing textures to free CLUT slots and
// rewriting their Cx/Cy header bytes. Because each PSX texture already carries
// its own palette, no re-indexing is needed — it's pure relocation, the same
// principle the MMS --split-cluts mode uses for character ports.

// Read a texture's actual palette from its .pcc bytes. EGA: 16-colour header
// palette at offset 16. VGA: trailing 0x0C-marked 768-byte block near EOF.
function readClutPalette(slot){
var df=darRawFiles[slot.darIdx];if(!df||!df.data)return[];
var d=df.data,nc=slot.nc||(slot.bpp===8?256:16),out=[];
if(slot.bpp===8){
var base=-1;
for(var probe=d.length-769;probe>=d.length-771&&probe>=0;probe--){if(d[probe]===0x0C){base=probe+1;break;}}
if(base<0)base=d.length-768;
for(var i=0;i<nc;i++){var o=base+i*3;out.push([d[o]||0,d[o+1]||0,d[o+2]||0]);}
}else{
for(var j=0;j<nc;j++){var p=16+j*3;out.push([d[p]||0,d[p+1]||0,d[p+2]||0]);}
}
return out;}

function clutPaletteKey(pal){var s="";for(var i=0;i<pal.length;i++)s+=pal[i][0]+","+pal[i][1]+","+pal[i][2]+";";return s;}
function clutCss(c){return"rgb("+c[0]+","+c[1]+","+c[2]+")";}

// Build the CLUT map: every texture's CLUT, grouped by exact (Cx,Cy), with
// palette buckets so we can tell a legit share from a colour conflict.
function buildClutMap(){
var slots=analyzeVRAMSlots();
for(var i=0;i<slots.length;i++){slots[i].pal=readClutPalette(slots[i]);slots[i].palKey=clutPaletteKey(slots[i].pal);}
var groups={},order=[];
for(i=0;i<slots.length;i++){var s=slots[i];var k=s.cx+"_"+s.cy;
if(!groups[k]){groups[k]={cx:s.cx,cy:s.cy,nc:s.nc,members:[]};order.push(k);}
groups[k].members.push(s);if(s.nc>groups[k].nc)groups[k].nc=s.nc;}
var list=[];
for(var gi=0;gi<order.length;gi++){var g=groups[order[gi]];
var buckets={},border=[];
for(var m=0;m<g.members.length;m++){var mm=g.members[m];if(!buckets[mm.palKey]){buckets[mm.palKey]=[];border.push(mm.palKey);}buckets[mm.palKey].push(mm);}
g.buckets=border.map(function(bk){return{key:bk,members:buckets[bk],pal:buckets[bk][0].pal};});
g.conflict=g.buckets.length>1;
g.shared=g.members.length>1;
list.push(g);}
return{groups:list,slots:slots};}

// Plan a conflict-free CLUT layout. Process fixed (stage) textures first so they
// keep their spot; relocate only the minority palette(s) that disagree.
//
// Per conflicted CLUT we pick an ANCHOR bucket that stays put and move every
// other bucket to a free slot. Anchor = the bucket with the most STAGE (non-
// imported) textures, tie-broken by total size — so stage data stays in place
// and imported textures are the ones that move, and we never relocate more than
// the minority. Allocation is confined to the proven-safe CLUT band the repacker
// uses (x512..1024, y240..256), never into framebuffer or texture-image space.
function planClutReassign(){
var map=buildClutMap();
var slots=map.slots;
var images=slots.map(function(s){return{x:s.px,y:s.py,w:Math.max(1,s.vw),h:Math.max(1,s.h)};});
var moves=[],unplaced=[];
// committed = every CLUT placement we've locked in (originals that stay + new spots)
var committed=[];
function freeClut(nc){
// Confine to the safe band (matches findFreeCLUTSlot). 16px x-step = HW CLUT granularity.
var region={x1:512,y1:240,x2:1024,y2:256};
for(var cy=region.y1;cy<region.y2;cy++){
for(var cx=region.x1;cx+nc<=region.x2;cx+=16){
var cand={cx:cx,cy:cy,nc:nc},bad=false;
for(var i=0;i<committed.length;i++){if(clutsOverlap(cand,committed[i])){bad=true;break;}}
if(bad)continue;
var cr={x:cx,y:cy,w:nc,h:1};
for(i=0;i<images.length;i++){if(rectsOverlap(cr,images[i])){bad=true;break;}}
if(bad)continue;
return{cx:cx,cy:cy};}}
return null;}
function stageCount(b){var n=0;for(var i=0;i<b.members.length;i++)if(!b.members[i].imported)n++;return n;}
// First lock in every non-conflicting CLUT (single palette) so the anchor search
// for conflicted ones can't land on top of them.
for(var gi=0;gi<map.groups.length;gi++){var g=map.groups[gi];
if(!g.conflict)committed.push({cx:g.cx,cy:g.cy,nc:g.nc,key:g.buckets[0].key});}
// Now resolve conflicts: anchor stays, minority buckets relocate.
for(gi=0;gi<map.groups.length;gi++){g=map.groups[gi];
if(!g.conflict)continue;
// choose anchor bucket: most stage textures, then most members overall
var anchor=g.buckets[0];
for(var b=1;b<g.buckets.length;b++){var cand=g.buckets[b];
var cs=stageCount(cand),as=stageCount(anchor);
if(cs>as||(cs===as&&cand.members.length>anchor.members.length))anchor=cand;}
committed.push({cx:g.cx,cy:g.cy,nc:g.nc,key:anchor.key});
for(b=0;b<g.buckets.length;b++){var bk=g.buckets[b];if(bk===anchor)continue;
var slot=freeClut(g.nc);
if(!slot){for(var m=0;m<bk.members.length;m++)unplaced.push(bk.members[m].name);continue;}
committed.push({cx:slot.cx,cy:slot.cy,nc:g.nc,key:bk.key});
for(m=0;m<bk.members.length;m++){var s=bk.members[m];
moves.push({name:s.name,darIdx:s.darIdx,px:s.px,py:s.py,from:{cx:s.cx,cy:s.cy},to:slot,nc:s.nc,imported:s.imported});}}}
return{moves:moves,unplaced:unplaced,map:map};}

function runClutFix(){
if(!darLoaded||!darRawFiles||!darRawFiles.length){alert("Load a stage texture DAR first.");return;}
var plan=planClutReassign();
if(plan.moves.length===0){showClutFixResult(plan);return;}
if(!confirm("Resolve "+plan.moves.length+" CLUT conflict"+(plan.moves.length===1?"":"s")+" by moving texture"+(plan.moves.length===1?"":"s")+" to free CLUT slots? This rewrites Cx/Cy header bytes (reversible by reloading)."))return;
for(var i=0;i<plan.moves.length;i++){var mv=plan.moves[i];rewritePcxPlacement(mv.darIdx,mv.px,mv.py,mv.to.cx,mv.to.cy);}
showClutFixResult(plan);
var cp=document.getElementById("clutPopup");if(cp){closeClutPopup();openCLUTPopup();}
var vp=document.getElementById("vramPopup");if(vp&&typeof openVRAMPopup==="function"){closeVRAMPopup();openVRAMPopup();}
if(typeof updateVRAMPanel==="function")updateVRAMPanel();}

function closeClutPopup(){var p=document.getElementById("clutPopup");if(p)p.remove();}

function openCLUTPopup(){
if(!darLoaded||!darRawFiles||!darRawFiles.length){alert("Load a stage texture DAR first.");return;}
var map=buildClutMap();
var conflictGroups=map.groups.filter(function(g){return g.conflict;}).length;
var sharedGroups=map.groups.filter(function(g){return g.shared&&!g.conflict;}).length;
var ov=document.createElement("div");ov.id="clutPopup";
ov.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:1000;display:flex;flex-direction:column;align-items:center;padding:20px;overflow-y:auto";
var h="";
h+='<div style="color:#b08cff;font-size:16px;font-weight:bold;margin-bottom:4px">CLUT Inspector — '+map.groups.length+' palettes in VRAM</div>';
h+='<div style="color:#778;font-size:11px;max-width:760px;text-align:center;line-height:1.5;margin-bottom:8px">A CLUT is the colour palette a texture points at, stored in VRAM at (Cx,Cy). Textures can share one — but only if their colours match. Two textures at the same spot with different palettes fight, and one renders wrong. <b style="color:#b08cff">Resolve conflicts</b> moves the losing texture to a free CLUT slot.</div>';
h+='<div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;justify-content:center">';
if(conflictGroups>0)h+='<span style="background:#3a0a1a;color:#ff6699;padding:1px 6px;border-radius:2px">⚠ '+conflictGroups+' palette conflict'+(conflictGroups===1?'':'s')+'</span>';
else h+='<span style="background:#0a2a1a;color:#66cc99;padding:1px 6px;border-radius:2px">✓ no palette conflicts</span>';
h+='<span style="color:#b088cc">'+sharedGroups+' shared (consistent)</span>';
h+='</div>';
h+='<div style="display:flex;gap:14px;margin-bottom:8px;font-size:10px;color:#88aacc;flex-wrap:wrap;justify-content:center">';
h+='<span style="color:#55bbaa">■ single owner</span><span style="color:#b088ff">■ shared, consistent</span><span style="color:#ff5577">■ conflict (colours disagree)</span><span style="color:#334">■ texture image</span>';
h+='</div>';
h+='<button onclick="closeClutPopup()" style="position:absolute;top:10px;right:20px;background:#3a1130;color:#ff88cc;border:1px solid #b03377;padding:4px 12px;cursor:pointer;font-size:12px;border-radius:3px">Close (ESC)</button>';
if(conflictGroups>0)h+='<button onclick="runClutFix()" style="position:absolute;top:10px;left:20px;background:#2a1140;color:#cc99ff;border:1px solid #7733bb;padding:4px 12px;cursor:pointer;font-size:12px;border-radius:3px;font-weight:bold">⚙ Resolve '+conflictGroups+' conflict'+(conflictGroups===1?'':'s')+'</button>';
h+='<canvas id="clutBigCanvas" width="1024" height="512" style="border:2px solid #2a1535;cursor:crosshair;image-rendering:pixelated;max-width:95vw"></canvas>';
h+='<div id="clutBigHover" style="color:#b088cc;font-size:12px;margin-top:6px;height:18px;text-align:center"></div>';
h+='<div id="clutList" style="width:100%;max-width:1024px;margin-top:8px;background:#100a18;border:1px solid #2a1535;padding:8px;border-radius:4px;max-height:340px;overflow-y:auto"></div>';
ov.innerHTML=h;document.body.appendChild(ov);
ov.addEventListener("keydown",function(e){if(e.key==="Escape")closeClutPopup();});ov.tabIndex=0;ov.focus();
drawClutCanvas(map);
renderClutList(map);}

function drawClutCanvas(map){
var cv=document.getElementById("clutBigCanvas");if(!cv)return;var ctx=cv.getContext("2d");
ctx.fillStyle="#080610";ctx.fillRect(0,0,1024,512);
ctx.fillStyle="#14141f";ctx.fillRect(0,0,320,240);ctx.fillRect(0,240,320,240);
ctx.fillStyle="#445";ctx.font="10px monospace";ctx.fillText("FB1",140,120);ctx.fillText("FB2",140,360);
// palette region outline
var pr=VRAM_REGIONS.palettes;ctx.strokeStyle="#7733bb55";ctx.setLineDash([4,3]);ctx.strokeRect(pr.x1+0.5,pr.y1+0.5,pr.x2-pr.x1-1,pr.y2-pr.y1-1);ctx.setLineDash([]);
ctx.fillStyle="#7733bb99";ctx.fillText("PALETTES",pr.x1+4,pr.y1+13);
// faint texture images
for(var i=0;i<map.slots.length;i++){var s=map.slots[i];ctx.fillStyle="#1a2230";ctx.fillRect(s.px,s.py,Math.max(1,s.vw),Math.max(1,s.h));}
// CLUT bars — drawn 3px tall so they're visible
for(i=0;i<map.groups.length;i++){var g=map.groups[i];
var col=g.conflict?"#ff3366":g.shared?"#9966ff":"#33bbaa";
ctx.fillStyle=col;ctx.fillRect(g.cx,Math.max(0,g.cy-1),Math.max(2,g.nc),3);
if(g.conflict){ctx.strokeStyle="#ff88aa";ctx.lineWidth=1;ctx.strokeRect(g.cx-0.5,g.cy-2.5,Math.max(2,g.nc)+1,5);}}
cv.onmousemove=function(e){var r=cv.getBoundingClientRect();var sx=1024/r.width,sy=512/r.height;
var mx=Math.floor((e.clientX-r.left)*sx),my=Math.floor((e.clientY-r.top)*sy);
var hv=document.getElementById("clutBigHover");if(!hv)return;var hit=null;
for(var j=0;j<map.groups.length;j++){var g=map.groups[j];if(mx>=g.cx&&mx<g.cx+Math.max(2,g.nc)&&my>=g.cy-2&&my<=g.cy+2){hit=g;break;}}
if(hit){var names=hit.members.map(function(m){return m.name;}).join(", ");
hv.innerHTML="CLUT (0x"+hit.cx.toString(16)+",0x"+hit.cy.toString(16)+") · "+hit.nc+" colours · "+(hit.conflict?"<b style='color:#ff6699'>"+hit.buckets.length+" palettes conflict</b> · ":hit.shared?"shared · ":"")+names;}
else hv.textContent="";};}

function renderClutSwatches(pal,max){
var n=Math.min(pal.length,max||32);var s='<span style="display:inline-flex;gap:1px;vertical-align:middle">';
for(var i=0;i<n;i++)s+='<span style="width:9px;height:9px;background:'+clutCss(pal[i])+';border:1px solid #00000044"></span>';
if(pal.length>n)s+='<span style="color:#667;font-size:9px;margin-left:3px">+'+(pal.length-n)+'</span>';
return s+'</span>';}

function renderClutList(map){
var p=document.getElementById("clutList");if(!p)return;
var groups=map.groups.slice().sort(function(a,b){return(b.conflict?2:b.shared?1:0)-(a.conflict?2:a.shared?1:0);});
var html='<div style="font-weight:bold;color:#b08cff;margin-bottom:6px;font-size:12px">CLUTs ('+groups.length+') — conflicts first</div>';
for(var i=0;i<groups.length;i++){var g=groups[i];
var dot=g.conflict?"#ff3366":g.shared?"#9966ff":"#33bbaa";
html+='<div style="padding:5px 0;border-bottom:1px solid #1a1426">';
html+='<div style="display:flex;gap:8px;align-items:center;font-size:11px;margin-bottom:3px">';
html+='<span style="width:9px;height:9px;border-radius:50%;background:'+dot+';flex-shrink:0"></span>';
html+='<span style="color:#ccb8e8;font-family:monospace">0x'+g.cx.toString(16)+',0x'+g.cy.toString(16)+'</span>';
html+='<span style="color:#667">'+g.nc+'c</span>';
if(g.conflict)html+='<span style="color:#ff6699;font-weight:bold">⚠ '+g.buckets.length+' palettes disagree</span>';
else if(g.shared)html+='<span style="color:#b088cc">shared by '+g.members.length+'</span>';
html+='</div>';
// one swatch row per distinct palette bucket, with the member names that use it
for(var b=0;b<g.buckets.length;b++){var bk=g.buckets[b];
html+='<div style="display:flex;gap:8px;align-items:center;padding-left:17px;margin-bottom:2px">';
html+=renderClutSwatches(bk.pal,32);
var nm=bk.members.map(function(m){return m.name+(m.imported?" ◆":"");}).join(", ");
html+='<span style="color:#8a7ca0;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+nm+'</span>';
html+='</div>';}
html+='</div>';}
html+='<div style="color:#556;font-size:9px;margin-top:6px">◆ = imported texture. On a conflict, imported textures are the ones relocated; stage textures keep their slot.</div>';
p.innerHTML=html;}

function showClutFixResult(plan){
var ex=document.getElementById("clutFixModal");if(ex)ex.remove();
var m=document.createElement("div");m.id="clutFixModal";
m.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center";
var box=document.createElement("div");
box.style.cssText="background:#100a18;border:1px solid #2a1535;border-radius:6px;padding:20px;max-width:680px;max-height:80vh;overflow-y:auto;color:#bba8d8;font-family:monospace;font-size:11px";
var h='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><b style="color:#cc88ff;font-size:14px">CLUT Conflict Resolution</b></div>';
if(plan.moves.length===0)h+='<div style="color:#66cc99">No palette conflicts found — every shared CLUT already agrees on its colours. Nothing to do.</div>';
else{h+='<div style="color:#cc99ff;margin-bottom:8px">Relocated '+plan.moves.length+' texture'+(plan.moves.length===1?'':'s')+' to free CLUT slots (exact colours preserved):</div>';
for(var i=0;i<plan.moves.length;i++){var mv=plan.moves[i];
h+='<div style="padding:2px 0;border-bottom:1px solid #1a1426">'+mv.name+'<span style="color:#667"> &nbsp;0x'+mv.from.cx.toString(16)+',0x'+mv.from.cy.toString(16)+' → </span><span style="color:#9f8">0x'+mv.to.cx.toString(16)+',0x'+mv.to.cy.toString(16)+'</span></div>';}}
if(plan.unplaced&&plan.unplaced.length)h+='<div style="color:#ff7766;margin-top:8px">⚠ No free CLUT slot for: '+plan.unplaced.join(", ")+'. Free VRAM in the palette region or exclude a texture, then retry.</div>';
h+='<div style="margin-top:14px;text-align:right"><button onclick="document.getElementById(\'clutFixModal\').remove()" style="background:#2a1140;color:#cc99ff;border:1px solid #7733bb;padding:5px 14px;cursor:pointer;border-radius:3px">Done</button></div>';
box.innerHTML=h;m.appendChild(box);document.body.appendChild(m);}
// ============================================================
