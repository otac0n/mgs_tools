// ============================================================================
// 33_codec_editor.js  —  MGS1 Codec Editor (RADIO.DAT)
// Structure per the authoritative unRadio_v2.rb parser, validated against
// SLPM-86247 RADIO.DAT: a flat sequence of FREQUENCY-PREFIXED conversation
// records interleaved with 36-byte custom-glyph bitmaps.
//
// Record walk: read BE16 at offset.
//   if 14000..14300  -> conversation record (freq = val/100, e.g. 140.85)
//       +0 freq  +2 unk0  +4 unk1  +6 unk2  +8 flag  +9 size(BE16)
//       command block = bytes [+8 .. +8+size+1); next record at +size+9
//   else             -> 36-byte glyph bitmap; advance 36.
// Commands (block): code byte then:
//   01 TEXT : size=BE16[+1]; len=size+1; actor=BE16[+3] face=BE16[+5] unk=BE16[+7];
//             text bytes = [+9 .. +len-1)
//   02 VOICE: FIXED 7 bytes;  unk0=BE16[+3] unk1=BE16[+5]
//   03 FACE : size=BE16[+1]; len=size+1; actor/face/unk
//   04 MEMORY:size=BE16[+1]; len=size+1; freq=BE16[+3]; name
//   05 SAVE 06 AUDIO 07 PROMPT 08 (len=size+1)
//   10 IF (+3)  11 ELSE (+1)  12 ELSIF (+1)  30 (+8)  31 (+3)  40 (+3)
//   80 BLOCK (+3)  ff ENDLINE (+1)  00 BLOCKEND (+1)
// Text: literal ASCII for bytes <0x7f (!=0x1f); 0x80 0x4E = newline; other
//   2-byte codes (0x80nn/0x1fnn/0x81nn/0x82nn/0x90nn/...) are special glyphs,
//   preserved as {hhhh} tokens so English edits keep them intact.
// In-place edit within each TEXT command's fixed text-byte slot. Growth = phase 2.
// ============================================================================

var CODEC_ACTOR={0x21ca:'Solid Snake',0x33af:'Nastasha',0x3d2c:'Otacon',0x6588:'Col. Campbell',
  0x6c22:'Master Miller',0x7982:'Cyborg Ninja',0x7c90:'(static)',0x9475:'Naomi',0x95f2:'Meryl',
  0x962c:'Sniper Wolf',0xd78a:'Mei Ling',0xfb95:'Jim Houseman'};
function CODEC_actor(h){ return CODEC_ACTOR[h]||('0x'+(h>>>0).toString(16)); }

var CODEC_state={ panelEl:null, bytes:null, fileName:'', convs:[], sel:-1, filter:'', edits:{},
                  langFilter:'EN', sortMode:'len', faces:null, faceName:'' };

function CODEC_be16(b,o){ return (b[o]<<8)|b[o+1]; }
function CODEC_byte(o){ return (o in CODEC_state.edits)?CODEC_state.edits[o]:CODEC_state.bytes[o]; }

// ---- decode a text byte slot -> display string (ASCII + \n + {hhhh} tokens) --
function CODEC_decodeText(b, start, len){
  var s='', i=0;
  while(i<len){
    var c=b[start+i];
    // line break sequence: 80 23 80 4e
    if(c===0x80 && i+3<len && b[start+i+1]===0x23 && b[start+i+2]===0x80 && b[start+i+3]===0x4e){ s+='\n'; i+=4; continue; }
    if(c<0x7f && c!==0x1f){ s+=String.fromCharCode(c); i++; }
    else{
      var c2=(i+1<len)?b[start+i+1]:0;
      s+='{'+(((c<<8)|c2)).toString(16).padStart(4,'0')+'}'; i+=2;
    }
  }
  return s;
}
// encode display string -> bytes; must fit within maxLen (pad with 0x20). returns array|null if too long
function CODEC_encodeText(str, maxLen){
  var out=[], i=0;
  while(i<str.length){
    var ch=str[i];
    if(ch==='\n'){ out.push(0x80,0x23,0x80,0x4e); i++; }
    else if(ch==='{'){ var e=str.indexOf('}',i); if(e>i){ var v=parseInt(str.slice(i+1,e),16);
        if(!isNaN(v)){ out.push((v>>8)&0xff, v&0xff); i=e+1; continue; } }
        out.push(0x7b); i++; }
    else { out.push(str.charCodeAt(i)&0xff); i++; }
  }
  if(out.length>maxLen) return null;
  while(out.length<maxLen) out.push(0x20);
  return out;
}

// ---- parse RADIO.DAT (records are SECTOR-ALIGNED to 0x800, zero-padded) ------
function CODEC_parse(b){
  var convs=[], off=0, N=b.length, guard=0, SEC=0x800;
  while(off<N-11 && guard++<100000){
    var isFreq=CODEC_be16(b,off);
    if(isFreq>=14000 && isFreq<=14300){
      var size=CODEC_be16(b,off+9);
      var conv={ off:off, freq:isFreq/100, blockStart:off+8, blockLen:size+1, cmds:[], speakers:[], lines:[], lang:'?' };
      CODEC_parseBlock(b, conv);
      // language: ratio of ascii vs {token} chars in dialogue
      var asc=0, tok=0; conv.lines.forEach(function(l){ var m=l.orig.match(/\{[0-9a-f]{4}\}/g); tok+=m?m.length:0; asc+=l.orig.replace(/\{[0-9a-f]{4}\}/g,'').replace(/\s/g,'').length; });
      conv.lang = conv.lines.length? (asc>=tok?'EN':'JP') : '';
      convs.push(conv);
      off=Math.ceil((off+size+9)/SEC)*SEC;   // jump to next sector boundary
    } else {
      off+=SEC;                               // skip padding / non-conversation sector
    }
  }
  return convs;
}
function CODEC_parseBlock(b, conv){
  // Codec scripts are BRANCHING TREES: each freq record holds many conditional
  // sub-conversations (IF/SWITCH selected by game progress). A flat walk desyncs
  // on the variable-length conditions, so we scan the whole block for every
  // [FF][01] TALK command across all branches. Each TALK carries its own
  // actor+face, so portraits + edits resolve per line. (Validated: byte-exact.)
  var p=conv.blockStart, end=Math.min(conv.blockStart+conv.blockLen, b.length);
  var pendingVox=null, groupId=0;
  while(p<end-10){
    if(b[p]===0xFF && b[p+1]===0x02){           // VOICE: one clip governs the following lines
      var vsize=CODEC_be16(b,p+2);
      if(vsize>=4 && vsize<=8192){
        pendingVox=((b[p+4]<<24)|(b[p+5]<<16)|(b[p+6]<<8)|b[p+7])>>>0;
        groupId++;                              // new voice group
        p+=8; continue;
      }
    }
    if(b[p]===0xFF && b[p+1]===0x01){
      var tsize=CODEC_be16(b,p+2);
      if(tsize>=10 && tsize<=2048 && p+2+tsize<=end+2){
        var actor=CODEC_be16(b,p+4), face=CODEC_be16(b,p+6);
        var tStart=p+10, tLen=tsize-9; if(tLen<0) tLen=0;
        var disp=CODEC_decodeText(b,tStart,tLen);
        if(disp.replace(/[\s]/g,'').length && CODEC_looksReal(disp)){
          var ln={kind:'TEXT', actor:actor, face:face, facePos:p+6, actorPos:p+4, pos:tStart, len:tLen, orig:disp,
                  vox:pendingVox, voxGroup:(pendingVox?groupId:null)};   // share the clip across the group
          conv.cmds.push(ln); conv.lines.push(ln);
          if(conv.speakers.indexOf(actor)<0) conv.speakers.push(actor);
        }
        p += 2+tsize; continue;
      }
    }
    p++;
  }
}
// reject the rare false-positive (a stray FF 01 inside data): need letters or a glyph token
function CODEC_looksReal(disp){
  if(/\{[0-9a-f]{4}\}/.test(disp)) return true;             // has JP/special glyphs -> real
  var plain=disp.replace(/\{[0-9a-f]{4}\}/g,'').replace(/\n/g,' ');
  if(!plain.length) return false;
  var letters=0; for(var k=0;k<plain.length;k++){ var c=plain.charCodeAt(k); if((c>=65&&c<=90)||(c>=97&&c<=122)) letters++; }
  return letters/plain.length>=0.5;
}
function CODEC_lineText(ln){ return CODEC_decodeText(CODEC_bytesView(), ln.pos, ln.len); }
function CODEC_bytesView(){ // proxy that reflects edits
  if(!CODEC_state._proxy){ CODEC_state._proxy=new Proxy({},{ get:function(t,k){ var o=+k; return (o in CODEC_state.edits)?CODEC_state.edits[o]:CODEC_state.bytes[o]; } }); }
  return CODEC_state._proxy;
}

// ---- FACE.DAT: portraits (sector-aligned folders; 8-bit + BGR555 palette) ---
// folder: u32 rows; then rows*12 entries [skip2, hash(u16), size(u32), absOff(u32)];
// face data @ base+absOff: u32 palOff, u32 bmpOff, ... ; palette 256*u16 BGR555;
// bitmap: xo,yo,w,h (1 byte each) + w*h 8-bit indices.
function CODEC_faceParse(b){
  CODEC_state.faceBytes=b;               // mutable copy we edit + export
  var u32=function(o){return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;};
  var u16=function(o){return b[o]|(b[o+1]<<8);};
  var byHash={}, groups=[], off=0, N=b.length, SEC=0x800, total=0, fullCount=0;
  while(off<N-4){
    var rows=u32(off);
    if(rows===0||rows>2000){ off+=SEC; continue; }
    var base=off+4, entries=[], ok=true, maxEnd=0;
    for(var i=0;i<rows;i++){ var e=base+i*12; if(e+12>N){ok=false;break;}
      // face_header: u16 anim_type, u16 code(hash), u32 size, u32 offset (rel. to group start +4)
      var typ=u16(e), hsh=u16(e+2), size=u32(e+4), abs=u32(e+8);
      entries.push([typ,hsh,size,abs]); if(base+abs+size>maxEnd) maxEnd=base+abs+size; }
    if(!ok||!entries.length){ off+=SEC; continue; }
    var grp={fileOff:off, faces:[]};
    for(var k=0;k<entries.length;k++){
      var hdrTyp=entries[k][0], h=entries[k][1], sz=entries[k][2], abs2=entries[k][3];
      var fd=base+abs2;
      total++;
      // Data-side discriminator (per Joy-Division face-extract.c): first u32 of
      // the face data is 0x20 for SIMPLE (it doubles as the palette offset);
      // anything else is the frame count of a FULL animation.
      var marker=u32(fd);
      if(marker===0x20){
        var struct=CODEC_faceStruct(b,fd,u32,u16);
        if(struct){
          if(!(h in byHash)){ var img=CODEC_faceDecode(b,struct,u16); byHash[h]={w:struct.w,h:struct.h,rgba:img,occ:[]}; }
          byHash[h].occ.push(struct);
          grp.faces.push({hash:h,type:'simple',hdrType:hdrTyp,size:sz,struct:struct});
        }
      } else {
        var fstruct=CODEC_faceFullStruct(b,fd,sz,u32);
        if(fstruct){ fullCount++; grp.faces.push({hash:h,type:'full',hdrType:hdrTyp,size:sz,struct:fstruct}); }
      }
    }
    if(grp.faces.length) groups.push(grp);
    off=Math.ceil(maxEnd/SEC)*SEC;
  }
  return {byHash:byHash, groups:groups, folders:groups.length, total:total, fullCount:fullCount};
}
// SIMPLE face structure: u32 palOff(=0x20) + 7 image offsets (base, eyes[3],
// mouth[3]; zero = absent; the last eye/mouth slot may hold other artwork per
// the decomp note — exported regardless, labeled by slot) + 256x u16 palette.
function CODEC_faceStruct(b, fd, u32, u16){
  try{
    var palOff=u32(fd+0);
    if(palOff!==0x20) return null;
    var offs=[]; for(var j=0;j<7;j++) offs.push(u32(fd+4+j*4));
    var bmpOff=offs[0];
    if(!bmpOff||bmpOff>0x40000) return null;
    var w=b[fd+bmpOff+2], h=b[fd+bmpOff+3];
    if(w<1||w>128||h<1||h>160) return null;
    function sub(rel){ if(!rel) return null; var o=fd+rel;
      var sw=b[o+2],sh=b[o+3]; if(sw<1||sw>128||sh<1||sh>160) return null;
      return {rel:rel, xo:b[o],yo:b[o+1],w:sw,h:sh}; }
    return {fd:fd, palOff:palOff, bmpOff:bmpOff, w:w, h:h,
            subs:{bmp:sub(offs[0]), eyes0:sub(offs[1]), eyes1:sub(offs[2]), eyes2:sub(offs[3]),
                  mouth0:sub(offs[4]), mouth1:sub(offs[5]), mouth2:sub(offs[6])}};
  }catch(e){ return null; }
}
// FULL animation: u32 frame_count + frames[{u32 palOff, u32 bmpOff, s16, s16}],
// offsets relative to the face data start; every frame has its OWN 256-color
// palette. Used by the cinematic/briefing portraits.
function CODEC_faceFullStruct(b, fd, size, u32){
  try{
    var n=u32(fd);
    if(n<1||n>512) return null;
    var frames=[];
    for(var j=0;j<n;j++){
      var fo=fd+4+j*12;
      var palOff=u32(fo), bmpOff=u32(fo+4);
      if(!palOff||!bmpOff) return null;
      if(size&&(palOff>=size||bmpOff>=size)) return null;
      var o=fd+bmpOff, w=b[o+2], h=b[o+3];
      if(w<1||w>128||h<1||h>160) return null;
      frames.push({palOff:palOff,bmpOff:bmpOff,xo:b[o],yo:b[o+1],w:w,h:h});
    }
    return {fd:fd, full:true, frames:frames};
  }catch(e){ return null; }
}
function CODEC_faceDecode(b, st, u16){
  var w=st.w, h=st.h, pbase=st.fd+st.palOff, bbase=st.fd+st.bmpOff+4;
  var rgba=new Uint8ClampedArray(w*h*4);
  for(var i=0;i<w*h;i++){
    var c=u16(pbase+b[bbase+i]*2);
    var r=(c&0x1f)<<3, g=((c>>5)&0x1f)<<3, bl=((c>>10)&0x1f)<<3;
    var o=i*4; rgba[o]=r; rgba[o+1]=g; rgba[o+2]=bl; rgba[o+3]=(c===0)?0:255;
  }
  return rgba;
}
// Decode any sub-image / frame: image header at fd+imgOff {xo,yo,w,h}+pixels,
// palette (256x u16 BGR555) at fd+palOff. Index whose color==0 -> transparent.
function CODEC_faceDecodeAt(b, fd, imgOff, palOff){
  var o=fd+imgOff, xo=b[o],yo=b[o+1],w=b[o+2],h=b[o+3], bbase=o+4, pbase=fd+palOff;
  var rgba=new Uint8ClampedArray(w*h*4);
  for(var i=0;i<w*h;i++){
    var c=b[pbase+b[bbase+i]*2]|(b[pbase+b[bbase+i]*2+1]<<8);
    var r=(c&0x1f)<<3, g=((c>>5)&0x1f)<<3, bl=((c>>10)&0x1f)<<3;
    var q=i*4; rgba[q]=r; rgba[q+1]=g; rgba[q+2]=bl; rgba[q+3]=(c===0)?0:255;
  }
  return {xo:xo,yo:yo,w:w,h:h,rgba:rgba};
}
// build a scaled dataURL thumbnail (cached) for a face image
function CODEC_faceURL(face, scale){
  if(!face) return null;
  var key='_url'+(scale||1);
  if(face[key]) return face[key];
  var cv=document.createElement('canvas'); cv.width=face.w; cv.height=face.h;
  var ctx=cv.getContext('2d'); var id=ctx.createImageData(face.w,face.h); id.data.set(face.rgba); ctx.putImageData(id,0,0);
  if(scale&&scale!==1){ var cv2=document.createElement('canvas'); cv2.width=face.w*scale; cv2.height=face.h*scale;
    var c2=cv2.getContext('2d'); c2.imageSmoothingEnabled=false; c2.drawImage(cv,0,0,cv2.width,cv2.height); cv=cv2; }
  face[key]=cv.toDataURL(); return face[key];
}
// ---- export every decoded portrait as PNGs in a zip -------------------------
// Named by character where the face hash matches the codec actor table
// (same gv_strcode hash space); unknown hashes fall back to face_0xHASH.
// 1x native resolution, index-0 transparent (matches CODEC_faceDecode).
function CODEC_faceName(hsh){
  var nm=CODEC_ACTOR[hsh];
  if(!nm) return 'face_0x'+hsh.toString(16).padStart(4,'0');
  return nm.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'');
}
// Collect every image in FACE.DAT as {path,w,h,rgba} entries plus per-face
// frames.json metadata, organized by parent group (the sector-aligned folders
// the data actually lives in): group_NNN_0xOFFSET/NNN_Name/slot files.
// Pure data — no DOM — so it is unit-testable.
var CODEC_FACE_SLOTS=['base','eyes_0','eyes_1','eyes_2','mouth_0','mouth_1','mouth_2'];
function CODEC_faceCollectExport(){
  var b=CODEC_state.faceBytes, groups=CODEC_state.faces.groups||[];
  var out=[], jsons=[], stats={groups:groups.length,faces:0,parts:0,frames:0};
  function pad(n,w){ n=''+n; while(n.length<w)n='0'+n; return n; }
  groups.forEach(function(grp,gi){
    var gdir='group_'+pad(gi,3)+'_0x'+grp.fileOff.toString(16).padStart(6,'0');
    grp.faces.forEach(function(fc,fi){
      stats.faces++;
      var fdir=gdir+'/'+pad(fi,2)+'_'+CODEC_faceName(fc.hash);
      var meta={hash:'0x'+fc.hash.toString(16).padStart(4,'0'),
                name:(CODEC_ACTOR[fc.hash]||null), type:fc.type, parts:[]};
      if(fc.type==='simple'){
        var st=fc.struct, offs=[st.subs.bmp,st.subs.eyes0,st.subs.eyes1,st.subs.eyes2,
                                st.subs.mouth0,st.subs.mouth1,st.subs.mouth2];
        offs.forEach(function(s,si){
          if(!s) return;
          var img=CODEC_faceDecodeAt(b, st.fd, s.rel, st.palOff);
          var nm=pad(si,2)+'_'+CODEC_FACE_SLOTS[si]+'_x'+img.xo+'_y'+img.yo+'.png';
          out.push({path:fdir+'/'+nm, w:img.w, h:img.h, rgba:img.rgba});
          meta.parts.push({slot:CODEC_FACE_SLOTS[si], file:nm, x:img.xo, y:img.yo, w:img.w, h:img.h});
          stats.parts++;
        });
      } else {
        var fst=fc.struct;
        fst.frames.forEach(function(fr,ji){
          var img=CODEC_faceDecodeAt(b, fst.fd, fr.bmpOff, fr.palOff);
          var nm='frame_'+pad(ji,2)+'_x'+img.xo+'_y'+img.yo+'.png';
          out.push({path:fdir+'/'+nm, w:img.w, h:img.h, rgba:img.rgba});
          meta.parts.push({slot:'frame_'+ji, file:nm, x:img.xo, y:img.yo, w:img.w, h:img.h});
          stats.frames++;
        });
      }
      jsons.push({path:fdir+'/frames.json', text:JSON.stringify(meta,null,1)});
    });
  });
  return {images:out, jsons:jsons, stats:stats};
}
function CODEC_faceExportAllPNGs(btn){
  if(!CODEC_state.faces){ alert('Load FACE.DAT first.'); return; }
  if(typeof JSZip==='undefined'){ alert('JSZip not available in this build.'); return; }
  var col=CODEC_faceCollectExport();
  if(!col.images.length){ alert('No faces decoded.'); return; }
  var old=btn?btn.textContent:''; if(btn){ btn.disabled=true; btn.textContent='Exporting\u2026'; }
  var zip=new JSZip();
  col.jsons.forEach(function(j){ zip.file(j.path, j.text); });
  var scaleSel=document.getElementById('cfmPngScale');
  var scale=scaleSel?(parseInt(scaleSel.value,10)||1):1;
  var jobs=col.images.map(function(im){
    return new Promise(function(res){
      var cv=document.createElement('canvas'); cv.width=im.w; cv.height=im.h;
      var ctx=cv.getContext('2d'); var id=ctx.createImageData(im.w,im.h);
      id.data.set(im.rgba); ctx.putImageData(id,0,0);
      var out=cv;
      if(scale>1){                       // nearest-neighbor integer upscale
        out=document.createElement('canvas'); out.width=im.w*scale; out.height=im.h*scale;
        var octx=out.getContext('2d'); octx.imageSmoothingEnabled=false;
        octx.drawImage(cv,0,0,out.width,out.height);
      }
      out.toBlob(function(bl){
        if(!bl){ res(); return; }
        bl.arrayBuffer().then(function(ab){ zip.file(im.path, new Uint8Array(ab)); res(); });
      },'image/png');
    });
  });
  Promise.all(jobs).then(function(){ return zip.generateAsync({type:'blob'}); })
  .then(function(blob){
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=(scale>1)?('codec_faces_'+scale+'x.zip'):'codec_faces.zip'; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },4000);
    if(btn){ btn.disabled=false; btn.textContent=old; }
    var info=document.getElementById('cfmInfo'); var s=col.stats;
    if(info) info.textContent='exported '+s.groups+' groups \u00b7 '+s.faces+' faces \u00b7 '+
      s.parts+' parts + '+s.frames+' full-anim frames';
  }).catch(function(err){
    if(btn){ btn.disabled=false; btn.textContent=old; }
    alert('PNG export failed: '+(err&&err.message||err));
  });
}
// ---- VOX playback: SPU-ADPCM from VOX.DAT, voice synced to text ------------
// voxcode (from VOICE cmd) = sector offset; audio @ voxcode*2048, SPU-ADPCM,
// read 16-byte frames until the end flag. VOX.DAT read on demand via slices.
var CODEC_vox={ file:null, rate:22050, ctx:null, src:null, playing:false, queue:[], qi:0, hlTimer:null };
function CODEC_onVoxFile(ev){ var f=ev.target.files[0]; if(!f)return; CODEC_vox.file=f;
  document.getElementById('codecInfo').textContent=f.name+' \u00b7 '+(f.size/1048576).toFixed(0)+'MB VOX loaded \u2014 select a call and press \u25b6 Play';
}
var CODEC_ADPCM_POS=[0,60,115,98,122], CODEC_ADPCM_NEG=[0,0,-52,-55,-60];
function CODEC_decodeAdpcm(u8, start){
  // SPU-ADPCM: 16-byte frames. The clip is already bounded by chunk extraction
  // (ends at the 0xf0 marker), so decode every frame given.
  var out=[], h1=0, h2=0, p=start, N=u8.length, frames=0, MAXF=20000;
  while(p+16<=N && frames<MAXF){
    var hdr=u8[p];
    var shift=hdr&0x0f, filt=(hdr>>4)&0x07; if(filt>4) filt=0; if(shift>12) shift=9;
    for(var i=0;i<14;i++){
      var b=u8[p+2+i];
      for(var n=0;n<2;n++){
        var nib=(n===0)?(b&0x0f):((b>>4)&0x0f);
        var s=nib<<12; if(s&0x8000) s|=0xffff0000; s>>=shift;
        s += (CODEC_ADPCM_POS[filt]*h1 + CODEC_ADPCM_NEG[filt]*h2)>>6;
        if(s>32767)s=32767; else if(s<-32768)s=-32768;
        out.push(s/32768); h2=h1; h1=s;
      }
    }
    frames++; p+=16;
  }
  return new Float32Array(out);
}
// VOX.DAT is a tagged container: 4-byte tag (type=tag&0xFF, size=tag>>8),
// audio is type-0x01 chunks; clip ends at 0xf0 (or 0xff wrap). Concatenate them.
function CODEC_extractVoxAudio(u8){
  var out=[], p=0, N=u8.length, rate=CODEC_vox.rate, ch=1;
  while(p+4<=N){
    var tag=(u8[p]|(u8[p+1]<<8)|(u8[p+2]<<16)|(u8[p+3]<<24))>>>0;
    var t=tag&0xFF, sz=tag>>>8;
    if(t===0x02){                                   // audio header: rate class @+10, channels @+12
      var cls=u8[p+10]||8; ch=(u8[p+12]===2)?2:1; rate=Math.round(cls*44100/16);  // class/16 * 44100
      if(sz<4 || p+sz>N) break; p+=sz; continue;
    }
    if(t===0x01){                                   // audio chunk
      if(sz<4 || p+sz>N) break;
      for(var k=p+4;k<p+sz;k++) out.push(u8[k]); p+=sz; continue;
    }
    if(t===0xf0){ p+=4; continue; }                 // per-line separator (size 0) -> skip, keep going
    if(t===0xff) break;                             // wrap = hard end of clip
    if(sz<4 || p+sz>N) break;                       // zero padding / malformed = end
    p+=sz;                                          // other control chunk -> skip by its size
  }
  return { audio:new Uint8Array(out), rate:rate, ch:ch };
}
// trim leading/trailing near-silence (keeps a little padding) for tight highlight sync
function CODEC_trimSilence(pcm){
  var thr=0.012, a=0, b=pcm.length;
  while(a<b && Math.abs(pcm[a])<thr) a++;
  while(b>a && Math.abs(pcm[b-1])<thr) b--;
  a=Math.max(0,a-2000); b=Math.min(pcm.length,b+2000);
  return (a===0&&b===pcm.length)?pcm:pcm.subarray(a,b);
}
function CODEC_ensureCtx(){ if(!CODEC_vox.ctx){ CODEC_vox.ctx=new (window.AudioContext||window.webkitAudioContext)(); } return CODEC_vox.ctx; }
// read a clip's bytes (on demand) and decode -> AudioBuffer
function CODEC_loadClip(voxcode, cb){
  if(!CODEC_vox.file || !voxcode){ cb(null); return; }     // skip vox 0 ("no voice")
  if(!CODEC_vox.voxList){                                   // sorted voxcodes -> each clip's max length
    var set={}; (CODEC_state.convs||[]).forEach(function(c){ (c.lines||[]).forEach(function(l){ if(l.vox) set[l.vox]=1; }); });
    CODEC_vox.voxList=Object.keys(set).map(Number).sort(function(a,b){return a-b;});
  }
  var list=CODEC_vox.voxList, allocSec=512, vi=list.indexOf(voxcode);
  if(vi>=0 && vi+1<list.length){ allocSec=list[vi+1]-voxcode; if(allocSec<1) allocSec=512; }
  var off=voxcode*2048, CH=Math.min(allocSec*2048, 2*1024*1024);   // bound to THIS clip (don't bleed into next)
  var blob=CODEC_vox.file.slice(off, off+CH);
  blob.arrayBuffer().then(function(ab){
    var ex=CODEC_extractVoxAudio(new Uint8Array(ab));      // {audio, rate, ch} from tags + 0x02 header
    var audio=ex.audio, rate=ex.rate||CODEC_vox.rate, ch=ex.ch||1;
    if(!audio.length){ cb(null); return; }
    var chans;
    if(ch===2){
      // stereo: de-interleave 4096-byte blocks, decode each channel with its own predictor
      var INTL=4096, nb=Math.floor(audio.length/INTL), half=Math.ceil(nb/2);
      var A=new Uint8Array(half*INTL), B=new Uint8Array(half*INTL), ai=0, bi=0, bk;
      for(bk=0; bk<nb; bk++){ var seg=audio.subarray(bk*INTL,(bk+1)*INTL); if(bk%2===0){ A.set(seg,ai); ai+=INTL; } else { B.set(seg,bi); bi+=INTL; } }
      chans=[ CODEC_decodeAdpcm(A.subarray(0,ai),0), CODEC_decodeAdpcm(B.subarray(0,bi),0) ];
    } else {
      chans=[ CODEC_decodeAdpcm(audio,0) ];
    }
    // trim near-silence using channel 0 bounds; apply the same window to all channels (keeps L/R aligned)
    var c0=chans[0], thr=0.012, a=0, b=c0.length;
    while(a<b && Math.abs(c0[a])<thr) a++;
    while(b>a && Math.abs(c0[b-1])<thr) b--;
    a=Math.max(0,a-2000); b=Math.min(c0.length,b+2000);
    if(b<=a){ cb(null); return; }
    var len=b-a, ctx=CODEC_ensureCtx();
    var buf=ctx.createBuffer(chans.length, len, rate);
    for(var ci=0; ci<chans.length; ci++) buf.getChannelData(ci).set(chans[ci].subarray(a,b));
    var pcm=buf.getChannelData(0);
    // fine smoothed energy envelope (10ms) for word-boundary placement (from channel 0)
    var W=0.01, ew=Math.max(1,Math.floor(rate*W)), K=Math.ceil(pcm.length/ew), env=new Float32Array(K), mx=0, i,j,o,s,v;
    for(i=0;i<K;i++){ s=0; o=i*ew; for(j=0;j<ew&&o+j<pcm.length;j++){ v=pcm[o+j]; s+=v*v; } var r=Math.sqrt(s/ew); env[i]=r; if(r>mx)mx=r; }
    if(mx>0) for(i=0;i<K;i++) env[i]/=mx;
    var sm=new Float32Array(K); for(i=0;i<K;i++) sm[i]=(i>0&&i<K-1)?(env[i-1]+env[i]+env[i+1])/3:env[i];
    cb({buf:buf, env:sm, W:W});
  }).catch(function(){ cb(null); });
}
// place per-word start times: distribute over the VOICED span only (skip trailing
// silence so words don't crawl), snapping each boundary to a real gap onset or an
// energy dip between words.
function CODEC_wordStarts(env, W, N, dur){
  if(N<=1) return [0];
  var K=env.length, thr=0.08, vs=0, ve=K-1, k, i;
  while(vs<K && env[vs]<thr) vs++;
  while(ve>vs && env[ve]<thr) ve--;
  if(ve<=vs){ var a=[]; for(k=0;k<N;k++) a.push(k/N*dur); return a; }
  var starts=[vs*W], minw=Math.max(1,Math.floor(0.06/W));
  for(k=1;k<N;k++){
    var target=vs+(ve-vs)*k/N, r=Math.max(2,Math.floor((ve-vs)/N/2));
    var lo=Math.max(vs,Math.floor(target-r)), hi=Math.min(ve,Math.floor(target+r)), vi=lo;
    for(i=lo;i<=hi;i++) if(env[i]<env[vi]) vi=i;
    var bnd;
    if(env[vi]<thr){ var jj=vi; while(jj<ve && env[jj]<thr) jj++; bnd=jj; }   // real gap -> next onset
    else bnd=vi;                                                              // continuous -> the dip
    var prevW=starts[starts.length-1]/W;
    if(bnd<=prevW+minw) bnd=Math.floor(prevW)+minw;                           // keep increasing
    starts.push(bnd*W);
  }
  return starts;
}
// play one clip; highlight words in sync with the audio's energy (not flat time)
// detect speech bursts from the envelope (one burst ~= one spoken line)
function CODEC_burstsFromEnv(env, W){
  var K=env.length, i;
  // adaptive threshold between the noise floor and the peak, so quiet lines in a long
  // multi-line clip still register (a fixed % of peak misses them and clusters the box).
  var sorted=Array.prototype.slice.call(env).sort(function(a,b){return a-b;});
  var floor=sorted[Math.floor(K*0.2)]||0, peak=sorted[K-1]||1;
  var thr=floor+(peak-floor)*0.12; if(thr<0.04) thr=0.04;
  var segs=[]; i=0;
  while(i<K){ if(env[i]>thr){ var st=i; while(i<K && env[i]>thr) i++; segs.push([st,i]); } else i++; }
  var merged=[];
  for(var q=0;q<segs.length;q++){ var s=segs[q];
    if(merged.length && (s[0]-merged[merged.length-1][1])*W<0.18) merged[merged.length-1][1]=s[1];
    else merged.push([s[0],s[1]]); }
  merged=merged.filter(function(g){ return (g[1]-g[0])*W>=0.06; });
  return merged.map(function(g){ return [g[0]*W, g[1]*W]; });
}
// line windows that ALWAYS span the whole clip: distribute by each line's text length
// (longer line = more time), then snap boundaries to detected pauses for accuracy.
// This cannot race ahead, because the last line's window ends exactly at the clip end.
function CODEC_lineWindows(env, W, chars, dur){
  var L=chars.length, total=0, i, k;
  for(i=0;i<L;i++) total+=Math.max(1,chars[i]);
  var bnd=[0], acc=0;
  for(k=0;k<L;k++){ acc+=Math.max(1,chars[k]); bnd.push(dur*acc/total); }
  var onsets=CODEC_burstsFromEnv(env,W).map(function(b){return b[0];});   // speech onsets
  for(k=1;k<L;k++){
    var t=bnd[k], best=-1, bd=1e9;
    for(i=0;i<onsets.length;i++){ var dd=Math.abs(onsets[i]-t); if(dd<bd){bd=dd;best=onsets[i];} }
    if(best>=0 && bd<=1.2 && best>bnd[k-1]+0.15 && best<bnd[k+1]-0.15) bnd[k]=best;  // snap to a real pause
  }
  for(k=1;k<=L;k++) if(bnd[k]<=bnd[k-1]) bnd[k]=Math.min(dur,bnd[k-1]+0.05);
  var win=[]; for(k=0;k<L;k++) win.push([bnd[k], bnd[k+1]]);
  return win;
}
// play one voice clip that spans a GROUP of text lines; move the box line-by-line,
// highlight words within the active line. (One recording = several lines in MGS codec.)
function CODEC_playGroup(group, res, onend){
  var ctx=CODEC_ensureCtx(); var src=ctx.createBufferSource(); src.buffer=res.buf; src.connect(ctx.destination); CODEC_vox.src=src;
  var L=group.lis.length, dur=res.buf.duration, i;
  var els=group.lis.map(function(li){ return document.querySelector('#codecEdit .codecLine[data-li="'+li+'"]'); });
  var cl=(CODEC_state.convs[CODEC_state.sel]||{}).lines||[];
  var chars=group.lis.map(function(li){ var ln=cl[li]; var tx=(ln&&ln.orig)?ln.orig.replace(/\|/g,' '):''; return Math.max(1,tx.replace(/\s+/g,' ').trim().length); });
  var lineWin=CODEC_lineWindows(res.env, res.W, chars, dur);   // spans full clip, snapped to pauses
  // hand the amplitude envelope to the portrait animator for mouth flapping
  CODEC_anim.env=res.env; CODEC_anim.W=res.W;
  CODEC_anim.envMax=1e-6; for(i=0;i<res.env.length;i++) if(res.env[i]>CODEC_anim.envMax) CODEC_anim.envMax=res.env[i];
  var startT=ctx.currentTime, curLine=-1;
  function clearGroup(){ els.forEach(function(el){ if(el) el.style.outline='none'; }); }
  if(CODEC_vox.hlTimer) clearInterval(CODEC_vox.hlTimer);
  CODEC_vox.hlTimer=setInterval(function(){
    if(!CODEC_vox.playing) return;
    var t=ctx.currentTime-startT, k=0, j;
    for(j=0;j<L;j++){ if(t>=lineWin[j][0]) k=j; else break; }
    if(k!==curLine){                                          // advance green box + preview to the active line
      els.forEach(function(el,ki){ if(el) el.style.outline=(ki===k)?'2px solid #2a6':'none'; });
      if(els[k]) els[k].scrollIntoView({block:'nearest'});
      CODEC_previewLine(CODEC_state.convs[CODEC_state.sel], group.lis[k]);
      curLine=k;
    }
    // mouth of the active speaker follows the voice amplitude
    var lnA=cl[group.lis[k]];
    if(lnA) CODEC_animMouth(t, (lnA.actor===0x21ca)?'codecFaceR':'codecFaceL');
  }, 25);
  src.onended=function(){ if(CODEC_vox.hlTimer){clearInterval(CODEC_vox.hlTimer);CODEC_vox.hlTimer=null;} clearGroup(); onend&&onend(); };
  src.start();
}
function CODEC_stopVox(){ CODEC_vox.playing=false;
  CODEC_animEnd();
  if(CODEC_vox.hlTimer){clearInterval(CODEC_vox.hlTimer);CODEC_vox.hlTimer=null;}
  try{ if(CODEC_vox.src) CODEC_vox.src.stop(); }catch(e){}
  document.querySelectorAll('#codecEdit .codecLine').forEach(function(el){ el.style.outline='none'; });
  CODEC_previewReset();
  var b=document.getElementById('codecPlayBtn'); if(b) b.textContent='\u25b6 Play';
}
function CODEC_playCall(){
  if(!CODEC_vox.file){ alert('Load VOX.DAT first (button in the header).'); return; }
  var c=CODEC_state.convs[CODEC_state.sel]; if(!c) return;
  // build voice GROUPS: consecutive lines that share one clip (one recording = several text lines)
  CODEC_vox.queue=[]; var curG=null;
  c.lines.forEach(function(ln,li){
    if(!ln.vox){ curG=null; return; }                                  // text-only line ends a group
    if(curG && curG.vg===ln.voxGroup && curG.vox===ln.vox) curG.lis.push(li);
    else { curG={vg:ln.voxGroup, vox:ln.vox, lis:[li]}; CODEC_vox.queue.push(curG); }
  });
  if(!CODEC_vox.queue.length){ alert('This call has no voiced lines (text-only).'); return; }
  CODEC_vox.qi=0; CODEC_vox.playing=true;
  CODEC_animBegin();
  var b=document.getElementById('codecPlayBtn'); if(b) b.textContent='\u23f8 Pause';
  CODEC_ensureCtx().resume&&CODEC_ensureCtx().resume();
  CODEC_step();
}
function CODEC_step(){
  if(!CODEC_vox.playing) return;
  if(CODEC_vox.qi>=CODEC_vox.queue.length){ CODEC_stopVox(); return; }
  var g=CODEC_vox.queue[CODEC_vox.qi];
  CODEC_loadClip(g.vox, function(res){
    if(!CODEC_vox.playing) return;
    if(!res){ CODEC_vox.qi++; CODEC_step(); return; }   // skip undecodable
    CODEC_playGroup(g, res, function(){ CODEC_vox.qi++; CODEC_step(); });
  });
}
function CODEC_togglePlay(){
  if(CODEC_vox.playing){ // pause
    CODEC_vox.playing=false; var ctx=CODEC_vox.ctx; if(ctx&&ctx.suspend) ctx.suspend();
    if(CODEC_vox.hlTimer){clearInterval(CODEC_vox.hlTimer);CODEC_vox.hlTimer=null;}
    var b=document.getElementById('codecPlayBtn'); if(b) b.textContent='\u25b6 Play';
  } else if(CODEC_vox.ctx && CODEC_vox.ctx.state==='suspended' && CODEC_vox.src){ // resume
    CODEC_vox.playing=true; CODEC_vox.ctx.resume();
    var b2=document.getElementById('codecPlayBtn'); if(b2) b2.textContent='\u23f8 Pause';
  } else { CODEC_playCall(); }
}

// ---- VOX splice: replace a clip's audio in place (SPU-ADPCM encode) ---------
// Encode PCM(Float -1..1) -> SPU-ADPCM. Brute-force best filter+shift per frame
// using real decoder feedback (validated ~ round-trip clean).
function CODEC_encodeAdpcm(pcm){
  var POS=CODEC_ADPCM_POS, NEG=CODEC_ADPCM_NEG;
  var nb=Math.ceil(pcm.length/28), out=new Uint8Array(nb*16), h1=0,h2=0, oi=0, i,f,sh;
  var blk=new Int32Array(28);
  for(var bi=0;bi<nb;bi++){
    for(i=0;i<28;i++){ var idx=bi*28+i; var v=idx<pcm.length?pcm[idx]:0; v=Math.round(v*32768); blk[i]=v>32767?32767:(v<-32768?-32768:v); }
    var best=null;
    for(f=0;f<5;f++) for(sh=0;sh<13;sh++){
      var p1=h1,p2=h2,err=0,scale=1<<(12-sh),nibs=new Int8Array(28);
      for(i=0;i<28;i++){ var s=blk[i], pred=(POS[f]*p1+NEG[f]*p2)>>6, r=s-pred;
        var q=Math.round(r/scale); if(q>7)q=7; else if(q<-8)q=-8; nibs[i]=q;
        var dq=q<<12; if(dq&0x8000)dq|=0xffff0000>>0; dq>>=sh; var rec=pred+dq; if(rec>32767)rec=32767; else if(rec<-32768)rec=-32768;
        var d=rec-s; err+=d*d; p2=p1; p1=rec; }
      if(best===null||err<best.err){ best={err:err,f:f,sh:sh,nibs:nibs,p1:p1,p2:p2}; }
    }
    h1=best.p1; h2=best.p2;
    out[oi++]=(best.f<<4)|best.sh; out[oi++]=0x02;/* SPU 'repeat' flag on every block (MGS streaming VOX); never emit lone End(0x01) */
    for(i=0;i<14;i++) out[oi++]=(best.nibs[i*2]&0xf)|((best.nibs[i*2+1]&0xf)<<4);
  }
  return out;
}
// decode any uploaded audio -> mono Float32 resampled to the VOX rate
function CODEC_resample(pcm, inR, outR){
  if(inR===outR || !pcm.length) return pcm;
  var outLen=Math.floor(pcm.length*outR/inR), res=new Float32Array(outLen);
  for(var k=0;k<outLen;k++){ var pos=k*inR/outR, i0=Math.floor(pos), fr=pos-i0, a=pcm[i0]||0, b=pcm[i0+1]||a; res[k]=a+(b-a)*fr; }
  return res;
}
// pad an ADPCM byte stream up to a multiple of `block` bytes with silent frames (00 02 + zeros)
function CODEC_padAdpcm(adpcm, block){
  var rem=adpcm.length % block; if(rem===0) return adpcm;
  var out=new Uint8Array(adpcm.length + (block-rem)); out.set(adpcm);
  for(var i=adpcm.length;i<out.length;i+=16){ out[i]=0; out[i+1]=0x02; }
  return out;
}
// decode a user audio file, keeping up to 2 channels + its own sample rate (resample happens at splice time to match the target clip)
function CODEC_importAudio(file, cb){
  file.arrayBuffer().then(function(ab){
    var ctx=CODEC_ensureCtx();
    ctx.decodeAudioData(ab.slice(0), function(audioBuf){
      var nc=Math.min(2,audioBuf.numberOfChannels), chans=[], c;
      for(c=0;c<nc;c++) chans.push(audioBuf.getChannelData(c).slice(0));
      cb({chans:chans, rate:audioBuf.sampleRate});
    }, function(){ cb(null); });
  }).catch(function(){ cb(null); });
}
// replace a clip in place: encode new audio, fit into the original type-0x01 chunks
// (pad with silence). Records byte patches; never modifies file size/offsets.
function CODEC_spliceClip(voxcode, src, cb){
  var base=voxcode*2048, CH=1024*1024;
  CODEC_vox.file.slice(base, base+CH).arrayBuffer().then(function(ab){
    var u8=new Uint8Array(ab), chunks=[], p=0, targetRate=CODEC_vox.rate, targetCh=1;
    while(p+4<=u8.length){ var tag=(u8[p]|(u8[p+1]<<8)|(u8[p+2]<<16)|(u8[p+3]<<24))>>>0, t=tag&0xFF, sz=tag>>>8;
      if(t===0x02){ var cls=u8[p+10]||8; targetCh=(u8[p+12]===2)?2:1; targetRate=Math.round(cls*44100/16); if(sz<4||p+sz>u8.length)break; p+=sz; continue; }
      if(sz<4||p+sz>u8.length) break;
      if(t===0x01) chunks.push({off:p+4, len:sz-4});
      if(t===0xf0||t===0xff) break;
      p+=sz; }
    if(!chunks.length){ cb(false,'no audio chunks at this clip'); return; }
    var capacity=chunks.reduce(function(s,c){return s+c.len;},0), adpcm, i;
    if(targetCh===2){
      var INTL=4096;
      var L=CODEC_resample(src.chans[0], src.rate, targetRate);
      var R=CODEC_resample(src.chans[1]||src.chans[0], src.rate, targetRate);   // dup mono -> stereo
      var encL=CODEC_padAdpcm(CODEC_encodeAdpcm(L), INTL);
      var encR=CODEC_padAdpcm(CODEC_encodeAdpcm(R), INTL);
      var nB=Math.max(encL.length,encR.length)/INTL;                            // blocks per channel
      function padTo(e){ if(e.length>=nB*INTL) return e; var o=new Uint8Array(nB*INTL); o.set(e); for(var j=e.length;j<o.length;j+=16){o[j]=0;o[j+1]=0x02;} return o; }
      encL=padTo(encL); encR=padTo(encR);
      adpcm=new Uint8Array(nB*INTL*2);                                          // interleave L,R by 4096-byte blocks
      for(var bi=0;bi<nB;bi++){ adpcm.set(encL.subarray(bi*INTL,(bi+1)*INTL), bi*2*INTL); adpcm.set(encR.subarray(bi*INTL,(bi+1)*INTL), (bi*2+1)*INTL); }
    } else {
      var mono;
      if(src.chans.length>1){ var n=src.chans[0].length; mono=new Float32Array(n); for(i=0;i<n;i++) mono[i]=(src.chans[0][i]+(src.chans[1][i]||0))/2; }
      else mono=src.chans[0];
      adpcm=CODEC_encodeAdpcm(CODEC_resample(mono, src.rate, targetRate));
    }
    if(adpcm.length>capacity){ cb(false,'too long: '+(adpcm.length/1024).toFixed(1)+'KB encoded vs '+(capacity/1024).toFixed(1)+'KB room ('+(targetCh===2?'stereo':'mono')+' @'+targetRate+'Hz). Trim shorter.'); return; }
    CODEC_vox.patches=CODEC_vox.patches||[];
    var ai=0;
    for(var ci=0;ci<chunks.length;ci++){ var c=chunks[ci], buf=new Uint8Array(c.len);
      for(var b=0;b<c.len;b++){ buf[b]=(ai<adpcm.length)?adpcm[ai]:0; ai++; }
      for(var fb=1;fb<c.len;fb+=16) if(buf[fb]===0) buf[fb]=0x02;   // repeat flag on silence-padding frames
      CODEC_vox.patches.push({off:base+c.off, bytes:buf});
    }
    cb(true, (adpcm.length/1024).toFixed(1)+'/'+(capacity/1024).toFixed(1)+'KB '+(targetCh===2?'stereo':'mono')+' @'+targetRate+'Hz');
  }).catch(function(){ cb(false,'read error'); });
}
function CODEC_b64(u8){ var s=''; for(var i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); }
// export a self-contained Python patcher (avoids loading the 190MB VOX.DAT in-browser)
function CODEC_exportVoxPatch(){
  if(!CODEC_vox.patches||!CODEC_vox.patches.length){ alert('No spliced clips queued. Use \uD83C\uDFA4 on a voiced line first.'); return; }
  var lines=CODEC_vox.patches.map(function(p){ return '    ('+p.off+', "'+CODEC_b64(p.bytes)+'"),'; }).join('\n');
  var py='#!/usr/bin/env python3\n# Apply spliced VOX clips to VOX.DAT in place. Run next to VOX.DAT.\n'+
    'import base64\nPATCHES = [\n'+lines+'\n]\n'+
    'with open("VOX.DAT","r+b") as f:\n'+
    '    for off, b in PATCHES:\n'+
    '        f.seek(off); f.write(base64.b64decode(b))\n'+
    'print("applied", len(PATCHES), "patch chunks to VOX.DAT")\n';
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([py],{type:'text/x-python'}));
  a.download='apply_vox_patch.py'; document.body.appendChild(a); a.click(); a.remove();
}
// ---- VOX Clip tool: play / export / replace ANY clip by sector (voxcode) ----
// Scan lists every clip; or enter a sector directly. Reuses the full engine
// (loadClip / importAudio / spliceClip / wavFromBuffer / exportVoxPatch).
function CODEC_openVoxTool(){
  if(document.getElementById('voxToolOv')) return;
  var ov=document.createElement('div'); ov.id='voxToolOv';
  ov.style.cssText='position:fixed;inset:0;z-index:10005;background:rgba(3,5,8,0.85);display:flex;align-items:center;justify-content:center;font-family:monospace';
  ov.innerHTML='<div style="background:#0a1015;border:1px solid #2a7;border-radius:8px;padding:18px;width:460px;color:#bfe">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="color:#7fffce">\uD83D\uDD0A VOX Clip Tool</b><button id="vtClose" style="background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:3px 9px;cursor:pointer">\u2715</button></div>'
    +'<div style="font-size:11px;color:#8ac;line-height:1.5;margin-bottom:12px">Play, export, or replace <b>any clip in VOX.DAT</b>. Click <b>Scan all clips</b> to list every clip, or type a sector directly.</div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><label style="font-size:11px;color:#9fd">Sector <input id="vtSector" type="number" min="0" style="width:120px;background:#08140e;color:#dfe;border:1px solid #1a3a2a;padding:5px;font-family:monospace"></label>'
    +'<button id="vtPlay" style="background:#12303f;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:5px 12px;cursor:pointer">\u25b6 Play</button>'
    +'<button id="vtStop" style="background:#222;color:#ccc;border:1px solid #555;border-radius:4px;padding:5px 12px;cursor:pointer">\u23f9 Stop</button>'
    +'<button id="vtExportWav" style="background:#1d3a26;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:5px 12px;cursor:pointer">\uD83C\uDFB5 Export WAV</button></div>'
    +'<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><button id="vtScan" style="background:#2a2438;color:#cbf;border:1px solid #75c;border-radius:4px;padding:5px 12px;cursor:pointer">\uD83D\uDD0D Scan all clips</button><label style="font-size:11px;color:#9fd;cursor:pointer"><input id="vtShort" type="checkbox"> short only (&lt;2.2s)</label></div>'
    +'<input id="vtSearch" type="text" placeholder="\uD83D\uDD0E search line or speaker (e.g. mei ling, don\u2019t die)" style="width:100%;box-sizing:border-box;background:#08140e;color:#dfe;border:1px solid #1a3a2a;padding:6px;margin-bottom:8px;font-family:monospace;font-size:11px">'
    +'<div id="vtList" style="max-height:220px;overflow:auto;border:1px solid #14301f;border-radius:4px;margin-bottom:10px"></div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><label style="flex:1;font-size:11px;color:#9fd;border:1px dashed #2a7;border-radius:4px;padding:8px;text-align:center;cursor:pointer">\uD83C\uDFA4 Replace with audio\u2026<input id="vtFile" type="file" accept="audio/*" style="display:none"></label>'
    +'<button id="vtExport" style="background:#1d3a26;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:8px 12px;cursor:pointer">\uD83D\uDCBE Export patcher</button></div>'
    +'<div id="vtInfo" style="font-size:11px;color:#6a8;min-height:16px"></div>'
    +'</div>';
  document.body.appendChild(ov);
  var info=function(t){ document.getElementById('vtInfo').innerHTML=t; };
  var sectorOf=function(){ return parseInt(document.getElementById('vtSector').value,10)||0; };
  var close=function(){ try{CODEC_stopVox();}catch(e){} document.removeEventListener('keydown',CODEC_vox.onKey); ov.remove(); };
  document.getElementById('vtClose').onclick=close;
  ov.onclick=function(e){ if(e.target===ov) close(); };
  document.getElementById('vtPlay').onclick=function(){
    if(!CODEC_vox.file){ info('<span style="color:#e77">Load VOX.DAT in the header first.</span>'); return; }
    var vc=sectorOf(); if(!vc){ info('Enter a non-zero sector.'); return; }
    info('decoding sector '+vc+'\u2026');
    CODEC_loadClip(vc, function(res){
      if(!res){ info('<span style="color:#e77">No decodable clip at sector '+vc+'.</span>'); return; }
      try{ if(CODEC_vox.src) CODEC_vox.src.stop(); }catch(e){}
      var ctx=CODEC_ensureCtx(); if(ctx.resume) ctx.resume();
      var s=ctx.createBufferSource(); s.buffer=res.buf; s.connect(ctx.destination); CODEC_vox.src=s; s.start();
      info('\u25b6 playing sector '+vc+' \u00b7 '+res.buf.duration.toFixed(2)+'s');
    });
  };
  document.getElementById('vtStop').onclick=function(){ try{ if(CODEC_vox.src) CODEC_vox.src.stop(); }catch(e){} info('stopped'); };
  var vtQueueBadge=function(){
    var n=(CODEC_vox.patches&&CODEC_vox.patches.length)?CODEC_vox.patchedClips||0:0;
    document.getElementById('vtExport').textContent='\uD83D\uDCBE Export patcher'+(n?' ('+n+' clip'+(n===1?'':'s')+')':'');
  };
  vtQueueBadge();
  document.getElementById('vtFile').onchange=function(ev){
    var f=ev.target.files[0];
    // CRITICAL: reset so selecting the SAME file for the next clip still fires
    // this handler (browsers suppress `change` when the value is unchanged --
    // this is what silently dropped every replacement after the first when
    // reusing one audio file across multiple slots).
    ev.target.value='';
    if(!f) return;
    if(!CODEC_vox.file){ info('<span style="color:#e77">Load VOX.DAT first.</span>'); return; }
    var vc=sectorOf(); if(!vc){ info('Enter a non-zero sector.'); return; }
    info('encoding '+f.name+'\u2026');
    CODEC_importAudio(f, function(pcm){
      if(!pcm){ info('<span style="color:#e77">Couldn\u2019t decode that audio file.</span>'); return; }
      CODEC_spliceClip(vc, pcm, function(ok,msg){
        if(ok){ CODEC_vox.patchedClips=(CODEC_vox.patchedClips||0)+1; vtQueueBadge(); }
        info(ok?'\u2705 queued sector '+vc+' ('+msg+') \u2014 '+(CODEC_vox.patchedClips||1)+' clip(s) queued, Export patcher when done':'<span style="color:#e77">\u274c '+msg+'</span>');
      });
    });
  };
  document.getElementById('vtExport').onclick=CODEC_exportVoxPatch;
  document.getElementById('vtExportWav').onclick=function(){
    if(!CODEC_vox.file){ info('<span style="color:#e77">Load VOX.DAT first.</span>'); return; }
    var vc=sectorOf(); if(!vc){ info('Enter or pick a sector first.'); return; }
    info('decoding sector '+vc+'\u2026');
    CODEC_loadClip(vc, function(res){
      if(!res){ info('<span style="color:#e77">No decodable clip at sector '+vc+'.</span>'); return; }
      var blob=CODEC_wavFromBuffer(res.buf, CODEC_vox.rate);
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='vox_'+vc+'_'+res.buf.sampleRate+'hz_'+(res.buf.numberOfChannels===2?'stereo':'mono')+'_'+res.buf.duration.toFixed(1)+'s.wav';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      info('\uD83C\uDFB5 exported sector '+vc+' \u2192 WAV');
    });
  };
  document.getElementById('vtScan').onclick=CODEC_voxScan;
  document.getElementById('vtShort').onchange=CODEC_voxRenderList;
  document.getElementById('vtSearch').oninput=CODEC_voxRenderList;
  if(CODEC_vox.clips) CODEC_voxRenderList();
  // up/down arrows step through the clip list (highlight + autoplay). Ignore when typing in the sector field.
  CODEC_vox.onKey=function(e){
    if(!document.getElementById('voxToolOv')) return;
    if((e.target.tagName||'').toLowerCase()==='input') return;
    if(e.key==='ArrowDown'){ e.preventDefault(); CODEC_voxSelect((CODEC_vox.selIdx<0?-1:CODEC_vox.selIdx)+1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); CODEC_voxSelect((CODEC_vox.selIdx<0?1:CODEC_vox.selIdx)-1); }
  };
  document.addEventListener('keydown',CODEC_vox.onKey);
}
// Walk the whole loaded VOX.DAT and index every clip (start sector = voxcode).
// Clip = GCL-typed header + 0x01 audio chunks + 0xf0 end, padded to next sector.
function CODEC_voxScan(){
  var infoEl=document.getElementById('vtInfo');
  if(!CODEC_vox.file){ infoEl.innerHTML='<span style="color:#e77">Load VOX.DAT first.</span>'; return; }
  infoEl.textContent='scanning VOX.DAT ('+((CODEC_vox.file.size/1048576)|0)+'MB)\u2026';
  CODEC_vox.file.arrayBuffer().then(function(ab){
    var d=new Uint8Array(ab), N=d.length, SEC=2048, clips=[], sec=0;
    function u32(o){ return (d[o]|(d[o+1]<<8)|(d[o+2]<<16)|(d[o+3]<<24))>>>0; }
    while(sec*SEC<N){
      var off=sec*SEC, p=off, audio=0, nch=0;
      while(p+4<=N){
        var tag=u32(p), t=tag&0xFF, sz=tag>>>8;
        if(t===0x01){ if(sz<4||p+sz>N) break; audio+=sz-4; nch++; p+=sz; continue; }
        if(t===0xf0){ p+=4; break; }
        if(t===0xff) break;
        if(t===0x00||sz<4) break;
        if(p+sz>N) break;
        p+=sz;
      }
      if(nch>0) clips.push({sec:sec, off:off, dur:audio/16*28/22050, ch:nch});
      var nsec=Math.ceil(p/SEC); sec = nsec>sec ? nsec : sec+1;
    }
    // second pass: extract embedded caption text + speaker char-ID for each clip
    var IDS=[[0x9475,'Naomi'],[0xd78a,'MeiLing'],[0x6588,'Campbell'],[0x95f2,'Meryl'],[0x21ca,'Snake']];
    for(var ci=0;ci<clips.length;ci++){
      var a=clips[ci].off, b=(ci+1<clips.length?clips[ci+1].off:N);
      var best='', cur='', naomi=0,mei=0,camp=0,meryl=0,snake=0;
      for(var q=a;q<b;q++){
        var ch=d[q];
        if(ch>=0x20&&ch<0x7f){ cur+=String.fromCharCode(ch); if(cur.length>240) cur=cur.slice(-240); }
        else { if(cur.length>best.length && cur.indexOf(' ')>=0 && /[a-zA-Z]{4}/.test(cur)) best=cur; cur=''; }
        if(q+1<b){ var pr=(d[q]<<8)|d[q+1]; if(pr===0x9475)naomi=1; else if(pr===0xd78a)mei=1; else if(pr===0x6588)camp=1; else if(pr===0x95f2)meryl=1; else if(pr===0x21ca)snake=1; }
      }
      if(cur.length>best.length && cur.indexOf(' ')>=0) best=cur;
      var sp=[]; if(naomi)sp.push('Naomi'); if(mei)sp.push('MeiLing'); if(camp)sp.push('Campbell'); if(meryl)sp.push('Meryl'); if(snake)sp.push('Snake');
      clips[ci].cap=best.trim().slice(0,70); clips[ci].spk=sp.join('/');
    }
    CODEC_vox.clips=clips; CODEC_voxRenderList();
    infoEl.textContent='found '+clips.length+' clips \u2014 search a line/speaker above, or arrow-key through';
  }).catch(function(){ infoEl.innerHTML='<span style="color:#e77">scan failed (file too large for this browser?)</span>'; });
}
function CODEC_voxRenderList(){
  var list=document.getElementById('vtList'); if(!list||!CODEC_vox.clips) return;
  var shortOnly=document.getElementById('vtShort') && document.getElementById('vtShort').checked;
  var sEl=document.getElementById('vtSearch'); var q=(sEl&&sEl.value||'').toLowerCase().trim();
  var rows=CODEC_vox.clips.filter(function(c){
    if(shortOnly && c.dur>=2.2) return false;
    if(q){ var hay=((c.cap||'')+' '+(c.spk||'')+' '+c.sec).toLowerCase(); if(hay.indexOf(q)<0) return false; }
    return true;
  });
  CODEC_vox.rows=rows; CODEC_vox.selIdx=-1;
  list.innerHTML=rows.map(function(c,i){
    var mid=(c.spk?'<b style="color:#e0a">'+c.spk+'</b> ':'')+(c.cap?('<span style="color:#bcd">'+c.cap.replace(/</g,'&lt;')+'</span>'):'<span style="color:#556">(no caption)</span>');
    return '<div class="vtRow" data-i="'+i+'" data-sec="'+c.sec+'" style="display:flex;align-items:center;gap:8px;padding:3px 8px;border-bottom:1px solid #12251a;cursor:pointer;font-size:11px">'
      +'<span style="color:#9fd;min-width:64px">sec '+c.sec+'</span>'
      +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+mid+'</span>'
      +'<span style="color:#6a8;min-width:34px;text-align:right">'+c.dur.toFixed(1)+'s</span></div>';
  }).join('') || '<div style="padding:8px;color:#6a8;font-size:11px">no matches</div>';
  Array.prototype.forEach.call(list.querySelectorAll('.vtRow'), function(r){
    r.onmouseenter=function(){ if(+r.getAttribute('data-i')!==CODEC_vox.selIdx) r.style.background='#0f1e15'; };
    r.onmouseleave=function(){ if(+r.getAttribute('data-i')!==CODEC_vox.selIdx) r.style.background=''; };
    r.onclick=function(){ CODEC_voxSelect(+r.getAttribute('data-i')); };
  });
}
// select a clip: highlight it, scroll into view, set the sector, and autoplay.
function CODEC_voxSelect(i){
  var rows=CODEC_vox.rows; if(!rows||!rows.length) return;
  if(i<0) i=0; if(i>=rows.length) i=rows.length-1;
  CODEC_vox.selIdx=i;
  var list=document.getElementById('vtList'); if(!list) return;
  Array.prototype.forEach.call(list.querySelectorAll('.vtRow'), function(r){
    var sel=(+r.getAttribute('data-i')===i);
    r.style.background=sel?'#1c3a28':''; r.style.outline=sel?'1px solid #2a7':'';
    if(sel) r.scrollIntoView({block:'nearest'});
  });
  document.getElementById('vtSector').value=rows[i].sec;
  document.getElementById('vtPlay').click();
}

// encode an AudioBuffer (mono) to a 16-bit PCM WAV blob
function CODEC_wavFromBuffer(buf, rate){
  var nc=buf.numberOfChannels||1, n=buf.length, sr=buf.sampleRate||rate||CODEC_vox.rate;
  var chs=[], c; for(c=0;c<nc;c++) chs.push(buf.getChannelData(c));
  var ab=new ArrayBuffer(44+n*nc*2), dv=new DataView(ab), i;
  function ws(o,s){ for(var j=0;j<s.length;j++) dv.setUint8(o+j, s.charCodeAt(j)); }
  ws(0,'RIFF'); dv.setUint32(4,36+n*nc*2,true); ws(8,'WAVE'); ws(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nc,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*nc*2,true); dv.setUint16(32,nc*2,true); dv.setUint16(34,16,true);
  ws(36,'data'); dv.setUint32(40,n*nc*2,true);
  var o=44; for(i=0;i<n;i++){ for(c=0;c<nc;c++){ var s=Math.max(-1,Math.min(1,chs[c][i])); dv.setInt16(o, s<0?s*0x8000:s*0x7fff, true); o+=2; } }
  return new Blob([ab],{type:'audio/wav'});
}
// download the decoded voice clip for a line as WAV
function CODEC_dlClip(li){
  var c=CODEC_state.convs[CODEC_state.sel]; if(!c) return;
  var ln=c.lines[li]; if(!ln||!ln.vox){ alert('No voice clip on this line.'); return; }
  if(!CODEC_vox.file){ alert('Load VOX.DAT first (button in the header).'); return; }
  CODEC_loadClip(ln.vox, function(res){
    if(!res){ alert('Could not decode this clip.'); return; }
    var blob=CODEC_wavFromBuffer(res.buf, CODEC_vox.rate);
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='vox_'+(ln.vox>>>0).toString(16)+'_'+res.buf.sampleRate+'hz_'+res.buf.duration.toFixed(1)+'s.wav';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
}
function CODEC_replaceVoice(li){
  if(!CODEC_vox.file){ alert('Load VOX.DAT first.'); return; }
  var ln=CODEC_state.convs[CODEC_state.sel].lines[li]; if(!ln.vox){ alert('This line has no voice slot.'); return; }
  var inp=document.createElement('input'); inp.type='file'; inp.accept='audio/*';
  inp.onchange=function(){ var f=inp.files[0]; inp.value=''; if(!f) return;
    var info=document.getElementById('codecInfo'); if(info) info.textContent='encoding '+f.name+'\u2026';
    CODEC_importAudio(f, function(pcm){
      if(!pcm){ alert('Could not decode that audio file.'); return; }
      CODEC_spliceClip(ln.vox, pcm, function(ok,msg){
        if(info) info.textContent=(ok?'\u2705 spliced line into VOX patch ('+msg+') \u2014 export when done':'\u274c '+msg);
        if(!ok) alert(msg); else if(CODEC_state.sel>=0) CODEC_renderConv();
      });
    });
  };
  inp.click();
}

function CODEC_faceImg(hash){ return CODEC_state.faces ? CODEC_state.faces.byHash[hash] : null; }

// ---- face artwork import (image -> 256-color indexed + BGR555, in place) -----
function CODEC_bgr555(r,g,b){ return (((b>>3)&0x1f)<<10)|(((g>>3)&0x1f)<<5)|((r>>3)&0x1f); }
function CODEC_quantize(rgba, n){          // median cut -> palette of n [r,g,b]
  var px=[]; for(var i=0;i<rgba.length;i+=4){ if(rgba[i+3]>8) px.push([rgba[i],rgba[i+1],rgba[i+2]]); }
  if(!px.length) px=[[0,0,0]];
  function mkbox(p){ var mn=[255,255,255],mx=[0,0,0]; for(var k=0;k<p.length;k++){var q=p[k];for(var c=0;c<3;c++){if(q[c]<mn[c])mn[c]=q[c];if(q[c]>mx[c])mx[c]=q[c];}} return {p:p,mn:mn,mx:mx,r:Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])}; }
  var boxes=[mkbox(px)];
  while(boxes.length<n){
    boxes.sort(function(a,b){return b.r-a.r;});
    var bx=boxes[0]; if(!bx||bx.p.length<2||bx.r===0) break;
    var ch=0,r0=bx.mx[0]-bx.mn[0],r1=bx.mx[1]-bx.mn[1],r2=bx.mx[2]-bx.mn[2]; if(r1>=r0&&r1>=r2)ch=1; else if(r2>=r0&&r2>=r1)ch=2;
    bx.p.sort(function(a,b){return a[ch]-b[ch];});
    var mid=bx.p.length>>1; boxes.shift(); boxes.push(mkbox(bx.p.slice(0,mid))); boxes.push(mkbox(bx.p.slice(mid)));
  }
  var pal=boxes.map(function(bx){ var s=[0,0,0]; for(var k=0;k<bx.p.length;k++){s[0]+=bx.p[k][0];s[1]+=bx.p[k][1];s[2]+=bx.p[k][2];} var m=bx.p.length||1; return [Math.round(s[0]/m),Math.round(s[1]/m),Math.round(s[2]/m)]; });
  while(pal.length<n) pal.push([0,0,0]);
  return pal;
}
function CODEC_nearest(pal,r,g,b){ var bi=0,bd=1e9; for(var i=0;i<pal.length;i++){ var dr=pal[i][0]-r,dg=pal[i][1]-g,db=pal[i][2]-b,d=dr*dr+dg*dg+db*db; if(d<bd){bd=d;bi=i;} } return bi; }
// import an <img> as new artwork for every occurrence of a face hash (in place)
function CODEC_faceImport(hash, imgEl){
  var face=CODEC_state.faces.byHash[hash]; if(!face) return; var b=CODEC_state.faceBytes;
  face.occ.forEach(function(st){
    var cv=document.createElement('canvas'); cv.width=st.w; cv.height=st.h;
    var ctx=cv.getContext('2d'); ctx.drawImage(imgEl,0,0,st.w,st.h);
    var id=ctx.getImageData(0,0,st.w,st.h).data;
    var pal=CODEC_quantize(id,256);
    var idx=new Uint8Array(st.w*st.h);
    for(var i=0;i<st.w*st.h;i++) idx[i]=CODEC_nearest(pal,id[i*4],id[i*4+1],id[i*4+2]);
    for(var c=0;c<256;c++){ var v=CODEC_bgr555(pal[c][0],pal[c][1],pal[c][2]); b[st.fd+st.palOff+c*2]=v&0xff; b[st.fd+st.palOff+c*2+1]=(v>>8)&0xff; }
    for(var p=0;p<st.w*st.h;p++) b[st.fd+st.bmpOff+4+p]=idx[p];
    ['eyes0','eyes1','eyes2','mouth0','mouth1','mouth2'].forEach(function(k){ var s=st.subs[k]; if(!s) return;
      for(var j=0;j<s.h;j++) for(var ii=0;ii<s.w;ii++){ var sx=s.xo+ii,sy=s.yo+j; b[st.fd+s.rel+4+(j*s.w+ii)]=(sx<st.w&&sy<st.h)?idx[sy*st.w+sx]:0; } });
  });
  var st0=face.occ[0]; face.rgba=CODEC_faceDecode(b,st0,function(o){return b[o]|(b[o+1]<<8);}); face.w=st0.w; face.h=st0.h;
  for(var kk in face){ if(kk.indexOf('_url')===0) delete face[kk]; }
  delete face._animCache;
  for(var sd in CODEC_anim.sides){ if(CODEC_anim.sides[sd]&&CODEC_anim.sides[sd].hash===hash){
    CODEC_anim.sides[sd].cache=CODEC_animCache(face); CODEC_anim.sides[sd].dirty=true; } }
}
function CODEC_faceExport(){
  if(!CODEC_state.faceBytes){ alert('Load FACE.DAT first.'); return; }
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([CODEC_state.faceBytes],{type:'application/octet-stream'}));
  a.download=(CODEC_state.faceName||'FACE.DAT').replace(/\.dat$/i,'')+'_mod.DAT';
  document.body.appendChild(a); a.click(); a.remove();
}
// Face Manager modal: grid of faces, replace artwork, export FACE.DAT
function CODEC_openFaceManager(){
  if(!CODEC_state.faces){ alert('Load FACE.DAT first (button in the header).'); return; }
  var ov=document.createElement('div'); ov.id='codecFaceMgr';
  ov.style.cssText='position:fixed;inset:0;z-index:10003;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center';
  ov.innerHTML='<div style="background:#0a1418;border:1px solid #2a6;border-radius:6px;padding:14px;width:680px;max-height:84vh;display:flex;flex-direction:column">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'+
      '<div style="color:#8fc;font-size:13px;font-weight:bold">\u{1F3A8} Face Artwork Manager</div>'+
      '<span style="color:#6a8;font-size:10px" id="cfmInfo">click a face, then load an image to replace its artwork (kept at its exact size)</span>'+
      '<select id="cfmPngScale" style="margin-left:auto;background:#122;color:#9df;border:1px solid #27a;border-radius:4px;padding:3px 4px;font-size:11px" title="PNG export scale \u2014 nearest-neighbor, crisp pixels. Codec portraits are natively tiny (max 64\u00d796; verified from the game\u2019s VRAM upload code), so 4\u00d7 is a comfortable working size.">'+
        '<option value="1">1\u00d7 native</option><option value="2">2\u00d7</option><option value="4" selected>4\u00d7</option><option value="8">8\u00d7</option>'+
      '</select>'+
      '<button id="cfmExportPng" style="background:#1d2a3a;color:#9df;border:1px solid #27a;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer" title="Save every portrait as a PNG (named by character where known) in one zip">\u{1F5BC} Export all PNGs (zip)</button>'+
      '<button id="cfmExport" style="background:#1d3a26;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">\u{1F4BE} Export FACE.DAT</button>'+
      '<button id="cfmClose" style="background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">\u2715</button>'+
    '</div>'+
    '<div style="display:flex;gap:12px;min-height:0;flex:1">'+
      '<div id="cfmGrid" style="flex:1;overflow:auto;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start"></div>'+
      '<div style="width:200px;flex:none;border-left:1px solid #234;padding-left:12px">'+
        '<div style="color:#8ac;font-size:11px;margin-bottom:6px">Selected face</div>'+
        '<div id="cfmPreview" style="width:104px;height:178px;border:1px solid #243;background:#06100a;margin-bottom:8px;image-rendering:pixelated"></div>'+
        '<div id="cfmSel" style="color:#577;font-size:10px;margin-bottom:8px">none</div>'+
        '<div style="color:#8ac;font-size:10px;margin-bottom:4px">Animation frames</div>'+
        '<div id="cfmParts" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;min-height:24px"></div>'+
        '<label style="display:block;color:#9fd;font-size:11px;border:1px dashed #2a7;border-radius:4px;padding:8px;text-align:center;cursor:pointer">Load image to replace\u2026<input type="file" id="cfmImg" accept="image/*" style="display:none"></label>'+
        '<div style="color:#567;font-size:9px;margin-top:8px">PNG/JPG, any size \u2014 auto-resized &amp; quantized to the codec format. Applies to all stages using this face. Then Export FACE.DAT.</div>'+
      '</div>'+
    '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('#cfmClose').onclick=function(){ ov.remove(); if(CODEC_state.sel>=0) CODEC_renderConv(); };
  ov.querySelector('#cfmExport').onclick=CODEC_faceExport;
  ov.querySelector('#cfmExportPng').onclick=function(){ CODEC_faceExportAllPNGs(this); };
  ov.onclick=function(e){ if(e.target===ov){ ov.remove(); if(CODEC_state.sel>=0) CODEC_renderConv(); } };
  var sel={hash:null};
  function renderGrid(){
    var g=ov.querySelector('#cfmGrid'); var hs=Object.keys(CODEC_state.faces.byHash); var h='';
    hs.forEach(function(hk){ var hsh=+hk, face=CODEC_state.faces.byHash[hk];
      h+='<button class="cfmF" data-h="'+hsh+'" title="0x'+hsh.toString(16)+'" style="width:46px;height:62px;padding:0;border:1px solid '+(sel.hash===hsh?'#2fd':'#243')+';background:#06100a url('+CODEC_faceURL(face,1)+') center/contain no-repeat;cursor:pointer"></button>';
    });
    g.innerHTML=h;
    g.querySelectorAll('.cfmF').forEach(function(btn){ btn.onclick=function(){ sel.hash=+this.getAttribute('data-h'); updateSel(); renderGrid(); }; });
  }
  function updateSel(){
    var face=CODEC_state.faces.byHash[sel.hash];
    ov.querySelector('#cfmSel').textContent=face?('0x'+sel.hash.toString(16)+' \u00b7 '+face.w+'\u00d7'+face.h+' \u00b7 '+face.occ.length+' stage(s)'):'none';
    var pv=ov.querySelector('#cfmPreview'); if(face){ pv.style.background='#06100a url('+CODEC_faceURL(face,2)+') center/contain no-repeat'; }
    // Eyes/mouth animation frames of this face (decoded from occ[0])
    var pb=ov.querySelector('#cfmParts'); pb.innerHTML='';
    if(face&&face.occ.length){
      var st=face.occ[0], b=CODEC_state.faceBytes;
      [['eyes0','E0'],['eyes1','E1'],['eyes2','E2'],['mouth0','M0'],['mouth1','M1'],['mouth2','M2']].forEach(function(pair){
        var s=st.subs[pair[0]]; if(!s) return;
        var img=CODEC_faceDecodeAt(b, st.fd, s.rel, st.palOff);
        var cv=document.createElement('canvas'); cv.width=img.w; cv.height=img.h;
        var ctx=cv.getContext('2d'); var id=ctx.createImageData(img.w,img.h); id.data.set(img.rgba); ctx.putImageData(id,0,0);
        var wrap=document.createElement('div');
        wrap.style.cssText='text-align:center;background:#06100a;border:1px solid #243;padding:2px;border-radius:3px';
        wrap.title=pair[0]+' @ '+img.xo+','+img.yo+' \u00b7 '+img.w+'\u00d7'+img.h;
        cv.style.cssText='image-rendering:pixelated;max-width:44px;max-height:30px;display:block;margin:0 auto';
        var lb=document.createElement('div'); lb.textContent=pair[1]; lb.style.cssText='color:#567;font-size:8px';
        wrap.appendChild(cv); wrap.appendChild(lb); pb.appendChild(wrap);
      });
      if(!pb.children.length) pb.innerHTML='<span style="color:#456;font-size:9px">none in this face</span>';
    }
  }
  ov.querySelector('#cfmImg').onchange=function(ev){ var f=ev.target.files[0]; ev.target.value=''; if(!f||sel.hash==null){ if(sel.hash==null) alert('Pick a face first.'); return; }
    var img=new Image(); img.onload=function(){ CODEC_faceImport(sel.hash,img); updateSel(); renderGrid();
      ov.querySelector('#cfmInfo').textContent='replaced 0x'+sel.hash.toString(16)+' \u2014 export FACE.DAT to save'; };
    img.src=URL.createObjectURL(f); };
  renderGrid();
}

// ---- UI ---------------------------------------------------------------------
function openCodecEditor(){
  if(!CODEC_state._spaceBound){            // spacebar = play/pause while the codec panel is open
    CODEC_state._spaceBound=true;
    document.addEventListener('keydown', function(e){
      if(e.code!=='Space' && e.key!==' ') return;
      var p=CODEC_state.panelEl; if(!p || p.style.display==='none') return;
      var t=e.target, tn=t&&t.tagName;
      if(tn==='INPUT'||tn==='TEXTAREA'||tn==='SELECT'||(t&&t.isContentEditable)) return;
      e.preventDefault(); CODEC_togglePlay();
    });
  }
  if(CODEC_state.panelEl){ CODEC_state.panelEl.style.display='flex'; return; }
  var ov=document.createElement('div'); ov.id='codecEditorPanel';
  ov.style.cssText='position:fixed;inset:0;z-index:10002;background:#05070a;display:flex;flex-direction:column;font-family:monospace;color:#bfe';
  ov.innerHTML=
    '<div style="display:flex;align-items:center;gap:14px;padding:8px 12px;background:#0a1015;border-bottom:1px solid #1a3a2a">'+
      '<div style="font-size:13px;font-weight:bold;color:#7fffce">\u{1F4FB} Codec Editor <span style="color:#9f7;font-size:10px;border:1px solid #4a4;border-radius:3px;padding:0 4px;margin-left:4px">build v75 \u00b7 RADIO+FACE+VOX</span></div>'+
      '<span style="color:#6a8;font-size:11px" id="codecInfo">load RADIO.DAT to list codec conversations</span>'+
      '<label style="color:#8ac;font-size:10px">RADIO.DAT <input type="file" id="codecFile" accept=".dat,.bin" style="font-size:10px"></label>'+
      '<label style="color:#8ac;font-size:10px">FACE.DAT <input type="file" id="codecFaceFile" accept=".dat,.bin" style="font-size:10px"></label>'+
      '<label style="color:#8ac;font-size:10px">VOX.DAT <input type="file" id="codecVoxFile" accept=".dat,.bin" style="font-size:10px"></label>'+
      '<button id="codecFaceMgrBtn" style="margin-left:auto;background:#2a2438;color:#cbf;border:1px solid #75c;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer">\u{1F3A8} Faces</button>'+
      '<button id="codecVoxToolBtn" style="background:#12303f;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer" title="Play, export, or replace any VOX.DAT clip">\u{1F50A} VOX Clip</button>'+
      '<button id="codecExport" style="background:#1d3a26;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer">\u{1F4BE} Export RADIO.DAT</button>'+
      '<button id="codecClose" style="background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer">\u2715 Close</button>'+
    '</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      '<div style="width:250px;border-right:1px solid #133;display:flex;flex-direction:column">'+
        '<div style="display:flex;gap:4px;margin:6px 6px 2px">'+
          '<select id="codecLang" style="flex:1;background:#08140e;color:#dfe;border:1px solid #1a3a2a;font-size:10px">'+
            '<option value="EN">English</option><option value="JP">Japanese</option><option value="ALL">All langs</option></select>'+
          '<select id="codecSort" style="flex:1;background:#08140e;color:#dfe;border:1px solid #1a3a2a;font-size:10px">'+
            '<option value="len">Longest first</option><option value="freq">By frequency</option><option value="file">File order</option></select>'+
        '</div>'+
        '<input id="codecFilter" placeholder="filter\u2026 (snake, 140.85, meryl)" style="margin:2px 6px 6px;padding:5px;background:#08140e;color:#dfe;border:1px solid #1a3a2a;font-size:11px">'+
        '<div id="codecList" style="overflow:auto;flex:1"></div>'+
      '</div>'+
      '<div style="flex:1;display:flex;flex-direction:column;min-width:0;overflow:auto">'+
        CODEC_screenHTML()+
        '<div id="codecEdit" style="padding:10px 16px"></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov); CODEC_state.panelEl=ov;
  document.getElementById('codecClose').onclick=function(){ if(typeof CODEC_stopVox==='function')CODEC_stopVox(); try{ if(CODEC_vox&&CODEC_vox.ctx&&CODEC_vox.ctx.state==='running'&&CODEC_vox.ctx.suspend)CODEC_vox.ctx.suspend(); }catch(e){} ov.style.display='none'; };
  document.getElementById('codecFile').onchange=CODEC_onFile;
  document.getElementById('codecFaceFile').onchange=CODEC_onFaceFile;
  document.getElementById('codecExport').onclick=CODEC_export;
  document.getElementById('codecFaceMgrBtn').onclick=CODEC_openFaceManager;
  document.getElementById('codecVoxFile').onchange=CODEC_onVoxFile;
  document.getElementById('codecVoxToolBtn').onclick=CODEC_openVoxTool;
  document.getElementById('codecFilter').oninput=function(){ CODEC_state.filter=this.value.toLowerCase(); CODEC_renderList(); };
  document.getElementById('codecLang').onchange=function(){ CODEC_state.langFilter=this.value; CODEC_renderList(); };
  document.getElementById('codecSort').onchange=function(){ CODEC_state.sortMode=this.value; CODEC_renderList(); };
  CODEC_renderList();
}
function CODEC_screenHTML(){
  var portrait='position:relative;width:116px;height:140px;border:2px solid #2f8f5f;border-radius:6px;'+
    'background-color:#04140c;background-image:linear-gradient(160deg,#0c2a1c,#020c08);background-size:contain;background-position:center bottom;background-repeat:no-repeat;'+
    'box-shadow:inset 0 0 18px rgba(0,255,150,.15),0 0 8px rgba(0,255,150,.10);'+
    'display:flex;align-items:flex-end;justify-content:center;color:#6fcf9f;font-size:10px;text-align:center;overflow:hidden;transition:opacity .12s,filter .12s';
  var scan='position:absolute;inset:0;pointer-events:none;background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px)';
  return '<div style="margin:14px auto;width:460px;background:#000;border:2px solid #6e2323;border-radius:8px;padding:16px 16px 14px;box-shadow:0 0 0 1px #200,inset 0 0 30px rgba(0,40,20,.35)">'+
    '<div style="text-align:center;color:#7fe3b3;letter-spacing:9px;font-size:12px;font-weight:bold;margin-bottom:8px;text-shadow:0 0 5px rgba(0,255,150,.5)">P T T</div>'+
    '<div style="display:flex;align-items:center;justify-content:center;gap:9px">'+
      '<div id="codecFaceL" style="'+portrait+'"><div style="'+scan+'"></div><span style="padding:4px;position:relative;z-index:1" id="codecFaceLname">\u2014</span></div>'+
      '<div style="color:#3fae7e;font-size:15px">\u25C4</div>'+
      '<div style="flex:none;width:118px">'+
        '<div style="position:relative;background:#021a10;border:2px solid #2f8f5f;border-radius:4px;height:100px;overflow:hidden;box-shadow:inset 0 0 14px rgba(0,255,150,.2)">'+
          '<div style="position:absolute;top:0;left:0;right:0;height:60px;background:repeating-linear-gradient(180deg,rgba(90,255,185,.32) 0 2px,rgba(0,40,25,.12) 2px 6px);border-bottom:1px solid #1f6f4f"></div>'+
          '<div id="codecFreq" style="position:absolute;bottom:7px;left:0;right:0;text-align:center;color:#9affd0;font-size:30px;font-weight:bold;letter-spacing:1px;font-family:Orbitron,Consolas,monospace;text-shadow:0 0 9px rgba(0,255,140,.85)">---.--</div>'+
        '</div>'+
      '</div>'+
      '<div style="color:#3fae7e;font-size:15px">\u25BA</div>'+
      '<div id="codecFaceR" style="'+portrait+'"><div style="'+scan+'"></div><span style="padding:4px;position:relative;z-index:1" id="codecFaceRname">\u2014</span></div>'+
    '</div>'+
    '<div style="text-align:center;color:#7fe3b3;letter-spacing:7px;font-size:12px;font-weight:bold;margin-top:8px;text-shadow:0 0 5px rgba(0,255,150,.5)">MEMORY</div>'+
    '<div id="codecSubs" style="min-height:44px;margin-top:12px;color:#eafff5;font-size:15px;line-height:1.5;font-family:system-ui,sans-serif;text-align:center;white-space:pre-wrap;text-shadow:0 1px 2px #000"></div>'+
  '</div>';
}
// update the preview to a specific line: subtitle + light up the speaking portrait
function CODEC_previewLine(c, li){
  if(!c) return; var ln=c.lines[li]; if(!ln) return;
  var subs=document.getElementById('codecSubs'); if(subs) subs.textContent=CODEC_lineText(ln).replace(/\{[0-9a-f]{4}\}/g,'');
  var isSnake=(ln.actor===0x21ca), fh=CODEC_curFaceHash(ln);
  if(isSnake) CODEC_setPortrait('codecFaceR','codecFaceRname', fh, 'Snake');
  else        CODEC_setPortrait('codecFaceL','codecFaceLname', fh, CODEC_actor(ln.actor));
  var L=document.getElementById('codecFaceL'), R=document.getElementById('codecFaceR');
  if(L){ L.style.opacity=isSnake?'0.4':'1'; L.style.filter=isSnake?'brightness(0.65)':'none'; }
  if(R){ R.style.opacity=isSnake?'1':'0.4'; R.style.filter=isSnake?'none':'brightness(0.65)'; }
}
function CODEC_previewReset(){
  ['codecFaceL','codecFaceR'].forEach(function(id){ var e=document.getElementById(id); if(e){ e.style.opacity='1'; e.style.filter='none'; } });
}
function CODEC_onFile(ev){ var f=ev.target.files[0]; if(!f)return;
  document.getElementById('codecInfo').textContent='parsing '+f.name+'\u2026';
  var r=new FileReader();
  r.onload=function(){ CODEC_state.bytes=new Uint8Array(r.result); CODEC_state.edits={}; CODEC_state._proxy=null; CODEC_state.fileName=f.name;
    CODEC_state.convs=CODEC_parse(CODEC_state.bytes); CODEC_state.sel=-1;
    var withText=CODEC_state.convs.filter(function(c){return c.lines.length;}).length;
    document.getElementById('codecInfo').textContent=f.name+' \u00b7 '+CODEC_state.convs.length+' conversations \u00b7 '+withText+' with dialogue';
    CODEC_renderList(); };
  r.readAsArrayBuffer(f); }

function CODEC_onFaceFile(ev){ var f=ev.target.files[0]; if(!f)return;
  document.getElementById('codecInfo').textContent='parsing '+f.name+'\u2026';
  var r=new FileReader();
  r.onload=function(){ var b=new Uint8Array(r.result); CODEC_state.faceName=f.name;
    CODEC_state.faces=CODEC_faceParse(b);
    document.getElementById('codecInfo').textContent=f.name+' \u00b7 '+Object.keys(CODEC_state.faces.byHash).length+' face portraits loaded ('+CODEC_state.faces.folders+' stage sets)';
    if(CODEC_state.sel>=0) CODEC_renderConv();
  };
  r.readAsArrayBuffer(f); }

function CODEC_convLabel(c){
  var sp=c.speakers.map(CODEC_actor).filter(function(n){return n!=='Solid Snake';});
  var who=sp.length?sp[0]:(c.speakers.length?'Solid Snake':'(no speaker)');
  var first=''; for(var k=0;k<c.lines.length;k++){ var t=c.lines[k].orig.replace(/\{[0-9a-f]{4}\}/g,'').replace(/\n/g,' ').trim(); if(t.length>3){first=t;break;} }
  return {who:who, preview:first};
}
function CODEC_renderList(){
  var el=document.getElementById('codecList'); if(!el)return;
  if(!CODEC_state.convs.length){ el.innerHTML='<div style="color:#566;padding:10px;font-size:11px">No file loaded.</div>'; return; }
  var f=CODEC_state.filter, lang=CODEC_state.langFilter, h='';
  // build filtered index list (skip empty + wrong language)
  var idx=[];
  for(var i=0;i<CODEC_state.convs.length;i++){ var c=CODEC_state.convs[i];
    if(!c.lines.length) continue;                                  // hide voice/face-only
    if(lang!=='ALL' && c.lang!==lang) continue;                    // language filter
    if(f){ var lbl0=CODEC_convLabel(c); var hay=(c.freq.toFixed(2)+' '+lbl0.who+' '+lbl0.preview).toLowerCase(); if(hay.indexOf(f)<0) continue; }
    idx.push(i);
  }
  // sort
  if(CODEC_state.sortMode==='len') idx.sort(function(a,b){ return CODEC_state.convs[b].lines.length-CODEC_state.convs[a].lines.length; });
  else if(CODEC_state.sortMode==='freq') idx.sort(function(a,b){ var d=CODEC_state.convs[a].freq-CODEC_state.convs[b].freq; return d||(CODEC_state.convs[b].lines.length-CODEC_state.convs[a].lines.length); });
  // render
  for(var k=0;k<idx.length;k++){ var i2=idx[k], c2=CODEC_state.convs[i2], lbl=CODEC_convLabel(c2);
    var sel=(i2===CODEC_state.sel), edited=CODEC_convEdited(c2);
    h+='<div class="codecRow" data-i="'+i2+'" style="cursor:pointer;padding:5px 9px;border-bottom:1px solid #112;font-size:11px;'+(sel?'background:#0e2018':'')+'">'+
       '<div style="color:#cfe">'+c2.freq.toFixed(2)+(c2.lang?(' <span style="color:'+(c2.lang==='EN'?'#7fb':'#b8f')+';font-size:8px">'+c2.lang+'</span>'):'')+
         ' \u00b7 '+lbl.who+' <span style="color:#566;font-size:9px">('+c2.lines.length+')</span>'+(edited?' <span style="color:#7f7">\u2605</span>':'')+'</div>'+
       '<div style="color:#688;font-size:9px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(lbl.preview||('('+c2.lines.length+' lines)'))+'</div></div>';
  }
  var hdr='<div style="color:#567;font-size:9px;padding:4px 9px;border-bottom:1px solid #122">'+idx.length+' conversations'+(lang!=='ALL'?(' ('+lang+')'):'')+'</div>';
  el.innerHTML=hdr+(h||'<div style="color:#566;padding:10px;font-size:11px">No matches.</div>');
  var rows=el.querySelectorAll('.codecRow'); for(var r=0;r<rows.length;r++) rows[r].onclick=function(){ if(typeof CODEC_stopVox==='function')CODEC_stopVox(); CODEC_state.sel=parseInt(this.getAttribute('data-i'),10); CODEC_renderList(); CODEC_renderConv(); };
}
function CODEC_convEdited(c){ for(var k=0;k<c.lines.length;k++){ for(var j=0;j<c.lines[k].len;j++){ if((c.lines[k].pos+j) in CODEC_state.edits) return true; } } return false; }

function CODEC_faceFor(c, snake){ // first face hash used by snake / non-snake speaker
  for(var i=0;i<c.cmds.length;i++){ var cm=c.cmds[i];
    if((cm.kind==='TEXT'||cm.kind==='FACE') && cm.face!==undefined){
      var isSnake=(cm.actor===0x21ca);
      if(snake&&isSnake) return cm.face;
      if(!snake&&!isSnake) return cm.face;
    } }
  return null;
}
// ─── Portrait animation engine ──────────────────────────────────────────────
// Recreates the in-game codec behavior while a call plays: the speaking side's
// MOUTH flaps driven by the voice amplitude envelope (same env the word
// highlighter uses), and BOTH portraits blink on a random 1.5-4.5 s timer.
// Sub-frames come from the eyes[3]/mouth[3] slots decoded per face; faces
// without anim frames (or full-anim faces) stay static.
var CODEC_anim={ running:false, sides:{}, env:null, W:0, envMax:1, timer:null };
// lazy per-face cache of offscreen canvases: base + positioned eye/mouth frames
function CODEC_animCache(face){
  if(face._animCache) return face._animCache;
  var st=face.occ&&face.occ[0]; if(!st) return (face._animCache={base:null,eyes:[],mouth:[]});
  var b=CODEC_state.faceBytes;
  function cvOf(img){ var cv=document.createElement('canvas'); cv.width=img.w; cv.height=img.h;
    var cx=cv.getContext('2d'); var id=cx.createImageData(img.w,img.h); id.data.set(img.rgba); cx.putImageData(id,0,0);
    return {cv:cv,xo:img.xo,yo:img.yo}; }
  var base=cvOf(CODEC_faceDecodeAt(b,st.fd,st.bmpOff,st.palOff));
  var eyes=[],mouth=[];
  ['eyes0','eyes1','eyes2'].forEach(function(k){ if(st.subs[k]) eyes.push(cvOf(CODEC_faceDecodeAt(b,st.fd,st.subs[k].rel,st.palOff))); });
  ['mouth0','mouth1','mouth2'].forEach(function(k){ if(st.subs[k]) mouth.push(cvOf(CODEC_faceDecodeAt(b,st.fd,st.subs[k].rel,st.palOff))); });
  return (face._animCache={base:base,eyes:eyes,mouth:mouth,w:st.w,h:st.h});
}
function CODEC_animCompose(side){
  var s=CODEC_anim.sides[side]; if(!s||!s.cache||!s.cache.base) return;
  var ctx=s.canvas.getContext('2d');
  ctx.clearRect(0,0,s.canvas.width,s.canvas.height);
  ctx.drawImage(s.cache.base.cv,0,0);
  if(s.eyeIdx>=0&&s.cache.eyes[s.eyeIdx]){ var e=s.cache.eyes[s.eyeIdx]; ctx.drawImage(e.cv,e.xo,e.yo); }
  if(s.mouthIdx>=0&&s.cache.mouth[s.mouthIdx]){ var m=s.cache.mouth[s.mouthIdx]; ctx.drawImage(m.cv,m.xo,m.yo); }
}
// blink: run the eye frames forward then back (open->closed->open), ~40 ms/step
function CODEC_animBlink(side, now){
  var s=CODEC_anim.sides[side]; if(!s) return;
  if(s.blinkSeq){                                        // mid-blink: advance
    if(now>=s.blinkNext){
      s.blinkStep++;
      if(s.blinkStep>=s.blinkSeq.length){ s.blinkSeq=null; s.eyeIdx=-1; }
      else { s.eyeIdx=s.blinkSeq[s.blinkStep]; s.blinkNext=now+40; }
      s.dirty=true;
    }
    return;
  }
  if(!s.blinkAt) s.blinkAt=now+1500+Math.random()*3000;
  if(now>=s.blinkAt && s.cache && s.cache.eyes.length){
    var n=s.cache.eyes.length, seq=[];
    for(var i=0;i<n;i++) seq.push(i);
    for(var j=n-2;j>=0;j--) seq.push(j);                 // e.g. [0,1,2,1,0]
    s.blinkSeq=seq; s.blinkStep=0; s.eyeIdx=seq[0]; s.blinkNext=now+40;
    s.blinkAt=now+1500+Math.random()*3000; s.dirty=true;
  }
}
function CODEC_animTimerFn(){
  if(!CODEC_anim.running) return;
  if(!CODEC_vox.playing) return;                          // frozen while paused
  var now=performance.now();
  for(var side in CODEC_anim.sides){
    CODEC_animBlink(side, now);
    var s=CODEC_anim.sides[side];
    if(s&&s.dirty){ CODEC_animCompose(side); s.dirty=false; }
  }
}
function CODEC_animBegin(){
  CODEC_anim.running=true;
  if(!CODEC_anim.timer) CODEC_anim.timer=setInterval(CODEC_animTimerFn,30);
}
function CODEC_animEnd(){
  CODEC_anim.running=false;
  if(CODEC_anim.timer){ clearInterval(CODEC_anim.timer); CODEC_anim.timer=null; }
  for(var side in CODEC_anim.sides){ var s=CODEC_anim.sides[side];
    if(s){ s.eyeIdx=-1; s.mouthIdx=-1; s.blinkSeq=null; CODEC_animCompose(side); } }
}
// mouth tick, called from the playback highlighter: env amplitude -> frame level
function CODEC_animMouth(t, speakSide){
  var s;
  for(var side in CODEC_anim.sides){                      // silence the idle side
    if(side===speakSide) continue;
    s=CODEC_anim.sides[side];
    if(s&&s.mouthIdx!==-1){ s.mouthIdx=-1; s.dirty=true; }
  }
  s=CODEC_anim.sides[speakSide];
  if(!s||!s.cache||!s.cache.mouth.length||!CODEC_anim.env) return;
  var ei=Math.floor(t/CODEC_anim.W);
  var amp=(ei>=0&&ei<CODEC_anim.env.length)?CODEC_anim.env[ei]/CODEC_anim.envMax:0;
  var idx=-1;
  if(amp>0.10){
    idx=Math.floor(amp*(s.cache.mouth.length+0.6));
    if(idx>=s.cache.mouth.length) idx=s.cache.mouth.length-1;
  }
  if(idx!==s.mouthIdx){ s.mouthIdx=idx; s.dirty=true; }
}
function CODEC_setPortrait(elId, nameId, hash, fallbackName){
  var el=document.getElementById(elId), nm=document.getElementById(nameId);
  var face=(hash!=null)?CODEC_faceImg(hash):null;
  var oldCv=el.querySelector('.codecAnimCv'); 
  if(face){
    var cache=CODEC_animCache(face);
    if(cache.base){                                        // animated canvas portrait
      el.style.backgroundImage='';
      var prev=CODEC_anim.sides[elId];
      if(!(prev&&prev.hash===hash&&oldCv)){
        if(oldCv) oldCv.remove();
        var cv=document.createElement('canvas');
        cv.className='codecAnimCv'; cv.width=cache.w; cv.height=cache.h;
        cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;image-rendering:pixelated;z-index:0';
        el.insertBefore(cv, el.firstChild);
        CODEC_anim.sides[elId]={hash:hash,cache:cache,canvas:cv,eyeIdx:-1,mouthIdx:-1,blinkAt:0,blinkSeq:null,dirty:false};
        CODEC_animCompose(elId);
      }
      nm.textContent=''; return;
    }
    if(oldCv){ oldCv.remove(); delete CODEC_anim.sides[elId]; }
    var url=CODEC_faceURL(face,1.4);                       // static fallback (no base decoded)
    el.style.backgroundImage='url('+url+')'; el.style.backgroundSize='contain'; el.style.backgroundRepeat='no-repeat'; el.style.backgroundPosition='center bottom';
    nm.textContent=''; }
  else { if(oldCv){ oldCv.remove(); delete CODEC_anim.sides[elId]; }
    el.style.backgroundImage=''; nm.textContent=fallbackName||'\u2014'; }
}
function CODEC_renderConv(){
  var c=CODEC_state.convs[CODEC_state.sel]; if(!c)return;
  document.getElementById('codecFreq').textContent=c.freq.toFixed(2);
  var others=c.speakers.filter(function(s){return s!==0x21ca;});
  // real portraits if FACE.DAT loaded, else names
  CODEC_setPortrait('codecFaceL','codecFaceLname', CODEC_faceFor(c,false), others.length?CODEC_actor(others[0]):'\u2014');
  CODEC_setPortrait('codecFaceR','codecFaceRname', CODEC_faceFor(c,true), c.speakers.indexOf(0x21ca)>=0?'Snake':'\u2014');
  CODEC_previewReset();
  document.getElementById('codecSubs').textContent=c.lines.length?CODEC_lineText(c.lines[0]).replace(/\{[0-9a-f]{4}\}/g,''):'(no dialogue)';

  var haveFaces=!!CODEC_state.faces;
  var voiced=c.lines.filter(function(l){return l.vox!=null;}).length;
  var h='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
        '<button id="codecPlayBtn" style="background:#1d3a26;color:#9fd;border:1px solid #2a7;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer">\u25b6 Play</button>'+
        '<button id="codecStopBtn" style="background:#241d2a;color:#caf;border:1px solid #74a;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">\u25a0 Stop</button>'+
        '<span style="color:#6a8;font-size:10px">rate</span><input id="codecRate" type="number" value="'+CODEC_vox.rate+'" min="6000" max="44100" step="100" style="width:62px;background:#08140e;color:#dfe;border:1px solid #243;font-size:10px">'+
        '<button id="codecVoxPatch" style="background:#2a2438;color:#cbf;border:1px solid #75c;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">\uD83D\uDCBE VOX patch</button>'+
        '<span style="color:#577;font-size:10px">'+voiced+' voiced / '+c.lines.length+' lines'+(CODEC_vox.file?'':' \u00b7 load VOX.DAT to play')+'</span></div>'+
        '<div style="color:#577;font-size:10px;margin-bottom:8px">Click a line to edit text \u00b7 \uD83C\uDFA4 on a voiced line to splice in new audio. '+
        (haveFaces?'Click a portrait thumbnail to change the face.':'Load FACE.DAT for portraits.')+'</div>';
  if(!c.lines.length) h+='<div style="color:#566">No editable text lines in this conversation.</div>';
  c.lines.forEach(function(ln,li){
    var cur=CODEC_lineText(ln);
    var edd=CODEC_lineEdited(ln);
    var usedBytes=CODEC_encodeRaw(cur).length;
    var curFace=CODEC_curFaceHash(ln);
    var thumb='';
    if(haveFaces){ var fimg=CODEC_faceImg(curFace);
      thumb='<button class="codecFaceBtn" data-li="'+li+'" title="face 0x'+(curFace>>>0).toString(16)+' \u2014 click to change" '+
        'style="flex:none;width:34px;height:46px;padding:0;border:1px solid #243;background:#06100a '+(fimg?('url('+CODEC_faceURL(fimg,1)+') center/contain no-repeat'):'')+';cursor:pointer">'+(fimg?'':'?')+'</button>';
    }
    var voxMark=(ln.vox)?'<button class="codecMic" data-li="'+li+'" title="splice new audio for this line" style="background:none;border:none;color:#5c9;font-size:11px;cursor:pointer;padding:0">\uD83C\uDFA4</button><button class="codecDl" data-li="'+li+'" title="download this clip as WAV" style="background:none;border:none;color:#7ad;font-size:11px;cursor:pointer;padding:0;margin-left:2px">\u2B07</button>':'<span style="width:10px;display:inline-block"></span>';
    h+='<div class="codecLine" data-li="'+li+'" style="margin:3px 0;display:flex;align-items:flex-start;gap:6px;outline:none">'+
       thumb+
       '<span style="color:#567;font-size:9px;width:74px;flex:none;padding-top:4px">'+voxMark+' '+CODEC_actor(ln.actor)+'</span>'+
       '<div class="ctext" data-li="'+li+'" contenteditable="false" style="flex:1;background:#08140e;color:'+(edd?"#9fd":"#dff")+';border:1px solid #243;font-size:13px;font-family:system-ui,monospace;padding:3px 6px;cursor:text;line-height:1.5;white-space:pre-wrap">'+CODEC_wordsHTML(cur)+'</div>'+
       '<span class="codecRem" data-li="'+li+'" style="color:'+(usedBytes>ln.len?"#f88":"#567")+';font-size:9px;width:54px;flex:none;text-align:right;padding-top:4px">'+(ln.len-usedBytes)+'/'+ln.len+'B</span></div>';
  });
  var el=document.getElementById('codecEdit'); el.innerHTML=h;
  document.getElementById('codecPlayBtn').onclick=CODEC_togglePlay;
  document.getElementById('codecStopBtn').onclick=CODEC_stopVox;
  document.getElementById('codecRate').onchange=function(){ var r=parseInt(this.value,10); if(r>=6000&&r<=44100) CODEC_vox.rate=r; };
  document.getElementById('codecVoxPatch').onclick=CODEC_exportVoxPatch;
  el.querySelectorAll('.codecMic').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); CODEC_replaceVoice(+this.getAttribute('data-li')); }; });
  el.querySelectorAll('.codecDl').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); CODEC_dlClip(+this.getAttribute('data-li')); }; });
  el.querySelectorAll('.ctext').forEach(function(div){ div.onclick=function(){ CODEC_editLine(+this.getAttribute('data-li'), this); }; });
  el.querySelectorAll('.codecFaceBtn').forEach(function(btn){ btn.onclick=function(e){ e.stopPropagation(); CODEC_openFacePicker(+this.getAttribute('data-li')); }; });
}
// render line text as word spans (for highlight) with {tokens} and line breaks
function CODEC_wordsHTML(text){
  var esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  return text.split('\n').map(function(lineSeg){
    return lineSeg.split(/(\s+)/).map(function(tok){
      if(/^\s+$/.test(tok)||tok==='') return esc(tok);
      return '<span class="cw">'+esc(tok)+'</span>';
    }).join('');
  }).join('<br>');
}
// swap a display line into an editable textarea; commit on blur
function CODEC_editLine(li, div){
  var ln=CODEC_state.convs[CODEC_state.sel].lines[li];
  var cur=CODEC_lineText(ln);
  var ta=document.createElement('textarea');
  ta.value=cur; ta.rows=Math.max(1,cur.split('\n').length);
  ta.style.cssText='flex:1;background:#08140e;color:#9fd;border:1px solid #2a6;font-size:13px;font-family:monospace;padding:3px 6px;resize:vertical';
  div.replaceWith(ta); ta.focus();
  ta.oninput=function(){
    var enc=CODEC_encodeText(ta.value, ln.len);
    var rem=ta.parentNode.querySelector('.codecRem'); var used=CODEC_encodeRaw(ta.value).length;
    if(rem){ rem.textContent=(ln.len-used)+'/'+ln.len+'B'; rem.style.color=(used>ln.len)?'#f88':'#567'; }
    if(enc){ for(var k=0;k<ln.len;k++){ if(enc[k]===CODEC_state.bytes[ln.pos+k]) delete CODEC_state.edits[ln.pos+k]; else CODEC_state.edits[ln.pos+k]=enc[k]; } }
  };
  ta.onblur=function(){
    var nd=document.createElement('div'); nd.className='ctext'; nd.setAttribute('data-li',li); nd.setAttribute('contenteditable','false');
    var edd=CODEC_lineEdited(ln);
    nd.style.cssText='flex:1;background:#08140e;color:'+(edd?'#9fd':'#dff')+';border:1px solid #243;font-size:13px;font-family:system-ui,monospace;padding:3px 6px;cursor:text;line-height:1.5;white-space:pre-wrap';
    nd.innerHTML=CODEC_wordsHTML(CODEC_lineText(ln));
    ta.replaceWith(nd); nd.onclick=function(){ CODEC_editLine(li, this); };
  };
}
// current face hash for a line, reflecting any edit at facePos
function CODEC_curFaceHash(ln){ if(ln.facePos==null) return ln.face;
  return (CODEC_byte(ln.facePos)<<8)|CODEC_byte(ln.facePos+1); }
// write a face hash (2 bytes BE) at the line's facePos
function CODEC_setFaceHash(ln, hash){ if(ln.facePos==null) return;
  var hi=(hash>>8)&0xff, lo=hash&0xff;
  if(hi===CODEC_state.bytes[ln.facePos]) delete CODEC_state.edits[ln.facePos]; else CODEC_state.edits[ln.facePos]=hi;
  if(lo===CODEC_state.bytes[ln.facePos+1]) delete CODEC_state.edits[ln.facePos+1]; else CODEC_state.edits[ln.facePos+1]=lo;
}
// modal grid of all available faces to pick from
function CODEC_openFacePicker(li){
  if(!CODEC_state.faces) return;
  var ln=CODEC_state.convs[CODEC_state.sel].lines[li];
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:10003;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center';
  var hashes=Object.keys(CODEC_state.faces.byHash);
  var grid='<div style="background:#0a1418;border:1px solid #2a6;border-radius:6px;padding:14px;max-width:640px;max-height:80vh;overflow:auto">'+
    '<div style="color:#8fc;font-size:12px;margin-bottom:8px">Pick a face for this line ('+hashes.length+' available) \u00b7 current 0x'+(CODEC_curFaceHash(ln)>>>0).toString(16)+'</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  hashes.forEach(function(hk){ var hsh=+hk, face=CODEC_state.faces.byHash[hk];
    grid+='<button class="cfp" data-h="'+hsh+'" title="0x'+hsh.toString(16)+'" style="width:46px;height:62px;padding:0;border:1px solid #243;background:#06100a url('+CODEC_faceURL(face,1)+') center/contain no-repeat;cursor:pointer"></button>';
  });
  grid+='</div><div style="text-align:right;margin-top:10px"><button id="cfpCancel" style="background:#3a1d2a;color:#fcc;border:1px solid #a44;border-radius:4px;padding:5px 12px;font-size:11px;cursor:pointer">Cancel</button></div></div>';
  ov.innerHTML=grid; document.body.appendChild(ov);
  ov.querySelector('#cfpCancel').onclick=function(){ ov.remove(); };
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.querySelectorAll('.cfp').forEach(function(b){ b.onclick=function(){ CODEC_setFaceHash(ln,+this.getAttribute('data-h')); ov.remove(); CODEC_renderConv(); CODEC_renderList(); }; });
}
function CODEC_encodeRaw(str){ // byte length without padding (for counter)
  var out=[],i=0; while(i<str.length){ var ch=str[i];
    if(ch==='\n'){ out.push(0,0,0,0); i++; }
    else if(ch==='{'){ var e=str.indexOf('}',i); if(e>i&&/^[0-9a-f]{1,4}$/.test(str.slice(i+1,e))){ out.push(0,0); i=e+1; continue; } out.push(0); i++; }
    else { out.push(0); i++; } }
  return out;
}
function CODEC_lineEdited(ln){ for(var j=0;j<ln.len;j++){ if((ln.pos+j) in CODEC_state.edits) return true; } return false; }

function CODEC_export(){
  if(!CODEC_state.bytes){ alert('Load RADIO.DAT first.'); return; }
  var out=new Uint8Array(CODEC_state.bytes), n=0;
  for(var pos in CODEC_state.edits){ out[pos]=CODEC_state.edits[pos]; n++; }
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
  a.download=(CODEC_state.fileName||'RADIO.DAT').replace(/\.dat$/i,'')+'_mod.DAT';
  document.body.appendChild(a); a.click(); a.remove();
  document.getElementById('codecInfo').textContent=CODEC_state.fileName+' \u00b7 exported with '+n+' byte edit'+(n===1?'':'s');
}
