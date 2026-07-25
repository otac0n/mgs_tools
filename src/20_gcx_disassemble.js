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
