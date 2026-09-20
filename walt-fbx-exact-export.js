import * as THREE from 'three';

const FBX_MAGIC = 'Kaydara FBX Binary  \0\x1a\0';
const FBX_KTIME_V7 = 46186158000n;
const FBX_KTIME_V8 = 141120000n;

const KEY_ATTR_FLAGS = 0x04 | 0x100 | 0x2000 | 0x4000;
const KEY_ATTR_DATAFLOAT = [0.0, 0.0, 9.419963346924634e-30, 0.0];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

function prop(type, value, extra = null) {
  return { type, value, extra };
}

function node(name, properties = [], children = []) {
  return { name, properties, children };
}

function str(value) { return prop('S', String(value)); }
function i32(value) { return prop('I', Number(value)); }
function i64(value) { return prop('L', BigInt(value)); }
function f32(value) { return prop('F', Number(value)); }
function f64(value) { return prop('D', Number(value)); }

function typedArrayProp(type, values) {
  let array;
  if (type === 'l') array = values instanceof BigInt64Array ? values : BigInt64Array.from(values);
  else if (type === 'i') array = values instanceof Int32Array ? values : Int32Array.from(values);
  else if (type === 'f') array = values instanceof Float32Array ? values : Float32Array.from(values);
  else if (type === 'd') array = values instanceof Float64Array ? values : Float64Array.from(values);
  else throw new Error(`WaltExactFBX: array type ${type} no soportado`);

  const raw = new Uint8Array(array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength));
  return prop(type, null, { length: array.length, encoding: 0, payload: raw });
}

function fbxNameClass(name, cls) {
  return `${name}\x00\x01${cls}`;
}

class ExactBinaryParser {
  constructor(buffer) {
    this.buffer = buffer;
    this.dv = new DataView(buffer);
    this.u8 = new Uint8Array(buffer);
    this.offset = 0;
    this.version = 0;
    this.is64 = false;
    this.nullSize = 13;
  }

  readText(start, length) {
    return textDecoder.decode(this.u8.subarray(start, start + length));
  }

  readU8() {
    return this.dv.getUint8(this.offset++);
  }

  readI16() {
    const v = this.dv.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readI32() {
    const v = this.dv.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readU32() {
    const v = this.dv.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readI64() {
    const v = this.dv.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }

  readU64() {
    const v = this.dv.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }

  readF32() {
    const v = this.dv.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readF64() {
    const v = this.dv.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  readProperty() {
    const type = String.fromCharCode(this.readU8());

    switch (type) {
      case 'Y': return prop(type, this.readI16());
      case 'C': return prop(type, this.readU8() !== 0);
      case 'I': return prop(type, this.readI32());
      case 'F': return prop(type, this.readF32());
      case 'D': return prop(type, this.readF64());
      case 'L': return prop(type, this.readI64());

      case 'S':
      case 'R': {
        const length = this.readU32();
        const start = this.offset;
        this.offset += length;
        const bytes = this.u8.slice(start, start + length);
        return type === 'S'
          ? prop(type, textDecoder.decode(bytes))
          : prop(type, bytes);
      }

      case 'f':
      case 'd':
      case 'l':
      case 'i':
      case 'b':
      case 'c': {
        const length = this.readU32();
        const encoding = this.readU32();
        const compressedLength = this.readU32();
        const start = this.offset;
        this.offset += compressedLength;
        return prop(type, null, {
          length,
          encoding,
          payload: this.u8.slice(start, start + compressedLength)
        });
      }

      default:
        throw new Error(`WaltExactFBX: propiedad desconocida ${type}`);
    }
  }

  readNode() {
    const headerStart = this.offset;
    let endOffset, propertyCount, propertyLength;

    if (this.is64) {
      endOffset = Number(this.readU64());
      propertyCount = Number(this.readU64());
      propertyLength = Number(this.readU64());
    } else {
      endOffset = this.readU32();
      propertyCount = this.readU32();
      propertyLength = this.readU32();
    }

    const nameLength = this.readU8();

    if (endOffset === 0 && propertyCount === 0 && propertyLength === 0 && nameLength === 0) {
      return null;
    }

    const name = this.readText(this.offset, nameLength);
    this.offset += nameLength;

    const properties = [];
    for (let i = 0; i < propertyCount; i++) properties.push(this.readProperty());

    const children = [];
    while (this.offset < endOffset - this.nullSize) {
      const before = this.offset;
      const child = this.readNode();
      if (!child) break;
      children.push(child);
      if (this.offset <= before) break;
    }

    this.offset = endOffset;

    return {
      name,
      properties,
      children,
      _headerStart: headerStart,
      _endOffset: endOffset
    };
  }

  parse() {
    const magic = this.readText(0, 23);
    if (magic !== FBX_MAGIC) throw new Error('WaltExactFBX: el Target no es FBX binario.');

    this.offset = 23;
    this.version = this.readU32();
    this.is64 = this.version >= 7500;
    this.nullSize = this.is64 ? 25 : 13;

    const nodes = [];
    while (this.offset < this.buffer.byteLength) {
      const before = this.offset;
      const n = this.readNode();
      if (!n) break;
      nodes.push(n);
      if (this.offset <= before) break;
    }

    const footerStart = this.offset;
    const footer = this.u8.slice(footerStart);

    return {
      version: this.version,
      is64: this.is64,
      nodes,
      footer
    };
  }
}

function propertyByteLength(p) {
  switch (p.type) {
    case 'Y': return 1 + 2;
    case 'C': return 1 + 1;
    case 'I':
    case 'F': return 1 + 4;
    case 'D':
    case 'L': return 1 + 8;
    case 'S': return 1 + 4 + textEncoder.encode(p.value).length;
    case 'R': return 1 + 4 + p.value.length;
    case 'f':
    case 'd':
    case 'l':
    case 'i':
    case 'b':
    case 'c':
      return 1 + 12 + p.extra.payload.length;
    default:
      throw new Error(`WaltExactFBX: no sé medir propiedad ${p.type}`);
  }
}

function writeProperty(out, view, offset, p) {
  out[offset++] = p.type.charCodeAt(0);

  switch (p.type) {
    case 'Y':
      view.setInt16(offset, p.value, true); return offset + 2;
    case 'C':
      out[offset] = p.value ? 1 : 0; return offset + 1;
    case 'I':
      view.setInt32(offset, p.value, true); return offset + 4;
    case 'F':
      view.setFloat32(offset, p.value, true); return offset + 4;
    case 'D':
      view.setFloat64(offset, p.value, true); return offset + 8;
    case 'L':
      view.setBigInt64(offset, BigInt(p.value), true); return offset + 8;

    case 'S': {
      const bytes = textEncoder.encode(p.value);
      view.setUint32(offset, bytes.length, true);
      offset += 4;
      out.set(bytes, offset);
      return offset + bytes.length;
    }

    case 'R': {
      view.setUint32(offset, p.value.length, true);
      offset += 4;
      out.set(p.value, offset);
      return offset + p.value.length;
    }

    case 'f':
    case 'd':
    case 'l':
    case 'i':
    case 'b':
    case 'c': {
      view.setUint32(offset, p.extra.length, true); offset += 4;
      view.setUint32(offset, p.extra.encoding, true); offset += 4;
      view.setUint32(offset, p.extra.payload.length, true); offset += 4;
      out.set(p.extra.payload, offset);
      return offset + p.extra.payload.length;
    }
  }

  return offset;
}

function measureNode(n, is64) {
  const header = is64 ? 25 : 13;
  const nameBytes = textEncoder.encode(n.name);
  const propLen = n.properties.reduce((sum, p) => sum + propertyByteLength(p), 0);
  let childrenLen = 0;
  for (const c of n.children) childrenLen += measureNode(c, is64);
  const nullLen = n.children.length ? (is64 ? 25 : 13) : 0;
  return header + nameBytes.length + propLen + childrenLen + nullLen;
}

function writeNode(out, view, n, start, is64) {
  const headerLen = is64 ? 25 : 13;
  const nameBytes = textEncoder.encode(n.name);
  const propertyLen = n.properties.reduce((sum, p) => sum + propertyByteLength(p), 0);
  const totalLen = measureNode(n, is64);
  const endOffset = start + totalLen;

  let offset = start;
  if (is64) {
    view.setBigUint64(offset, BigInt(endOffset), true); offset += 8;
    view.setBigUint64(offset, BigInt(n.properties.length), true); offset += 8;
    view.setBigUint64(offset, BigInt(propertyLen), true); offset += 8;
  } else {
    view.setUint32(offset, endOffset, true); offset += 4;
    view.setUint32(offset, n.properties.length, true); offset += 4;
    view.setUint32(offset, propertyLen, true); offset += 4;
  }

  out[offset++] = nameBytes.length;
  out.set(nameBytes, offset);
  offset += nameBytes.length;

  for (const p of n.properties) offset = writeProperty(out, view, offset, p);

  for (const c of n.children) {
    offset = writeNode(out, view, c, offset, is64);
  }

  if (n.children.length) {
    const nullLen = is64 ? 25 : 13;
    out.fill(0, offset, offset + nullLen);
    offset += nullLen;
  }

  return offset;
}

function encodeDocument(doc) {
  const magic = textEncoder.encode(FBX_MAGIC);
  const topNull = doc.is64 ? 25 : 13;
  const nodesLength = doc.nodes.reduce((sum, n) => sum + measureNode(n, doc.is64), 0);
  const total = 23 + 4 + nodesLength + topNull + doc.footer.length;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  out.set(magic, 0);
  view.setUint32(23, doc.version, true);

  let offset = 27;
  for (const n of doc.nodes) offset = writeNode(out, view, n, offset, doc.is64);

  out.fill(0, offset, offset + topNull);
  offset += topNull;
  out.set(doc.footer, offset);

  return out;
}

function findTop(doc, name) {
  return doc.nodes.find(n => n.name === name) || null;
}

function firstValue(n) {
  return n?.properties?.[0]?.value;
}

function bareObjectName(value) {
  return String(value || '').split('\x00')[0].replace(/^[^:]+::/, '');
}

function objectUid(n) {
  const p = n?.properties?.[0];
  return p?.type === 'L' ? p.value : null;
}

function getObjects(doc) {
  const objects = findTop(doc, 'Objects');
  if (!objects) throw new Error('WaltExactFBX: falta Objects en el Target.');
  return objects;
}

function getConnections(doc) {
  let connections = findTop(doc, 'Connections');
  if (!connections) {
    connections = node('Connections');
    doc.nodes.push(connections);
  }
  return connections;
}

function buildModelMap(doc) {
  const map = new Map();
  for (const n of getObjects(doc).children) {
    if (n.name !== 'Model' || n.properties.length < 2) continue;
    const uid = objectUid(n);
    const name = bareObjectName(n.properties[1].value);
    if (uid != null && name) map.set(name, { uid, node: n });
  }
  return map;
}

function p70Value(modelNode, name) {
  const p70 = modelNode.children.find(c => c.name === 'Properties70');
  if (!p70) return null;

  for (const p of p70.children) {
    if (p.name !== 'P' || p.properties.length < 5) continue;
    if (p.properties[0].value !== name) continue;
    return p.properties.slice(4).map(x => x.value);
  }
  return null;
}

function modelRotationOrder(modelNode) {
  const value = p70Value(modelNode, 'RotationOrder');
  return value?.length ? Number(value[0]) : 0;
}

function eulerOrderFromFbx(value) {
  switch (Number(value)) {
    case 0: return 'XYZ';
    case 1: return 'XZY';
    case 2: return 'YZX';
    case 3: return 'YXZ';
    case 4: return 'ZXY';
    case 5: return 'ZYX';
    case 6: return 'XYZ';
    default: return 'XYZ';
  }
}

function rotationPrelude(modelNode, requestedMode) {
  if (requestedMode === 'xyz') return 'XYZ';
  return eulerOrderFromFbx(modelRotationOrder(modelNode));
}

function unwrapEuler(prev, curr) {
  if (!prev) return curr;
  for (let i = 0; i < 3; i++) {
    while (curr[i] - prev[i] > 180) curr[i] -= 360;
    while (curr[i] - prev[i] < -180) curr[i] += 360;
  }
  return curr;
}

function quaternionTrackToEulerAxes(track, modelNode, requestedMode) {
  const order = rotationPrelude(modelNode, requestedMode);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, order);
  const axes = [[], [], []];
  let prev = null;

  for (let i = 0; i < track.times.length; i++) {
    q.fromArray(track.values, i * 4).normalize();
    e.setFromQuaternion(q, order);

    const triple = [
      THREE.MathUtils.radToDeg(e.x),
      THREE.MathUtils.radToDeg(e.y),
      THREE.MathUtils.radToDeg(e.z)
    ];

    unwrapEuler(prev, triple);
    axes[0].push(triple[0]);
    axes[1].push(triple[1]);
    axes[2].push(triple[2]);
    prev = triple;
  }

  return { order, axes };
}

function secondsToKTime(seconds, version) {
  const rate = version >= 8000 ? FBX_KTIME_V8 : FBX_KTIME_V7;
  const micros = BigInt(Math.round(Number(seconds) * 1_000_000));
  return (micros * rate) / 1_000_000n;
}

function makeP(name, typeName, label, flags, values = []) {
  const props = [str(name), str(typeName), str(label), str(flags)];
  for (const v of values) {
    if (typeof v === 'bigint') props.push(i64(v));
    else if (typeof v === 'number') props.push(f64(v));
    else props.push(str(v));
  }
  return node('P', props);
}

function properties70(entries) {
  return node('Properties70', [], entries);
}

function animationStackNode(uid, name, start, stop) {
  return node('AnimationStack', [
    i64(uid), str(fbxNameClass(name, 'AnimStack')), str('')
  ], [
    properties70([
      makeP('LocalStart', 'KTime', 'Time', '', [start]),
      makeP('LocalStop', 'KTime', 'Time', '', [stop]),
      makeP('ReferenceStart', 'KTime', 'Time', '', [start]),
      makeP('ReferenceStop', 'KTime', 'Time', '', [stop])
    ])
  ]);
}

function animationLayerNode(uid, name) {
  return node('AnimationLayer', [
    i64(uid), str(fbxNameClass(name, 'AnimLayer')), str('')
  ]);
}

function curveNode(uid, attrName, defaults) {
  const entries = ['X', 'Y', 'Z'].map((axis, i) =>
    makeP(`d|${axis}`, 'Number', '', 'A', [defaults[i] ?? 0])
  );

  return node('AnimationCurveNode', [
    i64(uid), str(fbxNameClass(attrName, 'AnimCurveNode')), str('')
  ], [properties70(entries)]);
}

function animationCurve(uid, times, values) {
  const ktimes = BigInt64Array.from(times);
  const vals = Float32Array.from(values);

  return node('AnimationCurve', [
    i64(uid), str(fbxNameClass('', 'AnimCurve')), str('')
  ], [
    node('Default', [f64(vals[0] ?? 0)]),
    node('KeyVer', [i32(4008)]),
    node('KeyTime', [typedArrayProp('l', ktimes)]),
    node('KeyValueFloat', [typedArrayProp('f', vals)]),
    node('KeyAttrFlags', [typedArrayProp('i', new Int32Array([KEY_ATTR_FLAGS]))]),
    node('KeyAttrDataFloat', [typedArrayProp('f', new Float32Array(KEY_ATTR_DATAFLOAT))]),
    node('KeyAttrRefCount', [typedArrayProp('i', new Int32Array([times.length]))])
  ]);
}

function connection(type, src, dst, relationship = null) {
  const props = [str(type), i64(src), i64(dst)];
  if (relationship != null) props.push(str(relationship));
  return node('C', props);
}

function collectExistingAnimationIds(objects) {
  const ids = new Set();
  for (const n of objects.children) {
    if (!/^Animation(Stack|Layer|CurveNode|Curve)$/.test(n.name)) continue;
    const uid = objectUid(n);
    if (uid != null) ids.add(uid.toString());
  }
  return ids;
}

function removeExistingAnimation(doc) {
  const objects = getObjects(doc);
  const oldIds = collectExistingAnimationIds(objects);

  if (oldIds.size) {
    objects.children = objects.children.filter(n => {
      if (!/^Animation(Stack|Layer|CurveNode|Curve)$/.test(n.name)) return true;
      const uid = objectUid(n);
      return uid == null || !oldIds.has(uid.toString());
    });

    const connections = getConnections(doc);
    connections.children = connections.children.filter(c => {
      if (c.name !== 'C' || c.properties.length < 3) return true;
      const src = c.properties[1]?.value;
      const dst = c.properties[2]?.value;
      return !oldIds.has(String(src)) && !oldIds.has(String(dst));
    });
  }

  return oldIds.size;
}

function maxObjectUid(doc) {
  let max = 1n;
  for (const n of getObjects(doc).children) {
    const uid = objectUid(n);
    if (uid != null && uid > max) max = uid;
  }
  return max;
}

function setSingleIntNodeValue(n, value) {
  if (!n) return;
  if (!n.properties.length) n.properties.push(i32(value));
  else {
    n.properties[0].type = 'I';
    n.properties[0].value = Number(value);
  }
}

function ensureDefinitionType(definitions, typeName, count) {
  let entry = definitions.children.find(n =>
    n.name === 'ObjectType' && n.properties?.[0]?.value === typeName
  );

  if (!entry) {
    entry = node('ObjectType', [str(typeName)], [node('Count', [i32(count)])]);
    definitions.children.push(entry);
    return;
  }

  let countNode = entry.children.find(n => n.name === 'Count');
  if (!countNode) {
    countNode = node('Count', [i32(count)]);
    entry.children.unshift(countNode);
  } else {
    setSingleIntNodeValue(countNode, count);
  }
}

function updateDefinitions(doc, counts) {
  const definitions = findTop(doc, 'Definitions');
  if (!definitions) return;

  const countNode = definitions.children.find(n => n.name === 'Count');
  if (countNode?.properties?.length) {
    const base = Number(countNode.properties[0].value) || 0;
    setSingleIntNodeValue(countNode, base + counts.total);
  }

  ensureDefinitionType(definitions, 'AnimationStack', counts.stack);
  ensureDefinitionType(definitions, 'AnimationLayer', counts.layer);
  ensureDefinitionType(definitions, 'AnimationCurveNode', counts.curveNode);
  ensureDefinitionType(definitions, 'AnimationCurve', counts.curve);
}

function trackParts(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot <= 0) return null;
  return {
    nodeName: trackName.slice(0, dot),
    property: trackName.slice(dot + 1)
  };
}

function shouldExportPosition(name, options = {}) {
  return name === 'root' ||
    name === 'TORSO-Spine' ||
    /^IK-(Hand|Foot)\./.test(name) ||
    /^POLE-(Arm|Leg)\./.test(name) ||
    (options.includeDeformPositions && /^DEF-/.test(name));
}

function buildAnimationPlan(doc, clip, options) {
  const modelMap = buildModelMap(doc);
  const groups = [];

  for (const track of clip.tracks) {
    const parsed = trackParts(track.name);
    if (!parsed) continue;

    const model = modelMap.get(parsed.nodeName);
    if (!model) continue;

    if (parsed.property === 'scale') continue;
    if (parsed.property === 'position' && !shouldExportPosition(parsed.nodeName, options)) continue;
    if (parsed.property !== 'position' && parsed.property !== 'quaternion') continue;

    if (parsed.property === 'position') {
      const axes = [[], [], []];
      for (let i = 0; i < track.times.length; i++) {
        axes[0].push(track.values[i * 3]);
        axes[1].push(track.values[i * 3 + 1]);
        axes[2].push(track.values[i * 3 + 2]);
      }

      groups.push({
        model,
        attrName: 'T',
        fbxProp: 'Lcl Translation',
        times: track.times,
        axes,
        rotationOrder: null
      });
      continue;
    }

    const converted = quaternionTrackToEulerAxes(track, model.node, options.rotationMode);
    groups.push({
      model,
      attrName: 'R',
      fbxProp: 'Lcl Rotation',
      times: track.times,
      axes: converted.axes,
      rotationOrder: converted.order
    });
  }

  return groups;
}

/**
 * Reuses the original Target FBX and rewrites only the animation section.
 * Geometry, skin, bind matrices, model hierarchy, units and transforms come
 * from the original uploaded bytes.
 */
export function injectAnimationsIntoOriginalFBX(originalBuffer, clips, {
  rotationMode = 'xyz',
  currentActionName = null
} = {}) {
  if (!originalBuffer) throw new Error('WaltExactFBX: no se conservó el Target FBX original.');

  const validClips = (Array.isArray(clips) ? clips : [clips]).filter(Boolean);
  if (!validClips.length) throw new Error('WaltExactFBX: no hay Actions para inyectar.');

  const parser = new ExactBinaryParser(originalBuffer.slice(0));
  const doc = parser.parse();

  const removed = removeExistingAnimation(doc);
  const objects = getObjects(doc);
  const connections = getConnections(doc);

  let uid = maxObjectUid(doc) + 1001n;
  const nextUid = () => uid++;

  let stackCount = 0;
  let layerCount = 0;
  let curveNodeCount = 0;
  let curveCount = 0;
  const clipReports = [];

  for (const clipEntry of validClips) {
    const clip = clipEntry.clip || clipEntry;
    const includeDeformPositions = !!clipEntry.includeDeformPositions;
    const actionName = clipEntry.actionName || clip.name || 'Retargeted_Action';

    const groups = buildAnimationPlan(doc, clip, {
      rotationMode,
      includeDeformPositions
    });

    if (!groups.length) continue;

    const stackUid = nextUid();
    const layerUid = nextUid();

    let duration = 0;
    for (const g of groups) {
      if (g.times.length) duration = Math.max(duration, Number(g.times[g.times.length - 1]));
    }

    const startTime = 0n;
    const stopTime = secondsToKTime(duration, doc.version);

    objects.children.push(animationStackNode(stackUid, actionName, startTime, stopTime));
    objects.children.push(animationLayerNode(layerUid, actionName));
    connections.children.push(connection('OO', layerUid, stackUid));

    stackCount++;
    layerCount++;

    let localCurveNodes = 0;
    let localCurves = 0;

    for (const group of groups) {
      const curveNodeUid = nextUid();
      const defaults = [
        group.axes[0]?.[0] ?? 0,
        group.axes[1]?.[0] ?? 0,
        group.axes[2]?.[0] ?? 0
      ];

      objects.children.push(curveNode(curveNodeUid, group.attrName, defaults));
      curveNodeCount++;
      localCurveNodes++;

      connections.children.push(connection('OO', curveNodeUid, layerUid));
      connections.children.push(connection('OP', curveNodeUid, group.model.uid, group.fbxProp));

      const ktimes = Array.from(group.times, t => secondsToKTime(t, doc.version));

      for (let axis = 0; axis < 3; axis++) {
        const curveUid = nextUid();
        const axisName = ['X', 'Y', 'Z'][axis];

        objects.children.push(animationCurve(curveUid, ktimes, group.axes[axis]));
        curveCount++;
        localCurves++;

        connections.children.push(
          connection('OP', curveUid, curveNodeUid, `d|${axisName}`)
        );
      }
    }

    clipReports.push({
      name: actionName,
      duration,
      modelsAnimated: new Set(groups.map(g => g.model.uid.toString())).size,
      curveNodes: localCurveNodes,
      curves: localCurves,
      includeDeformPositions
    });
  }

  if (!stackCount) {
    throw new Error('WaltExactFBX: ninguna Action produjo curvas compatibles con el Target.');
  }

  updateDefinitions(doc, {
    total: stackCount + layerCount + curveNodeCount + curveCount,
    stack: stackCount,
    layer: layerCount,
    curveNode: curveNodeCount,
    curve: curveCount
  });

  const takes = findTop(doc, 'Takes');
  const current = takes?.children?.find(n => n.name === 'Current');
  const fallbackCurrent = clipReports[clipReports.length - 1]?.name || '';
  if (current) current.properties = [str(currentActionName || fallbackCurrent)];

  const bytes = encodeDocument(doc);

  return {
    bytes,
    report: {
      version: doc.version,
      removedAnimations: removed,
      clips: clipReports,
      stacks: stackCount,
      curveNodes: curveNodeCount,
      curves: curveCount,
      rotationMode
    }
  };
}

export function injectAnimationIntoOriginalFBX(originalBuffer, clip, options = {}) {
  const actionName = options.actionName || clip?.name || 'Retargeted_Action';

  const result = injectAnimationsIntoOriginalFBX(
    originalBuffer,
    [{ clip, actionName }],
    {
      rotationMode: options.rotationMode || 'xyz',
      currentActionName: actionName
    }
  );

  return {
    bytes: result.bytes,
    report: {
      ...result.report,
      ...(result.report.clips[0] || {})
    }
  };
}
