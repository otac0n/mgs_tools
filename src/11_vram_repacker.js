// ═══════════════════════════════════════════════════════════════════════════
// FILE: 11_vram_repacker.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// VRAM REPACKER (Phase 2)
// ============================================================
// Builds on 10_vram_analysis.js. When a character pack collides with stage
// textures, this finds free VRAM space for the imported PCXs and rewrites their
// header bytes (px/py/cx/cy) so the engine uploads them to non-colliding
// coordinates at runtime.
//
// Behavior matches WantedThing's pcx_vram_repacker_v0.1.exe:
//  - Picks region based on whether textures are in stage (y>=256) or init (y<256)
//  - First-fit-decreasing placement (sort by area, largest first)
//  - Respects TPAGE column alignment (texture must stay within one TPAGE)
//  - Skips textures that don't fit anywhere — doesn't crash, just reports them
//  - Only relocates currently-colliding textures by default (matches the tool's
//    behavior; --force in the original repacks everything regardless)
//
// Verified against real packs liquid_00a_stg_tex4.dar and greyfox_02a_stg_tex4.dar
// for understanding the safe-region boundaries and TPAGE math.

// Build the list of "fixed" VRAM occupancy — stage textures that shouldn't move.
// A texture is fixed if it's in darRawFiles but NOT in importedTextures.
function collectFixedVRAMSlots(){
var slots=parseVRAMSlots();
var fixed=[];
for(var i=0;i<slots.length;i++){
if(!isImportedSlot(slots[i]))fixed.push(slots[i]);}
return fixed;}

// Build the list of "mobile" VRAM rects — imported textures that CAN be moved.
// Each entry includes a reference to its index in darRawFiles so we can rewrite
// the header bytes when we relocate.
function collectImportedVRAMSlots(){
var slots=parseVRAMSlots();
var mobile=[];
for(var i=0;i<slots.length;i++){
if(isImportedSlot(slots[i]))mobile.push(slots[i]);}
return mobile;}

// Rewrite a PCX file's header bytes to update VRAM placement. The PCX is at
// darRawFiles[darIdx]; we modify the Uint8Array in place. The next export of
// the DAR will pick up the new values.
function rewritePcxPlacement(darIdx,px,py,cx,cy){
if(darIdx<0||darIdx>=darRawFiles.length)return false;
var data=darRawFiles[darIdx].data;
if(!data||data.length<88)return false;
data[78]=px&0xFF;data[79]=(px>>8)&0xFF;
data[80]=py&0xFF;data[81]=(py>>8)&0xFF;
data[82]=cx&0xFF;data[83]=(cx>>8)&0xFF;
data[84]=cy&0xFF;data[85]=(cy>>8)&0xFF;
return true;}

// Test if placing a rect at (x, y) with size (w, h) crosses a TPAGE boundary.
// Uses the same TPAGE_ALIGN constants from 10_vram_analysis.js.
function placementCrossesTPage(x,vramW,bpp){
var align=bpp===4?TPAGE_ALIGN_4BPP:TPAGE_ALIGN_8BPP;
return crossesTPage(x,vramW,align);}

// Test if a candidate rect (px, py, vramW, h) overlaps any rect in occupied.
function rectVRAMOverlapsAny(cand,occupied){
for(var i=0;i<occupied.length;i++){
var oc=occupied[i];
var ra={x:cand.px,y:cand.py,w:cand.vramW,h:cand.h};
var rb={x:oc.px,y:oc.py,w:oc.vw,h:oc.h};
if(rectsOverlap(ra,rb))return true;}
return false;}

// Find a free (px, py) inside `region` where a (vramW × h) rect fits without
// overlap and stays within one TPAGE. Scans X in steps of 4 (the smallest
// alignment used by real packs) and Y in steps of 1.
function findFreeVRAMSlot(region,occupied,vramW,h,bpp){
var stepX=4,stepY=1;
for(var y=region.y1;y+h<=region.y2;y+=stepY){
for(var x=region.x1;x+vramW<=region.x2;x+=stepX){
if(placementCrossesTPage(x,vramW,bpp))continue;
var cand={px:x,py:y,vramW:vramW,h:h};
if(!rectVRAMOverlapsAny(cand,occupied))return{px:x,py:y};}}
return null;}

// Find a free CLUT location. CLUTs are 1px tall × nc wide. They live in their
// own region (right strip + bottom area). Scan that region for a free row+span.
function findFreeCLUTSlot(occupied,nc){
// Search the same region the tool uses (and where vanilla CLUTs cluster).
// Real packs put CLUTs in x=768..1024, y=240..256 typically.
var region={x1:512,y1:240,x2:1024,y2:256};
for(var y=region.y1;y<region.y2;y++){
for(var x=region.x1;x+nc<=region.x2;x++){
var cand={cx:x,cy:y,nc:nc};
var ok=true;
for(var i=0;i<occupied.length;i++){
var oc=occupied[i];
if(clutsOverlap(cand,oc)){ok=false;break;}}
if(ok)return{cx:x,cy:y};}}
return null;}

// Main entry: run the repack.
//
// opts.region — "stage" (default) or "init". Picks which safe area to pack into.
// opts.forceAll — if true, relocate every imported texture regardless of whether
//                 it's currently colliding. Matches the --force flag of the .exe.
//
// Returns {placed, skipped, skippedNames, moves, region, totalImported, alreadyOk}.
// Which region a texture "belongs" to, by its VRAM y coordinate.
function VRAMR_homeRegion(py){return py<256?"init":"stage";}

// Rects that texture PLACEMENT must never cover: every CLUT in the file.
// Derived from the file's own CLUT records (cx, cy, nc -- 1 row tall each),
// NOT from hardcoded strips: empirical audit of a known-good stage DAR showed
// legit resident textures living inside the old hardcoded "palettes" strip
// (768-1024 x 192-256) while the REAL CLUT rows sat at cy 226-253 -- the
// hardcoded strips created false collisions on clean files and let placement
// rules drift from reality. The file itself is the authority.
// These rects are used ONLY for placement -- a texture overlapping a CLUT is
// separately detected as a real collision below.
function VRAMR_clutRects(){
var slots=parseVRAMSlots();
var rects=[];
for(var i=0;i<slots.length;i++){
if(slots[i].nc>0){
rects.push({px:slots[i].cx,py:slots[i].cy,vw:slots[i].nc,h:1});}}
return rects;}

function repackVRAM(opts){
opts=opts||{};
if(typeof VRAM_REGIONS==="undefined"){return{error:"VRAM_REGIONS not available — load a stage DAR first"};}
// opts.region: "auto" (default) = every texture repacks within its OWN home
// region (resident stays resident, stage stays stage). "init"/"stage" force
// one region for everything (legacy behavior). opts.allowOverflow: if a
// resident texture doesn't fit in the resident area, place it in stage
// instead of skipping it (explicit opt-in — overflowed entries are flagged).
var regionKey=opts.region||"auto";
if(regionKey!=="auto"&&!VRAM_REGIONS[regionKey]){return{error:"Unknown region: "+regionKey};}
var fixed=collectFixedVRAMSlots();
var imported=collectImportedVRAMSlots();
if(imported.length===0){return{error:"No imported textures — use ImpDAR to load a character pack first"};}
// Find imports that currently collide with stage or with each other
var needRelocation=[];
var keepInPlace=[];
for(var i=0;i<imported.length;i++){
var imp=imported[i];
var collides=false;
// vs any CLUT row in the file (a texture over a palette is real corruption)
var clutRects=VRAMR_clutRects();
for(var cr=0;cr<clutRects.length;cr++){
if(rectsOverlap({x:imp.px,y:imp.py,w:imp.vw,h:imp.h},
{x:clutRects[cr].px,y:clutRects[cr].py,w:clutRects[cr].vw,h:clutRects[cr].h})){
collides=true;break;}}
// vs stage
if(!collides)
for(var j=0;j<fixed.length;j++){
if(rectsOverlap({x:imp.px,y:imp.py,w:imp.vw,h:imp.h},
{x:fixed[j].px,y:fixed[j].py,w:fixed[j].vw,h:fixed[j].h})){
collides=true;break;}}
// vs other imports -- EXCEPT shared slots (identical px/py = intentional
// variant sharing, see analyzeVRAMSlots). Only PARTIAL overlaps collide.
if(!collides){
for(var k=0;k<imported.length;k++){
if(k===i)continue;
if(imported[k].px===imp.px&&imported[k].py===imp.py)continue;
if(rectsOverlap({x:imp.px,y:imp.py,w:imp.vw,h:imp.h},
{x:imported[k].px,y:imported[k].py,w:imported[k].vw,h:imported[k].h})){
collides=true;break;}}}
// Force modes ("everything into RESIDENT/STAGE") relocate every imported
// texture not already inside the target region, plus all colliders --
// matching what the mode's label promises. Auto mode moves colliders only.
var wrongRegion=false;
if(regionKey!=="auto"){
var reg=VRAM_REGIONS[regionKey];
wrongRegion=!(imp.px>=reg.x1&&imp.px+imp.vw<=reg.x2&&imp.py>=reg.y1&&imp.py+imp.h<=reg.y2);}
if(collides||wrongRegion||opts.forceAll)needRelocation.push(imp);
else keepInPlace.push(imp);}
// Occupied = fixed + the imports we're leaving alone
var occupied=fixed.concat(keepInPlace);
// Sort relocation list by area, largest first (first-fit decreasing reduces fragmentation)
needRelocation.sort(function(a,b){return(b.vw*b.h)-(a.vw*a.h);});
var placed=0,skipped=0,skippedNames=[],moves=[];
var overflowed=0;
// Shared-slot grouping: members that started at the same (px,py) must stay
// co-located -- when a group leader is placed, followers adopt its slot
// instead of being scattered (the old behavior split vanilla variant pairs).
var groupSlot={};
for(var r=0;r<needRelocation.length;r++){
var rect=needRelocation[r];
var gkey=rect.px+","+rect.py;
if(groupSlot[gkey]){
var gs=groupSlot[gkey];
var goldPx=rect.px,goldPy=rect.py;
rewritePcxPlacement(rect.darIdx,gs.px,gs.py,rect.cx,rect.cy);
rect.px=gs.px;rect.py=gs.py;
placed++;
moves.push({name:rect.name,from:{px:goldPx,py:goldPy},to:{px:gs.px,py:gs.py},overflowed:gs.overflowed,shared:true});
if(typeof importedTextures!=="undefined"){
for(var git=0;git<importedTextures.length;git++){
if(importedTextures[git].name===rect.name){
importedTextures[git].vramPx=gs.px;
importedTextures[git].vramPy=gs.py;
importedTextures[git].assigned=true;break;}}}
continue;}
// Target region: the texture's own home region in auto mode, or the forced one.
var targetKey=(regionKey==="auto")?VRAMR_homeRegion(rect.py):regionKey;
var targetRegion=VRAM_REGIONS[targetKey];
// Every CLUT row in the file counts as occupied for placement.
var occupiedPlus=occupied.concat(VRAMR_clutRects());
var slot=findFreeVRAMSlot(targetRegion,occupiedPlus,rect.vw,rect.h,rect.bpp);
var didOverflow=false;
if(!slot&&opts.allowOverflow&&targetKey==="init"){
// Resident area full: explicitly permitted spill into stage.
slot=findFreeVRAMSlot(VRAM_REGIONS.stage,occupiedPlus,rect.vw,rect.h,rect.bpp);
if(slot)didOverflow=true;}
if(slot){
if(didOverflow)overflowed++;
var oldPx=rect.px,oldPy=rect.py;
// Rewrite the DAR's PCX bytes in place
rewritePcxPlacement(rect.darIdx,slot.px,slot.py,rect.cx,rect.cy);
// Update the slot record so subsequent iterations see the new position
rect.px=slot.px;rect.py=slot.py;
occupied.push(rect);
placed++;
moves.push({name:rect.name,from:{px:oldPx,py:oldPy},to:{px:slot.px,py:slot.py},overflowed:didOverflow});
groupSlot[oldPx+","+oldPy]={px:slot.px,py:slot.py,overflowed:didOverflow};
// Update the matching importedTextures entry's bookkeeping
if(typeof importedTextures!=="undefined"){
for(var it=0;it<importedTextures.length;it++){
if(importedTextures[it].name===rect.name){
importedTextures[it].vramPx=slot.px;
importedTextures[it].vramPy=slot.py;
importedTextures[it].assigned=true;
break;}}}}
else{
skipped++;
skippedNames.push(rect.name);}}
// Per-region mode leaves stage-homed textures in stage BY DESIGN; report
// how many, so "everything resident" expectations aren't silently unmet.
var outsideInit=0;
for(var oi2=0;oi2<imported.length;oi2++){
var s2=imported[oi2];
if(!(s2.px>=VRAM_REGIONS.init.x1&&s2.px+s2.vw<=VRAM_REGIONS.init.x2&&
     s2.py>=VRAM_REGIONS.init.y1&&s2.py+s2.h<=VRAM_REGIONS.init.y2))outsideInit++;}
return{
placed:placed,
skipped:skipped,
skippedNames:skippedNames,
moves:moves,
region:regionKey,
overflowed:overflowed,
outsideInit:outsideInit,
totalImported:imported.length,
alreadyOk:keepInPlace.length};}

// User-facing entry point. Auto-detect region from the imported texture coords,
// run the repack, show results.
function runVRAMRepack(){
if(!darRawFiles||darRawFiles.length===0){
alert("No DAR loaded — open a stage texture DAR first.");return;}
// Use the analysis layer's import detection — covers ImpDAR-loaded packs AND
// regular-loaded DARs that the user has flagged via the VRAM popup checkbox.
var importedSlots=collectImportedVRAMSlots();
if(importedSlots.length===0){
alert("No imported textures detected.\n\nIf you loaded a character pack via the regular ImpTexDAR button (not the dedicated ImpDAR catalog), open the VRAM viewer and check the box next to that DAR to mark it as imported.\n\nThen run repack again.");return;}
// Count where the imports live, for the options modal's info line.
var nInit=0,nStage=0;
for(var i=0;i<importedSlots.length;i++){
if(importedSlots[i].py<256)nInit++;else nStage++;}
// Options modal: placement mode + overflow opt-in. Replaces the old silent
// winner-take-all auto-detect, which sent RESIDENT textures into the STAGE
// area whenever the import set was mixed.
var existing=document.getElementById("repackOptsModal");
if(existing)existing.remove();
var m=document.createElement("div");
m.id="repackOptsModal";
m.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center";
var box=document.createElement("div");
box.style.cssText="background:#0d1219;border:1px solid #1a2535;border-radius:6px;padding:20px;max-width:520px;color:#aabbcc;font-family:monospace;font-size:11px";
box.innerHTML=
'<b style="color:#ff4488;font-size:13px">VRAM Repack</b>'+
'<div style="margin:10px 0;color:#889">Imported textures: <b style=\'color:#88ddff\'>'+nInit+'</b> resident (y&lt;256) + <b style=\'color:#88ddff\'>'+nStage+'</b> stage (y&ge;256)</div>'+
'<div style="margin:8px 0"><label><input type="radio" name="rpkMode" value="auto" checked> <b>Per-region (recommended)</b> — resident textures repack within the resident area, stage within stage</label></div>'+
'<div style="margin:8px 0"><label><input type="radio" name="rpkMode" value="init"> Force everything into RESIDENT</label></div>'+
'<div style="margin:8px 0"><label><input type="radio" name="rpkMode" value="stage"> Force everything into STAGE (legacy behavior)</label></div>'+
'<div style="margin:12px 0;padding-top:8px;border-top:1px solid #1a2535"><label><input type="checkbox" id="rpkOverflow"> Allow overflow: if a resident texture does not fit in the resident area, place it in STAGE (flagged in results)</label></div>'+
'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'+
'<button class="btn" onclick="document.getElementById(\'repackOptsModal\').remove()">Cancel</button>'+
'<button class="btn" style="background:#1a3a25;color:#8fd48f" onclick="VRAMR_runWithOpts()">Repack</button>'+
'</div>';
m.appendChild(box);
document.body.appendChild(m);}

function VRAMR_runWithOpts(){
var mode="auto";
var radios=document.getElementsByName("rpkMode");
for(var i=0;i<radios.length;i++)if(radios[i].checked)mode=radios[i].value;
var overflow=document.getElementById("rpkOverflow").checked;
document.getElementById("repackOptsModal").remove();
var result=repackVRAM({region:mode,allowOverflow:overflow});
showRepackResult(result);
var popup=document.getElementById("vramPopup");
if(popup){closeVRAMPopup();openVRAMPopup();}}

// Modal showing repack results: counts, moves, and unplaced textures (if any).
function showRepackResult(result){
var existing=document.getElementById("repackResultModal");
if(existing)existing.remove();
var m=document.createElement("div");
m.id="repackResultModal";
m.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center";
var box=document.createElement("div");
box.style.cssText="background:#0d1219;border:1px solid #1a2535;border-radius:6px;padding:20px;max-width:760px;max-height:80vh;overflow-y:auto;color:#aabbcc;font-family:monospace;font-size:11px";
var html='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
html+='<b style="color:#ff4488;font-size:14px">VRAM Repack Result</b>';
html+='<span style="flex:1"></span>';
html+='<button onclick="document.getElementById(\'repackResultModal\').remove()" class="btn">Close</button>';
html+='</div>';
if(result.error){
html+='<div style="color:#ff8866;background:#3a1a0a;padding:8px 12px;border-radius:3px">Error: '+result.error+'</div>';}
else{
// Summary stats
html+='<div style="background:#0a1a14;padding:8px 12px;border-radius:3px;margin-bottom:10px;line-height:1.7">';
html+='Mode: <b style="color:#88ddff">'+(result.region==="auto"?"per-region":result.region)+'</b><br>';
if(result.overflowed>0){html+='Overflowed into STAGE: <b style="color:#ffcc66">'+result.overflowed+'</b><br>';}
if(result.region==="auto"&&result.outsideInit>0){html+='<span style="color:#cc8">Note: '+result.outsideInit+' texture'+(result.outsideInit===1?'':'s')+' live outside the RESIDENT region (per-region mode leaves them in their home region -- use "Force everything into RESIDENT" to move them).</span><br>';}
html+='Total imported textures: <b>'+result.totalImported+'</b><br>';
html+='Already in valid position: <b style="color:#44cc88">'+result.alreadyOk+'</b><br>';
html+='Successfully relocated: <b style="color:#44cc88">'+result.placed+'</b><br>';
if(result.skipped>0){
html+='Could not place: <b style="color:#ff8844">'+result.skipped+'</b>';}
html+='</div>';
if(result.moves&&result.moves.length>0){
html+='<div style="margin-bottom:6px"><b style="color:#88ddff">Relocations:</b></div>';
html+='<div style="max-height:280px;overflow-y:auto;background:#0a0e14;padding:8px;border:1px solid #1a2535;border-radius:3px;margin-bottom:10px">';
for(var i=0;i<result.moves.length;i++){
var mv=result.moves[i];
html+='<div style="font-size:10px;padding:1px 0">'+mv.name+': <span style="color:#ff8866">('+mv.from.px+','+mv.from.py+')</span> → <span style="color:#44cc88">('+mv.to.px+','+mv.to.py+')</span>'+(mv.overflowed?' <span style="color:#ffcc66">[overflow→stage]</span>':'')+'</div>';}
html+='</div>';}
if(result.skipped>0){
html+='<div style="background:#3a1a0a;padding:8px 12px;border-radius:3px">';
html+='<b style="color:#ff8844">Could not relocate '+result.skipped+' texture'+(result.skipped===1?'':'s')+':</b><br>';
for(var s=0;s<result.skippedNames.length;s++){
html+='<div style="font-size:10px;color:#ffaa88;margin-top:2px">⚠ '+result.skippedNames[s]+'</div>';}
html+='<div style="font-size:10px;color:#aa8866;margin-top:6px">VRAM is too full to fit these. To make room: remove other imports, switch to a less texture-dense stage, or accept that these will collide.</div>';
html+='</div>';}
else if(result.placed>0){
html+='<div style="background:#0a3a1a;padding:6px 10px;border-radius:3px;color:#44cc88;font-size:10px">✓ All imported textures now fit without collisions. Export your modified DAR to apply changes in-game.</div>';}}
box.innerHTML=html;
m.appendChild(box);
document.body.appendChild(m);}

// ============================================================
