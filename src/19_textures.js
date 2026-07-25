// ═══════════════════════════════════════════════════════════════════════════
// FILE: 19_textures.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// MGS1 Texture pipeline (TX_*)
// ============================================================
// Goal: read Snake's DAR archive of PCX textures, decode them to RGBA pixel
// buffers, display them in a browser panel, and (eventually) apply them onto
// the foreign mesh in the character builder viewport.
//
// DAR format (reverse-engineered empirically from snake's stg_tex4.dar):
//   u32 numEntries
//   for each entry:
//     ASCII name, null-terminated
//     0-3 null pad bytes (next field 4-byte aligned from file start)
//     u32 pcxByteSize
//     u8[pcxByteSize] PCX data
//     1 trailing null byte (separator before next entry)
//
// PCX format:
//   The MGS1 textures are 16-color EGA-style PCX (bpp=1, planes=4). 8-color
//   palette is in the 48-byte header palette area. RLE-encoded scanlines.
//   Each scanline contains bytesPerLine bytes per plane × 4 planes. To get a
//   pixel's palette index, OR together its bit from each plane.
//
//   VGA 8-bit PCX (bpp=8, planes=1) is also supported for completeness — the
//   custom ninja DAR might use either. VGA palette is in the last 769 bytes
//   of the file: 0x0C marker + 256 RGB triplets.

// ─── DAR parser ────────────────────────────────────────────────────────────
function TX_parseDAR(buffer){
  var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var numEntries = dv.getUint32(0, true);
  if(numEntries < 1 || numEntries > 1000){
    throw new Error("DAR numEntries looks wrong: " + numEntries);
  }
  var entries = [];
  var cursor = 4;
  for(var i = 0; i < numEntries; i++){
    if(cursor >= u8.length) throw new Error("DAR truncated at entry " + i);
    // Read null-terminated name
    var nameStart = cursor;
    while(cursor < u8.length && u8[cursor] !== 0) cursor++;
    if(cursor >= u8.length) throw new Error("DAR name unterminated at entry " + i);
    var name = '';
    for(var k = nameStart; k < cursor; k++) name += String.fromCharCode(u8[k]);
    cursor++; // skip null terminator
    // Pad to 4-byte alignment from file start
    while((cursor & 3) !== 0) cursor++;
    if(cursor + 4 > u8.length) throw new Error("DAR truncated before size field at entry " + i);
    var size = dv.getUint32(cursor, true);
    cursor += 4;
    if(cursor + size > u8.length){
      throw new Error("DAR entry " + i + " ('" + name + "') claims " + size + " bytes but only " + (u8.length - cursor) + " remain");
    }
    var pcx = u8.subarray(cursor, cursor + size);
    cursor += size;
    // Skip 1 trailing separator byte between entries (skip even after last
    // entry to be tolerant — extra bytes don't matter).
    cursor++;
    entries.push({name: name, pcx: pcx});
  }
  return entries;
}

// ─── PCX decoder ───────────────────────────────────────────────────────────
// Returns {width, height, pixels: Uint8ClampedArray of RGBA} for either EGA or
// VGA PCX. Tolerant of either bpp.
function TX_decodePCX(pcxBytes){
  if(pcxBytes.length < 128) throw new Error("PCX too short for header");
  if(pcxBytes[0] !== 0x0A) throw new Error("PCX magic 0x0A missing (got 0x" + pcxBytes[0].toString(16) + ")");
  var version  = pcxBytes[1];
  var encoding = pcxBytes[2];
  var bpp      = pcxBytes[3];
  var dv = new DataView(pcxBytes.buffer, pcxBytes.byteOffset, pcxBytes.byteLength);
  var xMin = dv.getInt16(4, true), yMin = dv.getInt16(6, true);
  var xMax = dv.getInt16(8, true), yMax = dv.getInt16(10, true);
  var width  = xMax - xMin + 1;
  var height = yMax - yMin + 1;
  var planes        = pcxBytes[65];
  var bytesPerLine  = dv.getUint16(66, true);
  if(width <= 0 || height <= 0 || width > 4096 || height > 4096){
    throw new Error("PCX dimensions implausible: " + width + "x" + height);
  }
  if(encoding !== 0x01){
    throw new Error("PCX encoding not RLE (got " + encoding + ")");
  }

  // ─── Decompress RLE into scanline buffer ───
  // Each scanline is bytesPerLine * planes bytes.
  var totalScanlineBytes = bytesPerLine * planes;
  var rawPixels = new Uint8Array(totalScanlineBytes * height);
  var src = 128;  // skip PCX header
  var dst = 0;
  while(dst < rawPixels.length && src < pcxBytes.length){
    var b = pcxBytes[src++];
    if((b & 0xC0) === 0xC0){
      // Run-length: next byte repeated (b & 0x3F) times
      var count = b & 0x3F;
      if(src >= pcxBytes.length) break;
      var val = pcxBytes[src++];
      for(var r = 0; r < count && dst < rawPixels.length; r++){
        rawPixels[dst++] = val;
      }
    } else {
      // Literal byte
      rawPixels[dst++] = b;
    }
  }

  // ─── Resolve palette ───
  var palette;  // 256-entry RGB array (R,G,B,R,G,B,...) — we always size to 256 for VGA, even for EGA
  if(bpp === 8 && planes === 1){
    // VGA: 256-color palette at end of file, marker 0x0C
    if(pcxBytes.length < 769) throw new Error("PCX VGA missing palette");
    var palStart = pcxBytes.length - 769;
    if(pcxBytes[palStart] !== 0x0C){
      // Some tools omit the marker — try last 768 bytes
      palStart = pcxBytes.length - 768;
    } else {
      palStart++;
    }
    palette = pcxBytes.subarray(palStart, palStart + 768);
  } else if(bpp === 1 && planes === 4){
    // EGA: 16-color palette in header at offset 16, 48 bytes (16 × RGB)
    palette = pcxBytes.subarray(16, 16 + 48);
  } else if(bpp === 1 && planes === 1){
    // 1bpp monochrome — synthesize a 2-color palette (black/white)
    palette = new Uint8Array([0,0,0, 255,255,255]);
  } else {
    throw new Error("PCX bpp/planes unsupported: bpp=" + bpp + " planes=" + planes);
  }

  // ─── Convert to RGBA ───
  var out = new Uint8ClampedArray(width * height * 4);
  if(bpp === 8 && planes === 1){
    // Simple: rawPixels is direct palette indices
    for(var y = 0; y < height; y++){
      for(var x = 0; x < width; x++){
        var idx = rawPixels[y * bytesPerLine + x];
        var po = idx * 3;
        var oo = (y * width + x) * 4;
        out[oo]   = palette[po];
        out[oo+1] = palette[po+1];
        out[oo+2] = palette[po+2];
        out[oo+3] = idx === 0 ? 0 : 255;  // index 0 = transparent (PSX convention)
      }
    }
  } else if(bpp === 1 && planes === 4){
    // EGA: 4 planes of 1bpp. For each pixel, OR together the bits from each plane.
    for(var y = 0; y < height; y++){
      var rowBase = y * totalScanlineBytes;
      for(var x = 0; x < width; x++){
        var byteIdx = x >> 3;
        var bitMask = 0x80 >> (x & 7);
        var idx = 0;
        for(var p = 0; p < 4; p++){
          var planeByte = rawPixels[rowBase + p * bytesPerLine + byteIdx];
          if(planeByte & bitMask) idx |= (1 << p);
        }
        var po = idx * 3;
        var oo = (y * width + x) * 4;
        out[oo]   = palette[po];
        out[oo+1] = palette[po+1];
        out[oo+2] = palette[po+2];
        out[oo+3] = idx === 0 ? 0 : 255;  // index 0 = transparent
      }
    }
  } else if(bpp === 1 && planes === 1){
    // Monochrome
    for(var y = 0; y < height; y++){
      var rowBase = y * bytesPerLine;
      for(var x = 0; x < width; x++){
        var byteIdx = x >> 3;
        var bitMask = 0x80 >> (x & 7);
        var idx = (rawPixels[rowBase + byteIdx] & bitMask) ? 1 : 0;
        var po = idx * 3;
        var oo = (y * width + x) * 4;
        out[oo]   = palette[po];
        out[oo+1] = palette[po+1];
        out[oo+2] = palette[po+2];
        out[oo+3] = 255;
      }
    }
  }
  return {
    width: width, height: height, pixels: out,
    bpp: bpp, planes: planes,
    palette: palette  // exposed for re-encoding to PCX later (phase 4)
  };
}

// ─── State ─────────────────────────────────────────────────────────────────
var TX_state = {
  darFilename: null,
  darBytes: null,        // raw DAR bytes (kept for re-export with replacements)
  textures: [],          // array of {name, pcxBytes, decoded, dataURL}
  foreignTextures: [],   // array of {name, width, height, rgba (Uint8ClampedArray), dataURL}
  matches: {},           // {snakeSlotName: foreignIdx} — current mapping
  resizeQuality: 'nearest',  // 'nearest' | 'bilinear' | 'bicubic'
  panelOpen: false,
  panelEl: null
};

// ─── Median-cut palette quantization ───────────────────────────────────────
// Standard algorithm for reducing an RGBA image to N colors. Recursively splits
// the most-spread color box on its longest axis at the median pixel. Each
// final box's average color becomes a palette entry. Quality is generally
// good for natural images; for pixel art with hard-edged colors a histogram
// approach would be sharper but median-cut is simpler and good enough for
// PS1-era textures.
function TX_quantizeToPalette(rgbaPixels, width, height, numColors){
  numColors = numColors || 16;
  // Collect opaque pixels (skip transparent — they map to index 0 separately)
  var pixels = [];
  for(var i = 0; i < width * height; i++){
    var a = rgbaPixels[i*4 + 3];
    if(a < 128) continue;
    pixels.push([rgbaPixels[i*4], rgbaPixels[i*4+1], rgbaPixels[i*4+2]]);
  }
  var palette = new Uint8Array(numColors * 3);
  if(pixels.length === 0){
    // All transparent — emit a default grayscale ramp
    for(var c = 0; c < numColors; c++){
      var v = Math.round(c * 255 / (numColors - 1));
      palette[c*3] = palette[c*3+1] = palette[c*3+2] = v;
    }
  } else {
    // Run median cut. Note: index 0 is reserved for transparent in PSX
    // convention, so we generate numColors palette entries but the first
    // slot will be set to a "neutral" value the renderer treats as transparent
    // via the alpha component.
    var boxes = [pixels];
    while(boxes.length < numColors){
      var biggestIdx = -1, biggestRange = 0, biggestAxis = 0;
      for(var b = 0; b < boxes.length; b++){
        var box = boxes[b];
        if(box.length < 2) continue;
        var mn=[255,255,255], mx=[0,0,0];
        for(var i = 0; i < box.length; i++){
          for(var k = 0; k < 3; k++){
            if(box[i][k] < mn[k]) mn[k] = box[i][k];
            if(box[i][k] > mx[k]) mx[k] = box[i][k];
          }
        }
        var ranges = [mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]];
        var range = Math.max(ranges[0], ranges[1], ranges[2]);
        if(range > biggestRange){
          biggestRange = range;
          biggestIdx = b;
          biggestAxis = ranges.indexOf(range);
        }
      }
      if(biggestIdx < 0) break;
      var box = boxes[biggestIdx];
      box.sort(function(a, c){ return a[biggestAxis] - c[biggestAxis]; });
      var mid = box.length >> 1;
      boxes.splice(biggestIdx, 1, box.slice(0, mid), box.slice(mid));
    }
    // Average each box → palette
    for(var b = 0; b < boxes.length && b < numColors; b++){
      var box = boxes[b];
      if(box.length === 0) continue;
      var sr=0, sg=0, sbv=0;
      for(var i = 0; i < box.length; i++){
        sr += box[i][0]; sg += box[i][1]; sbv += box[i][2];
      }
      palette[b*3]   = Math.round(sr/box.length);
      palette[b*3+1] = Math.round(sg/box.length);
      palette[b*3+2] = Math.round(sbv/box.length);
    }
  }
  // Quantize all pixels to nearest palette entry
  var indices = new Uint8Array(width * height);
  for(var i = 0; i < width * height; i++){
    var a = rgbaPixels[i*4 + 3];
    if(a < 128){ indices[i] = 0; continue; }  // transparent → index 0
    var r = rgbaPixels[i*4], g = rgbaPixels[i*4+1], bv = rgbaPixels[i*4+2];
    var best = 0, bestDist = Infinity;
    for(var p = 0; p < numColors; p++){
      var dr = r - palette[p*3], dg = g - palette[p*3+1], db = bv - palette[p*3+2];
      var d = dr*dr + dg*dg + db*db;
      if(d < bestDist){ bestDist = d; best = p; }
    }
    indices[i] = best;
  }
  return {palette: palette, indices: indices};
}

// ─── PCX encoder (EGA 1bpp × 4 planes — matches Snake's format) ────────────
// rgbaPixels: Uint8ClampedArray of width*height*4 bytes (RGBA)
// templatePcxBytes (optional): existing PCX whose header to copy verbatim
//   (the bits beyond dimensions+palette). This preserves "metadata" like
//   hdpi/vdpi/version/encoding/palInfo that the game's decoder MIGHT check
//   even if we don't know it does.
function TX_encodePCX_EGA(rgbaPixels, width, height, templatePcxBytes){
  if(width < 1 || height < 1) throw new Error("PCX encode: bad dimensions " + width + "x" + height);
  if(rgbaPixels.length < width * height * 4){
    throw new Error("PCX encode: rgbaPixels too short (" + rgbaPixels.length + " < " + (width*height*4) + ")");
  }
  var quant = TX_quantizeToPalette(rgbaPixels, width, height, 16);
  // ─── Header ───
  var header = new Uint8Array(128);
  if(templatePcxBytes && templatePcxBytes.length >= 128){
    // Copy template header verbatim — preserves any bytes the game checks
    for(var i = 0; i < 128; i++) header[i] = templatePcxBytes[i];
  } else {
    header[0] = 0x0A;  // PCX magic
    header[1] = 0x05;  // version 3.0
    header[2] = 0x01;  // RLE encoding
    header[3] = 0x01;  // 1 bit per pixel
    // Approximate Snake's hdpi/vdpi (1600/1200)
    header[12] = 0x40; header[13] = 0x06;
    header[14] = 0xB0; header[15] = 0x04;
    header[65] = 0x04;  // 4 planes
    header[68] = 0x01;  // palInfo: color
  }
  var dv = new DataView(header.buffer);
  // Always override dimensions
  dv.setInt16(4, 0, true);              // xMin
  dv.setInt16(6, 0, true);              // yMin
  dv.setInt16(8, width - 1, true);      // xMax
  dv.setInt16(10, height - 1, true);    // yMax
  // Override 16-color EGA palette (header bytes 16..63)
  for(var i = 0; i < 48; i++) header[16 + i] = quant.palette[i];
  // bytesPerLine: 1 bpp ⇒ ceil(width / 8), must be even per PCX spec
  var bytesPerLine = Math.ceil(width / 8);
  if(bytesPerLine & 1) bytesPerLine++;
  dv.setUint16(66, bytesPerLine, true);

  // ─── Bit planes ───
  // For each scanline, plane p byte b bit (0x80 >> bit_in_byte) = ((index >> p) & 1)
  var totalScanlineBytes = bytesPerLine * 4;
  var rawPlanes = new Uint8Array(totalScanlineBytes * height);
  for(var y = 0; y < height; y++){
    var rowBase = y * totalScanlineBytes;
    for(var x = 0; x < width; x++){
      var idx = quant.indices[y * width + x];
      var byteIdx = x >> 3;
      var bitMask = 0x80 >> (x & 7);
      for(var p = 0; p < 4; p++){
        if(idx & (1 << p)){
          rawPlanes[rowBase + p * bytesPerLine + byteIdx] |= bitMask;
        }
      }
    }
  }
  // ─── RLE compress (per scanline boundary, per PCX spec) ───
  var compressed = TX_rleCompress(rawPlanes, totalScanlineBytes);
  // ─── Concatenate ───
  var result = new Uint8Array(128 + compressed.length);
  result.set(header, 0);
  result.set(compressed, 128);
  return result;
}

// PCX RLE: a byte 0xC0-0xFF is interpreted as a run marker — its lower 6 bits
// are the run length, and the NEXT byte is the value to repeat. So any literal
// byte with top 2 bits set must be encoded as a run-of-1. Runs reset at each
// scanline boundary (decoder reads exactly bytesPerLine*planes bytes per
// scanline before checking line termination).
function TX_rleCompress(raw, scanlineSize){
  var out = [];
  var pos = 0;
  while(pos < raw.length){
    var lineEnd = Math.min(pos + scanlineSize, raw.length);
    while(pos < lineEnd){
      var b = raw[pos];
      var run = 1;
      while(pos + run < lineEnd && run < 63 && raw[pos + run] === b) run++;
      if(run > 1 || (b & 0xC0) === 0xC0){
        out.push(0xC0 | run);
        out.push(b);
      } else {
        out.push(b);
      }
      pos += run;
    }
  }
  return new Uint8Array(out);
}

// ─── DAR writer ────────────────────────────────────────────────────────────
// Build a new DAR archive from {name, pcx} entries. Format matches what
// TX_parseDAR reads. Each entry: null-terminated name, padded to 4-byte
// alignment, u32 size, PCX data, 1 trailing separator byte.
function TX_buildDAR(entries){
  // Compute total size (so we can allocate exactly)
  var total = 4;  // numEntries
  for(var i = 0; i < entries.length; i++){
    total += entries[i].name.length + 1;  // null-terminated
    while(total & 3) total++;             // pad to 4-byte align
    total += 4;                            // u32 size
    total += entries[i].pcx.length;
    total += 1;                            // separator
  }
  var out = new Uint8Array(total);
  var dv = new DataView(out.buffer);
  dv.setUint32(0, entries.length, true);
  var cursor = 4;
  for(var i = 0; i < entries.length; i++){
    var name = entries[i].name;
    for(var k = 0; k < name.length; k++) out[cursor++] = name.charCodeAt(k) & 0x7F;
    out[cursor++] = 0;
    while(cursor & 3) out[cursor++] = 0;
    dv.setUint32(cursor, entries[i].pcx.length, true);
    cursor += 4;
    out.set(entries[i].pcx, cursor);
    cursor += entries[i].pcx.length;
    out[cursor++] = 0;
  }
  return out;
}

// ─── Foreign texture loading (PNG/JPG via browser canvas, or PCX directly) ─
// Reads any browser-decodable image file OR a PCX file, returns
// {name, width, height, rgba, dataURL}. PCX path uses TX_decodePCX; other
// formats use the browser's built-in image decode via canvas.
function TX_loadForeignImage(file){
  var name = (file.name || '').toLowerCase();
  if(name.endsWith('.pcx')){
    return new Promise(function(resolve, reject){
      var fr = new FileReader();
      fr.onload = function(ev){
        try {
          var decoded = TX_decodePCX(new Uint8Array(ev.target.result));
          // Convert to dataURL for thumbnail display
          var canvas = document.createElement('canvas');
          canvas.width = decoded.width;
          canvas.height = decoded.height;
          var ctx = canvas.getContext('2d');
          var imageData = ctx.createImageData(decoded.width, decoded.height);
          imageData.data.set(decoded.pixels);
          ctx.putImageData(imageData, 0, 0);
          resolve({
            name: file.name,
            width: decoded.width,
            height: decoded.height,
            rgba: imageData.data,
            dataURL: canvas.toDataURL('image/png')
          });
        } catch(err){ reject(err); }
      };
      fr.onerror = function(){ reject(new Error('File read failed: ' + file.name)); };
      fr.readAsArrayBuffer(file);
    });
  }
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    fr.onload = function(ev){
      var img = new Image();
      img.onload = function(){
        try {
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          var imageData = ctx.getImageData(0, 0, img.width, img.height);
          resolve({
            name: file.name,
            width: img.width,
            height: img.height,
            rgba: imageData.data,    // Uint8ClampedArray
            dataURL: ev.target.result
          });
        } catch(err){ reject(err); }
      };
      img.onerror = function(){ reject(new Error('Image decode failed: ' + file.name)); };
      img.src = ev.target.result;
    };
    fr.onerror = function(){ reject(new Error('File read failed: ' + file.name)); };
    fr.readAsDataURL(file);
  });
}

// Load a bundle of PCX files as if they were a DAR archive. Useful when the
// user has decoded the template's textures into individual PCX files (or
// wants to use loose PCX files instead of a DAR for any reason).
//
// The result is structurally identical to what TX_parseDAR + TX_decodePCX
// would produce, so all downstream code (preview, materials panel, DAR
// export) works without modification.
function TX_loadPCXBundle(files){
  return Promise.all(files.map(function(f){
    return new Promise(function(resolve, reject){
      var fr = new FileReader();
      fr.onload = function(ev){
        try {
          var pcxBytes = new Uint8Array(ev.target.result);
          var decoded = TX_decodePCX(pcxBytes);
          // Generate dataURL for display
          var canvas = document.createElement('canvas');
          canvas.width = decoded.width;
          canvas.height = decoded.height;
          var ctx = canvas.getContext('2d');
          var imageData = ctx.createImageData(decoded.width, decoded.height);
          imageData.data.set(decoded.pixels);
          ctx.putImageData(imageData, 0, 0);
          resolve({
            name: f.name,
            pcxBytes: pcxBytes,
            decoded: decoded,
            dataURL: canvas.toDataURL('image/png'),
            error: null
          });
        } catch(err){
          resolve({name: f.name, pcxBytes: null, decoded: null, dataURL: null, error: err.message});
        }
      };
      fr.onerror = function(){ resolve({name: f.name, pcxBytes: null, decoded: null, dataURL: null, error: 'File read failed'}); };
      fr.readAsArrayBuffer(f);
    });
  })).then(function(records){
    TX_state.darFilename = '(' + records.length + ' PCX files)';
    TX_state.textures = records;
    return records;
  });
}

// Resize an RGBA image to target dimensions via canvas. quality can be:
//   'nearest'  — sharp, preserves pixel art (default)
//   'bilinear' — smooth, gentler on photographic textures
//   'bicubic'  — smoothest, best for photographic but slower
// Used when the foreign texture doesn't match the assigned Snake slot's
// dimensions — resizing is REQUIRED because the game expects each slot to be
// that exact pixel size.
function TX_resizeRGBA(rgbaPixels, srcWidth, srcHeight, dstWidth, dstHeight, quality){
  if(srcWidth === dstWidth && srcHeight === dstHeight){
    return new Uint8ClampedArray(rgbaPixels);
  }
  quality = quality || (typeof TX_state !== 'undefined' && TX_state.resizeQuality) || 'nearest';
  var srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  var srcCtx = srcCanvas.getContext('2d');
  var srcData = srcCtx.createImageData(srcWidth, srcHeight);
  srcData.data.set(rgbaPixels);
  srcCtx.putImageData(srcData, 0, 0);
  var dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  var dstCtx = dstCanvas.getContext('2d');
  if(quality === 'nearest'){
    dstCtx.imageSmoothingEnabled = false;
  } else {
    dstCtx.imageSmoothingEnabled = true;
    // 'low'=bilinear-ish, 'medium'/'high'=bicubic in most browsers
    dstCtx.imageSmoothingQuality = (quality === 'bicubic') ? 'high' : 'low';
  }
  dstCtx.drawImage(srcCanvas, 0, 0, dstWidth, dstHeight);
  return dstCtx.getImageData(0, 0, dstWidth, dstHeight).data;
}

// ─── Auto-match by dimensions (+ filename hints) ───────────────────────────
// For each Snake slot, find the foreign texture closest in dimensions. Adds
// a small bonus when the foreign filename and Snake slot name share a body
// part keyword ("face", "arm", "leg", etc.) — useful when several foreign
// textures happen to share dimensions and the heuristic needs a tiebreaker.
// When filenames are uninformative (numeric, generic), bonus collapses to 0
// and pure dimension matching takes over.
function TX_autoMatchByDimensions(){
  if(TX_state.textures.length === 0 || TX_state.foreignTextures.length === 0){
    TX_state.matches = {};
    return TX_state.matches;
  }
  var bodyPartKeywords = ['face','hed','head','arm','hand','leg','boot','foot',
                          'hip','chest','torso','neck','shoulder','knee','elbow'];
  // Tokenize a name into lowercase body-part keywords it contains
  function partTokens(name){
    var lower = name.toLowerCase();
    var tokens = [];
    for(var i = 0; i < bodyPartKeywords.length; i++){
      if(lower.indexOf(bodyPartKeywords[i]) >= 0) tokens.push(bodyPartKeywords[i]);
    }
    return tokens;
  }
  // Score every (snake, foreign) pair
  var pairs = [];
  for(var si = 0; si < TX_state.textures.length; si++){
    var s = TX_state.textures[si];
    if(!s.decoded) continue;
    var sTokens = partTokens(s.name);
    for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
      var f = TX_state.foreignTextures[fi];
      var widthDiff = Math.abs(f.width - s.decoded.width);
      var heightDiff = Math.abs(f.height - s.decoded.height);
      var aspectS = s.decoded.width / s.decoded.height;
      var aspectF = f.width / f.height;
      var aspectDiff = Math.abs(aspectS - aspectF);
      var score = widthDiff + heightDiff + aspectDiff * 30;
      // Filename hint bonus: -30 per shared body-part token
      var fTokens = partTokens(f.name);
      for(var sk = 0; sk < sTokens.length; sk++){
        if(fTokens.indexOf(sTokens[sk]) >= 0) score -= 30;
      }
      pairs.push({si: si, fi: fi, score: score, sName: s.name});
    }
  }
  pairs.sort(function(a, b){ return a.score - b.score; });
  // Greedy assignment
  var usedSnake = {}, usedForeign = {};
  var matches = {};
  for(var i = 0; i < pairs.length; i++){
    var p = pairs[i];
    if(usedSnake[p.si] || usedForeign[p.fi]) continue;
    matches[p.sName] = p.fi;
    usedSnake[p.si] = true;
    usedForeign[p.fi] = true;
  }
  TX_state.matches = matches;
  return matches;
}

// ─── Build replacement DAR ─────────────────────────────────────────────────
// For each Snake slot, if a foreign texture is matched: resize it to Snake's
// dimensions, encode as PCX (using Snake's PCX header as template to preserve
// any "metadata" the game might check), then pack all entries (replaced and
// unchanged) into a new DAR in the original order.
function TX_buildReplacementDAR(){
  if(TX_state.textures.length === 0) throw new Error("No template DAR loaded");
  var newEntries = [];
  var stats = {replaced: 0, kept: 0, skipped: 0};
  for(var si = 0; si < TX_state.textures.length; si++){
    var slot = TX_state.textures[si];
    var fi = TX_state.matches[slot.name];
    if(fi === undefined || fi === null){
      // No replacement — keep original
      newEntries.push({name: slot.name, pcx: slot.pcxBytes});
      stats.kept++;
      continue;
    }
    var foreign = TX_state.foreignTextures[fi];
    if(!foreign || !slot.decoded){
      newEntries.push({name: slot.name, pcx: slot.pcxBytes});
      stats.skipped++;
      continue;
    }
    var resized = TX_resizeRGBA(foreign.rgba, foreign.width, foreign.height, slot.decoded.width, slot.decoded.height);
    var newPcx = TX_encodePCX_EGA(resized, slot.decoded.width, slot.decoded.height, slot.pcxBytes);
    newEntries.push({name: slot.name, pcx: newPcx});
    stats.replaced++;
  }
  var darBytes = TX_buildDAR(newEntries);
  return {bytes: darBytes, stats: stats};
}

// Convert decoded pixels to a data URL for browser display
function TX_pixelsToDataURL(decoded){
  var canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(decoded.width, decoded.height);
  imageData.data.set(decoded.pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ─── DAR load helper used by the UI ────────────────────────────────────────
function TX_loadDAR(arrayBuffer, filename){
  var entries = TX_parseDAR(arrayBuffer);
  TX_state.darFilename = filename;
  TX_state.textures = entries.map(function(e){
    var rec = {name: e.name, pcxBytes: e.pcx, decoded: null, dataURL: null, error: null};
    try {
      rec.decoded = TX_decodePCX(e.pcx);
      rec.dataURL = TX_pixelsToDataURL(rec.decoded);
    } catch(err){
      rec.error = err.message;
    }
    return rec;
  });
  return TX_state.textures;
}

// ─── Texture browser UI ────────────────────────────────────────────────────
// Renders a tiled grid of textures inside `containerEl`. Used by the Character
// Builder's texture section (the caller injects the container).
function TX_renderBrowser(containerEl){
  containerEl.innerHTML = '';
  if(TX_state.textures.length === 0){
    containerEl.innerHTML = '<div style="color:#666;font-size:10px;font-style:italic;padding:8px">No textures loaded. Upload a DAR file to see Snake\'s textures.</div>';
    return;
  }
  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:4px;padding:4px';
  for(var i = 0; i < TX_state.textures.length; i++){
    var t = TX_state.textures[i];
    var cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;background:#0a0e14;border:1px solid #1a2535;padding:3px;border-radius:2px;cursor:pointer';
    cell.title = t.name + (t.decoded ? ' (' + t.decoded.width + 'x' + t.decoded.height + ', ' + t.decoded.bpp + 'bpp×' + t.decoded.planes + 'p)' : '');
    if(t.dataURL){
      var img = document.createElement('img');
      img.src = t.dataURL;
      img.style.cssText = 'width:48px;height:48px;object-fit:contain;image-rendering:pixelated;background:#222';
      cell.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.style.cssText = 'width:48px;height:48px;background:#3a1818;color:#f88;font-size:8px;display:flex;align-items:center;justify-content:center;text-align:center';
      ph.textContent = t.error || 'decode failed';
      cell.appendChild(ph);
    }
    var label = document.createElement('div');
    label.style.cssText = 'font-size:8px;color:#aab;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    label.textContent = t.name.replace(/\.pcx$/i, '');
    cell.appendChild(label);
    grid.appendChild(cell);
  }
  containerEl.appendChild(grid);
}

// ============================================================
