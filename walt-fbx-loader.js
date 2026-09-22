import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const WALT_FBX_VERSION = '0.4.0';

// Los DEF se reconstruyen desde los controles funcionales del CloudRig.
// BlendCap's shipped Mixamo→CloudRig preset drives HIP-Spine (not FK-Hips)
// from source Hips rotation, so the pelvis DEF must inherit the lower-section
// frame. @LOWER resolves to HIP-Spine or HTP-Spine depending on the FBX.
const CLOUDRIG_BINDINGS = [
  { driver: '@LOWER', driven: 'DEF-Hips' },
  { driver: '@LOWER', driven: 'DEF-Hip.L' },
  { driver: '@LOWER', driven: 'DEF-Hip.R' },
  { driver: 'FK-Spine', driven: 'DEF-Spine' },
  { driver: 'FK-Chest', driven: 'DEF-Chest' },
  { driver: 'FK-Neck', driven: 'DEF-Neck' },
  { driver: 'FK-Head', driven: 'DEF-Head' },

  { driver: 'FK-Shoulder.L', driven: 'DEF-Shoulder.L' },
  { driver: 'FK-UpperArm.L', driven: 'DEF-UpperArm_1.L' },
  { driver: 'FK-UpperArm.L', driven: 'DEF-UpperArm_2.L' },
  { driver: 'FK-Forearm.L', driven: 'DEF-Forearm_1.L' },
  { driver: 'FK-Forearm.L', driven: 'DEF-Forearm_2.L' },
  { driver: 'FK-Hand.L', driven: 'DEF-Hand.L' },

  { driver: 'FK-Shoulder.R', driven: 'DEF-Shoulder.R' },
  { driver: 'FK-UpperArm.R', driven: 'DEF-UpperArm_1.R' },
  { driver: 'FK-UpperArm.R', driven: 'DEF-UpperArm_2.R' },
  { driver: 'FK-Forearm.R', driven: 'DEF-Forearm_1.R' },
  { driver: 'FK-Forearm.R', driven: 'DEF-Forearm_2.R' },
  { driver: 'FK-Hand.R', driven: 'DEF-Hand.R' },

  { driver: 'FK-Thigh.L', driven: 'DEF-Thigh_1.L' },
  { driver: 'FK-Thigh.L', driven: 'DEF-Thigh_2.L' },
  { driver: 'FK-Knee.L', driven: 'DEF-Knee_1.L' },
  { driver: 'FK-Knee.L', driven: 'DEF-Knee_2.L' },
  { driver: 'FK-Foot.L', driven: 'DEF-Foot.L' },
  { driver: 'FK-Toes.L', driven: 'DEF-Toes.L' },

  { driver: 'FK-Thigh.R', driven: 'DEF-Thigh_1.R' },
  { driver: 'FK-Thigh.R', driven: 'DEF-Thigh_2.R' },
  { driver: 'FK-Knee.R', driven: 'DEF-Knee_1.R' },
  { driver: 'FK-Knee.R', driven: 'DEF-Knee_2.R' },
  { driver: 'FK-Foot.R', driven: 'DEF-Foot.R' },
  { driver: 'FK-Toes.R', driven: 'DEF-Toes.R' }
];

// Jerarquía FK "virtual" del CloudRig.
// En el FBX exportado varios controles FK viven en ramas separadas porque
// Blender resolvía sus posiciones mediante constraints. Esos constraints
// no existen en el FBX, así que reconstruimos la jerarquía anatómica aquí.
const CLOUDRIG_FK_PARENT = {
  'FK-Hips': '@LOWER',
  'FK-Spine': 'TORSO-Spine',
  'FK-Chest': 'FK-Spine',
  'FK-Neck': 'FK-Chest',
  'FK-Head': 'FK-Neck',

  'FK-Shoulder.L': 'FK-Chest',
  'FK-UpperArm.L': 'FK-Shoulder.L',
  'FK-Forearm.L': 'FK-UpperArm.L',
  'FK-Hand.L': 'FK-Forearm.L',

  'FK-Shoulder.R': 'FK-Chest',
  'FK-UpperArm.R': 'FK-Shoulder.R',
  'FK-Forearm.R': 'FK-UpperArm.R',
  'FK-Hand.R': 'FK-Forearm.R',

  // CloudRig hinge_setup carries the first FK limb control from the lower
  // section; the raw FBX lost that ARMATURE constraint.
  'FK-Thigh.L': '@LOWER',
  'FK-Knee.L': 'FK-Thigh.L',
  'FK-Foot.L': 'FK-Knee.L',
  // FK-Toes is parentless in data but carried from FK-Foot in FK mode.
  'FK-Toes.L': 'FK-Foot.L',

  'FK-Thigh.R': '@LOWER',
  'FK-Knee.R': 'FK-Thigh.R',
  'FK-Foot.R': 'FK-Knee.R',
  'FK-Toes.R': 'FK-Foot.R'
};

const CLOUDRIG_PORTABLE_PARENT = {
  'FK-Hips': '@LOWER',

  'FK-Spine': 'TORSO-Spine',
  'FK-Chest': 'FK-Spine',

  'FK-Shoulder.L': 'FK-Chest',
  'FK-Shoulder.R': 'FK-Chest',

  'FK-Neck': 'FK-Chest',
  'FK-Head': 'FK-Neck',

  'FK-UpperArm.L': 'FK-Shoulder.L',
  'FK-Forearm.L': 'FK-UpperArm.L',
  'FK-Hand.L': 'FK-Forearm.L',

  'FK-UpperArm.R': 'FK-Shoulder.R',
  'FK-Forearm.R': 'FK-UpperArm.R',
  'FK-Hand.R': 'FK-Forearm.R',

  'FK-Thigh.L': '@LOWER',
  'FK-Knee.L': 'FK-Thigh.L',
  'FK-Foot.L': 'FK-Knee.L',
  'FK-Toes.L': 'FK-Foot.L',

  'FK-Thigh.R': '@LOWER',
  'FK-Knee.R': 'FK-Thigh.R',
  'FK-Foot.R': 'FK-Knee.R',
  'FK-Toes.R': 'FK-Foot.R'
};

const CLOUDRIG_FK_ORDER = [
  'FK-Hips',
  'FK-Spine', 'FK-Chest', 'FK-Neck', 'FK-Head',
  'FK-Shoulder.L', 'FK-UpperArm.L', 'FK-Forearm.L', 'FK-Hand.L',
  'FK-Shoulder.R', 'FK-UpperArm.R', 'FK-Forearm.R', 'FK-Hand.R',
  'FK-Thigh.L', 'FK-Knee.L', 'FK-Foot.L', 'FK-Toes.L',
  'FK-Thigh.R', 'FK-Knee.R', 'FK-Foot.R', 'FK-Toes.R'
];

const RIGIFY_BINDINGS = [
  // Main split spine. Intermediate DEF sections must follow the same FK
  // section, but keep their Rest local offsets through positionDriven.
  { driver: 'spine_fk', driven: 'DEF-spine' },
  { driver: 'spine_fk', driven: 'DEF-spine.001' },

  { driver: 'spine_fk.001', driven: 'DEF-spine.002' },
  { driver: 'spine_fk.001', driven: 'DEF-spine.003' },

  { driver: 'spine_fk.002', driven: 'DEF-spine.004' },
  { driver: 'spine_fk.002', driven: 'DEF-spine.005' },

  { driver: 'spine_fk.003', driven: 'DEF-spine.006' },

  // These deform bones are weighted by the mesh but live under ORG branches
  // whose Blender constraints are absent in the FBX runtime. Leaving them at
  // Rest is what creates the long "fan/spike" deformation from chest/pelvis.
  { driver: 'spine_fk', driven: 'DEF-pelvis.L' },
  { driver: 'spine_fk', driven: 'DEF-pelvis.R' },
  { driver: 'spine_fk.003', driven: 'DEF-breast.L' },
  { driver: 'spine_fk.003', driven: 'DEF-breast.R' },

  { driver: 'neck', driven: 'DEF-neck' },
  { driver: 'head', driven: 'DEF-head' },

  { driver: 'shoulder.L', driven: 'DEF-shoulder.L' },
  { driver: 'upper_arm_fk.L', driven: 'DEF-upper_arm.L' },
  { driver: 'forearm_fk.L', driven: 'DEF-forearm.L' },
  { driver: 'hand_fk.L', driven: 'DEF-hand.L' },

  { driver: 'shoulder.R', driven: 'DEF-shoulder.R' },
  { driver: 'upper_arm_fk.R', driven: 'DEF-upper_arm.R' },
  { driver: 'forearm_fk.R', driven: 'DEF-forearm.R' },
  { driver: 'hand_fk.R', driven: 'DEF-hand.R' },

  { driver: 'thigh_fk.L', driven: 'DEF-thigh.L' },
  { driver: 'shin_fk.L', driven: 'DEF-shin.L' },
  { driver: 'foot_fk.L', driven: 'DEF-foot.L' },
  { driver: 'toe_fk.L', driven: 'DEF-toe.L' },

  { driver: 'thigh_fk.R', driven: 'DEF-thigh.R' },
  { driver: 'shin_fk.R', driven: 'DEF-shin.R' },
  { driver: 'foot_fk.R', driven: 'DEF-foot.R' },
  { driver: 'toe_fk.R', driven: 'DEF-toe.R' }
]

// Same idea as CloudRig's virtual hierarchy: Rigify's exported FBX loses the
// MCH/constraint graph that carries the FK controls anatomically in Blender.
// Rebuild the useful humanoid parent chain in the browser.
const RIGIFY_FK_PARENT = {
  'spine_fk': 'torso',
  'spine_fk.001': 'spine_fk',
  'spine_fk.002': 'spine_fk.001',
  'spine_fk.003': 'spine_fk.002',
  'neck': 'spine_fk.003',
  'head': 'neck',

  'shoulder.L': 'spine_fk.003',
  'upper_arm_fk.L': 'shoulder.L',
  'forearm_fk.L': 'upper_arm_fk.L',
  'hand_fk.L': 'forearm_fk.L',

  'shoulder.R': 'spine_fk.003',
  'upper_arm_fk.R': 'shoulder.R',
  'forearm_fk.R': 'upper_arm_fk.R',
  'hand_fk.R': 'forearm_fk.R',

  // In the shipped Mixamo → Rigify preset Hips rotation drives spine_fk.
  // Treat that as the lower/pelvis frame so planted legs inherit pelvis turn.
  'thigh_fk.L': '@PELVIS',
  'shin_fk.L': 'thigh_fk.L',
  'foot_fk.L': 'shin_fk.L',
  'toe_fk.L': 'foot_fk.L',

  'thigh_fk.R': '@PELVIS',
  'shin_fk.R': 'thigh_fk.R',
  'foot_fk.R': 'shin_fk.R',
  'toe_fk.R': 'foot_fk.R'
};

const RIGIFY_FK_ORDER = [
  'spine_fk', 'spine_fk.001', 'spine_fk.002', 'spine_fk.003',
  'neck', 'head',
  'shoulder.L', 'upper_arm_fk.L', 'forearm_fk.L', 'hand_fk.L',
  'shoulder.R', 'upper_arm_fk.R', 'forearm_fk.R', 'hand_fk.R',
  'thigh_fk.L', 'shin_fk.L', 'foot_fk.L', 'toe_fk.L',
  'thigh_fk.R', 'shin_fk.R', 'foot_fk.R', 'toe_fk.R'
];

const LOGICAL_CHAINS = {
  mixamo: [
    ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'],
    ['Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'],
    ['Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'],
    ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'],
    ['Hips', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
  ],
  cloudrig: [
    ['DEF-Hips', 'DEF-Spine', 'DEF-Chest', 'DEF-Neck', 'DEF-Head'],
    ['DEF-Chest', 'DEF-Shoulder.L', 'DEF-UpperArm_1.L', 'DEF-Forearm_1.L', 'DEF-Hand.L'],
    ['DEF-Chest', 'DEF-Shoulder.R', 'DEF-UpperArm_1.R', 'DEF-Forearm_1.R', 'DEF-Hand.R'],
    ['DEF-Hips', 'DEF-Thigh_1.L', 'DEF-Knee_1.L', 'DEF-Foot.L', 'DEF-Toes.L'],
    ['DEF-Hips', 'DEF-Thigh_1.R', 'DEF-Knee_1.R', 'DEF-Foot.R', 'DEF-Toes.R']
  ],
  rigify: [
    // The viewport mesh is deformed by DEF bones, not by Rigify's controller
    // hierarchy. Drawing the FK/MCH controls made the blue skeleton appear
    // detached from an otherwise-correct preview. Follow the driven skeleton.
    [
      'DEF-spine',
      'DEF-spine.001',
      'DEF-spine.002',
      'DEF-spine.003',
      'DEF-spine.004',
      'DEF-spine.005',
      'DEF-spine.006'
    ],

    [
      'DEF-spine.006',
      'DEF-shoulder.L',
      'DEF-upper_arm.L',
      'DEF-upper_arm.L.001',
      'DEF-forearm.L',
      'DEF-forearm.L.001',
      'DEF-hand.L'
    ],
    [
      'DEF-spine.006',
      'DEF-shoulder.R',
      'DEF-upper_arm.R',
      'DEF-upper_arm.R.001',
      'DEF-forearm.R',
      'DEF-forearm.R.001',
      'DEF-hand.R'
    ],

    [
      'DEF-spine',
      'DEF-thigh.L',
      'DEF-thigh.L.001',
      'DEF-shin.L',
      'DEF-shin.L.001',
      'DEF-foot.L',
      'DEF-toe.L'
    ],
    [
      'DEF-spine',
      'DEF-thigh.R',
      'DEF-thigh.R.001',
      'DEF-shin.R',
      'DEF-shin.R.001',
      'DEF-foot.R',
      'DEF-toe.R'
    ],

    // Small weighted pelvis/chest helpers are also part of the visible mesh.
    ['DEF-spine', 'DEF-pelvis.L'],
    ['DEF-spine', 'DEF-pelvis.R'],
    ['DEF-spine.006', 'DEF-breast.L'],
    ['DEF-spine.006', 'DEF-breast.R']
  ]
};

function stripObjectPrefix(name) {
  return String(name || '').replace(/^[^:]+::/, '');
}

function originalName(object) {
  return object?.userData?.originalName || object?.name || '';
}

function canonical(name) {
  let n = stripObjectPrefix(String(name || '')).trim();
  if (n.includes(':') || n.includes('|')) n = n.split(/[:|]/).pop();
  n = n.replace(/^mixamorig\d*/i, '');
  return n.replace(/[\[\].:/_\s-]/g, '').toLowerCase();
}

function resolveCloudRigBone(rig, spec) {
  if (!rig || !spec) return null;
  if (spec === '@LOWER') {
    return rig.get('HIP-Spine') || rig.get('HTP-Spine') || null;
  }
  return rig.get(spec);
}

function cloudRigVirtualKeys(spec, bone) {
  const keys = new Set();
  if (spec) keys.add(spec);
  const original = originalName(bone);
  if (original) keys.add(original);
  if (bone?.name) keys.add(bone.name);
  return [...keys];
}

function depthOf(object) {
  let d = 0;
  while (object?.parent) {
    d++;
    object = object.parent;
  }
  return d;
}

class BinaryFBXReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.dv = new DataView(buffer);
    this.u8 = new Uint8Array(buffer);
    this.decoder = new TextDecoder('utf-8');
    this.offset = 0;
    this.version = 0;
    this.is64 = false;
  }

  text(start, length) {
    return this.decoder.decode(this.u8.subarray(start, start + length));
  }

  u8v() {
    const v = this.dv.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  i16() {
    const v = this.dv.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i32() {
    const v = this.dv.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  u32() {
    const v = this.dv.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i64() {
    const v = Number(this.dv.getBigInt64(this.offset, true));
    this.offset += 8;
    return v;
  }

  u64() {
    const v = Number(this.dv.getBigUint64(this.offset, true));
    this.offset += 8;
    return v;
  }

  f32() {
    const v = this.dv.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f64() {
    const v = this.dv.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  string() {
    const len = this.u32();
    const out = this.text(this.offset, len);
    this.offset += len;
    return out;
  }

  raw() {
    const len = this.u32();
    const start = this.offset;
    this.offset += len;
    return { rawLength: len, start };
  }

  array(type) {
    const length = this.u32();
    const encoding = this.u32();
    const compressedLength = this.u32();
    const start = this.offset;
    this.offset += compressedLength;
    return { arrayType: type, length, encoding, compressedLength, start };
  }

  property() {
    const type = String.fromCharCode(this.u8v());
    switch (type) {
      case 'Y': return this.i16();
      case 'C': return this.u8v() !== 0;
      case 'I': return this.i32();
      case 'F': return this.f32();
      case 'D': return this.f64();
      case 'L': return this.i64();
      case 'S': return this.string();
      case 'R': return this.raw();
      case 'f':
      case 'd':
      case 'l':
      case 'i':
      case 'b':
      case 'c':
        return this.array(type);
      default:
        throw new Error(`WaltFBX: tipo de propiedad FBX no soportado: ${type}`);
    }
  }

  nodeHeader() {
    const endOffset = this.is64 ? this.u64() : this.u32();
    const numProperties = this.is64 ? this.u64() : this.u32();
    const propertyListLength = this.is64 ? this.u64() : this.u32();
    const nameLength = this.u8v();
    return { endOffset, numProperties, propertyListLength, nameLength };
  }

  node() {
    const headerStart = this.offset;
    const h = this.nodeHeader();

    if (h.endOffset === 0 && h.numProperties === 0 && h.propertyListLength === 0 && h.nameLength === 0) {
      return null;
    }

    const name = this.text(this.offset, h.nameLength);
    this.offset += h.nameLength;

    const properties = [];
    for (let i = 0; i < h.numProperties; i++) {
      properties.push(this.property());
    }

    const children = [];
    while (this.offset < h.endOffset) {
      const before = this.offset;
      const child = this.node();
      if (!child) break;
      children.push(child);
      if (this.offset <= before) break;
    }

    this.offset = h.endOffset;
    return { name, properties, children, headerStart, endOffset: h.endOffset };
  }

  parse() {
    const magic = this.text(0, 21);
    if (!magic.startsWith('Kaydara FBX Binary')) {
      return { binary: false, version: null, nodes: [] };
    }

    this.offset = 23;
    this.version = this.u32();
    this.is64 = this.version >= 7500;

    const nodes = [];
    while (this.offset < this.buffer.byteLength) {
      const before = this.offset;
      const node = this.node();
      if (!node) break;
      nodes.push(node);
      if (this.offset <= before) break;
    }

    return { binary: true, version: this.version, nodes };
  }
}

function child(node, name) {
  return node?.children?.find(x => x.name === name) || null;
}

function extractMetadata(parsed) {
  const meta = {
    binary: parsed.binary,
    version: parsed.version,
    unitScaleFactor: 1,
    metersPerUnit: 0.01,
    upAxis: 1,
    upAxisSign: 1,
    frontAxis: 2,
    frontAxisSign: -1,
    coordAxis: 0,
    coordAxisSign: 1,
    axisNormalization: 'none',
    objects: new Map(),
    connections: [],
    constraintCount: 0,
    modelCount: 0,
    boneModelCount: 0
  };

  const globalSettings = parsed.nodes.find(n => n.name === 'GlobalSettings');
  const properties70 = child(globalSettings, 'Properties70');

  for (const p of properties70?.children || []) {
    if (p.name !== 'P' || p.properties.length < 5) continue;
    const propName = p.properties[0];
    const value = Number(p.properties[p.properties.length - 1]);

    if (propName === 'UnitScaleFactor') {
      if (Number.isFinite(value) && value > 0) meta.unitScaleFactor = value;
    } else if (propName === 'UpAxis' && Number.isFinite(value)) {
      meta.upAxis = value;
    } else if (propName === 'UpAxisSign' && Number.isFinite(value)) {
      meta.upAxisSign = value;
    } else if (propName === 'FrontAxis' && Number.isFinite(value)) {
      meta.frontAxis = value;
    } else if (propName === 'FrontAxisSign' && Number.isFinite(value)) {
      meta.frontAxisSign = value;
    } else if (propName === 'CoordAxis' && Number.isFinite(value)) {
      meta.coordAxis = value;
    } else if (propName === 'CoordAxisSign' && Number.isFinite(value)) {
      meta.coordAxisSign = value;
    }
  }

  meta.metersPerUnit = meta.unitScaleFactor / 100;

  const objects = parsed.nodes.find(n => n.name === 'Objects');
  for (const obj of objects?.children || []) {
    const id = typeof obj.properties[0] === 'number' ? obj.properties[0] : null;
    const rawName = typeof obj.properties[1] === 'string' ? obj.properties[1] : '';
    const type = typeof obj.properties[2] === 'string' ? obj.properties[2] : '';

    if (obj.name === 'Constraint') meta.constraintCount++;
    if (obj.name === 'Model') {
      meta.modelCount++;
      if (/LimbNode|Root/i.test(type)) meta.boneModelCount++;
    }

    if (id !== null) {
      meta.objects.set(id, {
        id,
        kind: obj.name,
        name: stripObjectPrefix(rawName),
        rawName,
        type
      });
    }
  }

  const connections = parsed.nodes.find(n => n.name === 'Connections');
  for (const c of connections?.children || []) {
    if (c.name !== 'C' || c.properties.length < 3) continue;
    meta.connections.push({
      relation: c.properties[0],
      child: Number(c.properties[1]),
      parent: Number(c.properties[2]),
      property: c.properties[3] || null
    });
  }

  for (const c of meta.connections) {
    const childObj = meta.objects.get(c.child);
    const parentObj = meta.objects.get(c.parent);
    if (childObj && parentObj && c.relation === 'OO') {
      childObj.parentId = parentObj.id;
      (parentObj.children ||= []).push(childObj.id);
    }
  }

  return meta;
}

function buildRig(root, metadata) {
  const bones = new Map();
  const byOriginal = new Map();
  const byCanonical = new Map();

  root.traverse((object) => {
    if (!object.isBone) return;
    bones.set(object.name, object);

    const o = originalName(object);
    if (o && !byOriginal.has(o)) byOriginal.set(o, object);

    const c = canonical(o || object.name);
    if (c && !byCanonical.has(c)) byCanonical.set(c, object);
  });

  const names = [...byOriginal.keys()];
  const looksUnreal =
    names.some(n => /^pelvis$/i.test(n)) &&
    names.some(n => /^spine_0?1$/i.test(n)) &&
    names.some(n => /^upperarm_l$/i.test(n)) &&
    names.some(n => /^lowerarm_l$/i.test(n)) &&
    names.some(n => /^thigh_l$/i.test(n)) &&
    names.some(n => /^calf_l$/i.test(n));

  const looksRigify =
    names.some(n => /^upper_arm_fk\.L$/i.test(n)) &&
    names.some(n => /^forearm_fk\.L$/i.test(n)) &&
    names.some(n => /^hand_fk\.L$/i.test(n)) &&
    names.some(n => /^thigh_fk\.L$/i.test(n)) &&
    names.some(n => /^shin_fk\.L$/i.test(n)) &&
    names.some(n => /^foot_fk\.L$/i.test(n));

  const profile =
    names.some(n => /^FK-UpperArm\.L$/i.test(n)) && names.some(n => /^DEF-Hips$/i.test(n))
      ? 'cloudrig'
      : looksRigify
        ? 'rigify'
        : looksUnreal
          ? 'ue'
          : names.some(n => /mixamorig\d*:Hips/i.test(n)) || names.some(n => /^Hips$/i.test(n))
            ? 'mixamo'
            : 'generic';

  return {
    root,
    metadata,
    bones,
    byOriginal,
    byCanonical,
    profile,
    get(name) {
      return byOriginal.get(name) || bones.get(name) || byCanonical.get(canonical(name)) || null;
    }
  };
}

export class WaltCloudRigRuntime {
  constructor(asset) {
    this.asset = asset;
    this.rig = asset.rig;
    this.bindings = CLOUDRIG_BINDINGS
      .map(binding => ({
        ...binding,
        driverKey: binding.driver,
        driverBone: resolveCloudRigBone(this.rig, binding.driver),
        drivenBone: this.rig.get(binding.driven)
      }))
      .filter(x => x.driverBone && x.drivenBone)
      .sort((a, b) => depthOf(a.drivenBone) - depthOf(b.drivenBone));

    this.rest = new Map();
    this.virtualFk = new Map();
    this.enabled = true;
    this.captureRest();
  }

  captureRest() {
    this.asset.displayRoot.updateMatrixWorld(true);
    this.rest.clear();

    const unique = new Set();
    for (const b of this.bindings) {
      unique.add(b.driverBone);
      unique.add(b.drivenBone);
    }

    for (const spec of ['root', 'TORSO-Spine', '@LOWER', ...CLOUDRIG_FK_ORDER]) {
      const bone = resolveCloudRigBone(this.rig, spec);
      if (bone) unique.add(bone);
    }

    for (const bone of unique) {
      this.rest.set(bone, {
        localPosition: bone.position.clone(),
        localQuaternion: bone.quaternion.clone(),
        localScale: bone.scale.clone(),
        worldPosition: bone.getWorldPosition(new THREE.Vector3()),
        worldQuaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
        worldScale: bone.getWorldScale(new THREE.Vector3())
      });
    }
  }

  resetDriven() {
    for (const b of this.bindings) {
      const r = this.rest.get(b.drivenBone);
      if (!r) continue;
      b.drivenBone.position.copy(r.localPosition);
      b.drivenBone.quaternion.copy(r.localQuaternion);
      b.drivenBone.scale.copy(r.localScale);
    }
    this.asset.displayRoot.updateMatrixWorld(true);
  }

  update(context = null) {
    if (!this.enabled || !this.bindings.length) return;

    // CloudRig depende de constraints que NO sobreviven al FBX.
    // El problema visible en el video era que FK-Hips subía al levantarse,
    // pero FK-Thigh / FK-UpperArm viven en ramas FBX separadas y sus pivotes
    // se quedaban atrás. Resultado: muslos/brazos estirados y el personaje
    // seguía "sentado" aunque el torso ya hubiera subido.
    //
    // Primero reconstruimos una jerarquía FK virtual anatómica y después
    // usamos esos transforms virtuales para mover los DEF.
    this.resetDriven();
    this.virtualFk.clear();
    this.asset.displayRoot.updateMatrixWorld(true);

    const qCurrent = new THREE.Quaternion();
    const qDelta = new THREE.Quaternion();
    const qBasis = new THREE.Quaternion();
    const qRestRelative = new THREE.Quaternion();
    const qDesiredWorld = new THREE.Quaternion();
    const qParentWorld = new THREE.Quaternion();
    const qDesiredLocal = new THREE.Quaternion();

    const pCurrent = new THREE.Vector3();
    const pRestOffset = new THREE.Vector3();
    const pDesiredWorld = new THREE.Vector3();
    const pDesiredLocal = new THREE.Vector3();

    // Live section frames. These direct controls replace the Blender
    // constraints that are absent from the FBX.
    for (const spec of ['root', 'TORSO-Spine', '@LOWER']) {
      const frameBone = resolveCloudRigBone(this.rig, spec);
      if (!frameBone) continue;

      const frameRest = this.rest.get(frameBone);
      if (!frameRest) continue;

      const framePos = frameBone.getWorldPosition(new THREE.Vector3());
      const frameQ = frameBone.getWorldQuaternion(new THREE.Quaternion());
      const frameDeltaQ = frameQ.clone()
        .multiply(frameRest.worldQuaternion.clone().invert())
        .normalize();

      const entry = {
        position: framePos,
        quaternion: frameQ,
        deltaQuaternion: frameDeltaQ
      };

      for (const key of cloudRigVirtualKeys(spec, frameBone)) {
        this.virtualFk.set(key, entry);
      }
    }

    // 1) Reconstrucción de posiciones FK virtuales.
    for (const name of CLOUDRIG_FK_ORDER) {
      const bone = this.rig.get(name);
      if (!bone) continue;

      const rest = this.rest.get(bone);
      if (!rest) continue;

      // The portable upper-body clip stores restLocal * poseBasis.
      // Rebuild the world rotation with the parent frame used by the original
      // constrained CloudRig, not the static raw-FBX HNG/Chest branch.
      const portableParentName = CLOUDRIG_PORTABLE_PARENT[name];
      const portableParentVirtual = portableParentName
        ? this.virtualFk.get(portableParentName)
        : null;
      const portableParentBone = portableParentName
        ? resolveCloudRigBone(this.rig, portableParentName)
        : null;
      const portableParentRest = portableParentBone
        ? this.rest.get(portableParentBone)
        : null;

      if (portableParentVirtual && portableParentRest) {
        qBasis.copy(rest.localQuaternion)
          .invert()
          .multiply(bone.quaternion)
          .normalize();

        qRestRelative.copy(portableParentRest.worldQuaternion)
          .invert()
          .multiply(rest.worldQuaternion)
          .normalize();

        qCurrent.copy(portableParentVirtual.quaternion)
          .multiply(qRestRelative)
          .multiply(qBasis)
          .normalize();
      } else {
        bone.getWorldQuaternion(qCurrent);
      }

      qDelta.copy(qCurrent)
        .multiply(rest.worldQuaternion.clone().invert())
        .normalize();

      const parentName = CLOUDRIG_FK_PARENT[name];
      let virtualPosition;

      if (!parentName) {
        virtualPosition = bone.getWorldPosition(new THREE.Vector3());
      } else {
        const parentBone = resolveCloudRigBone(this.rig, parentName);
        const parentRest = parentBone ? this.rest.get(parentBone) : null;
        const parentVirtual = this.virtualFk.get(parentName);

        if (parentBone && parentRest && parentVirtual) {
          // Use the reconstructed parent rotation. For portable upper-body
          // controls the raw FBX parent/world quaternion is intentionally not
          // the constrained CloudRig pose anymore.
          qParentWorld.copy(parentVirtual.quaternion);
          const parentDelta = qParentWorld.clone()
            .multiply(parentRest.worldQuaternion.clone().invert())
            .normalize();

          const offset = rest.worldPosition.clone()
            .sub(parentRest.worldPosition)
            .applyQuaternion(parentDelta);

          virtualPosition = parentVirtual.position.clone().add(offset);
        } else {
          virtualPosition = bone.getWorldPosition(new THREE.Vector3());
        }
      }

      const virtualEntry = {
        position: virtualPosition,
        quaternion: qCurrent.clone(),
        deltaQuaternion: qDelta.clone()
      };

      for (const key of cloudRigVirtualKeys(name, bone)) {
        this.virtualFk.set(key, virtualEntry);
      }
    }

    // 2) Los DEF siguen el FK virtual, no el pivot crudo del FBX.
    for (const binding of this.bindings) {
      const driver = binding.driverBone;
      const driven = binding.drivenBone;
      const dr = this.rest.get(driver);
      const rr = this.rest.get(driven);
      if (!dr || !rr) continue;

      const virtual =
        this.virtualFk.get(binding.driverKey) ||
        this.virtualFk.get(binding.driver) ||
        this.virtualFk.get(originalName(driver));
      if (virtual) {
        pCurrent.copy(virtual.position);
        qCurrent.copy(virtual.quaternion);
        qDelta.copy(virtual.deltaQuaternion);
      } else {
        driver.getWorldPosition(pCurrent);
        driver.getWorldQuaternion(qCurrent);
        qDelta.copy(qCurrent)
          .multiply(dr.worldQuaternion.clone().invert())
          .normalize();
      }

      qDesiredWorld.copy(qDelta)
        .multiply(rr.worldQuaternion)
        .normalize();

      pRestOffset.copy(rr.worldPosition)
        .sub(dr.worldPosition)
        .applyQuaternion(qDelta);

      pDesiredWorld.copy(pCurrent).add(pRestOffset);

      if (driven.parent) {
        driven.parent.getWorldQuaternion(qParentWorld);
        qDesiredLocal.copy(qParentWorld)
          .invert()
          .multiply(qDesiredWorld)
          .normalize();

        pDesiredLocal.copy(pDesiredWorld);
        driven.parent.worldToLocal(pDesiredLocal);
      } else {
        qDesiredLocal.copy(qDesiredWorld);
        pDesiredLocal.copy(pDesiredWorld);
      }

      driven.position.copy(pDesiredLocal);
      driven.quaternion.copy(qDesiredLocal);
      driven.scale.copy(rr.localScale);
      this.asset.displayRoot.updateMatrixWorld(true);
    }
  }

  get status() {
    return {
      bindings: this.bindings.length,
      requestedBindings: CLOUDRIG_BINDINGS.length,
      virtualFk: true
    };
  }
}

export class WaltRigifyRuntime {
  constructor(asset) {
    this.asset = asset;
    this.rig = asset.rig;

    const direct = RIGIFY_BINDINGS
      .map(binding => ({
        ...binding,
        driverBone: this.rig.get(binding.driver),
        drivenBone: this.rig.get(binding.driven)
      }))
      .filter(x => x.driverBone && x.drivenBone);

    // Fingers and other direct FK→DEF controls use the same naming convention.
    const dynamic = [];
    const seenDriven = new Set(direct.map(x => x.driven));

    for (const [original, driverBone] of this.rig.byOriginal) {
      if (!/^(?:thumb|f_(?:index|middle|ring|pinky))\./i.test(original)) continue;

      const drivenName = `DEF-${original}`;
      if (seenDriven.has(drivenName)) continue;

      const drivenBone = this.rig.get(drivenName);
      if (!drivenBone) continue;

      dynamic.push({
        driver: original,
        driven: drivenName,
        driverBone,
        drivenBone
      });
      seenDriven.add(drivenName);
    }

    this.bindings = [...direct, ...dynamic]
      .sort((a, b) => depthOf(a.drivenBone) - depthOf(b.drivenBone));

    // Only roots of actual DEF chains receive explicit translation.
    // Descendants inherit their anatomical position from their driven parent
    // and only need rotation. Writing position on every DEF was one source of
    // the obvious stretching seen in the Rigify preview.
    const drivenSet = new Set(this.bindings.map(binding => binding.drivenBone));
    this.positionDriven = new Set();

    for (const binding of this.bindings) {
      let parent = binding.drivenBone?.parent || null;
      let hasDrivenAncestor = false;

      while (parent) {
        if (drivenSet.has(parent)) {
          hasDrivenAncestor = true;
          break;
        }
        parent = parent.parent;
      }

      if (!hasDrivenAncestor) {
        this.positionDriven.add(binding.drivenBone);
      }
    }

    this.rest = new Map();
    this.virtualFk = new Map();
    this.enabled = true;
    this.captureRest();
  }

  captureRest() {
    this.asset.displayRoot.updateMatrixWorld(true);
    this.rest.clear();

    const unique = new Set();

    for (const binding of this.bindings) {
      unique.add(binding.driverBone);
      unique.add(binding.drivenBone);
    }

    for (const name of ['root', 'torso', ...RIGIFY_FK_ORDER]) {
      const bone = this.rig.get(name);
      if (bone) unique.add(bone);
    }

    for (const bone of unique) {
      this.rest.set(bone, {
        localPosition: bone.position.clone(),
        localQuaternion: bone.quaternion.clone(),
        localScale: bone.scale.clone(),
        worldPosition: bone.getWorldPosition(new THREE.Vector3()),
        worldQuaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
        worldScale: bone.getWorldScale(new THREE.Vector3())
      });
    }
  }

  resetDriven() {
    for (const binding of this.bindings) {
      const rest = this.rest.get(binding.drivenBone);
      if (!rest) continue;

      binding.drivenBone.position.copy(rest.localPosition);
      binding.drivenBone.quaternion.copy(rest.localQuaternion);
      binding.drivenBone.scale.copy(rest.localScale);
    }

    this.asset.displayRoot.updateMatrixWorld(true);
  }

  update(context = null) {
    if (!this.enabled || !this.bindings.length) return;

    // Deliberately mirrors WaltCloudRigRuntime:
    // 1. reset DEF,
    // 2. build a virtual anatomical FK hierarchy,
    // 3. make DEF follow that hierarchy.
    //
    // This is viewport-only. No export clip is modified.
    this.resetDriven();
    this.virtualFk.clear();
    this.asset.displayRoot.updateMatrixWorld(true);

    const qCurrent = new THREE.Quaternion();
    const qDelta = new THREE.Quaternion();
    const qParentWorld = new THREE.Quaternion();
    const qDesiredWorld = new THREE.Quaternion();
    const qDesiredLocal = new THREE.Quaternion();

    const pCurrent = new THREE.Vector3();
    const pRestOffset = new THREE.Vector3();
    const pDesiredWorld = new THREE.Vector3();
    const pDesiredLocal = new THREE.Vector3();

    // ------------------------------------------------------------------
    // BODY FRAME
    // ------------------------------------------------------------------
    // The exported Rigify FBX splits Mixamo Hips motion over different
    // controls (root/torso/spine_fk). For preview we reconstruct a single
    // body carrier from the Source Hips delta passed by app.js.
    //
    // This is preview-only and does not touch the exported Action.
    const rootBone = this.rig.get('root');
    const torsoBone = this.rig.get('torso');
    const rootRest = rootBone ? this.rest.get(rootBone) : null;
    const torsoRest = torsoBone ? this.rest.get(torsoBone) : null;

    const bodyDelta =
      context?.bodyDelta?.isVector3
        ? context.bodyDelta
        : new THREE.Vector3();

    if (rootBone && rootRest) {
      const rootQ = rootBone
        .getWorldQuaternion(new THREE.Quaternion())
        .normalize();

      const rootPos = rootRest.worldPosition
        .clone()
        .add(bodyDelta);

      const rootEntry = {
        position: rootPos,
        quaternion: rootQ,
        deltaQuaternion: rootQ.clone()
          .multiply(rootRest.worldQuaternion.clone().invert())
          .normalize()
      };

      this.virtualFk.set('root', rootEntry);
      this.virtualFk.set(originalName(rootBone), rootEntry);
      this.virtualFk.set(rootBone.name, rootEntry);
    }

    if (torsoBone && torsoRest) {
      const torsoQ = torsoBone
        .getWorldQuaternion(new THREE.Quaternion())
        .normalize();

      const torsoPos = torsoRest.worldPosition
        .clone()
        .add(bodyDelta);

      const torsoEntry = {
        position: torsoPos,
        quaternion: torsoQ,
        deltaQuaternion: torsoQ.clone()
          .multiply(torsoRest.worldQuaternion.clone().invert())
          .normalize()
      };

      this.virtualFk.set('torso', torsoEntry);
      this.virtualFk.set('@BODY', torsoEntry);
      this.virtualFk.set(originalName(torsoBone), torsoEntry);
      this.virtualFk.set(torsoBone.name, torsoEntry);
    }

    // Reconstruct anatomical FK world transforms independently from Rigify's
    // raw FBX/MCH parent layout.
    for (const name of RIGIFY_FK_ORDER) {
      const bone = this.rig.get(name);
      if (!bone) continue;

      const rest = this.rest.get(bone);
      if (!rest) continue;

      const parentName = RIGIFY_FK_PARENT[name];
      const parentVirtual = parentName
        ? this.virtualFk.get(parentName)
        : null;

      let parentRest = null;

      if (parentName === '@PELVIS') {
        const torsoBone = this.rig.get('torso');
        const spineBone = this.rig.get('spine_fk');
        const torsoRest = torsoBone ? this.rest.get(torsoBone) : null;
        const spineRest = spineBone ? this.rest.get(spineBone) : null;

        if (torsoRest && spineRest) {
          // Mixamo Hips translation and rotation are split over two Rigify
          // controls by the preset. Recreate one pelvis rest frame from them.
          parentRest = {
            worldPosition: torsoRest.worldPosition,
            worldQuaternion: spineRest.worldQuaternion
          };
        }
      } else {
        const parentBone = parentName
          ? this.rig.get(parentName)
          : null;
        parentRest = parentBone
          ? this.rest.get(parentBone)
          : null;
      }

      // Rigify differs from CloudRig here: the preview clip is the RAW
      // generic retarget clip, so each FK control already evaluates to the
      // desired WORLD rotation in Three.js. Reinterpreting bone.quaternion as
      // "restLocal * poseBasis" double-applies parent rotation and caused the
      // violent flips visible in IMG_7312.
      bone.getWorldQuaternion(qCurrent).normalize();

      if (parentVirtual && parentRest) {
        // Rebuild only the anatomical POSITION chain from the virtual parent.
        // Keep the already-correct raw world quaternion from bakeRetarget.
        qParentWorld.copy(parentVirtual.quaternion);
        const parentDelta = qParentWorld.clone()
          .multiply(parentRest.worldQuaternion.clone().invert())
          .normalize();

        const offset = rest.worldPosition.clone()
          .sub(parentRest.worldPosition)
          .applyQuaternion(parentDelta);

        pCurrent.copy(parentVirtual.position).add(offset);
      } else {
        bone.getWorldPosition(pCurrent);
      }

      qDelta.copy(qCurrent)
        .multiply(rest.worldQuaternion.clone().invert())
        .normalize();

      const entry = {
        position: pCurrent.clone(),
        quaternion: qCurrent.clone(),
        deltaQuaternion: qDelta.clone()
      };

      this.virtualFk.set(name, entry);
      this.virtualFk.set(originalName(bone), entry);
      this.virtualFk.set(bone.name, entry);

      if (name === 'spine_fk') {
        const bodyVirtual =
          this.virtualFk.get('@BODY') ||
          this.virtualFk.get('torso');

        if (bodyVirtual) {
          this.virtualFk.set('@PELVIS', {
            // One pelvis carrier:
            //   position = Source Hips motion mapped onto Target body
            //   rotation = raw spine_fk / Hips rotation
            position: bodyVirtual.position.clone(),
            quaternion: entry.quaternion.clone(),
            deltaQuaternion: entry.deltaQuaternion.clone()
          });
        }
      }
    }

    // DEF follows the virtual FK frame. Position and rotation are reconstructed;
    // scale always stays at Rest to avoid skin explosions.
    for (const binding of this.bindings) {
      const driver = binding.driverBone;
      const driven = binding.drivenBone;
      const driverRest = this.rest.get(driver);
      const drivenRest = this.rest.get(driven);
      if (!driverRest || !drivenRest) continue;

      const virtual =
        this.virtualFk.get(binding.driver) ||
        this.virtualFk.get(originalName(driver)) ||
        this.virtualFk.get(driver.name);

      if (virtual) {
        pCurrent.copy(virtual.position);
        qCurrent.copy(virtual.quaternion);
        qDelta.copy(virtual.deltaQuaternion);
      } else {
        driver.getWorldPosition(pCurrent);
        driver.getWorldQuaternion(qCurrent).normalize();
        qDelta.copy(qCurrent)
          .multiply(driverRest.worldQuaternion.clone().invert())
          .normalize();
      }

      qDesiredWorld.copy(qDelta)
        .multiply(drivenRest.worldQuaternion)
        .normalize();

      pRestOffset.copy(drivenRest.worldPosition)
        .sub(driverRest.worldPosition)
        .applyQuaternion(qDelta);

      pDesiredWorld.copy(pCurrent).add(pRestOffset);

      if (driven.parent) {
        driven.parent.getWorldQuaternion(qParentWorld);
        qDesiredLocal.copy(qParentWorld)
          .invert()
          .multiply(qDesiredWorld)
          .normalize();

        pDesiredLocal.copy(pDesiredWorld);
        driven.parent.worldToLocal(pDesiredLocal);
      } else {
        qDesiredLocal.copy(qDesiredWorld);
        pDesiredLocal.copy(pDesiredWorld);
      }

      if (this.positionDriven.has(driven)) {
        // Root of a driven DEF chain: carry the reconstructed body/limb
        // translation explicitly.
        driven.position.copy(pDesiredLocal);
      } else {
        // Connected child: preserve Rigify's rest bone length/pivot and let
        // parent motion carry it. This prevents visible stretching.
        driven.position.copy(drivenRest.localPosition);
      }

      driven.quaternion.copy(qDesiredLocal);
      driven.scale.copy(drivenRest.localScale);

      this.asset.displayRoot.updateMatrixWorld(true);
    }
  }

  get status() {
    return {
      bindings: this.bindings.length,
      requestedBindings: RIGIFY_BINDINGS.length,
      virtualFk: true,
      profile: 'rigify'
    };
  }
}

export class WaltRigOverlay {
  constructor(asset) {
    this.asset = asset;
    this.rig = asset.rig;
    this.visible = true;

    const chains = LOGICAL_CHAINS[this.rig.profile] || [];
    this.links = [];

    for (const chain of chains) {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = this.rig.get(chain[i]);
        const b = this.rig.get(chain[i + 1]);
        if (a && b) this.links.push([a, b]);
      }
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(1, this.links.length * 2 * 3));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x7fc7ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });

    this.object = new THREE.LineSegments(geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1000;
    this.update();
  }

  update() {
    this.object.visible = this.visible;
    if (!this.visible) return;

    this.asset.displayRoot.updateMatrixWorld(true);
    const attr = this.object.geometry.getAttribute('position');
    const p = new THREE.Vector3();
    let cursor = 0;

    for (const [a, b] of this.links) {
      a.getWorldPosition(p);
      attr.array[cursor++] = p.x;
      attr.array[cursor++] = p.y;
      attr.array[cursor++] = p.z;

      b.getWorldPosition(p);
      attr.array[cursor++] = p.x;
      attr.array[cursor++] = p.y;
      attr.array[cursor++] = p.z;
    }

    attr.needsUpdate = true;
    this.object.geometry.computeBoundingSphere();
  }

  dispose() {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

function normalizeDisplayAxes(displayRoot, metadata) {
  const upAxis = Number(metadata?.upAxis);
  const upSign = Number(metadata?.upAxisSign) || 1;

  // Three.js workspace is Y-up. Unreal's FBX exporter declares Z-up
  // (UpAxis=2). FBXLoader preserves those object transforms, so without this
  // parent-space conversion an Unreal skeleton appears lying on the ground.
  //
  // Rotating the display parent instead of rewriting bone locals keeps every
  // animation curve and bind/local transform untouched while world-space
  // retarget math sees the corrected upright frame.
  if (upAxis === 2) {
    displayRoot.rotation.x = upSign >= 0 ? -Math.PI / 2 : Math.PI / 2;
    metadata.axisNormalization = upSign >= 0
      ? 'Z+ up → Y+ up'
      : 'Z- up → Y+ up';
    return;
  }

  metadata.axisNormalization = 'none';
}

export class WaltFBXLoader {
  constructor() {
    this.threeLoader = new FBXLoader();
  }

  parseMetadata(buffer) {
    try {
      const parsed = new BinaryFBXReader(buffer).parse();
      return extractMetadata(parsed);
    } catch (error) {
      console.warn('WaltFBX metadata parser:', error);
      return {
        binary: false,
        version: null,
        unitScaleFactor: 1,
        metersPerUnit: 0.01,
        upAxis: 1,
        upAxisSign: 1,
        frontAxis: 2,
        frontAxisSign: -1,
        coordAxis: 0,
        coordAxisSign: 1,
        axisNormalization: 'none',
        objects: new Map(),
        connections: [],
        constraintCount: 0,
        modelCount: 0,
        boneModelCount: 0,
        parseError: error.message
      };
    }
  }

  parse(buffer, path = '') {
    // WaltFBX v0.1 parsea por cuenta propia los metadatos binarios que
    // necesitamos (versión, unidades, Objects, Models, Connections).
    // Por ahora delega a FBXLoader únicamente geometría/skin/curvas.
    // Así podemos reemplazar esa parte por etapas sin romper el workflow.
    const metadata = this.parseMetadata(buffer);
    const root = this.threeLoader.parse(buffer, path);
    const rig = buildRig(root, metadata);

    const metersPerUnit =
      Number.isFinite(metadata.metersPerUnit) && metadata.metersPerUnit > 0
        ? metadata.metersPerUnit
        : 0.01;

    const displayRoot = new THREE.Group();
    displayRoot.name = '__WALT_FBX_METERS__';
    displayRoot.scale.setScalar(metersPerUnit);
    normalizeDisplayAxes(displayRoot, metadata);
    displayRoot.add(root);
    displayRoot.updateMatrixWorld(true);

    const asset = {
      root,
      displayRoot,
      animations: [...(root.animations || [])],
      metadata,
      rig,
      metersPerUnit,
      runtime: null,
      overlay: null
    };

    // buildRig necesita root; el asset queda disponible ahora.
    rig.asset = asset;

    if (rig.profile === 'cloudrig') {
      asset.runtime = new WaltCloudRigRuntime(asset);
    } else if (rig.profile === 'rigify') {
      asset.runtime = new WaltRigifyRuntime(asset);
    }

    asset.overlay = new WaltRigOverlay(asset);
    return asset;
  }
}
