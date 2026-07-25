// ═══════════════════════════════════════════════════════════════════════════
// FILE: 25_gcx_entities.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// GCX ENTITIES — extract/write back PSX .gcx entities
// ============================================================
// Walks a parsed .gcx AST, finds CHARA commands, decodes their arguments
// into entity objects matching the shape produced by parseGCLScript (01_gcl.js).
// Each entity carries psxAstRefs — direct pointers to AST Value objects for
// pos/dir/route — so a save operation can propagate UI changes back without
// any reparse.
//
// Cross-compatible: same entity shape as PC parser, so the existing editor
// UI (3D viewport, property panels) works without modification.

(function(global) {

  // ---------- Helpers ----------

  function _isShort(v)  { return v && v.tag === GCL_SHORT; }
  function _isByte(v)   { return v && v.tag === GCL_BYTE; }
  function _isStrid(v)  { return v && v.tag === GCL_STRID; }
  function _isProcid(v) { return v && v.tag === GCL_PROCID; }
  function _isOption(v) { return v && v.tag === GCL_OPTION; }
  function _isEnd(v)    { return v && v.kind === 'end'; }

  // SHORT payloads are already stored as signed integers by the disassembler
  // (gcxBeI16 -> -32768..32767). No conversion needed for read; encoder masks
  // with 0xFFFF so writes are safe with any signed/unsigned input.
  function _signedShort(v) {
    return v.payload | 0;
  }
  function _setSignedShort(v, n) {
    v.payload = n | 0;
  }

  // Group a value-stream into options. Returns:
  //   { positional: [v, v, ...],   // values before any OPTION
  //     options: [ { char, vals: [v, ...], optRef } ] }
  function _groupByOption(values) {
    var positional = [];
    var options = [];
    var current = null;  // current option being built
    var hitOption = false;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (_isOption(v)) {
        if (current) options.push(current);
        current = {
          char: String.fromCharCode(v.payload.optChar),
          vals: [],
          optRef: v
        };
        hitOption = true;
      } else if (_isEnd(v)) {
        break;
      } else {
        if (current) current.vals.push(v);
        else positional.push(v);
      }
    }
    if (current) options.push(current);
    return { positional: positional, options: options };
  }

  // Extract a 3-SHORT vector (x,y,z) from an option's vals.
  // Returns { x, y, z, xRef, yRef, zRef } or null.
  function _vec3FromOpt(opt) {
    var vs = opt.vals;
    if (vs.length < 3 || !_isShort(vs[0]) || !_isShort(vs[1]) || !_isShort(vs[2])) return null;
    return {
      x: _signedShort(vs[0]), y: _signedShort(vs[1]), z: _signedShort(vs[2]),
      xRef: vs[0], yRef: vs[1], zRef: vs[2]
    };
  }

  // ---------- Per-entity-type option mappers ----------

  // Generic mapper: handles common -p / -n / -d / -r options.
  // Sets fields on `ent` and records refs in `ent.psxAstRefs`.
  function _applyCommonOptions(ent, group) {
    var refs = ent.psxAstRefs;
    for (var i = 0; i < group.options.length; i++) {
      var opt = group.options[i];
      switch (opt.char) {
        case 'p': {
          var v = _vec3FromOpt(opt);
          if (v) {
            ent.pos = { x: v.x, y: v.y, z: v.z };
            refs.posX = v.xRef; refs.posY = v.yRef; refs.posZ = v.zRef;
          }
          break;
        }
        case 'n': {
          var n = _vec3FromOpt(opt);
          if (n) {
            ent.spawnPos = { x: n.x, y: n.y, z: n.z };
            refs.spawnX = n.xRef; refs.spawnY = n.yRef; refs.spawnZ = n.zRef;
          }
          break;
        }
        case 'd': {
          var d = _vec3FromOpt(opt);
          if (d) {
            ent.dir = { x: d.x, y: d.y, z: d.z };
            refs.dirX = d.xRef; refs.dirY = d.yRef; refs.dirZ = d.zRef;
          }
          break;
        }
        case 'r': {
          if (opt.vals.length > 0 && (_isByte(opt.vals[0]) || _isShort(opt.vals[0]))) {
            ent.route = opt.vals[0].payload;
            refs.route = opt.vals[0];
          }
          break;
        }
      }
    }
  }

  // Per-type extra mapping. Mirrors what parseGCLScript builds for each type.
  function _applyTypeSpecificOptions(ent, group) {
    var refs = ent.psxAstRefs;
    var t = ent.type;

    function findOpt(c) {
      for (var i = 0; i < group.options.length; i++) {
        if (group.options[i].char === c) return group.options[i];
      }
      return null;
    }

    if (t === 'CAMERA' || t === 'CAMERA2') {
      var lO = findOpt('l'), wO = findOpt('w'), xO = findOpt('x'), eO = findOpt('e');
      if (lO && _isShort(lO.vals[0])) { ent.camLen   = _signedShort(lO.vals[0]); refs.camLen   = lO.vals[0]; }
      if (wO && _isShort(wO.vals[0])) { ent.camWidth = _signedShort(wO.vals[0]); refs.camWidth = wO.vals[0]; }
      if (xO && _isShort(xO.vals[0])) { ent.camXRange= _signedShort(xO.vals[0]); refs.camXRange= xO.vals[0]; }
      if (eO && _isProcid(eO.vals[0])) { ent.execProc = '0x' + eO.vals[0].payload.toString(16); refs.execProc = eO.vals[0]; }
    } else if (t === 'CAMERAGUN' || t === 'GUNCAME') {
      var lO2 = findOpt('l'), wO2 = findOpt('w'), xO2 = findOpt('x');
      if (lO2 && _isShort(lO2.vals[0])) { ent.gunLen    = _signedShort(lO2.vals[0]); refs.gunLen    = lO2.vals[0]; }
      if (wO2 && _isShort(wO2.vals[0])) { ent.gunWidth  = _signedShort(wO2.vals[0]); refs.gunWidth  = wO2.vals[0]; }
      if (xO2 && _isShort(xO2.vals[0])) { ent.gunXRange = _signedShort(xO2.vals[0]); refs.gunXRange = xO2.vals[0]; }
    } else if (t === 'ITEM') {
      var hO = findOpt('h'), bO = findOpt('b'), iO = findOpt('i'), mO = findOpt('m'), numO = findOpt('n');
      if (hO && _isShort(hO.vals[0])) { ent.height = _signedShort(hO.vals[0]); refs.height = hO.vals[0]; }
      if (bO && _isByte(bO.vals[0]))  { ent.box = bO.vals[0].payload;          refs.box = bO.vals[0]; }
      if (iO && _isByte(iO.vals[0]))  { ent.itemIndex = iO.vals[0].payload;    refs.itemIndex = iO.vals[0]; }
      if (numO && _isByte(numO.vals[0])) { ent.num = numO.vals[0].payload;     refs.num = numO.vals[0]; }
      // -m is a STRING msg in this case
    } else if (t === 'DOOR' || t === 'DOOR2') {
      var tO = findOpt('t'), wO3 = findOpt('w'), sO = findOpt('s'), uO = findOpt('u'),
          hO2 = findOpt('h'), vO = findOpt('v'), mDoor = findOpt('m');
      if (tO && _isByte(tO.vals[0]))  { ent.doorType  = tO.vals[0].payload;    refs.doorType  = tO.vals[0]; }
      if (wO3 && _isShort(wO3.vals[0])) { ent.leafWidth = _signedShort(wO3.vals[0]); refs.leafWidth = wO3.vals[0]; }
      if (sO && _isShort(sO.vals[0])) { ent.speed     = _signedShort(sO.vals[0]); refs.speed     = sO.vals[0]; }
      if (uO && _isShort(uO.vals[0])) { ent.vOffset   = _signedShort(uO.vals[0]); refs.vOffset   = uO.vals[0]; }
      if (hO2 && (_isByte(hO2.vals[0]) || _isShort(hO2.vals[0]))) { ent.hzdSeg = hO2.vals[0].payload; refs.hzdSeg = hO2.vals[0]; }
      if (vO && _isShort(vO.vals[0])) { ent.vAnimExtent = _signedShort(vO.vals[0]); refs.vAnimExtent = vO.vals[0]; }
      // Door's model: -m is a STRID (hash) that names the door KMD in STAGE.DIR.
      // Doors are submodels just like OBSTACLE/PUT_OBJECT — they're positioned by
      // the entity's -p and rendered using the referenced KMD.
      if (mDoor && mDoor.vals.length > 0 && _isStrid(mDoor.vals[0])) {
        ent.modelHash = mDoor.vals[0].payload;
        refs.model = mDoor.vals[0];
        if (typeof mdlSubModels !== 'undefined' && typeof mgsHash === 'function') {
          var dnames = Object.keys(mdlSubModels);
          for (var dni = 0; dni < dnames.length; dni++) {
            var dnm = dnames[dni].replace(/\.kmd$/i, '');
            if ((mgsHash(dnm) & 0xFFFF) === ent.modelHash) { ent.model = dnm; break; }
          }
        }
      }
    } else if (t === 'WATCHER') {
      // Patrol enemy fields seen in s00a:
      // -b char (behavior char), -a char (action), -f short (FOV), -l short (sight),
      // -e procid (callback), -y byte, -s short (speed?)
      var fO = findOpt('f'), lO3 = findOpt('l'), eO3 = findOpt('e'), sO2 = findOpt('s');
      if (fO && _isShort(fO.vals[0])) { ent.fov   = _signedShort(fO.vals[0]); refs.fov   = fO.vals[0]; }
      if (lO3 && _isShort(lO3.vals[0])) { ent.sight = _signedShort(lO3.vals[0]); refs.sight = lO3.vals[0]; }
      if (eO3 && _isProcid(eO3.vals[0])) { ent.execProc = '0x' + eO3.vals[0].payload.toString(16); refs.execProc = eO3.vals[0]; }
      if (sO2 && _isShort(sO2.vals[0])) { ent.speed = _signedShort(sO2.vals[0]); refs.speed = sO2.vals[0]; }
    } else if (t === 'DYNWALL' || t === 'WALL') {
      var hOw = findOpt('h'), sOw = findOpt('s'), mWall = findOpt('m');
      if (hOw && _isShort(hOw.vals[0])) { ent.height = _signedShort(hOw.vals[0]); refs.height = hOw.vals[0]; }
      if (sOw && _isShort(sOw.vals[0])) { ent.segLen = _signedShort(sOw.vals[0]); refs.segLen = sOw.vals[0]; }
      // PSX MGS uses WALL/DYNWALL entities to position large solid objects
      // (tanks, trucks, big doors) as collidable walls. On PC GCL these were
      // OBSTACLE entities; on PSX GCX they got moved into the WALL category.
      // The -m option is a STRID (hash) that names the KMD to render at the
      // entity's -p position.
      if (mWall && mWall.vals.length > 0 && _isStrid(mWall.vals[0])) {
        ent.modelHash = mWall.vals[0].payload;
        refs.model = mWall.vals[0];
        if (typeof mdlSubModels !== 'undefined' && typeof mgsHash === 'function') {
          var wnames = Object.keys(mdlSubModels);
          for (var wni = 0; wni < wnames.length; wni++) {
            var wnm = wnames[wni].replace(/\.kmd$/i, '');
            if ((mgsHash(wnm) & 0xFFFF) === ent.modelHash) { ent.model = wnm; break; }
          }
        }
      }
    } else if (t === 'OBSTACLE' || t === 'PUT_OBJECT') {
      // GCL text version: "-m 02a_o3" supplies the KMD model name. In GCX,
      // the -m option holds a STRID (16-bit hash of the model name). Resolve
      // it against the loaded model DAR so rebuildSubModels can find the KMD
      // and place it at the entity's -p position.
      //
      // If models aren't loaded yet (GCX may be loaded before the DAR), we
      // still record the hash so rebuildSubModels can re-resolve later.
      var mO = findOpt('m');
      if (mO && mO.vals.length > 0 && _isStrid(mO.vals[0])) {
        var modelHash = mO.vals[0].payload;
        ent.modelHash = modelHash;
        refs.model = mO.vals[0];
        // Try resolving against currently loaded submodels.
        if (typeof mdlSubModels !== 'undefined' && typeof mgsHash === 'function') {
          var names = Object.keys(mdlSubModels);
          for (var ni = 0; ni < names.length; ni++) {
            var nm = names[ni];
            var basename = nm.replace(/\.kmd$/i, '');
            if ((mgsHash(basename) & 0xFFFF) === modelHash) {
              ent.model = basename;
              break;
            }
          }
        }
      }
      // PUT_OBJECT and OBSTACLE can use -s for multi-instance placement: a
      // long list of i16 shorts packed as (x, y, z, rx, ry, rz) tuples. Each
      // tuple is one placed copy of the model. This is how the engine puts
      // multiple identical objects (trucks, crates, lamps) without spawning
      // N separate chara commands. ent.pos stays whatever -p said (often 0,0,0
      // for multi-instance entries), and ent.placements holds the actual
      // positions for rendering.
      var sOpt = findOpt('s');
      if (sOpt && sOpt.vals.length >= 6) {
        var placements = [];
        var k = 0;
        while (k + 5 < sOpt.vals.length) {
          var v0 = sOpt.vals[k];
          // Stop at the first non-short val (shouldn't normally happen mid-stream)
          if (!_isShort(v0)) break;
          placements.push({
            x:  _signedShort(sOpt.vals[k]),
            y:  _signedShort(sOpt.vals[k+1]),
            z:  _signedShort(sOpt.vals[k+2]),
            rx: _signedShort(sOpt.vals[k+3]),
            ry: _signedShort(sOpt.vals[k+4]),
            rz: _signedShort(sOpt.vals[k+5]),
          });
          k += 6;
        }
        if (placements.length > 0) {
          ent.placements = placements;
          // Use the first placement as ent.pos so non-multi UI still has a coord.
          if (!ent.pos || (ent.pos.x === 0 && ent.pos.y === 0 && ent.pos.z === 0)) {
            ent.pos = { x: placements[0].x, y: placements[0].y, z: placements[0].z };
            ent.dir = { x: placements[0].rx, y: placements[0].ry, z: placements[0].rz };
          }
        }
      }
    }

    // GENERIC -m extraction. Catches every entity type not explicitly handled
    // above whose -m option carries a STRID (a hash naming a KMD). Examples
    // include BREAK_OBJECT (s17a has 7 of them with -m <intact>,<broken>),
    // DRUMCAN2 (oil drums), and any future entity type the engine adds.
    //
    // Entities whose -m is non-STRID (FADEIO -m <byte>, MGREX -m <stats>,
    // ITEM -m <string>) are naturally skipped because _isStrid() filters them
    // out. If a type-specific handler already set ent.modelHash above, we
    // don't overwrite it.
    if (typeof ent.modelHash !== 'number') {
      var mGen = findOpt('m');
      if (mGen && mGen.vals.length > 0 && _isStrid(mGen.vals[0])) {
        ent.modelHash = mGen.vals[0].payload;
        refs.model = mGen.vals[0];
        if (typeof mdlSubModels !== 'undefined' && typeof mgsHash === 'function') {
          var gnames = Object.keys(mdlSubModels);
          for (var gi = 0; gi < gnames.length; gi++) {
            var gnb = gnames[gi].replace(/\.kmd$/i, '');
            if ((mgsHash(gnb) & 0xFFFF) === ent.modelHash) { ent.model = gnb; break; }
          }
        }
      }
    }
  }

  // ---------- Main entity builder ----------

  // Walk an .gcx AST, find every CHARA command, return an array of entity
  // objects compatible with the editor's gclEntities model.
  function gcxBuildEntities(gcx) {
    var entities = [];
    if (!gcx || !gcxFindCommands) return entities;

    var charas = gcxFindCommands(gcx, { cmdId: 0x9906 });

    for (var i = 0; i < charas.length; i++) {
      var cmd = charas[i];
      var vals = cmd.payload.values;
      if (vals.length < 2 || !_isStrid(vals[0]) || !_isStrid(vals[1])) continue;

      var typeHash = vals[0].payload;
      var nameHash = vals[1].payload;
      var typeName = (typeof gcxCharaTable !== 'undefined' && gcxCharaTable[typeHash])
                       || ('UNK_0x' + typeHash.toString(16).padStart(4, '0'));

      var ent = {
        type: typeName,
        name: '0x' + nameHash.toString(16).padStart(4, '0'),  // names not yet resolvable
        // Empty defaults so 3D viewport doesn't crash
        pos: null,
        // Carry refs for write-back
        psxAstRefs: {
          typeStrid: vals[0],
          nameStrid: vals[1],
          cmd: cmd
        },
        // Keep the source for debugging / advanced editing
        psxCmd: cmd,
        psxTypeHash: typeHash,
        psxNameHash: nameHash
      };

      var group = _groupByOption(vals.slice(2));
      _applyCommonOptions(ent, group);
      _applyTypeSpecificOptions(ent, group);

      // For 3D rendering, ensure ent.pos is always defined (even if entity has no -p option).
      // When pos is derived from spawnPos, mirror the refs too so write-back targets the
      // actual SHORT Values that store the position in the AST.
      if (!ent.pos && ent.spawnPos) {
        ent.pos = { x: ent.spawnPos.x, y: ent.spawnPos.y, z: ent.spawnPos.z };
        ent.psxAstRefs.posX = ent.psxAstRefs.spawnX;
        ent.psxAstRefs.posY = ent.psxAstRefs.spawnY;
        ent.psxAstRefs.posZ = ent.psxAstRefs.spawnZ;
        ent._posDerivedFromSpawn = true;
      }
      if (!ent.pos) ent.pos = { x: 0, y: 0, z: 0 };

      // Build a raw-options string for display (compact, like the PC `.raw` field)
      var rawParts = [];
      for (var j = 0; j < group.options.length; j++) {
        var o = group.options[j];
        if (o.vals.length === 0) {
          rawParts.push('-' + o.char);
        } else {
          var bits = [];
          for (var k = 0; k < o.vals.length; k++) {
            var vv = o.vals[k];
            if (_isShort(vv)) bits.push(_signedShort(vv));
            else if (_isByte(vv)) bits.push(vv.payload);
            else if (_isStrid(vv)) bits.push('0x' + vv.payload.toString(16));
            else if (_isProcid(vv)) bits.push('p:0x' + vv.payload.toString(16));
            else bits.push('<' + vv.kind + '>');
          }
          rawParts.push('-' + o.char + ' ' + bits.join(','));
        }
      }
      ent.raw = rawParts.join('  ');

      entities.push(ent);
    }

    return entities;
  }

  // Walk entity objects, push their pos/dir/route changes back into the AST
  // via the captured psxAstRefs. Returns the count of values updated.
  function gcxWriteEntitiesBack(entities) {
    var updated = 0;
    for (var i = 0; i < entities.length; i++) {
      var ent = entities[i];
      var refs = ent.psxAstRefs;
      if (!refs) continue;

      // Position
      if (ent.pos && refs.posX) {
        _setSignedShort(refs.posX, ent.pos.x); _setSignedShort(refs.posY, ent.pos.y); _setSignedShort(refs.posZ, ent.pos.z);
        updated += 3;
      }
      // spawnPos — only write if NOT shared with posX refs (mirrored entity)
      if (ent.spawnPos && refs.spawnX && refs.spawnX !== refs.posX) {
        _setSignedShort(refs.spawnX, ent.spawnPos.x); _setSignedShort(refs.spawnY, ent.spawnPos.y); _setSignedShort(refs.spawnZ, ent.spawnPos.z);
        updated += 3;
      }
      if (ent.dir && refs.dirX) {
        _setSignedShort(refs.dirX, ent.dir.x); _setSignedShort(refs.dirY, ent.dir.y); _setSignedShort(refs.dirZ, ent.dir.z);
        updated += 3;
      }
      // Route — BYTE or SHORT
      if (typeof ent.route === 'number' && refs.route) {
        if (refs.route.tag === GCL_SHORT) _setSignedShort(refs.route, ent.route);
        else refs.route.payload = ent.route & 0xFF;
        updated += 1;
      }
      // Type-specific
      var simpleProps = {
        camLen: 'short', camWidth: 'short', camXRange: 'short',
        gunLen: 'short', gunWidth: 'short', gunXRange: 'short',
        height: 'short', leafWidth: 'short', speed: 'short',
        vOffset: 'short', vAnimExtent: 'short', segLen: 'short',
        fov: 'short', sight: 'short',
        doorType: 'byte', hzdSeg: 'byte_or_short', box: 'byte',
        itemIndex: 'byte', num: 'byte'
      };
      for (var prop in simpleProps) {
        if (!simpleProps.hasOwnProperty(prop)) continue;
        var ref = refs[prop];
        if (!ref || typeof ent[prop] !== 'number') continue;
        var kind = simpleProps[prop];
        if (kind === 'short') _setSignedShort(ref, ent[prop]);
        else if (kind === 'byte') ref.payload = ent[prop] & 0xFF;
        else if (kind === 'byte_or_short') {
          if (ref.tag === GCL_SHORT) _setSignedShort(ref, ent[prop]);
          else ref.payload = ent[prop] & 0xFF;
        }
        updated += 1;
      }
    }
    return updated;
  }

  // ---------- Exports ----------

  global.gcxBuildEntities       = gcxBuildEntities;
  global.gcxWriteEntitiesBack   = gcxWriteEntitiesBack;
  // Also export internal helpers for tests/debugging
  global._gcxGroupByOption      = _groupByOption;

})(typeof window !== 'undefined' ? window : this);

// ============================================================
