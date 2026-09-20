import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const WALT_FBX_VERSION = '0.3.1';

// Los 31 DEF con pesos reales en x1.fbx se reconstruyen desde los
// controles FK. Los segmentos _2 comparten el delta de su control principal;
// los DEF-Hip.L/R siguen el delta rígido de FK-Hips.
const CLOUDRIG_BINDINGS = [
  { driver: 'FK-Hips', driven: 'DEF-Hips' },
  { driver: 'FK-Hips', driven: 'DEF-Hip.L' },
  { driver: 'FK-Hips', driven: 'DEF-Hip.R' },
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
  'FK-Hips': null,
  'FK-Spine': 'FK-Hips',
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

  // Keep the ORIGINAL runtime leg chain exactly as before the regression.
  'FK-Thigh.L': 'FK-Hips',
  'FK-Knee.L': 'FK-Thigh.L',
  'FK-Foot.L': 'FK-Knee.L',
  'FK-Toes.L': 'FK-Foot.L',

  'FK-Thigh.R': 'FK-Hips',
  'FK-Knee.R': 'FK-Thigh.R',
  'FK-Foot.R': 'FK-Knee.R',
  'FK-Toes.R': 'FK-Foot.R'
};

const CLOUDRIG_PORTABLE_PARENT = {
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
};

const CLOUDRIG_FK_ORDER = [
  'FK-Hips',
  'FK-Spine', 'FK-Chest', 'FK-Neck', 'FK-Head',
  'FK-Shoulder.L', 'FK-UpperArm.L', 'FK-Forearm.L', 'FK-Hand.L',
  'FK-Shoulder.R', 'FK-UpperArm.R', 'FK-Forearm.R', 'FK-Hand.R',
  'FK-Thigh.L', 'FK-Knee.L', 'FK-Foot.L', 'FK-Toes.L',
  'FK-Thigh.R', 'FK-Knee.R', 'FK-Foot.R', 'FK-Toes.R'
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
    if (propName === 'UnitScaleFactor') {
      const value = Number(p.properties[p.properties.length - 1]);
      if (Number.isFinite(value) && value > 0) meta.unitScaleFactor = value;
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
  const profile =
    names.some(n => /^FK-UpperArm\.L$/i.test(n)) && names.some(n => /^DEF-Hips$/i.test(n))
      ? 'cloudrig'
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
        driverBone: this.rig.get(binding.driver),
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

  update() {
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
        ? this.rig.get(portableParentName)
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
        // FK-Hips sí recibe root motion real desde la Action.
        virtualPosition = bone.getWorldPosition(new THREE.Vector3());
      } else {
        const parentBone = this.rig.get(parentName);
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

      this.virtualFk.set(name, {
        position: virtualPosition,
        quaternion: qCurrent.clone(),
        deltaQuaternion: qDelta.clone()
      });
    }

    // 2) Los DEF siguen el FK virtual, no el pivot crudo del FBX.
    for (const binding of this.bindings) {
      const driver = binding.driverBone;
      const driven = binding.drivenBone;
      const dr = this.rest.get(driver);
      const rr = this.rest.get(driven);
      if (!dr || !rr) continue;

      const virtual = this.virtualFk.get(binding.driver);
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
    }

    asset.overlay = new WaltRigOverlay(asset);
    return asset;
  }
}
