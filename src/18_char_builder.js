// ═══════════════════════════════════════════════════════════════════════════
// FILE: 18_char_builder.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ============================================================
// MGS1 Character Builder (CB_*)
// ============================================================
// Goal: take a foreign mesh (e.g. ripped from another PS1 game) and rig it
// onto Snake's skeleton, producing a KMD that plays Snake's animations.
//
// Pipeline:
//   1. Load template KMD  (provides skeleton + all the metadata MGS1 expects)
//   2. Load foreign OBJ   (the new character shape)
//   3. Align: user-controlled translate/scale/rotate to fit skeleton
//   4. Auto-bind: each vertex assigned to its nearest bone in world space
//   5. Segment: chop the foreign mesh into per-bone pieces (vertex coords
//      shifted into each bone's local frame). Faces voted to the bone where
//      most of their vertices land; cross-bone faces get vertex duplication.
//   6. Build KMD: clone the template's header + bone records (preserving every
//      unknown byte the game might check), then patch in the new mesh data and
//      update vertOfs/idxOfs/numVerts/numFaces per bone.
//
// HONEST CAVEATS:
//   - The KMD parser only reads vertex indices from face records (4 bytes each).
//     The actual MGS1 face record may carry UV/material/palette data we don't
//     map yet. Output KMDs from this tool are "geometry-only" and likely render
//     untextured (solid color) in-game.
//   - Vertex coords are i16 (±32767). The aligner clamps via user-controlled
//     scale.
//   - The "metadata preservation" claim is real for header + bone records'
//     non-mesh bytes (parent, localPos, and all unknowns are copied verbatim).
//     But mesh-data preservation is NOT — vertices and faces are overwritten.

// ─── OBJ parser ────────────────────────────────────────────────────────────
// Minimal OBJ parser: reads `v x y z` and `f i1 i2 i3 [i4]`. Ignores normals,
// UVs, materials, groups. Returns {verts: [[x,y,z],...], faces: [[i,j,k] or
// [i,j,k,l],...]} with ZERO-indexed face indices (OBJ is 1-indexed; we convert).
function CB_parseOBJ(text){
  var lines = text.split(/\r?\n/);
  var verts = [];
  var faces = [];
  for(var i = 0; i < lines.length; i++){
    var line = lines[i].trim();
    if(!line || line.charAt(0) === '#') continue;
    var parts = line.split(/\s+/);
    if(parts[0] === 'v' && parts.length >= 4){
      verts.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if(parts[0] === 'f' && parts.length >= 4){
      // Face tokens may be "1", "1/2", "1/2/3", or "1//3". We want just the
      // vertex index (first slash-separated chunk).
      var idxs = [];
      for(var j = 1; j < parts.length; j++){
        var tok = parts[j].split('/')[0];
        var idx = parseInt(tok, 10);
        if(isFinite(idx)){
          // Negative indices in OBJ count from end
          if(idx < 0) idx = verts.length + idx;
          else idx -= 1;
          idxs.push(idx);
        }
      }
      if(idxs.length === 3){
        faces.push(idxs);
      } else if(idxs.length === 4){
        faces.push(idxs);
      } else if(idxs.length > 4){
        // Fan-triangulate n-gons
        for(var k = 1; k < idxs.length - 1; k++){
          faces.push([idxs[0], idxs[k], idxs[k+1]]);
        }
      }
    }
  }
  return {verts: verts, faces: faces};
}

// ─── GLB / GLTF parser ────────────────────────────────────────────────────
// Uses THREE.GLTFLoader (must be bundled). Walks the loaded scene, extracts
// every Mesh's positions and indices, bakes the world-space transform per mesh
// into the vertex positions (so a hierarchical multi-mesh GLB collapses into
// one vertex/face list in a single coordinate frame).
//
// Skinning data, normals, UVs, textures, and materials from the GLB are
// DELIBERATELY ignored — we use Snake's skeleton + Snake's textures via the
// template KMD. The GLB contributes ONLY shape.
//
// Async because GLTFLoader.parse is callback-based. Returns a Promise that
// resolves to {verts, faces} matching CB_parseOBJ's shape.
function CB_parseGLB(arrayBuffer){
  return new Promise(function(resolve, reject){
    if(typeof THREE === 'undefined' || !THREE.GLTFLoader){
      reject(new Error("GLTFLoader not available — rebuild with GLTFLoader.js bundled"));
      return;
    }
    var loader = new THREE.GLTFLoader();
    // GLTFLoader.parse(data, path, onLoad, onError). For .glb we pass the
    // ArrayBuffer; for .gltf (text JSON) we'd pass the parsed JSON, but we
    // handle that case in the caller by reading-as-text-then-parse.
    loader.parse(arrayBuffer, '', function(gltf){
      try {
        var verts = [];
        var faces = [];
        gltf.scene.updateMatrixWorld(true);
        var meshCount = 0;
        gltf.scene.traverse(function(obj){
          if(!obj.isMesh || !obj.geometry) return;
          var geom = obj.geometry;
          var pos = geom.attributes && geom.attributes.position;
          if(!pos || pos.count === 0) return;
          meshCount++;
          var baseVertIdx = verts.length;
          // Bake world matrix into vertex positions so multi-mesh GLBs with
          // per-node transforms (rotations/scales) collapse correctly.
          var matrix = obj.matrixWorld;
          var tmp = new THREE.Vector3();
          for(var i = 0; i < pos.count; i++){
            tmp.fromBufferAttribute(pos, i);
            tmp.applyMatrix4(matrix);
            verts.push([tmp.x, tmp.y, tmp.z]);
          }
          if(geom.index){
            // Indexed geometry: every 3 indices = 1 triangle
            var idx = geom.index;
            for(var i = 0; i < idx.count; i += 3){
              if(i + 2 >= idx.count) break;
              faces.push([
                baseVertIdx + idx.getX(i),
                baseVertIdx + idx.getX(i + 1),
                baseVertIdx + idx.getX(i + 2)
              ]);
            }
          } else {
            // Non-indexed: every 3 consecutive verts = 1 triangle
            for(var i = 0; i + 2 < pos.count; i += 3){
              faces.push([baseVertIdx + i, baseVertIdx + i + 1, baseVertIdx + i + 2]);
            }
          }
        });
        if(meshCount === 0){
          reject(new Error("GLB contains no meshes (only " + gltf.scene.children.length + " scene children)"));
          return;
        }
        resolve({verts: verts, faces: faces, _meshCount: meshCount});
      } catch(err){
        reject(err);
      }
    }, function(err){
      reject(new Error("GLTFLoader error: " + (err.message || String(err))));
    });
  });
}

// Dispatch parser based on filename extension.
function CB_parseForeignMesh(file){
  var name = (file.name || '').toLowerCase();
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    if(name.endsWith('.glb')){
      fr.onload = function(ev){
        CB_parseGLB(ev.target.result).then(resolve, reject);
      };
      fr.onerror = function(){ reject(new Error("File read failed")); };
      fr.readAsArrayBuffer(file);
    } else if(name.endsWith('.gltf')){
      // GLTF (text JSON) — wrap as data URL so GLTFLoader can resolve URIs
      // (which is the canonical use case for the .gltf text format).
      fr.onload = function(ev){
        try {
          var loader = new THREE.GLTFLoader();
          loader.parse(ev.target.result, '', function(gltf){
            // Reuse the same scene-traversal logic by re-wrapping into
            // CB_parseGLB's resolved-form. Easiest: re-emit through traversal.
            var verts = [], faces = [];
            gltf.scene.updateMatrixWorld(true);
            var meshCount = 0;
            gltf.scene.traverse(function(obj){
              if(!obj.isMesh || !obj.geometry) return;
              var geom = obj.geometry;
              var pos = geom.attributes && geom.attributes.position;
              if(!pos || pos.count === 0) return;
              meshCount++;
              var baseVertIdx = verts.length;
              var matrix = obj.matrixWorld;
              var tmp = new THREE.Vector3();
              for(var i = 0; i < pos.count; i++){
                tmp.fromBufferAttribute(pos, i);
                tmp.applyMatrix4(matrix);
                verts.push([tmp.x, tmp.y, tmp.z]);
              }
              if(geom.index){
                var idx = geom.index;
                for(var i = 0; i + 2 < idx.count; i += 3){
                  faces.push([baseVertIdx+idx.getX(i), baseVertIdx+idx.getX(i+1), baseVertIdx+idx.getX(i+2)]);
                }
              } else {
                for(var i = 0; i + 2 < pos.count; i += 3){
                  faces.push([baseVertIdx+i, baseVertIdx+i+1, baseVertIdx+i+2]);
                }
              }
            });
            if(meshCount === 0){ reject(new Error("GLTF contains no meshes")); return; }
            resolve({verts: verts, faces: faces, _meshCount: meshCount});
          }, function(err){ reject(new Error("GLTFLoader error: " + (err.message||err))); });
        } catch(err){ reject(err); }
      };
      fr.onerror = function(){ reject(new Error("File read failed")); };
      fr.readAsText(file);
    } else {
      // Default to OBJ
      fr.onload = function(ev){
        try { resolve(CB_parseOBJ(ev.target.result)); }
        catch(err){ reject(err); }
      };
      fr.onerror = function(){ reject(new Error("File read failed")); };
      fr.readAsText(file);
    }
  });
}

// ─── Bone world positions (forward kinematics) ─────────────────────────────
// KMD bones store local positions relative to their parent. To bind verts to
// bones we need each bone's world-space position. Bones are listed parent-first
// in MGS1, so a single pass suffices.
//
// If the user has edited any bone's position (CB_state.editedLocalPos is set),
// we use the edited values instead of the template's. This way joint-editor
// changes propagate through FK automatically.
function CB_computeBoneWorldPositions(kmd){
  var worldPos = [];
  for(var i = 0; i < kmd.bones.length; i++){
    var lp = (CB_state.editedLocalPos && CB_state.editedLocalPos[i])
      ? CB_state.editedLocalPos[i]
      : kmd.bones[i].localPos;
    var wp = [lp[0], lp[1], lp[2]];
    var parent = kmd.bones[i].parent;
    if(parent >= 0 && parent < worldPos.length){
      wp[0] += worldPos[parent][0];
      wp[1] += worldPos[parent][1];
      wp[2] += worldPos[parent][2];
    }
    worldPos.push(wp);
  }
  return worldPos;
}

// Move a bone so it sits at the centroid of the verts currently bound to it.
// Returns true if the bone was moved, false if no bound verts. Root (bone 0)
// is intentionally skippable since it has no parent to be relative to.
function CB_centerBoneOnBoundVerts(boneIdx){
  if(!CB_state.bindings || !CB_state.foreignMesh) return false;
  if(boneIdx < 0 || boneIdx >= CB_state.templateKmd.numBones) return false;
  var worldVerts = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
  var sumX = 0, sumY = 0, sumZ = 0, count = 0;
  for(var v = 0; v < CB_state.bindings.length; v++){
    if(CB_state.bindings[v] === boneIdx){
      sumX += worldVerts[v][0];
      sumY += worldVerts[v][1];
      sumZ += worldVerts[v][2];
      count++;
    }
  }
  if(count === 0) return false;
  var centroid = [sumX/count, sumY/count, sumZ/count];
  // Move bone to centroid: new_local = centroid - parent_world.
  var parent = CB_state.templateKmd.bones[boneIdx].parent;
  var parentWorld = (parent >= 0 && parent < CB_state.boneWorldPos.length)
    ? CB_state.boneWorldPos[parent]
    : [0, 0, 0];
  CB_setLocalPos(boneIdx,
    Math.round(centroid[0] - parentWorld[0]),
    Math.round(centroid[1] - parentWorld[1]),
    Math.round(centroid[2] - parentWorld[2]));
  return true;
}

// Iteratively (1) bind each vert to nearest bone, (2) move each bone to the
// centroid of its bound verts. This is essentially K-means clustering with the
// skeleton topology preserved (parent indices unchanged). Converges in 2-3
// passes for typical meshes. Root bone is held fixed to keep the world frame
// anchored.
function CB_autoCenterAllBones(iterations){
  iterations = iterations || 3;
  if(!CB_state.foreignMesh || !CB_state.templateKmd) return;
  // Ensure we have an initial binding
  if(!CB_state.bindings){
    var worldVerts0 = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
    CB_state.bindings = CB_autoBindMesh({verts: worldVerts0, faces: CB_state.foreignMesh.faces}, CB_state.boneWorldPos, CB_state.templateKmd);
  }
  for(var iter = 0; iter < iterations; iter++){
    // Process bones — order doesn't matter for correctness because each move
    // updates worldPos via CB_setLocalPos, and children's localPos isn't
    // touched (so they follow in world space).
    for(var b = 1; b < CB_state.templateKmd.numBones; b++){
      CB_centerBoneOnBoundVerts(b);
    }
    // Rebind with the new bone positions
    var worldVerts = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
    CB_state.bindings = CB_autoBindMesh({verts: worldVerts, faces: CB_state.foreignMesh.faces}, CB_state.boneWorldPos, CB_state.templateKmd);
  }
  // Re-segment with the final bindings
  var finalVerts = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
  CB_state.segmented = CB_segmentByBindings(
    {verts: finalVerts, faces: CB_state.foreignMesh.faces},
    CB_state.bindings,
    CB_state.boneWorldPos
  );
}

// Reset all bones to the template's localPos values (clears all edits).
function CB_resetAllBones(){
  CB_state.editedLocalPos = null;
  CB_state.boneWorldPos = CB_computeBoneWorldPositions(CB_state.templateKmd);
  CB_state.bindings = null;
  CB_state.segmented = null;
}

// ─── Auto-bind: nearest bone SEGMENT for each vertex ───────────────────────
// Old version mapped each vertex to the nearest BONE POSITION (point distance),
// which mis-assigns vertices near the middle of long limbs and biases towards
// joints with many neighbors. The "right" approach used by most riggers is
// LINE distance: each bone owns the segment(s) extending from itself to its
// children. A vertex binds to the bone whose segment passes closest to it.
//
// For leaf bones (head, feet, hands), there's no child to terminate the
// segment — we extend half a parent-segment length outward, so leaf bones
// own a chunk of mesh past the last joint instead of being a single point.
//
// Result: vertices on a "limb" reliably bind to the parent of that limb's
// joint chain (head verts to head bone, shoulder verts to shoulder bone,
// hand verts to hand bone, etc.) regardless of where on the mesh they sit.
function CB_autoBindMesh(foreignMesh, boneWorldPos, kmd){
  // Fallback to point-distance binding if no skeleton hierarchy is supplied
  // (e.g., older callers or unit tests with synthetic data without bone info).
  // The hierarchical line-distance is much better for real characters because
  // it accounts for which bone "owns" the segment between two joints.
  if(!kmd || !kmd.bones){
    var bindings0 = new Array(foreignMesh.verts.length);
    for(var v0 = 0; v0 < foreignMesh.verts.length; v0++){
      var p0 = foreignMesh.verts[v0];
      var minD0 = Infinity, best0 = 0;
      for(var b0 = 0; b0 < boneWorldPos.length; b0++){
        var bp0 = boneWorldPos[b0];
        var dx0 = p0[0]-bp0[0], dy0 = p0[1]-bp0[1], dz0 = p0[2]-bp0[2];
        var d0 = dx0*dx0 + dy0*dy0 + dz0*dz0;
        if(d0 < minD0){ minD0 = d0; best0 = b0; }
      }
      bindings0[v0] = best0;
    }
    return bindings0;
  }
  // Build per-bone segment list. Standard rigging convention: a bone owns the
  // segment FROM its parent's joint TO its own joint (i.e., the "upper arm
  // bone" is owned by the elbow, extending from shoulder to elbow). This is
  // why vertices on the upper arm bind correctly to the elbow's bone.
  //
  // Leaf bones (head, hands, feet) also get an extension segment that
  // continues outward past the leaf joint, so vertices BEYOND the leaf still
  // belong to that leaf (e.g., top-of-head verts go to head bone, not stray
  // to whichever joint is geometrically closer).
  var children = boneWorldPos.map(function(){ return []; });
  for(var b = 0; b < kmd.bones.length; b++){
    var par = kmd.bones[b].parent;
    if(par >= 0 && par < children.length) children[par].push(b);
  }
  var boneSegments = [];
  for(var b = 0; b < boneWorldPos.length; b++){
    var bp = boneWorldPos[b];
    var segs = [];
    var par = kmd.bones[b].parent;
    if(par >= 0 && par < boneWorldPos.length){
      // Primary segment: parent's joint → this bone's joint
      segs.push([boneWorldPos[par], bp]);
    } else {
      // Root bone — no parent segment. Use a small point at the joint itself.
      segs.push([bp, bp]);
    }
    // Leaf extension: if this bone has no children, extend half a parent-
    // segment length outward so vertices past the joint still bind here.
    if(children[b].length === 0 && par >= 0){
      var pp = boneWorldPos[par];
      var dx = bp[0]-pp[0], dy = bp[1]-pp[1], dz = bp[2]-pp[2];
      segs.push([bp, [bp[0]+dx*0.5, bp[1]+dy*0.5, bp[2]+dz*0.5]]);
    }
    boneSegments.push(segs);
  }
  // For each vertex, find nearest segment among all bones
  var bindings = new Array(foreignMesh.verts.length);
  for(var v = 0; v < foreignMesh.verts.length; v++){
    var p = foreignMesh.verts[v];
    var minDist = Infinity, bestBone = 0;
    for(var b = 0; b < boneSegments.length; b++){
      var segs = boneSegments[b];
      for(var s = 0; s < segs.length; s++){
        var d = CB_distPointToSegmentSq(p, segs[s][0], segs[s][1]);
        if(d < minDist){ minDist = d; bestBone = b; }
      }
    }
    bindings[v] = bestBone;
  }
  return bindings;
}

// Squared distance from point p to segment [a,b]. Standard parametric clamp.
function CB_distPointToSegmentSq(p, a, b){
  var dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  var lenSq = dx*dx + dy*dy + dz*dz;
  if(lenSq < 1e-9){
    var px = p[0]-a[0], py = p[1]-a[1], pz = p[2]-a[2];
    return px*px + py*py + pz*pz;
  }
  var t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy + (p[2]-a[2])*dz) / lenSq;
  if(t < 0) t = 0;
  else if(t > 1) t = 1;
  var cx = a[0]+t*dx, cy = a[1]+t*dy, cz = a[2]+t*dz;
  var px = p[0]-cx, py = p[1]-cy, pz = p[2]-cz;
  return px*px + py*py + pz*pz;
}

// ─── Segment: build per-bone vertex/face arrays in local coordinates ───────
// For each bone, collect the verts bound to it (shifted into local frame:
// world - boneWorldPos), and the faces whose majority of vertices land on this
// bone. Cross-bone faces get vertex duplication: a vertex bound to bone X used
// in a face assigned to bone Y will be added to Y's vertex array as well.
//
// Returns: array of {verts: [[x,y,z],...], faces: [[i,j,k(,l)],...]} indexed
// by bone, with local vertex indices.
function CB_segmentByBindings(foreignMesh, bindings, boneWorldPos){
  var perBone = [];
  var remap = [];     // remap[bone][globalVertIdx] = localVertIdx
  for(var b = 0; b < boneWorldPos.length; b++){
    perBone.push({verts: [], faces: []});
    remap.push({});
  }
  // Pass 1: add each vertex to its bound bone, in local coords
  for(var v = 0; v < foreignMesh.verts.length; v++){
    var b = bindings[v];
    var bp = boneWorldPos[b];
    var fv = foreignMesh.verts[v];
    remap[b][v] = perBone[b].verts.length;
    perBone[b].verts.push([fv[0] - bp[0], fv[1] - bp[1], fv[2] - bp[2]]);
  }
  // Pass 2: assign each face to a bone (majority vote), duplicating any
  // verts that belong to a different bone.
  for(var f = 0; f < foreignMesh.faces.length; f++){
    var face = foreignMesh.faces[f];
    var voteCounts = {};
    for(var i = 0; i < face.length; i++){
      var b = bindings[face[i]];
      voteCounts[b] = (voteCounts[b] || 0) + 1;
    }
    var bestBone = -1, bestCount = -1;
    for(var b in voteCounts){
      if(voteCounts[b] > bestCount){ bestCount = voteCounts[b]; bestBone = parseInt(b); }
    }
    if(bestBone < 0) continue;
    var bp = boneWorldPos[bestBone];
    var localFace = [];
    for(var i = 0; i < face.length; i++){
      var globalIdx = face[i];
      if(remap[bestBone][globalIdx] === undefined){
        // This vertex isn't bound to bestBone — duplicate it into bestBone's
        // local frame so the face is self-contained.
        var fv = foreignMesh.verts[globalIdx];
        var localIdx = perBone[bestBone].verts.length;
        perBone[bestBone].verts.push([fv[0] - bp[0], fv[1] - bp[1], fv[2] - bp[2]]);
        remap[bestBone][globalIdx] = localIdx;
      }
      localFace.push(remap[bestBone][globalIdx]);
    }
    perBone[bestBone].faces.push(localFace);
  }
  return perBone;
}

// ─── Shared UV/material assignment ─────────────────────────────────────────
// Used by both the KMD exporter and the 3D textured-preview renderer so they
// see the same UV+material data for the same input.
//
// For each new face, computes which template face's UV+material to inherit:
//   'cycle' (default): template_face[f % numTemplateFaces]
//   'nearest':         template face whose centroid is closest (in local bone frame)
//
// Returns array of {faces4, uvs, materials} indexed by bone. faces4[f] is a
// 4-tuple of vertex indices (triangles stored as quads with last==prev). uvs[f]
// is a 4-element array of [tu,tv] pairs (u8 each). materials[f] is the u16
// material command.
function CB_assignUVsMaterials(perBoneMeshes, templateKmd, strategy){
  strategy = strategy || 'cycle';
  var result = [];
  for(var b = 0; b < templateKmd.numBones; b++){
    var m = perBoneMeshes[b];
    var tmplBone = templateKmd.bones[b];
    // Normalize faces to quads
    var faces4 = m.faces.map(function(face){
      if(face.length === 4) return face.slice();
      if(face.length === 3) return [face[0], face[1], face[2], face[2]];
      throw new Error("Bone "+b+" face has "+face.length+" verts (expected 3 or 4)");
    });
    var templateNumFaces = tmplBone.numFaces;
    var templateUVs = tmplBone.uvs;
    var templateMats = tmplBone.materials;
    var uvs = [];
    var materials = [];
    if(templateNumFaces === 0 || templateUVs.length === 0 || templateMats.length === 0){
      // Template bone has no mesh OR no UV/material data — emit defaults
      for(var f = 0; f < faces4.length; f++){
        uvs.push([[0,0],[0,0],[0,0],[0,0]]);
        materials.push(0xFE0A);
      }
    } else if(strategy === 'nearest'){
      // Compute template face centroids in local bone frame
      var tCentroids = [];
      for(var tf = 0; tf < templateNumFaces; tf++){
        var tFace = tmplBone.faceVerts[tf];
        var cx=0,cy=0,cz=0, nc=0, seen = {};
        for(var k = 0; k < 4; k++){
          if(seen[tFace[k]]) continue;
          seen[tFace[k]] = 1;
          var tv = tmplBone.verts[tFace[k]];
          if(tv){ cx += tv[0]; cy += tv[1]; cz += tv[2]; nc++; }
        }
        if(nc > 0){ cx /= nc; cy /= nc; cz /= nc; }
        tCentroids.push([cx, cy, cz]);
      }
      for(var f = 0; f < faces4.length; f++){
        var face = faces4[f];
        var cx=0,cy=0,cz=0, nc=0, seen2 = {};
        for(var k = 0; k < 4; k++){
          if(seen2[face[k]]) continue;
          seen2[face[k]] = 1;
          var v = m.verts[face[k]];
          if(v){ cx += v[0]; cy += v[1]; cz += v[2]; nc++; }
        }
        if(nc > 0){ cx /= nc; cy /= nc; cz /= nc; }
        var bestIdx = 0, bestDist = Infinity;
        for(var tf = 0; tf < tCentroids.length; tf++){
          var dx=cx-tCentroids[tf][0], dy=cy-tCentroids[tf][1], dz=cz-tCentroids[tf][2];
          var d=dx*dx+dy*dy+dz*dz;
          if(d<bestDist){ bestDist=d; bestIdx=tf; }
        }
        uvs.push(templateUVs[bestIdx].map(function(uv){ return [uv[0], uv[1]]; }));
        materials.push(templateMats[bestIdx]);
      }
    } else {
      // 'cycle'
      for(var f = 0; f < faces4.length; f++){
        var ti = f % templateNumFaces;
        uvs.push(templateUVs[ti].map(function(uv){ return [uv[0], uv[1]]; }));
        materials.push(templateMats[ti]);
      }
    }
    // Apply per-face UV overrides from the UV editor (if any). These take
    // precedence over template-inherited UVs and are written into the exported
    // KMD verbatim.
    if(typeof CB_state !== 'undefined' && CB_state.faceUVOverrides && CB_state.faceUVOverrides[b]){
      var ov = CB_state.faceUVOverrides[b];
      for(var fKey in ov){
        var fi = parseInt(fKey);
        if(fi >= 0 && fi < uvs.length){
          // Defensive copy
          uvs[fi] = ov[fKey].map(function(uv){ return [uv[0], uv[1]]; });
        }
      }
    }
    // Apply per-face material overrides (user-reassigned material IDs)
    if(typeof CB_state !== 'undefined' && CB_state.faceMaterialOverrides && CB_state.faceMaterialOverrides[b]){
      var mov = CB_state.faceMaterialOverrides[b];
      for(var fKey in mov){
        var fi = parseInt(fKey);
        if(fi >= 0 && fi < materials.length){
          materials[fi] = mov[fKey] & 0xFFFF;
        }
      }
    }
    result.push({faces4: faces4, uvs: uvs, materials: materials});
  }
  return result;
}

// ─── Map material IDs to DAR texture indices (heuristic) ───────────────────
// Each PSX GPU material command in the KMD (e.g. 0xFE0A) corresponds to a
// specific texture page in VRAM. The DAR archive contents are uploaded to
// those pages by the game at load time, but the mapping isn't recorded in any
// metadata we can read — we'd need to disassemble MGS1 to know which material
// ID is "the chest material" vs "the head material".
//
// Heuristic: for each material, find the bone that uses it most. Bones follow
// the standard MGS humanoid layout (root, hip, arms, head, legs). Each bone
// has an implied body part name; pick the DAR texture whose filename matches.
//
// This is APPROXIMATE — it gets the right region of the body but not always
// the exact texture variant (chest1 vs chest2 vs chest3). User can override
// per-material via the override panel.
function CB_buildMaterialTextureMap(){
  if(!CB_state.templateKmd || typeof TX_state === 'undefined' || TX_state.textures.length === 0){
    return {};
  }
  // Count material × bone usage
  var matBoneCounts = {};
  for(var b = 0; b < CB_state.templateKmd.bones.length; b++){
    var bone = CB_state.templateKmd.bones[b];
    if(!bone.materials) continue;
    for(var f = 0; f < bone.materials.length; f++){
      var m = bone.materials[f];
      if(!matBoneCounts[m]) matBoneCounts[m] = {};
      matBoneCounts[m][b] = (matBoneCounts[m][b] || 0) + 1;
    }
  }
  // Standard MGS humanoid bone → body part hint. Snake's KMD layout:
  // 0=root, 1=hip/torso, 2-4=left arm, 5-6=head/neck, 7-10=right arm/face,
  // 11-13=left leg, 14-15=right leg. PCX filenames in stg_tex4.dar use names
  // like 'sna_hip', 'sna_chest', 'sna_arm', 'sna_hand', 'sna_face', 'sna_hed',
  // 'sna_leg', 'sna_boot', 'sna_neck'.
  var boneHints = [
    'hip',   'chest', 'arm',   'arm',   'hand',
    'face',  'hed',   'arm',   'arm',   'face',
    'hand',  'leg',   'leg',   'boot',  'leg', 'boot'
  ];
  var result = {};
  // Find any decoded texture for fallback
  var fallbackIdx = -1;
  for(var t = 0; t < TX_state.textures.length; t++){
    if(TX_state.textures[t].decoded){ fallbackIdx = t; break; }
  }
  for(var matStr in matBoneCounts){
    var domBone = 0, maxCount = 0;
    for(var b in matBoneCounts[matStr]){
      if(matBoneCounts[matStr][b] > maxCount){
        maxCount = matBoneCounts[matStr][b];
        domBone = parseInt(b);
      }
    }
    var hint = boneHints[domBone] || '';
    var matched = -1;
    if(hint){
      for(var t = 0; t < TX_state.textures.length; t++){
        if(TX_state.textures[t].decoded && TX_state.textures[t].name.toLowerCase().indexOf(hint) >= 0){
          matched = t; break;
        }
      }
    }
    if(matched < 0) matched = fallbackIdx;
    result[matStr] = matched;
  }
  // Apply user overrides from CB_state.materialOverrides (if any)
  if(CB_state.materialOverrides){
    for(var k in CB_state.materialOverrides){
      result[k] = CB_state.materialOverrides[k];
    }
  }
  return result;
}

// Create a THREE.DataTexture from a decoded PCX. Cached on the texture record
// so we don't recreate it every frame.
function CB_createThreeTexture(decoded){
  if(!decoded || !decoded.pixels) return null;
  // DataTexture wants a Uint8Array, not Uint8ClampedArray
  var data = new Uint8Array(decoded.pixels.buffer.slice(
    decoded.pixels.byteOffset,
    decoded.pixels.byteOffset + decoded.pixels.byteLength
  ));
  var tex = new THREE.DataTexture(data, decoded.width, decoded.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;  // PS1 has no filtering — keep crisp pixels
  tex.minFilter = THREE.NearestFilter;
  // UV coords in KMDs reach into 0-255 range (tpage coords) — frequently exceed
  // texture dimensions because they reference a tpage region we don't model.
  // Repeat wrapping gives a non-broken result instead of clamped streaks.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false;  // KMD UV origin is top-left (Y-down) — match Three.js
  tex.needsUpdate = true;
  return tex;
}

// Build a THREE.DataTexture from a foreign texture (PNG/PCX upload). For
// preview accuracy with what the DAR export will produce, we apply the same
// resize-to-slot-dimensions + 16-color quantization that the encoder does,
// so the user sees the actual quality loss. The quantization is reversed for
// display (each pixel painted with its quantized palette color).
function CB_createForeignThreeTexture(foreign, targetW, targetH){
  if(!foreign || !foreign.rgba) return null;
  // Step 1: resize to slot dimensions (matches what TX_buildReplacementDAR does)
  var resized;
  if(foreign.width === targetW && foreign.height === targetH){
    resized = foreign.rgba;
  } else {
    resized = TX_resizeRGBA(foreign.rgba, foreign.width, foreign.height, targetW, targetH);
  }
  // Step 2: median-cut quantize to 16 colors (lossy, but matches what gets
  // written into the new PCX so the preview is honest)
  var quant = TX_quantizeToPalette(resized, targetW, targetH, 16);
  // Step 3: reconstruct RGBA from quantized indices + palette
  var rgba = new Uint8Array(targetW * targetH * 4);
  for(var i = 0; i < targetW * targetH; i++){
    var idx = quant.indices[i];
    rgba[i*4]   = quant.palette[idx*3];
    rgba[i*4+1] = quant.palette[idx*3+1];
    rgba[i*4+2] = quant.palette[idx*3+2];
    rgba[i*4+3] = (idx === 0 ? 0 : 255);  // index 0 = transparent
  }
  var tex = new THREE.DataTexture(rgba, targetW, targetH, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Get the THREE.Texture to use for a given material ID. Priority:
//   1. If the matched Snake slot has a foreign override (via TX_state.matches),
//      use the foreign pixels (resized+quantized to preview the export accurately)
//   2. Otherwise use Snake's own PCX pixels
//   3. Returns null if no match found
// Both kinds get cached on their source record so we don't reallocate on every
// scene rebuild.
function CB_getTextureForMaterial(matToTex, matId){
  var slotIdx = matToTex[matId];
  if(slotIdx === undefined || slotIdx < 0 || !TX_state.textures[slotIdx]) return null;
  var slot = TX_state.textures[slotIdx];
  if(!slot.decoded) return null;
  // Foreign override path: user mapped a foreign texture to this Snake slot
  var foreignIdx = TX_state.matches[slot.name];
  if(foreignIdx !== undefined && foreignIdx !== null && TX_state.foreignTextures[foreignIdx]){
    var foreign = TX_state.foreignTextures[foreignIdx];
    if(!foreign._threeTexture){
      foreign._threeTexture = CB_createForeignThreeTexture(foreign, slot.decoded.width, slot.decoded.height);
    }
    return foreign._threeTexture;
  }
  // Snake fallback
  if(!slot._threeTexture){
    slot._threeTexture = CB_createThreeTexture(slot.decoded);
  }
  return slot._threeTexture;
}

// ─── KMD writer (PHASE 2: texture-preserving) ─────────────────────────────
// Build a new character KMD that the game will accept as Snake (or whichever
// template). Preserves: header bytes (32) verbatim; per-bone flags / parent /
// localPos / unk30 / unk54 / unk extents verbatim. Recomputes: per-bone bbox
// to match new mesh. Rewrites: vertices, vertex face indices, normals, normal
// face indices, UVs, materials.
//
// UVs and materials must come from SOMEWHERE — without them the game renders
// nothing. Two strategies are supported per the caller's choice:
//   'cycle' (default): for each new face f, copy template_face[f % numFacesTemplate]'s
//                      UV quad and material. Result: textured but UVs are
//                      arbitrarily mapped — model loads and shows pieces of the
//                      template's textures stretched across the new geometry.
//                      Good for verifying the pipeline; user can refine UVs later.
//   'nearest':         for each new face, find the spatially nearest template face
//                      (by centroid distance in local bone frame) and copy its UV
//                      and material. Result: more coherent texture mapping when
//                      the new mesh is roughly shaped like the template.
//
// Normals are RECOMPUTED from the new geometry (no inheritance needed): face
// normal via cross product of edge vectors, then averaged per-vertex for smooth
// shading, scaled to magnitude 4096.
function CB_buildKMD(templateBytes, perBoneMeshes, opts){
  opts = opts || {};
  var uvStrategy = opts.uvStrategy || 'cycle';   // 'cycle' or 'nearest'
  var editedLocalPos = opts.editedLocalPos || null;  // array of [x,y,z] per bone, or null
  var u8src = new Uint8Array(templateBytes);
  // Re-parse template to get its full per-bone data (we need UVs/materials
  // from somewhere). The parser preserves all unknown bytes too.
  var template = AT_parseCharKMD(u8src);
  if(perBoneMeshes.length !== template.numBones){
    throw new Error("perBoneMeshes length " + perBoneMeshes.length + " ≠ template bone count " + template.numBones);
  }

  var HEADER_SIZE = 0x20;
  var BONE_STRIDE = 88;

  // Compute per-bone normals and UV/material assignment for the new geometry
  var clamped = 0;
  function clampI16(v){
    if(v > 32767){ clamped++; return 32767; }
    if(v < -32768){ clamped++; return -32768; }
    return Math.round(v);
  }

  // Compute UV+material assignment once (shared with 3D renderer)
  var assignments = CB_assignUVsMaterials(perBoneMeshes, template, uvStrategy);

  var newBoneData = [];
  for(var b = 0; b < template.numBones; b++){
    var m = perBoneMeshes[b];
    var tmplBone = template.bones[b];
    var asn = assignments[b];
    var faces4 = asn.faces4;
    var uvs = asn.uvs;
    var materials = asn.materials;

    // --- Compute per-vertex smooth normals from new geometry ---
    // Sum face normals per vertex, then normalize and scale to 4096.
    var vertNormalsAcc = m.verts.map(function(){ return [0,0,0]; });
    for(var f = 0; f < faces4.length; f++){
      var face = faces4[f];
      // Use the triangle made of corners 0,1,2 (quad's first triangle)
      var v0 = m.verts[face[0]], v1 = m.verts[face[1]], v2 = m.verts[face[2]];
      if(!v0 || !v1 || !v2) continue;
      var e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      var e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      var nx = e1[1]*e2[2] - e1[2]*e2[1];
      var ny = e1[2]*e2[0] - e1[0]*e2[2];
      var nz = e1[0]*e2[1] - e1[1]*e2[0];
      var nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if(nLen < 1e-9) continue;
      var inv = 1/nLen;
      nx *= inv; ny *= inv; nz *= inv;
      // Add this normal to each of the 4 corner vertices (3 unique if tri)
      var seen = {};
      for(var k = 0; k < 4; k++){
        if(seen[face[k]]) continue;
        seen[face[k]] = 1;
        vertNormalsAcc[face[k]][0] += nx;
        vertNormalsAcc[face[k]][1] += ny;
        vertNormalsAcc[face[k]][2] += nz;
      }
    }
    // Normalize accumulated normals, scale to 4096 (PSX convention)
    var normals = vertNormalsAcc.map(function(n){
      var len = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]);
      if(len < 1e-9) return [0, 0, 4095];  // fallback for orphan verts
      var s = 4095 / len;
      return [Math.round(n[0]*s), Math.round(n[1]*s), Math.round(n[2]*s)];
    });
    // For each face, normal indices = vertex indices (we have one normal per vert);
    // preserve the high-bit (0x80) MSB from template since the game seems to check it.
    var faceNormals = faces4.map(function(face){
      return [face[0] | 0x80, face[1] | 0x80, face[2] | 0x80, face[3] | 0x80];
    });

    // --- Compute new bbox (6 i16 at +0x08-0x13) ---
    var minX=0,minY=0,minZ=0,maxX=0,maxY=0,maxZ=0;
    if(m.verts.length > 0){
      minX=maxX=m.verts[0][0]; minY=maxY=m.verts[0][1]; minZ=maxZ=m.verts[0][2];
      for(var v = 1; v < m.verts.length; v++){
        var vv = m.verts[v];
        if(vv[0]<minX) minX=vv[0]; if(vv[0]>maxX) maxX=vv[0];
        if(vv[1]<minY) minY=vv[1]; if(vv[1]>maxY) maxY=vv[1];
        if(vv[2]<minZ) minZ=vv[2]; if(vv[2]>maxZ) maxZ=vv[2];
      }
    }
    var newBboxBytes = new Uint8Array(12);
    var bboxDv = new DataView(newBboxBytes.buffer);
    bboxDv.setInt16(0, clampI16(minX), true);
    bboxDv.setInt16(2, clampI16(minY), true);
    bboxDv.setInt16(4, clampI16(minZ), true);
    bboxDv.setInt16(6, clampI16(maxX), true);
    bboxDv.setInt16(8, clampI16(maxY), true);
    bboxDv.setInt16(10, clampI16(maxZ), true);

    newBoneData.push({
      faces4: faces4,
      normals: normals,
      faceNormals: faceNormals,
      uvs: uvs,
      materials: materials,
      newBboxBytes: newBboxBytes
    });
  }

  // --- Compute byte layout ---
  // Per bone, sections in order: verts, vertex face indices, normals, normal
  // face indices, UVs, materials, then 2-byte alignment after materials.
  var bonePlan = [];
  var cursor = HEADER_SIZE + template.numBones * BONE_STRIDE;
  for(var b = 0; b < template.numBones; b++){
    var m = perBoneMeshes[b];
    var nd = newBoneData[b];
    var vertCount = m.verts.length;
    var faceCount = nd.faces4.length;
    var normCount = nd.normals.length;
    var p = {};
    p.vertOfs   = vertCount > 0 ? cursor : 0;
    cursor += vertCount * 8;
    p.faceVtxOfs= faceCount > 0 ? cursor : 0;
    cursor += faceCount * 4;
    p.normOfs   = normCount > 0 ? cursor : 0;
    cursor += normCount * 8;
    p.faceNrmOfs= faceCount > 0 ? cursor : 0;
    cursor += faceCount * 4;
    p.uvOfs     = faceCount > 0 ? cursor : 0;
    cursor += faceCount * 8;
    p.matOfs    = faceCount > 0 ? cursor : 0;
    cursor += faceCount * 2;
    // Align to 4 bytes after materials (observed in template)
    if(cursor & 3) cursor += 4 - (cursor & 3);
    p.vertCount = vertCount;
    p.faceCount = faceCount;
    p.normCount = normCount;
    bonePlan.push(p);
  }
  var totalSize = cursor;
  var out = new Uint8Array(totalSize);
  var dvOut = new DataView(out.buffer);

  // Header verbatim
  out.set(u8src.subarray(0, HEADER_SIZE));

  // Bone records: copy template's 88 bytes, then patch in: numFaces, numVerts,
  // numNorms, all 6 offsets, and the recomputed bbox.
  for(var b = 0; b < template.numBones; b++){
    var srcBase = HEADER_SIZE + b * BONE_STRIDE;
    var dstBase = HEADER_SIZE + b * BONE_STRIDE;
    out.set(u8src.subarray(srcBase, srcBase + BONE_STRIDE), dstBase);
    var p = bonePlan[b];
    var nd = newBoneData[b];
    dvOut.setUint32(dstBase + 0x04, p.faceCount, true);  // numFaces
    out.set(nd.newBboxBytes, dstBase + 0x08);            // bbox (6 i16)
    // unk14_1F (3 u32) preserved verbatim from template — likely bbox extents
    // but we don't know how to recompute them. The user's working ninja
    // CHANGED these per bone, but the engine probably tolerates the template's
    // values since the geometry roughly fits within the same envelope. If
    // testing reveals issues, we can recompute.
    // localPos: write edited value if present, else preserve template's. The
    // template bytes are already copied; only overwrite when editedLocalPos
    // has an explicit override for this bone.
    if(editedLocalPos && editedLocalPos[b]){
      dvOut.setInt32(dstBase + 0x20, editedLocalPos[b][0] | 0, true);
      dvOut.setInt32(dstBase + 0x24, editedLocalPos[b][1] | 0, true);
      dvOut.setInt32(dstBase + 0x28, editedLocalPos[b][2] | 0, true);
    }
    dvOut.setUint32(dstBase + 0x34, p.vertCount, true);  // numVerts
    dvOut.setUint32(dstBase + 0x38, p.vertOfs, true);    // vertOfs
    dvOut.setUint32(dstBase + 0x3C, p.faceVtxOfs, true); // faceVtxOfs
    dvOut.setUint32(dstBase + 0x40, p.normCount, true);  // numNorms
    dvOut.setUint32(dstBase + 0x44, p.normOfs, true);    // normOfs
    dvOut.setUint32(dstBase + 0x48, p.faceNrmOfs, true); // faceNrmOfs
    dvOut.setUint32(dstBase + 0x4C, p.uvOfs, true);      // uvOfs
    dvOut.setUint32(dstBase + 0x50, p.matOfs, true);     // matOfs
    // unk54 stays 0
  }

  // Mesh data
  for(var b = 0; b < template.numBones; b++){
    var m = perBoneMeshes[b];
    var nd = newBoneData[b];
    var p = bonePlan[b];
    // Verts (i16 x,y,z + u16 w=0xFFFF)
    for(var v = 0; v < m.verts.length; v++){
      var off = p.vertOfs + v * 8;
      dvOut.setInt16(off, clampI16(m.verts[v][0]), true);
      dvOut.setInt16(off + 2, clampI16(m.verts[v][1]), true);
      dvOut.setInt16(off + 4, clampI16(m.verts[v][2]), true);
      dvOut.setUint16(off + 6, 0xFFFF, true);
    }
    // Vertex face indices (4 u8 per face)
    for(var f = 0; f < nd.faces4.length; f++){
      var face = nd.faces4[f];
      if(face[0] > 255 || face[1] > 255 || face[2] > 255 || face[3] > 255){
        throw new Error("Bone " + b + " face " + f + " has vertex index > 255 (KMD limit per bone is 255 verts)");
      }
      var off = p.faceVtxOfs + f * 4;
      out[off]   = face[0];
      out[off+1] = face[1];
      out[off+2] = face[2];
      out[off+3] = face[3];
    }
    // Normals
    for(var n = 0; n < nd.normals.length; n++){
      var off = p.normOfs + n * 8;
      dvOut.setInt16(off, clampI16(nd.normals[n][0]), true);
      dvOut.setInt16(off + 2, clampI16(nd.normals[n][1]), true);
      dvOut.setInt16(off + 4, clampI16(nd.normals[n][2]), true);
      dvOut.setUint16(off + 6, 0, true);
    }
    // Normal face indices
    for(var f = 0; f < nd.faceNormals.length; f++){
      var off = p.faceNrmOfs + f * 4;
      out[off]   = nd.faceNormals[f][0];
      out[off+1] = nd.faceNormals[f][1];
      out[off+2] = nd.faceNormals[f][2];
      out[off+3] = nd.faceNormals[f][3];
    }
    // UVs (4 per face, u8 tu/tv each)
    for(var f = 0; f < nd.uvs.length; f++){
      var off = p.uvOfs + f * 8;
      for(var k = 0; k < 4; k++){
        out[off + k*2]   = nd.uvs[f][k][0] & 0xFF;
        out[off + k*2+1] = nd.uvs[f][k][1] & 0xFF;
      }
    }
    // Materials (u16 per face)
    for(var f = 0; f < nd.materials.length; f++){
      dvOut.setUint16(p.matOfs + f * 2, nd.materials[f] & 0xFFFF, true);
    }
  }

  return {bytes: out, clampedVerts: clamped, totalSize: totalSize, bonePlan: bonePlan};
}

// ─── State ─────────────────────────────────────────────────────────────────
var CB_state = {
  templateKmd: null,        // parsed (via AT_parseCharKMD) — provides .bones[]
  templateBytes: null,      // raw bytes for KMD writing
  templateFilename: null,
  foreignMesh: null,        // {verts, faces} from OBJ/GLB
  foreignFilename: null,
  // Transform applied to foreignMesh before binding/export. World-space verts =
  // R(rotY) * (S * v) + T.
  xform: {tx: 0, ty: 0, tz: 0, scale: 1.0, rotY: 0},
  bindings: null,           // bindings[v] = boneIdx (after auto-bind)
  segmented: null,          // per-bone {verts, faces} (after segmentation)
  boneWorldPos: null,
  // Joint editor: per-bone localPos overrides. null = use template values
  // unmodified. When the user edits any bone, this array gets initialized to a
  // copy of the template's localPos values, then per-bone edits are written in
  // place. Children automatically inherit the new positions via FK because
  // localPos is parent-relative.
  editedLocalPos: null,
  selectedBoneIdx: 0,       // which bone the editor panel is editing
  showMesh: true,           // viewport visibility flag (Mesh checkbox)
  showSkeleton: true,       // viewport visibility flag (Skeleton checkbox)
  wireframe: false,         // viewport visibility flag (Wireframe checkbox)
  showTextures: true,       // viewport visibility flag (Textures checkbox)
  // Material → DAR texture index overrides. Heuristic in CB_buildMaterialTextureMap
  // assigns a default; user can override per-material via the materials panel.
  materialOverrides: {},
  // Currently-highlighted material (set when user clicks a face). Triangles with
  // this material are rendered with an outline overlay so the user sees which
  // faces share that material.
  selectedMaterial: null,
  // Per-face UV overrides: faceUVOverrides[boneIdx][faceIdx] = [[tu,tv]×4].
  // Set by the UV editor. CB_assignUVsMaterials consults this AFTER computing
  // template-inherited UVs, so user-edited UVs take precedence.
  faceUVOverrides: {},
  // Per-face material overrides: faceMaterialOverrides[boneIdx][faceIdx] = matId.
  // User reassigns faces from one material to another (e.g. fixing a face that
  // got auto-assigned to chest but visually belongs to shoulder). Applied
  // after template inheritance in CB_assignUVsMaterials.
  faceMaterialOverrides: {},
  // Face-selection state. selectedFaces is keyed "boneIdx:faceIdx" → true.
  // editFacesMode controls whether plain clicks in the viewport pick faces vs
  // orbit the camera.
  editFacesMode: false,
  selectedFaces: {},
  // When a material is selected AND isolation is on, hide all other material
  // groups so the user can focus on just the chest/head/whatever faces.
  isolateMaterial: false,
  // Active face within the selected material (used by UV editor — clicking a
  // face's UV quad on the editor canvas makes that face's quad editable).
  activeFaceRef: null,    // {bone, face}
  // Active corner of the active face's UV quad (for handle drag).
  activeUVCorner: null,   // {bone, face, corner}
  panelEl: null,
  renderer: null,
  scene: null,
  camera: null,
  cameraOrbit: {yaw: 0.5, pitch: 0.3, dist: 600, target: [0, -50, 0]},
  meshGroup: null,
  skeletonGroup: null,
  needsRender: true
};

// Get a bone's effective localPos (edited override or template default).
function CB_getLocalPos(boneIdx){
  if(CB_state.editedLocalPos && CB_state.editedLocalPos[boneIdx]){
    return CB_state.editedLocalPos[boneIdx];
  }
  return CB_state.templateKmd.bones[boneIdx].localPos;
}

// Set a bone's localPos override. Initializes the override array on first edit
// so the template's data is never modified in place.
function CB_setLocalPos(boneIdx, x, y, z){
  if(!CB_state.editedLocalPos){
    CB_state.editedLocalPos = CB_state.templateKmd.bones.map(function(b){
      return [b.localPos[0], b.localPos[1], b.localPos[2]];
    });
  }
  CB_state.editedLocalPos[boneIdx] = [x, y, z];
  // Recompute world positions for everyone (FK)
  CB_state.boneWorldPos = CB_computeBoneWorldPositions(CB_state.templateKmd);
}

function CB_transformVerts(verts, x){
  var c = Math.cos(x.rotY), s = Math.sin(x.rotY);
  var out = [];
  for(var i = 0; i < verts.length; i++){
    var v = verts[i];
    var sx = v[0] * x.scale, sy = v[1] * x.scale, sz = v[2] * x.scale;
    out.push([
      sx * c + sz * s + x.tx,
      sy + x.ty,
      -sx * s + sz * c + x.tz
    ]);
  }
  return out;
}

// ─── UI ────────────────────────────────────────────────────────────────────
function openCharBuilder(){
  if(CB_state.panelEl){ CB_state.panelEl.style.display = 'flex'; return; }
  var el = document.createElement('div');
  el.id = 'charBuilderPanel';
  el.style.cssText = 'position:fixed;inset:0;background:#0a0e14;color:#cde;z-index:9999;display:flex;flex-direction:column;font-family:monospace;font-size:11px';
  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0d1219;border-bottom:1px solid #1a2535">'+
      '<div style="font-size:13px;font-weight:bold;color:#7cf">🧍 MGS1 Character Builder</div>'+
      '<div style="flex:1;color:#666;font-size:10px">Rig a foreign mesh onto Snake\'s skeleton. Inherits template\'s UVs &amp; materials so it loads textured in-game.</div>'+
      '<button id="cbClose" class="btn" style="font-size:11px;padding:4px 10px">✕ Close</button>'+
    '</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      // Left column: controls
      '<div style="width:340px;border-right:1px solid #1a2535;display:flex;flex-direction:column;overflow-y:auto">'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">1. Template KMD</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Snake or another 16-bone character. Provides skeleton + metadata.</div>'+
          '<input type="file" id="cbTemplateInput" accept=".kmd" style="width:100%;font-size:10px;color:#aac">'+
          '<div id="cbTemplateInfo" style="color:#666;font-size:9px;margin-top:4px;font-style:italic">(no file loaded)</div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">2. Foreign mesh (OBJ / GLB / GLTF)</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Export from Blender/Maya/Sketchfab/etc. For GLB: all meshes are merged into one shape; node transforms are baked in; skinning/UVs/materials are ignored (we use Snake\'s).</div>'+
          '<input type="file" id="cbForeignInput" accept=".obj,.glb,.gltf" style="width:100%;font-size:10px;color:#aac">'+
          '<div id="cbForeignInfo" style="color:#666;font-size:9px;margin-top:4px;font-style:italic">(no file loaded)</div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">3. Align foreign mesh</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:6px">Adjust until the mesh roughly overlays the skeleton.</div>'+
          CB_makeSlider('Scale', 'cbScale', 0.01, 100, 0.01, 1.0)+
          CB_makeSlider('Tx', 'cbTx', -2000, 2000, 1, 0)+
          CB_makeSlider('Ty', 'cbTy', -2000, 2000, 1, 0)+
          CB_makeSlider('Tz', 'cbTz', -2000, 2000, 1, 0)+
          CB_makeSlider('Rot Y°', 'cbRotY', -180, 180, 1, 0)+
          '<button id="cbAutoFit" class="btn" style="background:#1f3050;color:#8be;padding:3px 8px;font-size:10px;width:100%;margin-top:6px">📐 Auto-fit (match bounds)</button>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">3.5 Joint editor <span style="color:#666;font-weight:normal">(optional)</span></div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:6px">Move skeleton joints to fit the mesh — children follow automatically. Use after aligning the mesh and before binding.</div>'+
          '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">'+
            '<span style="color:#888;font-size:10px;min-width:42px">Bone:</span>'+
            '<select id="cbBoneSelect" style="flex:1;background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:2px 4px;font-family:monospace;font-size:10px">'+
              '<option value="-1">(load template first)</option>'+
            '</select>'+
          '</div>'+
          '<div id="cbBoneEditRows">'+
            CB_makeSlider('X', 'cbBoneX', -2000, 2000, 1, 0)+
            CB_makeSlider('Y', 'cbBoneY', -2000, 2000, 1, 0)+
            CB_makeSlider('Z', 'cbBoneZ', -2000, 2000, 1, 0)+
          '</div>'+
          '<div style="display:flex;gap:4px;margin-bottom:4px">'+
            '<button id="cbBoneReset" class="btn" style="background:#1a2a3a;color:#cde;padding:3px 6px;font-size:10px;flex:1" title="Reset just this bone to its template position">↺ Reset bone</button>'+
            '<button id="cbBoneCenter" class="btn" style="background:#1f3050;color:#8be;padding:3px 6px;font-size:10px;flex:1" title="Move this bone to the centroid of verts currently bound to it (requires prior auto-bind)">📍 Center on bound verts</button>'+
          '</div>'+
          '<div style="display:flex;gap:4px">'+
            '<button id="cbAutoCenter" class="btn" style="background:#1f5040;color:#8eb;padding:3px 6px;font-size:10px;flex:1" title="Bind, then move each bone to its bound verts\' centroid, then re-bind, repeated 3 times. Like k-means clustering. Run after aligning to make bones snap to body part centers.">🎯 Auto-center all</button>'+
            '<button id="cbResetAll" class="btn" style="background:#3a2515;color:#fc8;padding:3px 6px;font-size:10px;flex:1" title="Discard all joint edits and restore the template\'s original bone positions">↺ Reset all bones</button>'+
          '</div>'+
          '<div id="cbBoneEditMsg" style="color:#666;font-size:9px;margin-top:4px;font-style:italic"></div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">4. Bind &amp; export</div>'+
          '<button id="cbBindBtn" class="btn" style="background:#1f5040;color:#8eb;padding:4px 8px;font-size:10px;width:100%;margin-bottom:6px">🔗 Auto-bind to nearest bone</button>'+
          '<div id="cbBindInfo" style="color:#666;font-size:9px;margin-bottom:8px;font-style:italic">(bind to see per-bone breakdown)</div>'+
          '<div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">'+
            '<span style="color:#888;font-size:10px;min-width:60px">UV strategy:</span>'+
            '<select id="cbUvStrategy" style="background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:2px 4px;font-family:monospace;font-size:10px;flex:1">'+
              '<option value="cycle">Cycle (faster, repeats template UVs)</option>'+
              '<option value="nearest" selected>Nearest (better, matches by 3D position)</option>'+
            '</select>'+
          '</div>'+
          '<div style="display:flex;gap:4px">'+
            '<button id="cbExportJson" class="btn" style="background:#1a2a3a;color:#cde;padding:3px 6px;font-size:10px;flex:1" title="Exports binding + per-bone meshes as JSON. Useful for inspection or for feeding into another tool.">📄 JSON</button>'+
            '<button id="cbExportKmd" class="btn" style="background:#3a5040;color:#8eb;padding:3px 6px;font-size:10px;flex:1" title="Produces a textured KMD that should load in-game with template\'s textures applied via inherited UVs and materials. Normals computed from geometry. Header / bone hierarchy / metadata preserved from template.">🧪 KMD (textured)</button>'+
          '</div>'+
          '<div id="cbExportMsg" style="color:#666;font-size:9px;margin-top:4px;font-style:italic"></div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">5. Textures (template DAR or PCX bundle)</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Snake\'s DAR archive (preferred), OR drop in multiple individual PCX files as an alternative.</div>'+
          '<input type="file" id="cbDarInput" accept=".dar,.pcx" multiple style="width:100%;font-size:10px;color:#aac">'+
          '<div id="cbDarInfo" style="color:#666;font-size:9px;margin-top:4px;font-style:italic">(no DAR loaded)</div>'+
          '<div id="cbTextureGrid" style="margin-top:6px;max-height:200px;overflow-y:auto;background:#050810;border:1px solid #1a2535;border-radius:2px;min-height:40px"></div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">7. Material → texture map</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Ctrl+Click a face on the mesh to select its material group. Override which texture each material samples — that\'s the "group all chest faces" workflow.</div>'+
          '<div id="cbMatMsg" style="color:#666;font-size:9px;margin-bottom:4px;font-style:italic">(load template + DAR + bind to populate)</div>'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none;font-size:10px;color:#aab;margin-bottom:4px" title="Hide all other material groups so you can focus on just the selected one (Blender-style focus mode)">'+
            '<input type="checkbox" id="cbIsolateMaterial"> Isolate selected material (hide other parts)'+
          '</label>'+
          '<div id="cbMaterialsPanel" style="max-height:240px;overflow-y:auto;background:#050810;border:1px solid #1a2535;border-radius:2px;min-height:40px"></div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">8. UV editor</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Select a material (Ctrl+Click face). Canvas shows that material\'s texture with each face\'s UV quad overlaid. Drag corners to adjust where on the texture each face samples from.</div>'+
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">'+
            '<button id="cbUvAutoPlanar" class="btn" style="background:#1f3050;color:#8be;padding:3px 6px;font-size:9px" title="Project the material\'s faces onto a 2D plane (front view) and use that as UV. Good first pass for flat-ish body parts like chest, face.">📐 Auto: planar XY</button>'+
            '<button id="cbUvAutoFit" class="btn" style="background:#1f3050;color:#8be;padding:3px 6px;font-size:9px" title="Stretch all quads of this material to span the full texture extents — useful when template UVs use only a small corner.">↔ Stretch to fit</button>'+
            '<button id="cbUvReset" class="btn" style="background:#3a2515;color:#fc8;padding:3px 6px;font-size:9px" title="Revert this material\'s faces back to template-inherited UVs (cycle/nearest from your strategy choice).">↺ Reset</button>'+
          '</div>'+
          '<canvas id="cbUvCanvas" width="280" height="280" style="background:#050810;border:1px solid #1a2535;border-radius:2px;width:100%;display:block;image-rendering:pixelated;cursor:crosshair"></canvas>'+
          '<div id="cbUvMsg" style="color:#666;font-size:9px;margin-top:4px;font-style:italic">(no material selected)</div>'+
        '</div>'+
        '<div style="padding:8px 10px;border-bottom:1px solid #1a2535">'+
          '<div style="color:#7cf;font-weight:bold;margin-bottom:6px">6. Your textures (PNG / JPG / PCX)</div>'+
          '<div style="color:#888;font-size:10px;margin-bottom:4px">Drop in textures from your character. The tool will auto-match each to a Snake slot by dimensions and resize as needed. PCX accepted directly (decoded with own palette).</div>'+
          '<input type="file" id="cbForeignTexInput" accept="image/*,.pcx" multiple style="width:100%;font-size:10px;color:#aac">'+
          '<div id="cbForeignTexInfo" style="color:#666;font-size:9px;margin-top:4px;font-style:italic">(no textures loaded)</div>'+
          '<div style="display:flex;align-items:center;gap:4px;margin-top:4px">'+
            '<span style="color:#888;font-size:10px;min-width:80px">Resize quality:</span>'+
            '<select id="cbResizeQuality" style="background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:2px 4px;font-family:monospace;font-size:10px;flex:1" title="How to scale foreign textures down to Snake\'s slot dimensions. Nearest preserves sharp pixel-art edges; bilinear/bicubic give smoother results on photographic textures.">'+
              '<option value="nearest" selected>Nearest (sharp, pixel art)</option>'+
              '<option value="bilinear">Bilinear (smooth, mid-quality)</option>'+
              '<option value="bicubic">Bicubic (smoothest, photographic)</option>'+
            '</select>'+
          '</div>'+
          '<div style="display:flex;gap:4px;margin-top:6px">'+
            '<button id="cbAutoMatchBtn" class="btn" style="background:#1f3050;color:#8be;padding:3px 6px;font-size:10px;flex:1" title="For each Snake slot, find the closest-matching foreign texture by dimensions. Greedy assignment.">🔗 Auto-match</button>'+
            '<button id="cbExportDarBtn" class="btn" style="background:#3a5040;color:#8eb;padding:3px 6px;font-size:10px;flex:1" title="Build new DAR with foreign textures encoded as PCX in the corresponding Snake slots. Unmatched slots keep their original Snake texture.">💾 Export DAR</button>'+
          '</div>'+
          '<div id="cbMatchPanel" style="margin-top:6px;max-height:280px;overflow-y:auto;background:#050810;border:1px solid #1a2535;border-radius:2px;min-height:40px"></div>'+
          '<div id="cbExportDarMsg" style="color:#666;font-size:9px;margin-top:4px;font-style:italic"></div>'+
        '</div>'+
      '</div>'+
      // Right column: 3D viewport
      '<div id="cbViewport" style="flex:1;position:relative;background:#050810">'+
        '<div style="position:absolute;top:8px;left:8px;color:#cde;font-size:10px;z-index:5;background:rgba(10,14,20,0.85);padding:6px 10px;border-radius:2px;display:flex;gap:12px;align-items:center">'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none">'+
            '<input type="checkbox" id="cbToggleMesh" checked> Mesh'+
          '</label>'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none">'+
            '<input type="checkbox" id="cbToggleSkel" checked> Skeleton'+
          '</label>'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none" title="Show vertex normals when bound (proves the binding picked sensible groups)">'+
            '<input type="checkbox" id="cbToggleWire"> Wireframe'+
          '</label>'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none" title="Apply Snake\'s textures (or whatever DAR is loaded) to the mesh using inherited UVs/materials">'+
            '<input type="checkbox" id="cbToggleTex" checked> Textures'+
          '</label>'+
          '<div style="width:1px;height:14px;background:#1a2535"></div>'+
          '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none;color:#7cf;font-weight:bold" title="Toggle face-selection mode. When on, plain click on the mesh selects/deselects faces. Mesh forced solid (wireframe disabled) for clear face picking.">'+
            '<input type="checkbox" id="cbToggleEditFaces"> ✎ Edit Faces'+
          '</label>'+
          '<div id="cbSelCount" style="color:#0fc;font-size:10px;font-weight:bold"></div>'+
        '</div>'+
        '<div style="position:absolute;top:8px;right:8px;color:#666;font-size:10px;z-index:5;background:rgba(10,14,20,0.7);padding:4px 8px;border-radius:2px">'+
          'Drag = orbit | Wheel = zoom | Shift+Click bone = select for edit'+
        '</div>'+
        '<div style="position:absolute;bottom:8px;left:8px;color:#7cf;font-size:10px;z-index:5;background:rgba(10,14,20,0.7);padding:4px 8px;border-radius:2px" id="cbLegend">'+
          'Bones: <span style="color:#0cf">cyan</span>=default · <span style="color:#fc0">yellow</span>=selected · <span style="color:#f6c">pink</span>=edited · Mesh: white wireframe / colored after bind'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(el);
  CB_state.panelEl = el;
  CB_wireUI();
  CB_setupViewport();
  CB_render();
}

function CB_makeSlider(label, id, min, max, step, val){
  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'+
    '<span style="min-width:42px;color:#888;font-size:10px">'+label+':</span>'+
    '<input type="range" id="'+id+'_range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" style="flex:1">'+
    '<input type="number" id="'+id+'_num" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" style="width:60px;background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:2px 4px;font-family:monospace;font-size:10px">'+
  '</div>';
}

function CB_wireUI(){
  document.getElementById('cbClose').onclick = function(){ CB_state.panelEl.style.display = 'none'; };
  document.getElementById('cbTemplateInput').onchange = function(e){
    var f = e.target.files[0]; if(!f) return;
    var fr = new FileReader();
    fr.onload = function(ev){
      try {
        var bytes = new Uint8Array(ev.target.result);
        CB_state.templateBytes = bytes;
        CB_state.templateKmd = AT_parseCharKMD(bytes);
        CB_state.templateFilename = f.name;
        CB_state.editedLocalPos = null;  // discard any prior edits
        CB_state.selectedBoneIdx = 0;
        CB_state.boneWorldPos = CB_computeBoneWorldPositions(CB_state.templateKmd);
        document.getElementById('cbTemplateInfo').textContent =
          f.name + ' · ' + CB_state.templateKmd.numBones + ' bones';
        CB_syncBoneEditInputs();
        CB_rebuildScene();
        CB_state.needsRender = true;
      } catch(err){
        document.getElementById('cbTemplateInfo').textContent = 'Error: ' + err.message;
        document.getElementById('cbTemplateInfo').style.color = '#f88';
      }
    };
    fr.readAsArrayBuffer(f);
  };
  document.getElementById('cbForeignInput').onchange = function(e){
    var f = e.target.files[0]; if(!f) return;
    document.getElementById('cbForeignInfo').textContent = 'Loading ' + f.name + '…';
    document.getElementById('cbForeignInfo').style.color = '#888';
    CB_parseForeignMesh(f).then(function(mesh){
      CB_state.foreignMesh = mesh;
      CB_state.foreignFilename = f.name;
      CB_state.bindings = null;
      CB_state.segmented = null;
      var meshInfo = mesh._meshCount ? ' (' + mesh._meshCount + ' sub-mesh' + (mesh._meshCount === 1 ? '' : 'es') + ' merged)' : '';
      document.getElementById('cbForeignInfo').textContent =
        f.name + ' · ' + mesh.verts.length + ' verts · ' + mesh.faces.length + ' faces' + meshInfo;
      document.getElementById('cbForeignInfo').style.color = '#8eb';
      document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
      CB_rebuildScene();
      CB_state.needsRender = true;
    }, function(err){
      document.getElementById('cbForeignInfo').textContent = 'Error: ' + (err.message || err);
      document.getElementById('cbForeignInfo').style.color = '#f88';
    });
  };
  // Slider wiring — bidirectional sync between range and number inputs
  var sliders = [['cbScale','scale'],['cbTx','tx'],['cbTy','ty'],['cbTz','tz'],['cbRotY','rotY']];
  sliders.forEach(function(s){
    var rangeEl = document.getElementById(s[0]+'_range');
    var numEl = document.getElementById(s[0]+'_num');
    function update(val){
      rangeEl.value = val; numEl.value = val;
      if(s[1] === 'rotY') CB_state.xform[s[1]] = parseFloat(val) * Math.PI / 180;
      else CB_state.xform[s[1]] = parseFloat(val);
      CB_state.bindings = null;
      CB_state.segmented = null;
      document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
      CB_rebuildScene();
      CB_state.needsRender = true;
    }
    rangeEl.oninput = function(e){ update(e.target.value); };
    numEl.oninput  = function(e){ update(e.target.value); };
  });
  document.getElementById('cbAutoFit').onclick = CB_autoFit;
  document.getElementById('cbBindBtn').onclick = CB_doAutoBind;
  document.getElementById('cbExportJson').onclick = CB_doExportJson;
  document.getElementById('cbExportKmd').onclick = CB_doExportKmd;
  // Viewport visibility toggles. Mesh hides the foreign-mesh THREE.Mesh so the
  // skeleton is unobstructed for joint editing. Skeleton hides the bone spheres
  // and parent-child lines so the mesh can be inspected without interference.
  // Wireframe shows the mesh as line edges only — useful for seeing internal
  // geometry through solid surfaces.
  var meshToggle = document.getElementById('cbToggleMesh');
  var skelToggle = document.getElementById('cbToggleSkel');
  var wireToggle = document.getElementById('cbToggleWire');
  meshToggle.onchange = function(e){
    CB_state.showMesh = e.target.checked;
    if(CB_state.meshGroup) CB_state.meshGroup.visible = CB_state.showMesh;
    CB_state.needsRender = true;
  };
  skelToggle.onchange = function(e){
    CB_state.showSkeleton = e.target.checked;
    if(CB_state.skeletonGroup) CB_state.skeletonGroup.visible = CB_state.showSkeleton;
    CB_state.needsRender = true;
  };
  wireToggle.onchange = function(e){
    CB_state.wireframe = e.target.checked;
    // Need to rebuild materials — wireframe is a per-Material flag in Three.js.
    // Rebuilding the scene is the cheapest way.
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
  var texToggle = document.getElementById('cbToggleTex');
  if(texToggle){
    texToggle.onchange = function(e){
      CB_state.showTextures = e.target.checked;
      CB_rebuildScene();
      CB_state.needsRender = true;
    };
  }
  // Edit Faces toggle — when on, plain clicks pick faces from the mesh
  // (instead of orbit-dragging the camera). Wireframe is forced off so faces
  // appear as solid triangles, much easier to target with the cursor.
  var editFacesToggle = document.getElementById('cbToggleEditFaces');
  if(editFacesToggle){
    editFacesToggle.onchange = function(e){
      CB_state.editFacesMode = e.target.checked;
      // Reflect mode in viewport cursor
      var vp = document.getElementById('cbViewport');
      if(vp) vp.style.cursor = CB_state.editFacesMode ? 'crosshair' : '';
      // If user enabled edit mode while wireframe was on, turn wireframe off
      if(CB_state.editFacesMode && CB_state.wireframe){
        CB_state.wireframe = false;
        var wireToggleEl = document.getElementById('cbToggleWire');
        if(wireToggleEl) wireToggleEl.checked = false;
      }
      CB_rebuildScene();
      CB_state.needsRender = true;
    };
  }
  // UV strategy dropdown also affects the 3D preview now (textured rendering
  // uses the same assignment logic as the KMD exporter, so changing the
  // strategy needs to repaint the mesh too).
  var uvStratEl = document.getElementById('cbUvStrategy');
  if(uvStratEl){
    uvStratEl.onchange = function(){
      CB_rebuildScene();
      CB_state.needsRender = true;
      // UV editor depends on the assignment too — refresh it
      if(typeof CB_renderUVEditor === 'function') CB_renderUVEditor();
    };
  }
  // Isolation toggle: hide all material groups except the selected one
  var isolateChk = document.getElementById('cbIsolateMaterial');
  if(isolateChk){
    isolateChk.onchange = function(e){
      CB_state.isolateMaterial = e.target.checked;
      CB_rebuildScene();
      CB_state.needsRender = true;
    };
  }
  // UV editor canvas: drag corners of UV quads to retarget faces on the texture
  var uvCanvas = document.getElementById('cbUvCanvas');
  if(uvCanvas){
    var dragging = false;
    uvCanvas.addEventListener('mousedown', function(e){
      var rect = uvCanvas.getBoundingClientRect();
      var cx = (e.clientX - rect.left) * (uvCanvas.width / rect.width);
      var cy = (e.clientY - rect.top) * (uvCanvas.height / rect.height);
      // CB_uvEditorPickCorner returns a {bone, face, corner} ref if click is
      // on a UV quad corner, or null if not. Sets it as active drag target.
      var hit = CB_uvEditorPickCorner(cx, cy);
      if(hit){
        CB_state.activeFaceRef = {bone: hit.bone, face: hit.face};
        CB_state.activeUVCorner = hit;
        dragging = true;
        CB_renderUVEditor();
      } else {
        // Try selecting a quad (click inside)
        var faceHit = CB_uvEditorPickFace(cx, cy);
        if(faceHit){
          CB_state.activeFaceRef = faceHit;
          CB_state.activeUVCorner = null;
        } else {
          CB_state.activeFaceRef = null;
          CB_state.activeUVCorner = null;
        }
        CB_renderUVEditor();
      }
    });
    uvCanvas.addEventListener('mousemove', function(e){
      if(!dragging || !CB_state.activeUVCorner) return;
      var rect = uvCanvas.getBoundingClientRect();
      var cx = (e.clientX - rect.left) * (uvCanvas.width / rect.width);
      var cy = (e.clientY - rect.top) * (uvCanvas.height / rect.height);
      CB_uvEditorSetCornerFromCanvas(CB_state.activeUVCorner, cx, cy);
      // Live update 3D viewport so user sees texture warping as they drag
      CB_rebuildScene();
      CB_state.needsRender = true;
      CB_renderUVEditor();
    });
    var endDrag = function(){ dragging = false; };
    uvCanvas.addEventListener('mouseup', endDrag);
    uvCanvas.addEventListener('mouseleave', endDrag);
  }
  // Auto-fit buttons
  var autoPlanarBtn = document.getElementById('cbUvAutoPlanar');
  if(autoPlanarBtn){
    autoPlanarBtn.onclick = function(){ CB_uvAutoFit('planar'); };
  }
  var autoStretchBtn = document.getElementById('cbUvAutoFit');
  if(autoStretchBtn){
    autoStretchBtn.onclick = function(){ CB_uvAutoFit('stretch'); };
  }
  var uvResetBtn = document.getElementById('cbUvReset');
  if(uvResetBtn){
    uvResetBtn.onclick = function(){ CB_uvResetSelected(); };
  }
  // DAR (texture archive) loader. Decodes all PCX entries and renders them in
  // the texture grid. This is preview only for now; applying textures to the
  // 3D mesh (proper material → texture mapping + atlas-aware UVs) is the next
  // phase. Without a precise material ID → DAR entry mapping for MGS1 yet, the
  // exported KMD keeps cycling/nearest UVs from the template, which means the
  // game uses Snake's TEXPAGE setup and shows Snake's textures.
  var darInput = document.getElementById('cbDarInput');
  if(darInput){
    darInput.onchange = function(e){
      var files = Array.from(e.target.files || []);
      if(files.length === 0) return;
      var info = document.getElementById('cbDarInfo');
      // Branch by what was uploaded:
      //   - 1 .dar file → parseDAR
      //   - 1 or more .pcx files → loadPCXBundle (treat as if they were a DAR)
      //   - mixed → error
      var isDAR = (files.length === 1 && /\.dar$/i.test(files[0].name));
      var allPCX = files.every(function(f){ return /\.pcx$/i.test(f.name); });
      var afterLoad = function(textureCount, decodedCount, failedCount, label){
        info.textContent = label + ' · ' + textureCount + ' textures · ' + decodedCount + ' decoded' +
          (failedCount > 0 ? ' · ' + failedCount + ' failed' : '');
        info.style.color = failedCount > 0 ? '#fc8' : '#8eb';
        TX_renderBrowser(document.getElementById('cbTextureGrid'));
        for(var i = 0; i < TX_state.textures.length; i++) TX_state.textures[i]._threeTexture = null;
        CB_rebuildScene();
        CB_state.needsRender = true;
        if(typeof CB_renderMaterialsPanel === "function") CB_renderMaterialsPanel(); if(typeof CB_renderUVEditor === "function") CB_renderUVEditor();
        if(TX_state.foreignTextures.length > 0){
          TX_autoMatchByDimensions();
          CB_renderMatchPanel();
        }
      };
      if(isDAR){
        info.textContent = 'Reading ' + files[0].name + '…'; info.style.color = '#888';
        var fr = new FileReader();
        fr.onload = function(ev){
          try {
            var textures = TX_loadDAR(new Uint8Array(ev.target.result), files[0].name);
            var ok = 0, fail = 0;
            for(var i = 0; i < textures.length; i++) (textures[i].decoded ? ok++ : fail++);
            afterLoad(textures.length, ok, fail, files[0].name);
          } catch(err){
            info.textContent = 'Error: ' + err.message; info.style.color = '#f88';
          }
        };
        fr.onerror = function(){ info.textContent = 'File read failed'; info.style.color = '#f88'; };
        fr.readAsArrayBuffer(files[0]);
      } else if(allPCX){
        info.textContent = 'Reading ' + files.length + ' PCX files…'; info.style.color = '#888';
        TX_loadPCXBundle(files).then(function(records){
          var ok = 0, fail = 0;
          for(var i = 0; i < records.length; i++) (records[i].decoded ? ok++ : fail++);
          afterLoad(records.length, ok, fail, '(' + files.length + ' PCX files)');
        }, function(err){
          info.textContent = 'Error: ' + err.message; info.style.color = '#f88';
        });
      } else {
        info.textContent = 'Mixed file types. Either upload 1 .dar OR multiple .pcx files.';
        info.style.color = '#f88';
      }
    };
  }
  // Foreign texture upload (one or more PNG/JPG files)
  var ftxInput = document.getElementById('cbForeignTexInput');
  if(ftxInput){
    ftxInput.onchange = function(e){
      var files = Array.from(e.target.files || []);
      if(files.length === 0) return;
      var info = document.getElementById('cbForeignTexInfo');
      info.textContent = 'Loading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…';
      info.style.color = '#888';
      Promise.all(files.map(function(f){ return TX_loadForeignImage(f); }))
        .then(function(loaded){
          // Replace (don't append) — easier UX: drag in all your textures at once
          TX_state.foreignTextures = loaded;
          var sizes = loaded.map(function(t){ return t.width + 'x' + t.height; });
          info.textContent = loaded.length + ' loaded: ' + sizes.slice(0, 6).join(', ') +
            (sizes.length > 6 ? ', ...' : '');
          info.style.color = '#8eb';
          // If DAR is loaded, do an immediate auto-match so the user sees results
          if(TX_state.textures.length > 0){
            TX_autoMatchByDimensions();
            CB_renderMatchPanel();
            // Invalidate any cached foreign textures (none yet, but be safe)
            for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
              TX_state.foreignTextures[fi]._threeTexture = null;
            }
            // Rebuild scene so foreign textures appear on mesh
            CB_rebuildScene();
            CB_state.needsRender = true;
          } else {
            CB_renderMatchPanel();
          }
        }, function(err){
          info.textContent = 'Error: ' + (err.message || err);
          info.style.color = '#f88';
        });
    };
  }
  var autoMatchBtn = document.getElementById('cbAutoMatchBtn');
  if(autoMatchBtn){
    autoMatchBtn.onclick = function(){
      if(TX_state.textures.length === 0 || TX_state.foreignTextures.length === 0){
        document.getElementById('cbExportDarMsg').textContent = 'Load both Snake DAR and foreign textures first';
        document.getElementById('cbExportDarMsg').style.color = '#f88';
        return;
      }
      TX_autoMatchByDimensions();
      CB_renderMatchPanel();
      for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
        TX_state.foreignTextures[fi]._threeTexture = null;
      }
      CB_rebuildScene();
      CB_state.needsRender = true;
    };
  }
  var exportDarBtn = document.getElementById('cbExportDarBtn');
  if(exportDarBtn){
    exportDarBtn.onclick = function(){
      var msg = document.getElementById('cbExportDarMsg');
      if(TX_state.textures.length === 0){
        msg.textContent = 'Load Snake DAR first';
        msg.style.color = '#f88'; return;
      }
      if(Object.keys(TX_state.matches).length === 0){
        msg.textContent = 'No matches set — upload foreign textures and click Auto-match';
        msg.style.color = '#f88'; return;
      }
      try {
        var result = TX_buildReplacementDAR();
        var blob = new Blob([result.bytes], {type: 'application/octet-stream'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (TX_state.darFilename || 'textures').replace(/\.dar$/i, '') + '_custom.dar';
        a.click();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        msg.textContent = '✓ DAR downloaded · ' + result.stats.replaced + ' replaced, ' +
          result.stats.kept + ' kept, ' + result.stats.skipped + ' skipped · ' +
          result.bytes.length + ' bytes';
        msg.style.color = '#8eb';
      } catch(err){
        msg.textContent = '✗ Export failed: ' + err.message;
        msg.style.color = '#f88';
      }
    };
  }
  // Resize quality dropdown — affects how foreign textures get scaled when
  // they don't match a Snake slot's dimensions. Invalidates the foreign
  // texture cache so the change is visible immediately in the 3D preview.
  var resizeQEl = document.getElementById('cbResizeQuality');
  if(resizeQEl){
    resizeQEl.onchange = function(e){
      TX_state.resizeQuality = e.target.value;
      for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
        TX_state.foreignTextures[fi]._threeTexture = null;
      }
      CB_rebuildScene();
      CB_state.needsRender = true;
      if(typeof CB_renderUVEditor === 'function') CB_renderUVEditor();
    };
  }
  // Joint editor wiring
  document.getElementById('cbBoneSelect').onchange = function(e){
    CB_state.selectedBoneIdx = parseInt(e.target.value);
    CB_syncBoneEditInputs();
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
  var boneAxisInputs = [['cbBoneX', 0], ['cbBoneY', 1], ['cbBoneZ', 2]];
  boneAxisInputs.forEach(function(pair){
    var rangeEl = document.getElementById(pair[0]+'_range');
    var numEl = document.getElementById(pair[0]+'_num');
    function update(val){
      if(CB_state.selectedBoneIdx < 0 || !CB_state.templateKmd) return;
      rangeEl.value = val; numEl.value = val;
      var idx = CB_state.selectedBoneIdx;
      var curr = CB_getLocalPos(idx).slice();
      curr[pair[1]] = parseFloat(val) || 0;
      CB_setLocalPos(idx, curr[0], curr[1], curr[2]);
      // Joint moved — bindings are stale. Don't auto-rebind (could be slow on
      // big meshes if user is dragging the slider); just mark for re-bind.
      CB_state.bindings = null;
      CB_state.segmented = null;
      document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
      document.getElementById('cbBoneEditMsg').textContent = 'Bone '+idx+' moved. Click 🔗 Auto-bind to re-segment.';
      document.getElementById('cbBoneEditMsg').style.color = '#fc8';
      CB_rebuildScene();
      CB_state.needsRender = true;
    }
    rangeEl.oninput = function(e){ update(e.target.value); };
    numEl.oninput = function(e){ update(e.target.value); };
  });
  document.getElementById('cbBoneReset').onclick = function(){
    if(CB_state.selectedBoneIdx < 0 || !CB_state.templateKmd) return;
    var idx = CB_state.selectedBoneIdx;
    var tmplLP = CB_state.templateKmd.bones[idx].localPos;
    if(CB_state.editedLocalPos){
      CB_state.editedLocalPos[idx] = [tmplLP[0], tmplLP[1], tmplLP[2]];
    }
    CB_state.boneWorldPos = CB_computeBoneWorldPositions(CB_state.templateKmd);
    CB_state.bindings = null; CB_state.segmented = null;
    CB_syncBoneEditInputs();
    document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
    document.getElementById('cbBoneEditMsg').textContent = 'Bone '+idx+' reset to template position';
    document.getElementById('cbBoneEditMsg').style.color = '#8eb';
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
  document.getElementById('cbBoneCenter').onclick = function(){
    if(CB_state.selectedBoneIdx < 0 || !CB_state.bindings){
      document.getElementById('cbBoneEditMsg').textContent = 'Auto-bind first (so we know which verts to center on)';
      document.getElementById('cbBoneEditMsg').style.color = '#f88';
      return;
    }
    var idx = CB_state.selectedBoneIdx;
    var moved = CB_centerBoneOnBoundVerts(idx);
    if(!moved){
      document.getElementById('cbBoneEditMsg').textContent = 'Bone '+idx+' has no bound verts';
      document.getElementById('cbBoneEditMsg').style.color = '#f88';
      return;
    }
    CB_state.bindings = null; CB_state.segmented = null;
    CB_syncBoneEditInputs();
    document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
    document.getElementById('cbBoneEditMsg').textContent = 'Bone '+idx+' centered. Re-bind to update.';
    document.getElementById('cbBoneEditMsg').style.color = '#8eb';
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
  document.getElementById('cbAutoCenter').onclick = function(){
    if(!CB_state.foreignMesh || !CB_state.templateKmd){
      document.getElementById('cbBoneEditMsg').textContent = 'Load template and mesh first';
      document.getElementById('cbBoneEditMsg').style.color = '#f88';
      return;
    }
    CB_autoCenterAllBones(3);
    CB_syncBoneEditInputs();
    // Update binding info to reflect post-center bindings
    var lines = [];
    for(var b = 0; b < CB_state.segmented.length; b++){
      var s = CB_state.segmented[b];
      if(s.verts.length > 0 || s.faces.length > 0){
        lines.push('bone '+b+': '+s.verts.length+'v '+s.faces.length+'f');
      }
    }
    document.getElementById('cbBindInfo').textContent = lines.slice(0,10).join(', ') + (lines.length > 10 ? ', ...' : '');
    document.getElementById('cbBoneEditMsg').textContent = '✓ Auto-centered (3 iter). Joints moved to body part centers.';
    document.getElementById('cbBoneEditMsg').style.color = '#8eb';
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
  document.getElementById('cbResetAll').onclick = function(){
    CB_resetAllBones();
    CB_syncBoneEditInputs();
    document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
    document.getElementById('cbBoneEditMsg').textContent = '✓ All bones reset to template positions';
    document.getElementById('cbBoneEditMsg').style.color = '#8eb';
    CB_rebuildScene();
    CB_state.needsRender = true;
  };
}

// Repopulate the bone dropdown and sync the X/Y/Z inputs to the selected bone.
function CB_syncBoneEditInputs(){
  var sel = document.getElementById('cbBoneSelect');
  if(!sel || !CB_state.templateKmd) return;
  // Rebuild options if count changed
  if(sel.options.length !== CB_state.templateKmd.numBones){
    sel.innerHTML = '';
    for(var i = 0; i < CB_state.templateKmd.numBones; i++){
      var b = CB_state.templateKmd.bones[i];
      var opt = document.createElement('option');
      opt.value = i;
      var edited = (CB_state.editedLocalPos && CB_state.editedLocalPos[i] &&
        (CB_state.editedLocalPos[i][0] !== b.localPos[0] ||
         CB_state.editedLocalPos[i][1] !== b.localPos[1] ||
         CB_state.editedLocalPos[i][2] !== b.localPos[2])) ? ' ✱' : '';
      opt.textContent = 'Bone '+i+' (parent: '+b.parent+')'+edited;
      sel.appendChild(opt);
    }
    sel.value = Math.max(0, Math.min(CB_state.selectedBoneIdx, CB_state.templateKmd.numBones-1));
  } else {
    // Just refresh the edited-marker
    for(var i = 0; i < CB_state.templateKmd.numBones; i++){
      var b = CB_state.templateKmd.bones[i];
      var edited = (CB_state.editedLocalPos && CB_state.editedLocalPos[i] &&
        (CB_state.editedLocalPos[i][0] !== b.localPos[0] ||
         CB_state.editedLocalPos[i][1] !== b.localPos[1] ||
         CB_state.editedLocalPos[i][2] !== b.localPos[2])) ? ' ✱' : '';
      sel.options[i].textContent = 'Bone '+i+' (parent: '+b.parent+')'+edited;
    }
  }
  // Sync inputs to selected bone's current localPos
  var idx = CB_state.selectedBoneIdx;
  if(idx < 0 || idx >= CB_state.templateKmd.numBones) return;
  var lp = CB_getLocalPos(idx);
  ['cbBoneX', 'cbBoneY', 'cbBoneZ'].forEach(function(id, k){
    var rangeEl = document.getElementById(id+'_range');
    var numEl   = document.getElementById(id+'_num');
    if(rangeEl) rangeEl.value = lp[k];
    if(numEl)   numEl.value = lp[k];
  });
}

// Auto-fit: compute foreign mesh bbox, compute skeleton bbox, scale + translate
// foreign to match skeleton's center & height. Gives a sensible starting point;
// user can tweak.
function CB_autoFit(){
  if(!CB_state.foreignMesh || !CB_state.boneWorldPos){
    document.getElementById('cbExportMsg').textContent = 'Load both template KMD and foreign OBJ first';
    document.getElementById('cbExportMsg').style.color = '#f88';
    return;
  }
  // Bounds of foreign mesh (in its own coord space)
  var fb = CB_bounds(CB_state.foreignMesh.verts);
  // Bounds of skeleton bone world positions
  var sb = CB_bounds(CB_state.boneWorldPos);
  var fh = fb.max[1] - fb.min[1];     // foreign height (Y)
  var sh = sb.max[1] - sb.min[1];     // skeleton height (Y)
  var scale = (fh > 0 && sh > 0) ? (sh / fh) : 1;
  var fcx = (fb.min[0] + fb.max[0]) / 2;
  var fcz = (fb.min[2] + fb.max[2]) / 2;
  var scx = (sb.min[0] + sb.max[0]) / 2;
  var scz = (sb.min[2] + sb.max[2]) / 2;
  // After scaling, foreign min Y becomes fb.min[1] * scale; we want to shift
  // so that becomes sb.min[1].
  var tx = scx - fcx * scale;
  var ty = sb.min[1] - fb.min[1] * scale;
  var tz = scz - fcz * scale;
  function setVal(id, val){
    var ds = ['cbScale','cbTx','cbTy','cbTz','cbRotY'];
    if(ds.indexOf(id) < 0) return;
    document.getElementById(id+'_range').value = val;
    document.getElementById(id+'_num').value = val.toFixed(3);
  }
  setVal('cbScale', scale);
  setVal('cbTx', tx);
  setVal('cbTy', ty);
  setVal('cbTz', tz);
  CB_state.xform = {tx: tx, ty: ty, tz: tz, scale: scale, rotY: 0};
  setVal('cbRotY', 0);
  CB_state.bindings = null;
  CB_state.segmented = null;
  document.getElementById('cbBindInfo').textContent = '(re-bind needed)';
  CB_rebuildScene();
  CB_state.needsRender = true;
}

function CB_bounds(verts){
  if(verts.length === 0) return {min:[0,0,0],max:[0,0,0]};
  var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for(var i = 0; i < verts.length; i++){
    for(var j = 0; j < 3; j++){
      if(verts[i][j] < min[j]) min[j] = verts[i][j];
      if(verts[i][j] > max[j]) max[j] = verts[i][j];
    }
  }
  return {min: min, max: max};
}

function CB_doAutoBind(){
  if(!CB_state.foreignMesh || !CB_state.templateKmd){
    document.getElementById('cbExportMsg').textContent = 'Load both files first';
    document.getElementById('cbExportMsg').style.color = '#f88';
    return;
  }
  var transformedVerts = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
  CB_state.bindings = CB_autoBindMesh({verts: transformedVerts, faces: CB_state.foreignMesh.faces}, CB_state.boneWorldPos, CB_state.templateKmd);
  CB_state.segmented = CB_segmentByBindings(
    {verts: transformedVerts, faces: CB_state.foreignMesh.faces},
    CB_state.bindings,
    CB_state.boneWorldPos
  );
  // Summary: verts and faces per bone
  var lines = [];
  for(var b = 0; b < CB_state.segmented.length; b++){
    var s = CB_state.segmented[b];
    if(s.verts.length > 0 || s.faces.length > 0){
      lines.push('bone ' + b + ': ' + s.verts.length + 'v ' + s.faces.length + 'f');
    }
  }
  // Check for KMD limits
  var overLimit = [];
  for(var b = 0; b < CB_state.segmented.length; b++){
    if(CB_state.segmented[b].verts.length > 255){
      overLimit.push('bone ' + b + ' (' + CB_state.segmented[b].verts.length + ' > 255)');
    }
  }
  var info = lines.slice(0, 10).join(', ') + (lines.length > 10 ? ', ... ('+lines.length+' bones total)' : '');
  if(overLimit.length > 0){
    info += ' · ⚠ over 255-vert KMD limit: ' + overLimit.join(', ');
  }
  document.getElementById('cbBindInfo').textContent = info;
  CB_rebuildScene();
  CB_state.needsRender = true;
  // Materials panel needs the segmented data to show texture assignments
  if(typeof CB_renderMaterialsPanel === "function") CB_renderMaterialsPanel(); if(typeof CB_renderUVEditor === "function") CB_renderUVEditor();
}

function CB_doExportJson(){
  if(!CB_state.segmented){
    document.getElementById('cbExportMsg').textContent = 'Bind first';
    document.getElementById('cbExportMsg').style.color = '#f88';
    return;
  }
  var payload = {
    templateFile: CB_state.templateFilename,
    foreignFile: CB_state.foreignFilename,
    numBones: CB_state.templateKmd.numBones,
    transform: CB_state.xform,
    perBone: CB_state.segmented
  };
  var json = JSON.stringify(payload, null, 2);
  var blob = new Blob([json], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (CB_state.foreignFilename || 'character').replace(/\.\w+$/, '') + '_binding.json';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  document.getElementById('cbExportMsg').textContent = '✓ Binding JSON downloaded';
  document.getElementById('cbExportMsg').style.color = '#8eb';
}

function CB_doExportKmd(){
  if(!CB_state.segmented){
    document.getElementById('cbExportMsg').textContent = 'Bind first';
    document.getElementById('cbExportMsg').style.color = '#f88';
    return;
  }
  try {
    var strategy = document.getElementById('cbUvStrategy').value;
    var result = CB_buildKMD(CB_state.templateBytes, CB_state.segmented, {
      uvStrategy: strategy,
      editedLocalPos: CB_state.editedLocalPos
    });
    var blob = new Blob([result.bytes], {type: 'application/octet-stream'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (CB_state.foreignFilename || 'character').replace(/\.\w+$/, '') + '_on_skeleton.kmd';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    var warn = result.clampedVerts > 0 ? ' · ⚠ ' + result.clampedVerts + ' verts clamped to i16 range (try smaller scale)' : '';
    document.getElementById('cbExportMsg').textContent = '✓ Textured KMD downloaded (' + result.totalSize + ' bytes, UV strategy: ' + strategy + ')' + warn;
    document.getElementById('cbExportMsg').style.color = '#8eb';
  } catch(err){
    document.getElementById('cbExportMsg').textContent = '✗ Export failed: ' + err.message;
    document.getElementById('cbExportMsg').style.color = '#f88';
  }
}

// ─── 3D viewport ───────────────────────────────────────────────────────────
function CB_setupViewport(){
  var vp = document.getElementById('cbViewport');
  var w = vp.clientWidth, h = vp.clientHeight;
  CB_state.scene = new THREE.Scene();
  CB_state.scene.background = new THREE.Color(0x050810);
  CB_state.camera = new THREE.PerspectiveCamera(45, w/h, 1, 10000);
  CB_state.renderer = new THREE.WebGLRenderer({antialias: true});
  CB_state.renderer.setSize(w, h);
  vp.appendChild(CB_state.renderer.domElement);
  // Lights
  var amb = new THREE.AmbientLight(0xffffff, 0.5);
  CB_state.scene.add(amb);
  var dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(100, 200, 100);
  CB_state.scene.add(dir);
  // Grid
  var grid = new THREE.GridHelper(2000, 20, 0x224466, 0x112233);
  CB_state.scene.add(grid);
  // Skeleton group + mesh group (populated by rebuildScene)
  CB_state.skeletonGroup = new THREE.Group();
  CB_state.meshGroup = new THREE.Group();
  CB_state.scene.add(CB_state.skeletonGroup);
  CB_state.scene.add(CB_state.meshGroup);
  // Camera controls (simple orbit)
  CB_state.cameraOrbit = {yaw: 0.5, pitch: 0.3, dist: 600, target: [0, -50, 0]};
  CB_updateCamera();
  // Mouse — orbit camera on drag, OR shift+click to select a bone
  var dragging = false, lastX = 0, lastY = 0, dragMoved = false;
  vp.addEventListener('mousedown', function(e){
    dragging = true; lastX = e.clientX; lastY = e.clientY; dragMoved = false;
    // Edit Faces mode: plain click picks individual faces and toggles their
    // selection state. Shift+click extends selection (range mode within
    // current material — not yet implemented, defaults to additive).
    if(CB_state.editFacesMode && !e.ctrlKey && !e.metaKey && CB_state.meshGroup){
      var rect = vp.getBoundingClientRect();
      var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      var raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({x: mx, y: my}, CB_state.camera);
      // Filter to mesh groups carrying _triRefs (real material groups, not the
      // selection overlay or material highlight overlay)
      var pickable = CB_state.meshGroup.children.filter(function(c){ return c._triRefs; });
      var hits = raycaster.intersectObjects(pickable, false);
      if(hits.length > 0){
        var hit = hits[0];
        var ref = hit.object._triRefs[hit.faceIndex];
        if(ref){
          var key = ref.bone + ':' + ref.face;
          if(!e.shiftKey){
            // Plain click: toggle this face
            if(CB_state.selectedFaces[key]){
              delete CB_state.selectedFaces[key];
            } else {
              CB_state.selectedFaces[key] = true;
            }
          } else {
            // Shift+click: always add (don't toggle)
            CB_state.selectedFaces[key] = true;
          }
          CB_rebuildScene();
          CB_state.needsRender = true;
          if(typeof CB_updateSelCount === 'function') CB_updateSelCount();
          if(typeof CB_renderMaterialsPanel === 'function') CB_renderMaterialsPanel();
          dragging = false;
        }
      }
      return;
    }
    // Shift+Click → pick a bone (for joint editing) [original behavior]
    if(e.shiftKey && CB_state.skeletonGroup){
      var rect = vp.getBoundingClientRect();
      var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      var raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({x: mx, y: my}, CB_state.camera);
      var hits = raycaster.intersectObjects(CB_state.skeletonGroup.children, false);
      for(var h = 0; h < hits.length; h++){
        if(typeof hits[h].object._boneIdx === 'number'){
          CB_state.selectedBoneIdx = hits[h].object._boneIdx;
          CB_syncBoneEditInputs();
          CB_rebuildScene();
          CB_state.needsRender = true;
          dragging = false;
          var msg = document.getElementById('cbBoneEditMsg');
          if(msg){ msg.textContent = 'Selected bone '+CB_state.selectedBoneIdx; msg.style.color = '#8eb'; }
          break;
        }
      }
    }
    // Ctrl/Cmd+Click → pick a face by raycasting against the textured mesh.
    // Each material-group THREE.Mesh has _matId set; the picked face's material
    // becomes the "selected material" which highlights all sibling faces and
    // shows the assignment in the materials panel.
    else if((e.ctrlKey || e.metaKey) && CB_state.meshGroup){
      var rect = vp.getBoundingClientRect();
      var mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      var raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({x: mx, y: my}, CB_state.camera);
      var hits = raycaster.intersectObjects(CB_state.meshGroup.children, false);
      if(hits.length > 0 && typeof hits[0].object._matId === 'number'){
        CB_state.selectedMaterial = hits[0].object._matId;
        CB_state.activeFaceRef = null; CB_state.activeUVCorner = null;
        CB_renderMaterialsPanel();
        if(typeof CB_renderUVEditor === "function") CB_renderUVEditor();
        // Re-render to update material highlight (selected material draws as
        // a yellow wireframe overlay on top of the textured surface)
        CB_rebuildScene();
        CB_state.needsRender = true;
        dragging = false;
        var msg = document.getElementById('cbMatMsg');
        if(msg){
          msg.textContent = 'Selected material 0x' + CB_state.selectedMaterial.toString(16).toUpperCase();
          msg.style.color = '#8eb';
        }
      }
    }
  });
  window.addEventListener('mouseup', function(){ dragging = false; });
  window.addEventListener('mousemove', function(e){
    if(!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    if(Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    lastX = e.clientX; lastY = e.clientY;
    CB_state.cameraOrbit.yaw -= dx * 0.01;
    CB_state.cameraOrbit.pitch -= dy * 0.01;
    CB_state.cameraOrbit.pitch = Math.max(-1.5, Math.min(1.5, CB_state.cameraOrbit.pitch));
    CB_updateCamera();
    CB_state.needsRender = true;
  });
  vp.addEventListener('wheel', function(e){
    e.preventDefault();
    CB_state.cameraOrbit.dist *= e.deltaY > 0 ? 1.1 : 0.9;
    CB_state.cameraOrbit.dist = Math.max(50, Math.min(5000, CB_state.cameraOrbit.dist));
    CB_updateCamera();
    CB_state.needsRender = true;
  }, {passive: false});
  // Resize
  var ro = new ResizeObserver(function(){
    var w = vp.clientWidth, h = vp.clientHeight;
    if(w > 0 && h > 0){
      CB_state.renderer.setSize(w, h);
      CB_state.camera.aspect = w/h;
      CB_state.camera.updateProjectionMatrix();
      CB_state.needsRender = true;
    }
  });
  ro.observe(vp);
}

function CB_updateCamera(){
  var o = CB_state.cameraOrbit;
  var x = Math.cos(o.pitch) * Math.sin(o.yaw) * o.dist;
  var y = Math.sin(o.pitch) * o.dist;
  var z = Math.cos(o.pitch) * Math.cos(o.yaw) * o.dist;
  CB_state.camera.position.set(o.target[0] + x, o.target[1] + y, o.target[2] + z);
  CB_state.camera.lookAt(o.target[0], o.target[1], o.target[2]);
}

function CB_rebuildScene(){
  if(!CB_state.scene) return;
  // Clear groups
  while(CB_state.skeletonGroup.children.length > 0) CB_state.skeletonGroup.remove(CB_state.skeletonGroup.children[0]);
  while(CB_state.meshGroup.children.length > 0) CB_state.meshGroup.remove(CB_state.meshGroup.children[0]);
  // Add skeleton — small cyan spheres at each bone world position + lines for hierarchy
  // The selected bone (joint editor) is rendered LARGER and in yellow.
  if(CB_state.boneWorldPos){
    var sphereGeom = new THREE.SphereGeometry(8, 8, 6);
    var bigSphereGeom = new THREE.SphereGeometry(14, 12, 8);
    var defaultMat = new THREE.MeshBasicMaterial({color: 0x00ccff});
    var selectedMat = new THREE.MeshBasicMaterial({color: 0xffcc00});
    var editedMat = new THREE.MeshBasicMaterial({color: 0xff66cc});  // pink = edited
    for(var i = 0; i < CB_state.boneWorldPos.length; i++){
      var isSelected = (i === CB_state.selectedBoneIdx);
      var isEdited = CB_state.editedLocalPos && CB_state.editedLocalPos[i] &&
        CB_state.templateKmd && (
          CB_state.editedLocalPos[i][0] !== CB_state.templateKmd.bones[i].localPos[0] ||
          CB_state.editedLocalPos[i][1] !== CB_state.templateKmd.bones[i].localPos[1] ||
          CB_state.editedLocalPos[i][2] !== CB_state.templateKmd.bones[i].localPos[2]);
      var mat = isSelected ? selectedMat : (isEdited ? editedMat : defaultMat);
      var geom = isSelected ? bigSphereGeom : sphereGeom;
      var m = new THREE.Mesh(geom, mat);
      var p = CB_state.boneWorldPos[i];
      m.position.set(p[0], p[1], p[2]);
      m._boneIdx = i;  // for raycast hit detection (if added later)
      CB_state.skeletonGroup.add(m);
    }
    // Parent-child lines
    var lineMat = new THREE.LineBasicMaterial({color: 0x0088aa});
    var linePts = [];
    for(var i = 0; i < CB_state.templateKmd.bones.length; i++){
      var parent = CB_state.templateKmd.bones[i].parent;
      if(parent >= 0){
        var p1 = CB_state.boneWorldPos[i], p2 = CB_state.boneWorldPos[parent];
        linePts.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      }
    }
    if(linePts.length > 0){
      var lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
      CB_state.skeletonGroup.add(new THREE.LineSegments(lineGeom, lineMat));
    }
  }
  // Add foreign mesh (transformed)
  if(CB_state.foreignMesh){
    var tv = CB_transformVerts(CB_state.foreignMesh.verts, CB_state.xform);
    // ─── Decide render mode ───
    // Textured: requires bindings + segmented + DAR loaded + showTextures flag.
    // Triangle-by-triangle texture sampling uses the same UV+material logic the
    // KMD exporter uses, so what's shown matches what'll get written to the file.
    var hasBindings = !!CB_state.bindings;
    // Edit-faces mode forces solid rendering — wireframe makes face-picking
    // visually confusing per user feedback.
    var effectiveWireframe = CB_state.wireframe && !CB_state.editFacesMode;
    var canTexture = hasBindings && CB_state.segmented && CB_state.showTextures &&
                     typeof TX_state !== 'undefined' && TX_state.textures.length > 0 &&
                     !effectiveWireframe;
    if(canTexture){
      // Compute material assignment using current UV strategy from dropdown
      var stratEl = document.getElementById('cbUvStrategy');
      var strategy = stratEl ? stratEl.value : 'nearest';
      var assignments;
      try {
        assignments = CB_assignUVsMaterials(CB_state.segmented, CB_state.templateKmd, strategy);
      } catch(err){
        // If assignment fails (e.g., bad face data), fall back to colored render
        console.warn('Texture render failed:', err.message);
        assignments = null;
      }
      if(assignments){
        // Map material IDs to DAR texture indices once
        var matToTex = CB_buildMaterialTextureMap();
        // Group triangles by material so we can use one THREE.Mesh per texture
        var matGroups = {};  // {matId: {positions:[], uvs:[]}}
        for(var bIdx = 0; bIdx < assignments.length; bIdx++){
          var a = assignments[bIdx];
          var bWorld = CB_state.boneWorldPos[bIdx];
          var bSeg = CB_state.segmented[bIdx];
          for(var fi = 0; fi < a.faces4.length; fi++){
            var face = a.faces4[fi];
            var uvQ = a.uvs[fi];
            var matId = a.materials[fi];
            if(!matGroups[matId]) matGroups[matId] = {positions: [], uvs: [], triRefs: []};
            var g = matGroups[matId];
            // Emit triangle 0,1,2
            var isQuad = face[2] !== face[3];
            var triangles = isQuad ? [[0,1,2], [0,2,3]] : [[0,1,2]];
            for(var tri = 0; tri < triangles.length; tri++){
              for(var corner = 0; corner < 3; corner++){
                var ci = triangles[tri][corner];
                var v = bSeg.verts[face[ci]];
                if(!v) continue;
                g.positions.push(v[0] + bWorld[0], v[1] + bWorld[1], v[2] + bWorld[2]);
                g.uvs.push(uvQ[ci][0] / 256, uvQ[ci][1] / 256);
              }
              // Record per-triangle ref for face picking: this triangle came
              // from (bone=bIdx, kmdFace=fi). Both triangles of a quad map to
              // the same KMD face (picking either selects the face).
              g.triRefs.push({bone: bIdx, face: fi});
            }
          }
        }
        // Emit one THREE.Mesh per unique material
        for(var matId in matGroups){
          var g = matGroups[matId];
          if(g.positions.length === 0) continue;
          var geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
          geom.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
          geom.computeVertexNormals();
          var texIdx = matToTex[matId];
          var threeTex = CB_getTextureForMaterial(matToTex, parseInt(matId));
          var mat;
          if(threeTex){
            mat = new THREE.MeshBasicMaterial({
              map: threeTex, side: THREE.DoubleSide,
              transparent: true, alphaTest: 0.1
            });
          } else {
            mat = new THREE.MeshBasicMaterial({color: 0x666666, side: THREE.DoubleSide});
          }
          var meshObj = new THREE.Mesh(geom, mat);
          meshObj._matId = parseInt(matId);  // for face-pick / highlighting
          meshObj._triRefs = g.triRefs;       // for face-pick raycasting
          // Isolation mode: hide everything except the selected material.
          // This is the "focus only on chest faces" workflow — Blender's
          // local-view equivalent.
          if(CB_state.isolateMaterial && CB_state.selectedMaterial !== null &&
             parseInt(matId) !== CB_state.selectedMaterial){
            meshObj.visible = false;
          }
          CB_state.meshGroup.add(meshObj);
          // Highlight overlay: if this material is currently selected, draw a
          // yellow wireframe on top so the user sees all faces sharing this
          // material across the model (the "select faces by group" feature).
          if(CB_state.selectedMaterial !== null && parseInt(matId) === CB_state.selectedMaterial){
            var hilightMat = new THREE.MeshBasicMaterial({
              color: 0xffcc00, wireframe: true, transparent: true,
              depthTest: false  // draw on top regardless of depth
            });
            var hilightMesh = new THREE.Mesh(geom, hilightMat);
            hilightMesh.renderOrder = 999;
            CB_state.meshGroup.add(hilightMesh);
          }
        }
        // ─── Selected-faces overlay ─────────────────────────────────────────
        // For each face in CB_state.selectedFaces, emit a translucent cyan
        // triangle drawn ON TOP of the textured surface. Solid (not wireframe)
        // because the user said wireframe makes faces hard to read. Slight
        // transparency lets the texture show through so they can verify
        // they've selected the right region.
        var selKeys = Object.keys(CB_state.selectedFaces || {});
        if(selKeys.length > 0){
          var selPositions = [];
          for(var bIdx = 0; bIdx < assignments.length; bIdx++){
            var a = assignments[bIdx];
            var bWorld = CB_state.boneWorldPos[bIdx];
            var bSeg = CB_state.segmented[bIdx];
            for(var fi = 0; fi < a.faces4.length; fi++){
              if(!CB_state.selectedFaces[bIdx + ':' + fi]) continue;
              var face = a.faces4[fi];
              var isQuad = face[2] !== face[3];
              var triangles = isQuad ? [[0,1,2], [0,2,3]] : [[0,1,2]];
              for(var tri = 0; tri < triangles.length; tri++){
                for(var corner = 0; corner < 3; corner++){
                  var ci = triangles[tri][corner];
                  var v = bSeg.verts[face[ci]];
                  if(!v) continue;
                  selPositions.push(v[0] + bWorld[0], v[1] + bWorld[1], v[2] + bWorld[2]);
                }
              }
            }
          }
          if(selPositions.length > 0){
            var selGeom = new THREE.BufferGeometry();
            selGeom.setAttribute('position', new THREE.Float32BufferAttribute(selPositions, 3));
            var selMat = new THREE.MeshBasicMaterial({
              color: 0x00ffcc, transparent: true, opacity: 0.55,
              side: THREE.DoubleSide,
              depthTest: true, depthWrite: false
            });
            var selMesh = new THREE.Mesh(selGeom, selMat);
            selMesh.renderOrder = 998;
            CB_state.meshGroup.add(selMesh);
          }
        }
      }
    }
    // Fallback: bone-color / wireframe / pre-bind rendering
    if(CB_state.meshGroup.children.length === 0){
      var positions = [];
      var colors = [];
      var palette = [];
      if(hasBindings){
        var nb = CB_state.boneWorldPos.length;
        for(var i = 0; i < nb; i++){
          var h = (i / nb);
          // HSV-ish: just rotate through RGB primaries
          var r = 0.5 + 0.5 * Math.cos(h * 6.28);
          var g = 0.5 + 0.5 * Math.cos(h * 6.28 + 2.09);
          var b = 0.5 + 0.5 * Math.cos(h * 6.28 + 4.18);
          palette.push([r, g, b]);
        }
      }
      for(var f = 0; f < CB_state.foreignMesh.faces.length; f++){
        var face = CB_state.foreignMesh.faces[f];
        var tris = (face.length === 4) ? [[face[0], face[1], face[2]], [face[0], face[2], face[3]]] : [face];
        for(var t = 0; t < tris.length; t++){
          for(var k = 0; k < 3; k++){
            var v = tv[tris[t][k]];
            positions.push(v[0], v[1], v[2]);
            if(hasBindings){
              var c = palette[CB_state.bindings[tris[t][k]]];
              colors.push(c[0], c[1], c[2]);
            }
          }
        }
      }
      var geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if(hasBindings){
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      }
      geom.computeVertexNormals();
      var mat;
      if(effectiveWireframe){
        mat = new THREE.MeshBasicMaterial({
          color: hasBindings ? 0xcccccc : 0xffffff,
          wireframe: true, transparent: true, opacity: 0.7
        });
      } else if(hasBindings){
        mat = new THREE.MeshLambertMaterial({vertexColors: true, wireframe: false, side: THREE.DoubleSide});
      } else {
        mat = new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6});
      }
      CB_state.meshGroup.add(new THREE.Mesh(geom, mat));
    }
  }
  // Apply visibility flags AFTER rebuilding (so they persist across re-binds)
  CB_state.meshGroup.visible = CB_state.showMesh;
  CB_state.skeletonGroup.visible = CB_state.showSkeleton;
  // Reframe camera target to skeleton center if we have one
  if(CB_state.boneWorldPos && CB_state.boneWorldPos.length > 0){
    var sb = CB_bounds(CB_state.boneWorldPos);
    CB_state.cameraOrbit.target = [
      (sb.min[0] + sb.max[0]) / 2,
      (sb.min[1] + sb.max[1]) / 2,
      (sb.min[2] + sb.max[2]) / 2
    ];
    CB_updateCamera();
  }
}

function CB_render(){
  requestAnimationFrame(CB_render);
  if(!CB_state.renderer) return;
  if(CB_state.needsRender){
    CB_state.renderer.render(CB_state.scene, CB_state.camera);
    CB_state.needsRender = false;
  }
}

function CB_renderMatchPanel(){
  var container = document.getElementById('cbMatchPanel');
  if(!container) return;
  if(!container) return;
  container.innerHTML = '';
  if(TX_state.foreignTextures.length === 0){
    container.innerHTML = '<div style="color:#666;font-size:10px;font-style:italic;padding:8px">Drop foreign textures above to see matches.</div>';
    return;
  }
  if(TX_state.textures.length === 0){
    container.innerHTML = '<div style="color:#666;font-size:10px;font-style:italic;padding:8px">Load Snake\'s DAR first to see slot dimensions.</div>';
    return;
  }
  for(var si = 0; si < TX_state.textures.length; si++){
    (function(snakeIdx){
      var slot = TX_state.textures[snakeIdx];
      if(!slot.decoded) return;
      var matchedFi = TX_state.matches[slot.name];
      var hasMatch = (matchedFi !== undefined && matchedFi !== null);
      var foreign = hasMatch ? TX_state.foreignTextures[matchedFi] : null;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid #111';
      // Snake side
      var snakeImg = document.createElement('img');
      snakeImg.src = slot.dataURL || '';
      snakeImg.style.cssText = 'width:32px;height:32px;object-fit:contain;image-rendering:pixelated;background:#222;flex-shrink:0';
      snakeImg.title = slot.name + ' (' + slot.decoded.width + 'x' + slot.decoded.height + ')';
      row.appendChild(snakeImg);
      var snakeLabel = document.createElement('div');
      snakeLabel.style.cssText = 'font-size:9px;color:#aab;min-width:80px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      snakeLabel.innerHTML = slot.name.replace(/\.pcx$/i,'') + '<br><span style="color:#666">' + slot.decoded.width + '×' + slot.decoded.height + '</span>';
      row.appendChild(snakeLabel);
      // Arrow
      var arrow = document.createElement('div');
      arrow.style.cssText = 'color:#666;font-size:11px;flex-shrink:0';
      arrow.textContent = '←';
      row.appendChild(arrow);
      // Foreign side
      var foreignImg = document.createElement('img');
      if(foreign){
        foreignImg.src = foreign.dataURL;
        foreignImg.title = foreign.name + ' (' + foreign.width + 'x' + foreign.height + ')';
      }
      foreignImg.style.cssText = 'width:32px;height:32px;object-fit:contain;image-rendering:pixelated;background:#1a1a1a;flex-shrink:0;'+(foreign?'':'border:1px dashed #444');
      row.appendChild(foreignImg);
      // Override dropdown
      var sel = document.createElement('select');
      sel.style.cssText = 'background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:1px 2px;font-family:monospace;font-size:9px;flex:1;min-width:0';
      var noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '(none — keep Snake)';
      sel.appendChild(noneOpt);
      for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
        var opt = document.createElement('option');
        opt.value = fi;
        var f = TX_state.foreignTextures[fi];
        var sizeMatch = (f.width === slot.decoded.width && f.height === slot.decoded.height) ? ' ✓' : '';
        opt.textContent = f.name + ' (' + f.width + 'x' + f.height + ')' + sizeMatch;
        sel.appendChild(opt);
      }
      if(hasMatch) sel.value = String(matchedFi);
      sel.onchange = function(ev){
        var val = ev.target.value;
        if(val === ''){
          delete TX_state.matches[slot.name];
        } else {
          // Setting this slot frees up whatever was previously assigned to this
          // foreign texture (one-to-one mapping)
          var newFi = parseInt(val);
          for(var k in TX_state.matches){
            if(TX_state.matches[k] === newFi) delete TX_state.matches[k];
          }
          TX_state.matches[slot.name] = newFi;
        }
        // Invalidate cached foreign textures so re-render picks up the new
        // pairing. Also clear Snake texture cache for the same reason (so a
        // slot reverting from foreign to Snake shows Snake again).
        for(var fi = 0; fi < TX_state.foreignTextures.length; fi++){
          TX_state.foreignTextures[fi]._threeTexture = null;
        }
        CB_renderMatchPanel();
        CB_rebuildScene();
        CB_state.needsRender = true;
      };
      row.appendChild(sel);
      container.appendChild(row);
    })(si);
  }
}

// Render the materials panel: each unique material in the template KMD gets a
// row showing the material ID, the count of faces using it, the bone that uses
// it most, and a dropdown to override which DAR texture it samples. The
// selected material's row is highlighted yellow. Click a row to select it
// (same as Ctrl+Click in the 3D viewport).
function CB_renderMaterialsPanel(){
  var container = document.getElementById('cbMaterialsPanel');
  if(!container) return;
  container.innerHTML = '';
  if(!CB_state.templateKmd){
    container.innerHTML = '<div style="color:#666;font-size:10px;font-style:italic;padding:8px">Load template KMD first.</div>';
    return;
  }
  if(typeof TX_state === 'undefined' || TX_state.textures.length === 0){
    container.innerHTML = '<div style="color:#666;font-size:10px;font-style:italic;padding:8px">Load Snake\'s DAR to assign textures to materials.</div>';
    return;
  }
  // Tally materials × bones from template
  var matBoneCounts = {};
  var matTotalCounts = {};
  for(var b = 0; b < CB_state.templateKmd.bones.length; b++){
    var bone = CB_state.templateKmd.bones[b];
    if(!bone.materials) continue;
    for(var f = 0; f < bone.materials.length; f++){
      var m = bone.materials[f];
      if(!matBoneCounts[m]) matBoneCounts[m] = {};
      matBoneCounts[m][b] = (matBoneCounts[m][b] || 0) + 1;
      matTotalCounts[m] = (matTotalCounts[m] || 0) + 1;
    }
  }
  // Sort materials by total face count, descending
  var matIds = Object.keys(matTotalCounts).map(function(k){ return parseInt(k); });
  matIds.sort(function(a, b){ return matTotalCounts[b] - matTotalCounts[a]; });
  var heuristic = CB_buildMaterialTextureMap();

  // ─── Selection management header ─────────────────────────────────────────
  // Renders only when there are selected faces. Shows count, lets user
  // reassign all selected faces to a new material (the "fix the seam" case)
  // or clear selection.
  var selKeys = Object.keys(CB_state.selectedFaces || {});
  if(selKeys.length > 0){
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#0a1a18;border-bottom:1px solid #0fc;padding:6px;display:flex;flex-wrap:wrap;align-items:center;gap:4px';
    var label = document.createElement('div');
    label.style.cssText = 'color:#0fc;font-size:10px;font-weight:bold;flex:1;min-width:80px';
    label.textContent = '✎ ' + selKeys.length + ' face' + (selKeys.length===1?'':'s') + ' selected';
    hdr.appendChild(label);
    // Reassign dropdown
    var reSel = document.createElement('select');
    reSel.style.cssText = 'background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:1px 2px;font-family:monospace;font-size:9px;flex:1;min-width:0';
    var placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = '(reassign to…)';
    reSel.appendChild(placeholder);
    for(var mi2 = 0; mi2 < matIds.length; mi2++){
      var opt = document.createElement('option');
      opt.value = matIds[mi2];
      opt.textContent = '0x' + matIds[mi2].toString(16).toUpperCase().padStart(4,'0');
      reSel.appendChild(opt);
    }
    reSel.onchange = function(ev){
      var newMatId = parseInt(ev.target.value);
      if(!isFinite(newMatId)) return;
      // Apply to every selected face
      if(!CB_state.faceMaterialOverrides) CB_state.faceMaterialOverrides = {};
      for(var k = 0; k < selKeys.length; k++){
        var parts = selKeys[k].split(':');
        var b = parseInt(parts[0]), f = parseInt(parts[1]);
        if(!CB_state.faceMaterialOverrides[b]) CB_state.faceMaterialOverrides[b] = {};
        CB_state.faceMaterialOverrides[b][f] = newMatId;
      }
      // Invalidate texture cache (different material → different texture)
      for(var ti = 0; ti < TX_state.textures.length; ti++) TX_state.textures[ti]._threeTexture = null;
      for(var fi = 0; fi < TX_state.foreignTextures.length; fi++) TX_state.foreignTextures[fi]._threeTexture = null;
      CB_rebuildScene();
      CB_state.needsRender = true;
      CB_renderMaterialsPanel();
      if(typeof CB_renderUVEditor === 'function') CB_renderUVEditor();
      ev.target.value = '';  // reset dropdown
    };
    hdr.appendChild(reSel);
    var clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.style.cssText = 'background:#3a2515;color:#fc8;padding:2px 6px;font-size:9px';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Deselect all faces';
    clearBtn.onclick = function(){
      CB_state.selectedFaces = {};
      CB_rebuildScene();
      CB_state.needsRender = true;
      CB_renderMaterialsPanel();
      if(typeof CB_updateSelCount === 'function') CB_updateSelCount();
    };
    hdr.appendChild(clearBtn);
    container.appendChild(hdr);
  }
  for(var mi = 0; mi < matIds.length; mi++){
    (function(matId){
      var row = document.createElement('div');
      var isSelected = (CB_state.selectedMaterial === matId);
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid #111;cursor:pointer;' +
        (isSelected ? 'background:#1a1f00;border-left:3px solid #ffcc00' : '');
      row.onclick = function(ev){
        if(ev.target.tagName === 'SELECT') return;  // don't select on dropdown click
        CB_state.selectedMaterial = isSelected ? null : matId;
        CB_state.activeFaceRef = null; CB_state.activeUVCorner = null;
        CB_rebuildScene();
        CB_state.needsRender = true;
        CB_renderMaterialsPanel();
        if(typeof CB_renderUVEditor === "function") CB_renderUVEditor();
      };
      // Dominant bone for this material
      var domBone = 0, max = 0;
      for(var b in matBoneCounts[matId]){
        if(matBoneCounts[matId][b] > max){ max = matBoneCounts[matId][b]; domBone = parseInt(b); }
      }
      // Material label
      var lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;color:#cde;min-width:64px;flex-shrink:0';
      lbl.innerHTML = '<b>0x' + matId.toString(16).toUpperCase().padStart(4, '0') + '</b><br>' +
        '<span style="color:#666;font-size:9px">' + matTotalCounts[matId] + ' faces · bone ' + domBone + '</span>';
      row.appendChild(lbl);
      // Arrow
      var arrow = document.createElement('div');
      arrow.style.cssText = 'color:#666;font-size:11px;flex-shrink:0';
      arrow.textContent = '→';
      row.appendChild(arrow);
      // Texture preview thumb
      var defaultIdx = heuristic[matId];
      var currentIdx = (CB_state.materialOverrides && CB_state.materialOverrides[matId] !== undefined)
        ? CB_state.materialOverrides[matId]
        : defaultIdx;
      var thumb = document.createElement('img');
      if(currentIdx !== undefined && currentIdx >= 0 && TX_state.textures[currentIdx]){
        thumb.src = TX_state.textures[currentIdx].dataURL || '';
        thumb.title = TX_state.textures[currentIdx].name;
      }
      thumb.style.cssText = 'width:28px;height:28px;object-fit:contain;image-rendering:pixelated;background:#222;flex-shrink:0';
      row.appendChild(thumb);
      // Override dropdown
      var sel = document.createElement('select');
      sel.style.cssText = 'background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:1px 2px;font-family:monospace;font-size:9px;flex:1;min-width:0';
      for(var t = 0; t < TX_state.textures.length; t++){
        if(!TX_state.textures[t].decoded) continue;
        var opt = document.createElement('option');
        opt.value = t;
        var name = TX_state.textures[t].name.replace(/\.pcx$/i, '');
        opt.textContent = (t === defaultIdx ? '★ ' : '') + name + ' (' +
          TX_state.textures[t].decoded.width + '×' + TX_state.textures[t].decoded.height + ')';
        sel.appendChild(opt);
      }
      sel.value = String(currentIdx !== undefined ? currentIdx : 0);
      sel.onclick = function(ev){ ev.stopPropagation(); };
      sel.onchange = function(ev){
        var newIdx = parseInt(ev.target.value);
        if(!CB_state.materialOverrides) CB_state.materialOverrides = {};
        if(newIdx === defaultIdx){
          delete CB_state.materialOverrides[matId];  // reset to default
        } else {
          CB_state.materialOverrides[matId] = newIdx;
        }
        // Clear texture cache for affected textures so the change is visible
        for(var i = 0; i < TX_state.textures.length; i++){
          TX_state.textures[i]._threeTexture = null;
        }
        CB_rebuildScene();
        CB_state.needsRender = true;
        CB_renderMaterialsPanel();
        if(typeof CB_renderUVEditor === "function") CB_renderUVEditor();
      };
      row.appendChild(sel);
      container.appendChild(row);
    })(matIds[mi]);
  }
}

// ─── UV editor ─────────────────────────────────────────────────────────────
// Draws the texture assigned to the selected material onto a 2D canvas, with
// each face's 4-corner UV quad overlaid as a wireframe polygon. User can:
//   - Click a face's quad to select it as "active" (highlighted yellow)
//   - Click+drag any corner of the active quad to retarget that corner
//   - Use auto-fit buttons (planar projection / stretch-to-fit)
//
// Coordinate system: KMD UVs are u8 (0-255) in tpage space. The canvas
// displays the (potentially small) texture in the top-left rectangle of size
// (texWidth/256)×(texHeight/256) of the canvas, scaled up — so UV(0,0)
// renders at canvas (0,0) and UV(255,255) at (canvas.width, canvas.height).
// This shows the user the full tpage coordinate range (even when the texture
// is small) so they understand where UVs reach.

var CB_uv_layout = {canvasSize: 280, uvRange: 256};

function CB_uvCanvasFromUV(tu, tv){
  // Map UV [0-255] to canvas pixels [0, canvasSize]
  var s = CB_uv_layout.canvasSize / CB_uv_layout.uvRange;
  return {x: tu * s, y: tv * s};
}
function CB_uvFromCanvas(cx, cy){
  // Map canvas pixels back to UV [0-255]
  var s = CB_uv_layout.uvRange / CB_uv_layout.canvasSize;
  return {tu: Math.max(0, Math.min(255, Math.round(cx * s))),
          tv: Math.max(0, Math.min(255, Math.round(cy * s)))};
}

// Collect all (bone, face) refs whose face uses the currently-selected material.
function CB_uvCollectActiveFaces(){
  if(CB_state.selectedMaterial === null || !CB_state.segmented || !CB_state.templateKmd){
    return [];
  }
  var uvStrat = (document.getElementById('cbUvStrategy') || {}).value || 'nearest';
  var assignments;
  try { assignments = CB_assignUVsMaterials(CB_state.segmented, CB_state.templateKmd, uvStrat); }
  catch(e){ return []; }
  var refs = [];
  for(var b = 0; b < assignments.length; b++){
    var a = assignments[b];
    for(var f = 0; f < a.materials.length; f++){
      if(a.materials[f] === CB_state.selectedMaterial){
        refs.push({bone: b, face: f, uvs: a.uvs[f]});
      }
    }
  }
  return refs;
}

// Draw the UV editor canvas: texture in background, UV quads as overlay.
function CB_renderUVEditor(){
  var canvas = document.getElementById('cbUvCanvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050810';
  ctx.fillRect(0, 0, W, H);

  var msg = document.getElementById('cbUvMsg');

  if(CB_state.selectedMaterial === null){
    if(msg){ msg.textContent = 'Ctrl+Click a face in the 3D viewport to select its material.'; msg.style.color = '#666'; }
    return;
  }
  if(typeof TX_state === 'undefined' || TX_state.textures.length === 0){
    if(msg){ msg.textContent = 'Load template DAR first.'; msg.style.color = '#fc8'; }
    return;
  }

  // Resolve which DAR texture this material uses (heuristic + overrides)
  var matToTex = CB_buildMaterialTextureMap();
  var texIdx = matToTex[CB_state.selectedMaterial];
  if(texIdx === undefined || texIdx < 0 || !TX_state.textures[texIdx]){
    if(msg){ msg.textContent = 'No texture assigned for material 0x' + CB_state.selectedMaterial.toString(16); msg.style.color = '#fc8'; }
    return;
  }
  var slot = TX_state.textures[texIdx];
  if(!slot.decoded){
    if(msg){ msg.textContent = 'Texture not decoded'; msg.style.color = '#fc8'; }
    return;
  }

  // ─── Draw the texture ───
  // The texture covers the rectangle 0..texW × 0..texH in UV space; in canvas
  // pixels that's 0..(texW/256*W) × 0..(texH/256*H). Use putImageData since
  // the texture might be a foreign one we want to preview at export quality.
  var texW = slot.decoded.width;
  var texH = slot.decoded.height;
  var canvasTexW = (texW / 256) * W;
  var canvasTexH = (texH / 256) * H;
  // Draw texture via off-screen canvas → drawImage with nearest scaling
  var off = document.createElement('canvas');
  off.width = texW; off.height = texH;
  var offCtx = off.getContext('2d');
  // Show foreign preview if user mapped one to this slot — keeps UV editor
  // consistent with what's on the 3D mesh
  var foreignIdx = TX_state.matches[slot.name];
  var displayPixels;
  if(foreignIdx !== undefined && foreignIdx !== null && TX_state.foreignTextures[foreignIdx]){
    // Foreign-mapped: resize+quantize to slot dims like the export does
    var f = TX_state.foreignTextures[foreignIdx];
    var resized = (f.width === texW && f.height === texH)
      ? f.rgba
      : TX_resizeRGBA(f.rgba, f.width, f.height, texW, texH);
    var quant = TX_quantizeToPalette(resized, texW, texH, 16);
    displayPixels = new Uint8ClampedArray(texW * texH * 4);
    for(var i = 0; i < texW * texH; i++){
      var idx = quant.indices[i];
      displayPixels[i*4]   = quant.palette[idx*3];
      displayPixels[i*4+1] = quant.palette[idx*3+1];
      displayPixels[i*4+2] = quant.palette[idx*3+2];
      displayPixels[i*4+3] = idx === 0 ? 0 : 255;
    }
  } else {
    displayPixels = slot.decoded.pixels;
  }
  var imgData = offCtx.createImageData(texW, texH);
  imgData.data.set(displayPixels);
  offCtx.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, canvasTexW, canvasTexH);
  // Subtle border around texture rectangle to show its extent
  ctx.strokeStyle = '#3a4a5a';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvasTexW, canvasTexH);

  // ─── Draw UV quads ───
  var refs = CB_uvCollectActiveFaces();
  for(var i = 0; i < refs.length; i++){
    var r = refs[i];
    var isActive = (CB_state.activeFaceRef &&
                    CB_state.activeFaceRef.bone === r.bone &&
                    CB_state.activeFaceRef.face === r.face);
    // Stroke poly through corners 0,1,2,3,0
    ctx.beginPath();
    for(var k = 0; k < 4; k++){
      var p = CB_uvCanvasFromUV(r.uvs[k][0], r.uvs[k][1]);
      if(k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = isActive ? '#ffcc00' : 'rgba(0, 220, 255, 0.6)';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();
    // For active quad, draw corner handles
    if(isActive){
      for(var k = 0; k < 4; k++){
        var p = CB_uvCanvasFromUV(r.uvs[k][0], r.uvs[k][1]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = (CB_state.activeUVCorner && CB_state.activeUVCorner.corner === k) ? '#fff' : '#ffcc00';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  if(msg){
    var info = refs.length + ' face' + (refs.length === 1 ? '' : 's') + ' use material 0x' +
      CB_state.selectedMaterial.toString(16).toUpperCase() +
      ' · texture: ' + slot.name + ' (' + texW + '×' + texH + ')';
    if(CB_state.activeFaceRef){
      info += ' · editing bone ' + CB_state.activeFaceRef.bone + ' face ' + CB_state.activeFaceRef.face;
    }
    msg.textContent = info;
    msg.style.color = '#aab';
  }
}

// Pick a UV quad corner near (cx, cy) in canvas pixels. Returns
// {bone, face, corner} or null. Only considers the active face's corners.
function CB_uvEditorPickCorner(cx, cy){
  if(!CB_state.activeFaceRef) return null;
  var refs = CB_uvCollectActiveFaces();
  for(var i = 0; i < refs.length; i++){
    var r = refs[i];
    if(r.bone !== CB_state.activeFaceRef.bone || r.face !== CB_state.activeFaceRef.face) continue;
    for(var k = 0; k < 4; k++){
      var p = CB_uvCanvasFromUV(r.uvs[k][0], r.uvs[k][1]);
      var dx = cx - p.x, dy = cy - p.y;
      if(dx*dx + dy*dy <= 49){  // within 7px radius
        return {bone: r.bone, face: r.face, corner: k};
      }
    }
  }
  return null;
}

// Pick a face: which UV quad's interior contains (cx, cy)? Returns
// {bone, face} or null.
function CB_uvEditorPickFace(cx, cy){
  var refs = CB_uvCollectActiveFaces();
  for(var i = 0; i < refs.length; i++){
    var r = refs[i];
    var poly = [];
    for(var k = 0; k < 4; k++){
      var p = CB_uvCanvasFromUV(r.uvs[k][0], r.uvs[k][1]);
      poly.push([p.x, p.y]);
    }
    if(CB_pointInQuad(cx, cy, poly)){
      return {bone: r.bone, face: r.face};
    }
  }
  return null;
}

// Point-in-polygon (ray casting) for a 4-sided polygon.
function CB_pointInQuad(x, y, poly){
  var inside = false;
  for(var i = 0, j = poly.length - 1; i < poly.length; j = i++){
    var xi = poly[i][0], yi = poly[i][1];
    var xj = poly[j][0], yj = poly[j][1];
    var intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Update a UV corner's value from canvas coordinates, writing to the override
// structure (creating it if needed).
function CB_uvEditorSetCornerFromCanvas(handle, cx, cy){
  var uv = CB_uvFromCanvas(cx, cy);
  // Get current UVs for this face (template-inherited + any prior overrides)
  var refs = CB_uvCollectActiveFaces();
  var cur = null;
  for(var i = 0; i < refs.length; i++){
    if(refs[i].bone === handle.bone && refs[i].face === handle.face){ cur = refs[i].uvs; break; }
  }
  if(!cur) return;
  var newQuad = cur.map(function(c){ return [c[0], c[1]]; });
  newQuad[handle.corner] = [uv.tu, uv.tv];
  if(!CB_state.faceUVOverrides) CB_state.faceUVOverrides = {};
  if(!CB_state.faceUVOverrides[handle.bone]) CB_state.faceUVOverrides[handle.bone] = {};
  CB_state.faceUVOverrides[handle.bone][handle.face] = newQuad;
}

// Auto-fit: rewrite all UV quads of the selected material's faces.
// 'planar': project each face's vertex positions (in bone-local frame) onto
//   the XY plane, normalize across all selected faces, scale to texture extents.
// 'stretch': for each face individually, scale its existing quad to span the
//   full texture (0..texW × 0..texH).
function CB_uvAutoFit(mode){
  if(CB_state.selectedMaterial === null || !CB_state.segmented || !CB_state.templateKmd){
    return;
  }
  var refs = CB_uvCollectActiveFaces();
  // If user has selected specific faces, restrict to the intersection of
  // (selected faces) ∩ (this material's faces). Otherwise operate on whole
  // material. This lets them e.g. auto-fit only the front-of-chest faces
  // separately from back-of-chest.
  var selKeys = Object.keys(CB_state.selectedFaces || {});
  if(selKeys.length > 0){
    refs = refs.filter(function(r){ return CB_state.selectedFaces[r.bone + ':' + r.face]; });
    if(refs.length === 0){
      var msg = document.getElementById('cbUvMsg');
      if(msg){ msg.textContent = 'Selection has no faces of the active material — clear selection or pick a different material'; msg.style.color = '#fc8'; }
      return;
    }
  }
  if(refs.length === 0) return;
  // Resolve target texture extents
  var matToTex = CB_buildMaterialTextureMap();
  var texIdx = matToTex[CB_state.selectedMaterial];
  if(texIdx === undefined || !TX_state.textures[texIdx] || !TX_state.textures[texIdx].decoded) return;
  var texW = TX_state.textures[texIdx].decoded.width;
  var texH = TX_state.textures[texIdx].decoded.height;
  if(!CB_state.faceUVOverrides) CB_state.faceUVOverrides = {};

  if(mode === 'planar'){
    // Compute XY bbox of ALL relevant vertex positions across selected faces
    // (using bone-local positions, which is what segmented stores).
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(var i = 0; i < refs.length; i++){
      var seg = CB_state.segmented[refs[i].bone];
      // Get the face's 4 verts via the segmented data; but we need vertex
      // indices for this face. Recompute via assignUVsMaterials' faces4.
      var asnAll = CB_assignUVsMaterials(CB_state.segmented, CB_state.templateKmd,
        (document.getElementById('cbUvStrategy')||{}).value || 'nearest');
      var face4 = asnAll[refs[i].bone].faces4[refs[i].face];
      for(var k = 0; k < 4; k++){
        var v = seg.verts[face4[k]];
        if(!v) continue;
        if(v[0] < minX) minX = v[0]; if(v[0] > maxX) maxX = v[0];
        if(v[1] < minY) minY = v[1]; if(v[1] > maxY) maxY = v[1];
      }
    }
    var rangeX = maxX - minX, rangeY = maxY - minY;
    if(rangeX < 1e-6) rangeX = 1; if(rangeY < 1e-6) rangeY = 1;
    // For each face, project its verts to UV via bbox normalization
    var asn = CB_assignUVsMaterials(CB_state.segmented, CB_state.templateKmd,
      (document.getElementById('cbUvStrategy')||{}).value || 'nearest');
    for(var i = 0; i < refs.length; i++){
      var face4 = asn[refs[i].bone].faces4[refs[i].face];
      var seg = CB_state.segmented[refs[i].bone];
      var quad = [];
      for(var k = 0; k < 4; k++){
        var v = seg.verts[face4[k]];
        if(!v){ quad.push([0,0]); continue; }
        var u = Math.round((v[0] - minX) / rangeX * (texW - 1));
        var w = Math.round((v[1] - minY) / rangeY * (texH - 1));
        // Flip V so up-in-world is up-in-texture
        w = (texH - 1) - w;
        quad.push([u & 0xFF, w & 0xFF]);
      }
      if(!CB_state.faceUVOverrides[refs[i].bone]) CB_state.faceUVOverrides[refs[i].bone] = {};
      CB_state.faceUVOverrides[refs[i].bone][refs[i].face] = quad;
    }
  } else if(mode === 'stretch'){
    // For each face, scale its existing UV quad to span [0..texW × 0..texH]
    for(var i = 0; i < refs.length; i++){
      var quad = refs[i].uvs;
      var qMinU = Infinity, qMaxU = -Infinity, qMinV = Infinity, qMaxV = -Infinity;
      for(var k = 0; k < 4; k++){
        if(quad[k][0] < qMinU) qMinU = quad[k][0];
        if(quad[k][0] > qMaxU) qMaxU = quad[k][0];
        if(quad[k][1] < qMinV) qMinV = quad[k][1];
        if(quad[k][1] > qMaxV) qMaxV = quad[k][1];
      }
      var rU = qMaxU - qMinU, rV = qMaxV - qMinV;
      if(rU < 1) rU = 1; if(rV < 1) rV = 1;
      var newQuad = [];
      for(var k = 0; k < 4; k++){
        var nu = Math.round((quad[k][0] - qMinU) / rU * (texW - 1));
        var nv = Math.round((quad[k][1] - qMinV) / rV * (texH - 1));
        newQuad.push([nu & 0xFF, nv & 0xFF]);
      }
      if(!CB_state.faceUVOverrides[refs[i].bone]) CB_state.faceUVOverrides[refs[i].bone] = {};
      CB_state.faceUVOverrides[refs[i].bone][refs[i].face] = newQuad;
    }
  }
  CB_renderUVEditor();
  CB_rebuildScene();
  CB_state.needsRender = true;
}

// Reset overrides for all faces of the selected material.
function CB_uvResetSelected(){
  if(CB_state.selectedMaterial === null || !CB_state.faceUVOverrides) return;
  var refs = CB_uvCollectActiveFaces();
  // Same restriction as auto-fit: if user has a face selection, reset only those
  var selKeys = Object.keys(CB_state.selectedFaces || {});
  if(selKeys.length > 0){
    refs = refs.filter(function(r){ return CB_state.selectedFaces[r.bone + ':' + r.face]; });
  }
  for(var i = 0; i < refs.length; i++){
    if(CB_state.faceUVOverrides[refs[i].bone]){
      delete CB_state.faceUVOverrides[refs[i].bone][refs[i].face];
    }
  }
  CB_renderUVEditor();
  CB_rebuildScene();
  CB_state.needsRender = true;
}

// Update the selection count chip in the viewport top bar. Called whenever
// selectedFaces changes; cheap to call repeatedly.
function CB_updateSelCount(){
  var el = document.getElementById('cbSelCount');
  if(!el) return;
  var n = Object.keys(CB_state.selectedFaces || {}).length;
  if(n === 0){ el.textContent = ''; return; }
  el.textContent = '· ' + n + ' face' + (n === 1 ? '' : 's') + ' selected';
}

// ============================================================
