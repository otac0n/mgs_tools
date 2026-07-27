// ═══════════════════════════════════════════════════════════════════════════
// FILE: 39_archive_tool.js
// ═══════════════════════════════════════════════════════════════════════════
// MGS1 Archive Tool — stage.dir (PSX) / stage.mgz (PC) full unpack ⇄ repack,
// embedded as an iframe overlay (same pattern as RPK Studio / LIT editor).
// Extract: stages → folders, DARs → *_unpacked/ subfolders, PC .gcx → .gcl.
// Repack: bottom-up rebuild with size-changing edits, added files, and the
// v82 VRAM/CLUT conflict-repair pass on changed texture DARs.
// Host provides ARCH_HOST_EXIT.
var ARCHIVE_TOOL_HTML=`
<!doctype html>
<!--
═══════════════════════════════════════════════════════════════════════════
  MGS1 Archive Tool — stage.dir (PSX) / stage.mgz (PC) unpack ⇄ repack
  Single file. No build, no dependencies. Open in any modern browser.

  WHAT IT DOES
    EXTRACT: drop a PSX STAGE.DIR or a PC stage.mgz.
      · PSX: every stage becomes a named folder; entries are written as
        their ORIGINAL names — hash.ext, e.g. 39213.kmd — so external tools
        like MetalMintSolid find the names they expect; every .dar inside is
        further unpacked into hash.dar_unpacked/ folders (members also named
        hash.ext). Rare same-name duplicates get __2/__3 suffixes. Order and
        structure live in _archive_manifest.json — KEEP IT with the files.
      · PC: the ZIP layout is preserved; every .dar is unpacked into
        <name>.dar_unpacked/ folders (named-entry PC format); every .gcx is
        DECOMPILED to an editable .gcl next to where the .gcx was.
      Output: <name>_extracted.zip containing everything + _archive_manifest.json.
      On repack: edited files are picked up; files you DELETE are removed from
      the rebuilt archive (logged); new files named HASH.EXT dropped into a
      stage folder or a *_unpacked DAR folder are ADDED (logged).

    REPACK: drop the extracted ZIP (or the loose extracted FOLDER) back.
      Everything is rebuilt bottom-up — inner DARs first, then stages, then
      the outer container — and you get a stage.dir or stage.mgz depending on
      what you originally extracted. Size-changing edits are fully supported
      on both platforms (PSX stages are relocated sector-correctly).
      · PC .gcl handling: if a .gcl is UNCHANGED, the byte-identical original
        .gcx is restored. If EDITED, it is compiled back to PC GCX with the
        Stage Editor suite's compiler (warnings surface in the log; on a hard
        compile failure the original .gcx is used and you are told loudly).
      · VRAM pass (both platforms): if a texture DAR's contents changed
        (edited or newly added members), the v82 repacker logic runs before
        the DAR is rebuilt — textures whose VRAM rect collides with a CLUT
        row, an unchanged texture, or another slot at a different position
        are relocated within their home region (init/stage), TPAGE-safe;
        CLUTs partially overlapping another CLUT row are moved to a free
        slot in the x512-1024 y240-256 band. EXACT same-position pairs are
        intentional variant sharing and are kept (moved as a group if they
        must move). Unchanged files are the placement authority and are
        never rewritten; DARs with no changed members are never touched,
        preserving byte-identical repacks.
      · You may ADD files: extra files inside any *_unpacked/ folder are
        appended (PSX names must end _HASH.EXT so the entry header can be
        rebuilt). Do not delete or rename manifest-listed files.

  DO NOT touch _archive_manifest.json — it holds the verbatim header sectors,
  entry order, and original GCX bytes that make byte-faithful repacks possible.

  FORMAT NOTES (verified)
    PSX STAGE.DIR outer: u32 dirSize + N×{8B name, u32 sector}; stage extent =
      gap to next stage's sector. Inner: 4B header + 8B configs (hash/mode/ext/
      size) until mode==0; data @2048; ext 0xFF = sector-align marker;
      mode 'c' = cached (tightly packed, cumulative sizes); others sector-
      aligned. Unmodified extract→repack is byte-identical (tested).
    PSX DAR: {u16 hash,u16 ext,u32 size,data} repeated (byte-verified on
      retail 2_0.dar, 211 entries).
    PC DAR: [u32 count] + per entry ASCIIZ name + pad-to-4 + u32 size + data
      + 1 zero pad.
    GCX↔GCL: suite modules 20/21/28 + the GCL emitter of 27. Strids are kept
      as hex (s:XXXX) so decompile→compile round-trips deterministically.
═══════════════════════════════════════════════════════════════════════════
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MGS1 Archive Tool · stage.dir / stage.mgz</title>
<style>
  :root{--bg:#0a0c10;--panel:#10141c;--line:#1e2633;--green:#7ee787;--amber:#e0a33a;
    --red:#e06c63;--text:#c6d2cb;--muted:#697989;
    --mono:ui-monospace,"JetBrains Mono",Consolas,monospace}
  *{box-sizing:border-box} html,body{margin:0;height:100%}
  body{background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px;
    display:flex;flex-direction:column;min-height:100%}
  header{border-bottom:1px solid var(--line);padding:14px 20px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  h1{font-size:15px;margin:0;letter-spacing:.28em;text-transform:uppercase}
  h1 b{color:var(--green)}
  .sub{color:var(--muted);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  .spacer{flex:1}
  .btn{font:inherit;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--bg);
    background:var(--green);border:0;padding:8px 16px;cursor:pointer}
  main{flex:1;padding:20px;display:flex;flex-direction:column;gap:16px}
  .drop{border:1px dashed var(--line);padding:44px 24px;text-align:center;color:var(--muted);
    transition:border-color .15s,background .15s}
  .drop.hot{border-color:var(--green);background:#0c130f;color:var(--text)}
  .drop h2{font-size:17px;letter-spacing:.18em;text-transform:uppercase;color:var(--text);margin:0 0 8px}
  .drop p{margin:5px 0;font-size:12px}
  .drop .a{color:var(--green)} .drop code{color:var(--amber)}
  #log{flex:1;border:1px solid var(--line);background:var(--panel);padding:12px;overflow:auto;
    min-height:180px;white-space:pre-wrap;line-height:1.55;font-size:12px}
  #log .ok{color:var(--green)} #log .warn{color:var(--amber)} #log .err{color:var(--red)}
  footer{border-top:1px solid var(--line);padding:8px 20px;color:var(--muted);font-size:10px;
    letter-spacing:.1em;text-transform:uppercase}
</style>
</head>
<body>
<header>
  <h1>MGS1&nbsp;<b>//</b>&nbsp;Archive Tool</h1>
  <span class="sub">stage.dir (PSX) · stage.mgz (PC) · unpack ⇄ repack</span>
  <span class="spacer"></span>
  <button class="btn" id="pick">Load file</button>
  <button class="btn" id="pickDir" title="Repack a loose extracted folder (reliable alternative to dragging the folder in)">Load folder</button>
  <button class="btn" id="hostExit" style="background:#c26;display:none">✕ Exit</button>
  <input type="file" id="fileIn" hidden>
  <input type="file" id="dirIn" webkitdirectory directory multiple hidden>
</header>
<main>
  <div class="drop" id="drop">
    <h2>Drop an archive</h2>
    <p><span class="a">STAGE.DIR</span> or <span class="a">stage.mgz</span> → extracts everything (stages, DARs unpacked into folders, PC <code>.gcx</code> decompiled to <code>.gcl</code>) into a ZIP.</p>
    <p>Extracted <span class="a">ZIP</span> or loose <span class="a">folder</span> → repacks bottom-up into a fresh <code>stage.dir</code> / <code>stage.mgz</code>.</p>
    <p style="margin-top:14px;color:var(--muted);font-size:11px">Keep <code>_archive_manifest.json</code> intact — it carries entry order, header sectors and original GCX bytes.</p>
  </div>
  <div id="log"></div>
</main>
<footer>Formats: MGS Stage Editor suite · PSX unmodified round-trip is byte-identical · size-changing edits relocate stages sector-correctly</footer>
<script>
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\\0\\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\\b\\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\\n\\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\\0\\0\\0\\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\\0\\0\\0\\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
<\/script>
<script>
// ── GCX bundle (from MGS Stage Editor suite: 20,21,28 + GCL emitter of 27) ──
// ═══════════════════════════════════════════════════════════════════════════
// FILE: 20_gcx_disassemble.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX DISASSEMBLER (JavaScript port of disassemble.py)
// ============================================================
// Parses MGS1 .gcx binary into a structured AST.
// Cross-compatible: works on PC and PSX .gcx files (same format).
//
// AST shape:
//   GCX:    { rawSize, procSectionLen, procTable[], procTableEnd, procBodyOffset,
//             procs[], scriptBodyLen, scriptBodyOffset, scriptBody, trailing }
//   Block:  { tag, raw, fileOffset, headerSize, payload }
//   Value:  { tag, raw, kind, payload, fileOffset }
//   ProcBody: { tableEntry, preamble, blocks[], raw, fileOffset }
//
// Same module works in browser (defines globals) and Node (exports via module.exports
// at end of file).

// ---------- Constants (mirror libgcl.h) ----------

var GCL_END     = 0x00;
var GCL_SHORT   = 0x01;
var GCL_BYTE    = 0x02;
var GCL_CHAR    = 0x03;
var GCL_BOOL    = 0x04;
var GCL_VECTOR  = 0x05;
var GCL_STRID   = 0x06;
var GCL_STRING  = 0x07;
var GCL_PROCID  = 0x08;
var GCL_INT     = 0x09;
var GCL_SYMBOL  = 0x0a;

var GCL_VAR     = 0x10;
var GCL_ARRAY   = 0x20;
var GCL_EXPR    = 0x30;
var GCL_OP      = 0x31;
var GCL_ARG     = 0x40;
var GCL_OPTION  = 0x50;
var GCL_COMMAND = 0x60;
var GCL_PROC    = 0x70;

var GCX_OP_NAMES = {
  0:"END",  1:"MNS", 2:"NOT", 3:"NEG", 4:"ADD", 5:"SUB", 6:"MUL", 7:"DIV",
  8:"MOD",  9:"EQ", 10:"NE", 11:"LT", 12:"LE", 13:"GT", 14:"GE", 15:"OR",
 16:"AND", 17:"XOR", 18:"OROR", 19:"ANDAND", 20:"SET"
};

// ---------- Low-level readers ----------

function gcxBeU16(buf, off) { return (buf[off] << 8) | buf[off+1]; }
function gcxBeU32(buf, off) {
  // Use Math to avoid sign issues on 32-bit shifts
  return (buf[off] * 0x1000000) + (buf[off+1] << 16) + (buf[off+2] << 8) + buf[off+3];
}
function gcxBeI16(buf, off) {
  var v = gcxBeU16(buf, off);
  return (v & 0x8000) ? v - 0x10000 : v;
}

// ---------- Value decoder (mirror of GCL_GetNextValue) ----------

function gcxParseValue(buf, off) {
  // Returns [Value, newOff]
  var start = off;
  if (off >= buf.length) {
    return [{
      tag: GCL_END,
      raw: new Uint8Array(0),
      kind: 'eob',
      payload: null,
      fileOffset: start
    }, off];
  }

  var tag = buf[off];
  off += 1;

  // Local helper for truncated values
  function truncated() {
    return [{
      tag: tag,
      raw: buf.subarray(start),
      kind: 'truncated_0x' + tag.toString(16).padStart(2, '0'),
      payload: null,
      fileOffset: start
    }, buf.length];
  }

  // Variable refs: high nibble == GCL_VAR
  if ((tag & 0xF0) === GCL_VAR) {
    if (off + 3 > buf.length) return truncated();
    var packed = (buf[off] << 16) | (buf[off+1] << 8) | buf[off+2];
    return [{
      tag: tag,
      raw: buf.subarray(start, off + 3),
      kind: 'var',
      payload: { packed: packed },
      fileOffset: start
    }, off + 3];
  }

  if (tag === GCL_END) {
    return [{ tag: tag, raw: buf.subarray(start, off), kind: 'end',
              payload: null, fileOffset: start }, off];
  }

  if (tag === GCL_SHORT) {
    if (off + 2 > buf.length) return truncated();
    var v = gcxBeI16(buf, off);
    return [{ tag: tag, raw: buf.subarray(start, off + 2), kind: 'short',
              payload: v, fileOffset: start }, off + 2];
  }

  if (tag === GCL_INT || tag === GCL_SYMBOL) {
    if (off + 4 > buf.length) return truncated();
    var v32 = gcxBeU32(buf, off);
    var kind = (tag === GCL_INT) ? 'int' : 'symbol';
    return [{ tag: tag, raw: buf.subarray(start, off + 4), kind: kind,
              payload: v32, fileOffset: start }, off + 4];
  }

  if (tag === GCL_STRID || tag === GCL_PROCID) {
    if (off + 2 > buf.length) return truncated();
    var v16 = gcxBeU16(buf, off);
    var kind2 = (tag === GCL_STRID) ? 'strid' : 'procid';
    return [{ tag: tag, raw: buf.subarray(start, off + 2), kind: kind2,
              payload: v16, fileOffset: start }, off + 2];
  }

  if (tag === GCL_BYTE || tag === GCL_CHAR || tag === GCL_BOOL) {
    if (off + 1 > buf.length) return truncated();
    var b = buf[off];
    var k = (tag === GCL_BYTE) ? 'byte' :
            (tag === GCL_CHAR) ? 'char' : 'bool';
    return [{ tag: tag, raw: buf.subarray(start, off + 1), kind: k,
              payload: b, fileOffset: start }, off + 1];
  }

  if (tag === GCL_STRING) {
    if (off + 1 > buf.length) return truncated();
    var size = buf[off];
    if (off + 1 + size > buf.length) return truncated();
    var data = buf.subarray(off + 1, off + 1 + size);
    return [{ tag: tag, raw: buf.subarray(start, off + 1 + size), kind: 'string',
              payload: data, fileOffset: start }, off + 1 + size];
  }

  if (tag === GCL_ARRAY) {
    if (off + 1 > buf.length) return truncated();
    return [{ tag: tag, raw: buf.subarray(start, off + 1), kind: 'array',
              payload: buf[off], fileOffset: start }, off + 1];
  }

  if (tag === GCL_ARG) {
    if (off + 2 > buf.length) return truncated();
    var argSize = gcxBeU16(buf, off);
    if (off + argSize > buf.length || argSize < 2) return truncated();
    return [{ tag: tag, raw: buf.subarray(start, off + argSize), kind: 'arg',
              payload: buf.subarray(off + 2, off + argSize),
              fileOffset: start }, off + argSize];
  }

  if (tag === GCL_EXPR) {
    if (off + 1 > buf.length) return truncated();
    var exprSize = buf[off];
    if (off + exprSize > buf.length || exprSize < 1) return truncated();
    return [{ tag: tag, raw: buf.subarray(start, off + exprSize), kind: 'expr',
              payload: buf.subarray(off + 1, off + exprSize),
              fileOffset: start }, off + exprSize];
  }

  if (tag === GCL_OPTION) {
    // 3-byte marker: [tag][opt_char][marker_byte]; argument is next stream value.
    if (off + 2 > buf.length) return truncated();
    var optChar = buf[off];
    var markerByte = buf[off + 1];
    var newOff = off + 2;
    return [{ tag: tag, raw: buf.subarray(start, newOff), kind: 'option',
              payload: { optChar: optChar, markerByte: markerByte },
              fileOffset: start }, newOff];
  }

  // Unknown tag — advance 1 byte safely
  return [{
    tag: tag,
    raw: buf.subarray(start, off),
    kind: 'UNKNOWN_0x' + tag.toString(16).padStart(2, '0'),
    payload: null,
    fileOffset: start
  }, off];
}

// ---------- Stream walkers ----------

function gcxParseValueStream(buf, start, end) {
  // Returns { values: [...], consumed: <int> }
  var vals = [];
  var off = start;
  while (off < end) {
    var pair = gcxParseValue(buf, off);
    var v = pair[0];
    var newOff = pair[1];
    if (newOff === off) break;

    // Skip recursion for synthetic/truncated
    if (v.kind === 'eob' || v.kind.indexOf('truncated_') === 0) {
      vals.push(v);
      off = newOff;
      continue;
    }

    // Recurse into ARG bodies as block streams
    if (v.tag === GCL_ARG) {
      var argInner = v.payload;
      var inner = gcxParseBlockStream(argInner, 0, argInner.length);
      v.payload = { innerBlocks: inner.blocks, argBytes: argInner };
    }
    // Recurse into EXPR bodies as expression item streams
    else if (v.tag === GCL_EXPR) {
      var exprInner = v.payload;
      v.payload = { exprItems: gcxParseExprStream(exprInner), exprBytes: exprInner };
    }
    // OPTION has no embedded data — argument is next stream value. No recursion.

    vals.push(v);
    off = newOff;
  }
  return { values: vals, consumed: off - start };
}

function gcxParseExprStream(buf) {
  // Postfix stream of values and [0x31 op_code] operators
  var items = [];
  var off = 0;
  while (off < buf.length) {
    var tag = buf[off];
    if (tag === GCL_OP) {
      if (off + 2 > buf.length) {
        items.push({ kind: 'truncated_op', tag: tag, raw: buf.subarray(off) });
        break;
      }
      var op = buf[off + 1];
      items.push({ kind: 'op', opCode: op, raw: buf.subarray(off, off + 2) });
      off += 2;
    } else {
      var pair = gcxParseValue(buf, off);
      var v = pair[0];
      var newOff = pair[1];
      items.push({ kind: 'value', value: v, raw: v.raw });
      if (newOff === off) break;
      off = newOff;
    }
  }
  return items;
}

// ---------- Block decoder ----------

function gcxParseBlock(buf, off) {
  // Returns [Block|null, newOff]
  if (off >= buf.length) return [null, off];
  var start = off;
  var tag = buf[off];

  if (tag === GCL_END) {
    return [{ tag: tag, raw: buf.subarray(start, off + 1), fileOffset: start,
              headerSize: 1, payload: null }, off + 1];
  }

  if (tag === GCL_EXPR) {
    var sizeByte = buf[off + 1];
    var total = 1 + sizeByte;
    var body = buf.subarray(off + 2, off + total);
    return [{ tag: tag, raw: buf.subarray(start, off + total), fileOffset: start,
              headerSize: 2,
              payload: { exprItems: gcxParseExprStream(body), exprBytes: body }
            }, off + total];
  }

  if (tag === GCL_COMMAND) {
    var sz = gcxBeU16(buf, off + 1);
    var tot = 1 + sz;
    var b = buf.subarray(off + 3, off + tot);
    var cmdId = b.length >= 2 ? gcxBeU16(b, 0) : 0;
    var lineSkip = b.length >= 3 ? b[2] : 0;
    var sr = gcxParseValueStream(b, 3, b.length);
    return [{ tag: tag, raw: buf.subarray(start, off + tot), fileOffset: start,
              headerSize: 3,
              payload: { cmdId: cmdId, lineSkip: lineSkip, values: sr.values,
                         cmdBytes: b }
            }, off + tot];
  }

  if (tag === GCL_PROC) {
    var sb = buf[off + 1];
    var pt = 1 + sb;
    var pb = buf.subarray(off + 2, off + pt);
    var procId = pb.length >= 2 ? gcxBeU16(pb, 0) : 0;
    var psr = gcxParseValueStream(pb, 2, pb.length);
    return [{ tag: tag, raw: buf.subarray(start, off + pt), fileOffset: start,
              headerSize: 2,
              payload: { procId: procId, values: psr.values, procBytes: pb }
            }, off + pt];
  }

  if (tag === GCL_ARG) {
    var asz = gcxBeU16(buf, off + 1);
    var atot = 1 + asz;
    var abody = buf.subarray(off + 3, off + atot);
    var ibs = gcxParseBlockStream(abody, 0, abody.length);
    return [{ tag: tag, raw: buf.subarray(start, off + atot), fileOffset: start,
              headerSize: 3,
              payload: { innerBlocks: ibs.blocks, argBytes: abody }
            }, off + atot];
  }

  // Unknown block tag — return marker, advance 1 byte
  return [{ tag: tag, raw: buf.subarray(start, off + 1), fileOffset: start,
            headerSize: 1,
            payload: { error: 'unknown_block_tag_0x' + tag.toString(16) }
          }, off + 1];
}

function gcxParseBlockStream(buf, start, end) {
  var blocks = [];
  var off = start;
  while (off < end) {
    var pair = gcxParseBlock(buf, off);
    if (pair[0] === null || pair[1] === off) break;
    blocks.push(pair[0]);
    off = pair[1];
  }
  return { blocks: blocks, consumed: off - start };
}

// ---------- Top-level file parser ----------

function gcxParseGCX(buf) {
  // buf is Uint8Array. Returns full GCX AST.
  var procSectionLen = gcxBeU32(buf, 0);

  // proc_table: (u16 proc_id, u16 offset) entries until 4 zero bytes
  var tableOff = 4;
  var table = [];
  while (tableOff + 4 <= buf.length) {
    var word = gcxBeU32(buf, tableOff);
    if (word === 0) break;
    table.push({
      procId: gcxBeU16(buf, tableOff),
      offset: gcxBeU16(buf, tableOff + 2)
    });
    tableOff += 4;
  }
  var procTableEnd = tableOff + 4;
  var procBodyBase = procTableEnd;
  var procBodyEnd = 4 + procSectionLen;

  // Parse each proc body in offset order
  var procs = [];
  var sortedEntries = table.map(function(e, i) { return {entry: e, origIdx: i}; })
                           .sort(function(a, b) { return a.entry.offset - b.entry.offset; });
  for (var i = 0; i < sortedEntries.length; i++) {
    var entry = sortedEntries[i].entry;
    var bodyStart = procBodyBase + entry.offset;
    var bodyEnd = (i + 1 < sortedEntries.length)
      ? procBodyBase + sortedEntries[i + 1].entry.offset
      : procBodyEnd;
    var bodyBytes = buf.subarray(bodyStart, bodyEnd);
    var bs = gcxParseBlockStream(bodyBytes, 0, bodyBytes.length);
    procs.push({
      tableEntry: entry,
      preamble: bodyBytes.subarray(0, Math.min(3, bodyBytes.length)),
      blocks: bs.blocks,
      raw: bodyBytes,
      fileOffset: bodyStart
    });
  }

  // script_body
  var scriptLenOff = 4 + procSectionLen;
  if (scriptLenOff + 4 > buf.length) {
    throw new Error('script_body_len beyond file size');
  }
  var scriptBodyLen = gcxBeU32(buf, scriptLenOff);
  var scriptBodyOff = scriptLenOff + 4;
  var scriptBodyEnd = scriptBodyOff + scriptBodyLen;
  var scriptBodyBytes = buf.subarray(scriptBodyOff, scriptBodyEnd);
  var sbs = gcxParseBlockStream(scriptBodyBytes, 0, scriptBodyBytes.length);
  var scriptBody = {
    tableEntry: { procId: 0, offset: 0 },
    preamble: scriptBodyBytes.subarray(0, Math.min(3, scriptBodyBytes.length)),
    blocks: sbs.blocks,
    raw: scriptBodyBytes,
    fileOffset: scriptBodyOff
  };

  var trailing = buf.subarray(scriptBodyEnd);

  return {
    rawSize: buf.length,
    procSectionLen: procSectionLen,
    procTable: table,
    procTableEnd: procTableEnd,
    procBodyOffset: procBodyBase,
    procs: procs,
    scriptBodyLen: scriptBodyLen,
    scriptBodyOffset: scriptBodyOff,
    scriptBody: scriptBody,
    trailing: trailing
  };
}

// ---------- Node export ----------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Constants
    GCL_END: GCL_END, GCL_SHORT: GCL_SHORT, GCL_BYTE: GCL_BYTE, GCL_CHAR: GCL_CHAR,
    GCL_BOOL: GCL_BOOL, GCL_VECTOR: GCL_VECTOR, GCL_STRID: GCL_STRID,
    GCL_STRING: GCL_STRING, GCL_PROCID: GCL_PROCID, GCL_INT: GCL_INT,
    GCL_SYMBOL: GCL_SYMBOL, GCL_VAR: GCL_VAR, GCL_ARRAY: GCL_ARRAY,
    GCL_EXPR: GCL_EXPR, GCL_OP: GCL_OP, GCL_ARG: GCL_ARG, GCL_OPTION: GCL_OPTION,
    GCL_COMMAND: GCL_COMMAND, GCL_PROC: GCL_PROC,
    GCX_OP_NAMES: GCX_OP_NAMES,
    // Functions
    gcxBeU16: gcxBeU16, gcxBeU32: gcxBeU32, gcxBeI16: gcxBeI16,
    gcxParseValue: gcxParseValue,
    gcxParseValueStream: gcxParseValueStream,
    gcxParseExprStream: gcxParseExprStream,
    gcxParseBlock: gcxParseBlock,
    gcxParseBlockStream: gcxParseBlockStream,
    gcxParseGCX: gcxParseGCX
  };
}

// ============================================================

// ═══════════════════════════════════════════════════════════════════════════
// FILE: 21_gcx_assemble.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX ENCODER (JavaScript port of assemble.py)
// ============================================================
// Re-emits a .gcx byte stream from the structured AST produced by disassemble.js.
// Byte-identical for unmodified ASTs.
//
// In browser: relies on globals defined by disassemble.js (loaded first).
// In Node: loads disassemble.js via require.

(function(global) {
  var _C;
  // Prefer already-defined globals (browser concatenated build, or Node tests
  // that loaded disassemble.js first). Only fall back to require() if globals
  // aren't set AND we're in Node.
  if (typeof GCL_END !== 'undefined') {
    _C = { GCL_END: GCL_END, GCL_SHORT: GCL_SHORT, GCL_BYTE: GCL_BYTE,
           GCL_CHAR: GCL_CHAR, GCL_BOOL: GCL_BOOL, GCL_STRID: GCL_STRID,
           GCL_STRING: GCL_STRING, GCL_PROCID: GCL_PROCID, GCL_INT: GCL_INT,
           GCL_SYMBOL: GCL_SYMBOL, GCL_VAR: GCL_VAR, GCL_ARRAY: GCL_ARRAY,
           GCL_EXPR: GCL_EXPR, GCL_OP: GCL_OP, GCL_ARG: GCL_ARG,
           GCL_OPTION: GCL_OPTION, GCL_COMMAND: GCL_COMMAND, GCL_PROC: GCL_PROC };
  } else if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    _C = require('./disassemble.js');
  } else {
    _C = global;
  }

  var GCL_END     = _C.GCL_END;
  var GCL_SHORT   = _C.GCL_SHORT;
  var GCL_BYTE    = _C.GCL_BYTE;
  var GCL_CHAR    = _C.GCL_CHAR;
  var GCL_BOOL    = _C.GCL_BOOL;
  var GCL_STRID   = _C.GCL_STRID;
  var GCL_STRING  = _C.GCL_STRING;
  var GCL_PROCID  = _C.GCL_PROCID;
  var GCL_INT     = _C.GCL_INT;
  var GCL_SYMBOL  = _C.GCL_SYMBOL;
  var GCL_VAR     = _C.GCL_VAR;
  var GCL_ARRAY   = _C.GCL_ARRAY;
  var GCL_EXPR    = _C.GCL_EXPR;
  var GCL_OP      = _C.GCL_OP;
  var GCL_ARG     = _C.GCL_ARG;
  var GCL_OPTION  = _C.GCL_OPTION;
  var GCL_COMMAND = _C.GCL_COMMAND;
  var GCL_PROC    = _C.GCL_PROC;

  function writeBeU16(out, v) {
    out.push((v >>> 8) & 0xFF, v & 0xFF);
  }
  function writeBeU32(out, v) {
    out.push(Math.floor(v / 0x1000000) & 0xFF,
             (v >>> 16) & 0xFF,
             (v >>> 8) & 0xFF,
             v & 0xFF);
  }

  function gcxEncodeValue(v) {
    var tag = v.tag;

    if (v.kind === 'eob' || v.kind.indexOf('truncated_') === 0
        || v.kind.indexOf('UNKNOWN_') === 0) {
      return Array.from(v.raw);
    }

    if ((tag & 0xF0) === GCL_VAR) {
      var packed = v.payload.packed;
      return [tag, (packed >> 16) & 0xFF, (packed >> 8) & 0xFF, packed & 0xFF];
    }

    if (tag === GCL_END) return [tag];

    if (tag === GCL_SHORT) {
      var val16 = v.payload & 0xFFFF;
      return [tag, (val16 >> 8) & 0xFF, val16 & 0xFF];
    }

    if (tag === GCL_INT || tag === GCL_SYMBOL) {
      var val32 = v.payload >>> 0;
      return [tag,
        Math.floor(val32 / 0x1000000) & 0xFF,
        (val32 >>> 16) & 0xFF,
        (val32 >>> 8) & 0xFF,
        val32 & 0xFF];
    }

    if (tag === GCL_STRID || tag === GCL_PROCID) {
      var sv = v.payload & 0xFFFF;
      return [tag, (sv >> 8) & 0xFF, sv & 0xFF];
    }

    if (tag === GCL_BYTE || tag === GCL_CHAR || tag === GCL_BOOL) {
      return [tag, v.payload & 0xFF];
    }

    if (tag === GCL_STRING) {
      var data = v.payload;
      var out = [tag, data.length & 0xFF];
      for (var i = 0; i < data.length; i++) out.push(data[i]);
      return out;
    }

    if (tag === GCL_ARRAY) return [tag, v.payload & 0xFF];

    if (tag === GCL_ARG) {
      var inner;
      if (v.payload && v.payload.innerBlocks) {
        inner = [];
        for (var j = 0; j < v.payload.innerBlocks.length; j++) {
          var blk = gcxEncodeBlock(v.payload.innerBlocks[j]);
          for (var k = 0; k < blk.length; k++) inner.push(blk[k]);
        }
      } else {
        inner = v.payload && v.payload.argBytes
          ? Array.from(v.payload.argBytes)
          : (v.payload instanceof Uint8Array ? Array.from(v.payload) : []);
      }
      var argSize = inner.length + 2;
      var result = [tag, (argSize >> 8) & 0xFF, argSize & 0xFF];
      for (var i2 = 0; i2 < inner.length; i2++) result.push(inner[i2]);
      return result;
    }

    if (tag === GCL_EXPR) {
      var ebytes;
      if (v.payload && v.payload.exprItems) {
        ebytes = encodeExprStream(v.payload.exprItems);
      } else {
        ebytes = v.payload && v.payload.exprBytes
          ? Array.from(v.payload.exprBytes)
          : (v.payload instanceof Uint8Array ? Array.from(v.payload) : []);
      }
      var esize = ebytes.length + 1;
      var er = [tag, esize & 0xFF];
      for (var ii = 0; ii < ebytes.length; ii++) er.push(ebytes[ii]);
      return er;
    }

    if (tag === GCL_OPTION) {
      return [tag, v.payload.optChar & 0xFF, v.payload.markerByte & 0xFF];
    }

    throw new Error('gcxEncodeValue: unknown tag 0x' + tag.toString(16));
  }

  function encodeExprStream(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'value') {
        var vb = gcxEncodeValue(it.value);
        for (var j = 0; j < vb.length; j++) out.push(vb[j]);
      } else if (it.kind === 'op') {
        out.push(GCL_OP, it.opCode & 0xFF);
      } else if (it.kind === 'truncated_op') {
        for (var k = 0; k < it.raw.length; k++) out.push(it.raw[k]);
      }
    }
    return out;
  }

  function gcxEncodeBlock(b) {
    var tag = b.tag;

    if (tag === GCL_END) return [tag];

    if (tag === GCL_EXPR) {
      var ebytes;
      if (b.payload && b.payload.exprItems) {
        ebytes = encodeExprStream(b.payload.exprItems);
      } else {
        ebytes = Array.from(b.payload.exprBytes || new Uint8Array(0));
      }
      var esize = ebytes.length + 1;
      var er = [tag, esize & 0xFF];
      for (var i = 0; i < ebytes.length; i++) er.push(ebytes[i]);
      return er;
    }

    if (tag === GCL_COMMAND) {
      var data;
      if (b.payload && b.payload.values) {
        var cmdId = b.payload.cmdId;
        var lineSkip = b.payload.lineSkip;
        data = [(cmdId >> 8) & 0xFF, cmdId & 0xFF, lineSkip & 0xFF];
        for (var j = 0; j < b.payload.values.length; j++) {
          var vb = gcxEncodeValue(b.payload.values[j]);
          for (var k = 0; k < vb.length; k++) data.push(vb[k]);
        }
      } else {
        data = Array.from(b.payload.cmdBytes || new Uint8Array(0));
      }
      var sz = data.length + 2;
      var rr = [tag, (sz >> 8) & 0xFF, sz & 0xFF];
      for (var m = 0; m < data.length; m++) rr.push(data[m]);
      return rr;
    }

    if (tag === GCL_PROC) {
      var pdata;
      if (b.payload && b.payload.values) {
        var procId = b.payload.procId;
        pdata = [(procId >> 8) & 0xFF, procId & 0xFF];
        for (var j2 = 0; j2 < b.payload.values.length; j2++) {
          var vb2 = gcxEncodeValue(b.payload.values[j2]);
          for (var k2 = 0; k2 < vb2.length; k2++) pdata.push(vb2[k2]);
        }
      } else {
        pdata = Array.from(b.payload.procBytes || new Uint8Array(0));
      }
      var ps = pdata.length + 1;
      var pr = [tag, ps & 0xFF];
      for (var m2 = 0; m2 < pdata.length; m2++) pr.push(pdata[m2]);
      return pr;
    }

    if (tag === GCL_ARG) {
      var adata;
      if (b.payload && b.payload.innerBlocks) {
        adata = [];
        for (var n = 0; n < b.payload.innerBlocks.length; n++) {
          var ib = gcxEncodeBlock(b.payload.innerBlocks[n]);
          for (var o = 0; o < ib.length; o++) adata.push(ib[o]);
        }
      } else {
        adata = Array.from(b.payload.argBytes || new Uint8Array(0));
      }
      var asz = adata.length + 2;
      var ar = [tag, (asz >> 8) & 0xFF, asz & 0xFF];
      for (var p = 0; p < adata.length; p++) ar.push(adata[p]);
      return ar;
    }

    throw new Error('gcxEncodeBlock: unknown tag 0x' + tag.toString(16));
  }

  function gcxEncodeProcBody(pb) {
    var out = [];
    for (var i = 0; i < pb.blocks.length; i++) {
      var b = gcxEncodeBlock(pb.blocks[i]);
      for (var j = 0; j < b.length; j++) out.push(b[j]);
    }
    return out;
  }

  function gcxEncodeGCX(gcx) {
    var out = [];
    writeBeU32(out, gcx.procSectionLen);

    for (var i = 0; i < gcx.procTable.length; i++) {
      var e = gcx.procTable[i];
      writeBeU16(out, e.procId);
      writeBeU16(out, e.offset);
    }
    out.push(0, 0, 0, 0);

    var sortedProcs = gcx.procs.slice().sort(function(a, b) {
      return a.fileOffset - b.fileOffset;
    });
    for (var j = 0; j < sortedProcs.length; j++) {
      var pb = gcxEncodeProcBody(sortedProcs[j]);
      for (var k = 0; k < pb.length; k++) out.push(pb[k]);
    }

    writeBeU32(out, gcx.scriptBodyLen);
    var sb = gcxEncodeProcBody(gcx.scriptBody);
    for (var m = 0; m < sb.length; m++) out.push(sb[m]);

    if (gcx.trailing) {
      for (var n = 0; n < gcx.trailing.length; n++) out.push(gcx.trailing[n]);
    }

    return new Uint8Array(out);
  }

  var api = {
    gcxEncodeValue: gcxEncodeValue,
    gcxEncodeBlock: gcxEncodeBlock,
    gcxEncodeProcBody: gcxEncodeProcBody,
    gcxEncodeGCX: gcxEncodeGCX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    for (var key in api) {
      if (api.hasOwnProperty(key)) global[key] = api[key];
    }
  }
})(typeof window !== 'undefined' ? window : this);

// ============================================================

// ═══════════════════════════════════════════════════════════════════════════
// FILE: 28_gcx_text_compiler.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX TEXT COMPILER  —  Session 1: AST-guided round-trip
// ============================================================
// Parses the text produced by buildGCXTextHTML (after stripping HTML to
// plain text) into a new AST that gcxEncodeGCX can re-emit byte-identically.
//
// Approach:
//   - Lexer turns text into tokens (IDENT, NUMBER, HEX, OPTION, REF, ...)
//   - Parser walks tokens IN PARALLEL with the original AST. The original
//     provides the BYTE-LEVEL TYPE for each value, so we can reconstruct
//     things like SHORT vs BYTE from a bare integer token. The text provides
//     the (possibly edited) VALUE.
//
// Same-structure edits are fully supported. Structural changes (adding/
// deleting commands, reordering procs) are rejected with a clear message —
// that's Session 2's deliverable.

(function(global) {

  var OP_NAME_TO_CODE = {
    'END':0,'NEG':1,'NOT':2,'CPL':3,
    '+':4,'-':5,'*':6,'/':7,'%':8,
    '==':9,'!=':10,'<':11,'<=':12,'>':13,'>=':14,
    '|':15,'&':16,'^':17,'||':18,'&&':19,'=':20
  };
  var MULTI_CHAR_OPS = ['==','!=','<=','>=','||','&&'];
  var SINGLE_CHAR_OPS = '+-*/%<>|&^=';

  // ---------- Lexer ----------

  function gcxLexText(text) {
    var toks = [];
    var i = 0, n = text.length;
    var line = 1, col = 1;
    var insideExpr = 0;

    function isAlpha(c) { return /[a-zA-Z_]/.test(c); }
    function isDigit(c) { return /[0-9]/.test(c); }
    function isAlnum(c) { return /[a-zA-Z0-9_]/.test(c); }

    function push(kind, txt) { toks.push({ kind: kind, text: txt, line: line, col: col }); }

    while (i < n) {
      var c = text[i];
      if (c === '\\n') { i++; line++; col = 1; continue; }
      if (c === ' ' || c === '\\t' || c === '\\r') { i++; col++; continue; }
      if (c === '#') { while (i < n && text[i] !== '\\n') i++; continue; }
      if (c === '/' && text[i+1] === '/') { while (i < n && text[i] !== '\\n') i++; continue; }
      if (c === '/' && text[i+1] === '*') {
        i += 2; col += 2;
        while (i+1 < n && !(text[i] === '*' && text[i+1] === '/')) {
          if (text[i] === '\\n') { line++; col = 1; } else col++;
          i++;
        }
        if (i+1 < n) { i += 2; col += 2; }
        continue;
      }
      if (c === '{') { push('LBRACE','{'); i++; col++; continue; }
      if (c === '}') { push('RBRACE','}'); i++; col++; continue; }
      if (c === '[') { push('LBRACKET','['); i++; col++; insideExpr++; continue; }
      if (c === ']') { push('RBRACKET',']'); i++; col++; insideExpr = Math.max(0, insideExpr-1); continue; }
      if (c === '"') {
        var s = i; i++; col++;
        while (i < n && text[i] !== '"') {
          if (text[i] === '\\\\' && i+1 < n) { i += 2; col += 2; }
          else { i++; col++; }
        }
        if (i < n) { i++; col++; }
        push('STRING', text.substring(s, i));
        continue;
      }
      if (c === "'") {
        var s2 = i; i++; col++;
        while (i < n && text[i] !== "'") { i++; col++; }
        if (i < n) { i++; col++; }
        push('CHAR', text.substring(s2, i));
        continue;
      }
      // Compound refs
      var rest = text.substring(i);
      var m;
      if ((m = /^\\$[0-9a-fA-F]:0x[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^[a-zA-Z_][a-zA-Z_0-9]*:0x[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^t:[0-9a-fA-F]+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^arg\\d+/.exec(rest))) { push('REF', m[0]); i += m[0].length; col += m[0].length; continue; }

      // Inside expressions: operators
      if (insideExpr > 0) {
        var consumed = false;
        for (var mi = 0; mi < MULTI_CHAR_OPS.length; mi++) {
          var mop = MULTI_CHAR_OPS[mi];
          if (text.substr(i, mop.length) === mop) {
            push('OP_SYMBOL', mop); i += mop.length; col += mop.length; consumed = true; break;
          }
        }
        if (consumed) continue;
        if (SINGLE_CHAR_OPS.indexOf(c) >= 0) {
          push('OP_SYMBOL', c); i++; col++; continue;
        }
      }
      // Option marker -X (outside expressions)
      if (c === '-' && i+1 < n && isAlpha(text[i+1]) && (i+2 >= n || !isAlnum(text[i+2]))) {
        push('OPTION', '-' + text[i+1]); i += 2; col += 2; continue;
      }
      // Negative number
      if (c === '-' && i+1 < n && isDigit(text[i+1])) {
        m = /^-\\d+/.exec(rest); push('NUMBER', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      // Positive numbers
      if (isDigit(c)) {
        if ((m = /^0x[0-9a-fA-F]+/.exec(rest))) { push('HEX', m[0]); i += m[0].length; col += m[0].length; continue; }
        m = /^\\d+/.exec(rest); push('NUMBER', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      // Identifier
      if (isAlpha(c) || c === '_') {
        m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(rest); push('IDENT', m[0]); i += m[0].length; col += m[0].length; continue;
      }
      throw new Error('gcxLexText: unrecognized character ' + JSON.stringify(c) + ' at line ' + line + ' col ' + col);
    }
    push('EOF', '');
    return toks;
  }

  // ---------- Tag constants ----------

  var T_END = 0x00, T_SHORT = 0x01, T_BYTE = 0x02, T_CHAR = 0x03, T_BOOL = 0x04;
  var T_STRID = 0x06, T_STRING = 0x07, T_PROCID = 0x08, T_INT = 0x09, T_SYMBOL = 0x0a;
  var T_VAR = 0x10, T_ARRAY = 0x20, T_EXPR = 0x30;
  var T_ARG = 0x40, T_OPTION = 0x50, T_COMMAND = 0x60, T_PROC = 0x70;

  // ---------- Value reconstruction ----------

  function _parsePayloadFromText(tok, tag) {
    var text = tok.text;
    try {
      if (tag === T_SHORT) return parseInt(text, 10) | 0;
      if (tag === T_BYTE || tag === T_ARRAY) {
        if (tok.kind === 'REF' && text.indexOf('arg') === 0) return parseInt(text.substring(3), 10) & 0xFF;
        return parseInt(text, 10) & 0xFF;
      }
      if (tag === T_CHAR) {
        if (tok.kind === 'CHAR' && text.length >= 3) return text.charCodeAt(1);
        if (tok.kind === 'HEX') return parseInt(text, 16) & 0xFF;
        return parseInt(text, 10) & 0xFF;
      }
      if (tag === T_BOOL) return (text === 'true') ? 1 : 0;
      if (tag === T_INT) return (text.indexOf('0x') === 0 ? parseInt(text, 16) : parseInt(text, 10)) >>> 0;
      if (tag === T_SYMBOL) {
        if (text.indexOf('t:') === 0) return parseInt(text.substring(2), 16) >>> 0;
        return parseInt(text, 16) >>> 0;
      }
      if (tag === T_STRID || tag === T_PROCID) {
        var mm = /0x([0-9a-fA-F]+)/.exec(text);
        if (mm) return parseInt(mm[1], 16) & 0xFFFF;
        return null;
      }
      if (tag === T_STRING) {
        if (!(text.charAt(0) === '"' && text.charAt(text.length-1) === '"')) return null;
        var inner = text.substring(1, text.length - 1);
        var buf = [];
        var j = 0;
        while (j < inner.length) {
          if (inner.charAt(j) === '\\\\' && j+1 < inner.length && inner.charAt(j+1) === 'x') {
            buf.push(parseInt(inner.substr(j+2, 2), 16) & 0xFF);
            j += 4;
          } else {
            buf.push(inner.charCodeAt(j) & 0xFF);
            j++;
          }
        }
        buf.push(0);
        return new Uint8Array(buf);
      }
      if ((tag & 0xF0) === T_VAR) {
        var vm = /^\\$[0-9a-fA-F]:0x([0-9a-fA-F]+)/.exec(text);
        if (vm) return { packed: parseInt(vm[1], 16) & 0xFFFFFF };
        return null;
      }
    } catch (e) { return null; }
    return null;
  }

  function _buildValueFromTokenAndOrig(tok, origV, warnings) {
    var newPayload = _parsePayloadFromText(tok, origV.tag);
    if (newPayload === null) {
      warnings.push('Line ' + tok.line + ': token ' + JSON.stringify(tok.text) + ' unparseable as ' + origV.kind + '; kept original');
      newPayload = origV.payload;
    }
    return {
      tag: origV.tag, raw: new Uint8Array(0), kind: origV.kind,
      payload: newPayload, fileOffset: 0
    };
  }

  // ---------- Templates for structural edits ----------
  // Build a cmdId → template-command map by walking origGcx. We pick the
  // command instance with the MOST values for each cmdId — that gives the
  // richest type schema for inserted commands.
  function _buildCmdTemplates(origGcx) {
    var templates = {};
    function walk(blocks) {
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.tag === T_COMMAND) {
          var cid = b.payload.cmdId;
          if (!templates[cid] || b.payload.values.length > templates[cid].payload.values.length) {
            templates[cid] = b;
          }
          // Recurse into ARGs inside this command
          for (var j = 0; j < b.payload.values.length; j++) {
            var v = b.payload.values[j];
            if (v.tag === T_ARG && v.payload.innerBlocks) walk(v.payload.innerBlocks);
          }
        } else if (b.tag === T_ARG && b.payload.innerBlocks) {
          walk(b.payload.innerBlocks);
        }
      }
    }
    origGcx.procs.forEach(function(p) { walk(p.blocks); });
    walk(origGcx.scriptBody.blocks);
    return templates;
  }

  // Find the cmdId for a name token by checking templates. (We could also use
  // global.gcxCmdNames if exposed, but templates are guaranteed correct.)
  function _cmdIdFromName(name, templates) {
    if (!global.gcxCmdNames) {
      // Fallback: parse "cmd_0xNNNN" form
      var m = /^cmd_0x([0-9a-fA-F]+)$/.exec(name);
      if (m) return parseInt(m[1], 16);
      return null;
    }
    for (var id in global.gcxCmdNames) {
      if (global.gcxCmdNames[id] === name) {
        var idn = parseInt(id);
        // Prefer cmdIds we actually have templates for
        if (templates[idn]) return idn;
      }
    }
    // Maybe an unknown command, parse hex form
    var hm = /^cmd_0x([0-9a-fA-F]+)$/.exec(name);
    if (hm) return parseInt(hm[1], 16);
    return null;
  }

  // Check if a peek'd text token COULD be the same block-kind as origBlk
  // (used for alignment after a drift).
  function _peekMatchesOrigBlock(token, origBlk) {
    if (!origBlk || !token) return false;
    if (token.kind === 'IDENT' && token.text === 'end')     return origBlk.tag === T_END;
    if (token.kind === 'IDENT' && token.text === 'expr')    return origBlk.tag === T_EXPR;
    if (token.kind === 'LBRACE')                            return origBlk.tag === T_ARG;
    if (token.kind === 'IDENT' && token.text === 'call')    return origBlk.tag === T_PROC;
    if (token.kind === 'IDENT' && origBlk.tag === T_COMMAND) {
      var n = global.gcxCmdNames && global.gcxCmdNames[origBlk.payload.cmdId];
      var hexName = 'cmd_0x' + origBlk.payload.cmdId.toString(16).padStart(4,'0');
      return token.text === n || token.text === hexName;
    }
    return false;
  }

  // Infer a value's tag (T_*) from its token form alone — used by the freeform
  // parser when no template values are available or when text has more tokens
  // than the template covers (e.g., a chara line with options not in template).
  function _inferTagFromToken(token) {
    if (token.kind === 'STRING') return T_STRING;
    if (token.kind === 'CHAR')   return T_CHAR;
    if (token.kind === 'OPTION') return T_OPTION;
    if (token.kind === 'NUMBER') return T_SHORT;  // most common; explicit cast via 0xNN can override
    if (token.kind === 'HEX') {
      var v = parseInt(token.text, 16);
      if (v > 0xFFFF) return T_INT;
      return T_SHORT;  // small hex defaults to SHORT (chara strid, etc.)
    }
    if (token.kind === 'IDENT') {
      if (token.text === 'true' || token.text === 'false') return T_BOOL;
      return null;
    }
    if (token.kind === 'REF') {
      // Distinguish by prefix
      if (/^\\$[0-9a-fA-F]:/.test(token.text)) {
        // $N:0xNNNNNN → VAR with sub-type N
        var subType = parseInt(token.text.charAt(1), 16) & 0x0F;
        return T_VAR | subType;
      }
      if (/^proc:/.test(token.text))   return T_PROCID;
      if (/^t:/.test(token.text))      return T_SYMBOL;
      if (/^strid:/.test(token.text))  return T_STRID;
      if (/^arg\\d+$/.test(token.text)) return T_ARRAY;
      // UPPER:0xNNNN form (e.g. WATCHER:0x6e9a) → STRID
      if (/^[A-Z][A-Z_0-9]*:0x/.test(token.text)) return T_STRID;
      return null;
    }
    if (token.kind === 'LBRACKET') return T_EXPR;
    return null;
  }

  // Build a payload from a token using the inferred tag.
  function _buildValueFromTokenInferred(token, warnings) {
    var tag = _inferTagFromToken(token);
    if (tag === null) {
      warnings.push('Line ' + token.line + ': cannot infer type for token ' + JSON.stringify(token.text));
      return null;
    }
    var payload = _parsePayloadFromText(token, tag);
    if (payload === null) {
      warnings.push('Line ' + token.line + ': inferred tag 0x' + tag.toString(16) + ' but payload unparseable');
      return null;
    }
    var kind;
    if (tag === T_SHORT) kind = 'short';
    else if (tag === T_INT) kind = 'int';
    else if (tag === T_CHAR) kind = 'char';
    else if (tag === T_BOOL) kind = 'bool';
    else if (tag === T_STRING) kind = 'string';
    else if (tag === T_STRID) kind = 'strid';
    else if (tag === T_PROCID) kind = 'procid';
    else if (tag === T_SYMBOL) kind = 'symbol';
    else if (tag === T_ARRAY) kind = 'array';
    else if ((tag & 0xF0) === T_VAR) kind = 'var';
    else kind = 'value';
    return { tag: tag, raw: new Uint8Array(0), kind: kind, payload: payload, fileOffset: 0 };
  }

  // Detect if a token at this position marks the START of a NEW block
  // (and therefore END of the current command).
  function _tokenStartsNewBlock(token, templates) {
    if (!token) return true;
    if (token.kind === 'EOF') return true;
    if (token.kind === 'RBRACE') return true;
    if (token.kind === 'LBRACE') return false;  // LBRACE belongs to current cmd as ARG
    if (token.kind === 'IDENT') {
      if (token.text === 'end' || token.text === 'expr' || token.text === 'call' || token.text === 'proc' || token.text === 'script') return true;
      // Check if it's a command name (in templates registry)
      if (templates) {
        for (var id in templates) {
          if (global.gcxCmdNames && global.gcxCmdNames[id] === token.text) return true;
        }
        if (/^cmd_0x[0-9a-fA-F]+$/.test(token.text)) return true;
      }
    }
    return false;
  }
  // Formulas derived from WantedThing's compiler. Used for newly-inserted blocks
  // (the original parallel-walk preserves lineSkip from refs for unchanged ones).
  var GCX_IF_CMD_ID = 0x0d86;

  function _gcxComputeLineSkip(values, cmdId) {
    if (typeof gcxEncodeValue !== 'function') return 1;
    var preOptBytes = 0, sawOption = false, nonOptArgCount = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v.tag === T_OPTION) { sawOption = true; break; }
      if (v.tag === T_END)    break;
      preOptBytes += gcxEncodeValue(v).length;
      nonOptArgCount++;
    }
    var skip = preOptBytes + 1;
    if (cmdId === GCX_IF_CMD_ID && !sawOption && nonOptArgCount === 2) skip += 1;
    return skip & 0xFF;
  }

  function _gcxComputeMarkerByte(values, optionIdx, cmdId, refOption) {
    if (refOption && refOption.payload && refOption.payload.markerByte === 0) return 0;
    if (typeof gcxEncodeValue !== 'function') return 1;
    var argBytes = 0, isLast = true, optArgCount = 0;
    for (var i = optionIdx + 1; i < values.length; i++) {
      var v = values[i];
      if (v.tag === T_OPTION) { isLast = false; break; }
      if (v.tag === T_END)    break;
      argBytes += gcxEncodeValue(v).length;
      optArgCount++;
    }
    var marker = argBytes + 1;
    if (cmdId === GCX_IF_CMD_ID && isLast) {
      var optCh = String.fromCharCode(values[optionIdx].payload.optChar);
      if ((optCh === 'i' && optArgCount === 2) || (optCh === 'e' && optArgCount === 1)) marker += 1;
    }
    return marker & 0xFF;
  }

  // After parsing, walk the result and (a) recompute lineSkip for any command
  // whose flag is set, (b) recompute markerByte for OPTIONs in such commands.
  function _gcxRecomputeSkipsInPlace(blocks) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.tag === T_COMMAND) {
        if (b._needsRecompute) {
          b.payload.lineSkip = _gcxComputeLineSkip(b.payload.values, b.payload.cmdId);
          for (var j = 0; j < b.payload.values.length; j++) {
            var v = b.payload.values[j];
            if (v.tag === T_OPTION) {
              v.payload.markerByte = _gcxComputeMarkerByte(b.payload.values, j, b.payload.cmdId, v._refOpt || null);
            }
          }
          delete b._needsRecompute;
        }
        // Recurse into ARGs inside this command
        for (var k = 0; k < b.payload.values.length; k++) {
          var vv = b.payload.values[k];
          if (vv.tag === T_ARG && vv.payload.innerBlocks) _gcxRecomputeSkipsInPlace(vv.payload.innerBlocks);
        }
      } else if (b.tag === T_ARG && b.payload.innerBlocks) {
        _gcxRecomputeSkipsInPlace(b.payload.innerBlocks);
      }
    }
  }

  // ---------- Freeform block parser (for inserted blocks) ----------
  // Parses a block from text alone using TYPE INFERENCE per token. Used when
  // text adds blocks not in the original AST. Supports arbitrary value
  // sequences (including options in any order/count) and EXPR/ARG children.
  function _parseBlockFreeform(ctx, templates) {
    var t = ctx.peek();
    if (t.kind === 'IDENT' && t.text === 'end') {
      ctx.consume();
      return { tag: T_END, raw: new Uint8Array(0), fileOffset: 0, headerSize: 1, payload: null };
    }
    if (t.kind === 'IDENT' && t.text === 'expr') {
      throw new Error('gcxParseText: line ' + t.line + ': standalone \`expr\` insertion not supported yet');
    }
    if (t.kind === 'LBRACE') {
      throw new Error('gcxParseText: line ' + t.line + ': standalone \`{...}\` ARG insertion not supported');
    }
    if (t.kind === 'IDENT' && t.text === 'call') {
      throw new Error('gcxParseText: line ' + t.line + ': \`call\` block insertion not supported yet');
    }
    if (t.kind === 'IDENT') {
      var name = t.text;
      var cmdId = _cmdIdFromName(name, templates);
      if (cmdId === null || cmdId === undefined) {
        throw new Error('gcxParseText: line ' + t.line + ': unknown command name \`' + name + '\`');
      }
      ctx.consume();
      var values = _parseCommandValuesFreeform(ctx, cmdId, templates);
      var cmd = { tag: T_COMMAND, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
                  payload: { cmdId: cmdId, lineSkip: 0,  // recomputed below
                             values: values, cmdBytes: new Uint8Array(0) },
                  _needsRecompute: true };
      return cmd;
    }
    throw new Error('gcxParseText: line ' + t.line + ': unexpected token ' + t.kind);
  }

  // Parse command values via token-driven type inference. Walks tokens until
  // we hit a "new block" boundary (next command, end, expr, call, RBRACE, EOF).
  function _parseCommandValuesFreeform(ctx, cmdId, templates) {
    var values = [];
    while (true) {
      var t = ctx.peek();
      if (_tokenStartsNewBlock(t, templates)) break;
      if (t.kind === 'LBRACE') {
        // ARG block — must have a template to know inner structure
        // For freeform: parse children using full freeform recursion
        ctx.consume();  // LBRACE
        var inner = _parseBlockListFreeform(ctx, templates);
        ctx.expect('RBRACE');
        values.push({ tag: T_ARG, raw: new Uint8Array(0), kind: 'arg',
                      payload: { innerBlocks: inner, argBytes: new Uint8Array(0) }, fileOffset: 0 });
        continue;
      }
      if (t.kind === 'LBRACKET') {
        // EXPR block — parse via expression bracket parser
        var items = _parseExprBracketsFreeform(ctx);
        values.push({ tag: T_EXPR, raw: new Uint8Array(0), kind: 'expr',
                      payload: { exprItems: items, exprBytes: new Uint8Array(0) }, fileOffset: 0 });
        continue;
      }
      if (t.kind === 'OPTION') {
        ctx.consume();
        values.push({ tag: T_OPTION, raw: new Uint8Array(0), kind: 'option',
                      payload: { optChar: t.text.charCodeAt(1), markerByte: 4 },
                      fileOffset: 0 });  // markerByte recomputed by _gcxRecomputeSkipsInPlace
        continue;
      }
      // Scalar value via type inference
      var v = _buildValueFromTokenInferred(t, ctx.warnings);
      if (!v) {
        // Couldn't infer — consume and skip with warning
        ctx.warnings.push('Line ' + t.line + ': skipping unparseable token ' + JSON.stringify(t.text));
        ctx.consume();
        continue;
      }
      ctx.consume();
      values.push(v);
    }
    // Append END
    values.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
    return values;
  }

  function _parseBlockListFreeform(ctx, templates) {
    var result = [];
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACE' || t.kind === 'EOF') break;
      result.push(_parseBlockFreeform(ctx, templates));
    }
    return result;
  }

  function _parseExprBracketsFreeform(ctx) {
    ctx.expect('LBRACKET');
    var items = [];
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACKET') { ctx.consume(); break; }
      if (t.kind === 'OP_SYMBOL' || (t.kind === 'IDENT' && OP_NAME_TO_CODE[t.text] !== undefined)) {
        ctx.consume();
        var code = OP_NAME_TO_CODE[t.text];
        if (code === undefined) throw new Error('gcxParseText: line ' + t.line + ': unknown operator ' + t.text);
        items.push({ kind: 'op', opCode: code, origBytePos: 0 });
        continue;
      }
      var v = _buildValueFromTokenInferred(t, ctx.warnings);
      if (v) { ctx.consume(); items.push({ kind: 'value', value: v, origBytePos: 0 }); continue; }
      throw new Error('gcxParseText: line ' + t.line + ': unexpected token in expr ' + t.kind);
    }
    return items;
  }

  // ---------- Parser ----------

  function ParseCtx(toks) { this.toks = toks; this.pos = 0; this.warnings = []; }
  ParseCtx.prototype.peek = function(off) {
    var p = this.pos + (off || 0);
    return p < this.toks.length ? this.toks[p] : this.toks[this.toks.length - 1];
  };
  ParseCtx.prototype.consume = function() { var t = this.toks[this.pos]; this.pos++; return t; };
  ParseCtx.prototype.expect = function(kind, txt) {
    var t = this.consume();
    if (t.kind !== kind || (txt !== undefined && t.text !== txt)) {
      throw new Error('gcxParseText: expected ' + kind + (txt !== undefined ? ' ' + JSON.stringify(txt) : '') +
                      ', got ' + t.kind + ' ' + JSON.stringify(t.text) + ' at line ' + t.line);
    }
    return t;
  };

  function _parseExprBrackets(ctx, origItems) {
    ctx.expect('LBRACKET');
    var newItems = [];
    var oi = 0;
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACKET') { ctx.consume(); break; }
      if (oi >= origItems.length) throw new Error('gcxParseText: more expr items than original at line ' + t.line);
      var oit = origItems[oi];
      if (oit.kind === 'op') {
        if (t.kind === 'OP_SYMBOL' || t.kind === 'IDENT') {
          ctx.consume();
          var code = OP_NAME_TO_CODE[t.text];
          if (code === undefined) throw new Error('gcxParseText: unknown operator ' + t.text + ' at line ' + t.line);
          newItems.push({ kind: 'op', opCode: code, origBytePos: 0 });
        } else throw new Error('gcxParseText: expected operator at line ' + t.line + ', got ' + t.kind);
        oi++; continue;
      }
      if (t.kind === 'NUMBER' || t.kind === 'HEX' || t.kind === 'STRING' || t.kind === 'CHAR' || t.kind === 'REF' || t.kind === 'IDENT') {
        ctx.consume();
        var nv = _buildValueFromTokenAndOrig(t, oit.value, ctx.warnings);
        newItems.push({ kind: 'value', value: nv, origBytePos: 0 });
        oi++; continue;
      }
      throw new Error('gcxParseText: unexpected token in expression at line ' + t.line + ': ' + t.kind);
    }
    if (oi !== origItems.length) throw new Error('gcxParseText: expression had ' + oi + ' items but original had ' + origItems.length);
    return newItems;
  }

  function _parseCommandValues(ctx, origValues) {
    var result = [];
    var oi = 0;
    while (oi < origValues.length) {
      var ov = origValues[oi];
      if (ov.tag === T_END) {
        result.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_OPTION) {
        var t = ctx.peek();
        if (t.kind !== 'OPTION') throw new Error('gcxParseText: expected OPTION at line ' + t.line + ', got ' + t.kind + ' ' + JSON.stringify(t.text));
        ctx.consume();
        var oc = t.text.charCodeAt(1);
        var mb = 0;
        if (ov.payload && typeof ov.payload === 'object') {
          if (ov.payload.markerByte !== undefined) mb = ov.payload.markerByte;
          else if (ov.payload.marker_byte !== undefined) mb = ov.payload.marker_byte;
        }
        result.push({ tag: T_OPTION, raw: new Uint8Array(0), kind: 'option',
                      payload: { optChar: oc, markerByte: mb }, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_ARG) {
        ctx.expect('LBRACE');
        var newInner = _parseBlockList(ctx, ov.payload.innerBlocks);
        ctx.expect('RBRACE');
        result.push({ tag: T_ARG, raw: new Uint8Array(0), kind: 'arg',
                      payload: { innerBlocks: newInner, argBytes: new Uint8Array(0) }, fileOffset: 0 });
        oi++; continue;
      }
      if (ov.tag === T_EXPR) {
        var ei = _parseExprBrackets(ctx, ov.payload.exprItems);
        result.push({ tag: T_EXPR, raw: new Uint8Array(0), kind: 'expr',
                      payload: { exprItems: ei, exprBytes: new Uint8Array(0) }, fileOffset: 0 });
        oi++; continue;
      }
      var tv = ctx.peek();
      if (tv.kind === 'NUMBER' || tv.kind === 'HEX' || tv.kind === 'STRING' || tv.kind === 'CHAR' || tv.kind === 'REF' || tv.kind === 'IDENT') {
        ctx.consume();
        result.push(_buildValueFromTokenAndOrig(tv, ov, ctx.warnings));
        oi++; continue;
      }
      throw new Error('gcxParseText: unexpected token at line ' + tv.line + ': ' + tv.kind + ' ' + JSON.stringify(tv.text) + ' (expected ' + ov.kind + ' at orig_values[' + oi + '])');
    }
    return result;
  }

  function _parseBlock(ctx, origBlk) {
    var t = ctx.peek();
    if (t.kind === 'IDENT' && t.text === 'end') {
      if (origBlk.tag !== T_END) throw new Error('gcxParseText: line ' + t.line + ': text \`end\` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      return { tag: T_END, raw: new Uint8Array(0), fileOffset: 0, headerSize: 1, payload: null };
    }
    if (t.kind === 'IDENT' && t.text === 'expr') {
      ctx.consume();
      if (origBlk.tag !== T_EXPR) throw new Error('gcxParseText: line ' + t.line + ': text \`expr\` but AST expects tag 0x' + origBlk.tag.toString(16));
      var ni = _parseExprBrackets(ctx, origBlk.payload.exprItems);
      return { tag: T_EXPR, raw: new Uint8Array(0), fileOffset: 0, headerSize: 2,
               payload: { exprItems: ni, exprBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'LBRACE') {
      if (origBlk.tag !== T_ARG) throw new Error('gcxParseText: line ' + t.line + ': text \`{\` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      var newInner = _parseBlockList(ctx, origBlk.payload.innerBlocks);
      ctx.expect('RBRACE');
      return { tag: T_ARG, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
               payload: { innerBlocks: newInner, argBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'IDENT' && t.text === 'call') {
      if (origBlk.tag !== T_PROC) throw new Error('gcxParseText: line ' + t.line + ': text \`call\` but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      ctx.expect('REF');
      var origVals = origBlk.payload.values || [];
      var newVals = [];
      for (var pvi = 0; pvi < origVals.length; pvi++) {
        var ov = origVals[pvi];
        if (ov.tag === T_END) {
          newVals.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
          continue;
        }
        var tp = ctx.peek();
        if (tp.kind === 'RBRACE' || tp.kind === 'EOF' || tp.kind === 'IDENT') {
          newVals.push({ tag: T_END, raw: new Uint8Array(0), kind: 'end', payload: null, fileOffset: 0 });
          continue;
        }
        ctx.consume();
        newVals.push(_buildValueFromTokenAndOrig(tp, ov, ctx.warnings));
      }
      return { tag: T_PROC, raw: new Uint8Array(0), fileOffset: 0, headerSize: 2,
               payload: { procId: origBlk.payload.procId, values: newVals, procBytes: new Uint8Array(0) } };
    }
    if (t.kind === 'IDENT') {
      if (origBlk.tag !== T_COMMAND) throw new Error('gcxParseText: line ' + t.line + ': text IDENT but AST expects tag 0x' + origBlk.tag.toString(16));
      ctx.consume();
      var nv = _parseCommandValues(ctx, origBlk.payload.values);
      return { tag: T_COMMAND, raw: new Uint8Array(0), fileOffset: 0, headerSize: 3,
               payload: { cmdId: origBlk.payload.cmdId, lineSkip: origBlk.payload.lineSkip,
                          values: nv, cmdBytes: new Uint8Array(0) } };
    }
    throw new Error('gcxParseText: line ' + t.line + ': unexpected token ' + t.kind + ' ' + JSON.stringify(t.text));
  }

  function _parseBlockList(ctx, origBlocks) {
    var result = [];
    var i = 0;
    var templates = ctx.cmdTemplates || {};
    while (true) {
      var t = ctx.peek();
      if (t.kind === 'RBRACE' || t.kind === 'EOF') break;

      // Append-at-end: text has more blocks than ref. Use template-driven parse.
      if (i >= origBlocks.length) {
        result.push(_parseBlockFreeform(ctx, templates));
        continue;
      }

      // Normal path: parallel walk against ref.
      // We do NOT try mid-list alignment — that requires real diff (text-block
      // identity isn't unique enough: two charas at different positions look
      // the same to the parser). For safety, we throw on mid-list mismatches.
      if (!_peekMatchesOrigBlock(t, origBlocks[i])) {
        // Special case: text might be deleting blocks from the END. Check if
        // remaining text matches a SUFFIX of origBlocks (i.e., text skipped
        // some refs to get to a later one). Allow this iff: the mismatch is
        // because text moved AHEAD, never BACK.
        var foundAt = -1;
        for (var k = i + 1; k < origBlocks.length; k++) {
          if (_peekMatchesOrigBlock(t, origBlocks[k])) { foundAt = k; break; }
        }
        if (foundAt >= 0) {
          // Deletion of origBlocks[i..foundAt-1]. Accept it.
          i = foundAt;
          result.push(_parseBlock(ctx, origBlocks[i]));
          i++;
          continue;
        }
        // No match anywhere ahead — text has an insertion in the middle.
        // This is the dangerous case (alignment ambiguity). Refuse cleanly.
        throw new Error('gcxParseText: line ' + t.line + ': cannot align text token \`' +
          t.text + '\` with original AST. Insertions in the MIDDLE of a block list ' +
          'aren\\'t yet supported (only appending at the END works reliably). ' +
          'Tip: paste new lines just before the closing \`}\` of the block.');
      }
      result.push(_parseBlock(ctx, origBlocks[i]));
      i++;
    }
    // Any remaining origBlocks are deletions — silently dropped.
    return result;
  }

  function gcxParseText(text, origGcx) {
    var toks = gcxLexText(text);
    var ctx = new ParseCtx(toks);
    // Attach template registry to ctx so _parseBlockList can use it for inserts
    ctx.cmdTemplates = _buildCmdTemplates(origGcx);
    var sortedProcs = origGcx.procs.slice().sort(function(a, b) { return a.fileOffset - b.fileOffset; });
    var newProcs = [];

    for (var pi = 0; pi < sortedProcs.length; pi++) {
      var op = sortedProcs[pi];
      var kw = ctx.expect('IDENT');
      if (kw.text !== 'proc') throw new Error('gcxParseText: line ' + kw.line + ': expected \`proc\`, got ' + JSON.stringify(kw.text));
      var hex = ctx.expect('HEX');
      var procIdHex = parseInt(hex.text, 16) & 0xFFFF;
      if (procIdHex !== op.tableEntry.procId) {
        throw new Error('gcxParseText: line ' + kw.line + ': proc id mismatch (0x' + procIdHex.toString(16) +
                        ' vs original 0x' + op.tableEntry.procId.toString(16) + ')');
      }
      ctx.expect('LBRACE');
      var nb = _parseBlockList(ctx, op.blocks);
      ctx.expect('RBRACE');
      newProcs.push({
        tableEntry: { procId: op.tableEntry.procId, offset: op.tableEntry.offset },
        preamble: op.preamble, blocks: nb, raw: op.raw, fileOffset: op.fileOffset
      });
    }
    var sw = ctx.expect('IDENT');
    if (sw.text !== 'script') throw new Error('gcxParseText: line ' + sw.line + ': expected \`script\`');
    ctx.expect('LBRACE');
    var nsb = _parseBlockList(ctx, origGcx.scriptBody.blocks);
    ctx.expect('RBRACE');
    var newScriptBody = {
      tableEntry: origGcx.scriptBody.tableEntry,
      preamble: origGcx.scriptBody.preamble,
      blocks: nsb, raw: origGcx.scriptBody.raw,
      fileOffset: origGcx.scriptBody.fileOffset
    };

    // After parse: recompute lineSkip/markerByte for any block that was newly
    // inserted (marked with _needsRecompute by the freeform parser).
    newProcs.forEach(function(p) { _gcxRecomputeSkipsInPlace(p.blocks); });
    _gcxRecomputeSkipsInPlace(newScriptBody.blocks);

    var result = {
      raw: origGcx.raw,
      procSectionLen: origGcx.procSectionLen,
      procTable: origGcx.procTable.slice(),
      procTableEnd: origGcx.procTableEnd,
      procBodyOffset: origGcx.procBodyOffset,
      procs: newProcs,
      scriptBodyLen: origGcx.scriptBodyLen,
      scriptBodyOffset: origGcx.scriptBodyOffset,
      scriptBody: newScriptBody,
      trailing: origGcx.trailing,
      _compilerWarnings: ctx.warnings
    };

    // Recompute size-dependent metadata from actual encoded contents.
    // This is essential when structural edits change block list lengths —
    // the disassembler reads scriptBodyLen and procSectionLen as authoritative,
    // so any mismatch causes truncation/corruption.
    if (typeof gcxEncodeProcBody === 'function') {
      // Recompute proc offsets, procTable, and procSectionLen
      var bodyOff = 0;
      var sortedNew = result.procs.slice().sort(function(a,b){ return a.fileOffset - b.fileOffset; });
      var newTable = [];
      for (var si = 0; si < sortedNew.length; si++) {
        var enc = gcxEncodeProcBody(sortedNew[si]);
        sortedNew[si].tableEntry.offset = bodyOff;
        newTable.push({ procId: sortedNew[si].tableEntry.procId, offset: bodyOff });
        bodyOff += enc.length;
      }
      // procTable in original ORDER (preserve table entry order from origGcx)
      // Match procTable to original by procId, take new offsets
      var newTableMap = {};
      newTable.forEach(function(e) { newTableMap[e.procId] = e.offset; });
      result.procTable = origGcx.procTable.map(function(e) {
        return { procId: e.procId, offset: newTableMap[e.procId] !== undefined ? newTableMap[e.procId] : e.offset };
      });
      // procSectionLen = 4*N table entries + 4 terminator + sum of body sizes
      var tableBytes = result.procTable.length * 4 + 4;
      result.procSectionLen = tableBytes + bodyOff;
      // scriptBodyLen = byte size of encoded scriptBody
      var sbEnc = gcxEncodeProcBody(result.scriptBody);
      result.scriptBodyLen = sbEnc.length;
    }

    return result;
  }

  function gcxCompileTextToBytes(text, origGcx) {
    var newGcx = gcxParseText(text, origGcx);
    if (typeof gcxEncodeGCX !== 'function') {
      throw new Error('gcxCompileTextToBytes: gcxEncodeGCX is not loaded');
    }
    return { bytes: gcxEncodeGCX(newGcx), gcx: newGcx, warnings: newGcx._compilerWarnings };
  }

  var api = {
    gcxLexText: gcxLexText,
    gcxParseText: gcxParseText,
    gcxCompileTextToBytes: gcxCompileTextToBytes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else for (var key in api) if (api.hasOwnProperty(key)) global[key] = api[key];

})(typeof window !== 'undefined' ? window : this);

// ============================================================

var gcxCmdNames = {
  0x0d86: 'if', 0x64c0: 'eval', 0xcd3a: 'return', 0x7636: 'foreach',
  0x22ff: 'mesg', 0xd4cb: 'trap', 0x9906: 'chara', 0xc091: 'map',
  0x7d50: 'mapdef', 0xeee9: 'camera', 0x306a: 'light', 0x9a1f: 'start',
  0xc8bb: 'load', 0x24e1: 'radio', 0xe43c: 'restart', 0xa242: 'demo',
  0xdbab: 'ntrap', 0x430d: 'delay', 0xcc85: 'pad', 0x5c9e: 'varsave',
  0x4ad9: 'system', 0x698d: 'sound', 0x226d: 'menu', 0x925e: 'rand',
  0xe257: 'func', 0xa2bf: 'demodebug', 0xb96e: 'print', 0xec9d: 'jimaku'
};

var gcxOpNames = {
  0:'END', 1:'NEG', 2:'NOT', 3:'CPL',
  4:'+', 5:'-', 6:'*', 7:'/', 8:'%',
  9:'==', 10:'!=', 11:'<', 12:'<=', 13:'>', 14:'>=',
  15:'|', 16:'&', 17:'^', 18:'||', 19:'&&', 20:'='
};
var gcxOpFromName = (function() {
  var m = {}; for (var k in gcxOpNames) m[gcxOpNames[k]] = +k; return m;
})();

// ---------- State ----------
var _GCL_VAR_LETTER = {1:'w',2:'b',3:'c',4:'f',6:'s',7:'s',8:'p',9:'s',0x0a:'t'};

function _gclHex(n, width){ var s=(n>>>0).toString(16); while(s.length<width)s='0'+s; return s; }

// Resolve a STR_ID hash to a readable name using whatever tables the editor
// already has: the charalst type table (index-keyed) and any runtime/user-added
// names. Returns a bare name for true-GCL output, or null if unknown (caller
// falls back to s:hhhh). A full reverse dictionary for instance names requires
// a name wordlist (see gcxStridNames hook below).
var gcxStridNames = (typeof gcxStridNames !== 'undefined') ? gcxStridNames : {}; // hash(int) -> name, fillable
function _gclResolveStrid(h){
  if(gcxStridNames && gcxStridNames[h]) return gcxStridNames[h];
  if(typeof gcxCharaTable!=='undefined' && gcxCharaTable[h]){
    // charalst names are stored "00XX_NAME"; strip the index prefix for clean GCL
    return String(gcxCharaTable[h]).replace(/^[0-9A-Fa-f]{4}_/,'');
  }
  if(typeof PSXT_runtimeNames!=='undefined'){
    var key='0x'+_gclHex(h,4);
    if(PSXT_runtimeNames[key] && PSXT_runtimeNames[key].length) return PSXT_runtimeNames[key][0];
  }
  return null;
}

// Format a single value token in GCL dialect.
function _gclTokText(v){
  if(!v) return '?';
  switch(v.tag){
    case GCL_SHORT:  return String(v.payload|0);
    case GCL_BYTE:   return String(v.payload);              // plain (WantedThing drops type prefix)
    case GCL_CHAR: {
      var c=v.payload;
      return (c>=32&&c<127) ? ("'"+String.fromCharCode(c)+"'") : ('0x'+_gclHex(c,2));
    }
    case GCL_BOOL:   return v.payload ? 'true' : 'false';    // lowercase keyword
    case GCL_STRID:  { var nm=_gclResolveStrid(v.payload); return nm ? nm : ('s:'+_gclHex(v.payload,4)); }
    case GCL_STRING: {
      var s='';
      for(var i=0;i<v.payload.length;i++){ var b=v.payload[i]; if(b===0)break;
        s += (b>=32&&b<127) ? String.fromCharCode(b) : ('\\\\x'+_gclHex(b,2)); }
      return '"'+s+'"';
    }
    case GCL_PROCID: return 'sub_'+_gclHex(v.payload,4).toUpperCase();
    case GCL_INT:    return 'snd:'+_gclHex(v.payload,8);     // sound code, 8-hex lowercase
    case GCL_SYMBOL: return 't:'+_gclHex(v.payload,8);       // table code, lowercase
    case GCL_ARRAY:  return 'arg'+v.payload;
    case GCL_OPTION: return '-'+String.fromCharCode(v.payload.optChar);
  }
  if((v.tag&0xF0)===GCL_VAR){
    var letter=_GCL_VAR_LETTER[v.tag&0x0F]||'v';
    return '$'+letter+':'+_gclHex(v.payload.packed,6);       // lowercase hex
  }
  return '?';
}

// Operator precedence (higher binds tighter) for minimal-paren printing.
var _GCL_OP_PREC={1:14,2:14,3:14, 6:12,7:12,8:12, 4:11,5:11,
  11:9,12:9,13:9,14:9, 9:8,10:8, 16:7,17:6,15:5, 19:4,18:3, 20:1};

// RPN expr item list -> infix GCL string, WantedThing style (minimal parens).
function _gclExpr(items){
  var st=[];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    if(it.kind==='value'){ st.push({s:_gclTokText(it.value), prec:99}); continue; }
    if(it.kind!=='op') continue;
    var op=it.opCode; if(op===0) continue;
    var sym=gcxOpNames[op]||('op'+op); var prec=_GCL_OP_PREC[op]||0;
    if(op>=1&&op<=3){ // unary
      var a=st.pop()||{s:'',prec:99};
      if(op===1) st.push({s:'-('+a.s+')', prec:14});                  // negate -> -(x)
      else st.push({s:sym+((a.prec<14)?('('+a.s+')'):a.s), prec:14}); // ! ~
    } else {
      var b=st.pop()||{s:'',prec:99}, a2=st.pop()||{s:'',prec:99};
      var ls=(a2.prec<prec)?('('+a2.s+')'):a2.s;
      var rs=(b.prec<prec)?('('+b.s+')'):b.s;
      st.push({s:ls+' '+sym+' '+rs, prec:prec});
    }
  }
  return st.length ? st[st.length-1].s : '';
}

function _gclSpaces(n){ var s=''; while(n-->0)s+=' '; return s; }

// Collect highest arg index used in a proc body (for the proc(argN,...) header).
function _gclMaxArg(blocks){
  var max=0;
  function scanVal(v){ if(v&&v.tag===GCL_ARRAY&&v.payload>max)max=v.payload; }
  function scanBlock(b){
    if(!b)return;
    if(b.tag===GCL_EXPR){ var it=b.payload.exprItems||[]; for(var i=0;i<it.length;i++) if(it[i].kind==='value')scanVal(it[i].value); return; }
    if(b.tag===GCL_COMMAND||b.tag===GCL_PROC){
      var vals=b.payload.values||[];
      for(var j=0;j<vals.length;j++){
        var v=vals[j];
        if(v.tag===GCL_EXPR){ var ei=v.payload.exprItems||[]; for(var e=0;e<ei.length;e++) if(ei[e].kind==='value')scanVal(ei[e].value); }
        else if(v.tag===GCL_ARG){ var ib=v.payload.innerBlocks||[]; for(var k=0;k<ib.length;k++)scanBlock(ib[k]); }
        else scanVal(v);
      }
      return;
    }
    if(b.tag===GCL_ARG){ var inn=b.payload.innerBlocks||[]; for(var m=0;m<inn.length;m++)scanBlock(inn[m]); }
  }
  for(var i=0;i<blocks.length;i++)scanBlock(blocks[i]);
  return max;
}

function _gclPad(indent){ var s=''; for(var i=0;i<indent;i++)s+='    '; return s; }

// Emit a non-control command in WantedThing layout: positional args on the
// command line, each option on its own '\\'-continued, value-aligned line, and
// option-blocks as \`-x {\` ... \`}\`. Options are kept as single letters (the GCX
// stores only the letter; the keyword table needed to expand -r -> -route is
// not available without WantedThing's per-command option dictionaries).
function _emitCommand(name, vals, indent, out){
  var pad=_gclPad(indent), oind=pad+'    ';
  var i=0, positional=[];
  while(i<vals.length){
    var v=vals[i];
    if(v.tag===GCL_OPTION||v.tag===GCL_ARG) break;
    if(v.tag===GCL_END){ i++; continue; }
    if(v.tag===GCL_EXPR){ positional.push('('+_gclExpr(v.payload.exprItems||[])+')'); i++; continue; }
    positional.push(_gclTokText(v)); i++;
  }
  var segs=[];
  while(i<vals.length){
    var vv=vals[i];
    if(vv.tag===GCL_END){ i++; continue; }
    if(vv.tag===GCL_OPTION){
      var opt='-'+String.fromCharCode(vv.payload.optChar); i++;
      var ovals=[];
      while(i<vals.length && vals[i].tag!==GCL_OPTION && vals[i].tag!==GCL_ARG && vals[i].tag!==GCL_END){
        if(vals[i].tag===GCL_EXPR) ovals.push('('+_gclExpr(vals[i].payload.exprItems||[])+')');
        else ovals.push(_gclTokText(vals[i]));
        i++;
      }
      if(i<vals.length && vals[i].tag===GCL_ARG){
        var blk=vals[i].payload.innerBlocks||[]; i++;
        var blines=[]; for(var q=0;q<blk.length;q++)_gclBlock(blk[q], indent+2, blines);
        segs.push({opt:opt, vals:ovals, block:blines});
      } else { segs.push({opt:opt, vals:ovals}); }
    } else if(vv.tag===GCL_ARG){
      var blk2=vv.payload.innerBlocks||[]; i++;
      var bl2=[]; for(var q2=0;q2<blk2.length;q2++)_gclBlock(blk2[q2], indent+2, bl2);
      segs.push({opt:null, block:bl2});
    } else { i++; }
  }
  var cmdLine=pad+name+(positional.length?(' '+positional.join(' ')):'');
  if(segs.length===0){ out.push(cmdLine); return; }
  var maxOpt=0; for(var s=0;s<segs.length;s++){ if(segs[s].opt && segs[s].opt.length>maxOpt)maxOpt=segs[s].opt.length; }
  var lines=[]; // {text, slash}
  lines.push({text:cmdLine, slash:true});
  for(var s2=0;s2<segs.length;s2++){
    var seg=segs[s2];
    var optPad= seg.opt ? (seg.opt+_gclSpaces(maxOpt-seg.opt.length+1)) : '';
    if(seg.block){
      lines.push({text:oind+(seg.opt?optPad:'')+'{', slash:false});
      for(var bl=0;bl<seg.block.length;bl++) lines.push({text:seg.block[bl], slash:false});
      lines.push({text:oind+'}', slash:true});
    } else {
      lines.push({text:oind+optPad+seg.vals.join(' '), slash:true});
    }
  }
  for(var L=0;L<lines.length;L++){
    var isLast=(L===lines.length-1);
    out.push(lines[L].text + ((!isLast && lines[L].slash)?' \\\\':''));
  }
}

// Render one block to GCL lines.
function _gclBlock(b, indent, out){
  if(!b) return;
  var pad=_gclPad(indent);
  if(b.tag===GCL_END) return;

  if(b.tag===GCL_EXPR){ out.push(pad+_gclExpr(b.payload.exprItems||[])); return; }

  if(b.tag===GCL_ARG){
    out.push(pad+'{');
    var inn=b.payload.innerBlocks||[];
    for(var i=0;i<inn.length;i++)_gclBlock(inn[i], indent+1, out);
    out.push(pad+'}');
    return;
  }

  if(b.tag===GCL_PROC){ // CALL
    var line=pad+'call(sub_'+_gclHex(b.payload.procId,4).toUpperCase();
    var pv=b.payload.values||[];
    var args=[]; for(var k=0;k<pv.length;k++){ if(pv[k].tag===GCL_END)continue; args.push(_gclTokText(pv[k])); }
    out.push(line+(args.length?(', '+args.join(', ')):'')+')');
    return;
  }

  if(b.tag===GCL_COMMAND){
    var cmdId=b.payload.cmdId;
    var name=gcxCmdNames[cmdId]||('cmd_0x'+_gclHex(cmdId,4));
    var vals=b.payload.values||[];

    if(cmdId===0x0d86){ // IF -> if / elseif / else
      var i=0;
      while(i<vals.length && vals[i].tag===GCL_END) i++;
      var cond=''; if(i<vals.length && vals[i].tag===GCL_EXPR){ cond=' ('+_gclExpr(vals[i].payload.exprItems||[])+')'; i++; }
      if(i<vals.length && vals[i].tag===GCL_ARG){
        out.push(pad+'if'+cond+' {');
        var tb=vals[i].payload.innerBlocks||[]; for(var t=0;t<tb.length;t++)_gclBlock(tb[t], indent+1, out); i++;
        var tail=pad+'}';
        while(i<vals.length){
          var v=vals[i];
          if(v.tag===GCL_OPTION){
            var ch=String.fromCharCode(v.payload.optChar); i++;
            if(ch==='i'){
              var c2=''; if(i<vals.length&&vals[i].tag===GCL_EXPR){ c2=' ('+_gclExpr(vals[i].payload.exprItems||[])+')'; i++; }
              out.push(tail+' elseif'+c2+' {');
              if(i<vals.length&&vals[i].tag===GCL_ARG){ var eb=vals[i].payload.innerBlocks||[]; for(var e=0;e<eb.length;e++)_gclBlock(eb[e], indent+1, out); i++; }
              tail=pad+'}';
            } else if(ch==='e'){
              out.push(tail+' else {');
              if(i<vals.length&&vals[i].tag===GCL_ARG){ var xb=vals[i].payload.innerBlocks||[]; for(var x=0;x<xb.length;x++)_gclBlock(xb[x], indent+1, out); i++; }
              tail=pad+'}';
            } else { i++; }
          } else { i++; }
        }
        out.push(tail);
        return;
      }
      out.push(pad+'if'+cond);
      return;
    }

    if(cmdId===0x64c0){ // EVAL(expr)
      var exprs=[];
      for(var ei=0;ei<vals.length;ei++){ if(vals[ei].tag===GCL_EXPR) exprs.push(_gclExpr(vals[ei].payload.exprItems||[])); }
      out.push(pad+'eval('+exprs.join('; ')+')');
      return;
    }

    _emitCommand(name, vals, indent, out);
    return;
  }
  out.push(pad+'# <unknown 0x'+b.tag.toString(16)+'>');
}

function _gclProc(procId, blocks, out, isMain){
  // The GCX proc body is itself a SCRIPT block, so blocks is typically a single
  // wrapping GCL_ARG. Unwrap it so statements sit directly inside the proc braces
  // (matching WantedThing) instead of nesting a redundant { }.
  var body=blocks;
  var nonEnd=blocks.filter(function(b){ return b && b.tag!==GCL_END; });
  if(nonEnd.length===1 && nonEnd[0].tag===GCL_ARG){ body=nonEnd[0].payload.innerBlocks||[]; }
  out.push('proc sub_'+_gclHex(procId,4).toUpperCase()+' {');
  for(var i=0;i<body.length;i++)_gclBlock(body[i], 1, out);
  out.push('}');
  out.push('');
}

// Public: AST -> GCL script string.
function gcxAstToGCL(gcx){
  if(!gcx) return '';
  if(typeof gcxWriteEntitiesBack==='function' && typeof gclEntities!=='undefined'){
    try{ gcxWriteEntitiesBack(gclEntities); }catch(e){}
  }
  var out=[];
  var nm=(typeof psxGcxName!=='undefined'?psxGcxName:'');
  out.push('# GCL (decompiled from '+nm+')');
  out.push('');
  var sorted=gcx.procs.slice().sort(function(a,b){return a.fileOffset-b.fileOffset;});
  for(var i=0;i<sorted.length;i++){
    _gclProc(sorted[i].tableEntry.procId, sorted[i].blocks, out, false);
  }
  // Main script body = main procedure (id 0).
  if(gcx.scriptBody && gcx.scriptBody.blocks){
    _gclProc(0, gcx.scriptBody.blocks, out, true);
  }
  return out.join('\\n');
}

<\/script>
<script>// ═══════════════════════════════════════════════════════════════════════════
// MGS1 Archive Tool — core engine (browser + Node)
// stage.dir (PSX) / stage.mgz (PC) full unpack ⇄ repack.
// Formats ported from the MGS Stage Editor suite (29_stagedir.js) and the
// PC DAR tool; PSX inner-DAR layout verified against retail 2_0.dar.
// ═══════════════════════════════════════════════════════════════════════════
(function(global){
"use strict";

// ── little helpers ──────────────────────────────────────────────────────────
function u16(d,o){ return d[o] | (d[o+1]<<8); }
function u32(d,o){ return (d[o] | (d[o+1]<<8) | (d[o+2]<<16) | (d[o+3]<<24)) >>> 0; }
function w16(d,o,v){ d[o]=v&255; d[o+1]=(v>>>8)&255; }
function w32(d,o,v){ d[o]=v&255; d[o+1]=(v>>>8)&255; d[o+2]=(v>>>16)&255; d[o+3]=(v>>>24)&255; }
function concat(chunks){
  var total=0,i; for(i=0;i<chunks.length;i++) total+=chunks[i].length;
  var out=new Uint8Array(total),p=0;
  for(i=0;i<chunks.length;i++){ out.set(chunks[i],p); p+=chunks[i].length; }
  return out;
}
function b64FromBytes(u8){
  if (typeof Buffer!=="undefined") return Buffer.from(u8).toString("base64");
  var s=""; for(var i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  return btoa(s);
}
function bytesFromB64(b64){
  if (typeof Buffer!=="undefined") return new Uint8Array(Buffer.from(b64,"base64"));
  var s=atob(b64), out=new Uint8Array(s.length);
  for(var i=0;i<s.length;i++) out[i]=s.charCodeAt(i);
  return out;
}
var EXT_BY_BYTE = {0x61:"azm",0x62:"bin",0x63:"con",0x64:"dar",0x65:"efx",0x67:"gcx",
  0x68:"hzm",0x69:"img",0x6b:"kmd",0x6c:"lit",0x6d:"mt3",0x6f:"oar",0x70:"pcc",
  0x72:"rar",0x73:"sgt",0x77:"wvx",0x7a:"zmd",0xff:"dar"};
function extName(b){ return EXT_BY_BYTE[b] || ("x"+b.toString(16).padStart(2,"0")); }

// ── PSX stage.dir: outer directory ──────────────────────────────────────────
// Outer: u32 dir_body_size + N × {8B ASCII name, u32 sector}; stages at
// sector*2048, contiguous; each stage's true extent = gap to the next
// stage's sector (last runs to EOF).  [29_stagedir.js sdirParseOuter]
function psxParseOuter(u8){
  var dirSize=u32(u8,0), n=(dirSize/12)|0, stages=[];
  for(var i=0;i<n;i++){
    var p=4+i*12, nameBytes=u8.subarray(p,p+8), end=0;
    while(end<8 && nameBytes[end]!==0) end++;
    stages.push({
      name: String.fromCharCode.apply(null, Array.from(nameBytes.subarray(0,end))),
      nameB64: b64FromBytes(nameBytes),           // verbatim 8 bytes (padding quirks)
      sector: u32(u8,p+8),
    });
  }
  // true extents from the sorted sector starts
  var fileSec=(u8.length/2048)|0;
  var secs=stages.map(function(s){return s.sector;}).slice().sort(function(a,b){return a-b;});
  stages.forEach(function(s){
    var next=fileSec;
    for(var i=0;i<secs.length;i++) if(secs[i]>s.sector){ next=secs[i]; break; }
    s.byteOff=s.sector*2048; s.extent=(next-s.sector)*2048;
  });
  var minOff=Math.min.apply(null, stages.map(function(s){return s.byteOff;}));
  return { stages: stages, headB64: b64FromBytes(u8.subarray(0,minOff)), headLen:minOff };
}

// ── PSX stage: inner entries ────────────────────────────────────────────────
// Header 4B {u8 f0,u8 f1,i16 sizeSec} + configs 8B {u16 hash,u8 mode,u8 ext,
// u32 size} until mode==0. Data @2048. ext 0xFF = align-to-sector marker
// (no data). mode 'c'(0x63) = cached, tightly packed, sizeField cumulative
// (real size = next.sizeField - this.sizeField). Others sector-aligned with
// sizeField = actual size.                    [29_stagedir.js sdirParseStage]
function psxParseStage(sb){
  var configs=[], p=4;
  while(p+8<=sb.length){
    var hash=u16(sb,p), mode=sb[p+2], ext=sb[p+3], size=u32(sb,p+4);
    p+=8;
    if(mode===0) break;
    configs.push({hash:hash,mode:mode,ext:ext,sizeField:size});
  }
  var dataPos=2048, entries=[];
  for(var i=0;i<configs.length;i++){
    var c=configs[i], actual=0, hasData=true;
    if(c.ext===0xFF){ dataPos+=(2048-(dataPos&0x7ff))&0x7ff; hasData=false; }
    else if(c.mode===0x63){ actual=(i+1<configs.length)?(configs[i+1].sizeField-c.sizeField):0; }
    else { actual=c.sizeField; }
    entries.push({hash:c.hash,mode:c.mode,ext:c.ext,size:actual,
      data:hasData? sb.subarray(dataPos,dataPos+actual):null});
    if(hasData){
      dataPos+=actual;
      if(c.mode!==0x63) dataPos+=(2048-(dataPos&0x7ff))&0x7ff;
    }
  }
  return { entries:entries, headerB64: b64FromBytes(sb.subarray(0,2048)) };
}

// Rebuild one PSX stage from its verbatim header sector + per-entry bytes.
// Patches each config's Size u32 and the sector count, reflows the data
// area with the mode/marker padding rules.   [29_stagedir.js sdirRebuildStage]
function psxRebuildStage(headerB64, entries){
  var header=bytesFromB64(headerB64).slice();
  var n=entries.length, sf=new Array(n), cum=0, i;
  if(4+(n+1)*8>2048) throw new Error("stage config table overflow ("+n+" entries; max 254)");
  for(i=0;i<n;i++){
    var e=entries[i];
    if(e.ext===0xff) sf[i]=cum;
    else if(e.mode===0x63){ sf[i]=cum; cum+=e.bytes.length; }
    else sf[i]=e.bytes.length;
  }
  // measure the ORIGINAL config table extent so removals leave no stale records
  var oldEnd=4;
  while(oldEnd+8<=2048 && header[oldEnd+2]!==0) oldEnd+=8;
  oldEnd+=8;                                  // include the old terminator record
  // rewrite the WHOLE table: entry counts can change (additions/deletions)
  for(i=0;i<n;i++){
    var o=4+i*8, e1=entries[i];
    w16(header,o,e1.hash); header[o+2]=e1.mode; header[o+3]=e1.ext;
    w32(header,o+4,sf[i]);
  }
  for(i=4+n*8;i<Math.max(oldEnd,4+(n+1)*8)&&i<2048;i++) header[i]=0;   // terminator + clear stale tail
  var chunks=[], pos=2048;
  function pad(){ var q=(2048-(pos&0x7ff))&0x7ff; if(q){chunks.push(new Uint8Array(q)); pos+=q;} }
  for(i=0;i<n;i++){
    var e2=entries[i];
    if(e2.ext===0xff){ pad(); continue; }
    chunks.push(e2.bytes); pos+=e2.bytes.length;
    if(e2.mode!==0x63) pad();
  }
  var dataLen=0; chunks.forEach(function(c){dataLen+=c.length;});
  var total=2048+dataLen, fpad=(2048-(total&0x7ff))&0x7ff; total+=fpad;
  var out=new Uint8Array(total);
  out.set(header,0);
  var p=2048; chunks.forEach(function(c){ out.set(c,p); p+=c.length; });
  w16(out,2,total/2048);
  return out;
}

// Rebuild the whole stage.dir: verbatim head region with sector pointers
// patched, then stages laid out sequentially in original file order.
function psxRebuildDir(manifest, stageBlobs /* name -> Uint8Array */){
  var head=bytesFromB64(manifest.psx.headB64).slice();
  // lay out in original byte order
  var order=manifest.psx.stages.slice().sort(function(a,b){return a.sector-b.sector;});
  var sector=(head.length/2048)|0, chunks=[head];
  var newSector={};
  order.forEach(function(s){
    newSector[s.name]=sector;
    var blob=stageBlobs[s.name];
    chunks.push(blob);
    sector+=(blob.length/2048)|0;
  });
  var out=concat(chunks);
  // patch directory pointers (manifest order == directory order)
  manifest.psx.stages.forEach(function(s,i){
    w32(out,4+i*12+8,newSector[s.name]);
  });
  return out;
}

// ── PSX inner DAR: {u16 hash, u16 ext, u32 size, data} repeated ─────────────
// (verified: 2_0.dar walks 211 entries to exact EOF)
function psxDarParse(d){
  var out=[], p=0;
  while(p+8<=d.length){
    var hash=u16(d,p), ext=u16(d,p+2), size=u32(d,p+4);
    if(p+8+size>d.length) return null;              // not a clean PSX DAR
    out.push({hash:hash,ext:ext,size:size,data:d.subarray(p+8,p+8+size)});
    p+=8+size;
  }
  return (p===d.length && out.length>0) ? out : null;
}
function psxDarBuild(items /* [{hash,ext,bytes}] */){
  // Payloads are padded to a 4-byte boundary and the STORED size is the
  // padded size — matching vanilla Konami packing. The engine computes the
  // next member header as cur+8+storedSize; an unaligned size makes that a
  // misaligned MIPS word load, which crashes emulators in interpreter mode
  // (mobile cores). Exact-size members from older builds are what the
  // community STAGE.DIR alignment fixer repairs; building aligned makes the
  // fixer a no-op on our output.
  var chunks=[];
  items.forEach(function(it){
    var pad=(4-(it.bytes.length&3))&3;
    var h=new Uint8Array(8);
    w16(h,0,it.hash); w16(h,2,it.ext); w32(h,4,it.bytes.length+pad);
    chunks.push(h,it.bytes);
    if(pad) chunks.push(new Uint8Array(pad));
  });
  return concat(chunks);
}

// ── PC DAR: [u32 count] then per entry ASCIIZ name + pad-to-4-absolute +
//    u32 size + data + 1 zero pad (tolerate missing final pad) ──────────────
function pcDarParse(d){
  if(d.length<4) return null;
  var count=u32(d,0), out=[], off=4;
  for(var i=0;i<count;i++){
    var ns=off;
    while(off<d.length && d[off]!==0) off++;
    if(off>=d.length) return null;
    var name=""; for(var k=ns;k<off;k++) name+=String.fromCharCode(d[k]);
    off++;                                   // the NUL
    off=(off+3)&~3;                          // absolute pad to 4
    if(off+4>d.length) return null;
    var size=u32(d,off); off+=4;
    if(off+size>d.length) return null;
    out.push({name:name,data:d.subarray(off,off+size)});
    var cur=off+size;
    if(cur<d.length && d[cur]===0) cur++;    // 1 zero pad (may be absent at EOF)
    off=cur;
  }
  return out;
}
function pcDarBuild(items /* [{name,bytes}] */){
  var chunks=[new Uint8Array(4)];
  w32(chunks[0],0,items.length);
  var pos=4;
  items.forEach(function(it,idx){
    var nb=new Uint8Array(it.name.length+1);
    for(var k=0;k<it.name.length;k++) nb[k]=it.name.charCodeAt(k)&0xff;
    chunks.push(nb); pos+=nb.length;
    var pad=((pos+3)&~3)-pos;
    if(pad){ chunks.push(new Uint8Array(pad)); pos+=pad; }
    var sz=new Uint8Array(4); w32(sz,0,it.bytes.length);
    chunks.push(sz,it.bytes); pos+=4+it.bytes.length;
    if(idx<items.length-1){ chunks.push(new Uint8Array(1)); pos+=1; }  // inter-entry pad
    else { chunks.push(new Uint8Array(1)); pos+=1; }                   // final pad (canonical)
  });
  return concat(chunks);
}

var api={ u16:u16,u32:u32,w16:w16,w32:w32,concat:concat,
  b64FromBytes:b64FromBytes,bytesFromB64:bytesFromB64,extName:extName,
  psxParseOuter:psxParseOuter,psxParseStage:psxParseStage,
  psxRebuildStage:psxRebuildStage,psxRebuildDir:psxRebuildDir,
  psxDarParse:psxDarParse,psxDarBuild:psxDarBuild,
  pcDarParse:pcDarParse,pcDarBuild:pcDarBuild };
if(typeof module!=="undefined"&&module.exports) module.exports=api;
else for(var k in api) global[k]=api[k];
})(typeof window!=="undefined"?window:this);
<\/script>
<script>// ═══════════════════════════════════════════════════════════════════════════
// VRAM repack pass — standalone port of the suite's v82 repacker
// (10_vram_analysis.js + 11_vram_repacker.js), adapted for the archive tool:
// "imported" ⇒ "changed or newly added since extract" (manifest checksums).
// Unchanged files are the placement authority and are NEVER moved.
// ═══════════════════════════════════════════════════════════════════════════
(function(global){
"use strict";
var VRAM_REGIONS={
  init: {x1:640,y1:0,  x2:1024,y2:256},
  stage:{x1:0,  y1:256,x2:960, y2:512}};
// Texture pages are 64 HALFWORDS wide for BOTH color depths — confirmed in
// libdg/text.c DG_SetTexture: tpage=(x/64)..., x%=64, then u=(x*4) for 4bpp
// or (x*2) for 8bpp. The old 8BPP=128 conflated 128 TEXELS with halfwords,
// letting 8bpp textures straddle a page: u wraps past 255 and polys sample
// a neighbor texture's pixels (the face/skin garbage-patch bug).
var TPAGE_ALIGN_4BPP=64, TPAGE_ALIGN_8BPP=64;

function crc32(u8){
  var c,t=[],n,k;
  for(n=0;n<256;n++){c=n;for(k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c;}
  c=0xFFFFFFFF;
  for(n=0;n<u8.length;n++)c=t[(c^u8[n])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}

// Parse one texture file (raw PCX/PCC bytes). Returns a slot or null.
// Detection identical to the suite's parseVRAMSlots: PCXINFO magic 12345 @74.
function vramSlotOf(name,data){
  if(!data||data.length<88)return null;
  if((data[74]|(data[75]<<8))!==12345)return null;
  var bpp=data[3],planes=data[65];
  var w=(data[8]|(data[9]<<8))+1,h=(data[10]|(data[11]<<8))+1;
  var isEga=bpp===1&&planes===4,isVga=bpp===8&&planes===1;
  if(!isEga&&!isVga)return null;
  return {name:name,data:data,
    px:data[78]|(data[79]<<8), py:data[80]|(data[81]<<8),
    cx:data[82]|(data[83]<<8), cy:data[84]|(data[85]<<8),
    nc:data[86]|(data[87]<<8),
    vw:isEga?Math.ceil(w/4):Math.ceil(w/2), h:h, bpp:isEga?4:8};
}
function writePlacement(s,px,py,cx,cy){
  var d=s.data;
  d[78]=px&255;d[79]=(px>>8)&255; d[80]=py&255;d[81]=(py>>8)&255;
  d[82]=cx&255;d[83]=(cx>>8)&255; d[84]=cy&255;d[85]=(cy>>8)&255;
  s.px=px;s.py=py;s.cx=cx;s.cy=cy;
}
function rectsOverlap(a,b){
  if(a.x+a.w<=b.x||b.x+b.w<=a.x)return false;
  if(a.y+a.h<=b.y||b.y+b.h<=a.y)return false;
  return true;
}
function clutsOverlap(a,b){
  if(a.cy!==b.cy)return false;
  if(a.cx+a.nc<=b.cx||b.cx+b.nc<=a.cx)return false;
  return true;
}
function crossesTPage(x,vw,bpp){
  var align=bpp===4?TPAGE_ALIGN_4BPP:TPAGE_ALIGN_8BPP;
  for(var c=x+1;c<x+vw;c++)if(c%align===0)return true;
  return false;
}
function texRect(s){return {x:s.px,y:s.py,w:s.vw,h:s.h};}
function homeRegion(py){return py<256?"init":"stage";}

function findFreeTexSlot(region,occupied,cluts,vw,h,bpp){
  // x steps by 1: retail packs place textures at arbitrary halfword x
  // (794, 807, 843... in the shipped init), so a coarser grid forfeits
  // real space. 4bpp pixel offsets stay valid at any halfword x.
  for(var y=region.y1;y+h<=region.y2;y++){
    for(var x=region.x1;x+vw<=region.x2;x++){
      if(crossesTPage(x,vw,bpp))continue;
      var cand={x:x,y:y,w:vw,h:h}, ok=true, i;
      for(i=0;i<occupied.length;i++)if(rectsOverlap(cand,texRect(occupied[i]))){ok=false;break;}
      if(ok)for(i=0;i<cluts.length;i++)
        if(rectsOverlap(cand,{x:cluts[i].cx,y:cluts[i].cy,w:cluts[i].nc,h:1})){ok=false;break;}
      if(ok)return {px:x,py:y};
    }
  }
  return null;
}
function findFreeClutSlot(allCluts,allTex,nc){
  // Real packs cluster CLUTs at x=512..1024, y=240..256 (validated band from
  // the CLUT reassign work: zero conflicts across a full retail pack).
  var region={x1:512,y1:240,x2:1024,y2:256};
  // CLUT x MUST be 16-aligned: the GPU clut id is (y<<6)|(x>>4), so an
  // unaligned x silently truncates to the previous 16-boundary and the
  // texture reads the WRONG palette (garbage colors in game).
  for(var y=region.y1;y<region.y2;y++){
    for(var x=region.x1;x+nc<=region.x2;x+=16){
      var cand={cx:x,cy:y,nc:nc}, ok=true, i;
      for(i=0;i<allCluts.length;i++)if(clutsOverlap(cand,allCluts[i])){ok=false;break;}
      if(ok)for(i=0;i<allTex.length;i++)
        if(rectsOverlap({x:x,y:y,w:nc,h:1},texRect(allTex[i]))){ok=false;break;}
      if(ok)return {cx:x,cy:y};
    }
  }
  return null;
}

// Main pass. files: [{name, data(Uint8Array), changed(bool)}]. Mutates data
// (PCXINFO placement words) of CHANGED files only. Returns a report.
function vramRepackFiles(files){
  var slots=[], i, j;
  files.forEach(function(f){
    var s=vramSlotOf(f.name,f.data);
    if(s){s.changed=!!f.changed; slots.push(s);}
  });
  var fixed=slots.filter(function(s){return !s.changed;});
  var mobile=slots.filter(function(s){return s.changed;});
  var report={moves:[],clutMoves:[],skipped:[],textures:slots.length,changed:mobile.length};
  if(mobile.length===0)return report;

  // ── CLUT pass first: partial CLUT overlap = the "which variant loaded last"
  // corruption. EXACT (cx,cy) match = intentional variant sharing → keep.
  var allCluts=function(){return slots.filter(function(s){return s.nc>0;});};
  mobile.forEach(function(s){
    if(s.nc<=0)return;
    var conflict=false;
    for(i=0;i<slots.length;i++){
      var o=slots[i]; if(o===s||o.nc<=0)continue;
      if(o.cx===s.cx&&o.cy===s.cy)continue;             // exact = shared, fine
      if(clutsOverlap(s,o)){conflict=true;break;}
    }
    // a CLUT sitting inside any texture's pixel rect is also corruption
    if(!conflict)for(i=0;i<slots.length;i++){
      if(slots[i]===s)continue;
      if(rectsOverlap({x:s.cx,y:s.cy,w:s.nc,h:1},texRect(slots[i]))){conflict=true;break;}
    }
    if(!conflict)return;
    var others=allCluts().filter(function(o){return o!==s;});
    var slot=findFreeClutSlot(others,slots,s.nc);
    if(slot){
      report.clutMoves.push({name:s.name,from:{cx:s.cx,cy:s.cy},to:slot});
      writePlacement(s,s.px,s.py,slot.cx,slot.cy);
    } else report.skipped.push(s.name+" (no free CLUT slot)");
  });

  // ── Texture pass: v82 algorithm. Colliders = mobile rects that partially
  // overlap a CLUT row, a fixed texture, or another slot at a DIFFERENT
  // position (exact same px/py = variant sharing → keep, move as a group).
  var clutRects=allCluts();
  var need=[],keep=[];
  mobile.forEach(function(s){
    var collides=false;
    for(i=0;i<clutRects.length;i++)
      if(rectsOverlap(texRect(s),{x:clutRects[i].cx,y:clutRects[i].cy,w:clutRects[i].nc,h:1})){collides=true;break;}
    if(!collides)for(i=0;i<fixed.length;i++)
      if(rectsOverlap(texRect(s),texRect(fixed[i]))){collides=true;break;}
    if(!collides)for(i=0;i<slots.length;i++){
      var o=slots[i]; if(o===s)continue;
      if(o.px===s.px&&o.py===s.py)continue;             // shared slot
      if(rectsOverlap(texRect(s),texRect(o))){collides=true;break;}
    }
    (collides?need:keep).push(s);
  });
  var occupied=fixed.concat(keep);
  need.sort(function(a,b){return (b.vw*b.h)-(a.vw*a.h);}); // first-fit decreasing
  var groupSlot={};
  need.forEach(function(s){
    var gkey=s.px+","+s.py;
    if(groupSlot[gkey]){                                  // follow the group leader
      var gs=groupSlot[gkey], from={px:s.px,py:s.py};
      writePlacement(s,gs.px,gs.py,s.cx,s.cy);
      report.moves.push({name:s.name,from:from,to:{px:gs.px,py:gs.py},shared:true});
      return;
    }
    var region=VRAM_REGIONS[homeRegion(s.py)];
    var slot=findFreeTexSlot(region,occupied,clutRects,s.vw,s.h,s.bpp);
    if(!slot&&homeRegion(s.py)==="init")
      slot=findFreeTexSlot(VRAM_REGIONS.stage,occupied,clutRects,s.vw,s.h,s.bpp);
    if(slot){
      var from2={px:s.px,py:s.py};
      groupSlot[gkey]={px:slot.px,py:slot.py};
      writePlacement(s,slot.px,slot.py,s.cx,s.cy);
      occupied.push(s);
      report.moves.push({name:s.name,from:from2,to:slot});
    } else report.skipped.push(s.name+" (no free VRAM slot)");
  });
  return report;
}

var api={vramCrc32:crc32,vramSlotOf:vramSlotOf,vramRepackFiles:vramRepackFiles,
  writePlacement:writePlacement,rectsOverlap:rectsOverlap,clutsOverlap:clutsOverlap,
  crossesTPage:crossesTPage,texRect:texRect,findFreeTexSlot:findFreeTexSlot,
  findFreeClutSlot:findFreeClutSlot,VRAM_REGIONS:VRAM_REGIONS};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else for(var k in api)global[k]=api[k];
})(typeof window!=="undefined"?window:this);
<\/script>
<script>// ═══════════════════════════════════════════════════════════════════════════
// MGS1 Archive Tool — application layer
// ═══════════════════════════════════════════════════════════════════════════
(function(){
"use strict";
var MANIFEST = "_archive_manifest.json";
var $=function(s){return document.querySelector(s);};
function log(msg, cls){ var d=document.createElement("div"); if(cls)d.className=cls;
  d.textContent=msg; $("#log").appendChild(d); $("#log").scrollTop=1e9; }
function logHTML(h){ var d=document.createElement("div"); d.innerHTML=h; $("#log").appendChild(d); $("#log").scrollTop=1e9; }
function reset(){ $("#log").innerHTML=""; }
function dl(bytes,name){ var b=new Blob([bytes],{type:"application/octet-stream"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},4000); }
function eqBytes(a,b){ if(a.length!==b.length)return false; for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false; return true; }
function normText(u8){ // for GCL unchanged-detection: normalize CRLF→LF + strip trailing ws
  return new TextDecoder().decode(u8).replace(/\\r\\n/g,"\\n").replace(/[ \\t]+\\n/g,"\\n").replace(/\\s+$/,""); }
function strBytes(s){ return new TextEncoder().encode(s); }

// ── PSX EXTRACT ─────────────────────────────────────────────────────────────
function extractPSX(dirBytes, origName){
  var outer=psxParseOuter(dirBytes);
  var zip=new JSZip();
  var manifest={version:1, platform:"psx", filename:origName||"STAGE.DIR",
    psx:{headB64:outer.headB64, stages:[]}};
  var nFiles=0, nDars=0;
  outer.stages.forEach(function(st){
    var parsed=psxParseStage(dirBytes.subarray(st.byteOff, st.byteOff+st.extent));
    var m={name:st.name, nameB64:st.nameB64, sector:st.sector,
      headerB64:parsed.headerB64, entries:[]};
    // ORIGINAL-NAME dump: files are named exactly <hash>.<ext> (decimal hash,
    // e.g. 39213.kmd) so external tools like MetalMintSolid find the names
    // they expect. Order and structure live in the manifest, not in filenames.
    // Rare duplicate (hash,ext) pairs in the same folder get __2/__3 suffixes,
    // recorded in the manifest so repack stays exact.
    var takenTop={};
    function pickName(taken,hash,extStr){
      var name=hash+"."+extStr, n=1;
      while(taken[name]){ n++; name=hash+"__"+n+"."+extStr; }
      taken[name]=1; return name;
    }
    parsed.entries.forEach(function(e,i){
      var me={idx:i,hash:e.hash,mode:e.mode,ext:e.ext};
      if(e.ext===0xff){ me.marker=true; me.name=e.hash+".marker"; m.entries.push(me); return; }
      var base=pickName(takenTop,e.hash,extName(e.ext));
      me.name=base;
      var darItems=(extName(e.ext)==="dar")? psxDarParse(e.data): null;
      if(darItems){
        me.isDar=true;
        var takenDar={};
        me.dar=darItems.map(function(d,j){
          var dn=pickName(takenDar,d.hash,extName(d.ext&255));
          zip.file(st.name+"/"+base+"_unpacked/"+dn, d.data); nFiles++;
          return {idx:j,hash:d.hash,ext:d.ext,crc:vramCrc32(d.data),name:dn};
        });
        nDars++;
      } else {
        zip.file(st.name+"/"+base, e.data); nFiles++;
      }
      m.entries.push(me);
    });
    manifest.psx.stages.push(m);
    log("  "+st.name+": "+m.entries.length+" entries");
  });
  zip.file(MANIFEST, JSON.stringify(manifest));
  // Header sidecar: the manifest already holds all base64 headers, but we also
  // drop a compact self-describing copy so a plain-FOLDER repack (no manifest
  // present, or manifest reconstructed from names) can still recover the
  // binary headers that cannot be synthesized from files alone.
  zip.file("_archive_headers.bin", JSON.stringify({
    v:1, platform:"psx", filename:manifest.filename,
    headB64:outer.headB64,
    stages:manifest.psx.stages.map(function(s){
      return {name:s.name, nameB64:s.nameB64, sector:s.sector, headerB64:s.headerB64};
    })
  }));
  log("PSX extract: "+outer.stages.length+" stages, "+nFiles+" files ("+nDars+" DARs unpacked)","ok");
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"}).then(function(u8){
    dl(u8,(origName||"STAGE.DIR").replace(/\\.[^.]*$/,"")+"_extracted.zip");
    log("Saved extracted ZIP. Edit files inside, then drop the ZIP (or the loose folder) back here to repack.","ok");
  });
}

// ── PC (MGZ) EXTRACT ────────────────────────────────────────────────────────
function extractPC(zipObj, origName){
  var manifest={version:1, platform:"pc", filename:origName||"stage.mgz",
    pc:{paths:[], dars:{}, gcx:{}}};
  var out=new JSZip();
  var jobs=[];
  var paths=[];
  zipObj.forEach(function(path,z){ if(!z.dir) paths.push({path:path.replace(/\\\\/g,"/"),z:z}); });
  paths.forEach(function(pr){
    jobs.push(pr.z.async("uint8array").then(function(data){ return {path:pr.path, data:data}; }));
  });
  return Promise.all(jobs).then(function(files){
    var nDar=0,nGcx=0,nSkip=0;
    files.forEach(function(f){
      manifest.pc.paths.push(f.path);
      var lower=f.path.toLowerCase();
      if(lower.endsWith(".dar")){
        var items=pcDarParse(f.data);
        if(items){
          var crcs={}; items.forEach(function(e){crcs[e.name]=vramCrc32(e.data);});
          manifest.pc.dars[f.path]={names:items.map(function(e){return e.name;}),crcs:crcs};
          items.forEach(function(e){ out.file(f.path+"_unpacked/"+e.name, e.data); });
          nDar++; return;
        }
        log("  ! "+f.path+" did not parse as a PC DAR — kept as-is","warn"); nSkip++;
      }
      if(lower.endsWith(".gcx")){
        try{
          var gcx=gcxParseGCX(f.data);
          var gcl=gcxAstToGCL(gcx);
          var gclPath=f.path.replace(/\\.gcx$/i,".gcl");
          manifest.pc.gcx[f.path]={origB64:b64FromBytes(f.data), gclPath:gclPath,
            gclNorm:normText(strBytes(gcl))};
          out.file(gclPath, gcl);
          nGcx++; return;
        }catch(err){
          log("  ! "+f.path+" GCX decompile failed ("+err.message+") — kept as-is","warn"); nSkip++;
        }
      }
      out.file(f.path, f.data);
    });
    out.file(MANIFEST, JSON.stringify(manifest));
    log("PC extract: "+files.length+" files ("+nDar+" DARs unpacked, "+nGcx+" GCX decompiled to GCL"+(nSkip? ", "+nSkip+" kept as-is":"")+")","ok");
    return out.generateAsync({type:"uint8array",compression:"DEFLATE"}).then(function(u8){
      dl(u8,(origName||"stage.mgz").replace(/\\.[^.]*$/,"")+"_extracted.zip");
      log("Saved extracted ZIP. Edit files (including the .gcl scripts), then drop it back to repack.","ok");
    });
  });
}

// ── REPACK (both platforms) ─────────────────────────────────────────────────
// fileMap: path(string, forward slashes, relative to extract root) -> Uint8Array
function repack(fileMap){
  var mBytes=fileMap[MANIFEST];
  if(!mBytes){ log("No "+MANIFEST+" found — this doesn't look like an extract from this tool.","err"); return; }
  var manifest=JSON.parse(new TextDecoder().decode(mBytes));
  if(manifest.platform==="psx") return repackPSX(manifest,fileMap);
  if(manifest.platform==="pc")  return repackPC(manifest,fileMap);
  log("Unknown platform in manifest: "+manifest.platform,"err");
}

function listUnder(fileMap,prefix){
  var out=[]; for(var p in fileMap) if(p.indexOf(prefix)===0) out.push(p);
  return out.sort();
}
function psxExtraItems(fileMap, folderPrefix, known){
  // user-added files inside a dar_unpacked folder: name pattern *_HASH.EXT
  var extras=[];
  listUnder(fileMap,folderPrefix).forEach(function(p){
    var base=p.substring(folderPrefix.length);
    if(base.indexOf("/")>=0) return;
    if(known[base]) return;
    var mm=base.match(/^(?:\\d{1,3}_)?(\\d+)(?:__\\d+)?\\.([a-z0-9]+)$/i);
    if(!mm){ log("  ! extra file '"+base+"' ignored (name it HASH.EXT, e.g. 39213.kmd)","warn"); return; }
    var extByte=0; for(var b in EXT_REV) if(EXT_REV[b]===mm[2].toLowerCase()){ extByte=+b; break; }
    extras.push({hash:+mm[1], ext:extByte, bytes:fileMap[p], name:base});
  });
  return extras;
}
var EXT_REV={};(function(){var m={0x61:"azm",0x62:"bin",0x63:"con",0x64:"dar",0x65:"efx",0x67:"gcx",0x68:"hzm",0x69:"img",0x6b:"kmd",0x6c:"lit",0x6d:"mt3",0x6f:"oar",0x70:"pcc",0x72:"rar",0x73:"sgt",0x77:"wvx",0x7a:"zmd"};for(var k in m)EXT_REV[k]=m[k];})();

// Run the v82 VRAM pass on a DAR's members if any of them changed since
// extract. items: [{name?, hash?, ext?, bytes}], changed flags precomputed.
// Mutates PCXINFO placement of changed texture members only.
function vramPass(label, files){
  var any=files.some(function(f){return f.changed;});
  if(!any) return;                                  // untouched DAR: never rewrite
  var rep=vramRepackFiles(files);
  if(rep.textures===0) return;                      // not a texture DAR
  if(!rep.moves.length&&!rep.clutMoves.length&&!rep.skipped.length){
    log("  VRAM "+label+": "+rep.changed+" changed texture(s), no conflicts","ok"); return;
  }
  rep.clutMoves.forEach(function(m){
    log("  VRAM "+label+": CLUT of "+m.name+" relocated ("+m.from.cx+","+m.from.cy+") → ("+m.to.cx+","+m.to.cy+")","ok");
  });
  rep.moves.forEach(function(m){
    log("  VRAM "+label+": "+m.name+" moved ("+m.from.px+","+m.from.py+") → ("+m.to.px+","+m.to.py+")"+(m.shared?" [shared group]":""),"ok");
  });
  rep.skipped.forEach(function(s){ log("  VRAM "+label+": SKIPPED "+s+" — fix placement manually","err"); });
}

function repackPSX(manifest,fileMap){
  var removed=0, added=0;
  var blobs={};
  manifest.psx.stages.forEach(function(m){
    var manifestNames={};                    // top-level names claimed by the manifest
    var entries=[];
    m.entries.forEach(function(me){
      if(me.marker){ entries.push({hash:me.hash,mode:me.mode,ext:me.ext,bytes:new Uint8Array(0),marker:true}); return; }
      manifestNames[me.name]=1;
      if(me.isDar){
        var folder=m.name+"/"+me.name+"_unpacked/";
        var known={};
        var items=[];
        me.dar.forEach(function(d){
          // manifest name (original-style) with legacy NNN_ fallback for old dumps
          var base=d.name || (String(d.idx).padStart(3,"0")+"_"+d.hash+"."+extName(d.ext&255));
          known[base]=1;
          var bytes=fileMap[folder+base];
          if(!bytes){
            log("  \\u2212 removed from "+me.name+" (file absent): "+base,"warn"); removed++;
            return;                          // DELETED member: drop it
          }
          items.push({hash:d.hash,ext:d.ext,bytes:bytes,name:base,
                      changed:(d.crc!==undefined)&&vramCrc32(bytes)!==d.crc});
        });
        psxExtraItems(fileMap,folder,known).forEach(function(x){
          x.changed=true;                            // new file = mobile
          items.push(x); log("  + added to "+me.name+": "+x.name,"ok"); added++;
        });
        vramPass(m.name+"/"+me.name,
          items.map(function(it){return {name:it.name,data:it.bytes,changed:it.changed};}));
        entries.push({hash:me.hash,mode:me.mode,ext:me.ext,bytes:psxDarBuild(items)});
        return;
      }
      var bytes=fileMap[m.name+"/"+me.name];
      if(!bytes){
        log("  \\u2212 removed from "+m.name+" (file absent): "+me.name,"warn"); removed++;
        return;                              // DELETED entry: drop it
      }
      entries.push({hash:me.hash,mode:me.mode,ext:me.ext,bytes:bytes});
    });
    // stage-root ADDITIONS: files directly in <stage>/ that the manifest doesn't
    // know, named <hash>.<ext> (legacy NNN_<hash>.<ext> also accepted). Inserted
    // before the trailing marker entries so the terminator stays last.
    var extras=[];
    listUnder(fileMap,m.name+"/").forEach(function(p){
      var base=p.substring(m.name.length+1);
      if(base.indexOf("/")>=0) return;               // inside an _unpacked folder
      if(manifestNames[base]) return;
      var mm=base.match(/^(?:\\d{1,3}_)?(\\d+)(?:__\\d+)?\\.([a-z0-9]+)$/i);
      if(!mm){ log("  ! extra file '"+m.name+"/"+base+"' ignored (name it HASH.EXT)","warn"); return; }
      var extByte=0; for(var b in EXT_REV) if(EXT_REV[b]===mm[2].toLowerCase()){ extByte=+b; break; }
      if(!extByte){ log("  ! extra file '"+base+"' ignored (unknown extension ."+mm[2]+")","warn"); return; }
      extras.push({hash:+mm[1],ext:extByte,bytes:fileMap[p],name:base});
    });
    if(extras.length){
      var lastMode=0;
      entries.forEach(function(e){ if(!e.marker) lastMode=e.mode; });
      var insertAt=entries.length;
      while(insertAt>0 && entries[insertAt-1].marker) insertAt--;
      extras.forEach(function(x,xi){
        entries.splice(insertAt+xi,0,{hash:x.hash,mode:lastMode,ext:x.ext,bytes:x.bytes});
        log("  + added to "+m.name+": "+x.name,"ok"); added++;
      });
    }
    entries.forEach(function(e){ delete e.marker; });
    blobs[m.name]=psxRebuildStage(m.headerB64,entries);
  });
  if(removed||added) log("Repack applied "+added+" addition(s) and "+removed+" deletion(s). If any deletion was unintended, restore the file and repack again.","warn");
  var out=psxRebuildDir(manifest,blobs);
  dl(out, manifest.filename||"STAGE.DIR");
  log("Repacked PSX "+(manifest.filename||"STAGE.DIR")+" — "+out.length+" bytes ("+(out.length/2048)+" sectors)","ok");
}

function repackPC(manifest,fileMap){
  var zip=new JSZip();
  var missing=[], warnings=0;
  manifest.pc.paths.forEach(function(path){
    var darInfo=manifest.pc.dars[path];
    if(darInfo){
      var folder=path+"_unpacked/";
      var known={};
      var items=[];
      darInfo.names.forEach(function(nm){
        known[nm]=1;
        var bytes=fileMap[folder+nm];
        if(!bytes){ log("  \\u2212 removed from "+path+" (file absent): "+nm,"warn"); return; }
        var origCrc=darInfo.crcs?darInfo.crcs[nm]:undefined;
        items.push({name:nm,bytes:bytes,
                changed:(origCrc!==undefined)&&vramCrc32(bytes)!==origCrc});
      });
      listUnder(fileMap,folder).forEach(function(p){
        var base=p.substring(folder.length);
        if(base.indexOf("/")>=0 || known[base]) return;
        items.push({name:base,bytes:fileMap[p],changed:true});
        log("  + added to "+path+": "+base,"ok");
      });
      vramPass(path,
        items.map(function(it){return {name:it.name,data:it.bytes,changed:it.changed};}));
      zip.file(path, pcDarBuild(items));
      return;
    }
    var gcxInfo=manifest.pc.gcx[path];
    if(gcxInfo){
      var gclBytes=fileMap[gcxInfo.gclPath];
      if(!gclBytes){
        log("  ! "+gcxInfo.gclPath+" absent \\u2014 keeping the ORIGINAL compiled "+path+" (scripts are load-bearing; delete not applied)","warn");
        zip.file(path, bytesFromB64(gcxInfo.origB64));
        return;
      }
      if(normText(gclBytes)===gcxInfo.gclNorm){
        zip.file(path, bytesFromB64(gcxInfo.origB64));      // unchanged → byte-perfect original
      } else {
        try{
          var orig=gcxParseGCX(bytesFromB64(gcxInfo.origB64));
          var res=gcxCompileTextToBytes(new TextDecoder().decode(gclBytes), orig);
          if(res.warnings && res.warnings.length){
            res.warnings.forEach(function(w){ log("  ! "+path+": "+w,"warn"); });
            warnings+=res.warnings.length;
          }
          zip.file(path, res.bytes);
          log("  compiled "+gcxInfo.gclPath+" → "+path+" ("+res.bytes.length+" bytes)","ok");
        }catch(err){
          log("  ! GCX compile FAILED for "+path+": "+err.message+" — using ORIGINAL gcx (your GCL edits to this file are NOT in the output)","err");
          zip.file(path, bytesFromB64(gcxInfo.origB64));
        }
      }
      return;
    }
    var bytes=fileMap[path];
    if(!bytes){ log("  \\u2212 removed (file absent): "+path,"warn"); return; }
    zip.file(path, bytes);
  });
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"}).then(function(u8){
    dl(u8, manifest.filename||"stage.mgz");
    log("Repacked PC "+(manifest.filename||"stage.mgz")+(warnings?" — "+warnings+" compiler warning(s), review above":""),"ok");
  });
}

// ── input handling: file / zip / folder detection ───────────────────────────
function handleSingleFile(file){
  reset();
  var rd=new FileReader();
  rd.onload=function(){
    var u8=new Uint8Array(rd.result);
    var isZip=(u8[0]===0x50&&u8[1]===0x4b&&u8[2]===3&&u8[3]===4);
    if(isZip){
      JSZip.loadAsync(u8).then(function(z){
        // repack manifest can live at ANY depth (re-zipped extraction folders
        // nest everything one level down) — search like the folder drop does
        var mPath = null;
        z.forEach(function(p, e){
          if (!e.dir && !mPath && p.replace(/\\\\/g, "/").split("/").pop() === MANIFEST)
            mPath = p.replace(/\\\\/g, "/");
        });
        if (mPath){
          var prefix = mPath.substring(0, mPath.length - MANIFEST.length);
          log("Detected: repack ZIP (manifest at \\u201C" + (prefix || "./") + "\\u201D) \\u2014 repacking\\u2026");
          var fileMap = {}, jobs = [];
          z.forEach(function(p, e){
            if (e.dir) return;
            var norm = p.replace(/\\\\/g, "/");
            if (norm.indexOf(prefix) !== 0) return;
            jobs.push(e.async("uint8array").then(function(d){ fileMap[norm.substring(prefix.length)] = d; }));
          });
          Promise.all(jobs).then(function(){ repack(fileMap); });
        } else {
          log("No " + MANIFEST + " anywhere in this zip \\u2014 treating as PC stage.mgz. (To repack an extraction, the manifest file is required \\u2014 keep it when editing.)","warn");
          log("PC stage.mgz \\u2014 ready. Use \\u{1F4E6} Extract zip or \\u{1F501} Resident swap.","ok");
          window.PENDING_EXTRACT = function(){ extractPC(z, file.name); };
          var xb = document.getElementById("extractBtn"); if (xb) xb.style.display = "";
          if(typeof SWAPUI_stashPC==="function") SWAPUI_stashPC(z, file.name);
        }
      }).catch(function(e){ log("ZIP parse failed: "+e.message,"err"); });
    } else {
      try{
        var outer=psxParseOuter(u8);
        if(!outer.stages.length || outer.stages.some(function(s){return s.byteOff>=u8.length;})) throw new Error("bad outer directory");
        log("Detected: PSX stage.dir ("+outer.stages.length+" stages) — ready. Use \\u{1F4E6} Extract zip or \\u{1F501} Resident swap.","ok");
        window.PENDING_EXTRACT = function(){ extractPSX(u8, file.name); };
        var xb = document.getElementById("extractBtn"); if (xb) xb.style.display = "";
        if(typeof SWAPUI_stash==="function") SWAPUI_stash(u8, file.name);
      }catch(e){ log("Not a recognizable stage.dir / stage.mgz / repack ZIP: "+e.message,"err"); }
    }
  };
  rd.readAsArrayBuffer(file);
}

// Regenerate a manifest from a plain extracted FOLDER that lost its
// _archive_manifest.json but kept the header sidecar. Structure convention
// (produced by extractPSX): <stage>/NNN_hash.ext for plain members, and
// <stage>/NNN_hash.dar_unpacked/MMM_hash.ext for DAR members. Ordering and
// DAR membership come from the NNN indices in the names; headers come from
// the sidecar. Returns {map} ready for repack(), or null if not recognizable.
function tryRegenManifest(fileMap){
  // find the sidecar at any depth; rebase everything under its folder
  var sPath=null, sBest=1e9;
  for(var p in fileMap){
    if(p.split("/").pop()==="_archive_headers.bin"){ var d=p.split("/").length; if(d<sBest){sBest=d;sPath=p;} }
  }
  if(!sPath) return null;
  var prefix=sPath.substring(0, sPath.length-"_archive_headers.bin".length);
  var fm={};
  for(var q in fileMap) if(q.indexOf(prefix)===0) fm[q.substring(prefix.length)]=fileMap[q];
  var side;
  try{ side=JSON.parse(new TextDecoder().decode(fm["_archive_headers.bin"])); }catch(e){ return null; }
  if(!side || side.platform!=="psx" || !side.stages) return null;

  var EXT_FWD={}; for(var b in EXT_REV) EXT_FWD[EXT_REV[b]]=+b;
  function extByteOf(x){ return EXT_FWD[x.toLowerCase()]!==undefined?EXT_FWD[x.toLowerCase()]:0; }

  var manifest={version:1, platform:"psx", filename:side.filename||"STAGE.DIR",
                psx:{headB64:side.headB64, stages:[]}};

  side.stages.forEach(function(sh){
    var m={name:sh.name, nameB64:sh.nameB64, sector:sh.sector, headerB64:sh.headerB64, entries:[]};
    // collect this stage's top-level members: <stage>/NNN_hash.ext (files) and
    // <stage>/NNN_hash.EXT_unpacked/ (dar folders)
    var topRe=new RegExp("^"+sh.name.replace(/[.*+?^\${}()|[\\\\]\\\\\\\\]/g,"\\\\\\\\$&")+"/([0-9]{3})_([0-9]+)\\\\.([a-z0-9]+)$","i");
    var darFolders={};
    for(var f in fm){
      var dm=f.match(new RegExp("^"+sh.name.replace(/[.*+?^\${}()|[\\\\]\\\\\\\\]/g,"\\\\\\\\$&")+"/([0-9]{3})_([0-9]+)\\\\.([a-z0-9]+)_unpacked/([0-9]{3})_([0-9]+)\\\\.([a-z0-9]+)$","i"));
      if(dm){
        var key=dm[1]+"_"+dm[2]+"."+dm[3];
        (darFolders[key]=darFolders[key]||{idx:+dm[1],hash:+dm[2],ext:extByteOf(dm[3]),members:[]})
          .members.push({idx:+dm[4],hash:+dm[5],ext:extByteOf(dm[6])});
      }
    }
    var members=[];
    for(var g in fm){
      var tm=g.match(topRe); if(!tm) continue;
      members.push({idx:+tm[1],hash:+tm[2],ext:extByteOf(tm[3]),name:tm[1]+"_"+tm[2]+"."+tm[3]});
    }
    // merge dar folders (their top-level .dar member isn't a file on disk)
    for(var k in darFolders){
      var dfd=darFolders[k];
      members.push({idx:dfd.idx,hash:dfd.hash,ext:dfd.ext,name:k,isDar:true,
        dar:dfd.members.sort(function(a,b){return a.idx-b.idx;}).map(function(x){return {idx:x.idx,hash:x.hash,ext:x.ext};})});
    }
    members.sort(function(a,b){return a.idx-b.idx;});
    m.entries=members;
    manifest.psx.stages.push(m);
  });

  fm[MANIFEST]=new TextEncoder().encode(JSON.stringify(manifest));
  return {map:fm};
}

// folder drop: walk webkitGetAsEntry tree → fileMap keyed by path relative to
// the folder that CONTAINS the manifest.
function processFolderFileMap(fileMap){
    if(!Object.keys(fileMap).length){
      log("Dropped folder was empty or unreadable — try the ZIP or the Load-folder button instead.","err"); return;
    }
    // manifest can be at ANY depth (folder-of-folders); pick the shallowest
    var mPath=null, best=1e9;
    for(var p in fileMap){
      if(p.split("/").pop()===MANIFEST){ var d=p.split("/").length; if(d<best){best=d;mPath=p;} }
    }
    if(mPath){
      var prefix=mPath.substring(0,mPath.length-MANIFEST.length);
      var rebased={};
      for(var q in fileMap) if(q.indexOf(prefix)===0) rebased[q.substring(prefix.length)]=fileMap[q];
      log("Folder drop: manifest at \\u201C"+(prefix||"./")+"\\u201D, "+Object.keys(rebased).length+" files — repacking\\u2026","ok");
      repack(rebased);
      return;
    }
    // No manifest. A plain stage folder CAN still be repacked IF its layout
    // matches what this tool's extractor produces (stage subfolders holding
    // NNN_hash.ext members and *_unpacked/ DAR folders) — we regenerate the
    // manifest from that structure. The one thing we cannot invent is the
    // original binary directory/stage HEADERS, so this only works when the
    // folder is a genuine extract from this tool (headers were saved). We
    // detect that by looking for the sidecar header file the extractor now
    // writes; if it's absent, explain precisely.
    var regen=tryRegenManifest(fileMap);
    if(regen){
      log("Folder drop: no manifest, but structure recognized — regenerated from "+
          Object.keys(regen.map).length+" files and headers. Repacking\\u2026","ok");
      repack(regen.map);
      return;
    }
    // Genuinely unrebuildable: report what we DID see so the user can fix it.
    var stageDirs={}, looseCount=0;
    for(var r in fileMap){
      var seg=r.split("/"); if(seg.length>1) stageDirs[seg[0]]=1; else looseCount++;
    }
    log("No "+MANIFEST+" in the dropped folder, and it isn't a recognizable "+
        "tool extract (missing the header sidecar), so the binary STAGE.DIR "+
        "headers can't be reconstructed.","err");
    log("  Found: "+Object.keys(stageDirs).length+" stage folder(s), "+looseCount+" loose file(s).","warn");
    log("  Fix: re-extract with this tool (it now writes the manifest AND a "+
        "header sidecar into the folder), edit files in place, then drop the "+
        "same folder back. Keep BOTH "+MANIFEST+" and _archive_headers.bin.","warn");
}
function handleEntries(entries){
  reset();
  var fileMap={}, pending=1, done=false, errors=0, nRead=0;
  function settle(){
    if(pending>0||done) return; done=true;
    if(errors) log("  ! "+errors+" file(s) could not be read from the dropped folder (locked/inaccessible) — they were skipped.","warn");
    log("Folder drop: "+nRead+" file(s) read.","ok");
    processFolderFileMap(fileMap);
  }
  function walk(entry,path){
    try{
      if(entry.isFile){
        pending++;
        entry.file(function(f){
          var rd=new FileReader();
          rd.onload=function(){ fileMap[path+f.name]=new Uint8Array(rd.result); nRead++; pending--; settle(); };
          rd.onerror=function(){ errors++; pending--; settle(); };
          rd.readAsArrayBuffer(f);
        }, function(){ errors++; pending--; settle(); });   // file() error MUST release its hold
      } else if(entry.isDirectory){
        pending++;
        var reader=entry.createReader(), base=path+entry.name+"/";
        (function readAll(){
          reader.readEntries(function(batch){
            if(!batch.length){ pending--; settle(); return; }   // dir fully read
            batch.forEach(function(e){ walk(e, base); });
            readAll();                                          // 100-entry chunks
          }, function(){ errors++; pending--; settle(); });
        })();
      }
    }catch(ex){ errors++; }                                    // sync throw: never wedge the walk
  }
  entries.forEach(function(e){ walk(e,""); });
  pending--; settle();   // release the initial hold now the tree is enqueued
  setTimeout(function(){                                       // watchdog: report a wedged walk
    if(!done) log("Still reading the folder ("+nRead+" file(s) so far)\\u2026 if this never finishes, use the Load-folder button instead of drag-and-drop.","warn");
  }, 5000);
}
// Load-folder button: webkitdirectory input — immune to drag-drop file() quirks.
function handleDirInput(files){
  reset();
  if(!files || !files.length){ log("No folder selected.","err"); return; }
  var fileMap={}, left=files.length, errors=0;
  log("Reading "+files.length+" file(s) from the selected folder\\u2026","ok");
  Array.prototype.forEach.call(files,function(f){
    var rd=new FileReader();
    rd.onload=function(){
      fileMap[(f.webkitRelativePath||f.name).replace(/\\\\/g,"/")]=new Uint8Array(rd.result);
      if(--left===0){ if(errors) log("  ! "+errors+" unreadable file(s) skipped.","warn"); processFolderFileMap(fileMap); }
    };
    rd.onerror=function(){ errors++; if(--left===0){ log("  ! "+errors+" unreadable file(s) skipped.","warn"); processFolderFileMap(fileMap); } };
    rd.readAsArrayBuffer(f);
  });
}

// wire up UI
document.addEventListener("DOMContentLoaded",function(){
  var drop=$("#drop");
  ["dragenter","dragover"].forEach(function(ev){ document.body.addEventListener(ev,function(e){e.preventDefault();drop.classList.add("hot");}); });
  ["dragleave","drop"].forEach(function(ev){ document.body.addEventListener(ev,function(e){e.preventDefault(); if(ev==="drop"||e.target===document.body)drop.classList.remove("hot");}); });
  document.body.addEventListener("drop",function(e){
    e.preventDefault(); drop.classList.remove("hot");
    var items=e.dataTransfer.items;
    if(items && items.length && items[0].webkitGetAsEntry){
      var entries=[]; for(var i=0;i<items.length;i++){var en=items[i].webkitGetAsEntry(); if(en)entries.push(en);}
      if(entries.length===1 && entries[0].isFile){ handleSingleFile(e.dataTransfer.files[0]); return; }
      if(entries.some(function(en){return en.isDirectory;})){ handleEntries(entries); return; }
    }
    if(e.dataTransfer.files.length===1) handleSingleFile(e.dataTransfer.files[0]);
    else log("Drop one archive file, one repack ZIP, or one folder.","err");
  });
  $("#pick").onclick=function(){ $("#fileIn").click(); };
  // Embedded mode (mod suite iframe): show Exit that calls the host hook.
  try{ if(window.self!==window.top){ var hx=$("#hostExit"); hx.style.display="";
    hx.onclick=function(){ if(typeof window.ARCH_HOST_EXIT==="function") window.ARCH_HOST_EXIT(); }; } }catch(e){}
  $("#fileIn").onchange=function(e){ if(e.target.files[0]) handleSingleFile(e.target.files[0]); };
  $("#pickDir").onclick=function(){ $("#dirIn").click(); };
  $("#dirIn").onchange=function(e){ handleDirInput(e.target.files); e.target.value=""; };
});
})();
<\/script>

<script>
// ═══════════════════════════════════════════════════════════════════════════
// swap.js — RESIDENT CHARACTER SWAP
// ═══════════════════════════════════════════════════════════════════════════
// Remove a character's textures from the resident (init) stage, insert another
// character's PCX files under their own names/hashes, and re-home the new
// textures into resident-safe VRAM. The game's loader is generic (hash-keyed,
// verified in libdg/loader.c DG_LoadInitPcx) — models resolve textures lazily
// by hash — so the swap works as long as VRAM placement is resident-safe:
//
//   • Texture rects must sit inside the init region x640-1023, y0-239.
//     (y240-255 is EXCLUDED even though it is "py<256": stage packs park
//     their CLUTs on that strip at x512-1023 and rewrite it on every area
//     load — anything resident there gets bulldozed.)
//   • CLUTs go into slots freed by the removed textures FIRST (those are
//     proven resident-safe: they survived every stage load while the old
//     character used them). Fallback slots elsewhere in the y240-255 band
//     are flagged with a warning to verify against busy stages.
//
// Placement prefers the freed rects (proven-safe), then first-fit-decreasing
// in the remaining init-region space, honoring TPAGE crossing rules.

"use strict";

var SWAP_REGION_INIT = { x1: 640, y1: 0, x2: 1024, y2: 240 };

// Retail resident CLUT positions, extracted from pristine STAGE.DIRs. Inside
// the engine palette block, ONLY these exact slots are Konami-proven against
// every stage's palette-effect/backup traffic. A "freed" slot inherited from
// a previously-modded resident (tool-chosen position) proves nothing — that
// was the Otacon-chest bug: an inherited in-block slot at a non-retail spot.
// NOTE: retail also records cluts at x960-1008 (the codec/staging column),
// but the ENGINE maintains those palettes itself (face streaming, menu
// refresh) — reusing a freed slot there gets overwritten immediately (the
// "17 files mangled at (960,226)" regression). Trust stops at x944.
var SWAP_RETAIL_CLUTS = {
  integral: ["768,226","768,227","768,228","768,229","784,226","784,227","784,229","800,226","800,227","800,228","816,226","816,227","816,228","832,226","832,227","832,228","848,226","848,227","848,228","864,226","864,227","864,228","880,226","880,227","880,228","896,226","896,227","896,228","912,226","912,227","912,228","928,226","928,227","928,228","944,226","944,227","944,228"],
  jp: ["0,240","0,241","112,240","112,241","128,240","128,241","144,240","16,240","16,241","160,240","176,240","192,240","208,240","224,240","240,240","256,240","272,240","288,240","304,240","32,240","32,241","320,240","336,240","352,240","368,240","384,240","400,240","416,240","432,240","448,240","464,240","480,240","48,240","48,241","496,240","512,240","528,240","544,240","560,240","576,240","592,240","608,240","624,240","64,240","64,241","80,240","80,241","96,240","96,241","960,209"]
};

// GV_StrCode — same hash the game uses for file names.
function SWAP_mgsHash(s){
  var h = 0;
  for (var i = 0; i < s.length; i++){
    h = ((h >> 11) | (h << 5)) & 0xFFFF;
    h = (h + s.charCodeAt(i)) & 0xFFFF;
  }
  return h;
}

// Filename → hash. Accepts this tool's export shape "NNN_hash.pcx", a bare
// 4-hex-digit stem "1a2f.pcx", or a real name ("sna_b01.pcx" → GV_StrCode).
function SWAP_hashFromFilename(name){
  var stem = String(name).replace(/^.*[\\/\\\\]/, "").replace(/\\.[^.]+$/, "");
  var m = stem.match(/^\\d+_([0-9a-fA-F]{1,4})$/);
  if (m) return { hash: parseInt(m[1], 16), how: "export-name" };
  if (/^[0-9a-fA-F]{4}$/.test(stem)) return { hash: parseInt(stem, 16), how: "hex-stem" };
  return { hash: SWAP_mgsHash(stem), how: "strcode(\\"" + stem + "\\")" };
}

// ── collect every texture in a parsed stage ─────────────────────────────────
// entries: psxParseStage().entries. Returns refs into loose entries and DAR
// members: {kind, ei, mi?, hash, memberExt?, bytes, slot}
function SWAP_collectTextures(entries){
  var out = [];
  for (var ei = 0; ei < entries.length; ei++){
    var e = entries[ei];
    var data = e.data || e.bytes;              /* parsed vs rebuilt entry shape */
    if (!data) continue;
    var slot = vramSlotOf("e" + ei, data);
    if (slot){
      out.push({ kind: "loose", ei: ei, hash: e.hash, bytes: data, slot: slot });
      continue;
    }
    if (extName(e.ext) === "dar"){
      var members = psxDarParse(data);
      if (!members) continue;
      for (var mi = 0; mi < members.length; mi++){
        var ms = vramSlotOf("e" + ei + "m" + mi, members[mi].data);
        if (ms) out.push({ kind: "dar", ei: ei, mi: mi, hash: members[mi].hash,
                           memberExt: members[mi].ext, bytes: members[mi].data, slot: ms });
      }
    }
  }
  return out;
}

// Resident-safe CLUT slot: inside the init region (x640-1023) BELOW y240,
// scanning bottom-up so CLUT rows stay clear of textures packed from y0 down.
// The classic y240-255 band is rewritten by stage packs on every area load —
// fine for stage textures, fatal for resident ones. x steps by 16 (GPU clut
// id truncates unaligned x — the "some textures broken" bug).
function SWAP_findResidentClutSlot(allCluts, allTex, nc){
  for (var y = 239; y >= 0; y--){
    for (var x = 640; x + nc <= 960; x += 16){   /* x960+ is engine-owned (codec staging etc.) */
      var cand = { cx: x, cy: y, nc: nc }, ok = true, i;
      for (i = 0; i < allCluts.length; i++) if (clutsOverlap(cand, allCluts[i])){ ok = false; break; }
      if (ok) for (i = 0; i < allTex.length; i++)
        if (rectsOverlap({ x: x, y: y, w: nc, h: 1 }, texRect(allTex[i]))){ ok = false; break; }
      if (ok) return { cx: x, cy: y };
    }
  }
  return null;
}

// Decode a 4bpp EGA PCX's pixel data and report which palette indices the
// image actually references. RLE is decoded as one continuous stream (runs
// that respect scanline bounds decode identically). Returns Uint8Array(16)
// of 0/1 flags, or null if the file isn't a decodable 4bpp EGA PCX.
function SWAP_pcxUsedIndices(bytes){
  if (!bytes || bytes.length < 130 || bytes[0] !== 10) return null;
  if (bytes[3] !== 1 || bytes[65] !== 4) return null;
  var w = (bytes[8] | (bytes[9] << 8)) - (bytes[4] | (bytes[5] << 8)) + 1;
  var h = (bytes[10] | (bytes[11] << 8)) - (bytes[6] | (bytes[7] << 8)) + 1;
  var bpl = bytes[66] | (bytes[67] << 8);
  if (w <= 0 || h <= 0 || bpl <= 0 || w > 1024 || h > 1024) return null;
  var total = bpl * 4 * h, buf = new Uint8Array(total);
  var o = 0, p = 128, b, n, v;
  while (o < total && p < bytes.length){
    b = bytes[p++];
    if ((b & 0xC0) === 0xC0){ n = b & 0x3F; v = bytes[p++]; while (n-- && o < total) buf[o++] = v; }
    else buf[o++] = b;
  }
  var used = new Uint8Array(16);
  for (var y = 0; y < h; y++){
    var r = y * bpl * 4;
    for (var x = 0; x < w; x++){
      var bi = x >> 3, bit = 7 - (x & 7);
      var idx = ((buf[r + bi] >> bit) & 1) |
                (((buf[r + bpl + bi] >> bit) & 1) << 1) |
                (((buf[r + 2 * bpl + bi] >> bit) & 1) << 2) |
                (((buf[r + 3 * bpl + bi] >> bit) & 1) << 3);
      used[idx] = 1;
    }
  }
  return used;
}

// Decode a 4bpp EGA PCX into a per-pixel index buffer (w*h), or null.
function SWAP_pcxDecodeIndices(bytes){
  if (!bytes || bytes.length < 130 || bytes[0] !== 10) return null;
  if (bytes[3] !== 1 || bytes[65] !== 4) return null;
  var w = (bytes[8] | (bytes[9] << 8)) - (bytes[4] | (bytes[5] << 8)) + 1;
  var h = (bytes[10] | (bytes[11] << 8)) - (bytes[6] | (bytes[7] << 8)) + 1;
  var bpl = bytes[66] | (bytes[67] << 8);
  if (w <= 0 || h <= 0 || bpl <= 0 || w > 1024 || h > 1024) return null;
  var total = bpl * 4 * h, buf = new Uint8Array(total);
  var o = 0, p = 128, b, n, v;
  while (o < total && p < bytes.length){
    b = bytes[p++];
    if ((b & 0xC0) === 0xC0){ n = b & 0x3F; v = bytes[p++]; while (n-- && o < total) buf[o++] = v; }
    else buf[o++] = b;
  }
  var px = new Uint8Array(w * h);
  for (var y = 0; y < h; y++){
    var r = y * bpl * 4;
    for (var x = 0; x < w; x++){
      var bi = x >> 3, bit = 7 - (x & 7);
      px[y * w + x] = ((buf[r + bi] >> bit) & 1) |
                      (((buf[r + bpl + bi] >> bit) & 1) << 1) |
                      (((buf[r + 2 * bpl + bi] >> bit) & 1) << 2) |
                      (((buf[r + 3 * bpl + bi] >> bit) & 1) << 3);
    }
  }
  return { px: px, w: w, h: h, bpl: bpl };
}

// Rebuild a 4bpp EGA PCX from an index buffer, reusing the original 128-byte
// header (palette rewritten by the caller). RLE runs never cross a plane line.
function SWAP_pcxEncodeIndices(header, dec){
  var w = dec.w, h = dec.h, bpl = dec.bpl, px = dec.px;
  var out = [];
  for (var y = 0; y < h; y++){
    for (var pl = 0; pl < 4; pl++){
      var line = new Uint8Array(bpl);
      for (var x = 0; x < w; x++)
        if ((px[y * w + x] >> pl) & 1) line[x >> 3] |= 1 << (7 - (x & 7));
      var i = 0;
      while (i < bpl){
        var v = line[i], n = 1;
        while (i + n < bpl && line[i + n] === v && n < 63) n++;
        if (n > 1 || (v & 0xC0) === 0xC0) out.push(0xC0 | n, v);
        else out.push(v);
        i += n;
      }
    }
  }
  var bytes = new Uint8Array(128 + out.length);
  bytes.set(header.subarray(0, 128));
  bytes.set(out, 128);
  return bytes;
}

// Union-fit palette grouping with lossless pixel remap. Rips are often
// palettized per image: same material colors, different index layouts, junk
// in unused entries — so index-wise comparison can't merge them, but their
// COLOR sets overlap heavily. Bin-pack the 1555 color sets (16 per clut),
// then remap every member's pixels onto its bin's shared palette and
// re-encode. On-screen colors are preserved exactly: PSX index order is
// meaningless and transparency keys on color VALUE 0, not index.
// Mutates each add: bytes may be replaced, gid assigned.
function SWAP_groupAdds(adds, groupMode){
  var bins = [], keyGroups = {}, nextGid = 0;
  // Color identity for merging. Two rules learned in game:
  // 1. The loader's transparency test is on EXACT RGB black: (0,0,0)
  //    uploads transparent, while near-black like (5,3,2) uploads opaque —
  //    so exact black gets its own key and always keeps its exact bytes.
  // 2. The loader's 8-bit -> 1555 conversion ROUNDS (proven by in-game
  //    shade shifts when truncation-equal colors were merged). So colors
  //    only merge when they quantize identically under BOTH truncation and
  //    rounding — then the GPU result is identical under either converter
  //    and representative substitution is provably invisible. Ambiguous
  //    pairs (e.g. 48 vs 52: truncate together, round apart) stay separate
  //    entries, each keeping its own exact bytes.
  // groupMode 0 (default): dual-quantization keys — merges are provably
  // invisible under either converter. groupMode 1 (fallback when the safe
  // CLUT budget would otherwise overflow): truncation-only keys — merged
  // colors may shift by at most one 5-bit shade step under rounding.
  function ckey(r, g, b){
    if (r === 0 && g === 0 && b === 0) return "T";
    var t15 = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (groupMode === 1) return "c" + t15;
    function q(v){ return Math.min(31, (v + 4) >> 3); }          /* shift-round */
    function s(v){ return ((v * 31 + 127) / 255) | 0; }          /* scale-round */
    var r15 = (q(r) << 10) | (q(g) << 5) | q(b);
    var s15 = (s(r) << 10) | (s(g) << 5) | s(b);
    return "c" + t15 + "_" + r15 + "_" + s15;
  }
  adds.forEach(function(a){
    var dec = a.slot.bpp === 4 ? SWAP_pcxDecodeIndices(a.bytes) : null;
    if (!dec){
      var kk = SWAP_paletteKey(a.bytes, a.slot);   /* non-decodable: exact-key dedupe */
      if (keyGroups[kk] === undefined) keyGroups[kk] = "k" + (nextGid++);
      a.gid = keyGroups[kk];
      return;
    }
    // Index 0 is additionally position-reserved (idx0 pixels stay idx0,
    // non-zero stay non-zero) so BOTH known PSX transparency conventions
    // are preserved exactly.
    var usesIdx0 = false, nz = {}, i, idx;
    for (i = 0; i < dec.px.length; i++){
      idx = dec.px[i];
      var po = 16 + idx * 3;
      if (idx === 0){ usesIdx0 = true; continue; }
      var k = ckey(a.bytes[po], a.bytes[po + 1], a.bytes[po + 2]);
      if (!(k in nz)) nz[k] = [a.bytes[po], a.bytes[po + 1], a.bytes[po + 2]];
    }
    var c0key = null, c0rgb = null;
    if (usesIdx0){
      c0key = ckey(a.bytes[16], a.bytes[17], a.bytes[18]);
      c0rgb = [a.bytes[16], a.bytes[17], a.bytes[18]];
    }
    var keys = Object.keys(nz);
    var bi = -1;
    for (i = 0; i < bins.length && bi < 0; i++){
      var B0 = bins[i];
      if (c0key && B0.c0key && B0.c0key !== c0key) continue;
      var extra = 0;
      for (var k2 = 0; k2 < keys.length; k2++) if (!(keys[k2] in B0.nz)) extra++;
      if (Object.keys(B0.nz).length + extra <= 15) bi = i;
    }
    if (bi < 0){ bins.push({ c0key: null, c0rgb: null, nz: {}, members: [], gid: "b" + (nextGid++) }); bi = bins.length - 1; }
    var B = bins[bi];
    if (c0key && !B.c0key){ B.c0key = c0key; B.c0rgb = c0rgb; }
    keys.forEach(function(k3){ if (!(k3 in B.nz)) B.nz[k3] = nz[k3]; });
    B.members.push({ add: a, dec: dec });
    a.gid = B.gid;
  });
  // Build each bin's palette (entry 0 = the transparency/idx0 color, 1..15 =
  // opaque colors, remainder zero-filled) and rewrite every member: full
  // 16-entry palette written identically so all uploads to the shared slot
  // are byte-identical, plus remapped, re-encoded pixels.
  bins.forEach(function(B){
    if (!B.nz) return;
    var order = Object.keys(B.nz);                 /* insertion order, ≤15 */
    var newIdxOf = {}; order.forEach(function(k, i){ newIdxOf[k] = i + 1; });
    B.members.forEach(function(m){
      var a = m.add, dec = m.dec, i, idx;
      var map = new Uint8Array(16);
      map[0] = 0;                                  /* idx0 stays put */
      for (idx = 1; idx < 16; idx++){
        var po = 16 + idx * 3;
        var k = ckey(a.bytes[po], a.bytes[po + 1], a.bytes[po + 2]);
        map[idx] = (k in newIdxOf) ? newIdxOf[k] : 0;   /* unused → harmless */
      }
      var remapped = new Uint8Array(dec.px.length);
      for (i = 0; i < dec.px.length; i++) remapped[i] = map[dec.px[i]];
      var header = new Uint8Array(a.bytes.subarray(0, 128));
      var e0 = B.c0rgb || [0, 0, 0];
      header[16] = e0[0]; header[17] = e0[1]; header[18] = e0[2];
      for (idx = 1; idx < 16; idx++){
        var rgb = idx - 1 < order.length ? B.nz[order[idx - 1]] : [0, 0, 0];
        header[16 + idx * 3] = rgb[0]; header[17 + idx * 3] = rgb[1]; header[18 + idx * 3] = rgb[2];
      }
      // CLUT-width fix: unifying textures onto a shared palette relocates a
      // member's colors to indices as high as \`order.length\` (opaque colors
      // occupy slots 1..order.length above the idx0/transparency slot). The
      // PC init loader (DG_LoadInitPcx) uploads exactly PCXINFO.n_colors CLUT
      // entries, so a member whose ORIGINAL n_colors was smaller would have its
      // relocated (often bright) high-index colors left off the VRAM CLUT and
      // render transparent/garbage. Widen n_colors to cover every populated
      // index so the whole shared palette uploads. Never shrink below the
      // original, and never exceed 16 (EGA CLUT size). PSX 4bpp uploads a fixed
      // 16-entry CLUT regardless of this field, so PSX behaviour is unchanged.
      var origNc = header[86] | (header[87] << 8);
      var needNc = Math.min(16, order.length + 1);   /* idx0 + opaque colors */
      var newNc = Math.max(origNc, needNc);
      header[86] = newNc & 0xff; header[87] = (newNc >> 8) & 0xff;
      a.bytes = SWAP_pcxEncodeIndices(header, { px: remapped, w: dec.w, h: dec.h, bpl: dec.bpl });
      a.slot = vramSlotOf(a.name, a.bytes);
    });
  });
}

// Palette identity for CLUT grouping. 4bpp EGA PCX carries its 16-color
// palette in header bytes 16-63; 8bpp VGA PCX appends a 768-byte palette
// after a 0x0C marker. The key quantizes each RGB triple to PSX 1555 —
// that is the exact data the GPU clut upload sees, so palettes differing
// only in sub-5-bit rip/expansion noise group together (retail files that
// share a clut slot are bit-identical; stage rips often are not).
function SWAP_paletteKey(bytes, slot){
  var k, i;
  function q(o){ return (((bytes[o] >> 3) << 10) | ((bytes[o + 1] >> 3) << 5) |
                          (bytes[o + 2] >> 3)).toString(16).padStart(4, "0"); }
  if (slot.bpp === 4){
    k = "p4:";
    for (i = 16; i < 64; i += 3) k += q(i);
    return k;
  }
  if (bytes.length > 769 && bytes[bytes.length - 769] === 12){
    k = "p8:"; var off = bytes.length - 768;
    for (i = 0; i < 768; i += 3) k += q(off + i);
    return k;
  }
  return "u:" + Math.random();     /* unknown layout: never group */
}

// ── shared placement core ────────────────────────────────────────────────────
// kept/removed: texes from a collector. addFiles: [{name,hash,bytes}].
// Returns {ok, errors, warnings, mapping, adds:[{name,hash,bytes,slot}]} with
// bytes as private, placement-written copies. Freed rects/CLUTs (positions the
// removed textures held — proven resident-safe) are preferred.
function SWAP_place(kept, removed, addFiles, opts){
  opts = opts || {};
  // Preparation (once): validate files, group palettes by union-fit color
  // packing, remap member pixels onto shared palettes. attemptPlace then
  // works from these prepared bytes, copying fresh per attempt.
  var prepErrors = [], pristine = [];
  addFiles.forEach(function(f){
    var bytes = new Uint8Array(f.bytes);
    var slot = vramSlotOf(f.name, bytes);
    if (!slot){ prepErrors.push(f.name + ": not a valid PSX texture PCX (no PCXINFO)"); return; }
    pristine.push({ name: f.name, hash: f.hash, bytes: bytes, slot: slot });
  });
  if (prepErrors.length)
    return { ok: false, errors: prepErrors, warnings: [], mapping: [], adds: [] };
  function makePrepared(groupMode){
    var list = pristine.map(function(f){
      var b = new Uint8Array(f.bytes);
      return { name: f.name, hash: f.hash, bytes: b, slot: vramSlotOf(f.name, b) };
    });
    SWAP_groupAdds(list, groupMode);
    return list;
  }
  var prepared = makePrepared(0);
  // One placement pass over a given packing order. Runs on fresh state every
  // time so the retry driver below can reorder and re-run safely.
  function attemptPlace(promoted, sortMode){
    var res = { ok: false, errors: [], warnings: [], mapping: [], adds: [] };

    // Freed placement hints — QUALIFIED. A freed rect is only proven when
    // the removed occupant could have proven it: fully inside the resident
    // texture region (y<240) and clear of the Integral glyph/backup band.
    // A previously-modded resident can carry textures at stage-territory
    // positions (e.g. y256 — rewritten on every area load) or inside the
    // band; inheriting those rects poisons the new character (the mangled
    // chest piece placed at an inherited (768,256) rect).
    var freedRects = [];
    removed.forEach(function(t){
      var fr = { x: t.slot.px, y: t.slot.py, w: t.slot.vw, h: t.slot.h, bpp: t.slot.bpp };
      if (fr.y + fr.h > 240){
        res.warnings.push("freed rect (" + fr.x + "," + fr.y + " " + fr.w + "x" + fr.h +
          ") reaches stage-pack territory (y\\u2265240) \\u2014 inherited from a previous mod, not reused");
        return;
      }
      freedRects.push(fr);
    });

    // Freed CLUT slots, deduped, and — critically — dropped if any KEPT
    // texture still records an overlapping span: cluts are SHARED (the
    // removed set here funnels through a handful of slots), so a slot is
    // only truly freed when no survivor points at it. Reusing a shared slot
    // uploads the new palette over the survivor's colors.
    // Layout detection first (needed to pick the retail whitelist):
    // Integral keeps resident cluts below y240, JP at y240+.
    var integralLayout = (function(){
      var below = 0, at240 = 0;
      kept.concat(removed).forEach(function(t){
        var cy = t.slot.cy;
        if (cy >= 200 && cy < 240) below++; else if (cy >= 240) at240++;
      });
      return below > at240;
    })();
    var retailSet = {};
    SWAP_RETAIL_CLUTS[integralLayout ? "integral" : "jp"].forEach(function(k){ retailSet[k] = 1; });
    function inPaletteBlock(cx, cy){ return cx >= 768 && cy >= 226 && cy <= 255; }

    var freedCluts = [], seenFc = {};
    removed.forEach(function(t){
      var k = t.slot.cx + "," + t.slot.cy;
      if (seenFc[k]) return; seenFc[k] = 1;
      var fc = { cx: t.slot.cx, cy: t.slot.cy, nc: t.slot.nc };
      var shared = kept.some(function(kt){ return clutsOverlap(fc, kt.slot); });
      if (shared) return;
      // In-block freed slots must be RETAIL positions to count as proven.
      // (Out-of-block freed slots are fresh-texture-class VRAM — fine.)
      if (inPaletteBlock(fc.cx, fc.cy) && !retailSet[k]){
        res.warnings.push("freed CLUT slot (" + k + ") is inside the engine palette block at a " +
          "NON-RETAIL position (inherited from a previous mod?) — not trusted, not reused");
        return;
      }
      // The codec/staging column x960+ is engine-refreshed: even retail cluts
      // there are maintained by code, and a reused slot gets overwritten.
      if (fc.cx >= 960){
        res.warnings.push("freed CLUT slot (" + k + ") is in the engine-refreshed x960+ column " +
          "\\u2014 not trusted, not reused");
        return;
      }
      freedCluts.push(fc);
    });

    // Rows already hosting KEPT resident cluts are engine-proven: the retail
    // packer only records cluts where the engine won't stomp them, and the
    // two builds disagree (JP: y240-241 at x0-32; EN/JP: y226-229 — with
    // y230-239 conspicuously untouched because the multilanguage engine
    // stages font/menu palettes there). Fresh cluts therefore co-tenant
    // into recorded rows instead of trusting any record-free row.
    // CLUT SAFETY MODEL (learned the hard way, two in-game failures):
    // the engine palette system owns the ENTIRE live block x768-1024
    // y226-255 (libdg palette1) and its backup at {768,196} shares VRAM
    // with the Integral glyph band. Effects (caution flash, goggles,
    // sepia) strip-copy backup rows over live rows — so any in-block slot
    // retail did not itself claim can be stomped stage-dependently (fresh
    // cluts corrupted at row 229 AND at (784,228) in s01a while freed
    // slots survived everywhere). Exact-slot safety only:
    //   tier 1: freed clut slots (the removed character held them through
    //           every stage — proven).
    //   tier 2: 16-aligned 16x1 strips INSIDE freed TEXTURE rects — VRAM
    //           the old character's pixels occupied through every stage.
    //           Outside the palette block, so palette effects (whiteout,
    //           goggle tint) skip these palettes: cosmetic-only tradeoff.
    // There is NO fresh in-block tier anymore.

    // live occupancy = every kept texture in the whole stage
    var occupied = kept.map(function(t){ return t.slot; });
    var cluts    = kept.map(function(t){ return t.slot; });

    // validate + copy the incoming files (never mutate caller bytes; fresh
    // copies per attempt so a failed attempt's placement writes are discarded)
    var adds = [];
    prepared.forEach(function(f){
      var bytes = new Uint8Array(f.bytes);             /* fresh per attempt */
      var slot = vramSlotOf(f.name, bytes);
      adds.push({ name: f.name, hash: f.hash, bytes: bytes, slot: slot,
                  pri: promoted[f.name] ? 0 : 1, gid: f.gid });
    });
    res.adds = adds;

    // one CLUT slot per palette group (grouping done once, prep-time)
    var groupClut = {};

    // ── CLUT PRE-RESERVATION ────────────────────────────────────────────────
    // Retail packs the init region SOLID below the band gutter (zero free
    // 16x1 aligned holes at y0-187 in a pristine file), so fresh strips used
    // to gravitate to the gutter row 195 — which the glyph/backup band's
    // stage-dependent text traffic can graze (Liquid-pants / green-guard-neck:
    // corrupt in s01a, clean in s08b). The only proven ground with room is the
    // FREED-RECT UNION — but textures consume it during placement. So group
    // cluts are reserved FIRST, before any texture placement:
    //   tier 1: freed clut slots (retail positions)
    //   tier 1.5: 16-aligned 16x1 spans in the freed union — ADJACENT freed
    //             rects merge, so spans wider than any single removed piece
    //             exist (removed characters pack contiguously in retail)
    //   (unresolved groups fall to the per-add guarded backstop below)
    (function reserveGroupCluts(){
      var gids = {}, order = [];
      adds.forEach(function(a){
        var nc = a.slot.nc || 16;
        if (!(a.gid in gids)){ gids[a.gid] = nc; order.push(a.gid); }
        else if (nc > gids[a.gid]) gids[a.gid] = nc;
      });
      function fits(cc){
        var k;
        for (k = 0; k < cluts.length; k++) if (clutsOverlap(cc, cluts[k])) return false;
        for (k = 0; k < occupied.length; k++)
          if (rectsOverlap({ x: cc.cx, y: cc.cy, w: cc.nc, h: 1 }, texRect(occupied[k]))) return false;
        return true;
      }
      // is [x, x+nc) at row y fully covered by the freed-rect union?
      function unionCovers(y, x, nc){
        var iv = [], i;
        for (i = 0; i < freedRects.length; i++){
          var fr = freedRects[i];
          if (y >= fr.y && y < fr.y + fr.h) iv.push([fr.x, fr.x + fr.w]);
        }
        if (!iv.length) return false;
        iv.sort(function(a, b){ return a[0] - b[0]; });
        var pos = x, end = x + nc;
        for (i = 0; i < iv.length && pos < end; i++){
          if (iv[i][1] <= pos) continue;
          if (iv[i][0] > pos) return false;
          pos = Math.min(end, iv[i][1]);
        }
        return pos >= end;
      }
      order.forEach(function(gid){
        var nc = gids[gid], cl = null, via = false, union = false, i;
        for (i = 0; i < freedCluts.length && !cl; i++){
          var fc = freedCluts[i];
          if (fc.nc < nc) continue;
          for (var off = 0; off + nc <= fc.nc && !cl; off += 16){
            var cc = { cx: fc.cx + off, cy: fc.cy, nc: nc };
            if (fits(cc)){ cl = { cx: cc.cx, cy: cc.cy }; via = true; }
          }
        }
        if (!cl){
          for (var y = 239; y >= 0 && !cl; y--){
            for (var x = 640; x + nc <= 960 && !cl; x += 16){
              if (!unionCovers(y, x, nc)) continue;
              var cc2 = { cx: x, cy: y, nc: nc };
              if (!fits(cc2)) continue;
              cl = { cx: x, cy: y }; union = true;
            }
          }
        }
        // tier 1.75: the UNDRAWN DEAD ZONE — x320-512, rows 240-245.
        // The draw environment is HARDCODED 320 wide (libdg/display.c:
        // SetDefDrawEnv(&drawenv, 0, 0, 320, disp.h)), so x320+ is never
        // rendered by either frame buffer — and disp.h can be 256 at
        // runtime, which is exactly why x0-320 rows 240-255 got painted
        // with scene pixels in some stages (the green-pants regression:
        // cluts at (0,240) were inside the drawn area whenever the
        // 256-line mode was active). x320-512 is dead BY GEOMETRY.
        // Double proof: the JP disc's STAGE packs keep cluts at x320-512
        // y240-241 in every stage and render correctly all game — the GPU
        // never touches the zone. On Integral layout no stage records
        // anything there, so a resident clut survives every load.
        // INTEGRAL-ONLY: on JP layout the stage band owns these rows.
        if (!cl && integralLayout){
          var deadRows = [240, 241, 242, 243, 244, 245];
          for (var dr = 0; dr < deadRows.length && !cl; dr++){
            for (var dx = 320; dx + nc <= 512 && !cl; dx += 16){
              var cc3 = { cx: dx, cy: deadRows[dr], nc: nc };
              if (fits(cc3)) cl = { cx: dx, cy: deadRows[dr] };
            }
          }
          if (cl) res.warnings.push("palette group: CLUT placed in the undrawn dead zone at (" + cl.cx +
            "," + cl.cy + ") — x320+ is outside the hardcoded 320-wide draw environment, so no frame " +
            "ever renders there; stage packs record nothing there on this layout. Full-screen palette " +
            "effects will not tint this palette (cosmetic-only).");
        }
        if (cl){
          groupClut[gid] = { cx: cl.cx, cy: cl.cy, viaFreed: via };
          cluts.push({ cx: cl.cx, cy: cl.cy, nc: nc });   /* reserve vs textures */
          if (union)
            res.warnings.push("palette group: CLUT reserved inside the freed footprint at (" +
              cl.cx + "," + cl.cy + ") — proven ground (the removed character's pixels lived " +
              "there through every stage)");
        }
      });
    })();

    // first-fit-decreasing; textures that failed a previous attempt are
    // promoted to the front (pri 0). The secondary key rotates per retry
    // (area / height / max-dimension) — different orders reach packings
    // greedy area-order misses.
    adds.sort(function(a, b){
      var ka, kb;
      if (sortMode === 1){ ka = a.slot.h; kb = b.slot.h; }
      else if (sortMode === 2){ ka = Math.max(a.slot.vw, a.slot.h); kb = Math.max(b.slot.vw, b.slot.h); }
      else { ka = a.slot.vw * a.slot.h; kb = b.slot.vw * b.slot.h; }
      return a.pri - b.pri || (kb - ka) ||
        (b.slot.vw * b.slot.h) - (a.slot.vw * a.slot.h) || a.hash - b.hash;
    });

    // Only the FREED footprint (the old character's rects) is provably free of
    // engine-owned VRAM: fonts, menu images, and the codec face staging column
    // (x960+, radiotex.c) live in the init region WITHOUT appearing in any
    // stage file's records — fresh placements there get streamed over at
    // runtime (the "face/skin broken" bug). So: pack INSIDE freed rects at any
    // offset first; only then fall back outside, avoiding x960+, with a loud
    // per-file warning.
    function fitInFreed(s){
      for (var i = 0; i < freedRects.length; i++){
        var fr = freedRects[i];
        if (fr.w < s.vw || fr.h < s.h) continue;
        for (var y = fr.y; y + s.h <= fr.y + fr.h; y++){
          for (var x = fr.x; x + s.vw <= fr.x + fr.w; x++){
            if (crossesTPage(x, s.vw, s.bpp)) continue;
            var cand = { x: x, y: y, w: s.vw, h: s.h }, ok = true, j;
            /* inherited rects can graze the glyph/backup band on modded
               residents — never place SAMPLED texels inside it */
            for (j = 0; j < freshBlocked.length; j++)
              if (rectsOverlap(cand, texRect(freshBlocked[j]))){ ok = false; break; }
            if (!ok) continue;
            for (j = 0; j < occupied.length; j++) if (rectsOverlap(cand, texRect(occupied[j]))){ ok = false; break; }
            if (ok) for (j = 0; j < cluts.length; j++)
              if (rectsOverlap(cand, { x: cluts[j].cx, y: cluts[j].cy, w: cluts[j].nc, h: 1 })){ ok = false; break; }
            if (ok) return { px: x, py: y };
          }
        }
      }
      return null;
    }
    // opts.wideInit (PC only) opens the x960-1024 strip. Measured from retail:
    // no gameplay stage places TEXTURES anywhere in the resident band (y<256,
    // x>=640), retail itself seats resident textures out to x965, and a shipped
    // build with adds at x972/x983 renders correctly. The y cap drops to 226
    // because stage CLUTs occupy y233-253 spanning x768-1024 and are rewritten
    // on every stage load. PSX never passes wideInit, so its region is unchanged.
    var REGION_SAFE = opts.wideInit
      ? { x1: SWAP_REGION_INIT.x1, y1: SWAP_REGION_INIT.y1, x2: 1024, y2: 226 }
      : { x1: SWAP_REGION_INIT.x1, y1: SWAP_REGION_INIT.y1,
          x2: 960, y2: SWAP_REGION_INIT.y2 };   /* x960+ engine-owned */

    // Integral (multilanguage) stages localization glyph data in the lower
    // init band x768-960 y196-240: retail records nothing there despite ~95%
    // packing pressure, and swapped textures whose SAMPLED texels fall in it
    // corrupt in game (speckle = glyph writes). Textures merely dipping
    // unused bottom rows into it can look fine — that is luck, not safety.
    // JP-layout packs use the space freely — proven in game. Detect the
    // layout by where resident cluts live: Integral below y240, JP at y240+.
    // With the palette-backup EXE patch applied (backup block relocated from
    // (768,196) to a dead VRAM corner), y196-226 becomes texture-safe; only
    // the live clut rows y226-240 stay blocked. Unpatched: the full band.
    var freshBlocked = integralLayout
      ? (opts.paletteRelocated ? [{ px: 768, py: 226, vw: 192, h: 14 }]
                               : [{ px: 768, py: 196, vw: 192, h: 44 }])
      : [];

    adds.forEach(function(a){
      var s = a.slot, place, viaFreed = false, i;

      place = fitInFreed(s);
      if (place) viaFreed = true;
      if (!place){
        place = findFreeTexSlot(REGION_SAFE, freshBlocked.concat(occupied), cluts, s.vw, s.h, s.bpp);
        if (place) res.warnings.push(a.name + ": placed OUTSIDE the freed footprint at (" +
          place.px + "," + place.py + ") — the init region also hosts engine buffers " +
          "not described in stage files; if this texture corrupts in game, free more space " +
          "by removing additional resident textures");
      }
      if (!place){
        res.overflow = true;
        res.errors.push(a.name + ": no resident VRAM space for " + s.vw + "x" + s.h +
          " (" + s.bpp + "bpp) — the freed footprint is full; remove more resident textures");
        return;
      }

      // CLUT: one slot per palette group. Preference order:
      //   1. freed slots (exact positions the removed set held — engine-proven,
      //      pre-filtered above against sharing with kept textures)
      //   2. free 16-aligned gaps in rows that recorded resident cluts occupy
      //      (co-tenancy: the retail packer proved those rows engine-safe)
      //   3. legacy full scan — record-free rows — with a loud warning, since
      //      multilanguage builds stage font palettes in low record-free rows
      var cl = null, viaFreedClut = false;
      var g = groupClut[a.gid];
      if (g){ cl = { cx: g.cx, cy: g.cy }; viaFreedClut = g.viaFreed; }
      function clutFits(cc){
        var k;
        for (k = 0; k < cluts.length; k++) if (clutsOverlap(cc, cluts[k])) return false;
        for (k = 0; k < occupied.length; k++)
          if (rectsOverlap({ x: cc.cx, y: cc.cy, w: cc.nc, h: 1 }, texRect(occupied[k]))) return false;
        return true;
      }
      if (!cl){
        for (i = 0; i < freedCluts.length && !cl; i++){
          var fc = freedCluts[i];
          if (fc.nc < s.nc) continue;
          /* 16-aligned sub-offsets inside the freed span, so e.g. a freed
             256-entry clut can host up to sixteen 16-entry ones */
          for (var off = 0; off + s.nc <= fc.nc && !cl; off += 16){
            var cc = { cx: fc.cx + off, cy: fc.cy, nc: s.nc };
            if (clutFits(cc)){ cl = { cx: cc.cx, cy: cc.cy }; viaFreedClut = true; }
          }
        }
      }
      if (!cl){
        /* tier 2: a 16x1 strip in fresh-texture-class VRAM — x640-960 ABOVE
           the palette block (y<226), avoiding the glyph/backup band and the
           codec column, with full collision checks. This is the same VRAM
           class the plan's fresh TEXTURES use, and those are in-game proven
           across stages (pixels render clean everywhere; only in-block
           palette slots corrupt). Outside the block, palette effects
           (caution flash, goggles) skip these palettes — cosmetic-only.
           Bottom-up so strips tuck in just above the block. */
        for (var sy = 225; sy >= 0 && !cl; sy--){
          for (var sx = 640; sx + s.nc <= 960 && !cl; sx += 16){
            /* GUARD MARGIN around the glyph/backup band (x768-960 y196-240):
               its text-staging traffic is stage-dependent and can graze the
               rows just ABOVE the nominal bound — strips at (848..928,195)
               corrupted in s01a while s08b rendered clean (Liquid pants /
               green-guard neck). No strips in the band's x-range within 8
               rows of it: rows 188-225 at x>=768 are off-limits. Strips land
               in the low-y free area instead, alongside the fresh texture
               rects that are in-game proven across stages. */
            if (sy >= 188 && sx + s.nc > 768) continue;
            var cc2 = { cx: sx, cy: sy, nc: s.nc };
            if (!clutFits(cc2)) continue;
            var rr = { x: sx, y: sy, w: s.nc, h: 1 }, blockedHit = false, bi2;
            for (bi2 = 0; bi2 < freshBlocked.length; bi2++)
              if (rectsOverlap(rr, texRect(freshBlocked[bi2]))){ blockedHit = true; break; }
            if (blockedHit) continue;
            cl = { cx: sx, cy: sy };
            res.warnings.push(a.name + ": CLUT placed above the palette block (" + sx + "," + sy +
              ") in proven fresh-texture VRAM — safe in all stages; full-screen palette effects " +
              "(caution flash, goggles) will not tint this palette (cosmetic-only tradeoff).");
          }
        }
      }
      if (!cl){ res.overflow = true; res.errors.push(a.name + ": no proven-safe CLUT slot available (freed slots and " +
        "freed-footprint strips are full) — remove more resident textures to free slots"); return; }
      if (!g) groupClut[a.gid] = { cx: cl.cx, cy: cl.cy, viaFreed: viaFreedClut };

      var from = { px: s.px, py: s.py, cx: s.cx, cy: s.cy };
      writePlacement(s, place.px, place.py, cl.cx, cl.cy);
      occupied.push(s); cluts.push(s);
      res.mapping.push({ name: a.name, hash: a.hash, w: s.vw, h: s.h, bpp: s.bpp,
        from: from, to: { px: s.px, py: s.py, cx: s.cx, cy: s.cy },
        viaFreedRect: viaFreed, viaFreedClut: viaFreedClut });
    });

    if (res.errors.length) return res;
    res.ok = true;
    return res;
  }

  // Retry driver: first-fit-decreasing is order-lucky — a large texture can
  // fail while enough space sits fragmented behind smaller, earlier placements.
  // On failure, promote the failed textures to the FRONT of the next attempt's
  // packing order and re-run on fresh state. Converges or stops when no new
  // names fail; returns the first clean attempt, else the best one seen.
  function runRetry(){
    var best = null, r, mode, attempt;
    for (mode = 0; mode < 3; mode++){
      var promoted = {};
      for (attempt = 0; attempt < 8; attempt++){
        r = attemptPlace(promoted, mode);
        if (!r.errors.length){
          if (mode > 0 || attempt > 0)
            r.warnings.push("packing succeeded on sort-mode " + mode + ", attempt " + (attempt + 1) +
              (Object.keys(promoted).length ? " after promoting: " + Object.keys(promoted).join(", ") : ""));
          return r;
        }
        if (!best || r.errors.length < best.errors.length) best = r;
        var grew = false;
        r.errors.forEach(function(e){
          var nm = e.split(":")[0];
          if (!promoted[nm]){ promoted[nm] = 1; grew = true; }
        });
        if (!grew) break;
      }
    }
    return best;
  }
  // Two-pass palette budget: strict (dual-quantization) grouping first — if
  // the plan is clean it is color-perfect. If it errors or spills CLUTs into
  // record-free rows, retry with truncation-precision grouping (fewer bins;
  // merged colors may shift ≤1 shade step) and keep whichever does better.
  function spills(res){ if (!res) return 1e9;
    return res.warnings.filter(function(w){ return /above the palette block/.test(w); }).length; }
  var strict = runRetry();
  if (strict && !strict.errors.length && !spills(strict)) return strict;
  prepared = makePrepared(1);
  var relaxed = runRetry();
  var pick;
  if (!relaxed) pick = strict;
  else if (!strict) pick = relaxed;
  else if (relaxed.errors.length !== strict.errors.length)
    pick = relaxed.errors.length < strict.errors.length ? relaxed : strict;
  else pick = spills(relaxed) < spills(strict) ? relaxed : strict;
  if (pick === relaxed && relaxed)
    relaxed.warnings.push("palette merging relaxed to truncation precision (merged colors may shift \\u22641 shade step) to fit the safe CLUT budget");
  return pick;
}

// ── the swap plan ────────────────────────────────────────────────────────────
// entries    : psxParseStage().entries of the resident stage (will NOT be
//              mutated; a new entry list is returned)
// removeSet  : Set of hashes to delete
// addFiles   : [{name, hash, bytes(Uint8Array)}] — new character textures
// Returns { ok, entries, mapping[], warnings[], errors[], stats }
// kmdSwap (optional): { ei, mi (-1 = loose entry), donorBytes } — the donor
// character's KMD replaces the resident KMD IN PLACE, keeping the resident's
// hash/name, so the game loads the new model under the old identity.
// ── Resident-fit assistance ─────────────────────────────────────────────────
// Hashes that are GLOBAL props / engine assets, NOT part of any character —
// the tool must never recommend deleting these to make room. Cardboard box,
// radio/codec, ration, and the shared item/effect textures recur across the
// whole game; removing them corrupts unrelated scenes. (Names are the MGS
// strcode of the asset; extend as more are identified.)
var SWAP_PROTECTED_HASHES = (function(){
  var names = [
    "cbox","box","danbo",       // cardboard box variants
    "radio","codec","musen",    // codec / radio
    "ration","raton",           // ration
    "item","weapon","bullet",   // shared pickups / fx
    "font","radar","soliton",   // HUD / map
    "life","guage","gauge"      // status bars
  ];
  var set = {};
  names.forEach(function(n){ set[SWAP_mgsHash(n)] = n; });
  return set;
})();

function SWAP_isProtected(hash){ return !!SWAP_PROTECTED_HASHES[hash]; }

// Rank resident textures as deletion candidates to free room for a failed fit.
// Strategy: protect known-global hashes absolutely; among the rest, prefer the
// LARGEST VRAM footprints first (fewest deletions to make room) while never
// touching anything the swapped model's own KMD still references. Returns an
// ordered list of {hash,name,bytes,protected,reason}.
function SWAP_recommendDeletions(residentTexes, keepHashes, needBytes){
  var cand = residentTexes.map(function(t){
    var footprint = t.slot.vw * t.slot.h * (t.slot.bpp === 8 ? 1 : 0.5);
    var prot = SWAP_isProtected(t.hash) || (keepHashes && keepHashes[t.hash]);
    return { hash: t.hash, name: t.name || ("0x" + t.hash.toString(16)),
             bytes: footprint, protected: prot,
             reason: SWAP_isProtected(t.hash) ? "global asset (" + SWAP_PROTECTED_HASHES[t.hash] + ")"
                     : (keepHashes && keepHashes[t.hash]) ? "used by the new model" : "" };
  });
  var deletable = cand.filter(function(c){ return !c.protected; })
                      .sort(function(a,b){ return b.bytes - a.bytes; });
  // greedily pick until we've freed >= needBytes (needBytes optional/heuristic)
  var picked = [], freed = 0;
  for (var i = 0; i < deletable.length; i++){
    picked.push(deletable[i]); freed += deletable[i].bytes;
    if (needBytes && freed >= needBytes) break;
  }
  return { recommended: picked, protected: cand.filter(function(c){ return c.protected; }) };
}

function SWAP_plan(entries, removeSet, addFiles, kmdSwap, opts){
  var res = { ok: false, entries: null, mapping: [], warnings: [], errors: [], stats: {} };
  var texes = SWAP_collectTextures(entries);

  var removed = texes.filter(function(t){ return removeSet.has(t.hash); });
  var kept    = texes.filter(function(t){ return !removeSet.has(t.hash); });
  if (!removed.length && removeSet.size)
    res.warnings.push("none of the selected hashes were found in this stage");

  // Shared-texture handling: donors often share files with the resident
  // character (same pants/boots/etc = same name hash). Models reference
  // textures BY HASH, so when an added hash already exists as a KEPT
  // resident texture the add is simply unnecessary — the swapped model
  // will find and use the resident copy. SKIP it with a note instead of
  // failing the whole plan. If the donor's file differs from the resident
  // copy, the RESIDENT version is what will show — warn accordingly.
  var keptByHash = {};
  kept.forEach(function(t){ keptByHash[t.hash] = t; });
  addFiles = addFiles.filter(function(f){
    var k = keptByHash[f.hash];
    if (!k) return true;
    var identical = k.bytes.length === f.bytes.length;
    if (identical){
      var i;
      for (i = 0; i < f.bytes.length; i++)
        if (f.bytes[i] !== k.bytes[i]){ identical = false; break; }
    }
    res.warnings.push("0x" + f.hash.toString(16) + " (" + f.name +
      ") is shared with a kept resident texture \\u2014 skipped; the model uses the resident copy" +
      (identical ? " (files are identical)" :
        " (NOTE: donor file DIFFERS from the resident copy \\u2014 on-screen look follows the RESIDENT version; remove the resident texture too if you want the donor's)"));
    return false;
  });

  // PSX wide resident region: the x960-1024 / y<226 strip is empty on retail
  // PSX too (measured), so enable it here just like the PC path. Doubles the
  // resident free space and lets small donor guns (e.g. Desert Eagle) fit
  // without spilling to stages.
  var _psxOpts = opts || {};
  if (_psxOpts.wideInit === undefined) _psxOpts.wideInit = true;
  var placed = SWAP_place(kept, removed, addFiles, _psxOpts);
  res.warnings = res.warnings.concat(placed.warnings);
  res.errors = res.errors.concat(placed.errors);
  res.mapping = placed.mapping;
  if (placed.overflow) res.overflow = true;   /* surface the fit-failure flag */
  var adds = placed.adds;
  if (res.errors.length) return res;

  // ── build the new entry list ───────────────────────────────────────────────
  // Removed loose entries drop out; removed DAR members drop out of their DAR;
  // new textures are appended to the container that held the most removed
  // textures (a DAR), or as loose clones of a removed loose entry.
  var removeLoose = {}, removeDarMember = {};
  removed.forEach(function(t){
    if (t.kind === "loose") removeLoose[t.ei] = 1;
    else (removeDarMember[t.ei] = removeDarMember[t.ei] || {})[t.mi] = 1;
  });
  var darVotes = {}, looseTemplate = null;
  removed.forEach(function(t){
    if (t.kind === "dar") darVotes[t.ei] = (darVotes[t.ei] || 0) + 1;
    else if (!looseTemplate) looseTemplate = entries[t.ei];
  });
  var targetDarEi = -1, best = 0;
  for (var k2 in darVotes) if (darVotes[k2] > best){ best = darVotes[k2]; targetDarEi = +k2; }
  var memberExtTemplate = 0;
  removed.some(function(t){ if (t.kind === "dar"){ memberExtTemplate = t.memberExt; return true; } return false; });

  var newEntries = [];
  entries.forEach(function(e, ei){
    if (removeLoose[ei]) return;
    var bytes = e.data;
    var ksHere = kmdSwap && kmdSwap.ei === ei;
    if (ksHere && kmdSwap.mi < 0){
      bytes = kmdSwap.donorBytes;                     /* loose KMD swap in place */
    } else if (removeDarMember[ei] || ei === targetDarEi || (ksHere && kmdSwap.mi >= 0)){
      var raw = psxDarParse(e.data);
      if (ksHere && kmdSwap.mi >= 0 && raw[kmdSwap.mi])
        raw[kmdSwap.mi] = { hash: raw[kmdSwap.mi].hash, ext: raw[kmdSwap.mi].ext,
                            data: kmdSwap.donorBytes };   /* keep hash: renamed */
      var members = raw.filter(function(m, mi){
        return !(removeDarMember[ei] && removeDarMember[ei][mi]);
      }).map(function(m){ return { hash: m.hash, ext: m.ext, bytes: m.data }; });
      if (ei === targetDarEi)
        adds.forEach(function(a){ members.push({ hash: a.hash, ext: memberExtTemplate, bytes: a.bytes }); });
      bytes = psxDarBuild(members);
    }
    newEntries.push({ hash: e.hash, mode: e.mode, ext: e.ext, bytes: bytes });
  });
  if (targetDarEi < 0){
    if (!looseTemplate && adds.length){
      res.errors.push("no removed texture container found to model the additions on " +
        "(remove at least one texture so the tool knows where new ones belong)");
      return res;
    }
    adds.forEach(function(a){
      newEntries.push({ hash: a.hash, mode: looseTemplate.mode, ext: looseTemplate.ext, bytes: a.bytes });
    });
  }

  res.stats = { removed: removed.length, added: adds.length,
    container: targetDarEi >= 0 ? ("DAR entry #" + targetDarEi) : "loose entries" };
  // ── EXTRA MODEL PAIRS (multi-swap): character + gun/etc. in one pass ──
  // Each extra pair replaces a resident model in place, keeping its hash, exactly
  // like the primary kmdSwap. Textures for these donors were added to the pool
  res.entries = newEntries;
  res.ok = true;
  return res;
}

// ── full conflict verification of a stage's textures ────────────────────────
function SWAP_verify(entries){
  return SWAP_verifyTexes(SWAP_collectTextures(entries));
}
function SWAP_verify_OLD(entries){
  var texes = SWAP_collectTextures(entries);
  var problems = [], initN = 0, stageN = 0, i, j;
  for (i = 0; i < texes.length; i++){
    var a = texes[i].slot;
    if (a.py < 256) initN++; else stageN++;
    if (crossesTPage(a.px, a.vw, a.bpp))
      problems.push("0x" + texes[i].hash.toString(16) + " crosses a TPAGE boundary at x=" + a.px);
    for (j = i + 1; j < texes.length; j++){
      var b = texes[j].slot;
      var ha = "0x" + texes[i].hash.toString(16), hb = "0x" + texes[j].hash.toString(16);
      if (a.px === b.px && a.py === b.py){ /* intentional shared pair (v82 rule) */ }
      else if (rectsOverlap(texRect(a), texRect(b)))
        problems.push("texture overlap: " + ha + " ~ " + hb);
      if (!(a.cx === b.cx && a.cy === b.cy) && clutsOverlap(a, b))
        problems.push("CLUT overlap: " + ha + " ~ " + hb);
      if (rectsOverlap(texRect(a), { x: b.cx, y: b.cy, w: b.nc, h: 1 }))
        problems.push("texture " + ha + " overlaps CLUT of " + hb);
      if (rectsOverlap(texRect(b), { x: a.cx, y: a.cy, w: a.nc, h: 1 }))
        problems.push("texture " + hb + " overlaps CLUT of " + ha);
    }
  }
  return { ok: problems.length === 0, problems: problems,
    total: texes.length, initCount: initN, stageCount: stageN };
}

// ── KMD coverage: every texture hash the model references ───────────────────
function SWAP_kmdHashes(bytes){
  var v = { u16: function(o){ return bytes[o] | (bytes[o + 1] << 8); },
            u32: function(o){ return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0; } };
  var n = v.u32(4), set = {}, out = [];
  if (n === 0 || n > 512) return out;
  for (var bi = 0; bi < n; bi++){
    var bo = 0x20 + bi * 88;
    if (bo + 88 > bytes.length) break;
    var nf = v.u32(bo + 4), tno = v.u32(bo + 80);
    if (!nf || nf > 50000 || !tno || tno >= bytes.length) continue;
    for (var fi = 0; fi < nf; fi++){
      var tp = tno + fi * 2;
      if (tp + 2 > bytes.length) break;
      var h = v.u16(tp);
      if (h && !set[h]){ set[h] = 1; out.push(h); }
    }
  }
  return out;
}

// Rewrite a KMD's texture-reference table in place: every face-ref equal to a
// key in \`mapping\` (old hash) is replaced with its value (new hash). Same walk
// as SWAP_kmdHashes, with stores. Returns the number of refs rewritten.
function SWAP_kmdRehash(bytes, mapping){
  var u32 = function(o){ return (bytes[o] | (bytes[o+1]<<8) | (bytes[o+2]<<16) | (bytes[o+3]<<24)) >>> 0; };
  var n = u32(4), hits = 0;
  if (n === 0 || n > 512) return 0;
  for (var bi = 0; bi < n; bi++){
    var bo = 0x20 + bi * 88;
    if (bo + 88 > bytes.length) break;
    var nf = u32(bo + 4), tno = u32(bo + 80);
    if (!nf || nf > 50000 || !tno || tno >= bytes.length) continue;
    for (var fi = 0; fi < nf; fi++){
      var tp = tno + fi * 2;
      if (tp + 2 > bytes.length) break;
      var h = bytes[tp] | (bytes[tp+1] << 8);
      if (h && mapping[h] !== undefined){
        bytes[tp]   = mapping[h] & 0xFF;
        bytes[tp+1] = (mapping[h] >> 8) & 0xFF;
        hits++;
      }
    }
  }
  return hits;
}

// ── STAGE-DUPLICATE ANTI-COLLISION ──────────────────────────────────────────
// The engine's texture registry resolves BY HASH, and stage packs can carry
// the SAME hash as an added resident texture (vanilla characters appear in
// stages for cutscenes: Liquid's textures ship inside s01a, d18a, s18a...).
// When such a stage loads, its copy re-registers the hash and the player
// model renders the STAGE's art/palette — the "green pants in some stages"
// bug: corruption exactly in the stages whose packs duplicate the hash.
// Fix: REHASH colliding adds to unique ids and patch the donor KMD's
// reference table (the June "Snake-as-enemy" technique). \`stageHashes\` is a
// Set of every hash present in any non-init stage; \`usedHashes\` everything
// used anywhere (uniqueness pool).
function SWAP_dedupeAddHashes(adds, kmdBytesList, stageHashes, usedHashes){
  var mapping = {}, renamed = [];
  var next = 0xE100;
  function freshHash(){
    while (usedHashes.has(next) || stageHashes.has(next)) next++;
    usedHashes.add(next);
    return next++;
  }
  adds.forEach(function(a){
    if (!stageHashes.has(a.hash)) return;
    var nh = freshHash();
    mapping[a.hash] = nh;
    renamed.push({ from: a.hash, to: nh, name: a.name });
    a.hash = nh;
    a.name = nh.toString(16).padStart(4, "0") + (a.name && a.name.indexOf(".") >= 0 ?
      a.name.substring(a.name.indexOf(".")) : ".pcx");
  });
  var totalRefs = 0;
  if (renamed.length && kmdBytesList){
    kmdBytesList.forEach(function(kb){ if (kb) totalRefs += SWAP_kmdRehash(kb, mapping); });
  }
  return { mapping: mapping, renamed: renamed, refsPatched: totalRefs };
}

// ── PC stage-duplicate anti-collision ───────────────────────────────────────
// Same failure as PSX: stage packs ship copies of character textures for
// cutscene appearances, the engine registers BY HASH, so when such a stage
// loads its copy re-registers the hash and the player model renders the
// STAGE's art. PC identity is the NAME (hash = strcode(name)), so instead of
// renaming to a hex hash we pick a fresh NAME whose strcode is unused, then
// patch the donor KMD's reference table to the new hash.
function SWAP_pcStageHashSets(pcFiles, currentStage, stageSegOf){
  var stageHashes = new Set(), usedHashes = new Set();
  pcFiles.forEach(function(f){
    if (!/\\.dar$/i.test(f.path)) return;
    var mem = pcDarParse(f.data); if (!mem) return;
    var sn = stageSegOf(f.path);
    mem.forEach(function(m){
      if (!vramSlotOf(m.name, m.data)) return;
      var hh = SWAP_mgsHash(SWAP_pcNameNoExt(m.name));
      usedHashes.add(hh);
      if (sn !== currentStage) stageHashes.add(hh);
    });
  });
  return { stageHashes: stageHashes, usedHashes: usedHashes };
}

function SWAP_pcDedupeAddNames(adds, kmdBytesList, stageHashes, usedHashes){
  var mapping = {}, renamed = [], ctr = 0;
  function freshName(ext){
    for (;;){
      var nm = "zz" + ("000" + (ctr++).toString(36)).slice(-4);
      var hh = SWAP_mgsHash(nm);
      if (!usedHashes.has(hh) && !stageHashes.has(hh)){ usedHashes.add(hh); return { name: nm + ext, hash: hh }; }
    }
  }
  adds.forEach(function(a){
    if (!stageHashes.has(a.hash)) return;
    var dot = a.name ? a.name.lastIndexOf(".") : -1;
    var ext = dot >= 0 ? a.name.substring(dot) : ".pcx";
    var fresh = freshName(ext);
    mapping[a.hash] = fresh.hash;
    renamed.push({ from: a.hash, to: fresh.hash, name: a.name, newName: fresh.name });
    a.hash = fresh.hash; a.name = fresh.name;
  });
  var totalRefs = 0;
  if (renamed.length && kmdBytesList){
    kmdBytesList.forEach(function(kb){ if (kb) totalRefs += SWAP_kmdRehash(kb, mapping); });
  }
  return { mapping: mapping, renamed: renamed, refsPatched: totalRefs };
}

// ── PC alternate-model replacement ──────────────────────────────────────────
// Stages carry their own copies of the player character for cutscenes
// (sne_wet1..5 = wet/intro, sne_nude = torture, sne_bld1/2 = bloodied). A
// resident swap doesn't touch them, so the old character still shows up in
// those scenes. Mirror of the PSX "kmd-replace" method: overwrite each
// stage-local member's KMD bytes with the resident donor KMD, keeping the
// member's own NAME so everything referencing it now draws the new character.
var SWAP_PC_ALT_MODELS = ["sne_wet1.kmd","sne_wet2.kmd","sne_wet3.kmd","sne_wet4.kmd",
                          "sne_wet5.kmd","sne_nude.kmd","sne_bld1.kmd","sne_bld2.kmd"];
function SWAP_pcReplaceAltModels(pcFiles, donorKmdBytes, names, stageSegOf){
  var list = (names && names.length ? names : SWAP_PC_ALT_MODELS).map(function(s){ return s.toLowerCase(); });
  var edits = {}, replaced = 0, stages = {}, which = {};
  pcFiles.forEach(function(f){
    if (!/\\.dar$/i.test(f.path)) return;
    var mem = pcDarParse(f.data); if (!mem) return;
    var hit = false;
    var items = mem.map(function(m){
      if (list.indexOf(m.name.toLowerCase()) >= 0){
        hit = true; replaced++;
        stages[stageSegOf ? stageSegOf(f.path) : f.path] = 1;
        which[m.name] = (which[m.name] || 0) + 1;
        return { name: m.name, bytes: donorKmdBytes };
      }
      return { name: m.name, bytes: m.data };
    });
    if (hit) edits[f.path] = pcDarBuild(items);
  });
  return { fileEdits: edits, replaced: replaced, stages: Object.keys(stages), which: which };
}

// ── guided-workflow helpers ──────────────────────────────────────────────────

// Cheap KMD sniff: sane block count at u32@4 and a parsable block table that
// yields at least one texture reference.
function SWAP_looksLikeKmd(bytes){
  if (!bytes || bytes.length < 0x20 + 88) return false;
  var n = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  if (n < 1 || n > 512) return false;
  if (0x20 + n * 88 > bytes.length) return false;
  return SWAP_kmdHashes(bytes).length > 0;
}

// Every KMD in a stage: loose entries and DAR members, content-sniffed.
function SWAP_listKmds(entries){
  var out = [];
  for (var ei = 0; ei < entries.length; ei++){
    var e = entries[ei], data = e.data || e.bytes;
    if (!data) continue;
    if (extName(e.ext) === "dar"){
      var members = psxDarParse(data);
      if (!members) continue;
      for (var mi = 0; mi < members.length; mi++)
        if (SWAP_looksLikeKmd(members[mi].data))
          out.push({ kind: "dar", ei: ei, mi: mi, hash: members[mi].hash, bytes: members[mi].data,
            label: "0x" + members[mi].hash.toString(16).padStart(4, "0") + "  (dar#" + ei + "/" + mi + ", " +
              SWAP_kmdHashes(members[mi].data).length + " tex refs)" });
    } else if (SWAP_looksLikeKmd(data)){
      out.push({ kind: "loose", ei: ei, hash: e.hash, bytes: data,
        label: "0x" + e.hash.toString(16).padStart(4, "0") + "  (loose#" + ei + ", " +
          SWAP_kmdHashes(data).length + " tex refs)" });
    }
  }
  return out;
}

// Which of a stage's textures does this KMD reference? (resident auto-check)
function SWAP_findTexturesByHashes(entries, hashList){
  var want = {}; hashList.forEach(function(h){ want[h] = 1; });
  var found = SWAP_collectTextures(entries).filter(function(t){ return want[t.hash]; });
  var have = {}; found.forEach(function(t){ have[t.hash] = 1; });
  var missing = hashList.filter(function(h){ return !have[h]; });
  return { found: found, missing: missing };
}

// Rip: from a donor stage, pull the texture files a KMD references.
// containerEi: restrict to one DAR entry index, or -1 for the whole stage.
// Returns adds ready for SWAP_plan (bytes are private copies).
function SWAP_ripFromStage(donorEntries, kmdBytes, containerEi){
  var refs = SWAP_kmdHashes(kmdBytes);
  var texes = SWAP_collectTextures(donorEntries).filter(function(t){
    return containerEi < 0 || (t.kind === "dar" && t.ei === containerEi) ||
           (t.kind === "loose" && t.ei === containerEi);
  });
  var byHash = {};
  texes.forEach(function(t){ if (!byHash[t.hash]) byHash[t.hash] = t; });
  var adds = [], missing = [];
  refs.forEach(function(h){
    var t = byHash[h];
    if (!t){ missing.push(h); return; }
    adds.push({ name: h.toString(16).padStart(4, "0") + ".pcx", hash: h,
                bytes: new Uint8Array(t.bytes) });
  });
  return { adds: adds, missing: missing, refCount: refs.length };
}

// ═══ PC stage.mgz support ════════════════════════════════════════════════════
// A PC stage is a folder of files inside the mgz (zip). Textures are PCC
// members of name-based PC DARs (or loose files); identity = GV_StrCode of
// the member name without extension — same u16 space the KMDs reference.

function SWAP_pcNameNoExt(n){ return String(n).replace(/\\.[^.]+$/, ""); }
function SWAP_pcBase(p){ return String(p).replace(/^.*[\\/\\\\]/, ""); }

// files: [{path, data(Uint8Array)}] belonging to ONE stage folder.
function SWAP_pcCollect(files){
  var out = [];
  files.forEach(function(f){
    if (/\\.dar$/i.test(f.path)){
      var members = pcDarParse(f.data);
      if (!members) return;
      members.forEach(function(m, mi){
        var slot = vramSlotOf(m.name, m.data);
        if (slot) out.push({ kind: "pcdar", path: f.path, mi: mi, name: m.name,
          hash: SWAP_mgsHash(SWAP_pcNameNoExt(m.name)), bytes: m.data, slot: slot });
      });
      return;
    }
    var slot = vramSlotOf(f.path, f.data);
    if (slot) out.push({ kind: "pcloose", path: f.path, name: SWAP_pcBase(f.path),
      hash: SWAP_mgsHash(SWAP_pcNameNoExt(SWAP_pcBase(f.path))), bytes: f.data, slot: slot });
  });
  return out;
}

function SWAP_pcListKmds(files){
  var out = [];
  files.forEach(function(f){
    if (/\\.dar$/i.test(f.path)){
      var members = pcDarParse(f.data);
      if (!members) return;
      members.forEach(function(m, mi){
        if (SWAP_looksLikeKmd(m.data))
          out.push({ kind: "pcdar", path: f.path, mi: mi, name: m.name, bytes: m.data,
            label: m.name + "  (" + SWAP_pcBase(f.path) + ", " + SWAP_kmdHashes(m.data).length + " tex refs)" });
      });
      return;
    }
    if (SWAP_looksLikeKmd(f.data))
      out.push({ kind: "pcloose", path: f.path, name: SWAP_pcBase(f.path), bytes: f.data,
        label: SWAP_pcBase(f.path) + "  (loose, " + SWAP_kmdHashes(f.data).length + " tex refs)" });
  });
  return out;
}

// Rip from a PC donor stage: member NAMES are preserved (identity = name).
function SWAP_pcRipFromFiles(files, kmdBytes, containerPath){
  var refs = SWAP_kmdHashes(kmdBytes);
  var texes = SWAP_pcCollect(files).filter(function(t){
    return !containerPath || t.path === containerPath;
  });
  var byHash = {};
  texes.forEach(function(t){ if (!byHash[t.hash]) byHash[t.hash] = t; });
  var adds = [], missing = [];
  refs.forEach(function(h){
    var t = byHash[h];
    if (!t){ missing.push(h); return; }
    adds.push({ name: t.name, hash: h, bytes: new Uint8Array(t.bytes) });
  });
  return { adds: adds, missing: missing, refCount: refs.length };
}

// Plan for PC: returns the FULL updated stage fileset [{path,data}].
// kmdSwap (optional, PC): { path, mi (-1 = loose file), donorBytes } — donor
// KMD stored under the resident member's NAME (identity on PC is the name).
function SWAP_pcPlan(files, removeSet, addFiles, kmdSwap){
  var res = { ok: false, files: null, mapping: [], warnings: [], errors: [], stats: {} };
  var texes = SWAP_pcCollect(files);
  var removed = texes.filter(function(t){ return removeSet.has(t.hash); });
  var kept    = texes.filter(function(t){ return !removeSet.has(t.hash); });
  var keptHashes = {}; kept.forEach(function(t){ keptHashes[t.hash] = 1; });
  addFiles = addFiles.filter(function(f){
    if (keptHashes[f.hash]){
      res.warnings.push("added " + f.name + " is shared with a kept resident texture \\u2014 skipped; the model uses the resident copy");
      return false;
    }
    if (SWAP_mgsHash(SWAP_pcNameNoExt(f.name)) !== f.hash)
      res.warnings.push(f.name + ": file name does not strcode to 0x" + f.hash.toString(16) +
        " — on PC the NAME is the identity; the member will be stored under this name");
    return true;
  });
  if (res.errors.length) return res;

  var placed = SWAP_place(kept, removed, addFiles, { wideInit: true });
  res.warnings = res.warnings.concat(placed.warnings);
  res.errors = res.errors.concat(placed.errors);
  res.mapping = placed.mapping;
  if (placed.overflow) res.overflow = true;   /* surface the fit-failure flag */
  if (!placed.ok) return res;
  var adds = placed.adds;

  // assemble: drop removed members/looses, append adds to the majority dar
  var dropDar = {}, dropLoose = {}, darVotes = {};
  removed.forEach(function(t){
    if (t.kind === "pcdar"){ (dropDar[t.path] = dropDar[t.path] || {})[t.mi] = 1;
      darVotes[t.path] = (darVotes[t.path] || 0) + 1; }
    else dropLoose[t.path] = 1;
  });
  var target = null, best = 0;
  for (var p in darVotes) if (darVotes[p] > best){ best = darVotes[p]; target = p; }
  if (!target && adds.length){
    res.errors.push("no removed DAR member found to target the additions " +
      "(remove at least one DAR texture so the tool knows which DAR new ones belong in)");
    return res;
  }
  var outFiles = [];
  files.forEach(function(f){
    if (dropLoose[f.path]) return;
    var data = f.data;
    var ksHere = kmdSwap && kmdSwap.path === f.path;
    if (ksHere && kmdSwap.mi < 0){
      data = kmdSwap.donorBytes;                      /* loose KMD swap in place */
    } else if (dropDar[f.path] || f.path === target || (ksHere && kmdSwap.mi >= 0)){
      var raw = pcDarParse(f.data);
      if (ksHere && kmdSwap.mi >= 0 && raw[kmdSwap.mi])
        raw[kmdSwap.mi] = { name: raw[kmdSwap.mi].name, data: kmdSwap.donorBytes };
      var members = raw.filter(function(m, mi){
        return !(dropDar[f.path] && dropDar[f.path][mi]);
      }).map(function(m){ return { name: m.name, bytes: m.data }; });
      if (f.path === target)
        adds.forEach(function(a){ members.push({ name: a.name, bytes: a.bytes }); });
      data = pcDarBuild(members);
    }
    outFiles.push({ path: f.path, data: data });
  });
  res.stats = { removed: removed.length, added: adds.length, container: target || "(none)" };
  res.files = outFiles;
  res.ok = true;
  return res;
}

// Conflict scan for any collected texes (shared by PSX and PC paths).
function SWAP_verifyTexes(texes){
  var problems = [], initN = 0, stageN = 0, i, j;
  for (i = 0; i < texes.length; i++){
    var a = texes[i].slot;
    if (a.py < 256) initN++; else stageN++;
    if (crossesTPage(a.px, a.vw, a.bpp))
      problems.push("0x" + texes[i].hash.toString(16) + " crosses a TPAGE boundary at x=" + a.px);
    for (j = i + 1; j < texes.length; j++){
      var b = texes[j].slot;
      var ha = "0x" + texes[i].hash.toString(16), hb = "0x" + texes[j].hash.toString(16);
      if (a.px === b.px && a.py === b.py){ }
      else if (rectsOverlap(texRect(a), texRect(b)))
        problems.push("texture overlap: " + ha + " ~ " + hb);
      if (!(a.cx === b.cx && a.cy === b.cy) && clutsOverlap(a, b))
        problems.push("CLUT overlap: " + ha + " ~ " + hb);
      if (rectsOverlap(texRect(a), { x: b.cx, y: b.cy, w: b.nc, h: 1 }))
        problems.push("texture " + ha + " overlaps CLUT of " + hb);
      if (rectsOverlap(texRect(b), { x: a.cx, y: a.cy, w: a.nc, h: 1 }))
        problems.push("texture " + hb + " overlaps CLUT of " + ha);
    }
  }
  return { ok: problems.length === 0, problems: problems,
    total: texes.length, initCount: initN, stageCount: stageN };
}

// Full stage rebuild INCLUDING the header config table (entry count/order can
// change — psxRebuildStage alone only patches sizes into a same-shaped table).
function SWAP_rebuildStage(headerB64, entries){
  var header = bytesFromB64(headerB64).slice();
  var need = 4 + entries.length * 8 + 8;
  if (need > 2048) throw new Error("config table exceeds the header sector (" + entries.length + " entries)");
  for (var p = 4; p < 2048; p++) header[p] = 0;
  entries.forEach(function(e, i){
    var o = 4 + i * 8;
    w16(header, o, e.hash); header[o + 2] = e.mode; header[o + 3] = e.ext;
    // size u32 written by psxRebuildStage
  });
  return psxRebuildStage(b64FromBytes(header), entries);
}

// ═══════════════════════════════════════════════════════════════════════════
// CATALOG BATCH — single-donor resident swap over a whole STAGE.DIR
// ═══════════════════════════════════════════════════════════════════════════
// Port of resident_swap.py's batch model. Every listed character member has its
// KMD overwritten with a RESIDENT donor model (default Snake 39213), keeping the
// member's hash. NO textures move: the donor is already resident, so its VRAM is
// untouched — the character just draws with the donor's already-loaded pages.
// Catalog schema (identical to resident_swap.py's catalog.json):
//   { "resident":"init.stg", "donor":39213,
//     "stages": { "<name>": [ {"hash":H,"index":I,"method"?,"donor"?}, ... ] } }

var SWAP_DONOR_DEFAULT = 39213;                 /* Snake */
var SWAP_KMD_EXT = 0x6b, SWAP_GCX_EXT = 0x67, SWAP_CACHED_MODE = 0x63;

// Pull a KMD by hash out of a resident stage's entries: a loose KMD entry
// first, then any DAR member. Returns a private Uint8Array copy, or null.
function SWAP_extractResidentKmd(residentEntries, donorHash){
  var i, m, e, data;
  for (i = 0; i < residentEntries.length; i++){
    e = residentEntries[i]; data = e.data || e.bytes;
    if (data && e.hash === donorHash && e.ext === SWAP_KMD_EXT) return new Uint8Array(data);
  }
  for (i = 0; i < residentEntries.length; i++){
    e = residentEntries[i]; data = e.data || e.bytes;
    if (!data || extName(e.ext) !== "dar") continue;
    var members = psxDarParse(data);
    if (!members) continue;
    for (m = 0; m < members.length; m++)
      if (members[m].hash === donorHash && members[m].ext === SWAP_KMD_EXT)
        return new Uint8Array(members[m].data);
  }
  return null;
}

// Locate the character member (top-level entry): prefer the given index when it
// hashes to the target, else the first KMD-typed match, else any non-marker
// match. Mirrors resident_swap.py find_member.
function SWAP_findMemberIndex(entries, memberHash, index){
  if (index !== undefined && index !== null &&
      index >= 0 && index < entries.length && entries[index].hash === memberHash)
    return index;
  var i;
  for (i = 0; i < entries.length; i++)
    if (entries[i].hash === memberHash && entries[i].ext === SWAP_KMD_EXT) return i;
  for (i = 0; i < entries.length; i++)
    if (entries[i].hash === memberHash && entries[i].ext !== 0xFF) return i;
  return -1;
}

// kmd-replace, in place on a parsed entry list. Keeps hash/mode/ext, overwrites
// the member's bytes with the donor KMD. Returns { ei, oldLen, newLen }.
function SWAP_kmdReplaceEntry(entries, memberHash, donorKmd, index){
  var ei = SWAP_findMemberIndex(entries, memberHash, index);
  if (ei < 0) throw new Error("member hash 0x" + memberHash.toString(16) + " not found");
  var e = entries[ei], old = e.data ? e.data.length : 0;
  entries[ei] = { hash: e.hash, mode: e.mode, ext: e.ext, data: new Uint8Array(donorKmd) };
  return { ei: ei, oldLen: old, newLen: donorKmd.length };
}

// Every \`04 06 <hash-BE>\` load across GCX (script) members. [patch-char]
function SWAP_countLoads(entries, memberHash){
  var hi = (memberHash >> 8) & 0xFF, lo = memberHash & 0xFF, hits = [], i, p;
  for (i = 0; i < entries.length; i++){
    if (entries[i].ext !== SWAP_GCX_EXT) continue;
    var b = entries[i].data; if (!b) continue;
    for (p = 0; p + 4 <= b.length; p++)
      if (b[p] === 0x04 && b[p+1] === 0x06 && b[p+2] === hi && b[p+3] === lo)
        hits.push({ ei: i, off: p });
  }
  return hits;
}

// patch-char: delete the model member and zero its single load instruction
// (plus a preceding 50 xx setup pair when present). Returns { ei, scriptEi, off }.
function SWAP_patchCharEntry(entries, memberHash, index){
  var hits = SWAP_countLoads(entries, memberHash);
  if (hits.length !== 1)
    throw new Error("patch-char needs exactly 1 load for 0x" + memberHash.toString(16) +
      ", found " + hits.length);
  var ei = SWAP_findMemberIndex(entries, memberHash, index);
  if (ei < 0) throw new Error("member hash 0x" + memberHash.toString(16) + " not found");
  var h = hits[0], se = entries[h.ei], b = new Uint8Array(se.data);   /* private copy */
  var start = h.off, ln = 4;
  if (h.off >= 2 && b[h.off - 2] === 0x50){ start = h.off - 2; ln += 2; }
  for (var k = 0; k < ln; k++) b[start + k] = 0;
  entries[h.ei] = { hash: se.hash, mode: se.mode, ext: se.ext, data: b };
  entries.splice(ei, 1);
  return { ei: ei, scriptEi: h.ei, off: h.off };
}

// Apply one catalog stage's entry list to a parsed stage's entries, in place.
// opts: { getDonor(hash)->Uint8Array|null, defaultDonor }. kmd-replaces run
// first (no index shift), then patch-char deletions high-index-first so
// survivors keep identity. Returns a results array.
function SWAP_applyCatalogStage(entries, catEntries, opts){
  var results = [], ops = [];
  catEntries.forEach(function(e){
    var donor = (e.donor !== undefined && e.donor !== null) ? (e.donor | 0)
              : (opts.defaultDonor !== undefined && opts.defaultDonor !== null ? opts.defaultDonor : SWAP_DONOR_DEFAULT);
    var method = e.method || "auto";
    if (method === "auto") method = "kmd-replace";   /* a donor is always set here */
    ops.push({ hash: (e.hash | 0), index: (e.index === undefined ? null : e.index),
               method: method, donor: donor });
  });

  ops.filter(function(o){ return o.method === "kmd-replace"; }).forEach(function(o){
    try{
      var dk = opts.getDonor(o.donor);
      if (!dk){ results.push({ hash: o.hash, status: "skipped-no-donor", donor: o.donor }); return; }
      var r = SWAP_kmdReplaceEntry(entries, o.hash, dk, o.index);
      results.push({ hash: o.hash, status: "kmd-replace", ei: r.ei,
                     oldLen: r.oldLen, newLen: r.newLen, donor: o.donor });
    }catch(ex){ results.push({ hash: o.hash, status: "error", error: ex.message }); }
  });

  ops.filter(function(o){ return o.method === "patch-char"; })
     .sort(function(a, b){ return SWAP_findMemberIndex(entries, b.hash, b.index) -
                                  SWAP_findMemberIndex(entries, a.hash, a.index); })
     .forEach(function(o){
    try{
      var r = SWAP_patchCharEntry(entries, o.hash, o.index);
      results.push({ hash: o.hash, status: "patch-char", ei: r.ei, scriptEi: r.scriptEi, off: r.off });
    }catch(ex){ results.push({ hash: o.hash, status: "error", error: ex.message }); }
  });

  ops.filter(function(o){ return o.method !== "kmd-replace" && o.method !== "patch-char"; })
     .forEach(function(o){ results.push({ hash: o.hash, status: "error",
       error: "unknown method '" + o.method + "'" }); });

  return results;
}

// Run a whole catalog over a loaded PSX STAGE.DIR (bytes). Rebuilds only the
// touched stages (via SWAP_rebuildStage, which rewrites the config table so
// patch-char deletions are safe) and leaves every other stage verbatim.
// Returns { ok, rebuilt(Uint8Array), summary, resident, donor } or { ok:false, error }.
function SWAP_runCatalogPsx(dirBytes, catalog, opts){
  opts = opts || {};
  if (!catalog || !catalog.stages) return { ok: false, error: 'catalog has no "stages" map' };
  var outer = psxParseOuter(dirBytes), byName = {};
  outer.stages.forEach(function(s){ byName[s.name] = s; });
  function stripStg(n){ return String(n).replace(/\\.stg$/i, ""); }

  var residentName = stripStg(catalog.resident || "init");
  var defaultDonor = (opts.donor !== undefined && opts.donor !== null) ? (opts.donor | 0)
                   : (catalog.donor !== undefined && catalog.donor !== null ? (catalog.donor | 0) : SWAP_DONOR_DEFAULT);

  var rs = byName[residentName];
  if (!rs) return { ok: false, error: "resident stage '" + residentName + "' not found in STAGE.DIR" };
  var residentEntries = psxParseStage(dirBytes.subarray(rs.byteOff, rs.byteOff + rs.extent)).entries;

  var donorCache = {};
  function getDonor(dh){
    if (dh === null || dh === undefined) dh = defaultDonor;
    dh = dh | 0;
    if (!(dh in donorCache)) donorCache[dh] = SWAP_extractResidentKmd(residentEntries, dh);
    return donorCache[dh];
  }

  var blobs = {};
  outer.stages.forEach(function(s){ blobs[s.name] = dirBytes.subarray(s.byteOff, s.byteOff + s.extent); });

  // Which stages to run. opts.selected (array of names) wins when provided —
  // that's the UI's tick list. Otherwise honor catalog.disabled (array of names
  // the file itself opts out of). Names are matched with .stg stripped.
  var selected = null;
  if (opts.selected){ selected = {}; opts.selected.forEach(function(n){ selected[stripStg(n)] = true; }); }
  var disabled = {};
  (catalog.disabled || []).forEach(function(n){ disabled[stripStg(n)] = true; });

  var summary = [];
  Object.keys(catalog.stages).forEach(function(rawName){
    var name = stripStg(rawName), s = byName[name];
    if (selected ? !selected[name] : disabled[name]){ summary.push({ stage: name, status: "skipped" }); return; }
    if (!s){ summary.push({ stage: name, status: "missing" }); return; }
    var parsed = psxParseStage(dirBytes.subarray(s.byteOff, s.byteOff + s.extent));
    var results = SWAP_applyCatalogStage(parsed.entries, catalog.stages[rawName],
      { getDonor: getDonor, defaultDonor: defaultDonor });
    var built = parsed.entries.map(function(e){
      return { hash: e.hash, mode: e.mode, ext: e.ext, bytes: e.data ? e.data : new Uint8Array(0) };
    });
    blobs[name] = SWAP_rebuildStage(parsed.headerB64, built);
    summary.push({ stage: name, results: results });
  });

  var rebuilt = psxRebuildDir({ psx: { headB64: outer.headB64, stages: outer.stages } }, blobs);
  return { ok: true, rebuilt: rebuilt, summary: summary, resident: residentName, donor: defaultDonor };
}

if (typeof module !== "undefined") module.exports = {
  SWAP_mgsHash: SWAP_mgsHash, SWAP_hashFromFilename: SWAP_hashFromFilename,
  SWAP_extractResidentKmd: SWAP_extractResidentKmd, SWAP_findMemberIndex: SWAP_findMemberIndex,
  SWAP_kmdReplaceEntry: SWAP_kmdReplaceEntry, SWAP_countLoads: SWAP_countLoads,
  SWAP_patchCharEntry: SWAP_patchCharEntry, SWAP_applyCatalogStage: SWAP_applyCatalogStage,
  SWAP_runCatalogPsx: SWAP_runCatalogPsx,
  SWAP_collectTextures: SWAP_collectTextures, SWAP_plan: SWAP_plan,
  SWAP_verify: SWAP_verify, SWAP_kmdHashes: SWAP_kmdHashes,
  SWAP_looksLikeKmd: SWAP_looksLikeKmd, SWAP_listKmds: SWAP_listKmds,
  SWAP_place: SWAP_place, SWAP_pcCollect: SWAP_pcCollect, SWAP_pcListKmds: SWAP_pcListKmds,
  SWAP_pcRipFromFiles: SWAP_pcRipFromFiles, SWAP_pcPlan: SWAP_pcPlan, SWAP_verifyTexes: SWAP_verifyTexes,
  SWAP_findTexturesByHashes: SWAP_findTexturesByHashes, SWAP_ripFromStage: SWAP_ripFromStage,
  SWAP_rebuildStage: SWAP_rebuildStage, SWAP_REGION_INIT: SWAP_REGION_INIT,
  SWAP_paletteKey: SWAP_paletteKey, SWAP_pcxUsedIndices: SWAP_pcxUsedIndices,
  SWAP_isProtected: SWAP_isProtected, SWAP_recommendDeletions: SWAP_recommendDeletions,
  SWAP_distributeToStages: SWAP_distributeToStages, SWAP_PROTECTED_HASHES: SWAP_PROTECTED_HASHES,
  SWAP_kmdRehash: SWAP_kmdRehash, SWAP_dedupeAddHashes: SWAP_dedupeAddHashes
};


// ── OPTION (B): distribute leftover textures into every s****/d**** stage ────
// When a character's textures don't fit the resident area, pack the OVERFLOW
// into each gameplay stage's own texture DAR so they load per-stage. This uses
// the STAGE VRAM region (y>=256, x<960) — a SEPARATE memory area from the
// resident/init region — and matches the Stage Editor's VRAM repacker exactly:
//   - collect ALL existing stage-region textures across the WHOLE stage as
//     fixed occupancy (not just the target DAR — the whole stage shares VRAM),
//   - first-fit-decreasing placement, TPAGE-aligned (64 halfwords), within the
//     stage region only,
//   - stage CLUTs placed 16-aligned in the stage clut band, bottom-up,
//   - verify no stage VRAM collision before committing; a texture that cannot
//     be placed cleanly is SKIPPED (reported) rather than overlapped.
//
// Returns { stages:[{name,added,skipped,note}], darEdits:{ 'stage/ei': items } }
function SWAP_distributeToStages(outerParsedByStage, overflowFiles, log){
  var result = { stages: [], darEdits: {} };
  var STAGE = VRAM_REGIONS.stage;   // {x1:0,y1:256,x2:960,y2:512}

  function tpageBad(x, vw, bpp){ return crossesTPage(x, vw, bpp); }

  // find a free (px,py) in the STAGE region avoiding \`occupied\` tex rects and
  // \`clutRects\` — first-fit, X step 4, Y step 1, TPAGE-safe.
  function findStageTex(occupied, clutRects, vw, h, bpp){
    for (var y = STAGE.y1; y + h <= STAGE.y2; y++){
      for (var x = STAGE.x1; x + vw <= STAGE.x2; x += 4){
        if (tpageBad(x, vw, bpp)) continue;
        var cand = { x: x, y: y, w: vw, h: h }, ok = true, i;
        for (i = 0; i < occupied.length; i++)
          if (rectsOverlap(cand, texRect(occupied[i]))){ ok = false; break; }
        if (ok) for (i = 0; i < clutRects.length; i++)
          if (rectsOverlap(cand, { x: clutRects[i].cx, y: clutRects[i].cy, w: clutRects[i].nc, h: 1 })){ ok = false; break; }
        if (ok) return { px: x, py: y };
      }
    }
    return null;
  }
  // stage CLUT band: 16-aligned x in [512,960), scanned bottom-up from y511.
  function findStageClut(occupiedCluts, nc){
    for (var y = STAGE.y2 - 1; y >= STAGE.y1; y--){
      for (var x = 512; x + nc <= 960; x += 16){
        var cand = { cx: x, cy: y, nc: nc }, ok = true;
        for (var i = 0; i < occupiedCluts.length; i++)
          if (clutsOverlap(cand, occupiedCluts[i])){ ok = false; break; }
        if (ok) return { cx: x, cy: y };
      }
    }
    return null;
  }

  var stageNames = Object.keys(outerParsedByStage).filter(function(n){ return /^[sd]\\d/i.test(n); });

  stageNames.forEach(function(sname){
    var entries = outerParsedByStage[sname].entries;

    // Whole-stage occupancy: every texture + clut the stage already uses in the
    // STAGE region, across ALL its DARs (this is what my per-DAR pass missed —
    // the collisions came from ignoring sibling DARs sharing stage VRAM).
    var fixedTex = [], fixedClut = [];
    var texDars = [];
    entries.forEach(function(e, ei){
      if (extName(e.ext) !== "dar" || !e.data) return;
      var members = psxDarParse(e.data); if (!members) return;
      var texCount = 0;
      members.forEach(function(m){
        var s = vramSlotOf("x", m.data);
        if (!s) return;
        texCount++;
        if (s.py >= 256){ fixedTex.push(s); }
        if (s.nc > 0 && s.cy >= 256){ fixedClut.push({ cx: s.cx, cy: s.cy, nc: s.nc }); }
      });
      if (texCount > 0) texDars.push({ ei: ei, members: members, texCount: texCount });
    });
    if (!texDars.length){
      result.stages.push({ name: sname, added: 0, skipped: overflowFiles.length, note: "no texture DAR" });
      return;
    }
    // target DAR = the one with the most textures (the primary stage tex pack)
    texDars.sort(function(a,b){ return b.texCount - a.texCount; });
    var target = texDars[0];

    // place overflow into stage VRAM, largest first
    var toPlace = overflowFiles.map(function(f){
      var s = vramSlotOf(f.name, f.bytes) || vramSlotOf("x", f.bytes);
      return { file: f, slot: s };
    }).filter(function(o){ return o.slot; })
      .sort(function(a,b){ return (b.slot.vw*b.slot.h) - (a.slot.vw*a.slot.h); });

    var occTex = fixedTex.slice(), occClut = fixedClut.slice();
    var newMembers = [], skipped = 0;

    toPlace.forEach(function(o){
      // skip if this stage's target DAR already carries the hash (shared)
      if (target.members.some(function(m){ return m.hash === o.file.hash; })) return;
      var vw = o.slot.vw, h = o.slot.h, bpp = o.slot.bpp, nc = o.slot.nc;
      var pos = findStageTex(occTex, occClut, vw, h, bpp);
      if (!pos){ skipped++; if (log) log("    " + sname + ": no stage VRAM for 0x" + o.file.hash.toString(16), "warn"); return; }
      var clut = null;
      if (nc > 0){
        clut = findStageClut(occClut, nc);
        if (!clut){ skipped++; if (log) log("    " + sname + ": no stage CLUT for 0x" + o.file.hash.toString(16), "warn"); return; }
      }
      // write the placement into a COPY of the file bytes for this stage
      var bytes = new Uint8Array(o.file.bytes);
      var s2 = vramSlotOf("x", bytes);
      writePlacement(s2, pos.px, pos.py, clut ? clut.cx : s2.cx, clut ? clut.cy : s2.cy);
      // register as occupied so later placements in THIS stage avoid it
      occTex.push({ px: pos.px, py: pos.py, vw: vw, h: h, bpp: bpp });
      if (clut) occClut.push({ cx: clut.cx, cy: clut.cy, nc: nc });
      newMembers.push({ hash: o.file.hash, ext: 0x70, bytes: bytes,
                        name: "add_" + o.file.hash.toString(16) + ".pcc" });
    });

    if (!newMembers.length){
      result.stages.push({ name: sname, added: 0, skipped: skipped, note: skipped ? "" : "already present" });
      return;
    }

    // assemble the rebuilt member list: existing members verbatim + new ones
    var items = target.members.map(function(m, j){
      return { hash: m.hash, ext: m.ext, bytes: m.data };
    });
    newMembers.forEach(function(nm){ items.push({ hash: nm.hash, ext: nm.ext, bytes: nm.bytes }); });

    // FINAL verify: no two stage-region textures/cluts in this DAR collide
    var vslots = [];
    items.forEach(function(it){ var s = vramSlotOf("x", it.bytes); if (s && s.py >= 256) vslots.push(s); });
    var collision = false;
    for (var a = 0; a < vslots.length && !collision; a++)
      for (var b = a + 1; b < vslots.length; b++){
        if (vslots[a].px === vslots[b].px && vslots[a].py === vslots[b].py) continue;
        if (rectsOverlap(texRect(vslots[a]), texRect(vslots[b]))){ collision = true; break; }
      }
    if (collision){
      result.stages.push({ name: sname, added: 0, skipped: overflowFiles.length, note: "verify failed — skipped" });
      if (log) log("    " + sname + ": post-pack collision detected, stage skipped", "err");
      return;
    }

    result.darEdits[sname + "/" + target.ei] = items;
    result.stages.push({ name: sname, added: newMembers.length, skipped: skipped });
  });
  return result;
}

// ── PC overflow → stages (parallel to SWAP_distributeToStages, PC container) ──
// PSX edits stage blobs inside the outer STAGE.DIR; PC stages are loose files in
// the zip (stage/<name>/*.dar), so this returns whole-file edits {path:bytes}
// that the PC execute path zips in place of the originals. Placement math is the
// same STAGE-region fitter; only parse/rebuild differ (name-keyed pcDar*).
function SWAP_pcDistributeToStages(pcFiles, overflowFiles, stageSegOf, log){
  var result = { stages: [], fileEdits: {} };
  var STAGE = VRAM_REGIONS.stage;   // {x1:0,y1:256,x2:960,y2:512}

  function findStageTex(occupied, clutRects, vw, h, bpp){
    for (var y = STAGE.y1; y + h <= STAGE.y2; y++){
      for (var x = STAGE.x1; x + vw <= STAGE.x2; x += 4){
        if (crossesTPage(x, vw, bpp)) continue;
        var cand = { x: x, y: y, w: vw, h: h }, ok = true, i;
        for (i = 0; i < occupied.length; i++)
          if (rectsOverlap(cand, texRect(occupied[i]))){ ok = false; break; }
        if (ok) for (i = 0; i < clutRects.length; i++)
          if (rectsOverlap(cand, { x: clutRects[i].cx, y: clutRects[i].cy, w: clutRects[i].nc, h: 1 })){ ok = false; break; }
        if (ok) return { px: x, py: y };
      }
    }
    return null;
  }
  function findStageClut(occupiedCluts, nc, occupiedTex){
    // A CLUT occupies one VRAM row of \`nc\` entries. It must avoid other CLUTs AND
    // every stage texture. The original only checked CLUTs, so overflow CLUTs were
    // placed on top of live stage textures -> visible texture corruption.
    for (var y = STAGE.y2 - 1; y >= STAGE.y1; y--){
      for (var x = 512; x + nc <= 960; x += 16){
        var cand = { cx: x, cy: y, nc: nc }, ok = true, i;
        for (i = 0; i < occupiedCluts.length; i++)
          if (clutsOverlap(cand, occupiedCluts[i])){ ok = false; break; }
        if (ok && occupiedTex){
          var cr = { x: x, y: y, w: nc, h: 1 };
          for (i = 0; i < occupiedTex.length; i++)
            if (rectsOverlap(cr, texRect(occupiedTex[i]))){ ok = false; break; }
        }
        if (ok) return { cx: x, cy: y };
      }
    }
    return null;
  }

  // group pc files by stage segment, keep only s##/d## gameplay stages
  var byStage = {};
  pcFiles.forEach(function(f){
    var sn = stageSegOf(f.path);
    if (!/^[sd]\\d/i.test(sn)) return;
    (byStage[sn] = byStage[sn] || []).push(f);
  });

  Object.keys(byStage).forEach(function(sname){
    var stageFiles = byStage[sname];

    // whole-stage occupancy across ALL this stage's DARs (STAGE region only)
    var fixedTex = [], fixedClut = [];
    var texDars = [];    // {path, members:[{name,data}], texCount}
    stageFiles.forEach(function(f){
      if (!/\\.dar$/i.test(f.path)) return;
      var members = pcDarParse(f.data); if (!members) return;
      var texCount = 0;
      members.forEach(function(m){
        var s = vramSlotOf(m.name, m.data);
        if (!s) return;
        texCount++;
        if (s.py >= 256){ fixedTex.push(s); }
        if (s.nc > 0 && s.cy >= 256){ fixedClut.push({ cx: s.cx, cy: s.cy, nc: s.nc }); }
      });
      if (texCount > 0) texDars.push({ path: f.path, members: members, texCount: texCount });
    });
    if (!texDars.length){
      result.stages.push({ name: sname, added: 0, skipped: overflowFiles.length, note: "no texture DAR" });
      return;
    }
    texDars.sort(function(a,b){ return b.texCount - a.texCount; });
    var target = texDars[0];

    var toPlace = overflowFiles.map(function(f){
      var s = vramSlotOf(f.name, f.bytes) || vramSlotOf("x", f.bytes);
      return { file: f, slot: s };
    }).filter(function(o){ return o.slot; })
      .sort(function(a,b){ return (b.slot.vw*b.slot.h) - (a.slot.vw*a.slot.h); });

    var occTex = fixedTex.slice(), occClut = fixedClut.slice();
    var newMembers = [], skipped = 0;

    toPlace.forEach(function(o){
      // on PC identity is the NAME: skip if the target DAR already carries it
      if (target.members.some(function(m){ return m.name === o.file.name; })) return;
      var vw = o.slot.vw, h = o.slot.h, bpp = o.slot.bpp, nc = o.slot.nc;
      var pos = findStageTex(occTex, occClut, vw, h, bpp);
      if (!pos){ skipped++; if (log) log("    " + sname + ": no stage VRAM for " + o.file.name, "warn"); return; }
      var clut = null;
      if (nc > 0){
        clut = findStageClut(occClut, nc, occTex);
        if (!clut){ skipped++; if (log) log("    " + sname + ": no stage CLUT for " + o.file.name, "warn"); return; }
      }
      var bytes = new Uint8Array(o.file.bytes);
      var s2 = vramSlotOf(o.file.name, bytes) || vramSlotOf("x", bytes);
      writePlacement(s2, pos.px, pos.py, clut ? clut.cx : s2.cx, clut ? clut.cy : s2.cy);
      occTex.push({ px: pos.px, py: pos.py, vw: vw, h: h, bpp: bpp });
      if (clut) occClut.push({ cx: clut.cx, cy: clut.cy, nc: nc });
      newMembers.push({ name: o.file.name, bytes: bytes });
    });

    if (!newMembers.length){
      result.stages.push({ name: sname, added: 0, skipped: skipped, note: skipped ? "" : "already present" });
      return;
    }

    // rebuild target DAR: existing members verbatim + new named members
    var items = target.members.map(function(m){ return { name: m.name, bytes: m.data }; });
    newMembers.forEach(function(nm){ items.push({ name: nm.name, bytes: nm.bytes }); });

    // FINAL verify: no two STAGE-region textures in this DAR overlap
    var vslots = [];
    items.forEach(function(it){ var s = vramSlotOf(it.name, it.bytes); if (s && s.py >= 256) vslots.push(s); });
    var collision = false;
    for (var a = 0; a < vslots.length && !collision; a++)
      for (var b = a + 1; b < vslots.length; b++){
        if (vslots[a].px === vslots[b].px && vslots[a].py === vslots[b].py) continue;
        if (rectsOverlap(texRect(vslots[a]), texRect(vslots[b]))){ collision = true; break; }
      }
    if (collision){
      result.stages.push({ name: sname, added: 0, skipped: overflowFiles.length, note: "verify failed \\u2014 skipped" });
      if (log) log("    " + sname + ": post-pack collision detected, stage skipped", "err");
      return;
    }

    result.fileEdits[target.path] = pcDarBuild(items);
    result.stages.push({ name: sname, added: newMembers.length, skipped: skipped });
  });
  return result;
}
<\/script>
<script>// ── KMD ↔ GLB pipeline ───────────────────────────────────────────────────────
// Export a KMD (+ its DAR textures) to a self-contained .glb, and re-import an
// edited .glb back into the original KMD's binary structure. The KMD block
// layout matches the suite's parser (04_textures.js): blocks at 0x20 + 88*i,
// verts int16*4 @ desc+56 (count @ +52), faces u8*4 @ +60 (count @ +4),
// UVs u8*8 @ +76, texhash u16 @ +80. GLB import writes vertices/UVs back into
// those exact spans — topology is preserved, so edits are geometry+UV only.

var KMD_SCALE = 1;   // keep native units; the importer inverts consistently

function KMD_parseBlocks(bytes){
  var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var d = bytes;
  var n = v.getUint32(4, true);
  if (n === 0 || n > 512) return null;
  // bone world positions (localPos + parent chain) — matches KmdModel.GetObjectPosition
  var boneWP = [];
  for (var kb = 0; kb < n; kb++){
    var ko = 0x20 + kb * 88;
    if (ko + 0x30 > bytes.length){ boneWP.push([0,0,0]); continue; }
    var kw = [v.getInt32(ko+0x20,true), v.getInt32(ko+0x24,true), v.getInt32(ko+0x28,true)];
    var kp = v.getInt32(ko+0x2C, true);
    if (kp >= 0 && kp < boneWP.length){ kw[0]+=boneWP[kp][0]; kw[1]+=boneWP[kp][1]; kw[2]+=boneWP[kp][2]; }
    boneWP.push(kw);
  }
  var blocks = [];
  for (var bi = 0; bi < n; bi++){
    var bo = 0x20 + bi * 88;
    if (bo + 88 > bytes.length) break;
    // header fields (exact Mint offsets)
    var nf   = v.getUint32(bo+0x04,true);          // FaceCount
    var nv   = v.getUint32(bo+0x34,true);          // VertexCount
    var vo   = v.getUint32(bo+0x38,true);          // VertexCoordOffset
    var voo  = v.getUint32(bo+0x3C,true);          // VertexOrderOffset
    var nnc  = v.getUint32(bo+0x40,true);          // NormalVertexCount
    var nco  = v.getUint32(bo+0x44,true);          // NormalVertexCoordOffset
    var noo  = v.getUint32(bo+0x48,true);          // NormalVertexOrderOffset
    var uvo  = v.getUint32(bo+0x4C,true);          // UVOffset
    var tno  = v.getUint32(bo+0x50,true);          // TextureNameOffset
    var bw = boneWP[bi] || [0,0,0];
    var block = { idx: bi, nv:nv, vo:vo, voo:voo, nf:nf, uvo:uvo, tno:tno,
                  nnc:nnc, nco:nco, noo:noo, bw:bw,
                  verts:[], normals:[], faces:[] };
    // vertex coords: Vector4Int16 (X,Y,Z,W) — we take XYZ
    if (nv>0 && nv<50000 && vo + nv*8 <= bytes.length){
      for (var vi=0; vi<nv; vi++){ var vp=vo+vi*8;
        block.verts.push([ v.getInt16(vp,true), v.getInt16(vp+2,true), v.getInt16(vp+4,true) ]); }
    }
    // normal coords: Vector4Int16
    if (nnc>0 && nnc<50000 && nco + nnc*8 <= bytes.length){
      for (var ni=0; ni<nnc; ni++){ var np=nco+ni*8;
        block.normals.push([ v.getInt16(np,true), v.getInt16(np+2,true), v.getInt16(np+4,true) ]); }
    }
    // per-face: vertex order (4×u8), normal order (4×u8), UVs (4× Vector2UInt8), texhash (u16)
    if (nf>0 && nf<50000){
      for (var fi=0; fi<nf; fi++){
        var face = { i:[0,0,0,0], ni:[0,0,0,0], uv:[0,0,0,0,0,0,0,0], hash:0 };
        var fp = voo + fi*4;
        if (fp+4<=bytes.length) face.i = [ d[fp],d[fp+1],d[fp+2],d[fp+3] ];
        var mp = noo + fi*4;
        if (mp+4<=bytes.length) face.ni = [ d[mp]&0x7F, d[mp+1]&0x7F, d[mp+2]&0x7F, d[mp+3]&0x7F ];
        // UVs: FaceCount*4 entries, 2 bytes each, sequential (x advances per corner)
        var up = uvo + fi*8;
        if (up+8<=bytes.length) face.uv = [ d[up],d[up+1],d[up+2],d[up+3],d[up+4],d[up+5],d[up+6],d[up+7] ];
        if (tno + fi*2 + 2 <= bytes.length) face.hash = v.getUint16(tno+fi*2, true);
        block.faces.push(face);
      }
    }
    blocks.push(block);
  }
  return { n:n, blocks:blocks };
}

// Build a GLB from a KMD + a texture map {hash:{png:Uint8Array}}, WITH a full
// glTF skeleton: 16 joint nodes in the KMD bone hierarchy, a skin, and rigid
// per-vertex bone binding (each block's geometry weights 100% to its own bone).
// Matches what the MMS/Noesis pipeline produces: armature + mesh + textures.
function KMD_toGLB(kmdBytes, texMap){
  var parsed = KMD_parseBlocks(kmdBytes);
  if (!parsed) throw new Error("not a KMD");
  var v = new DataView(kmdBytes.buffer, kmdBytes.byteOffset, kmdBytes.byteLength);

  // ---- bone rig: localPos + parent, and accumulated world positions ----
  var bones = [];
  for (var bi = 0; bi < parsed.n; bi++){
    var bo = 0x20 + bi * 88;
    bones.push({
      idx: bi,
      parent: v.getInt32(bo + 0x2C, true),
      local: [ v.getInt32(bo + 0x20, true), v.getInt32(bo + 0x24, true), v.getInt32(bo + 0x28, true) ]
    });
  }

  // ---- geometry grouped by texture hash, but each vertex tagged with its
  //      source BONE so we can emit JOINTS_0/WEIGHTS_0 (rigid skinning) ----
  var groups = {};   // hash -> {pos:[], nrm:[], uv:[], joint:[], weight:[], idx:[]}
  parsed.blocks.forEach(function(b){
    var bone = b.idx;   // KMD: block i binds to bone i, one bone per vertex
    b.faces.forEach(function(f){
      var h = f.hash;
      if (!groups[h]) groups[h] = { pos:[], nrm:[], uv:[], joint:[], weight:[], idx:[] };
      var g = groups[h];
      // 4 corners: position (+bone world), normal (÷4096, NEGATED — Mint), UV (÷256)
      var corner = [];
      for (var k = 0; k < 4; k++){
        var vt = b.verts[f.i[k]] || [0,0,0];
        var nm = b.normals[f.ni[k]] || [0,0,0];
        corner.push({
          p: [ vt[0]+b.bw[0], vt[1]+b.bw[1], vt[2]+b.bw[2] ],
          n: [ -nm[0]/4096, -nm[1]/4096, -nm[2]/4096 ],
          u: [ f.uv[k*2]/256, f.uv[k*2+1]/256 ]
        });
      }
      // Mint winding: AddQuadrangle(v4,v3,v2,v1) → emit corners in REVERSED order
      var order = [3,2,1,0];
      var base = g.pos.length / 3;
      order.forEach(function(ci){
        var c = corner[ci];
        g.pos.push(c.p[0],c.p[1],c.p[2]);
        g.nrm.push(c.n[0],c.n[1],c.n[2]);
        g.uv.push(c.u[0],c.u[1]);
        g.joint.push(bone,0,0,0);
        g.weight.push(1,0,0,0);
      });
      // quad → 2 tris on the reversed-corner buffer
      g.idx.push(base+0,base+1,base+2, base+0,base+2,base+3);
    });
  });

  var bin = [], views = [], accessors = [], materials = [], meshPrims = [], images = [], textures = [], samplers = [{}];
  function align4(arr){ while (arr.length % 4) arr.push(0); }
  function pushView(bytesArr, target){
    var off = bin.length; for (var i=0;i<bytesArr.length;i++) bin.push(bytesArr[i]); align4(bin);
    views.push({ buffer:0, byteOffset:off, byteLength:bytesArr.length, target:target });
    return views.length - 1;
  }
  function f32bytes(arr){ var b=new Uint8Array(arr.length*4),dv=new DataView(b.buffer);
    for(var i=0;i<arr.length;i++)dv.setFloat32(i*4,arr[i],true); return b; }
  function u16bytes(arr){ var b=new Uint8Array(arr.length*2),dv=new DataView(b.buffer);
    for(var i=0;i<arr.length;i++)dv.setUint16(i*2,arr[i],true); return b; }
  function u8x4bytes(arr){ return new Uint8Array(arr); }
  function minmax(arr,comp){ var mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(var i=0;i<arr.length;i+=comp)for(var c=0;c<comp;c++){var val=arr[i+c];if(val<mn[c])mn[c]=val;if(val>mx[c])mx[c]=val;}
    return {min:mn.slice(0,comp),max:mx.slice(0,comp)}; }

  Object.keys(groups).forEach(function(hStr){
    var g = groups[hStr], h = +hStr;
    if (!g.pos.length) return;
    var posView = pushView(f32bytes(g.pos), 34962);
    var nrmView = pushView(f32bytes(g.nrm), 34962);
    var uvView  = pushView(f32bytes(g.uv), 34962);
    var jntView = pushView(u16bytes(g.joint), 34962);
    var wgtView = pushView(f32bytes(g.weight), 34962);
    var idxView = pushView(u16bytes(g.idx), 34963);
    var mm = minmax(g.pos, 3);
    var posAcc = accessors.length;
    accessors.push({ bufferView:posView, componentType:5126, count:g.pos.length/3, type:"VEC3", min:mm.min, max:mm.max });
    var nrmAcc = accessors.length;
    accessors.push({ bufferView:nrmView, componentType:5126, count:g.nrm.length/3, type:"VEC3" });
    var uvAcc = accessors.length;
    accessors.push({ bufferView:uvView, componentType:5126, count:g.uv.length/2, type:"VEC2" });
    var jntAcc = accessors.length;
    accessors.push({ bufferView:jntView, componentType:5123, count:g.joint.length/4, type:"VEC4" });
    var wgtAcc = accessors.length;
    accessors.push({ bufferView:wgtView, componentType:5126, count:g.weight.length/4, type:"VEC4" });
    var idxAcc = accessors.length;
    accessors.push({ bufferView:idxView, componentType:5123, count:g.idx.length, type:"SCALAR" });

    var matIdx = materials.length;
    var mat = { name:"tex_"+h.toString(16), pbrMetallicRoughness:{ metallicFactor:0, roughnessFactor:1 },
                alphaMode:"OPAQUE", doubleSided:true, extras:{ kmdTexHash:h } };
    if (texMap && texMap[h] && texMap[h].png){
      var imgView = pushView(texMap[h].png, undefined);
      images.push({ bufferView:imgView, mimeType:"image/png" });
      textures.push({ source:images.length-1, sampler:0 });
      mat.pbrMetallicRoughness.baseColorTexture = { index: textures.length-1 };
    }
    materials.push(mat);
    meshPrims.push({ attributes:{ POSITION:posAcc, NORMAL:nrmAcc, TEXCOORD_0:uvAcc, JOINTS_0:jntAcc, WEIGHTS_0:wgtAcc },
                     indices:idxAcc, material:matIdx });
  });

  // ---- glTF node graph: skeleton joints + a skinned mesh node ----
  // node 0 = mesh (skinned); nodes 1..n = joints in bone order.
  var nodes = [];
  nodes.push({ name:"kmd", mesh:0, skin:0 });   // node 0
  var jointNodeBase = 1;
  bones.forEach(function(bn, i){
    var node = { name:"bone_"+i, translation:[ bn.local[0], bn.local[1], bn.local[2] ] };
    nodes.push(node);
  });
  // wire children by parent
  bones.forEach(function(bn, i){
    if (bn.parent >= 0 && bn.parent < bones.length){
      var pn = nodes[jointNodeBase + bn.parent];
      (pn.children = pn.children || []).push(jointNodeBase + i);
    }
  });
  // scene roots: mesh node + every bone whose parent is -1 (root bones)
  var sceneNodes = [0];
  bones.forEach(function(bn, i){ if (bn.parent < 0) sceneNodes.push(jointNodeBase + i); });

  // inverse bind matrices: inverse of each joint's WORLD translation (rigid,
  // no rotation) so the skin neutralizes the bone's world offset — the mesh is
  // already in world space, so IBM = translate(-worldPos)
  var ibm = [];
  parsed.blocks; // (world positions computed in KMD_parseBlocks as b.bw)
  var boneWorld = [];
  bones.forEach(function(bn, i){
    var w = bn.local.slice();
    if (bn.parent >= 0 && bn.parent < boneWorld.length){ w[0]+=boneWorld[bn.parent][0]; w[1]+=boneWorld[bn.parent][1]; w[2]+=boneWorld[bn.parent][2]; }
    boneWorld.push(w);
  });
  boneWorld.forEach(function(w){
    // column-major 4x4, translation = -w
    ibm.push(1,0,0,0, 0,1,0,0, 0,0,1,0, -w[0],-w[1],-w[2],1);
  });
  var ibmView = pushView(f32bytes(ibm), undefined);
  var ibmAcc = accessors.length;
  accessors.push({ bufferView:ibmView, componentType:5126, count:bones.length, type:"MAT4" });
  var joints = bones.map(function(bn,i){ return jointNodeBase + i; });
  var skins = [{ inverseBindMatrices: ibmAcc, joints: joints, skeleton: jointNodeBase }];

  var gltf = {
    asset:{ version:"2.0", generator:"MGS1 Archive Tool KMD exporter (skinned)" },
    scene:0, scenes:[{ nodes: sceneNodes }],
    nodes: nodes,
    meshes:[{ primitives: meshPrims }],
    skins: skins,
    materials: materials, accessors: accessors, bufferViews: views,
    buffers:[{ byteLength: bin.length }], samplers: samplers,
    extras:{ kmdBlockCount: parsed.n }
  };
  if (images.length) gltf.images = images;
  if (textures.length) gltf.textures = textures;

  var jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  while (jsonBytes.length % 4) jsonBytes = concatU8(jsonBytes, new Uint8Array([0x20]));
  var binBytes = new Uint8Array(bin);
  while (binBytes.length % 4) binBytes = concatU8(binBytes, new Uint8Array([0]));
  var total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  var out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0,0x46546C67,true); dv.setUint32(4,2,true); dv.setUint32(8,total,true);
  dv.setUint32(12,jsonBytes.length,true); dv.setUint32(16,0x4E4F534A,true);
  out.set(jsonBytes,20);
  var bh = 20 + jsonBytes.length;
  dv.setUint32(bh,binBytes.length,true); dv.setUint32(bh+4,0x004E4942,true);
  out.set(binBytes, bh+8);
  return out;
}

function concatU8(a, b){ var c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }

// Re-encode an edited GLB into a NEW KMD, using the original KMD only for its
// per-bone metadata (bitflags, extend, parent, bone position). Geometry is
// rebuilt from scratch, so faces/verts CAN be added or deleted — matching
// Mint\\'s KmdImporter.FromGltf. Triangles are grouped by skin joint (bone);
// each object dedups its vertex + normal lists and writes fresh tables.
function GLB_toKMD(glbBytes, originalKmdBytes){
  var orig = new Uint8Array(originalKmdBytes);
  var ov = new DataView(orig.buffer, orig.byteOffset, orig.byteLength);
  var boneCount = ov.getUint32(4, true);
  if (boneCount === 0 || boneCount > 512) throw new Error("original is not a KMD");

  // per-bone metadata from the original header
  var meta = [];
  for (var bi = 0; bi < boneCount; bi++){
    var bo = 0x20 + bi * 88;
    meta.push({
      bitflags: ov.getUint32(bo+0x00, true),
      bbStart:  [ov.getInt32(bo+0x08,true), ov.getInt32(bo+0x0C,true), ov.getInt32(bo+0x10,true)],
      bbEnd:    [ov.getInt32(bo+0x14,true), ov.getInt32(bo+0x18,true), ov.getInt32(bo+0x1C,true)],
      bonePos:  [ov.getInt32(bo+0x20,true), ov.getInt32(bo+0x24,true), ov.getInt32(bo+0x28,true)],
      parent:   ov.getInt32(bo+0x2C, true),
      extend:   ov.getUint32(bo+0x30, true),
      padding:  ov.getUint32(bo+0x54, true)
    });
  }
  // bone world positions
  var boneWP = [];
  meta.forEach(function(m, i){
    var w = m.bonePos.slice();
    if (m.parent >= 0 && m.parent < boneWP.length){ w[0]+=boneWP[m.parent][0]; w[1]+=boneWP[m.parent][1]; w[2]+=boneWP[m.parent][2]; }
    boneWP.push(w);
  });

  // decode the GLB into triangles tagged with bone (skin joint) + material hash
  var g = parseGLBFull(glbBytes);

  // per-object accumulators
  var objs = [];
  for (var oi = 0; oi < boneCount; oi++){
    objs.push({ verts: [], vkey: {}, norms: [], nkey: {},
                vorder: [], norder: [], uv: [], hash: [] });
  }
  function idxOfAdd(list, keymap, x, y, z){
    var k = x + "," + y + "," + z;
    if (keymap[k] !== undefined) return keymap[k];
    var id = list.length; list.push([x,y,z]); keymap[k] = id; return id;
  }

  g.triangles.forEach(function(tri){
    var bone = tri.bone;
    if (bone < 0 || bone >= boneCount) bone = 0;
    var o = objs[bone];
    var wp = boneWP[bone];
    // KMD stores a quad per face; a triangle → degenerate quad (A,B,B,C) exactly
    // like Mint\\'s TryAddTriangle. Corners are written in order D,C,B,A (Mint).
    var quad;
    if (tri.quad){ quad = [ tri.v[0], tri.v[1], tri.v[2], tri.v[3] ]; }
    else { quad = [ tri.v[0], tri.v[1], tri.v[1], tri.v[2] ]; }   // degenerate
    var order = [3,2,1,0];                  // write D,C,B,A
    var vord = [], nord = [];
    order.forEach(function(qi){
      var c = quad[qi];
      // position in OBJECT space (world - bone world), rounded int16
      var vx = Math.round(c.p[0] - wp[0]), vy = Math.round(c.p[1] - wp[1]), vz = Math.round(c.p[2] - wp[2]);
      vord.push(idxOfAdd(o.verts, o.vkey, vx, vy, vz));
      // normal (÷1 here, stored ×−4096 at build), dedup in float space rounded
      var nx = c.n ? c.n[0] : 0, ny = c.n ? c.n[1] : 0, nz = c.n ? c.n[2] : 0;
      var rnx = Math.round(nx*4096)/4096, rny = Math.round(ny*4096)/4096, rnz = Math.round(nz*4096)/4096;
      nord.push(idxOfAdd(o.norms, o.nkey, rnx, rny, rnz));
    });
    o.vorder.push(vord);
    o.norder.push(nord);
    // UVs: 4 corners in the SAME D,C,B,A order, ×255 (Mint builder domain)
    order.forEach(function(qi){
      var c = quad[qi];
      o.uv.push([ clampU8(Math.round(clamp01(c.u ? c.u[0]:0)*255)),
                  clampU8(Math.round(clamp01(c.u ? c.u[1]:0)*255)) ]);
    });
    o.hash.push(tri.hash & 0xFFFF);
  });

  // enforce the 255-vert byte-index ceiling (no auto-split — warn instead)
  var overCap = [];
  objs.forEach(function(o, i){ if (o.verts.length > 255) overCap.push(i); });
  if (overCap.length)
    throw new Error("bone(s) " + overCap.join(",") + " exceed 255 verts after edit — " +
      "split that part onto its own bone in Blender, or decimate it");

  // ── serialize: header (32) + 88*bones + per-object tables ──
  var HEADER = 32, OBJHDR = 88;
  var tableStart = HEADER + OBJHDR * boneCount;
  // compute each object\\'s offsets in the Mint order:
  // vertsCoord, normalCoord, vertexOrder, normalOrder, uv, texName
  var cursor = tableStart, layout = [];
  objs.forEach(function(o, i){
    var L = {};
    L.vco = cursor; cursor += o.verts.length * 8;
    L.nco = cursor; cursor += o.norms.length * 8;
    L.voo = cursor; cursor += o.vorder.length * 4;
    L.noo = cursor; cursor += o.norder.length * 4;
    L.uvo = cursor; cursor += o.vorder.length * 4 * 2;
    L.tno = cursor; cursor += o.hash.length * 2;
    layout.push(L);
  });
  var out = new Uint8Array(cursor);
  var dv = new DataView(out.buffer);
  // top header: copy the original first 32 bytes (bone/object counts, bbox)
  for (var hb = 0; hb < 32; hb++) out[hb] = orig[hb];
  // ensure bone/object count reflects boneCount (unchanged)
  // per-object headers + tables
  objs.forEach(function(o, i){
    var bo = 0x20 + i * OBJHDR, L = layout[i], m = meta[i];
    // recompute object-space bbox
    var mn = [32767,32767,32767], mx = [-32768,-32768,-32768];
    o.verts.forEach(function(v){ for (var c=0;c<3;c++){ if(v[c]<mn[c])mn[c]=v[c]; if(v[c]>mx[c])mx[c]=v[c]; } });
    if (!o.verts.length){ mn=[0,0,0]; mx=[0,0,0]; }
    dv.setUint32(bo+0x00, m.bitflags, true);
    dv.setUint32(bo+0x04, o.hash.length, true);           // FaceCount
    dv.setInt32(bo+0x08, mn[0], true); dv.setInt32(bo+0x0C, mn[1], true); dv.setInt32(bo+0x10, mn[2], true);
    dv.setInt32(bo+0x14, mx[0], true); dv.setInt32(bo+0x18, mx[1], true); dv.setInt32(bo+0x1C, mx[2], true);
    dv.setInt32(bo+0x20, m.bonePos[0], true); dv.setInt32(bo+0x24, m.bonePos[1], true); dv.setInt32(bo+0x28, m.bonePos[2], true);
    dv.setInt32(bo+0x2C, m.parent, true);
    dv.setUint32(bo+0x30, m.extend, true);
    dv.setUint32(bo+0x34, o.verts.length, true);          // VertexCount
    dv.setUint32(bo+0x38, L.vco, true);                   // VertexCoordOffset
    dv.setUint32(bo+0x3C, L.voo, true);                   // VertexOrderOffset
    dv.setUint32(bo+0x40, o.norms.length, true);          // NormalVertexCount
    dv.setUint32(bo+0x44, L.nco, true);                   // NormalVertexCoordOffset
    dv.setUint32(bo+0x48, L.noo, true);                   // NormalVertexOrderOffset
    dv.setUint32(bo+0x4C, L.uvo, true);                   // UVOffset
    dv.setUint32(bo+0x50, L.tno, true);                   // TextureNameOffset
    dv.setUint32(bo+0x54, m.padding, true);
    // vertex coords (int16 x,y,z,w=-1)
    var p = L.vco;
    o.verts.forEach(function(v){ dv.setInt16(p,v[0],true); dv.setInt16(p+2,v[1],true); dv.setInt16(p+4,v[2],true); dv.setInt16(p+6,-1,true); p+=8; });
    // normal coords (×−4096, w=-1)
    p = L.nco;
    o.norms.forEach(function(nv){ dv.setInt16(p,clampI16(Math.round(nv[0]*-4096)),true); dv.setInt16(p+2,clampI16(Math.round(nv[1]*-4096)),true); dv.setInt16(p+4,clampI16(Math.round(nv[2]*-4096)),true); dv.setInt16(p+6,-1,true); p+=8; });
    // vertex order (u8×4)
    p = L.voo;
    o.vorder.forEach(function(f){ out[p]=f[0]&0xFF; out[p+1]=f[1]&0xFF; out[p+2]=f[2]&0xFF; out[p+3]=f[3]&0xFF; p+=4; });
    // normal order (u8×4)
    p = L.noo;
    o.norder.forEach(function(f){ out[p]=f[0]&0x7F; out[p+1]=f[1]&0x7F; out[p+2]=f[2]&0x7F; out[p+3]=f[3]&0x7F; p+=4; });
    // UVs (u8×2 per corner, 4 per face)
    p = L.uvo;
    o.uv.forEach(function(uv){ out[p]=uv[0]; out[p+1]=uv[1]; p+=2; });
    // texture hashes (u16 per face)
    p = L.tno;
    o.hash.forEach(function(h){ dv.setUint16(p, h, true); p+=2; });
  });

  var totalVerts = objs.reduce(function(a,o){ return a+o.verts.length; }, 0);
  var totalFaces = objs.reduce(function(a,o){ return a+o.hash.length; }, 0);
  return { bytes: out, patchedVerts: totalVerts, patchedFaces: totalFaces, reencoded: true };
}

function clamp01(x){ return x<0?0:x>1?1:x; }

// Full GLB decode → flat triangle list with per-triangle bone + material hash.
function parseGLBFull(bytes){
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a GLB");
  var total = dv.getUint32(8, true);
  // walk chunks: find JSON and BIN by type, not fixed offsets (robust to real
  // exporters that may pad or add chunks)
  var jsonBytes = null, binChunk = null, p = 12;
  while (p + 8 <= total && p + 8 <= bytes.length){
    var clen = dv.getUint32(p, true), ctype = dv.getUint32(p+4, true);
    var cstart = p + 8, cend = cstart + clen;
    if (cend > bytes.length) break;
    if (ctype === 0x4E4F534A) jsonBytes = bytes.subarray(cstart, cend);       // JSON
    else if (ctype === 0x004E4942) binChunk = bytes.subarray(cstart, cend);   // BIN
    p = cend;
  }
  if (!jsonBytes) throw new Error("GLB has no JSON chunk");
  var gltf = JSON.parse(new TextDecoder().decode(jsonBytes));
  var bin = binChunk || new Uint8Array(0);
  var COMPSIZE = { 5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 };
  function acc(ai){
    var a = gltf.accessors[ai];
    if (a.bufferView == null) throw new Error("accessor without bufferView (sparse not supported)");
    var view = gltf.bufferViews[a.bufferView];
    var baseOff = (view.byteOffset||0) + (a.byteOffset||0);
    var comp = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
    var elemSize = COMPSIZE[a.componentType] * comp;
    var stride = view.byteStride && view.byteStride > 0 ? view.byteStride : elemSize;
    var n = a.count * comp;
    var arr;
    if (a.componentType===5126) arr = new Float32Array(n);
    else if (a.componentType===5125) arr = new Uint32Array(n);
    else if (a.componentType===5123) arr = new Uint16Array(n);
    else if (a.componentType===5121 || a.componentType===5120) arr = new Uint8Array(n);
    else if (a.componentType===5122) arr = new Int16Array(n);
    else throw new Error("accessor comp "+a.componentType);
    var dvv = new DataView(bin.buffer, bin.byteOffset);
    for (var e = 0; e < a.count; e++){
      var elemOff = baseOff + e * stride;
      for (var c = 0; c < comp; c++){
        var o2 = elemOff + c * COMPSIZE[a.componentType];
        if (o2 + COMPSIZE[a.componentType] > bin.length){ arr[e*comp+c] = 0; continue; }
        if (a.componentType===5126) arr[e*comp+c] = dvv.getFloat32(o2, true);
        else if (a.componentType===5125) arr[e*comp+c] = dvv.getUint32(o2, true);
        else if (a.componentType===5123) arr[e*comp+c] = dvv.getUint16(o2, true);
        else if (a.componentType===5122) arr[e*comp+c] = dvv.getInt16(o2, true);
        else arr[e*comp+c] = dvv.getUint8(o2);
      }
    }
    return arr;
  }
  var tris = [];
  (gltf.meshes||[]).forEach(function(mesh){
    mesh.primitives.forEach(function(p){
      var hash = 0;
      if (p.material != null && gltf.materials[p.material]){
        var mat = gltf.materials[p.material];
        if (mat.extras && mat.extras.kmdTexHash != null) hash = mat.extras.kmdTexHash;
        else if (mat.name){ var mm = mat.name.split("."); var num = parseInt(mm[0],10); if(!isNaN(num)) hash = num; }
      }
      var pos = acc(p.attributes.POSITION);
      var nrm = p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null;
      var uv  = p.attributes.TEXCOORD_0 != null ? acc(p.attributes.TEXCOORD_0) : null;
      var jnt = p.attributes.JOINTS_0 != null ? acc(p.attributes.JOINTS_0) : null;
      var idx = p.indices != null ? acc(p.indices) : null;
      function vtx(vi){
        return {
          p: [pos[vi*3], pos[vi*3+1], pos[vi*3+2]],
          n: nrm ? [-nrm[vi*3], -nrm[vi*3+1], -nrm[vi*3+2]] : null,   // un-negate
          u: uv ? [uv[vi*2], uv[vi*2+1]] : null,
          bone: jnt ? jnt[vi*4] : 0
        };
      }
      if (idx){
        var q = 0;
        // Merge tri-pairs that form our exported quads: pattern per quad is
        // [B,B+1,B+2, B,B+2,B+3] with 4 sequential corners. Detect and emit a
        // quad (4 verts); otherwise emit the triangle as a degenerate quad.
        while (q < idx.length){
          if (q + 6 <= idx.length){
            var a0=idx[q],a1=idx[q+1],a2=idx[q+2],a3=idx[q+3],a4=idx[q+4],a5=idx[q+5];
            // our quad emit: (base,base+1,base+2, base,base+2,base+3)
            if (a3===a0 && a4===a2 && a5===a0+3 && a1===a0+1 && a2===a0+2){
              var c0=vtx(a0),c1=vtx(a1),c2=vtx(a2),c3=vtx(a5);
              tris.push({ bone:c0.bone, hash:hash, quad:true, v:[c0,c1,c2,c3] });
              q += 6; continue;
            }
          }
          // single triangle
          var t0=vtx(idx[q]),t1=vtx(idx[q+1]),t2=vtx(idx[q+2]);
          tris.push({ bone:t0.bone, hash:hash, quad:false, v:[t0,t1,t2] });
          q += 3;
        }
      } else {
        var triCount = pos.length/9;
        for (var ti=0; ti<triCount; ti++){
          var t0b=vtx(ti*3),t1b=vtx(ti*3+1),t2b=vtx(ti*3+2);
          tris.push({ bone:t0b.bone, hash:hash, quad:false, v:[t0b,t1b,t2b] });
        }
      }
    });
  });
  return { triangles: tris };
}

function clampI16(x){ return x < -32768 ? -32768 : x > 32767 ? 32767 : x; }
function clampU8(x){ return x < 0 ? 0 : x > 255 ? 255 : x; }

// Minimal GLB parser: returns primitives with decoded positions/uvs + texHash.
function parseGLB(bytes){
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a GLB");
  var jsonLen = dv.getUint32(12, true);
  var jsonStr = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen));
  var gltf = JSON.parse(jsonStr);
  var binOff = 20 + jsonLen + 8;   // skip BIN chunk header
  var bin = bytes.subarray(binOff);

  function accessorData(ai){
    var acc = gltf.accessors[ai];
    var view = gltf.bufferViews[acc.bufferView];
    var off = (view.byteOffset || 0) + (acc.byteOffset || 0);
    var comp = { "SCALAR":1, "VEC2":2, "VEC3":3, "VEC4":4 }[acc.type];
    var n = acc.count * comp;
    if (acc.componentType === 5126){ var f = new Float32Array(n); var dvv = new DataView(bin.buffer, bin.byteOffset + off);
      for (var i=0;i<n;i++) f[i]=dvv.getFloat32(i*4,true); return f; }
    if (acc.componentType === 5123){ var u = new Uint16Array(n); var dvw = new DataView(bin.buffer, bin.byteOffset + off);
      for (var j=0;j<n;j++) u[j]=dvw.getUint16(j*2,true); return u; }
    throw new Error("unsupported accessor component " + acc.componentType);
  }

  var prims = [];
  (gltf.meshes || []).forEach(function(mesh){
    mesh.primitives.forEach(function(p){
      var hash = 0;
      if (p.material != null && gltf.materials[p.material] && gltf.materials[p.material].extras)
        hash = gltf.materials[p.material].extras.kmdTexHash || 0;
      var positions = accessorData(p.attributes.POSITION);
      var uvs = p.attributes.TEXCOORD_0 != null ? accessorData(p.attributes.TEXCOORD_0) : null;
      // NOTE: exporter emits quads as 2 tris (0-1-2,0-2-3); the 4 unique verts
      // are the first 3 of tri1 + last of tri2. We reconstruct per-quad by
      // reading the index buffer in groups of 6 → 4 unique corners.
      var idx = accessorData(p.indices);
      var quadPos = [], quadUv = [];
      for (var q = 0; q + 6 <= idx.length; q += 6){
        // buffer corners in export order [3,2,1,0]; reverse to original [0,1,2,3]
        var bufCorners = [ idx[q], idx[q+1], idx[q+2], idx[q+5] ];
        var corners = [ bufCorners[3], bufCorners[2], bufCorners[1], bufCorners[0] ];
        corners.forEach(function(ci){
          quadPos.push(positions[ci*3], positions[ci*3+1], positions[ci*3+2]);
          if (uvs) quadUv.push(uvs[ci*2], uvs[ci*2+1]);
        });
      }
      prims.push({ texHash: hash, positions: quadPos, uvs: uvs ? quadUv : null });
    });
  });
  return { primitives: prims };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  KMD_parseBlocks: KMD_parseBlocks, KMD_toGLB: KMD_toGLB, GLB_toKMD: GLB_toKMD, parseGLB: parseGLB, parseGLBFull: parseGLBFull
};
<\/script>
<script>
// ═══════════════════════════════════════════════════════════════════════════
// swapui.js — Resident Character Swap wizard (PSX stage.dir + PC stage.mgz)
// ═══════════════════════════════════════════════════════════════════════════
// Step 1: resident stage (init auto-selected, auto-scanned) + reference KMD →
//         its textures auto-checked for removal (red).
// Step 2: donor stage + donor KMD → its textures shown and auto-checked (green).
// Step 3: plan table → Verify & swap → refreshed resident view + download.
"use strict";

var SWAPUI = { platform: null, name: "",
  psx: null /* {dir, outer} */, pc: null /* {files:[{path,data}]} */,
  stageKmds: [], donorKmds: [], refKmd: null, donorKmd: null, donorKmdObjs: [],
  donorTexes: [], residentTexes: [], plan: null, rebuilt: null };

function SWAPUI_decodePcx(data){
  try{
    var _w = (data[8] | (data[9] << 8)) + 1, _h = (data[10] | (data[11] << 8)) + 1;
    if (_w * _h > 131072) return null;   /* keep the grid snappy on huge textures */
    var bpp = data[3], planes = data[65];
    var w = (data[8] | (data[9] << 8)) + 1, h = (data[10] | (data[11] << 8)) + 1;
    var bpl = data[66] | (data[67] << 8);
    var isVga = bpp === 8 && planes === 1, isEga = bpp === 1 && planes === 4;
    if (!isVga && !isEga) return null;
    var hPal = []; for (var i = 0; i < 16; i++) hPal.push([data[16 + i * 3], data[17 + i * 3], data[18 + i * 3]]);
    var offset = 128, uLen = planes * h * bpl, dec = [];
    while (dec.length < uLen && offset < data.length){
      var b = data[offset++];
      if (b >= 192){ var cnt = b & 0x3F, val = data[offset++] || 0; for (var r = 0; r < cnt; r++) dec.push(val); }
      else dec.push(b);
    }
    var extPal = null;
    if (isVga && offset + 769 <= data.length && data[offset] === 0x0C){
      offset++; extPal = [];
      for (i = 0; i < 256; i++){ extPal.push([data[offset], data[offset + 1], data[offset + 2]]); offset += 3; }
    }
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d"), imgd = ctx.createImageData(w, h), px = imgd.data;
    if (isVga){
      var pal = extPal || hPal;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){
        var idx = dec[y * bpl + x] || 0, c = idx < pal.length ? pal[idx] : [0, 0, 0], pi = (y * w + x) * 4;
        px[pi] = c[0]; px[pi + 1] = c[1]; px[pi + 2] = c[2]; px[pi + 3] = 255;
      }
    } else {
      var ls = bpl * planes;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++){
        var bi = (x / 8) | 0, bit = x % 8, mask = 1 << (7 - bit);
        var p1 = dec[y * ls + bi] || 0, p2 = dec[y * ls + bpl + bi] || 0;
        var p3 = dec[y * ls + 2 * bpl + bi] || 0, p4 = dec[y * ls + 3 * bpl + bi] || 0;
        var ci = (((p1 & mask) >> (7 - bit))) | (((p2 & mask) >> (7 - bit)) << 1) |
                 (((p3 & mask) >> (7 - bit)) << 2) | (((p4 & mask) >> (7 - bit)) << 3);
        var c2 = ci < hPal.length ? hPal[ci] : [0, 0, 0]; pi = (y * w + x) * 4;
        px[pi] = c2[0]; px[pi + 1] = c2[1]; px[pi + 2] = c2[2]; px[pi + 3] = 255;
      }
    }
    ctx.putImageData(imgd, 0, 0);
    return cv;
  }catch(e){ return null; }
}

// ── stash hooks called from the loader ──────────────────────────────────────
function SWAPUI_stash(dirBytes, name){
  try{
    SWAPUI.platform = "psx"; SWAPUI.name = name;
    SWAPUI.psx = { dir: dirBytes, outer: psxParseOuter(dirBytes) };
    SWAPUI._stageHashes = null; SWAPUI._usedHashes = null;
    var b = document.getElementById("swapBtn"); if (b) b.style.display = "";
  }catch(e){}
}
SWAPUI._stashPCBytes = function(mgzBytes, name){
  // chain support for PC: re-open the swapped .mgz bytes as the new working file.
  // JSZip.loadAsync is async, so we mark a pending reload and let the caller
  // proceed; the loader wiring below repopulates SWAPUI.pc when done.
  try{
    if (typeof JSZip === "undefined"){ SWAPUI_log("PC chaining needs JSZip", "warn"); return; }
    JSZip.loadAsync(mgzBytes).then(function(zip){ SWAPUI_stashPC(zip, name); SWAPUI_loadResident(); });
  }catch(e){ SWAPUI_log("PC chain reload failed: " + e.message, "warn"); }
};
function SWAPUI_stashPC(zipObj, name){
  var files = [], jobs = [];
  zipObj.forEach(function(path, z){
    if (!z.dir) jobs.push(z.async("uint8array").then(function(d){
      files.push({ path: path.replace(/\\\\/g, "/"), data: d });
    }));
  });
  Promise.all(jobs).then(function(){
    SWAPUI.platform = "pc"; SWAPUI.name = name;
    SWAPUI._pcSeg = null;
    SWAPUI.pc = { files: files };
    var b = document.getElementById("swapBtn"); if (b) b.style.display = "";
  });
}

// ── platform-neutral stage access ───────────────────────────────────────────
function SWAPUI_pcSeg(){
  // Stage folders are normally at path segment 0, but a real PC stage.mgz nests
  // everything under a single top-level "stage/" wrapper (paths like
  // "stage/init_jim/res_mdl1.dar"). Detect that wrapper once and return the
  // segment index the stage NAME actually lives at (0 = flat, 1 = wrapped).
  if (SWAPUI._pcSeg != null) return SWAPUI._pcSeg;
  var tops = {}, nTop = 0;
  SWAPUI.pc.files.forEach(function(f){
    var parts = f.path.split("/");
    if (parts.length >= 2 && !tops[parts[0]]){ tops[parts[0]] = 1; nTop++; }
  });
  var seg = 0;
  if (nTop === 1){
    var secs = {}, nSec = 0;
    SWAPUI.pc.files.forEach(function(f){
      var parts = f.path.split("/");
      if (parts.length >= 3 && !secs[parts[1]]){ secs[parts[1]] = 1; nSec++; }
    });
    if (nSec > 1) seg = 1;               // single wrapper with many real stages beneath it
  }
  SWAPUI._pcSeg = seg;
  return seg;
}
function SWAPUI_pcStageOf(path){
  var parts = path.split("/"); var s = SWAPUI_pcSeg();
  return parts.length > s ? parts[s] : parts[0];
}
function SWAPUI_stageNames(){
  if (SWAPUI.platform === "psx") return SWAPUI.psx.outer.stages.map(function(s){ return s.name; });
  var seen = {}, out = [];
  SWAPUI.pc.files.forEach(function(f){
    var top = SWAPUI_pcStageOf(f.path);
    if (!seen[top]){ seen[top] = 1; out.push(top); }
  });
  return out;
}
function SWAPUI_ctx(idx){
  var names = SWAPUI_stageNames();
  if (SWAPUI.platform === "psx"){
    var s = SWAPUI.psx.outer.stages[idx];
    return { name: s.name, info: s,
      parsed: psxParseStage(SWAPUI.psx.dir.subarray(s.byteOff, s.byteOff + s.extent)) };
  }
  var name = names[idx];
  return { name: name,
    files: SWAPUI.pc.files.filter(function(f){ return SWAPUI_pcStageOf(f.path) === name; }) };
}
function SWAPUI_collect(ctx){
  return SWAPUI.platform === "psx" ? SWAP_collectTextures(ctx.parsed.entries) : SWAP_pcCollect(ctx.files);
}
function SWAPUI_kmds(ctx){
  return SWAPUI.platform === "psx" ? SWAP_listKmds(ctx.parsed.entries) : SWAP_pcListKmds(ctx.files);
}

function SWAPUI_log(msg, cls){
  var el = document.getElementById("swLog");
  var d = document.createElement("div"); if (cls) d.className = cls;
  d.textContent = msg; el.appendChild(d); el.scrollTop = 1e9;
}

// ── texture grid renderer ───────────────────────────────────────────────────
// opts: {mark: hash->("remove"|"take"|"new"), checked:Set, checkable:bool}
function SWAPUI_grid(elId, texes, opts){
  opts = opts || {};
  var grid = document.getElementById(elId); grid.innerHTML = "";
  if (!texes.length){ grid.innerHTML = '<span style="color:#567;font-size:11px;padding:6px">no textures</span>'; return; }
  texes.forEach(function(t){
    var mark = opts.mark ? opts.mark[t.hash] : null;
    var border = mark === "remove" ? "#e55" : mark === "take" ? "#5d5" : mark === "new" ? "#5ad" : "#234";
    var card = document.createElement("label");
    card.style.cssText = "width:112px;background:#0e141c;border:2px solid " + border +
      ";border-radius:5px;padding:4px;font-size:10px;color:#9ab;cursor:pointer;text-align:center;position:relative";
    if (mark){
      var badge = document.createElement("div");
      badge.textContent = mark.toUpperCase();
      badge.style.cssText = "position:absolute;top:2px;right:3px;font-size:8px;font-weight:bold;color:" + border;
      card.appendChild(badge);
    }
    var cv = SWAPUI_decodePcx(t.bytes);
    if (cv){ cv.style.cssText = "image-rendering:pixelated;max-width:100px;max-height:60px;display:block;margin:2px auto;background:#000"; card.appendChild(cv); }
    var nm = t.name ? t.name : ("0x" + t.hash.toString(16).padStart(4, "0"));
    var info = document.createElement("div");
    info.innerHTML = "<b style='color:#cde'>" + nm + "</b><br>" + t.slot.vw + "\\u00D7" + t.slot.h +
      " " + t.slot.bpp + "bpp @" + t.slot.px + "," + t.slot.py;
    card.appendChild(info);
    if (opts.checkable){
      var chk = document.createElement("input"); chk.type = "checkbox";
      chk.className = elId + "Chk"; chk.dataset.hash = t.hash;
      chk.checked = !!(opts.checked && opts.checked.has(t.hash));
      chk.style.cssText = "position:absolute;top:2px;left:3px";
      chk.onchange = function(){
        card.style.borderColor = this.checked ? (elId === "swResGrid" ? "#e55" : "#5d5") : "#234";
      };
      if (chk.checked) card.style.borderColor = elId === "swResGrid" ? "#e55" : "#5d5";
      card.appendChild(chk);
    }
    grid.appendChild(card);
  });
}
function SWAPUI_checkedHashes(elId){
  var set = new Set();
  document.querySelectorAll("." + elId + "Chk").forEach(function(c){ if (c.checked) set.add(+c.dataset.hash); });
  return set;
}

// button gating with explanatory tooltips
function SWAPUI_gate(state){
  var go = document.getElementById("swGo"), dlB = document.getElementById("swDl");
  var chB = document.getElementById("swChain");
  if (!go || !dlB) return;
  if (state === "start"){ go.disabled = true; dlB.disabled = true;
    if (chB){ chB.disabled = true; chB.title = "run \\u2714 Verify & swap first, then chain the next swap on top"; }
    go.title = "build the plan first"; dlB.title = "run Verify & swap first"; }
  else if (state === "planned"){ go.disabled = false; dlB.disabled = true;
    if (chB){ chB.disabled = true; }
    go.title = "run the swap with full verification"; dlB.title = "run Verify & swap first"; }
  else if (state === "done"){ go.disabled = true; dlB.disabled = false;
    if (chB){ chB.disabled = false; chB.title = "keep this swap and stack the next one on top \\u2014 no reload needed"; }
    go.title = "already swapped \\u2014 use \\u2795 Swap another to stack the next, or Download"; dlB.title = ""; }
}
function SWAPUI_fail(context, msgs){
  msgs.forEach(function(m){ SWAPUI_log("\\u2716 " + m, "err"); });
  alert(context + " failed:\\n\\n" + msgs.slice(0, 4).join("\\n") +
    (msgs.length > 4 ? "\\n\\u2026see the log for the rest" : ""));
}

// ── panel ───────────────────────────────────────────────────────────────────
function SWAPUI_open(){
  if (!SWAPUI.platform){ alert("Load a STAGE.DIR or stage.mgz first (drop it on the tool)."); return; }
  if (document.getElementById("swapPanel")) return;
  var names = SWAPUI_stageNames();
  var defIdx = 0, exactInit = -1;
  names.forEach(function(n, i){
    if (/^init$/i.test(n)) exactInit = i;
    else if (exactInit < 0 && /^init/i.test(n)) defIdx = i;
  });
  if (exactInit >= 0) defIdx = exactInit;
  var donIdx = -1;
  names.forEach(function(n, i){ if (donIdx < 0 && i !== defIdx) donIdx = i; });
  if (donIdx < 0) donIdx = defIdx;

  var box = function(title, color, inner){
    return '<div style="background:#0c1420;border:1px solid ' + color + ';border-radius:6px;padding:10px;margin-bottom:12px">' +
      '<div style="color:' + color + ';font-size:12px;margin-bottom:6px"><b>' + title + '</b></div>' + inner + '</div>';
  };
  var sel = 'style="background:#122;color:#cde;border:1px solid #345;border-radius:4px;padding:3px 6px"';
  var btn = function(id, label, bg, fg, bd){
    return '<button id="' + id + '" style="background:' + bg + ';color:' + fg + ';border:1px solid ' + bd +
      ';border-radius:4px;padding:5px 12px;cursor:pointer">' + label + '</button>';
  };

  var ov = document.createElement("div"); ov.id = "swapPanel";
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(4,6,10,.97);overflow:auto;padding:18px;color:#cde;font:13px/1.4 system-ui";
  ov.innerHTML =
    '<div style="max-width:1120px;margin:0 auto">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
      '<h2 style="color:#7ee787;font-size:16px;margin:0">\\uD83D\\uDD01 Resident Character Swap</h2>' +
      '<span style="color:#678;font-size:11px">' + SWAPUI.name + ' \\u00B7 ' + SWAPUI.platform.toUpperCase() + '</span>' +
      '<button id="swClose" style="margin-left:auto;background:#c26;color:#fff;border:0;border-radius:4px;padding:5px 12px;cursor:pointer">\\u2715 Close</button>' +
    '</div>' +

    box("Step 1 \\u2014 resident area \\u00B7 what comes OUT", "#e88",
      'Resident stage: <select id="swStage" ' + sel + '></select> &nbsp; ' +
      'Reference KMD(s): <select id="swRefKmd" multiple size="5" ' + sel + '></select> ' +
      'or upload <input type="file" id="swRefKmdFile" accept=".kmd" style="font-size:11px"> ' +
      '<span id="swRefInfo" style="color:#9ab;font-size:11px"></span>' +
      '<div id="swResGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-height:300px;overflow:auto;background:#0a0e14;border:1px solid #234;border-radius:6px;padding:8px"></div>' +
      '<div style="color:#789;font-size:10px;margin-top:4px">click to toggle MULTIPLE KMDs on/off (e.g. Snake + goggles + attachments) \\u2014 textures auto-check as the UNION of all their references. The <b>first selected</b> KMD is the model-swap target. Adjust checkboxes freely \\u2014 checked = removed</div>') +

    box("Step 2 \\u2014 donor stage \\u00B7 what goes IN", "#8d8",
      'Donor stage: <select id="swDonor" ' + sel + '></select> &nbsp; ' +
      'Character KMD: <select id="swDonorKmd" ' + sel + '></select> ' +
      'or upload <input type="file" id="swDonorKmdFile" accept=".kmd" style="font-size:11px"> ' +
      '<span id="swDonorInfo" style="color:#9ab;font-size:11px"></span>' +
      '<div id="swDonGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-height:300px;overflow:auto;background:#0a0e14;border:1px solid #234;border-radius:6px;padding:8px"></div>' +
      '<div style="color:#789;font-size:10px;margin-top:4px">picking a KMD auto-checks the textures it references; checked = pulled into the resident area (names/hashes kept)</div>' +
      '<label style="color:#9fd;font-size:11px;display:block;margin-top:6px"><input type="checkbox" id="swKmdSwap" checked> also swap the MODEL: the donor KMD replaces the resident KMD in place, renamed to the resident\\u2019s hash/name</label>\\n      <label style="color:#c9f;font-size:11px;display:block;margin-top:4px"><input type="checkbox" id="swPcAltModels" checked> (PC) also replace stage ALT models \\u2014 sne_wet1-5 / sne_nude / sne_bld1-2 cutscene copies get the donor KMD (covers all 9 stages incl. opening)</label>' +
      '<label style="color:#fc9;font-size:11px;display:block;margin-top:4px"><input type="checkbox" id="swAutoCatalog" checked> (PSX) automatically run the built-in catalog after the swap \\u2014 puts the character into every cutscene stage (d00a, d18a, opening, s00a, s03b/c/e, s10a, s18a)</label>') +

    box("Step 3 \\u2014 plan \\u00B7 verify \\u00B7 swap", "#8cf",
      btn("swPlan", "\\uD83D\\uDCCB Build plan", "#1d2a3a", "#9df", "#27a") + ' ' +
      btn("swGo", "\\u2714 Verify &amp; swap", "#1d3a26", "#9fd", "#2a7") + ' ' +
      btn("swChain", "\\u2795 Swap another (keep going)", "#2a1d3a", "#d9f", "#84a") + ' ' +
      btn("swDl", "\\u2B07 Download " + (SWAPUI.platform === "psx" ? "STAGE.DIR" : "stage.mgz"), "#2a2a3a", "#adf", "#66a") + ' ' +
      btn("swUndo", "\\u21B6 Undo swap", "#3a2a2a", "#fbb", "#a66") +
      '<div id="swPlanTbl" style="margin-top:8px"></div>' +
      '<canvas id="swVramViz" width="768" height="552" style="display:none;margin-top:8px;border:1px solid #234;border-radius:6px;background:#0a0e14;max-width:100%"></canvas>') +

    box("KMD \\u2192 GLB \\u00B7 export models, edit in Blender, re-import", "#8fc",
      'Stage: <select id="glbStage" ' + sel + '></select> ' +
      btn("glbList", "\\uD83D\\uDCC2 list KMDs", "#1d3a3a", "#9fd", "#2aa") +
      '<div id="glbKmdList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>' +
      '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #234">' +
      '<b style="color:#9fd;font-size:12px">Re-import an edited GLB \\u2192 KMD:</b> ' +
      'pick the ORIGINAL KMD it came from, then drop the .glb' +
      '<div id="glbDrop" style="margin-top:6px;border:2px dashed #2aa;border-radius:6px;padding:16px;text-align:center;color:#8cc;font-size:12px;background:#0a1414">drop an edited <b>.glb</b> here to rebuild its KMD</div>' +
      '<div id="glbImportInfo" style="color:#9ab;font-size:11px;margin-top:6px"></div></div>' +
      '<div style="color:#789;font-size:10px;margin-top:6px">Export bakes each KMD\\u2019s geometry + UVs + textures (from the sibling texture DAR) into a standalone .glb you can open in Blender/any glTF tool. Topology is preserved on re-import: edit vertex positions and UVs freely, but keep the face/vertex COUNT the same (don\\u2019t add/delete geometry) so it writes back cleanly.</div>') +

    '<div id="swLog" style="background:#060a10;border:1px solid #234;border-radius:6px;padding:8px;font:11px/1.5 ui-monospace,monospace;max-height:240px;overflow:auto;white-space:pre-wrap"></div>' +
    '</div>';
  document.body.appendChild(ov);
  var style = document.createElement("style");
  style.textContent = "#swapPanel .err{color:#f88}#swapPanel .ok{color:#7ee787}#swapPanel .warn{color:#fd7}" +
    "#swapPanel table{border-collapse:collapse;font-size:11px}#swapPanel td,#swapPanel th{border:1px solid #234;padding:3px 8px;color:#abc}" +
    "#swapPanel th{color:#8cf;background:#0c1420}";
  ov.appendChild(style);
  var st2 = document.createElement("style");
  st2.textContent = "#swapPanel button:disabled{opacity:.35;cursor:not-allowed}";
  ov.appendChild(st2);
  SWAPUI_gate("start");

  var stSel = document.getElementById("swStage"), dnSel = document.getElementById("swDonor");
  var glbSel = document.getElementById("glbStage");
  names.forEach(function(n, i){
    var o1 = document.createElement("option"); o1.value = i; o1.textContent = n;
    if (i === defIdx) o1.selected = true; stSel.appendChild(o1);
    var o2 = document.createElement("option"); o2.value = i; o2.textContent = n;
    if (i === donIdx) o2.selected = true; dnSel.appendChild(o2);
    if (glbSel){ var o3 = document.createElement("option"); o3.value = i; o3.textContent = n;
      if (i === defIdx) o3.selected = true; glbSel.appendChild(o3); }
  });
  if (SWAPUI.platform === "psx"){
    document.getElementById("glbList").onclick = SWAPUI_glbListKmds;
    SWAPUI_glbSetupDrop();
  } else {
    var gp = document.getElementById("glbList"); if (gp) gp.closest("div[style]") &&
      (document.getElementById("glbStage").disabled = true);
  }

  document.getElementById("swClose").onclick = function(){ ov.remove(); };
  stSel.onchange = SWAPUI_loadResident;
  dnSel.onchange = SWAPUI_loadDonor;
  var refKmdSel = document.getElementById("swRefKmd");
  function refKmdSync(){
    var idxs = Array.prototype.slice.call(refKmdSel.selectedOptions || [])
      .map(function(o){ return +o.value; }).filter(function(i){ return i >= 0; });
    SWAPUI.refKmdObjs = idxs.map(function(i){ return SWAPUI.stageKmds[i]; }).filter(Boolean);
    SWAPUI.refKmdObj = SWAPUI.refKmdObjs[0] || null;   /* first selected = model-swap target */
    SWAPUI.refKmd = SWAPUI.refKmdObj ? SWAPUI.refKmdObj.bytes : null;
    SWAPUI_applyRefKmd();
  }
  refKmdSel.onchange = refKmdSync;
  // Plain click toggles an option on/off (no ctrl/cmd needed). We intercept
  // mousedown on the <option>, flip its selected state, and prevent the
  // browser's default single-select-replace behavior.
  refKmdSel.addEventListener("mousedown", function(e){
    var opt = e.target;
    if (opt && opt.tagName === "OPTION"){
      e.preventDefault();
      opt.selected = !opt.selected;
      refKmdSel.focus();
      refKmdSync();
    }
  });
  document.getElementById("swRefKmdFile").onchange = function(){
    var f = this.files[0]; if (!f) return;
    f.arrayBuffer().then(function(ab){
      SWAPUI.refKmd = new Uint8Array(ab); SWAPUI.refKmdObj = null; SWAPUI.refKmdObjs = null;
      SWAPUI_log("reference KMD uploaded: " + f.name + " (model swap needs an in-stage KMD)", "warn");
      SWAPUI_applyRefKmd();
    });
  };
  document.getElementById("swDonorKmd").onchange = function(){
    var i = +this.value;
    SWAPUI.donorKmdObj = i >= 0 && SWAPUI.donorKmds[i] ? SWAPUI.donorKmds[i] : null;
    SWAPUI.donorKmd = SWAPUI.donorKmdObj ? SWAPUI.donorKmdObj.bytes : null;
    SWAPUI_applyDonorKmd();
  };
  document.getElementById("swDonorKmdFile").onchange = function(){
    var f = this.files[0]; if (!f) return;
    f.arrayBuffer().then(function(ab){
      SWAPUI.donorKmd = new Uint8Array(ab); SWAPUI.donorKmdObj = { bytes: new Uint8Array(ab), label: f.name };
      SWAPUI_log("donor KMD uploaded: " + f.name);
      SWAPUI_applyDonorKmd();
    });
  };
  document.getElementById("swPlan").onclick = SWAPUI_buildPlan;
  document.getElementById("swGo").onclick = SWAPUI_execute;
  document.getElementById("swDl").onclick = function(){ SWAPUI_download(); };
  document.getElementById("swUndo").onclick = function(){ SWAPUI_undo(); };
  var chainBtn = document.getElementById("swChain");
  if (chainBtn){
    chainBtn.disabled = true;   // enabled after a successful swap
    chainBtn.title = "run \\u2714 Verify & swap first, then chain the next swap on top";
    chainBtn.onclick = function(){
      if (!SWAPUI.rebuilt){ SWAPUI_log("nothing swapped yet \\u2014 run \\u2714 Verify & swap first", "err"); return; }
      // Re-load the tool's working state FROM the swapped bytes, so the next swap
      // stacks on top without re-picking the file. Character + gun etc. accumulate.
      if (SWAPUI.platform === "psx"){
        SWAPUI_stash(SWAPUI.rebuilt, SWAPUI.name);
      } else {
        if (SWAPUI._stashPCBytes){ SWAPUI._stashPCBytes(SWAPUI.rebuilt, SWAPUI.name); }
        else { SWAPUI_log("PC chaining unavailable in this build \\u2014 download and reload", "warn"); return; }
      }
      // reset per-swap UI state for a fresh pick, keep the loaded (now-swapped) DIR
      SWAPUI.plan = null; SWAPUI.rebuilt = null;
      SWAPUI.refKmdObj = null; SWAPUI.refKmdObjs = null; SWAPUI.donorKmdObj = null; SWAPUI.donorKmd = null;
      SWAPUI._afterEntries = null;
      document.getElementById("swLog").innerHTML = "";
      var go = document.getElementById("swGo"), dl = document.getElementById("swDl");
      if (go) go.disabled = true;
      chainBtn.disabled = true;
      SWAPUI_loadResident();
      SWAPUI_log("\\u2795 ready for the next swap \\u2014 the character you just swapped is baked in. Pick the next KMD (e.g. the gun) in Step 1/2, then Build plan \\u2192 Verify & swap. Download when you\\u2019re done.", "ok");
    };
  }
  var catRun = document.getElementById("swCatRun");
  var catFile = document.getElementById("swCatFile");
  if (catRun){
    if (SWAPUI.platform !== "psx"){
      catRun.disabled = true;
      catRun.title = "catalog batch is PSX STAGE.DIR only";
    } else {
      catRun.disabled = true;                       // enabled once a catalog is loaded
      catRun.title = "load a catalog .json first";
    }
    catRun.onclick = function(){ SWAPUI_runCatalog(); };
  }
  if (catFile){ catFile.onchange = function(){ SWAPUI_loadCatalog(catFile.files[0]); }; }
  if (SWAPUI.platform === "psx"){
    try{ SWAPUI_applyCatalog(SWAPUI_DEFAULT_CATALOG, "built-in"); }
    catch(e){ SWAPUI_log("built-in catalog failed: " + e.message, "warn"); }
  }
  document.getElementById("swUndo").disabled = true;
  document.getElementById("swUndo").title = "revert to the state before the last swap";
  // disabled buttons swallow clicks silently — explain via the container
  document.getElementById("swapPanel").addEventListener("click", function(e){
    var t = e.target;
    if (t.tagName === "BUTTON" && t.disabled && t.title) alert(t.title);
  }, true);

  SWAPUI_loadResident();
  SWAPUI_loadDonor();
}

// ── step 1: resident load + KMD marking ─────────────────────────────────────
function SWAPUI_loadResident(){
  try{
  var ctx = SWAPUI_ctx(+document.getElementById("swStage").value);
  SWAPUI.residentTexes = SWAPUI_collect(ctx);
  SWAPUI.stageKmds = SWAPUI_kmds(ctx);
  SWAPUI.refKmd = null; SWAPUI.refKmdObjs = null; SWAPUI.plan = null; SWAPUI.rebuilt = null;
  SWAPUI_gate("start");
  document.getElementById("swPlanTbl").innerHTML = "";
  document.getElementById("swRefInfo").textContent = "";
  var rsel = document.getElementById("swRefKmd");
  rsel.innerHTML = "";
  SWAPUI.stageKmds.forEach(function(k, ki){
    var o = document.createElement("option"); o.value = ki; o.textContent = k.label; rsel.appendChild(o);
  });
  document.getElementById("swRefInfo").textContent =
    SWAPUI.stageKmds.length + " KMD(s) \\u2014 ctrl/cmd-click for multiple";
  SWAPUI_grid("swResGrid", SWAPUI.residentTexes, { checkable: true });
  SWAPUI_log("resident \\u201C" + ctx.name + "\\u201D: " + SWAPUI.residentTexes.length +
    " textures, " + SWAPUI.stageKmds.length + " KMD(s)");
  }catch(e){ SWAPUI_fail("Resident scan", [e.message]); }
}
function SWAPUI_applyRefKmd(){
  var sources = (SWAPUI.refKmdObjs && SWAPUI.refKmdObjs.length)
    ? SWAPUI.refKmdObjs.map(function(k){ return k.bytes; })
    : (SWAPUI.refKmd ? [SWAPUI.refKmd] : []);
  if (!sources.length) return;
  var want = {}, uniq = [];
  sources.forEach(function(b){
    SWAP_kmdHashes(b).forEach(function(h){ if (!want[h]){ want[h] = 1; uniq.push(h); } });
  });
  var checked = new Set(), mark = {};
  SWAPUI.residentTexes.forEach(function(t){ if (want[t.hash]){ checked.add(t.hash); mark[t.hash] = "remove"; } });
  SWAPUI_grid("swResGrid", SWAPUI.residentTexes, { checkable: true, checked: checked, mark: mark });
  var missing = uniq.filter(function(h){ return !checked.has(h); });
  document.getElementById("swRefInfo").textContent =
    "\\u2192 " + sources.length + " KMD(s) \\u00B7 " + checked.size + "/" + uniq.length + " refs found here" +
    (missing.length ? " (" + missing.length + " load from stage packs)" : "");
  SWAPUI_log("reference model(s): auto-checked " + checked.size + " resident texture(s) for removal (union of " +
    sources.length + " KMD" + (sources.length > 1 ? "s" : "") + ")", "ok");
}

// ── step 2: donor load + KMD marking ────────────────────────────────────────
function SWAPUI_loadDonor(){
  try{
  var ctx = SWAPUI_ctx(+document.getElementById("swDonor").value);
  SWAPUI.donorCtx = ctx;
  SWAPUI.donorTexes = SWAPUI_collect(ctx);
  SWAPUI.donorKmds = SWAPUI_kmds(ctx);
  SWAPUI.donorKmd = null;
  document.getElementById("swDonorInfo").textContent = "";
  var ksel = document.getElementById("swDonorKmd");
  ksel.innerHTML = '<option value="-1">\\u2014 ' + SWAPUI.donorKmds.length + ' KMD(s) here \\u2014</option>';
  SWAPUI.donorKmds.forEach(function(k, ki){
    var o = document.createElement("option"); o.value = ki; o.textContent = k.label; ksel.appendChild(o);
  });
  SWAPUI_grid("swDonGrid", SWAPUI.donorTexes, { checkable: true });
  SWAPUI_log("donor \\u201C" + ctx.name + "\\u201D: " + SWAPUI.donorTexes.length +
    " textures, " + SWAPUI.donorKmds.length + " KMD(s)");
  }catch(e){ SWAPUI_fail("Donor scan", [e.message]); }
}
function SWAPUI_applyDonorKmd(){
  if (!SWAPUI.donorKmd) return;
  var refs = SWAP_kmdHashes(SWAPUI.donorKmd), want = {};
  refs.forEach(function(h){ want[h] = 1; });
  var checked = new Set(), mark = {};
  SWAPUI.donorTexes.forEach(function(t){ if (want[t.hash]){ checked.add(t.hash); mark[t.hash] = "take"; } });
  SWAPUI_grid("swDonGrid", SWAPUI.donorTexes, { checkable: true, checked: checked, mark: mark });
  var missing = refs.filter(function(h){ return !checked.has(h); });
  document.getElementById("swDonorInfo").textContent =
    "\\u2192 " + checked.size + "/" + refs.length + " refs found here" +
    (missing.length ? " \\u26A0 " + missing.length + " NOT in this stage" : "");
  SWAPUI_log("donor model: auto-checked " + checked.size + " texture(s) to pull in", "ok");
}

// ── step 3: plan → execute → refreshed view ─────────────────────────────────
function SWAPUI_adds(){
  var take = SWAPUI_checkedHashes("swDonGrid");
  var seen = {}, adds = [];
  SWAPUI.donorTexes.forEach(function(t){
    if (!take.has(t.hash) || seen[t.hash]) return;
    seen[t.hash] = 1;
    adds.push({ name: t.name || (t.hash.toString(16).padStart(4, "0") + ".pcx"),
                hash: t.hash, bytes: new Uint8Array(t.bytes) });
  });
  return adds;
}
function SWAPUI_buildPlan(){
  document.getElementById("swLog").innerHTML = "";
  SWAPUI.plan = null; SWAPUI.rebuilt = null;
  SWAPUI._pendingPcDistribution = null;
  SWAPUI_gate("start");
  var removeSet = SWAPUI_checkedHashes("swResGrid");
  var adds = SWAPUI_adds();
  if (!removeSet.size && !adds.length){ SWAPUI_log("nothing checked in Step 1 or Step 2", "err"); return; }
  var ctx = SWAPUI_ctx(+document.getElementById("swStage").value);
  var kmdSwap = null, kmdSwapNote = "";
  if (document.getElementById("swKmdSwap").checked){
    var rk = SWAPUI.refKmdObj, dk = SWAPUI.donorKmdObj;
    if (!rk || !dk){
      if (dk || rk) SWAPUI_log("\\u26A0 model swap skipped: needs a reference KMD picked FROM the resident stage and a donor KMD", "warn");
    } else if (SWAPUI.platform === "psx"){
      kmdSwap = { ei: rk.ei, mi: rk.kind === "dar" ? rk.mi : -1, donorBytes: dk.bytes };
      kmdSwapNote = "donor model \\u2192 replaces 0x" + rk.hash.toString(16).padStart(4, "0") + " (renamed)";
    } else {
      kmdSwap = { path: rk.path, mi: rk.kind === "pcdar" ? rk.mi : -1, donorBytes: dk.bytes };
      kmdSwapNote = "donor model \\u2192 replaces " + rk.name + " (renamed)";
    }
  }
  var palPatchEl = document.getElementById("swPalPatch");
  var swapOpts = { paletteRelocated: !!(palPatchEl && palPatchEl.checked) };

  // ── STAGE-DUPLICATE ANTI-COLLISION (PSX) ──
  // Vanilla stage packs carry copies of character textures for cutscene
  // appearances (Liquid's live inside s01a, d18a, s18a...). The engine
  // resolves textures BY HASH, so an added texture whose hash also exists
  // in a stage pack renders with the STAGE's copy in that stage (the
  // green-pants / blue-neck stage-dependent bug). Rehash colliding adds to
  // unique ids and patch the donor KMD's reference table so the player's
  // textures are unique game-wide. Vanilla cutscene characters keep their
  // own copies untouched.
  if (SWAPUI.platform === "psx" && adds.length){
    if (!SWAPUI._stageHashes){
      var sh = new Set(), uh = new Set();
      SWAPUI.psx.outer.stages.forEach(function(st){
        var texs = SWAP_collectTextures(psxParseStage(
          SWAPUI.psx.dir.subarray(st.byteOff, st.byteOff + st.extent)).entries);
        texs.forEach(function(tx){ uh.add(tx.hash); if (st.name !== ctx.info.name) sh.add(tx.hash); });
      });
      SWAPUI._stageHashes = sh; SWAPUI._usedHashes = uh;
    }
    var kmdList = [];
    if (kmdSwap && kmdSwap.donorBytes) kmdList.push(kmdSwap.donorBytes);
    if (SWAPUI.refKmdObjs) SWAPUI.refKmdObjs.forEach(function(k){ if (k.bytes) kmdList.push(k.bytes); });
    var dd = SWAP_dedupeAddHashes(adds, kmdList, SWAPUI._stageHashes, SWAPUI._usedHashes);
    if (dd.renamed.length){
      SWAPUI_log("\\u26A0 " + dd.renamed.length + " added texture(s) share hashes with STAGE packs " +
        "(vanilla characters appear in stages) — rehashed to unique ids, " + dd.refsPatched +
        " KMD reference(s) patched:", "warn");
      dd.renamed.forEach(function(r){
        SWAPUI_log("    0x" + r.from.toString(16) + " \\u2192 0x" + r.to.toString(16), "warn");
      });
    }
  }

  // ── STAGE-DUPLICATE ANTI-COLLISION (PC) ──
  // Same bug, PC container: stage packs ship cutscene copies of the character's
  // textures and the engine resolves by hash, so those stages re-register the
  // hash and the player renders the stage's art. Rename colliding adds to fresh
  // unused names and patch the donor KMD refs.
  if (SWAPUI.platform === "pc" && adds.length){
    if (!SWAPUI._pcStageHashes){
      var sets = SWAP_pcStageHashSets(SWAPUI.pc.files, ctx.name, SWAPUI_pcStageOf);
      SWAPUI._pcStageHashes = sets.stageHashes; SWAPUI._pcUsedHashes = sets.usedHashes;
    }
    var kmdListPc = [];
    if (kmdSwap && kmdSwap.donorBytes) kmdListPc.push(kmdSwap.donorBytes);
    if (SWAPUI.refKmdObjs) SWAPUI.refKmdObjs.forEach(function(k){ if (k.bytes) kmdListPc.push(k.bytes); });
    var ddp = SWAP_pcDedupeAddNames(adds, kmdListPc, SWAPUI._pcStageHashes, SWAPUI._pcUsedHashes);
    if (ddp.renamed.length){
      SWAPUI_log("\\u26A0 " + ddp.renamed.length + " added texture(s) share hashes with STAGE packs " +
        "(cutscene copies) \\u2014 renamed to unique names, " + ddp.refsPatched + " KMD ref(s) patched.", "warn");
    }
  }

  var plan = SWAPUI.platform === "psx"
    ? SWAP_plan(ctx.parsed.entries, removeSet, adds, kmdSwap, swapOpts)
    : SWAP_pcPlan(ctx.files, removeSet, adds, kmdSwap);
  plan.warnings.forEach(function(w){ SWAPUI_log("\\u26A0 " + w, "warn"); });
  if (!plan.ok){
    if (plan.overflow && SWAPUI.platform === "psx"){
      SWAPUI_overflowDialog(ctx, removeSet, adds, kmdSwap, swapOpts, plan);
      return;
    }
    if (plan.overflow && SWAPUI.platform === "pc"){
      SWAPUI_pcOverflowDialog(ctx, removeSet, adds, kmdSwap);
      return;
    }
    SWAPUI_fail("Plan", plan.errors); return;
  }
  plan.errors.forEach(function(e){ SWAPUI_log("\\u2716 " + e, "err"); });
  plan._removeSet = removeSet; plan._adds = adds; plan._ctx = ctx;
  plan._kmdSwap = kmdSwap; plan._kmdSwapNote = kmdSwapNote;
  SWAPUI.plan = plan;

  var rows = "";
  SWAPUI.residentTexes.forEach(function(t){
    if (!removeSet.has(t.hash)) return;
    rows += "<tr><td style='color:#e88'>REMOVE</td><td>" + (t.name || "0x" + t.hash.toString(16).padStart(4, "0")) +
      "</td><td>" + t.slot.vw + "\\u00D7" + t.slot.h + " " + t.slot.bpp + "bpp</td><td>@" + t.slot.px + "," + t.slot.py +
      " \\u00B7 clut " + t.slot.cx + "," + t.slot.cy + "</td><td>\\u2192 freed</td></tr>";
  });
  plan.mapping.forEach(function(m){
    rows += "<tr><td style='color:#8d8'>ADD</td><td>" + m.name + "</td><td>" + m.w + "\\u00D7" + m.h + " " + m.bpp +
      "bpp</td><td>(" + m.from.px + "," + m.from.py + ") \\u2192 <b style='color:#cde'>(" + m.to.px + "," + m.to.py +
      ")</b> \\u00B7 clut \\u2192 (" + m.to.cx + "," + m.to.cy + ")</td><td>" +
      (m.viaFreedRect ? "freed rect" : "fresh") + " / " + (m.viaFreedClut ? "freed clut" : "fresh clut") + "</td></tr>";
  });
  if (kmdSwap)
    rows += "<tr><td style='color:#8cf'>MODEL</td><td colspan='4'>" + kmdSwapNote +
      " \\u00B7 " + kmdSwap.donorBytes.length + " bytes</td></tr>";
  document.getElementById("swPlanTbl").innerHTML =
    "<table><tr><th></th><th>texture</th><th>size</th><th>placement</th><th>space</th></tr>" + rows + "</table>";
  SWAPUI_log("\\u2713 plan ready: " + removeSet.size + " out, " + plan.mapping.length + " in (" +
    plan.stats.container + "). Review the table, then Verify & swap.", "ok");
  if (SWAPUI.platform === "psx") SWAPUI_drawVramViz(removeSet, plan, swapOpts);
  SWAPUI_gate("planned");
}

// Deep snapshot of the current loaded stage (before any swap) so Undo can
// restore it byte-for-byte. Taken lazily right before the first swap applies.
function SWAPUI_snapshot(){
  if (SWAPUI._undoSnap) return;                 /* only the pre-first-swap state */
  if (SWAPUI.platform === "psx"){
    SWAPUI._undoSnap = {
      platform: "psx",
      dir: SWAPUI.psx.dir.slice(),               /* full stage.dir bytes */
      residentTexes: SWAPUI.residentTexes
    };
  } else {
    SWAPUI._undoSnap = {
      platform: "pc",
      files: SWAPUI.pc.files.map(function(f){ return { path: f.path, data: f.data.slice() }; }),
      residentTexes: SWAPUI.residentTexes
    };
  }
}

function SWAPUI_undo(){
  var s = SWAPUI._undoSnap;
  if (!s){ alert("Nothing to undo \\u2014 no swap has been applied yet."); return; }
  if (s.platform === "psx"){
    SWAPUI.psx.dir = s.dir.slice();
    SWAPUI.psx.outer = psxParseOuter(SWAPUI.psx.dir);
  } else {
    SWAPUI.pc.files = s.files.map(function(f){ return { path: f.path, data: f.data.slice() }; });
  }
  SWAPUI.rebuilt = null; SWAPUI.plan = null; SWAPUI._afterEntries = null;
  SWAPUI._undoSnap = null;
  SWAPUI_gate("start");
  document.getElementById("swUndo").disabled = true;
  document.getElementById("swPlanTbl").innerHTML = "";
  // reload the resident view from the restored bytes
  SWAPUI_loadResident();
  SWAPUI_loadDonor();
  SWAPUI_log("\\u21B6 UNDONE \\u2014 stage restored to the state before the last swap.", "ok");
}

// ── catalog batch: one donor across every listed stage in the STAGE.DIR ──────
// Load a catalog file: parse, stash, and render a tick list of its stages.
// All ticked by default; a stage named in the catalog's optional "disabled"
// array starts unticked. Nothing runs until the user clicks Run selected.
// Built-in resident-swap catalog (donor 39213 = Snake). Auto-loaded on PSX;
// uploading a catalog JSON overrides it.
var SWAPUI_DEFAULT_CATALOG = {"_comment":"Every listed stage character is REPLACED WITH the donor (39213 = Snake) via kmd-replace, keeping the member hash. In the tool, load this file then tick/untick stages in the 'Run selected' list. Names in 'disabled' start UNTICKED. Per-entry 'method' or 'donor' overrides the defaults.","resident":"init.stg","donor":39213,"disabled":[],"stages":{"d00a":[{"hash":30358,"index":5},{"hash":30356,"index":6},{"hash":30354,"index":7},{"hash":30355,"index":8},{"hash":30357,"index":9}],"d18a":[{"hash":4233,"index":9},{"hash":13506,"index":10}],"opening":[{"hash":30358,"index":9}],"s00a":[{"hash":30355,"index":6}],"s03b":[{"hash":13506,"index":10}],"s03c":[{"hash":13506,"index":8}],"s03e":[{"hash":13506,"index":6}],"s10a":[{"hash":4232,"index":10}],"s18a":[{"hash":4233,"index":10},{"hash":13506,"index":11}]}};

function SWAPUI_loadCatalog(file){
  if (SWAPUI.platform !== "psx"){
    SWAPUI_log("catalog batch is PSX STAGE.DIR only (loaded: " +
      (SWAPUI.platform ? SWAPUI.platform.toUpperCase() : "nothing") + ")", "err");
    return;
  }
  if (!file){ return; }
  file.arrayBuffer().then(function(ab){
    var cat;
    try{ cat = JSON.parse(new TextDecoder().decode(new Uint8Array(ab))); }
    catch(e){ SWAPUI_fail("Catalog parse", [e.message]); return; }
    SWAPUI_applyCatalog(cat, "from " + file.name);
  });
}

function SWAPUI_applyCatalog(cat, label){
    if (!cat.stages || typeof cat.stages !== "object"){
      SWAPUI_log('catalog has no "stages" map', "err"); return;
    }
    SWAPUI.catalog = cat;
    function strip(n){ return String(n).replace(/\\.stg$/i, ""); }
    var disabled = {}; (cat.disabled || []).forEach(function(n){ disabled[strip(n)] = true; });
    var names = Object.keys(cat.stages);
    var rows = names.map(function(rawName){
      var name = strip(rawName), n = (cat.stages[rawName] || []).length;
      return '<label style="display:inline-flex;align-items:center;gap:6px;margin:2px 16px 2px 0;font-size:12px">' +
             '<input type="checkbox" class="swCatChk" data-stage="' + name + '"' +
             (disabled[name] ? "" : " checked") + '> ' +
             name + ' <span style="color:#789">(' + n + ')</span></label>';
    }).join("");
    var header = '<div style="margin-bottom:6px">' +
      '<b style="color:#fd9">' + names.length + ' stage(s)</b> \\u00B7 tick the ones to swap \\u00B7 ' +
      '<a href="#" id="swCatAll" style="color:#8cf">all</a> / ' +
      '<a href="#" id="swCatNone" style="color:#8cf">none</a></div>';
    document.getElementById("swCatList").innerHTML = header + rows;
    document.getElementById("swCatAll").onclick  = function(e){ e.preventDefault(); SWAPUI_catSetAll(true);  };
    document.getElementById("swCatNone").onclick = function(e){ e.preventDefault(); SWAPUI_catSetAll(false); };
    document.getElementById("swCatSummary").innerHTML = "";
    var run = document.getElementById("swCatRun");
    if (run){ run.disabled = false; run.title = ""; }
    SWAPUI_log("Catalog " + (label || "loaded") + ": " + names.length +
      " stage(s), all ticked by default. Untick any to skip, then Run selected.", "ok");
}

function SWAPUI_catSetAll(v){
  var chks = document.querySelectorAll(".swCatChk");
  for (var i = 0; i < chks.length; i++) chks[i].checked = v;
}

// Run only the ticked stages.
function SWAPUI_runCatalog(){
  if (SWAPUI.platform !== "psx"){ SWAPUI_log("catalog batch is PSX STAGE.DIR only", "err"); return; }
  var cat = SWAPUI.catalog;
  if (!cat){ SWAPUI_log("load a catalog .json first", "err"); return; }
  var chks = document.querySelectorAll(".swCatChk"), selected = [];
  for (var i = 0; i < chks.length; i++) if (chks[i].checked) selected.push(chks[i].getAttribute("data-stage"));
  if (!selected.length){ SWAPUI_log("no stages ticked \\u2014 nothing to swap", "err"); return; }

  document.getElementById("swLog").innerHTML = "";
  document.getElementById("swCatSummary").innerHTML = "";
  SWAPUI_snapshot();                         /* capture pre-batch state for Undo */

  var out;
  try{ out = SWAP_runCatalogPsx(SWAPUI.psx.dir, cat, { selected: selected }); }
  catch(e){ SWAPUI_fail("Catalog run", [e.message]); return; }
  if (!out.ok){ SWAPUI_fail("Catalog run", [out.error]); return; }

  var okCount = 0, errCount = 0, missCount = 0, skipCount = 0, rows = "";
  out.summary.forEach(function(s){
    if (s.status === "skipped"){
      skipCount++;
      rows += "<tr><td>" + s.stage + "</td><td style='color:#789'>skipped</td><td>not ticked</td></tr>";
      return;
    }
    if (s.status === "missing"){
      missCount++;
      rows += "<tr><td>" + s.stage + "</td><td style='color:#fd7'>MISSING</td>" +
        "<td>not present in this STAGE.DIR \\u2014 skipped</td></tr>";
      return;
    }
    s.results.forEach(function(r){
      var good = (r.status === "kmd-replace" || r.status === "patch-char");
      if (good) okCount++; else errCount++;
      var detail = r.status === "kmd-replace"
        ? ("member #" + r.ei + " \\u2190 donor 0x" + r.donor.toString(16) +
           " \\u00B7 " + r.oldLen + "\\u2192" + r.newLen + " B")
        : r.status === "patch-char"
        ? ("deleted #" + r.ei + " \\u00B7 zeroed load in #" + r.scriptEi + " @0x" + r.off.toString(16))
        : (r.error || r.status);
      rows += "<tr><td>" + s.stage + "</td><td style='color:" + (good ? "#7ee787" : "#f88") +
        "'>0x" + r.hash.toString(16).padStart(4, "0") + " \\u00B7 " + r.status + "</td>" +
        "<td>" + detail + "</td></tr>";
    });
  });
  document.getElementById("swCatSummary").innerHTML =
    "<table><tr><th>stage</th><th>result</th><th>detail</th></tr>" + rows + "</table>";

  if (out.rebuilt.length % 2048 !== 0){
    SWAPUI_log("\\u2716 output not sector-aligned", "err"); errCount++;
  }
  if (!okCount && errCount){ SWAPUI_fail("Catalog", ["no members were swapped \\u2014 see the table"]); return; }
  if (!okCount){ SWAPUI_log("nothing swapped (all ticked stages were missing/skipped)", "warn"); return; }

  // commit the rebuilt dir into live state (further swaps/undo stack on it)
  SWAPUI.psx.dir = out.rebuilt;
  SWAPUI.psx.outer = psxParseOuter(out.rebuilt);
  SWAPUI_loadResident();                      /* refresh view (resets gate) */
  SWAPUI_loadDonor();
  SWAPUI.rebuilt = out.rebuilt;               /* set AFTER loadResident (which nulls it) */
  var ub = document.getElementById("swUndo"); if (ub) ub.disabled = false;
  SWAPUI_gate("done");

  SWAPUI_log("\\u2713 CATALOG DONE: donor 0x" + out.donor.toString(16) + " over " +
    selected.length + " ticked stage(s) \\u00B7 " + okCount + " member(s) swapped" +
    (skipCount ? ", " + skipCount + " unticked" : "") +
    (missCount ? ", " + missCount + " missing" : "") +
    (errCount ? ", " + errCount + " problem(s)" : "") +
    " \\u00B7 output " + ((out.rebuilt.length / 1048576 * 10 | 0) / 10) +
    " MB ready \\u2014 click \\u2B07 Download", errCount ? "warn" : "ok");
}

function SWAPUI_execute(){
  var plan = SWAPUI.plan;
  if (!plan){ SWAPUI_log("build the plan first", "err"); return; }
  SWAPUI_snapshot();                 /* capture pre-swap state for Undo */
  try{
    if (SWAPUI.platform === "psx"){
      // Baseline-aware verification: a previously-modded resident can carry
      // PRE-EXISTING conflicts (e.g. a texture placed over another's clut by
      // an earlier tool). Those are inherited, not caused by this swap —
      // report them, but only conflicts INTRODUCED by the plan block it.
      // (Blocking on inherited ones forced removing innocent engine/UI
      // textures just to silence the verifier, which freed poisoned slots.)
      var beforeSet = {};
      SWAP_verify(plan._ctx.parsed.entries).problems.forEach(function(p){ beforeSet[p] = 1; });
      var ver = SWAP_verify(plan.entries);
      var newProblems = ver.problems.filter(function(p){ return !beforeSet[p]; });
      ver.problems.forEach(function(p){
        if (beforeSet[p]) SWAPUI_log("\\u26A0 pre-existing (inherited from the loaded resident, " +
          "not caused by this swap): " + p, "warn");
      });
      if (newProblems.length){ SWAPUI_fail("VRAM verification (new conflicts introduced by this plan)", newProblems); return; }
      var blobs = {};
      SWAPUI.psx.outer.stages.forEach(function(s){
        blobs[s.name] = SWAPUI.psx.dir.subarray(s.byteOff, s.byteOff + s.extent);
      });
      blobs[plan._ctx.info.name] = SWAP_rebuildStage(plan._ctx.parsed.headerB64, plan.entries);

      // Option (b): if a stage distribution is pending, rebuild each edited
      // stage's DAR + stage and override its blob so the overflow textures
      // ship inside every s/d stage.
      var pd = SWAPUI._pendingDistribution ||
               (SWAPUI.plan && SWAPUI.plan._distribution ?
                 { darEdits: SWAPUI.plan._distribution.darEdits } : null);
      if (pd && pd.darEdits){
        var byStage = {};
        Object.keys(pd.darEdits).forEach(function(key){
          var slash = key.lastIndexOf("/");
          var sname = key.substring(0, slash), ei = +key.substring(slash + 1);
          (byStage[sname] = byStage[sname] || []).push({ ei: ei, items: pd.darEdits[key] });
        });
        var distCount = 0;
        Object.keys(byStage).forEach(function(sname){
          var st = SWAPUI.psx.outer.stages.filter(function(s){ return s.name === sname; })[0];
          if (!st) return;
          var parsed = psxParseStage(SWAPUI.psx.dir.subarray(st.byteOff, st.byteOff + st.extent));
          var entries = parsed.entries.map(function(e){
            return { hash: e.hash, mode: e.mode, ext: e.ext, bytes: e.data };
          });
          byStage[sname].forEach(function(edit){
            var items = edit.items.map(function(it){
              return { hash: it.hash, ext: it.ext, bytes: it.bytes };
            });
            entries[edit.ei] = { hash: entries[edit.ei].hash, mode: entries[edit.ei].mode,
              ext: entries[edit.ei].ext, bytes: psxDarBuild(items) };
          });
          blobs[sname] = SWAP_rebuildStage(parsed.headerB64, entries);
          distCount++;
        });
        SWAPUI_log("Applied overflow distribution to " + distCount + " stage(s).", "ok");
        SWAPUI._pendingDistribution = null;
      }
      var out = psxRebuildDir({ psx: { headB64: SWAPUI.psx.outer.headB64, stages: SWAPUI.psx.outer.stages } }, blobs);
      var reOuter = psxParseOuter(out);
      var reSt = reOuter.stages.filter(function(s){ return s.name === plan._ctx.info.name; })[0];
      var reParsed = psxParseStage(out.subarray(reSt.byteOff, reSt.byteOff + reSt.extent));
      SWAPUI._afterEntries = reParsed.entries;
      var _autoCat = document.getElementById('swAutoCatalog');
      if (_autoCat && _autoCat.checked && SWAPUI.catalog){
        try{
          var _catStages = Object.keys(SWAPUI.catalog.stages || {});
          var _catOut = SWAP_runCatalogPsx(out, SWAPUI.catalog, { selected: _catStages });
          if (_catOut && _catOut.ok && _catOut.rebuilt){
            out = _catOut.rebuilt;
            var _done = 0, _miss = 0;
            (_catOut.summary||[]).forEach(function(s){
              if (s.status==='missing') _miss++;
              else if (s.results) s.results.forEach(function(r){ if (r.status==='kmd-replace'||r.status==='patch-char') _done++; });
            });
            SWAPUI_log('\\u2713 auto-catalog: character written into '+_done+' cutscene member(s)'+(_miss?' ('+_miss+' stage(s) not present, skipped)':''), 'ok');
            var _reSt2 = psxParseOuter(out).stages.filter(function(s){ return s.name === plan._ctx.info.name; })[0];
            if (_reSt2){ var _rp2 = psxParseStage(out.subarray(_reSt2.byteOff, _reSt2.byteOff + _reSt2.extent)); SWAPUI._afterEntries = _rp2.entries; }
          }
        }catch(_e){ SWAPUI_log('auto-catalog skipped: '+_e.message, 'warn'); }
      }
      SWAPUI_finish(out, SWAP_collectTextures(reParsed.entries), plan);
    } else {
      var afterTexes = SWAP_pcCollect(plan.files);
      var beforeSet2 = {};
      SWAP_verifyTexes(SWAP_pcCollect(SWAPUI.pc.files.filter(function(f){
        return SWAPUI_pcStageOf(f.path) === plan._ctx.name;
      }))).problems.forEach(function(p){ beforeSet2[p] = 1; });
      var ver2 = SWAP_verifyTexes(afterTexes);
      var newProblems2 = ver2.problems.filter(function(p){ return !beforeSet2[p]; });
      ver2.problems.forEach(function(p){
        if (beforeSet2[p]) SWAPUI_log("\\u26A0 pre-existing (inherited from the loaded resident, " +
          "not caused by this swap): " + p, "warn");
      });
      if (newProblems2.length){ SWAPUI_fail("VRAM verification (new conflicts introduced by this plan)", newProblems2); return; }
      var byPath = {};
      plan.files.forEach(function(f){ byPath[f.path] = f.data; });
      // Option (b) PC: pending stage distribution overrides the ORIGINAL stage
      // DAR bytes with versions carrying the overflow textures. These paths live
      // OUTSIDE the selected resident stage, so they flow through the else-branch
      // pass-through below; we swap in the edited bytes there.
      var pcDist = SWAPUI._pendingPcDistribution ||
        (SWAPUI.plan && SWAPUI.plan._pcDistribution ?
          { fileEdits: SWAPUI.plan._pcDistribution.fileEdits } : null);
      var distEdits = (pcDist && pcDist.fileEdits) ? pcDist.fileEdits : {};
      // Stage ALT-model replacement (PC): stage-local cutscene copies of the
      // player character get the donor KMD so the new character appears there too.
      var altEdits = {}, altInfo = null;
      var altEl = document.getElementById("swPcAltModels");
      var donorKmdBytes = (plan._kmdSwap && plan._kmdSwap.donorBytes) ||
                          (SWAPUI.donorKmdObj && SWAPUI.donorKmdObj.bytes) || null;
      if (altEl && altEl.checked && donorKmdBytes){
        altInfo = SWAP_pcReplaceAltModels(SWAPUI.pc.files, donorKmdBytes, null, SWAPUI_pcStageOf);
        altEdits = altInfo.fileEdits;
      }
      var stageName = plan._ctx.name;
      var zip = new JSZip();
      var placedPaths = {};
      SWAPUI.pc.files.forEach(function(f){
        if (SWAPUI_pcStageOf(f.path) === stageName){
          if (byPath[f.path]){ zip.file(f.path, byPath[f.path]); placedPaths[f.path] = 1; }
          /* paths absent from plan.files were removed (loose deletions) */
        } else if (distEdits[f.path]){
          zip.file(f.path, distEdits[f.path]); placedPaths[f.path] = 1;   /* overflow-edited stage DAR */
        } else if (altEdits[f.path]){
          zip.file(f.path, altEdits[f.path]); placedPaths[f.path] = 1;    /* alt-model-replaced stage DAR */
        } else zip.file(f.path, f.data);
      });
      plan.files.forEach(function(f){ if (!placedPaths[f.path]) zip.file(f.path, f.data); });
      var distN = Object.keys(distEdits).length;
      if (distN){ SWAPUI_log("Applied overflow distribution to " + distN + " stage DAR(s).", "ok"); }
      if (altInfo && altInfo.replaced){
        SWAPUI_log("Replaced " + altInfo.replaced + " stage ALT model(s) across " +
          altInfo.stages.length + " stage(s): " + Object.keys(altInfo.which).join(", "), "ok");
      }
      SWAPUI._pendingPcDistribution = null;
      SWAPUI._afterFiles = plan.files.map(function(f){ return { path: f.path, data: f.data }; });
      zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }).then(function(u8){
        SWAPUI_finish(u8, afterTexes, plan);
      });
    }
  }catch(e){ SWAPUI_fail("Swap", [e.message]); }
}

function SWAPUI_download(){
  if (!SWAPUI.rebuilt){
    alert("Nothing to download yet \\u2014 run \\u2714 Verify & swap first (after \\uD83D\\uDCCB Build plan).");
    return;
  }
  try{
    var out = SWAPUI.name.replace(/\\.(dir|mgz)$/i, "") + "_swapped." +
      (SWAPUI.platform === "psx" ? "dir" : "mgz");
    var blob = new Blob([SWAPUI.rebuilt], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = out;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ a.remove(); }, 0);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
    // always leave a manual path in the log in case the browser blocked it
    var el = document.getElementById("swLog");
    var d = document.createElement("div");
    d.innerHTML = '\\u2B07 download triggered (' + ((SWAPUI.rebuilt.length / 1048576 * 10 | 0) / 10) +
      ' MB) \\u2014 if nothing arrived, <a href="' + url + '" download="' + out +
      '" style="color:#8cf">click here to save ' + out + '</a>';
    el.appendChild(d); el.scrollTop = 1e9;
  }catch(e){ alert("Download failed: " + e.message); }
}

function SWAPUI_finish(outBytes, afterTexes, plan){
  var bad = false, have = {}, addHash = {};
  afterTexes.forEach(function(t){ have[t.hash] = 1; });
  plan._adds.forEach(function(a){ addHash[a.hash] = 1; });
  plan._removeSet.forEach(function(h){
    if (!have[h]) return;
    if (addHash[h]){
      /* removed AND re-added under the same hash = replaced in place —
         the donor's version now lives where the resident's was. Correct. */
      SWAPUI_log("\\u2713 post-check: 0x" + h.toString(16) + " replaced in place (removed + re-added)", "ok");
      return;
    }
    SWAPUI_log("\\u2716 post-check: removed 0x" + h.toString(16) + " still present!", "err"); bad = true;
  });
  plan._adds.forEach(function(a){
    if (!have[a.hash]){ SWAPUI_log("\\u2716 post-check: added " + a.name + " missing!", "err"); bad = true; }
  });
  if (SWAPUI.platform === "psx" && outBytes.length % 2048 !== 0){
    SWAPUI_log("\\u2716 post-check: output not sector-aligned", "err"); bad = true;
  }
  if (plan._kmdSwap){
    var rk = SWAPUI.refKmdObj, kOk = false;
    var kmds = SWAPUI.platform === "psx"
      ? SWAP_listKmds(SWAPUI._afterEntries || []) : SWAP_pcListKmds(plan.files);
    kmds.forEach(function(k){
      var idMatch = SWAPUI.platform === "psx" ? (k.hash === rk.hash) : (k.name === rk.name);
      if (idMatch && k.bytes.length === plan._kmdSwap.donorBytes.length) kOk = true;
    });
    if (kOk) SWAPUI_log("\\u2713 model swapped: donor KMD now lives under the resident identity", "ok");
    else { SWAPUI_log("\\u2716 post-check: swapped KMD not found under the resident identity", "err"); bad = true; }
  }
  if (bad) return;

  var mark = {};
  plan._adds.forEach(function(a){ mark[a.hash] = "new"; });
  SWAPUI.residentTexes = afterTexes;
  SWAPUI_grid("swResGrid", afterTexes, { checkable: true, mark: mark });
  // commit the swapped bytes into live state so further swaps stack and the
  // resident/donor rescans see the new content
  if (SWAPUI.platform === "psx"){
    SWAPUI.psx.dir = outBytes;
    SWAPUI.psx.outer = psxParseOuter(outBytes);
  } else if (SWAPUI._afterFiles){
    SWAPUI.pc.files = SWAPUI._afterFiles;
  }
  var ub = document.getElementById("swUndo");
  if (ub){ ub.disabled = false; }
  SWAPUI_log("\\u2713 SWAP VERIFIED: " + plan._removeSet.size + " out, " + plan._adds.length +
    " in \\u00B7 zero VRAM conflicts across " + afterTexes.length +
    " textures \\u00B7 output " + ((outBytes.length / 1048576 * 10 | 0) / 10) +
    " MB ready \\u2014 click \\u2B07 Download", "ok");
  SWAPUI.rebuilt = outBytes;
  SWAPUI_gate("done");
}

// header button
document.addEventListener("DOMContentLoaded", function(){
  var pick = document.getElementById("pick");
  if (!pick) return;
  var x = document.createElement("button");
  x.className = "btn"; x.id = "extractBtn"; x.textContent = "\\uD83D\\uDCE6 Extract zip";
  x.style.display = "none";
  x.onclick = function(){ if (window.PENDING_EXTRACT) window.PENDING_EXTRACT(); };
  pick.parentNode.insertBefore(x, pick.nextSibling);
  var b = document.createElement("button");
  b.className = "btn"; b.id = "swapBtn"; b.textContent = "\\uD83D\\uDD01 Resident swap";
  b.style.display = "none"; b.onclick = SWAPUI_open;
  pick.parentNode.insertBefore(b, x.nextSibling);
});


// ── VRAM visualizer ──────────────────────────────────────────────────────────
// Draws the resident (init) VRAM region x640-1024 y0-256 at 2x after a plan,
// rendering the ACTUAL pixel content of kept textures and planned adds, with
// a magnified inspect popup on hover (like the Stage Editor VRAM viewer).
function SWAPUI_texBitmap(bytes){
  var dec = typeof SWAP_pcxDecodeIndices === "function" ? SWAP_pcxDecodeIndices(bytes) : null;
  var w, h, i, cv, g, img, o;
  if (dec){                                          /* 4bpp EGA */
    w = dec.w; h = dec.h;
    cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    g = cv.getContext("2d"); img = g.createImageData(w, h);
    var pal = [];
    for (i = 0; i < 16; i++){
      var r = bytes[16 + i * 3], gg = bytes[17 + i * 3], b = bytes[18 + i * 3];
      pal.push([r, gg, b, (r === 0 && gg === 0 && b === 0) ? 0 : 255]);  /* exact black = transparent */
    }
    for (i = 0; i < w * h; i++){
      var c = pal[dec.px[i]]; o = i * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  // 8bpp VGA: single plane, palette in 769-byte trailer starting 0x0C
  if (bytes && bytes.length > 900 && bytes[0] === 10 && bytes[3] === 8 && bytes[65] === 1){
    w = (bytes[8] | (bytes[9] << 8)) - (bytes[4] | (bytes[5] << 8)) + 1;
    h = (bytes[10] | (bytes[11] << 8)) - (bytes[6] | (bytes[7] << 8)) + 1;
    var bpl = bytes[66] | (bytes[67] << 8);
    if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return null;
    var pi = bytes.length - 769;
    if (bytes[pi] !== 0x0C) return null;
    var buf = new Uint8Array(bpl * h), p = 128; o = 0;
    while (o < buf.length && p < pi){
      var bb = bytes[p++];
      if ((bb & 0xC0) === 0xC0){ var n = bb & 0x3F, v = bytes[p++]; while (n-- && o < buf.length) buf[o++] = v; }
      else buf[o++] = bb;
    }
    cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    g = cv.getContext("2d"); img = g.createImageData(w, h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){
      var idx = buf[y * bpl + x], po = pi + 1 + idx * 3;
      o = (y * w + x) * 4;
      var r2 = bytes[po], g2 = bytes[po + 1], b2 = bytes[po + 2];
      img.data[o] = r2; img.data[o + 1] = g2; img.data[o + 2] = b2;
      img.data[o + 3] = (r2 === 0 && g2 === 0 && b2 === 0) ? 0 : 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  return null;
}

function SWAPUI_vizPopup(){
  var d = document.getElementById("swVizPop");
  if (!d){
    d = document.createElement("div");
    d.id = "swVizPop";
    d.style.cssText = "position:fixed;display:none;z-index:9999;pointer-events:none;" +
      "background:#0d1420;border:1px solid #37a;border-radius:6px;padding:8px;" +
      "font:11px monospace;color:#cde;box-shadow:0 4px 16px rgba(0,0,0,0.6)";
    document.body.appendChild(d);
  }
  return d;
}

function SWAPUI_drawVramViz(removeSet, plan, opts){
  var cv = document.getElementById("swVramViz");
  if (!cv) return;
  var g = cv.getContext("2d");
  var X0 = 640, S = 2;
  function rx(px){ return (px - X0) * S; }
  function rect(px, py, w, h, fill, stroke, dash){
    if (fill){ g.fillStyle = fill; g.fillRect(rx(px), py * S, w * S, h * S); }
    if (stroke){
      g.strokeStyle = stroke; g.lineWidth = 1; g.setLineDash(dash || []);
      g.strokeRect(rx(px) + 0.5, py * S + 0.5, w * S - 1, h * S - 1);
      g.setLineDash([]);
    }
  }
  function hatch(px, py, w, h, color){
    g.save(); g.beginPath(); g.rect(rx(px), py * S, w * S, h * S); g.clip();
    g.strokeStyle = color; g.lineWidth = 1;
    for (var d = -h * S; d < w * S; d += 8){
      g.beginPath(); g.moveTo(rx(px) + d, py * S); g.lineTo(rx(px) + d + h * S, (py + h) * S); g.stroke();
    }
    g.restore();
    rect(px, py, w, h, null, color);
  }
  cv.style.display = "block";
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#0a0e14"; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = "#182230"; g.lineWidth = 1;
  for (var gx = 640; gx <= 1024; gx += 64){ g.beginPath(); g.moveTo(rx(gx) + 0.5, 0); g.lineTo(rx(gx) + 0.5, 512); g.stroke(); }
  for (var gy = 0; gy <= 256; gy += 64){ g.beginPath(); g.moveTo(0, gy * S + 0.5); g.lineTo(768, gy * S + 0.5); g.stroke(); }

  hatch(960, 0, 64, 256, "#445");
  var kept = SWAPUI.residentTexes.filter(function(t){ return !removeSet.has(t.hash); });
  var below = 0, at240 = 0;
  kept.forEach(function(t){ var cy = t.slot.cy;
    if (cy >= 200 && cy < 240) below++; else if (cy >= 240) at240++; });
  var integral = below > at240;
  if (integral){
    if (opts && opts.paletteRelocated){
      hatch(768, 226, 192, 14, "#a33");
      rect(768, 196, 192, 30, "rgba(60,120,60,0.12)", "#3a3");
    } else hatch(768, 196, 192, 44, "#a33");
  }

  // build item list for drawing + hover hit-testing (topmost last)
  var addBytes = {};
  (plan._adds || []).forEach(function(f){ addBytes[f.name] = f.bytes; });
  var items = [];
  SWAPUI.residentTexes.forEach(function(t){
    if (!removeSet.has(t.hash)) return;
    var s = t.slot;
    items.push({ kind: "freed", name: t.name || ("0x" + t.hash.toString(16).padStart(4, "0")),
      px: s.px, py: s.py, w: s.vw, h: s.h, cx: s.cx, cy: s.cy, bpp: s.bpp, bytes: t.bytes });
  });
  kept.forEach(function(t){
    var s = t.slot;
    items.push({ kind: "kept", name: t.name || ("0x" + t.hash.toString(16).padStart(4, "0")),
      px: s.px, py: s.py, w: s.vw, h: s.h, cx: s.cx, cy: s.cy, bpp: s.bpp, bytes: t.bytes });
  });
  plan.mapping.forEach(function(m){
    items.push({ kind: "add", name: m.name,
      px: m.to.px, py: m.to.py, w: m.w, h: m.h, cx: m.to.cx, cy: m.to.cy, bpp: m.bpp,
      bytes: addBytes[m.name] || null, from: m.from });
  });

  // draw: freed outlines, then kept pixels, then add pixels
  items.forEach(function(it){
    if (it.kind !== "freed") return;
    rect(it.px, it.py, it.w, it.h, null, "#e88", [3, 2]);
  });
  items.forEach(function(it){
    if (it.kind === "freed") return;
    var bmp = it.bytes ? (it._bmp = it._bmp || SWAPUI_texBitmap(it.bytes)) : null;
    if (bmp) g.drawImage(bmp, rx(it.px), it.py * S, it.w * S, it.h * S);
    else rect(it.px, it.py, it.w, it.h, it.kind === "add" ? "rgba(230,150,50,0.55)" : "rgba(60,160,90,0.35)", null);
    rect(it.px, it.py, it.w, it.h, null, it.kind === "add" ? "#fb6" : "rgba(70,200,120,0.6)");
  });
  // clut ticks
  items.forEach(function(it){
    if (it.kind === "freed") return;
    rect(it.cx, it.cy, it.kind === "add" ? 16 : (it.bpp === 4 ? 16 : 256), 1,
      it.kind === "add" ? "#4de" : "#c5c", null);
  });

  var ly = 520;
  function key(x, color, label, outlineOnly){
    if (outlineOnly){ g.strokeStyle = color; g.setLineDash([3, 2]); g.strokeRect(x + 0.5, ly + 0.5, 10, 10); g.setLineDash([]); }
    else { g.fillStyle = color; g.fillRect(x, ly, 11, 11); }
    g.fillStyle = "#9ab"; g.font = "10px monospace"; g.fillText(label, x + 15, ly + 9);
  }
  key(6, "rgba(60,160,90,0.8)", "kept"); key(70, "#e88", "freed", true);
  key(140, "rgba(230,150,50,0.9)", "add"); key(196, "#c5c", "kept clut");
  key(290, "#4de", "add clut"); key(380, "#a33", "engine-blocked");
  g.fillStyle = "#678"; g.fillText("hover a texture to inspect", 540, ly + 9);

  // hover popup (attach once)
  SWAPUI._vizItems = items;
  if (!SWAPUI._vizHover){
    SWAPUI._vizHover = true;
    cv.addEventListener("mousemove", function(ev){
      var b = cv.getBoundingClientRect();
      var mx = (ev.clientX - b.left) * (cv.width / b.width);
      var my = (ev.clientY - b.top) * (cv.height / b.height);
      var vx = mx / S + X0, vy = my / S;                  /* VRAM coords */
      var list = SWAPUI._vizItems || [], hit = null;
      for (var i = list.length - 1; i >= 0; i--){          /* topmost first */
        var it = list[i];
        if (vx >= it.px && vx < it.px + it.w && vy >= it.py && vy < it.py + it.h){ hit = it; break; }
      }
      var pop = SWAPUI_vizPopup();
      if (!hit){ pop.style.display = "none"; return; }
      if (pop._for !== hit){
        pop._for = hit;
        var tag = hit.kind === "add" ? "#fb6" : hit.kind === "freed" ? "#e88" : "#8e8";
        var kindTxt = hit.kind === "add" ? "ADD (incoming)" : hit.kind === "freed" ? "REMOVED (freed)" : "KEPT resident";
        pop.innerHTML = "<div style='color:" + tag + ";font-weight:bold'>" + hit.name + " \\u2014 " + kindTxt + "</div>" +
          "<div style='color:#9ab;margin:2px 0'>" + hit.w + "\\u00D7" + hit.h + " halfwords \\u00B7 " + (hit.bpp || 4) + "bpp \\u00B7 @" +
          hit.px + "," + hit.py + " \\u00B7 clut " + hit.cx + "," + hit.cy +
          (hit.from ? " \\u00B7 donor pos " + hit.from.px + "," + hit.from.py : "") + "</div>";
        var bmp = hit.bytes ? (hit._bmp = hit._bmp || SWAPUI_texBitmap(hit.bytes)) : null;
        if (bmp){
          var z = Math.max(1, Math.min(6, Math.floor(180 / Math.max(bmp.width, bmp.height))));
          var big = document.createElement("canvas");
          big.width = bmp.width * z; big.height = bmp.height * z;
          big.style.cssText = "display:block;margin-top:4px;background:" +
            "repeating-conic-gradient(#1a2230 0 25%,#141a26 0 50%) 0 0/12px 12px;border:1px solid #345";
          var bg = big.getContext("2d");
          bg.imageSmoothingEnabled = false;
          bg.drawImage(bmp, 0, 0, big.width, big.height);
          pop.appendChild(big);
        } else {
          pop.innerHTML += "<div style='color:#678'>(preview unavailable for this format)</div>";
        }
      }
      var px2 = ev.clientX + 16, py2 = ev.clientY + 16;
      if (px2 + 220 > window.innerWidth)  px2 = ev.clientX - 236;
      if (py2 + 260 > window.innerHeight) py2 = ev.clientY - 260;
      pop.style.left = px2 + "px"; pop.style.top = py2 + "px";
      pop.style.display = "block";
    });
    cv.addEventListener("mouseleave", function(){ SWAPUI_vizPopup().style.display = "none"; });
  }
}

// ── Resident-fit overflow dialog (PSX) ──────────────────────────────────────
// Shown when a swap's textures don't fit the resident area. Two paths:
//   (a) recommend deletions (protecting global props) so it fits resident;
//   (b) opt-in: distribute the overflow textures into every s/d stage DAR.
function SWAPUI_overflowDialog(ctx, removeSet, adds, kmdSwap, swapOpts, failedPlan){
  // which resident textures does the NEW model still need? (never suggest those)
  var keepHashes = {};
  if (SWAPUI.refKmdObjs && SWAPUI.refKmdObjs.length){
    SWAPUI.refKmdObjs.forEach(function(k){
      SWAP_kmdHashes(k.bytes).forEach(function(h){ keepHashes[h] = 1; });
    });
  }
  var rec = SWAP_recommendDeletions(SWAPUI.residentTexes, keepHashes, 0);

  var host = document.getElementById("swLog");
  var box = document.createElement("div");
  box.style.cssText = "background:#1a1206;border:1px solid #b80;border-radius:6px;padding:12px;margin:8px 0";
  var recList = rec.recommended.slice(0, 12).map(function(c){
    return "0x" + c.hash.toString(16).padStart(4,"0") + " (" + Math.round(c.bytes) + "px)";
  }).join(", ");
  box.innerHTML =
    "<div style='color:#fd8;font-weight:bold;margin-bottom:6px'>\\u26A0 Doesn't fit the resident area</div>" +
    "<div style='color:#dca;font-size:12px;margin-bottom:10px'>The new character's textures need more room than the freed space provides. Pick how to proceed:</div>" +
    "<div style='margin-bottom:8px'><button id='swOvA' style='background:#243;border:1px solid #6a6;color:#dfd;padding:6px 10px;border-radius:4px;cursor:pointer'>a) Free resident room</button> " +
    "<span style='color:#9b9;font-size:11px'>auto-selects the largest non-global textures to delete (protects box, codec, ration, HUD\\u2026)</span></div>" +
    "<div style='color:#ac9;font-size:11px;margin:0 0 10px 14px'>would remove: " + (recList || "(nothing deletable found)") + "</div>" +
    "<div><button id='swOvB' style='background:#332145;border:1px solid #96c;color:#ecd;padding:6px 10px;border-radius:4px;cursor:pointer'>b) Push overflow into every stage</button> " +
    "<span style='color:#b9c;font-size:11px'><b>EXPERIMENTAL</b> \\u2014 packs the extra textures into each s/d stage's DAR instead of deleting anything. Bigger file, slower, only correct for stages that load this model.</span></div>";
  host.appendChild(box);
  host.scrollTop = host.scrollHeight;

  document.getElementById("swOvA").onclick = function(){
    box.remove();
    // tick the recommended hashes in the Step-1 grid, then rebuild
    var recSet = {};
    rec.recommended.forEach(function(c){ recSet[c.hash] = 1; });
    document.querySelectorAll(".swResGridChk").forEach(function(cb){
      if (recSet[+cb.dataset.hash]){
        cb.checked = true;
        if (cb.onchange) cb.onchange();   /* repaint the card border */
      }
    });
    SWAPUI_log("Auto-selected " + rec.recommended.length + " global-safe texture(s) to delete. Rebuilding plan\\u2026", "ok");
    SWAPUI_buildPlan();
  };

  document.getElementById("swOvB").onclick = function(){
    box.remove();
    if (!confirm("EXPERIMENTAL: push overflow textures into EVERY s/d stage.\\n\\n" +
      "This edits many stages, makes the STAGE.DIR larger, and only renders correctly " +
      "in stages that actually load this character. Continue?")) return;
    SWAPUI_runStageDistribution(ctx, removeSet, adds, kmdSwap, swapOpts);
  };
}

// ── PC overflow dialog (parallel to SWAPUI_overflowDialog, PC container) ──
function SWAPUI_pcOverflowDialog(ctx, removeSet, adds, kmdSwap){
  var keepHashes = {};
  if (SWAPUI.refKmdObjs && SWAPUI.refKmdObjs.length){
    SWAPUI.refKmdObjs.forEach(function(k){
      SWAP_kmdHashes(k.bytes).forEach(function(h){ keepHashes[h] = 1; });
    });
  }
  var rec = SWAP_recommendDeletions(SWAPUI.residentTexes, keepHashes, 0);

  var host = document.getElementById("swLog");
  var box = document.createElement("div");
  box.style.cssText = "background:#1a1206;border:1px solid #b80;border-radius:6px;padding:12px;margin:8px 0";
  var recList = rec.recommended.slice(0, 12).map(function(c){
    return (c.name ? c.name : "0x" + c.hash.toString(16).padStart(4,"0")) + " (" + Math.round(c.bytes) + "px)";
  }).join(", ");
  box.innerHTML =
    "<div style='color:#fd8;font-weight:bold;margin-bottom:6px'>\\u26A0 Doesn't fit the resident area (PC)</div>" +
    "<div style='color:#dca;font-size:12px;margin-bottom:10px'>The new character's textures need more room than the freed space provides. Pick how to proceed:</div>" +
    "<div style='margin-bottom:8px'><button id='swPcOvA' style='background:#243;border:1px solid #6a6;color:#dfd;padding:6px 10px;border-radius:4px;cursor:pointer'>a) Free resident room</button> " +
    "<span style='color:#9b9;font-size:11px'>auto-selects the largest non-global textures to delete (protects box, codec, ration, HUD\\u2026)</span></div>" +
    "<div style='color:#ac9;font-size:11px;margin:0 0 10px 14px'>would remove: " + (recList || "(nothing deletable found)") + "</div>" +
    "<div><button id='swPcOvB' style='background:#332145;border:1px solid #96c;color:#ecd;padding:6px 10px;border-radius:4px;cursor:pointer'>b) Push overflow into every stage</button> " +
    "<span style='color:#b9c;font-size:11px'><b>EXPERIMENTAL</b> \\u2014 packs the extra textures into each s/d stage's DAR instead of deleting anything. Bigger file, slower, only correct for stages that load this model.</span></div>";
  host.appendChild(box);
  host.scrollTop = host.scrollHeight;

  document.getElementById("swPcOvA").onclick = function(){
    box.remove();
    var recSet = {};
    rec.recommended.forEach(function(c){ recSet[c.hash] = 1; });
    document.querySelectorAll(".swResGridChk").forEach(function(cb){
      if (recSet[+cb.dataset.hash]){
        cb.checked = true;
        if (cb.onchange) cb.onchange();
      }
    });
    SWAPUI_log("Auto-selected " + rec.recommended.length + " global-safe texture(s) to delete. Rebuilding plan\\u2026", "ok");
    SWAPUI_buildPlan();
  };

  document.getElementById("swPcOvB").onclick = function(){
    box.remove();
    if (!confirm("EXPERIMENTAL: push overflow textures into EVERY s/d stage.\\n\\n" +
      "This edits many stages, makes stage.mgz larger, and only renders correctly " +
      "in stages that actually load this character. Continue?")) return;
    SWAPUI_pcRunStageDistribution(ctx, removeSet, adds, kmdSwap);
  };
}

function SWAPUI_runStageDistribution(ctx, removeSet, adds, kmdSwap, swapOpts){
  SWAPUI_log("Building the resident-fit remainder\\u2026", "ok");
  // First, place as many adds as DO fit resident; the rest are the overflow.
  // Re-run place with a flag capturing which adds failed.
  var kept = SWAPUI.residentTexes.filter(function(t){ return !removeSet.has(t.hash); });
  var removed = SWAPUI.residentTexes.filter(function(t){ return removeSet.has(t.hash); });
  var placed = SWAP_place(kept, removed, adds, swapOpts);
  var fitHashes = {};
  placed.mapping.forEach(function(m){ fitHashes[m.hash] = 1; });
  var overflow = adds.filter(function(a){ return !fitHashes[a.hash]; });
  if (!overflow.length){
    SWAPUI_log("Everything fit resident after all \\u2014 no distribution needed. Rebuilding.", "ok");
    SWAPUI_buildPlan(); return;
  }
  SWAPUI_log(overflow.length + " texture(s) overflow to stages: " +
    overflow.map(function(o){ return "0x" + o.hash.toString(16); }).join(", "), "warn");

  // Parse every stage once
  var outerParsed = {};
  SWAPUI.psx.outer.stages.forEach(function(st){
    outerParsed[st.name] = psxParseStage(
      SWAPUI.psx.dir.subarray(st.byteOff, st.byteOff + st.extent));
  });
  var dist = SWAP_distributeToStages(outerParsed, overflow, function(m,l){ SWAPUI_log(m,l); });
  var totalStages = dist.stages.filter(function(s){ return s.added > 0; }).length;
  SWAPUI_log("Distribution: overflow packed into " + totalStages + " stage(s).", "ok");
  dist.stages.forEach(function(s){
    if (s.skipped) SWAPUI_log("  " + s.name + ": " + s.added + " added, " + s.skipped + " skipped" +
      (s.note ? " (" + s.note + ")" : ""), s.skipped ? "warn" : "ok");
  });

  // Build a REAL resident plan of the FITTING adds only (these are known to
  // fit, so this plan succeeds), attach the stage distribution, set it as the
  // active plan, and render the table — same as a normal Build plan so Verify
  // & swap has a plan to execute.
  var fittingAdds = adds.filter(function(a){ return fitHashes[a.hash]; });
  var plan = SWAP_plan(ctx.parsed.entries, removeSet, fittingAdds, kmdSwap, swapOpts);
  plan.warnings.forEach(function(w){ SWAPUI_log("\\u26A0 " + w, "warn"); });
  if (!plan.ok){
    SWAPUI_fail("Resident-remainder plan unexpectedly failed", plan.errors);
    return;
  }
  plan._removeSet = removeSet; plan._adds = fittingAdds; plan._ctx = ctx;
  plan._kmdSwap = kmdSwap; plan._kmdSwapNote = "";
  plan._distribution = { overflow: overflow, darEdits: dist.darEdits };
  SWAPUI.plan = plan;
  SWAPUI._pendingDistribution = { removeSet: removeSet, fittingAdds: fittingAdds,
    overflow: overflow, darEdits: dist.darEdits, kmdSwap: kmdSwap, swapOpts: swapOpts, ctx: ctx };

  // render the plan table (resident rows + a distribution summary row)
  var rows = "";
  SWAPUI.residentTexes.forEach(function(t){
    if (!removeSet.has(t.hash)) return;
    rows += "<tr><td style='color:#e88'>REMOVE</td><td>" + (t.name || "0x" + t.hash.toString(16).padStart(4, "0")) +
      "</td><td>" + t.slot.vw + "\\u00D7" + t.slot.h + " " + t.slot.bpp + "bpp</td><td>@" + t.slot.px + "," + t.slot.py +
      " \\u00B7 clut " + t.slot.cx + "," + t.slot.cy + "</td><td>\\u2192 freed</td></tr>";
  });
  plan.mapping.forEach(function(m){
    rows += "<tr><td style='color:#8d8'>ADD</td><td>" + m.name + "</td><td>" + m.w + "\\u00D7" + m.h + " " + m.bpp +
      "bpp</td><td>(" + m.from.px + "," + m.from.py + ") \\u2192 <b style='color:#cde'>(" + m.to.px + "," + m.to.py +
      ")</b> \\u00B7 clut \\u2192 (" + m.to.cx + "," + m.to.cy + ")</td><td>resident</td></tr>";
  });
  overflow.forEach(function(o){
    rows += "<tr><td style='color:#c9f'>STAGES</td><td>" + (o.name || "0x" + o.hash.toString(16)) +
      "</td><td>overflow</td><td colspan='1'>packed into " + totalStages + " s/d stage DAR(s)</td>" +
      "<td style='color:#b9c'>distributed</td></tr>";
  });
  document.getElementById("swPlanTbl").innerHTML =
    "<table><tr><th></th><th>texture</th><th>size</th><th>placement</th><th>space</th></tr>" + rows + "</table>";
  SWAPUI_log("\\u2713 plan ready (experimental distribution): " + removeSet.size + " out, " +
    plan.mapping.length + " resident, " + overflow.length + " into " + totalStages +
    " stages. Test the model in several stages after swapping. Verify & swap to apply.", "ok");
  if (SWAPUI.platform === "psx") SWAPUI_drawVramViz(removeSet, plan, swapOpts);
  SWAPUI_gate("planned");
}

// ── PC counterpart of SWAPUI_runStageDistribution (option b, PC container) ──
function SWAPUI_pcRunStageDistribution(ctx, removeSet, adds, kmdSwap){
  SWAPUI_log("Building the resident-fit remainder\\u2026", "ok");
  // Recompute which adds fit resident; the rest overflow into stages.
  var kept    = SWAPUI.residentTexes.filter(function(t){ return !removeSet.has(t.hash); });
  var removed = SWAPUI.residentTexes.filter(function(t){ return removeSet.has(t.hash); });
  var placed = SWAP_place(kept, removed, adds);
  var fitHashes = {};
  placed.mapping.forEach(function(m){ fitHashes[m.hash] = 1; });
  var overflow = adds.filter(function(a){ return !fitHashes[a.hash]; });
  if (!overflow.length){
    SWAPUI_log("Everything fit resident after all \\u2014 no distribution needed. Rebuilding.", "ok");
    SWAPUI_buildPlan(); return;
  }
  SWAPUI_log(overflow.length + " texture(s) overflow to stages: " +
    overflow.map(function(o){ return o.name || "0x" + o.hash.toString(16); }).join(", "), "warn");

  // Distribute overflow across every s/d stage's DAR (whole-file edits).
  var dist = SWAP_pcDistributeToStages(SWAPUI.pc.files, overflow, SWAPUI_pcStageOf,
    function(m,l){ SWAPUI_log(m,l); });
  var editedStages = dist.stages.filter(function(s){ return s.added > 0; });
  var totalStages = editedStages.length;
  if (!totalStages){
    SWAPUI_fail("Stage distribution", ["no s/d stage could hold the overflow textures"]);
    return;
  }
  SWAPUI_log("Distribution: overflow packed into " + totalStages + " stage(s).", "ok");
  dist.stages.forEach(function(s){
    if (s.skipped) SWAPUI_log("  " + s.name + ": " + s.added + " added, " + s.skipped + " skipped" +
      (s.note ? " (" + s.note + ")" : ""), s.skipped ? "warn" : "ok");
  });

  // Build a REAL resident plan of the FITTING adds only (guaranteed to fit).
  var fittingAdds = adds.filter(function(a){ return fitHashes[a.hash]; });
  var plan = SWAP_pcPlan(ctx.files, removeSet, fittingAdds, kmdSwap);
  plan.warnings.forEach(function(w){ SWAPUI_log("\\u26A0 " + w, "warn"); });
  if (!plan.ok){ SWAPUI_fail("Resident-remainder plan unexpectedly failed", plan.errors); return; }
  plan._removeSet = removeSet; plan._adds = fittingAdds; plan._ctx = ctx;
  plan._kmdSwap = kmdSwap; plan._kmdSwapNote = "";
  plan._pcDistribution = { overflow: overflow, fileEdits: dist.fileEdits };
  SWAPUI.plan = plan;
  SWAPUI._pendingPcDistribution = { fileEdits: dist.fileEdits };

  // Plan table: resident rows + a distribution summary.
  var rows = "";
  SWAPUI.residentTexes.forEach(function(t){
    if (!removeSet.has(t.hash)) return;
    rows += "<tr><td style='color:#e88'>REMOVE</td><td>" + (t.name || "0x" + t.hash.toString(16).padStart(4, "0")) +
      "</td><td>" + t.slot.vw + "\\u00D7" + t.slot.h + " " + t.slot.bpp + "bpp</td><td>@" + t.slot.px + "," + t.slot.py +
      " \\u00B7 clut " + t.slot.cx + "," + t.slot.cy + "</td><td>\\u2192 freed</td></tr>";
  });
  plan.mapping.forEach(function(m){
    rows += "<tr><td style='color:#8d8'>ADD</td><td>" + m.name + "</td><td>" + m.w + "\\u00D7" + m.h + " " + m.bpp +
      "bpp</td><td>(" + m.from.px + "," + m.from.py + ") \\u2192 <b style='color:#cde'>(" + m.to.px + "," + m.to.py +
      ")</b> \\u00B7 clut \\u2192 (" + m.to.cx + "," + m.to.cy + ")</td><td>resident</td></tr>";
  });
  overflow.forEach(function(o){
    rows += "<tr><td style='color:#c9f'>STAGES</td><td>" + (o.name || "0x" + o.hash.toString(16)) +
      "</td><td>overflow</td><td colspan='1'>packed into " + totalStages + " s/d stage DAR(s)</td>" +
      "<td style='color:#b9c'>distributed</td></tr>";
  });
  document.getElementById("swPlanTbl").innerHTML =
    "<table><tr><th></th><th>texture</th><th>size</th><th>placement</th><th>space</th></tr>" + rows + "</table>";
  SWAPUI_log("\\u2713 plan ready (experimental distribution): " + removeSet.size + " out, " +
    plan.mapping.length + " resident, " + overflow.length + " into " + totalStages +
    " stages. Test the model in several stages after swapping. Verify & swap to apply.", "ok");
  SWAPUI_gate("planned");
}

// ── KMD → GLB export / import handlers ───────────────────────────────────────
function SWAPUI_glbStageParsed(){
  var i = +document.getElementById("glbStage").value;
  var st = SWAPUI.psx.outer.stages[i];
  if (!st) return null;
  return { name: st.name, parsed: psxParseStage(SWAPUI.psx.dir.subarray(st.byteOff, st.byteOff + st.extent)) };
}

// Build a hash → PCX-bytes map from all texture DARs in a stage (the sibling
// texture pack, e.g. init\\1_0.dar). PCX/PCC members carry a decodable header.
function SWAPUI_glbStageTextures(entries){
  var map = {};
  entries.forEach(function(e){
    if (extName(e.ext) !== "dar" || !e.data) return;
    var members = psxDarParse(e.data);
    if (!members) return;
    members.forEach(function(m){
      if (m.data && m.data.length > 128 && m.data[0] === 0x0A) map[m.hash] = m.data;  // PCX magic
    });
  });
  return map;
}

function SWAPUI_glbListKmds(){
  var sp = SWAPUI_glbStageParsed();
  if (!sp){ SWAPUI_log("pick a stage first", "warn"); return; }
  var kmds = SWAP_listKmds(sp.parsed.entries);
  var host = document.getElementById("glbKmdList");
  host.innerHTML = "";
  if (!kmds.length){ host.innerHTML = "<span style='color:#987;font-size:11px'>no KMDs in " + sp.name + "</span>"; return; }
  SWAPUI._glbTexCache = SWAPUI_glbStageTextures(sp.parsed.entries);
  kmds.forEach(function(k){
    var refs = SWAP_kmdHashes(k.bytes);
    var b = document.createElement("button");
    b.style.cssText = "background:#12242a;border:1px solid #2aa;color:#9fd;padding:6px 10px;border-radius:5px;cursor:pointer;font-size:11px";
    b.innerHTML = "\\u2B07 " + (k.label || ("0x" + (k.hash||0).toString(16))) + "<br><span style='color:#7aa;font-size:10px'>" + refs.length + " textures</span>";
    b.onclick = function(){ SWAPUI_glbExport(k, sp.name); };
    host.appendChild(b);
  });
  SWAPUI_log("listed " + kmds.length + " KMD(s) in " + sp.name + " — click one to export its GLB", "ok");
}

function SWAPUI_glbExport(kmd, stageName){
  try {
    var refs = SWAP_kmdHashes(kmd.bytes);
    var texMap = {};
    var pend = 0, done = 0;
    var finalize = function(){
      var glb = KMD_toGLB(kmd.bytes, texMap);
      var blob = new Blob([glb], { type: "model/gltf-binary" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = stageName + "_" + (kmd.label || ("0x" + (kmd.hash||0).toString(16))).replace(/[^\\w.-]/g, "_") + ".glb";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      SWAPUI_log("\\u2713 exported " + a.download + " (" + glb.length + " bytes, " +
        Object.keys(texMap).length + "/" + refs.length + " textures baked)", "ok");
    };
    // bake each referenced texture PCX → PNG via canvas
    var cache = SWAPUI._glbTexCache || {};
    var toBake = refs.filter(function(h){ return cache[h]; });
    if (!toBake.length){ finalize(); return; }
    toBake.forEach(function(h){
      var cv = SWAPUI_decodePcx(cache[h]);
      if (!cv){ return; }
      // flatten alpha to fully opaque — some importers read a stray 0-alpha
      // texel as translucency and show the whole model see-through
      try {
        var fx = cv.getContext("2d");
        var id = fx.getImageData(0, 0, cv.width, cv.height);
        for (var pi = 3; pi < id.data.length; pi += 4) id.data[pi] = 255;
        fx.putImageData(id, 0, 0);
      } catch(e){}
      pend++;
      cv.toBlob(function(blob){
        blob.arrayBuffer().then(function(ab){
          texMap[h] = { png: new Uint8Array(ab) };
          done++;
          if (done === pend) finalize();
        });
      }, "image/png");
    });
    if (pend === 0) finalize();
  } catch(e){ SWAPUI_log("GLB export failed: " + e.message, "err"); }
}

function SWAPUI_glbSetupDrop(){
  var zone = document.getElementById("glbDrop");
  if (!zone) return;
  var info = document.getElementById("glbImportInfo");
  ["dragover","dragenter"].forEach(function(ev){
    zone.addEventListener(ev, function(e){ e.preventDefault(); zone.style.background = "#0f2020"; });
  });
  ["dragleave","drop"].forEach(function(ev){
    zone.addEventListener(ev, function(e){ e.preventDefault(); zone.style.background = "#0a1414"; });
  });
  zone.addEventListener("drop", function(e){
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (!f || !/\\.glb$/i.test(f.name)){ info.textContent = "drop a .glb file"; return; }
    // which KMD does it rebuild? use the currently listed stage's KMD whose
    // export filename matches, or ask by matching the primitive hashes.
    info.textContent = "reading GLB\\u2026";
    f.arrayBuffer().then(function(ab){
      // defer heavy work one tick so the "reading" text paints (otherwise a
      // long synchronous encode looks like a freeze)
      setTimeout(function(){
        try {
          var glb = new Uint8Array(ab);
          var sp = SWAPUI_glbStageParsed();
          if (!sp){ info.textContent = "pick the source stage above first"; return; }
          var kmds = SWAP_listKmds(sp.parsed.entries);
          // match by hash set — use the hardened full parser (handles real
          // Blender exports: interleaved buffers, uint32 indices, chunk order)
          var glbInfo = parseGLBFull(glb);
          var glbHashes = {};
          glbInfo.triangles.forEach(function(tr){ glbHashes[tr.hash] = 1; });
          var match = null, bestScore = -1;
          kmds.forEach(function(k){
            var refs = SWAP_kmdHashes(k.bytes), score = 0;
            refs.forEach(function(h){ if (glbHashes[h]) score++; });
            if (score > bestScore){ bestScore = score; match = k; }
          });
          if (!match || bestScore <= 0){
            info.textContent = "could not match this GLB to a KMD in " + sp.name +
              " — is the right stage selected? (GLB materials must keep their numeric hash names)";
            return;
          }
          info.textContent = "rebuilding KMD\\u2026";
          var res = GLB_toKMD(glb, match.bytes);
          var out = SWAPUI_glbWriteBack(sp, match, res.bytes);
          info.innerHTML = "\\u2713 rebuilt <b>" + (match.label || ("0x"+(match.hash||0).toString(16))) +
            "</b> from " + f.name + " (" + res.patchedVerts + " verts, " + res.patchedFaces + " faces). " +
            (out ? "STAGE.DIR updated — use \\u2B07 Download below." : "");
          SWAPUI_log("GLB import: rebuilt KMD 0x" + (match.hash||0).toString(16) + " in " + sp.name +
            " (" + res.patchedVerts + " verts, " + res.patchedFaces + " faces)", "ok");
        } catch(err){
          info.textContent = "GLB import failed: " + err.message;
          SWAPUI_log("GLB import error: " + (err && err.stack ? err.stack : err.message), "err");
        }
      }, 30);
    }).catch(function(err){
      info.textContent = "could not read the file: " + err.message;
    });
  });
}

// Write a rebuilt KMD's bytes back into its stage entry and refresh the dir.
function SWAPUI_glbWriteBack(sp, kmd, newBytes){
  try {
    var entries = sp.parsed.entries.map(function(e){
      return { hash: e.hash, mode: e.mode, ext: e.ext, bytes: e.data };
    });
    // locate the KMD: it's either a loose entry or a DAR member
    var placed = false;
    for (var i = 0; i < entries.length && !placed; i++){
      if (entries[i].hash === kmd.hash && extName(entries[i].ext) !== "dar"){
        entries[i].bytes = newBytes; placed = true;
      } else if (extName(entries[i].ext) === "dar" && entries[i].bytes){
        var members = psxDarParse(entries[i].bytes);
        if (members && members.some(function(m){ return m.hash === kmd.hash; })){
          var mitems = members.map(function(m){
            return { hash: m.hash, ext: m.ext, bytes: m.hash === kmd.hash ? newBytes : m.data };
          });
          entries[i].bytes = psxDarBuild(mitems); placed = true;
        }
      }
    }
    if (!placed) return false;
    var blob = SWAP_rebuildStage(sp.parsed.headerB64, entries);
    var blobs = {};
    SWAPUI.psx.outer.stages.forEach(function(s){
      blobs[s.name] = SWAPUI.psx.dir.subarray(s.byteOff, s.byteOff + s.extent);
    });
    blobs[sp.name] = blob;
    SWAPUI.rebuilt = psxRebuildDir({ psx: { headB64: SWAPUI.psx.outer.headB64, stages: SWAPUI.psx.outer.stages } }, blobs);
    SWAPUI.psx.dir = SWAPUI.rebuilt;
    SWAPUI.psx.outer = psxParseOuter(SWAPUI.rebuilt);
    SWAPUI_gate("done");
    return true;
  } catch(e){ SWAPUI_log("write-back failed: " + e.message, "err"); return false; }
}
<\/script>
</body>`;
function openArchiveTool(){
  if(document.getElementById('archOverlay')) return;
  var ov=document.createElement('div'); ov.id='archOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#0a0c10';
  var ifr=document.createElement('iframe');
  ifr.style.cssText='border:0;width:100%;height:100%;display:block';
  ifr.srcdoc=ARCHIVE_TOOL_HTML;
  ifr.onload=function(){ try{ ifr.contentWindow.ARCH_HOST_EXIT=function(){ closeArchiveTool(); }; }catch(e){} };
  ov.appendChild(ifr); document.body.appendChild(ov);
}
function closeArchiveTool(){ var ov=document.getElementById('archOverlay'); if(ov) ov.remove(); }