// ═══════════════════════════════════════════════════════════════════════════
// FILE: 10_vram_analysis.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// VRAM ANALYSIS (Phase 1: collision detection + visualization)
// ============================================================
// Pure analysis layer on top of parseVRAMSlots(). Identifies which textures are
// imported (from a character pack) vs original stage textures, detects collisions,
// and provides the named VRAM regions matching what the WantedThing repacker tool
// uses. No rewriting — Phase 2 will handle that.

// VRAM region definitions, extracted by disassembling pcx_vram_repacker_v0.1.exe.
// These are the three named regions the repacker uses, picked by directory name.
// See /home/claude/REPACKER_ALGORITHM_NOTES.md for the full derivation.
var VRAM_REGIONS={
init:    {x1:640, y1:0,   x2:1024, y2:256, label:"INIT",     color:"#553388"},
stage:   {x1:0,   y1:256, x2:960,  y2:512, label:"STAGE",    color:"#225588"},
palettes:{x1:768, y1:192, x2:1024, y2:256, label:"PALETTES", color:"#885533"}
};

// TPAGE alignment constants, verified against real-world packs (liquid_00a and
// greyfox_02a) — all 4bpp textures cross 16-byte boundaries (not actionable)
// but never 64-byte boundaries, which is the actual TPAGE alignment for 4bpp.
// 4bpp TPAGEs are 64 VRAM bytes wide (= 256 pixels); 8bpp TPAGEs are 128 VRAM
// bytes wide (= 256 pixels). Textures crossing these boundaries render with
// garbage on one side.
var TPAGE_ALIGN_4BPP=64; // 4-bit textures
var TPAGE_ALIGN_8BPP=128;// 8-bit textures

// Determine if a slot is from an imported pack vs the original stage DAR.
// Three ways a slot counts as "imported":
//   1. Loaded via the ImpDAR catalog flow → tagged isImportTagged in darRawFiles
//   2. Name matches a record in the importedTextures[] global
//   3. Its source DAR is flagged via darImportFlags (user-toggled in VRAM viewer)
// Any of these is sufficient. The toggle approach lets users handle the case
// where they loaded a character pack via the regular ImpTexDAR button rather
// than the dedicated ImpDAR import path.
function isImportedSlot(slot){
if(slot.isImportTagged)return true;
if(slot.darSource&&darImportFlags[slot.darSource])return true;
if(importedTextures&&importedTextures.length>0){
for(var i=0;i<importedTextures.length;i++){
if(importedTextures[i].name===slot.name)return true;}}
return false;}

// Test if two rectangles overlap. Both args are {x, y, w, h}.
// Standard intersection test — touching edges counts as NOT overlapping.
function rectsOverlap(a,b){
if(a.x+a.w<=b.x||b.x+b.w<=a.x)return false;
if(a.y+a.h<=b.y||b.y+b.h<=a.y)return false;
return true;}

// Test if two CLUT placements overlap. CLUTs are 1px tall, nc wide.
// CLUT collisions are per-row + per-x-span only.
function clutsOverlap(a,b){
if(a.cy!==b.cy)return false;// different rows = no collision
if(a.cx+a.nc<=b.cx||b.cx+b.nc<=a.cx)return false;
return true;}

// Test if a placement crosses a TPAGE column boundary.
// `align` is 128 for 4bpp/palettes, 64 for 8bpp.
function crossesTPage(x,vramW,align){
for(var c=x+1;c<x+vramW;c++){
if(c%align===0)return true;}
return false;}

// Compute full analysis: each slot tagged with source, collision lists, TPAGE warnings.
// Returns array parallel to parseVRAMSlots() output with extra fields.
function analyzeVRAMSlots(){
var slots=parseVRAMSlots();
// First pass: tag source
for(var i=0;i<slots.length;i++){
slots[i].imported=isImportedSlot(slots[i]);
slots[i].collidesWith=[];
slots[i].clutCollidesWith=[];
slots[i].crossesTPage=false;
// TPAGE check
var align=slots[i].bpp===4?TPAGE_ALIGN_4BPP:TPAGE_ALIGN_8BPP;
slots[i].crossesTPage=crossesTPage(slots[i].px,slots[i].vw,align);}
// Second pass: pairwise collision check.
// A VRAM overlap is always a real engine-level problem (last-write wins, garbage
// rendering). We flag ALL overlaps, regardless of source classification. The
// "imported" flag matters for which side gets relocated during repack, not for
// whether the collision exists.
for(i=0;i<slots.length;i++){
for(var j=i+1;j<slots.length;j++){
var a=slots[i],b=slots[j];
// Texture rectangle collision.
// EXCEPTION -- SHARED SLOTS: two textures at the IDENTICAL px/py are an
// intentional MGS pattern (alternate/state variants uploaded to one VRAM
// rect at different times, never simultaneously). Vanilla stage DARs ship
// with these (e.g. 1_0.dar has 7 such pairs) and they render fine, so they
// are classified as sharedWith -- informational, not a collision.
var ra={x:a.px,y:a.py,w:a.vw,h:a.h};
var rb={x:b.px,y:b.py,w:b.vw,h:b.h};
if(a.px===b.px&&a.py===b.py){
if(!a.sharedWith)a.sharedWith=[];
if(!b.sharedWith)b.sharedWith=[];
a.sharedWith.push(b.name);
b.sharedWith.push(a.name);}
else if(rectsOverlap(ra,rb)){
a.collidesWith.push(b.name);
b.collidesWith.push(a.name);}
// CLUT collision — CLUTs of size nc on row cy. Multiple textures legitimately share
// CLUT positions (shown in Liquid pack), so only flag if they're at the same exact
// (cx, cy) AND different nc — that's a real conflict.
if(clutsOverlap(a,b)&&!(a.cx===b.cx&&a.cy===b.cy)){
a.clutCollidesWith.push(b.name);
b.clutCollidesWith.push(a.name);}}}
return slots;}

// Determine which named region a coordinate falls into. Returns region key or null.
function getVRAMRegionAt(x,y){
for(var key in VRAM_REGIONS){var r=VRAM_REGIONS[key];
if(x>=r.x1&&x<r.x2&&y>=r.y1&&y<r.y2)return key;}
return null;}

// Summary counts for the panel header
function getVRAMAnalysisSummary(){
var slots=analyzeVRAMSlots();
var importedCount=0,collisionCount=0,clutCollisionCount=0,tpageCount=0;
for(var i=0;i<slots.length;i++){
if(slots[i].imported)importedCount++;
if(slots[i].collidesWith.length>0)collisionCount++;
if(slots[i].clutCollidesWith.length>0)clutCollisionCount++;
if(slots[i].crossesTPage)tpageCount++;}
return{
total:slots.length,
imported:importedCount,
stage:slots.length-importedCount,
collisions:collisionCount,// number of slots involved in a texture-rect collision
clutCollisions:clutCollisionCount,
tpageCrossings:tpageCount,
slots:slots};}

// ============================================================
