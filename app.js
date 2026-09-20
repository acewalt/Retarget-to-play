import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { WaltFBXLoader, WALT_FBX_VERSION } from './walt-fbx-loader.js?v=20260920-rigifyik1';
import { injectAnimationsIntoOriginalFBX } from './walt-fbx-exact-export.js?v=20260920-rigifyik1';
import { buildBlenderActionScript } from './blender-action-export.js?v=20260920-rigifyik1';

const $ = (id) => document.getElementById(id);
const fbxLoader = new WaltFBXLoader();

const viewportWhiteMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.92,
  metalness: 0,
  side: THREE.DoubleSide
});

// Fallback únicamente si un FBX no declara UnitScaleFactor.
// WaltFBX lee el valor real del archivo y calcula metersPerUnit.
const DEFAULT_FBX_UNIT_TO_METERS = 0.01;

// Mixamo -> CloudRig profile, aligned with the BlendCap preset supplied by
// the user. This is intentionally NOT a one-bone-per-bone humanoid map.
// Mixamo Hips is split across the controls that CloudRig actually uses:
//   Hips ROT        -> HIP/HTP-Spine
//   Hips vertical   -> TORSO-Spine
//   Hips horizontal -> root
// Spine/Spine1 drive FK-Spine/FK-Chest; Spine2 is intentionally not used.
const CLOUDRIG_PRESET = [
  { source: 'Hips', target: ['HIP-Spine', 'HTP-Spine'], channels: 'ROT' },
  { source: 'Hips', target: 'TORSO-Spine', channels: 'LOC', axes: 'VERTICAL' },
  { source: 'Hips', target: 'root', channels: 'LOC', axes: 'HORIZONTAL' },

  { source: 'Spine', target: 'FK-Spine', channels: 'ROT' },
  { source: 'Spine1', target: 'FK-Chest', channels: 'ROT' },

  { source: 'Neck', target: 'FK-Neck', channels: 'ROT' },
  { source: 'Head', target: 'FK-Head', channels: 'ROT' },

  { source: 'LeftShoulder', target: 'FK-Shoulder.L', channels: 'ROT' },
  { source: 'LeftArm', target: 'FK-UpperArm.L', channels: 'ROT' },
  { source: 'LeftForeArm', target: 'FK-Forearm.L', channels: 'ROT' },
  { source: 'LeftHand', target: 'FK-Hand.L', channels: 'ROT' },

  { source: 'RightShoulder', target: 'FK-Shoulder.R', channels: 'ROT' },
  { source: 'RightArm', target: 'FK-UpperArm.R', channels: 'ROT' },
  { source: 'RightForeArm', target: 'FK-Forearm.R', channels: 'ROT' },
  { source: 'RightHand', target: 'FK-Hand.R', channels: 'ROT' },

  { source: 'LeftUpLeg', target: 'FK-Thigh.L', channels: 'ROT' },
  { source: 'LeftLeg', target: 'FK-Knee.L', channels: 'ROT' },
  { source: 'LeftFoot', target: 'FK-Foot.L', channels: 'ROT' },
  { source: 'LeftToeBase', target: 'FK-Toes.L', channels: 'ROT' },

  { source: 'RightUpLeg', target: 'FK-Thigh.R', channels: 'ROT' },
  { source: 'RightLeg', target: 'FK-Knee.R', channels: 'ROT' },
  { source: 'RightFoot', target: 'FK-Foot.R', channels: 'ROT' },
  { source: 'RightToeBase', target: 'FK-Toes.R', channels: 'ROT' },

  // BlendCap mixamo_to_cloudrig.json also transfers all available fingers.
  { source: 'LeftHandThumb1', target: 'FK-Finger_Thumb1.L', channels: 'ROT' },
  { source: 'LeftHandThumb2', target: 'FK-Finger_Thumb2.L', channels: 'ROT' },
  { source: 'LeftHandThumb3', target: 'FK-Finger_Thumb3.L', channels: 'ROT' },
  { source: 'LeftHandIndex1', target: 'FK-Finger_Index1.L', channels: 'ROT' },
  { source: 'LeftHandIndex2', target: 'FK-Finger_Index2.L', channels: 'ROT' },
  { source: 'LeftHandIndex3', target: 'FK-Finger_Index3.L', channels: 'ROT' },
  { source: 'LeftHandMiddle1', target: 'FK-Finger_Middle1.L', channels: 'ROT' },
  { source: 'LeftHandMiddle2', target: 'FK-Finger_Middle2.L', channels: 'ROT' },
  { source: 'LeftHandMiddle3', target: 'FK-Finger_Middle3.L', channels: 'ROT' },
  { source: 'LeftHandRing1', target: 'FK-Finger_Ring1.L', channels: 'ROT' },
  { source: 'LeftHandRing2', target: 'FK-Finger_Ring2.L', channels: 'ROT' },
  { source: 'LeftHandRing3', target: 'FK-Finger_Ring3.L', channels: 'ROT' },
  { source: 'LeftHandPinky1', target: 'FK-Finger_Pinky1.L', channels: 'ROT' },
  { source: 'LeftHandPinky2', target: 'FK-Finger_Pinky2.L', channels: 'ROT' },
  { source: 'LeftHandPinky3', target: 'FK-Finger_Pinky3.L', channels: 'ROT' },

  { source: 'RightHandThumb1', target: 'FK-Finger_Thumb1.R', channels: 'ROT' },
  { source: 'RightHandThumb2', target: 'FK-Finger_Thumb2.R', channels: 'ROT' },
  { source: 'RightHandThumb3', target: 'FK-Finger_Thumb3.R', channels: 'ROT' },
  { source: 'RightHandIndex1', target: 'FK-Finger_Index1.R', channels: 'ROT' },
  { source: 'RightHandIndex2', target: 'FK-Finger_Index2.R', channels: 'ROT' },
  { source: 'RightHandIndex3', target: 'FK-Finger_Index3.R', channels: 'ROT' },
  { source: 'RightHandMiddle1', target: 'FK-Finger_Middle1.R', channels: 'ROT' },
  { source: 'RightHandMiddle2', target: 'FK-Finger_Middle2.R', channels: 'ROT' },
  { source: 'RightHandMiddle3', target: 'FK-Finger_Middle3.R', channels: 'ROT' },
  { source: 'RightHandRing1', target: 'FK-Finger_Ring1.R', channels: 'ROT' },
  { source: 'RightHandRing2', target: 'FK-Finger_Ring2.R', channels: 'ROT' },
  { source: 'RightHandRing3', target: 'FK-Finger_Ring3.R', channels: 'ROT' },
  { source: 'RightHandPinky1', target: 'FK-Finger_Pinky1.R', channels: 'ROT' },
  { source: 'RightHandPinky2', target: 'FK-Finger_Pinky2.R', channels: 'ROT' },
  { source: 'RightHandPinky3', target: 'FK-Finger_Pinky3.R', channels: 'ROT' }
];

const BLENDCAP_PRESET_REGISTRY = {
  mixamo_to_cloudrig: {
    label: 'Mixamo → CloudRig / Sintel',
    inline: CLOUDRIG_PRESET,
    sourceFamily: 'mixamo',
    targetFamily: 'cloudrig'
  },
  mixamo_to_rigify: {
    label: 'Mixamo → Rigify',
    path: './presets/mixamo_to_rigify.json',
    sourceFamily: 'mixamo',
    targetFamily: 'rigify'
  },
  mixamo_to_arp: {
    label: 'Mixamo → Auto-Rig Pro',
    path: './presets/mixamo_to_arp.json',
    sourceFamily: 'mixamo',
    targetFamily: 'arp'
  },
  mixamo_to_mixamo_ctrl: {
    label: 'Mixamo → Mixamo Control Rig',
    path: './presets/mixamo_to_mixamo_ctrl.json',
    sourceFamily: 'mixamo',
    targetFamily: 'mixamo-ctrl'
  },
  blendcap_to_cloudrig: {
    label: 'BlendCap → CloudRig',
    path: './presets/blendcap_to_cloudrig.json',
    sourceFamily: 'blendcap',
    targetFamily: 'cloudrig'
  },
  blendcap_to_rigify_new: {
    label: 'BlendCap → Rigify (New)',
    path: './presets/blendcap_to_rigify_new.json',
    sourceFamily: 'blendcap',
    targetFamily: 'rigify'
  },
  blendcap_to_rigify_old: {
    label: 'BlendCap → Rigify (Old)',
    path: './presets/blendcap_to_rigify_old.json',
    sourceFamily: 'blendcap',
    targetFamily: 'rigify'
  },
  blendcap_to_arp: {
    label: 'BlendCap → Auto-Rig Pro',
    path: './presets/blendcap_to_arp.json',
    sourceFamily: 'blendcap',
    targetFamily: 'arp'
  },
  blendcap_to_mixamo: {
    label: 'BlendCap → Mixamo',
    path: './presets/blendcap_to_mixamo.json',
    sourceFamily: 'blendcap',
    targetFamily: 'mixamo'
  },
  blendcap_to_mixamo_ctrl: {
    label: 'BlendCap → Mixamo Control Rig',
    path: './presets/blendcap_to_mixamo_ctrl.json',
    sourceFamily: 'blendcap',
    targetFamily: 'mixamo-ctrl'
  }
};

function normalizeBlendCapAxes(axes) {
  const value = String(axes || 'XYZ').toUpperCase();
  if (value === 'Z') return 'VERTICAL';
  if (value === 'XY') return 'HORIZONTAL';
  return value || 'XYZ';
}

function targetLooksCloudRig() {
  const tgt = state.target;
  if (!tgt?.root) return false;
  return !!(
    findBoneByOriginalExact(tgt, ['FK-UpperArm.L']) &&
    findBoneByOriginalExact(tgt, ['FK-Thigh.L']) &&
    findBoneByOriginalExact(tgt, ['IK-Hand.L']) &&
    findBoneByOriginalExact(tgt, ['IK-Foot.L']) &&
    findBoneByOriginalExact(tgt, ['POLE-Leg.L'])
  );
}

function usesCloudRigPipeline() {
  return state.activePreset?.targetFamily === 'cloudrig' && targetLooksCloudRig();
}

function targetLooksRigify() {
  const tgt = state.target;
  if (!tgt?.root) return false;
  return !!(
    findBoneByOriginalExact(tgt, ['upper_arm_fk.L']) &&
    findBoneByOriginalExact(tgt, ['forearm_fk.L']) &&
    findBoneByOriginalExact(tgt, ['hand_fk.L']) &&
    findBoneByOriginalExact(tgt, ['thigh_fk.L']) &&
    findBoneByOriginalExact(tgt, ['shin_fk.L']) &&
    findBoneByOriginalExact(tgt, ['foot_fk.L']) &&
    findBoneByOriginalExact(tgt, ['hand_ik.L']) &&
    findBoneByOriginalExact(tgt, ['foot_ik.L'])
  );
}

function usesRigifyPipeline() {
  return state.activePreset?.targetFamily === 'rigify' && targetLooksRigify();
}

function supportsFkToIk() {
  return usesCloudRigPipeline() || usesRigifyPipeline();
}

const state = {
  source: makeSlot('source'),
  target: makeSlot('target'),
  boneMap: [],
  activePresetId: 'mixamo_to_cloudrig',
  activePreset: null,
  fkClip: null,
  fkRawClip: null,
  ikOnlyClip: null,
  deformPreviewClip: null,
  exportClip: null,
  targetPreviewClip: null,
  playing: false,
  playTime: 0,
  lastFrame: performance.now(),
  cameraSyncLock: false,
  exported: false,
  workspaceView: 'workspace',
  workspaceMappingCollapsed: true
};

function makeSlot(kind) {
  return {
    kind,
    fileName: '',
    root: null,
    displayRoot: null,
    unitScale: DEFAULT_FBX_UNIT_TO_METERS,
    originalBuffer: null,
    asset: null,
    metadata: null,
    rigRuntime: null,
    overlay: null,
    bones: new Map(),
    rest: new Map(),
    animations: [],
    mixer: null,
    action: null,
    activeClip: null,
    helper: null,
    originalMaterials: new Map()
  };
}

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  const out = $('log');
  out.textContent = `[${stamp}] ${message}\n${out.textContent}`.slice(0, 12000);
}

function setStatus(text, type = 'normal') {
  $('globalStatus').textContent = text;
  $('globalStatus').style.borderColor = type === 'bad' ? '#7c3434' : type === 'good' ? '#315e3e' : '#3a4854';
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function viewportPalette(theme = currentTheme()) {
  return theme === 'dark'
    ? { background: 0x111821, gridCenter: 0x3b4a5f, grid: 0x273241 }
    : { background: 0xe9eef5, gridCenter: 0xaab8cb, grid: 0xcbd5e3 };
}

function createViewport(container) {
  const scene = new THREE.Scene();
  const palette = viewportPalette();
  scene.background = new THREE.Color(palette.background);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
  camera.position.set(3, 2, 5);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  const grid = new THREE.GridHelper(20, 20, palette.gridCenter, palette.grid);
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x24303a, 2.4));
  const dir = new THREE.DirectionalLight(0xffffff, 2.2);
  dir.position.set(4, 8, 5);
  scene.add(dir);

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();
  return { scene, camera, renderer, controls, container, grid };
}

const sourceView = createViewport($('sourceViewport'));
const targetView = createViewport($('targetViewport'));

function applyViewportTheme(view, theme = currentTheme()) {
  const palette = viewportPalette(theme);
  view.scene.background.setHex(palette.background);

  if (view.grid) {
    view.scene.remove(view.grid);
    view.grid.geometry?.dispose?.();
    view.grid.material?.dispose?.();
  }

  view.grid = new THREE.GridHelper(20, 20, palette.gridCenter, palette.grid);
  view.scene.add(view.grid);
}

function syncCamera(from, to) {
  if (!$('mirrorCameras').checked || state.cameraSyncLock) return;
  state.cameraSyncLock = true;
  to.camera.position.copy(from.camera.position);
  to.camera.quaternion.copy(from.camera.quaternion);
  to.controls.target.copy(from.controls.target);
  to.camera.zoom = from.camera.zoom;
  to.camera.updateProjectionMatrix();
  to.controls.update();
  state.cameraSyncLock = false;
}
sourceView.controls.addEventListener('change', () => syncCamera(sourceView, targetView));
targetView.controls.addEventListener('change', () => syncCamera(targetView, sourceView));

function fitView(view, object) {
  if (!object) return;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.1) * 0.62;
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(view.camera.fov * 0.5));
  view.controls.target.copy(center);
  view.camera.position.copy(center).add(new THREE.Vector3(dist * 0.65, dist * 0.35, dist));
  view.camera.near = Math.max(dist / 1000, 0.001);
  view.camera.far = Math.max(dist * 30, 100);
  view.camera.updateProjectionMatrix();
  view.controls.update();
}

function collectBones(root) {
  const bones = new Map();
  root.traverse((o) => {
    if (o.isBone && !bones.has(o.name)) bones.set(o.name, o);
  });
  return bones;
}

function updateSlotWorld(slot) {
  (slot.displayRoot || slot.root)?.updateMatrixWorld(true);
}

function captureRest(slot) {
  updateSlotWorld(slot);
  slot.rest = new Map();
  for (const [name, bone] of slot.bones) {
    slot.rest.set(name, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
      worldPos: bone.getWorldPosition(new THREE.Vector3()),
      worldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
      worldScale: bone.getWorldScale(new THREE.Vector3())
    });
  }
}

function restoreRest(slot) {
  if (!slot.root) return;
  for (const [name, r] of slot.rest) {
    const b = slot.bones.get(name);
    if (!b) continue;
    b.position.copy(r.position);
    b.quaternion.copy(r.quaternion);
    b.scale.copy(r.scale);
  }
  updateSlotWorld(slot);
}

function applyWhiteViewportMaterial(slot) {
  if (!slot.root) return;

  slot.root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;

    if (!slot.originalMaterials.has(object)) {
      slot.originalMaterials.set(object, object.material);
    }

    object.material = viewportWhiteMaterial;
  });
}

function restoreOriginalMaterials(slot) {
  if (!slot?.originalMaterials) return;

  for (const [object, material] of slot.originalMaterials) {
    object.material = material;
  }
}

function disposeObject(root) {
  root?.traverse((o) => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
    else if (o.material !== viewportWhiteMaterial) o.material?.dispose?.();
  });
}

function clearSlot(slot, view) {
  if (slot.action) slot.action.stop();
  if (slot.mixer) slot.mixer.stopAllAction();
  if (slot.helper) view.scene.remove(slot.helper);
  if (slot.overlay) {
    view.scene.remove(slot.overlay.object);
    slot.overlay.dispose?.();
  }
  slot.rigRuntime?.resetDriven?.();
  if (slot.root) {
    restoreOriginalMaterials(slot);
    if (slot.displayRoot) {
      view.scene.remove(slot.displayRoot);
      slot.displayRoot.remove(slot.root);
    } else {
      view.scene.remove(slot.root);
    }
    disposeObject(slot.root);
  }
  slot.originalMaterials?.clear?.();
  Object.assign(slot, makeSlot(slot.kind));
}

async function loadFbx(file, slot, view) {
  setStatus(`Leyendo ${file.name}…`);
  const buffer = await file.arrayBuffer();
  const asset = fbxLoader.parse(buffer, '');
  const root = asset.root;
  const loadedAnimations = [...asset.animations];

  clearSlot(slot, view);
  slot.fileName = file.name;
  slot.originalBuffer = buffer.slice(0);
  slot.asset = asset;
  slot.metadata = asset.metadata;
  slot.rigRuntime = asset.runtime;
  slot.overlay = asset.overlay;
  slot.root = root;
  slot.displayRoot = asset.displayRoot;
  slot.unitScale = asset.metersPerUnit;
  slot.bones = collectBones(root);
  slot.animations = slot.kind === 'source' ? loadedAnimations : [];
  root.animations = slot.kind === 'source' ? loadedAnimations : [];

  // El viewport siempre muestra el modelo como "clay" blanco:
  // sin texturas ni materiales del FBX. Los materiales originales se
  // conservan internamente para que la exportación del Target no los pierda.
  applyWhiteViewportMaterial(slot);
  view.scene.add(slot.displayRoot);

  // WaltRig Overlay muestra únicamente el esqueleto lógico útil
  // (Mixamo o controles FK de CloudRig), no los 342 huesos auxiliares.
  slot.helper = null;
  if (slot.overlay) {
    slot.overlay.visible = $('showArmatures')?.checked ?? true;
    view.scene.add(slot.overlay.object);
    slot.overlay.update();
  }

  captureRest(slot);
  fitView(view, slot.displayRoot);

  if (slot.kind === 'source') {
    $('sourceLabel').textContent = `${file.name} · ${slot.bones.size} huesos · ${asset.rig.profile}`;
    fillSourceClips();
    const inferred = inferPrefix(slot);
    if (inferred) $('sourcePrefix').value = inferred;
    log(`WaltFBX v${WALT_FBX_VERSION} Source: ${file.name}; profile=${asset.rig.profile}; ${slot.bones.size} huesos; ${loadedAnimations.length} Actions; UnitScaleFactor=${asset.metadata.unitScaleFactor}; ×${slot.unitScale.toFixed(4)} m; Constraints FBX=${asset.metadata.constraintCount}.`);
  } else {
    $('targetLabel').textContent = `${file.name} · ${slot.bones.size} huesos · ${asset.rig.profile}`;
    $('targetAnimNotice').textContent = loadedAnimations.length
      ? `Target cargado con ${loadedAnimations.length} Action(s): se ignoraron y no se reutilizarán.`
      : 'Target sin Actions de entrada. Correcto.';
    const runtimeInfo = slot.rigRuntime?.status;
    log(`WaltFBX v${WALT_FBX_VERSION} Target: ${file.name}; profile=${asset.rig.profile}; ${slot.bones.size} huesos; Actions descartadas=${loadedAnimations.length}; UnitScaleFactor=${asset.metadata.unitScaleFactor}; ×${slot.unitScale.toFixed(4)} m; Constraints FBX=${asset.metadata.constraintCount}; WaltRig FK→DEF=${runtimeInfo ? `${runtimeInfo.bindings}/${runtimeInfo.requestedBindings}` : 'n/a'}.`);
  }

  state.fkClip = state.fkRawClip = state.ikOnlyClip = state.deformPreviewClip = state.exportClip = state.targetPreviewClip = null;
  state.exported = false;
  refreshMapUi();
  updateButtons();
  updateTimelineBounds();
  setStatus('LOCAL · sin subida', 'good');

  if (state.source.root && state.target.root && $('preset').value !== 'none') {
    void loadPreset();
  }
}

function originalObjectName(object) {
  return object?.userData?.originalName || object?.name || '';
}

function canonicalSemantic(name) {
  let n = String(name || '').trim();
  if (n.includes(':') || n.includes('|')) n = n.split(/[:|]/).pop();
  n = n.replace(/^mixamorig\d*/i, '');
  return n.replace(/[\[\].:/_\s-]/g, '').toLowerCase();
}

function inferPrefix(slot) {
  for (const bone of slot.bones.values()) {
    const original = originalObjectName(bone);
    if (/mixamorig/i.test(original) && original.includes(':')) {
      return original.slice(0, original.lastIndexOf(':') + 1);
    }
  }
  return '';
}

function fillSourceClips() {
  const select = $('sourceClip');
  select.innerHTML = '';
  if (!state.source.animations.length) {
    select.add(new Option('Sin clips en el Source', ''));
    state.source.activeClip = null;
    return;
  }
  state.source.animations.forEach((clip, i) => select.add(new Option(`${clip.name || `Action ${i + 1}`} · ${clip.duration.toFixed(2)} s`, String(i))));
  select.value = '0';
  setSourceClip(0);
}

function setSourceClip(index) {
  const slot = state.source;
  if (!slot.root || !slot.animations[index]) return;
  restoreRest(slot);
  slot.mixer?.stopAllAction();
  slot.mixer = new THREE.AnimationMixer(slot.root);
  slot.activeClip = slot.animations[index];
  slot.action = slot.mixer.clipAction(slot.activeClip);
  slot.action.setLoop(THREE.LoopRepeat, Infinity).play();
  slot.mixer.setTime(0);
  state.playTime = 0;
  updateTimelineBounds();
  updateButtons();
}

function findBoneByOriginalExact(slot, candidates) {
  const wanted = new Set(candidates.map(x => String(x).toLowerCase()));
  for (const [loadedName, bone] of slot.bones) {
    const original = originalObjectName(bone);
    if (wanted.has(original.toLowerCase())) return loadedName;
  }
  return null;
}

function findSemanticBone(slot, semantic) {
  if (slot.bones.has(semantic)) return semantic;

  const wanted = canonicalSemantic(semantic);
  const prefix = slot.kind === 'source' ? $('sourcePrefix').value.trim() : $('targetPrefix').value.trim();

  for (const [loadedName, bone] of slot.bones) {
    const original = originalObjectName(bone);

    if (prefix && original === prefix + semantic) return loadedName;

    const originalTail = original.split(/[:|]/).pop();
    if (canonicalSemantic(originalTail) === wanted) return loadedName;
    if (canonicalSemantic(original) === wanted) return loadedName;

    // FBXLoader de Three.js elimina ":" y "." de los nombres.
    // Este fallback reconoce, por ejemplo, mixamorig1:Hips -> mixamorig1Hips.
    if (/mixamorig/i.test(loadedName) && canonicalSemantic(loadedName).endsWith(wanted)) {
      return loadedName;
    }
  }

  return null;
}

async function loadPreset() {
  if (!state.source.root || !state.target.root) {
    log('Preset pendiente: primero carga Source y Target.');
    return;
  }

  const id = $('preset').value;
  if (id === 'none') {
    state.activePresetId = 'none';
    state.activePreset = null;
    state.boneMap = [];
    refreshMapUi();
    updateButtons();
    log('Preset desactivado.');
    return;
  }

  const definition = BLENDCAP_PRESET_REGISTRY[id];
  if (!definition) {
    throw new Error(`Preset desconocido: ${id}`);
  }

  let presetData;
  if (definition.inline) {
    presetData = {
      name: definition.label,
      source_prefix: 'mixamorig:',
      pairs: definition.inline
    };
  } else {
    const response = await fetch(
      definition.path + '?v=20260920-rigifyik1',
      { cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error(
        `No pude cargar ${definition.label}: HTTP ${response.status}`
      );
    }
    presetData = await response.json();
  }

  state.activePresetId = id;
  state.activePreset = {
    id,
    ...definition,
    data: presetData
  };

  if (definition.sourceFamily === 'mixamo') {
    $('sourcePrefix').value =
      inferPrefix(state.source) ||
      presetData.source_prefix ||
      $('sourcePrefix').value ||
      '';
  }

  if (definition.targetFamily === 'mixamo') {
    $('targetPrefix').value =
      inferPrefix(state.target) ||
      $('targetPrefix').value ||
      '';
  }

  const resolveTarget = (spec) => {
    const candidates = Array.isArray(spec) ? [...spec] : [spec];

    // Sintel/CloudRig variants may expose HIP-Spine or HTP-Spine.
    if (definition.targetFamily === 'cloudrig') {
      if (candidates.includes('HIP-Spine') && !candidates.includes('HTP-Spine')) {
        candidates.push('HTP-Spine');
      }
      if (candidates.includes('HTP-Spine') && !candidates.includes('HIP-Spine')) {
        candidates.push('HIP-Spine');
      }
    }

    return candidates
      .map(name =>
        findBoneByOriginalExact(state.target, [name]) ||
        findSemanticBone(state.target, name)
      )
      .find(Boolean) || '';
  };

  const pairs = presetData.pairs || [];
  state.boneMap = pairs.map(entry => ({
    source: findSemanticBone(state.source, entry.source) || '',
    target: resolveTarget(entry.target),
    sourceSpec: entry.source,
    targetSpec: entry.target,
    channels: entry.channels || 'ROT',
    axes: normalizeBlendCapAxes(entry.axes),
    locSpace: entry.loc_space || 'world',
    influence: Number.isFinite(Number(entry.influence))
      ? Number(entry.influence)
      : 1,
    profile: definition.targetFamily === 'cloudrig'
      ? 'blendcap-cloudrig'
      : `blendcap-${definition.targetFamily}`
  })).filter(pair => pair.source || pair.target);

  // Official BlendCap maps are the source of truth. Foot Contact Match is a
  // separate experimental correction and must not modify preset results.
  if ($('footMatch')) $('footMatch').checked = false;

  // CLEAN rewrites CloudRig's special missing-constraint hierarchy.
  // Other rigs keep their original FBX hierarchy and receive an exact Action.
  if ($('exportMode')) {
    $('exportMode').value =
      definition.targetFamily === 'cloudrig' ? 'clean' : 'exact';
  }

  refreshMapUi();
  updateButtons();
  updateStats();

  const resolved = state.boneMap.filter(isPairValid).length;
  const headLocal = state.boneMap.filter(p => p.locSpace === 'head_local').length;

  log(
    `Preset ${definition.label}: ${resolved}/${pairs.length} pares resueltos` +
    (headLocal ? ` · face head_local=${headLocal}` : '') +
    ` · Target=${definition.targetFamily}.`
  );
}

function normalizeName(name) {
  let n = String(name || '');
  if (n.includes(':') || n.includes('|')) n = n.split(/[:|]/).pop();
  n = n.replace(/^mixamorig\d*/i, '');
  return n
    .replace(/^(FK|DEF|STR|PSTR|ROOT|SCALE|IKM|IK)/i, '')
    .replace(/left/ig, 'l')
    .replace(/right/ig, 'r')
    .replace(/[\[\].:/_\s-]/g, '')
    .toLowerCase();
}

function autoMatch() {
  if (!state.source.root || !state.target.root) return;
  const targets = [...state.target.bones.keys()];
  const used = new Set();
  const pairs = [];
  for (const src of state.source.bones.keys()) {
    const sn = normalizeName(originalObjectName(state.source.bones.get(src)) || src);
    const candidates = targets.filter(t =>
      !used.has(t) &&
      normalizeName(originalObjectName(state.target.bones.get(t)) || t) === sn
    );
    const preferred = candidates.find(t => /^FK-/i.test(t)) || candidates[0];
    if (preferred) {
      used.add(preferred);
      pairs.push({ source: src, target: preferred });
    }
  }
  if (pairs.length) state.boneMap = pairs;
  refreshMapUi();
  log(`Auto-Match encontró ${pairs.length} pares exactos por nombre normalizado.`);
}

function isPairValid(pair) {
  return !!pair.source &&
    !!pair.target &&
    state.source.bones.has(pair.source) &&
    state.target.bones.has(pair.target);
}

function pairComponentKeys(pair) {
  const keys = [];
  const channels = String(pair.channels || 'ROT').toUpperCase();
  const axes = normalizeBlendCapAxes(pair.axes);

  if (channels.includes('ROT')) keys.push('ROT');

  if (channels.includes('LOC')) {
    if (axes === 'VERTICAL') {
      keys.push('LOC_Y');
    } else if (axes === 'HORIZONTAL') {
      keys.push('LOC_X', 'LOC_Z');
    } else {
      if (axes.includes('X')) keys.push('LOC_X');
      if (axes.includes('Y')) keys.push('LOC_Y');
      if (axes.includes('Z')) keys.push('LOC_Z');
    }
  }

  return keys.length ? keys : ['ROT'];
}

function conflictingPairIndexes() {
  const seen = new Map();
  const conflicts = new Set();

  state.boneMap.forEach((pair, index) => {
    if (!isPairValid(pair)) return;

    for (const component of pairComponentKeys(pair)) {
      const key = `${pair.target}::${component}`;
      if (seen.has(key)) {
        conflicts.add(index);
        conflicts.add(seen.get(key));
      } else {
        seen.set(key, index);
      }
    }
  });

  return conflicts;
}

function validMap() {
  const occupied = new Set();

  return state.boneMap.filter(pair => {
    if (!isPairValid(pair)) return false;

    const keys = pairComponentKeys(pair)
      .map(component => `${pair.target}::${component}`);

    if (keys.some(key => occupied.has(key))) return false;
    keys.forEach(key => occupied.add(key));
    return true;
  });
}

function refreshMapUi() {
  const host = $('boneMap');
  const sourceNames = [...state.source.bones.keys()].sort();
  const targetNames = [...state.target.bones.keys()].sort();
  if (!state.source.root || !state.target.root) {
    host.className = 'bone-map empty';
    host.textContent = 'Carga ambos FBX.';
    $('mapCount').textContent = '0 / 0 válidos';
    return;
  }

  host.className = 'bone-map';
  host.innerHTML = '';
  const q = $('mapSearch').value.trim().toLowerCase();
  const conflicts = conflictingPairIndexes();

  state.boneMap.forEach((pair, index) => {
    if (q && !`${pair.source} ${pair.target}`.toLowerCase().includes(q)) return;
    const duplicate = conflicts.has(index);
    const row = document.createElement('div');
    row.className = `map-row ${(!isPairValid(pair) || duplicate) ? 'invalid' : ''}`;

    const s = document.createElement('select');
    s.append(new Option('— Source —', ''));
    sourceNames.forEach(n => s.add(new Option(originalObjectName(state.source.bones.get(n)) || n, n)));
    s.value = pair.source;
    s.onchange = () => { state.boneMap[index].source = s.value; refreshMapUi(); updateButtons(); };

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    const channels = pair.channels || 'ROT';
    const axes = pair.axes && pair.axes !== 'XYZ' ? ` ${pair.axes}` : '';
    arrow.textContent = `→ ${channels}${axes}`;
    arrow.title = pair.locSpace === 'head_local'
      ? 'BlendCap head_local'
      : 'World/rest delta';

    const t = document.createElement('select');
    t.append(new Option('— Target —', ''));
    targetNames.forEach(n => t.add(new Option(originalObjectName(state.target.bones.get(n)) || n, n)));
    t.value = pair.target;
    t.onchange = () => { state.boneMap[index].target = t.value; refreshMapUi(); updateButtons(); };

    const remove = document.createElement('button');
    remove.className = 'row-remove';
    remove.textContent = '×';
    remove.title = 'Quitar par';
    remove.onclick = () => { state.boneMap.splice(index, 1); refreshMapUi(); updateButtons(); };

    row.append(s, arrow, t, remove);
    host.appendChild(row);
  });

  $('mapCount').textContent = `${validMap().length} / ${state.boneMap.length} válidos`;
  updateButtons();
}

function boneDepth(bone) {
  let d = 0;
  while (bone?.parent) { d++; bone = bone.parent; }
  return d;
}

function skeletonScaleFor(map) {
  // Auto-scale anatómico. Evitamos por completo IK/POLE/STR.
  // También evitamos findSemanticBone('Hips') aquí porque en CloudRig
  // existen FK-Hips, IK-M-Hips, DEF-Hips, STR-Hips, etc.
  const srcHips =
    findBoneByOriginalExact(state.source, ['mixamorig1:Hips', 'mixamorig:Hips', 'Hips']) ||
    findSemanticBone(state.source, 'Hips');
  const srcHead =
    findBoneByOriginalExact(state.source, ['mixamorig1:Head', 'mixamorig:Head', 'Head']) ||
    findSemanticBone(state.source, 'Head');

  const tgtHips =
    findBoneByOriginalExact(state.target, ['DEF-Hips', 'Hips']) ||
    map.find(p => /FK-Hips$/i.test(originalObjectName(state.target.bones.get(p.target)) || p.target))?.target ||
    null;
  const tgtHead =
    findBoneByOriginalExact(state.target, ['DEF-Head', 'Head']) ||
    map.find(p => /FK-Head$/i.test(originalObjectName(state.target.bones.get(p.target)) || p.target))?.target ||
    null;

  if (!srcHips || !srcHead || !tgtHips || !tgtHead) return 1;

  const sHip = state.source.rest.get(srcHips)?.worldPos;
  const sHead = state.source.rest.get(srcHead)?.worldPos;
  const tHip = state.target.rest.get(tgtHips)?.worldPos;
  const tHead = state.target.rest.get(tgtHead)?.worldPos;
  if (!sHip || !sHead || !tHip || !tHead) return 1;

  const sd = sHip.distanceTo(sHead);
  const td = tHip.distanceTo(tHead);
  const ratio = sd > 1e-6 && td > 1e-6 ? td / sd : 1;

  return Number.isFinite(ratio) && ratio > 0.05 && ratio < 20 ? ratio : 1;
}

function rootMotionScaleFor(map, fallback = 1) {
  const srcHips =
    findBoneByOriginalExact(state.source, ['mixamorig1:Hips', 'mixamorig:Hips', 'Hips']) ||
    findSemanticBone(state.source, 'Hips');

  const srcFeet = [
    findBoneByOriginalExact(state.source, ['mixamorig1:LeftFoot', 'mixamorig:LeftFoot', 'LeftFoot']) ||
      findSemanticBone(state.source, 'LeftFoot'),
    findBoneByOriginalExact(state.source, ['mixamorig1:RightFoot', 'mixamorig:RightFoot', 'RightFoot']) ||
      findSemanticBone(state.source, 'RightFoot')
  ].filter(Boolean);

  const tgtHips =
    findBoneByOriginalExact(state.target, ['FK-Hips']) ||
    map.find(p => /FK-Hips$/i.test(originalObjectName(state.target.bones.get(p.target)) || p.target))?.target ||
    null;

  const tgtFeet = [
    findBoneByOriginalExact(state.target, ['FK-Foot.L']),
    findBoneByOriginalExact(state.target, ['FK-Foot.R'])
  ].filter(Boolean);

  if (!srcHips || !tgtHips || !srcFeet.length || !tgtFeet.length) return fallback;

  const sHip = state.source.rest.get(srcHips)?.worldPos;
  const tHip = state.target.rest.get(tgtHips)?.worldPos;
  if (!sHip || !tHip) return fallback;

  const sDistances = srcFeet
    .map(name => state.source.rest.get(name)?.worldPos)
    .filter(Boolean)
    .map(p => p.distanceTo(sHip));

  const tDistances = tgtFeet
    .map(name => state.target.rest.get(name)?.worldPos)
    .filter(Boolean)
    .map(p => p.distanceTo(tHip));

  if (!sDistances.length || !tDistances.length) return fallback;

  const sLeg = sDistances.reduce((a, b) => a + b, 0) / sDistances.length;
  const tLeg = tDistances.reduce((a, b) => a + b, 0) / tDistances.length;
  const ratio = sLeg > 1e-6 && tLeg > 1e-6 ? tLeg / sLeg : fallback;

  return Number.isFinite(ratio) && ratio > 0.05 && ratio < 20 ? ratio : fallback;
}

function buildResolvedPreset(preset) {
  return preset.map(([s, t]) => ({
    source: findSemanticBone(state.source, s) || '',
    target: findSemanticBone(state.target, t) || ''
  })).filter(isPairValid);
}

function setBoneWorldQuaternion(slot, bone, worldQuaternion) {
  const local = worldQuaternion.clone();

  if (bone.parent) {
    const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    local.premultiply(parentWorld.invert());
  }

  bone.quaternion.copy(local.normalize());
  updateSlotWorld(slot);
}

function virtualFkChildPosition(slot, parentName, childName, parentVirtualPosition) {
  const parent = slot.bones.get(parentName);
  const child = slot.bones.get(childName);
  const parentRest = slot.rest.get(parentName);
  const childRest = slot.rest.get(childName);

  if (!parent || !child || !parentRest || !childRest) return null;

  const currentParentWorld = parent.getWorldQuaternion(new THREE.Quaternion());
  const delta = currentParentWorld
    .multiply(parentRest.worldQuat.clone().invert())
    .normalize();

  const offset = childRest.worldPos.clone()
    .sub(parentRest.worldPos)
    .applyQuaternion(delta);

  return parentVirtualPosition.clone().add(offset);
}

function applyFootContactCorrection(src, tgt, side, motionScale) {
  if (!$('footMatch')?.checked) return false;

  const suffix = side === 'L' ? '.L' : '.R';
  const sourceFootSemantic = side === 'L' ? 'LeftFoot' : 'RightFoot';

  const sourceFootName = findSemanticBone(src, sourceFootSemantic);
  const sourceFoot = sourceFootName ? src.bones.get(sourceFootName) : null;
  const sourceFootRest = sourceFootName ? src.rest.get(sourceFootName) : null;

  const hipName = findBoneByOriginalExact(tgt, ['FK-Hips']);
  const thighName = findBoneByOriginalExact(tgt, [`FK-Thigh${suffix}`]);
  const kneeName = findBoneByOriginalExact(tgt, [`FK-Knee${suffix}`]);
  const footName = findBoneByOriginalExact(tgt, [`FK-Foot${suffix}`]);

  if (!sourceFoot || !sourceFootRest || !hipName || !thighName || !kneeName || !footName) {
    return false;
  }

  const hip = tgt.bones.get(hipName);
  const thigh = tgt.bones.get(thighName);
  const knee = tgt.bones.get(kneeName);
  const foot = tgt.bones.get(footName);

  const thighRest = tgt.rest.get(thighName);
  const kneeRest = tgt.rest.get(kneeName);
  const footRest = tgt.rest.get(footName);

  if (!hip || !thigh || !knee || !foot || !thighRest || !kneeRest || !footRest) {
    return false;
  }

  // Desired end-effector trajectory: reproduce the Source foot displacement
  // relative to its own rest pose, scaled onto the Target rest foot.
  const sourceFootWorld = sourceFoot.getWorldPosition(new THREE.Vector3());
  const desiredFoot = footRest.worldPos.clone().add(
    sourceFootWorld.clone()
      .sub(sourceFootRest.worldPos)
      .multiplyScalar(motionScale)
  );

  // Preserve the retargeted foot orientation while solving thigh/knee.
  const desiredFootWorldQ = foot.getWorldQuaternion(new THREE.Quaternion());

  const hipVirtual = hip.getWorldPosition(new THREE.Vector3());
  const A = virtualFkChildPosition(tgt, hipName, thighName, hipVirtual);
  if (!A) return false;

  let B = virtualFkChildPosition(tgt, thighName, kneeName, A);
  if (!B) return false;

  let C = virtualFkChildPosition(tgt, kneeName, footName, B);
  if (!C) return false;

  const l1 = A.distanceTo(B);
  const l2 = B.distanceTo(C);
  if (l1 < 1e-6 || l2 < 1e-6) return false;

  const toTarget = desiredFoot.clone().sub(A);
  let distance = toTarget.length();
  if (distance < 1e-6) return false;

  const minReach = Math.abs(l1 - l2) + 1e-5;
  const maxReach = l1 + l2 - 1e-5;
  distance = THREE.MathUtils.clamp(distance, minReach, maxReach);

  const dir = toTarget.normalize();

  // Preserve the current knee bend plane instead of allowing the knee to flip.
  const v1 = B.clone().sub(A).normalize();
  const v2 = C.clone().sub(B).normalize();
  let normal = v1.clone().cross(v2);

  if (normal.lengthSq() < 1e-8) {
    normal = new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0);
    if (Math.abs(normal.dot(dir)) > 0.95) normal.set(0, 0, 1);
  }

  normal.normalize();

  let bendDir = normal.clone().cross(dir).normalize();
  const currentAlong = dir.clone().multiplyScalar(B.clone().sub(A).dot(dir));
  const currentPerp = B.clone().sub(A).sub(currentAlong);

  if (currentPerp.lengthSq() > 1e-8 && bendDir.dot(currentPerp) < 0) {
    bendDir.negate();
  }

  const x = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));

  const desiredKnee = A.clone()
    .addScaledVector(dir, x)
    .addScaledVector(bendDir, h);

  // Thigh: align the current virtual thigh segment with the solved segment.
  const currentThighDir = B.clone().sub(A).normalize();
  const desiredThighDir = desiredKnee.clone().sub(A).normalize();
  const thighAlign = new THREE.Quaternion().setFromUnitVectors(
    currentThighDir,
    desiredThighDir
  );

  const thighWorld = thigh.getWorldQuaternion(new THREE.Quaternion());
  const desiredThighWorld = thighAlign.multiply(thighWorld).normalize();
  setBoneWorldQuaternion(tgt, thigh, desiredThighWorld);

  // Recompute virtual knee after rotating thigh.
  B = virtualFkChildPosition(tgt, thighName, kneeName, A);
  if (!B) return false;
  C = virtualFkChildPosition(tgt, kneeName, footName, B);
  if (!C) return false;

  // Knee: point lower leg toward the desired foot.
  const currentKneeDir = C.clone().sub(B).normalize();
  const desiredKneeDir = desiredFoot.clone().sub(B).normalize();
  const kneeAlign = new THREE.Quaternion().setFromUnitVectors(
    currentKneeDir,
    desiredKneeDir
  );

  const kneeWorld = knee.getWorldQuaternion(new THREE.Quaternion());
  const desiredKneeWorld = kneeAlign.multiply(kneeWorld).normalize();
  setBoneWorldQuaternion(tgt, knee, desiredKneeWorld);

  // Keep the foot orientation from the source retarget instead of inheriting
  // the correction rotations of thigh/knee.
  setBoneWorldQuaternion(tgt, foot, desiredFootWorldQ);

  return true;
}

function extractWorldTwistQuaternion(q, axis, out = new THREE.Quaternion()) {
  // Swing-twist decomposition. For root turning we only want the twist around
  // the scene up axis; pitch/roll remain on FK-Hips as pelvis motion.
  const n = axis.clone().normalize();
  const projection = n.multiplyScalar(q.x * n.x + q.y * n.y + q.z * n.z);

  out.set(projection.x, projection.y, projection.z, q.w);

  const lenSq =
    out.x * out.x +
    out.y * out.y +
    out.z * out.z +
    out.w * out.w;

  if (lenSq < 1e-12) return out.identity();
  return out.normalize();
}

function bakeRetarget(map, clipName, { rootMotion = true } = {}) {
  const src = state.source;
  const tgt = state.target;
  const clip = src.activeClip;
  if (!clip) throw new Error('El Source no tiene una Action activa.');

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(clip.duration, i / fps)
  );

  const isBlendCapCloudRig = map.some(p => p.profile === 'blendcap-cloudrig');
  const isBlendCapPreset = map.some(p => String(p.profile || '').startsWith('blendcap-'));
  const torsoScale = $('autoScale').checked ? skeletonScaleFor(map) : 1;

  // BlendCap scales locations in armature/object units. WaltFBX normalizes
  // Source and Target to meters, so official BlendCap presets use 1:1 motion
  // units. Manual maps keep the older proportional root-motion option.
  const motionScale = isBlendCapPreset
    ? 1
    : ($('autoScale').checked ? rootMotionScaleFor(map, torsoScale) : 1);

  const ordered = [...map].sort(
    (a, b) => boneDepth(tgt.bones.get(a.target)) - boneDepth(tgt.bones.get(b.target))
  );

  const rotPairs = ordered.filter(p => (p.channels || 'ROT').includes('ROT'));
  const locPairs = ordered.filter(p => rootMotion && (p.channels || '').includes('LOC'));
  const worldLocPairs = locPairs.filter(p => p.locSpace !== 'head_local');
  const headLocPairs = locPairs.filter(p => p.locSpace === 'head_local');

  const data = new Map();
  for (const p of rotPairs) {
    if (!data.has(p.target)) data.set(p.target, { q: [] });
  }

  const locData = new Map();
  for (const p of locPairs) {
    if (!locData.has(p.target)) locData.set(p.target, { p: [] });
  }

  const qSrc = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  const qDesired = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const qLocal = new THREE.Quaternion();

  const srcWorldPos = new THREE.Vector3();
  const desiredWorldPos = new THREE.Vector3();
  const currentWorldPos = new THREE.Vector3();
  const localPos = new THREE.Vector3();

  // BlendCap face controls are authored in HEAD_LOCAL space. Build the two
  // rest frames once, then evaluate motion relative to the animated heads.
  let headLocalContext = null;
  if (map.some(pair => pair.locSpace === 'head_local')) {
    const preset = state.activePreset?.data || {};
    const sourceHeadName =
      findSemanticBone(src, preset.face_head_source || 'Head');
    const targetHeadName =
      findBoneByOriginalExact(tgt, [preset.face_head_target || 'head']) ||
      findSemanticBone(tgt, preset.face_head_target || 'head');

    const sourceHead = sourceHeadName ? src.bones.get(sourceHeadName) : null;
    const targetHead = targetHeadName ? tgt.bones.get(targetHeadName) : null;
    const sourceHeadRest = sourceHeadName ? src.rest.get(sourceHeadName) : null;
    const targetHeadRest = targetHeadName ? tgt.rest.get(targetHeadName) : null;

    if (sourceHead && targetHead && sourceHeadRest && targetHeadRest) {
      const sourceHeadRestMatrix = new THREE.Matrix4().compose(
        sourceHeadRest.worldPos.clone(),
        sourceHeadRest.worldQuat.clone(),
        sourceHeadRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
      );
      const targetHeadRestMatrix = new THREE.Matrix4().compose(
        targetHeadRest.worldPos.clone(),
        targetHeadRest.worldQuat.clone(),
        targetHeadRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
      );

      const correctionQ = targetHeadRest.worldQuat.clone()
        .invert()
        .multiply(sourceHeadRest.worldQuat)
        .normalize();

      let faceScale = 1;
      const srcEyeL = findSemanticBone(src, 'LeftEye');
      const srcEyeR = findSemanticBone(src, 'RightEye');
      const eyePairL = map.find(p => p.sourceSpec === 'LeftEye' && p.target);
      const eyePairR = map.find(p => p.sourceSpec === 'RightEye' && p.target);

      if (srcEyeL && srcEyeR && eyePairL?.target && eyePairR?.target) {
        const srcEyeLRest = src.rest.get(srcEyeL);
        const srcEyeRRest = src.rest.get(srcEyeR);
        const tgtEyeLRest = tgt.rest.get(eyePairL.target);
        const tgtEyeRRest = tgt.rest.get(eyePairR.target);

        const srcDist = srcEyeLRest && srcEyeRRest
          ? srcEyeLRest.worldPos.distanceTo(srcEyeRRest.worldPos)
          : NaN;
        const tgtDist = tgtEyeLRest && tgtEyeRRest
          ? tgtEyeLRest.worldPos.distanceTo(tgtEyeRRest.worldPos)
          : NaN;

        if (
          Number.isFinite(srcDist) && Number.isFinite(tgtDist) &&
          srcDist > 1e-6 && tgtDist > 1e-6
        ) {
          faceScale = THREE.MathUtils.clamp(tgtDist / srcDist, 0.1, 10);
        }
      }

      headLocalContext = {
        sourceHead,
        targetHead,
        sourceHeadRest,
        targetHeadRest,
        sourceHeadRestInv: sourceHeadRestMatrix.clone().invert(),
        targetHeadRestInv: targetHeadRestMatrix.clone().invert(),
        correctionQ,
        correctionQInv: correctionQ.clone().invert(),
        faceScale
      };
    } else {
      log('BlendCap head_local: no pude resolver Head Source/Target; se usará world-space.');
    }
  }

  if (!src.mixer) {
    src.mixer = new THREE.AnimationMixer(src.root);
    src.action = src.mixer.clipAction(clip).play();
  }

  // Setup BlendCap's leg-root drift compensation once, from REST.
  let blendcapLegComp = null;
  if (isBlendCapCloudRig) {
    const lowerName =
      findBoneByOriginalExact(tgt, ['HIP-Spine', 'HTP-Spine']);
    const torsoName =
      findBoneByOriginalExact(tgt, ['TORSO-Spine']);

    const sourceLegNames = [
      findSemanticBone(src, 'LeftUpLeg'),
      findSemanticBone(src, 'RightUpLeg')
    ].filter(Boolean);

    const targetLegNames = [
      findBoneByOriginalExact(tgt, ['FK-Thigh.L']),
      findBoneByOriginalExact(tgt, ['FK-Thigh.R'])
    ].filter(Boolean);

    const lower = lowerName ? tgt.bones.get(lowerName) : null;
    const torso = torsoName ? tgt.bones.get(torsoName) : null;

    if (
      lower && torso &&
      sourceLegNames.length === 2 &&
      targetLegNames.length === 2
    ) {
      restoreRest(src);
      restoreRest(tgt);
      updateSlotWorld(src);
      updateSlotWorld(tgt);

      const sourceRestAvg = new THREE.Vector3();
      for (const name of sourceLegNames) {
        sourceRestAvg.add(src.rest.get(name).worldPos);
      }
      sourceRestAvg.multiplyScalar(0.5);

      const targetRestAvg = new THREE.Vector3();
      for (const name of targetLegNames) {
        targetRestAvg.add(tgt.rest.get(name).worldPos);
      }
      targetRestAvg.multiplyScalar(0.5);

      blendcapLegComp = {
        lower,
        torso,
        sourceLegNames,
        targetLegNames,
        lowerRestWorldInv: lower.matrixWorld.clone().invert(),
        baseline: sourceRestAvg.clone().sub(targetRestAvg)
      };
    }
  }

  for (const time of times) {
    restoreRest(src);
    src.mixer.setTime(time);
    updateSlotWorld(src);
    restoreRest(tgt);

    // LOCATION first so every child rotation sees the current root / torso
    // translation. The location transfer is a WORLD delta from source rest,
    // scaled to target proportions, then filtered in WORLD axes.
    for (const pair of worldLocPairs) {
      const sb = src.bones.get(pair.source);
      const tb = tgt.bones.get(pair.target);
      const sr = src.rest.get(pair.source);
      const tr = tgt.rest.get(pair.target);
      if (!sb || !tb || !sr || !tr) continue;

      sb.getWorldPosition(srcWorldPos);
      const delta = srcWorldPos.clone()
        .sub(sr.worldPos)
        .multiplyScalar(motionScale);

      tb.getWorldPosition(currentWorldPos);
      desiredWorldPos.copy(tr.worldPos);

      const axes = String(pair.axes || 'XYZ').toUpperCase();
      if (axes === 'VERTICAL') {
        // Three.js is Y-up after FBX import.
        desiredWorldPos.y += delta.y;
        // Preserve inherited horizontal motion from the current parent.
        desiredWorldPos.x = currentWorldPos.x;
        desiredWorldPos.z = currentWorldPos.z;
      } else if (axes === 'HORIZONTAL') {
        desiredWorldPos.x += delta.x;
        desiredWorldPos.z += delta.z;
        // Preserve the target's current floor height.
        desiredWorldPos.y = currentWorldPos.y;
      } else {
        if (axes.includes('X')) desiredWorldPos.x += delta.x;
        else desiredWorldPos.x = currentWorldPos.x;
        if (axes.includes('Y')) desiredWorldPos.y += delta.y;
        else desiredWorldPos.y = currentWorldPos.y;
        if (axes.includes('Z')) desiredWorldPos.z += delta.z;
        else desiredWorldPos.z = currentWorldPos.z;
      }

      localPos.copy(desiredWorldPos);
      if (tb.parent) tb.parent.worldToLocal(localPos);

      tb.position.copy(localPos);
      tb.scale.copy(tr.scale);
      updateSlotWorld(tgt);

    }

    // BlendCap-style world delta-from-rest rotation:
    // target_world = source_pose_world * inverse(source_rest_world)
    //                * target_rest_world.
    // Parent-first order lets children solve against the fresh target pose.
    for (const pair of rotPairs) {
      const sb = src.bones.get(pair.source);
      const tb = tgt.bones.get(pair.target);
      const sr = src.rest.get(pair.source);
      const tr = tgt.rest.get(pair.target);
      if (!sb || !tb || !sr || !tr) continue;

      sb.getWorldQuaternion(qSrc);

      if (pair.locSpace === 'head_local' && headLocalContext) {
        const {
          sourceHead,
          targetHead,
          sourceHeadRest,
          targetHeadRest,
          correctionQ,
          correctionQInv
        } = headLocalContext;

        const srcHeadPoseQ = sourceHead.getWorldQuaternion(
          new THREE.Quaternion()
        );
        const tgtHeadPoseQ = targetHead.getWorldQuaternion(
          new THREE.Quaternion()
        );

        const srcCurrentRel = srcHeadPoseQ.clone()
          .invert()
          .multiply(qSrc)
          .normalize();

        const srcRestRel = sourceHeadRest.worldQuat.clone()
          .invert()
          .multiply(sr.worldQuat)
          .normalize();

        const deltaHead = srcCurrentRel
          .multiply(srcRestRel.clone().invert())
          .normalize();

        const mappedDelta = correctionQ.clone()
          .multiply(deltaHead)
          .multiply(correctionQInv)
          .normalize();

        const tgtRestRel = targetHeadRest.worldQuat.clone()
          .invert()
          .multiply(tr.worldQuat)
          .normalize();

        qDesired.copy(tgtHeadPoseQ)
          .multiply(mappedDelta)
          .multiply(tgtRestRel)
          .normalize();
      } else {
        qDelta.copy(qSrc)
          .multiply(sr.worldQuat.clone().invert())
          .normalize();

        qDesired.copy(qDelta)
          .multiply(tr.worldQuat)
          .normalize();
      }

      if (tb.parent) {
        tb.parent.getWorldQuaternion(qParent);
        qLocal.copy(qParent)
          .invert()
          .multiply(qDesired)
          .normalize();
      } else {
        qLocal.copy(qDesired);
      }

      // If this same target also has LOC, preserve the translation that was
      // solved by its location rows (eg. BlendCap→Mixamo Hips).
      if (!locData.has(pair.target)) tb.position.copy(tr.position);
      tb.quaternion.copy(qLocal);
      tb.scale.copy(tr.scale);
      updateSlotWorld(tgt);
    }

    // HEAD_LOCAL translation runs after target Head rotation, matching
    // BlendCap's evaluated face-space semantics.
    for (const pair of headLocPairs) {
      const sb = src.bones.get(pair.source);
      const tb = tgt.bones.get(pair.target);
      const sr = src.rest.get(pair.source);
      const tr = tgt.rest.get(pair.target);
      if (!sb || !tb || !sr || !tr) continue;

      if (!headLocalContext) {
        sb.getWorldPosition(srcWorldPos);
        const delta = srcWorldPos.clone()
          .sub(sr.worldPos)
          .multiplyScalar(motionScale);
        desiredWorldPos.copy(tr.worldPos).add(delta);
      } else {
        const {
          sourceHead,
          targetHead,
          sourceHeadRestInv,
          targetHeadRestInv,
          correctionQ,
          faceScale
        } = headLocalContext;

        const sourceHeadPoseInv = sourceHead.matrixWorld.clone().invert();

        const srcRestHead = sr.worldPos.clone()
          .applyMatrix4(sourceHeadRestInv);
        const srcPoseHead = sb.getWorldPosition(new THREE.Vector3())
          .applyMatrix4(sourceHeadPoseInv);

        const motionHead = srcPoseHead
          .sub(srcRestHead)
          .applyQuaternion(correctionQ)
          .multiplyScalar(faceScale);

        const targetRestHead = tr.worldPos.clone()
          .applyMatrix4(targetHeadRestInv);

        const axes = String(pair.axes || 'XYZ').toUpperCase();
        if (axes === 'VERTICAL') {
          motionHead.x = 0;
          motionHead.z = 0;
        } else if (axes === 'HORIZONTAL') {
          motionHead.y = 0;
        } else {
          if (!axes.includes('X')) motionHead.x = 0;
          if (!axes.includes('Y')) motionHead.y = 0;
          if (!axes.includes('Z')) motionHead.z = 0;
        }

        desiredWorldPos.copy(
          targetRestHead.add(motionHead)
            .applyMatrix4(targetHead.matrixWorld)
        );
      }

      localPos.copy(desiredWorldPos);
      if (tb.parent) tb.parent.worldToLocal(localPos);

      tb.position.copy(localPos);
      tb.scale.copy(tr.scale);
      updateSlotWorld(tgt);
    }

    // BlendCap leg-anchor compensation:
    // source thigh roots are Hips children; target thigh roots are carried by
    // HIP/HTP-Spine. Correct the resulting world drift through TORSO-Spine.
    if (blendcapLegComp) {
      const {
        lower,
        torso,
        sourceLegNames,
        targetLegNames,
        lowerRestWorldInv,
        baseline
      } = blendcapLegComp;

      const sourcePoseAvg = new THREE.Vector3();
      for (const name of sourceLegNames) {
        sourcePoseAvg.add(
          src.bones.get(name).getWorldPosition(new THREE.Vector3())
        );
      }
      sourcePoseAvg.multiplyScalar(0.5);

      // Simulate the CloudRig hinge carry: FK-Thigh's root follows the
      // current lower-section deform delta even though the raw FBX lost that
      // ARMATURE constraint.
      const lowerDelta = lower.matrixWorld.clone()
        .multiply(lowerRestWorldInv);

      const targetPoseAvg = new THREE.Vector3();
      for (const name of targetLegNames) {
        targetPoseAvg.add(
          tgt.rest.get(name).worldPos.clone().applyMatrix4(lowerDelta)
        );
      }
      targetPoseAvg.multiplyScalar(0.5);

      const deltaWorld = sourcePoseAvg
        .clone()
        .sub(targetPoseAvg)
        .sub(baseline);

      if (deltaWorld.lengthSq() > 1e-10) {
        const torsoWorld = torso.getWorldPosition(new THREE.Vector3())
          .add(deltaWorld);

        const torsoLocal = torsoWorld.clone();
        if (torso.parent) torso.parent.worldToLocal(torsoLocal);

        torso.position.copy(torsoLocal);
        updateSlotWorld(tgt);
      }
    }

    // Optional experimental correction remains available to the user, but is
    // not part of the tested BlendCap profile.
    if ($('footMatch')?.checked) {
      applyFootContactCorrection(src, tgt, 'L', motionScale);
      applyFootContactCorrection(src, tgt, 'R', motionScale);
    }

    // Record location curves after every parent/constraint-style correction.
    // This includes BlendCap's leg-anchor compensation.
    for (const [targetName, d] of locData) {
      const bone = tgt.bones.get(targetName);
      if (!bone || !d) continue;
      d.p.push(
        bone.position.x,
        bone.position.y,
        bone.position.z
      );
    }

    for (const [targetName, d] of data) {
      const bone = tgt.bones.get(targetName);
      if (!bone || !d) continue;

      const q = bone.quaternion.clone().normalize();
      const n = d.q.length;
      if (n >= 4) {
        const prev = new THREE.Quaternion(
          d.q[n - 4], d.q[n - 3], d.q[n - 2], d.q[n - 1]
        );
        if (prev.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
      }

      d.q.push(q.x, q.y, q.z, q.w);
    }
  }

  restoreRest(src);
  restoreRest(tgt);

  const tracks = [];

  for (const [targetName, d] of data) {
    if (d.q.length === times.length * 4) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${targetName}.quaternion`,
          times,
          d.q
        )
      );
    }
  }

  for (const [targetName, d] of locData) {
    if (d.p.length === times.length * 3) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${targetName}.position`,
          times,
          d.p
        )
      );
    }
  }

  log(
    `BlendCap bake: preset=${state.activePreset?.label || 'manual'} · ` +
    `ROT=${rotPairs.length} · LOC=${locPairs.length} · ` +
    `head_local=${headLocPairs.length}.`
  );

  return new THREE.AnimationClip(clipName, clip.duration, tracks);
}

function mergeClips(name, clips) {
  const usable = clips.filter(Boolean);
  const duration = Math.max(...usable.map(c => c.duration), 0);
  return new THREE.AnimationClip(name, duration, usable.flatMap(c => c.tracks.map(t => t.clone())));
}

function applyTargetRigRuntime() {
  const runtime = state.target.rigRuntime;
  if (!runtime) return;

  runtime.enabled = $('previewDeform')?.checked ?? true;
  if (runtime.enabled) runtime.update();
  else runtime.resetDriven();
}

function bakeDeformPreviewClip() {
  const t = state.target;
  const runtime = t.rigRuntime;
  const sourceClip = state.targetPreviewClip || state.exportClip;

  if (!t.root || !runtime || !sourceClip) return null;

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(sourceClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(sourceClip.duration, i / fps)
  );

  const driven = [...new Set(runtime.bindings.map(b => b.drivenBone).filter(Boolean))];
  if (!driven.length) return null;

  const data = new Map();
  for (const bone of driven) {
    data.set(bone, { p: [], q: [] });
  }

  restoreRest(t);
  t.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(t.root);
  const action = mixer.clipAction(sourceClip).play();

  const previousEnabled = runtime.enabled;
  runtime.enabled = true;

  try {
    for (const time of times) {
      restoreRest(t);
      mixer.setTime(time);
      updateSlotWorld(t);

      runtime.update();
      updateSlotWorld(t);

      for (const bone of driven) {
        const d = data.get(bone);
        d.p.push(bone.position.x, bone.position.y, bone.position.z);
        d.q.push(
          bone.quaternion.x,
          bone.quaternion.y,
          bone.quaternion.z,
          bone.quaternion.w
        );
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    runtime.enabled = previousEnabled;
    restoreRest(t);
  }

  const tracks = [];
  for (const [bone, d] of data) {
    tracks.push(
      new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, d.p)
    );
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, d.q)
    );
  }

  return new THREE.AnimationClip(
    'Retargeted_DEF_Preview',
    sourceClip.duration,
    tracks
  );
}

function updateRigOverlays() {
  const show = $('showArmatures')?.checked ?? true;
  for (const slot of [state.source, state.target]) {
    if (!slot.overlay) continue;
    slot.overlay.visible = show;
    slot.overlay.update();
  }
}

function playTargetClip(clip) {
  const t = state.target;
  if (!t.root || !clip) return;
  restoreRest(t);
  t.mixer?.stopAllAction();
  t.mixer = new THREE.AnimationMixer(t.root);
  t.activeClip = clip;
  t.action = t.mixer.clipAction(clip).play();
  t.mixer.setTime(state.playTime);
  applyTargetRigRuntime();
  updateRigOverlays();
}

function applyRetarget() {
  try {
    setStatus('Calculando retarget FK…');
    const map = validMap();
    if (!map.length) throw new Error('No hay pares válidos en el Bone Map.');

    state.fkRawClip = bakeRetarget(map, 'Retargeted_FK_RAW');

    // CloudRig loses several parenting/hinge constraints in FBX, so its
    // already-proven path needs the portable pose-basis rewrite. Rigify,
    // ARP and Mixamo presets keep the generic baked target controls directly.
    state.fkClip = usesCloudRigPipeline()
      ? buildOriginalRigTransferClip(state.fkRawClip)
      : usesRigifyPipeline()
        ? buildRigifyOriginalRigTransferClip(state.fkRawClip)
        : state.fkRawClip.clone();

    state.fkClip.name = 'Retargeted_FK';
    state.ikOnlyClip = null;
    state.exportClip = state.fkClip;
    state.exported = false;

    // No horneamos DEF. WaltRig Runtime reproduce en tiempo real dentro
    // del navegador la relación FK -> DEF que el FBX no contiene.
    state.deformPreviewClip = null;
    // Rigify's portable head curve is encoded for the ORIGINAL Blender rig.
    // The raw browser hierarchy lacks MCH-ROT-head evaluation, so preview the
    // geometrically correct raw FK while exporting the corrected basis clip.
    state.targetPreviewClip = usesRigifyPipeline()
      ? state.fkRawClip
      : state.fkClip;
    state.playTime = 0;
    playTargetClip(state.targetPreviewClip);
    updateTimelineBounds();
    seek(0);
    updateButtons();
    updateStats();
    setStatus('Retarget FK listo', 'good');
    const rt = state.target.rigRuntime?.status;
    log(`Retarget FK: ${map.length} controles FK, ${state.fkClip.tracks.length} curvas TRS, ${Number($('fps').value) || 30} FPS. Action DEF=0. WaltRig Runtime FK→DEF=${rt ? `${rt.bindings}/${rt.requestedBindings}` : 'n/a'}.`);
  } catch (err) {
    console.error(err);
    state.fkClip = null;
    state.exportClip = null;
    state.targetPreviewClip = null;
    updateButtons();
    updateWorkflowUI();
    setStatus('Error de retarget', 'bad');
    log(`ERROR Retarget: ${err?.stack || err?.message || err}`);
  }
}

function worldToLocalPoint(object, point) {
  const out = point.clone();
  if (object.parent) object.parent.worldToLocal(out);
  return out;
}

const CLOUDRIG_IK_CHAINS = [
  {
    kind: 'ARM', side: 'L',
    a: 'FK-UpperArm.L', b: 'FK-Forearm.L', c: 'FK-Hand.L',
    ik: 'IK-Hand.L', pole: 'POLE-Arm.L',
    owner: 'IK-M-Forearm.L'
  },
  {
    kind: 'ARM', side: 'R',
    a: 'FK-UpperArm.R', b: 'FK-Forearm.R', c: 'FK-Hand.R',
    ik: 'IK-Hand.R', pole: 'POLE-Arm.R',
    owner: 'IK-M-Forearm.R'
  },
  {
    kind: 'LEG', side: 'L',
    a: 'FK-Thigh.L', b: 'FK-Knee.L', c: 'FK-Foot.L',
    ik: 'IK-Foot.L', pole: 'POLE-Leg.L',
    owner: 'IK-M-Knee.L'
  },
  {
    kind: 'LEG', side: 'R',
    a: 'FK-Thigh.R', b: 'FK-Knee.R', c: 'FK-Foot.R',
    ik: 'IK-Foot.R', pole: 'POLE-Leg.R',
    owner: 'IK-M-Knee.R'
  }
];

function virtualFkPose(tgt, runtimeName) {
  const runtime = tgt.rigRuntime;
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const virtual = runtime?.virtualFk?.get(runtimeName);

  return {
    bone,
    position: virtual?.position
      ? virtual.position.clone()
      : bone.getWorldPosition(new THREE.Vector3()),
    quaternion: virtual?.quaternion
      ? virtual.quaternion.clone()
      : bone.getWorldQuaternion(new THREE.Quaternion()),
    scale: bone.getWorldScale(new THREE.Vector3())
  };
}

function poseToMatrix(pose, out = new THREE.Matrix4()) {
  if (pose?.matrix) return out.copy(pose.matrix);
  return out.compose(
    pose.position,
    pose.quaternion,
    pose.scale || new THREE.Vector3(1, 1, 1)
  );
}

function composeRestWorldMatrix(tgt, runtimeName, out = new THREE.Matrix4()) {
  const rest = tgt.rest.get(runtimeName);
  if (!rest) return null;
  return out.compose(
    rest.worldPos.clone(),
    rest.worldQuat.clone(),
    rest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
  );
}

function composeRestLocalMatrix(tgt, runtimeName, out = new THREE.Matrix4()) {
  const rest = tgt.rest.get(runtimeName);
  if (!rest) return null;
  return out.compose(
    rest.position.clone(),
    rest.quaternion.clone(),
    rest.scale.clone()
  );
}

function resolveOriginalRigLogicalParentName(tgt, runtimeName) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const original = originalObjectName(bone) || runtimeName;
  const spec = ORIGINAL_RIG_LOGICAL_PARENT[original];
  if (!spec) return null;

  const candidates = spec === '@LOWER'
    ? ['HIP-Spine', 'HTP-Spine']
    : [spec];

  return candidates
    .map(name => findBoneByOriginalExact(tgt, [name]))
    .find(Boolean) || null;
}

// Reconstruct the pose that the ORIGINAL CloudRig gets when state.fkClip is
// assigned to it. This is deliberately independent from WaltRig Runtime:
// the Runtime exists to preview missing Blender constraints/DEF in Three.js,
// while FK->IK export must use the exact pose-basis carrier that is already
// proven to work on RIG-Sintel.
function originalRigFkPoseMatrix(
  tgt,
  runtimeName,
  cache,
  out = new THREE.Matrix4()
) {
  if (cache?.has(runtimeName)) {
    return out.copy(cache.get(runtimeName));
  }

  const bone = tgt.bones.get(runtimeName);
  const rest = tgt.rest.get(runtimeName);
  if (!bone || !rest) return null;

  const rawRestLocal = composeRestLocalMatrix(
    tgt, runtimeName, new THREE.Matrix4()
  );
  if (!rawRestLocal) return null;

  const currentLocal = new THREE.Matrix4().compose(
    bone.position.clone(),
    bone.quaternion.clone(),
    bone.scale.clone()
  );

  // state.fkClip stores rawFBXRestLocal * ORIGINAL_RIG_matrix_basis.
  // Recover exactly that matrix_basis.
  const basis = rawRestLocal.clone()
    .invert()
    .multiply(currentLocal);

  const restWorld = composeRestWorldMatrix(
    tgt, runtimeName, new THREE.Matrix4()
  );
  if (!restWorld) return null;

  const parentName = resolveOriginalRigLogicalParentName(tgt, runtimeName);
  let poseWorld;

  if (parentName) {
    const parentPose = originalRigFkPoseMatrix(
      tgt, parentName, cache, new THREE.Matrix4()
    );
    const parentRest = composeRestWorldMatrix(
      tgt, parentName, new THREE.Matrix4()
    );

    if (parentPose && parentRest) {
      const restRelative = parentRest.clone()
        .invert()
        .multiply(restWorld);

      poseWorld = parentPose.clone()
        .multiply(restRelative)
        .multiply(basis);
    }
  }

  // Controls without a logical constrained parent (eg. root) are evaluated
  // from their own rest-world transform plus matrix_basis.
  if (!poseWorld) {
    poseWorld = restWorld.clone().multiply(basis);
  }

  cache?.set(runtimeName, poseWorld.clone());
  return out.copy(poseWorld);
}

function originalRigFkPose(tgt, runtimeName, cache) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const matrix = originalRigFkPoseMatrix(
    tgt, runtimeName, cache, new THREE.Matrix4()
  );
  if (!matrix) return null;

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  quaternion.normalize();

  return { bone, position, quaternion, scale, matrix };
}

function restWorldMatrix(tgt, runtimeName, out = new THREE.Matrix4()) {
  return composeRestWorldMatrix(tgt, runtimeName, out);
}

function resolveCloudRigIkChains(tgt) {
  return CLOUDRIG_IK_CHAINS.map(def => {
    const resolved = { ...def };
    for (const key of ['a', 'b', 'c', 'ik', 'pole']) {
      const runtimeName = findBoneByOriginalExact(tgt, [def[key]]);
      if (!runtimeName) return null;
      resolved[key] = runtimeName;
    }
    const ownerName = findBoneByOriginalExact(tgt, [def.owner]);
    resolved.owner = ownerName || '';
    return resolved;
  }).filter(Boolean);
}

function functionalIkParentName(tgt, chain, kind) {
  // Stable-pole mode:
  // POLE-Arm already works because its parent space is stable/root-like.
  // Treat POLE-Leg exactly the same. On the original CloudRig this must
  // be paired with ik_pole_follow=0; otherwise P-POLE-Leg is carried by
  // IK-Foot again after our baked location is applied.
  return findBoneByOriginalExact(tgt, ['root']) || null;
}

function functionalParentPoseMatrix(
  tgt,
  chain,
  kind,
  ikDesiredWorldByName,
  fkPoseCache,
  out
) {
  const parentName = functionalIkParentName(tgt, chain, kind);
  if (!parentName) return out.identity();

  const parentPose = originalRigFkPoseMatrix(
    tgt,
    parentName,
    fkPoseCache,
    out
  );

  return parentPose || out.identity();
}

function functionalParentRestMatrix(tgt, chain, kind, out) {
  const parentName = functionalIkParentName(tgt, chain, kind);
  if (!parentName) return out.identity();

  const rest = tgt.rest.get(parentName);
  if (!rest) return out.identity();

  return out.compose(
    rest.worldPos.clone(),
    rest.worldQuat.clone(),
    rest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
  );
}

function encodeOriginalRigControlLocal(
  tgt,
  controlName,
  desiredWorld,
  functionalParentPose,
  functionalParentRest,
  outMatrix
) {
  const control = tgt.bones.get(controlName);
  const controlRest = tgt.rest.get(controlName);
  if (!control || !controlRest) return null;

  const controlRestWorld = composeRestWorldMatrix(
    tgt, controlName, new THREE.Matrix4()
  );
  const rawRestLocal = composeRestLocalMatrix(
    tgt, controlName, new THREE.Matrix4()
  );
  if (!controlRestWorld || !rawRestLocal) return null;

  let basis;

  // CloudRig places animator IK/POLE controls below P-IK-* / P-POLE-* helper
  // bones. Blender then carries those helpers through an ARMATURE constraint
  // used by parent switching. BlendCap compensates that parent constraint
  // before solving matrix_basis. Mirror the same operation here when the
  // helper exists in the exported CloudRig FBX.
  const helper = control.parent?.isBone ? control.parent : null;
  const helperOriginal = helper
    ? (originalObjectName(helper) || helper.name)
    : '';

  if (helper && /^P-(IK|POLE)-/i.test(helperOriginal)) {
    const helperRestWorld = composeRestWorldMatrix(
      tgt, helper.name, new THREE.Matrix4()
    );

    if (helperRestWorld) {
      // ARMATURE carrier delta: D = parentPose * inverse(parentRest).
      // CloudRig evaluates helperPose = D * helperRest.
      const carrierDelta = functionalParentPose.clone()
        .multiply(functionalParentRest.clone().invert());

      const helperPoseWorld = carrierDelta
        .multiply(helperRestWorld);

      // At matrix_basis identity the visible control pose is helperPose times
      // its rest transform relative to the P-helper.
      const controlRestRelative = helperRestWorld.clone()
        .invert()
        .multiply(controlRestWorld);

      const basisIdentityWorld = helperPoseWorld
        .multiply(controlRestRelative);

      basis = basisIdentityWorld.clone()
        .invert()
        .multiply(desiredWorld);
    }
  }

  // Fallback for rigs/exports where the P-helper is absent.
  if (!basis) {
    const restRelative = functionalParentRest.clone()
      .invert()
      .multiply(controlRestWorld);
    const desiredRelative = functionalParentPose.clone()
      .invert()
      .multiply(desiredWorld);

    basis = restRelative.clone()
      .invert()
      .multiply(desiredRelative);
  }

  // Exact-FBX carrier convention, same as the proven FK path:
  // localTrack = rawFBXRestLocal * ORIGINAL_RIG_matrix_basis.
  return outMatrix.copy(rawRestLocal).multiply(basis);
}

function chainPoseSnapshot(tgt, chain, fkPoseCache) {
  const a = originalRigFkPose(tgt, chain.a, fkPoseCache);
  const b = originalRigFkPose(tgt, chain.b, fkPoseCache);
  const c = originalRigFkPose(tgt, chain.c, fkPoseCache);
  if (!a || !b || !c) return null;
  return { a, b, c };
}

function rawPolePerpFromPos(pa, pb, pc) {
  const chain = pc.clone().sub(pa);
  if (chain.lengthSq() < 1e-10) return null;

  const lower = pc.clone().sub(pb);
  const projected = lower.clone().projectOnVector(chain);
  const perp = projected.sub(lower);

  return { pa, pb, pc, chain, perp };
}

function scanPoleAnchorLocal(tgt, mixer, chain, times) {
  let bestLen = 0;
  let bestLocal = null;
  const step = Math.max(1, Math.floor(times.length / 60));

  for (let i = 0; i < times.length; i += step) {
    restoreRest(tgt);
    mixer.setTime(Number(times[i]));
    updateSlotWorld(tgt);

    const fkPoseCache = new Map();
    const snap = chainPoseSnapshot(tgt, chain, fkPoseCache);
    if (!snap) continue;

    const upper = snap.b.position.clone().sub(snap.a.position);
    const lower = snap.c.position.clone().sub(snap.b.position);
    const bendAxisWorld = upper.clone().cross(lower);
    const len = bendAxisWorld.length();

    if (len <= bestLen || len < 1e-6) continue;

    const local = bendAxisWorld
      .clone()
      .applyQuaternion(snap.b.quaternion.clone().invert());

    if (local.lengthSq() < 1e-10) continue;

    bestLen = len;
    bestLocal = local.normalize();
  }

  restoreRest(tgt);
  return bestLocal;
}

function computeBlendCapPolePointFromSnapshot(snap, anchorLocal) {
  const raw = rawPolePerpFromPos(
    snap.a.position,
    snap.b.position,
    snap.c.position
  );

  if (!raw) return snap.b.position.clone();

  const { pb, chain } = raw;
  let perp = raw.perp;

  if (perp.length() < 1e-4) {
    if (anchorLocal) {
      const bendAxisWorld = anchorLocal
        .clone()
        .applyQuaternion(snap.b.quaternion);
      perp = chain.clone().cross(bendAxisWorld);
    }

    if (perp.length() < 1e-6) {
      const fallback = new THREE.Vector3(0, 0, 1);
      perp = fallback.sub(
        chain.clone().multiplyScalar(
          fallback.dot(chain) / Math.max(chain.lengthSq(), 1e-10)
        )
      );
    }
  }

  if (perp.lengthSq() < 1e-10) return pb.clone();

  perp.normalize();

  if (anchorLocal) {
    const bendAxisWorld = anchorLocal
      .clone()
      .applyQuaternion(snap.b.quaternion);

    const expectedPerp = chain.clone().cross(bendAxisWorld);
    if (expectedPerp.lengthSq() > 1e-10) {
      expectedPerp.normalize();
      if (perp.dot(expectedPerp) < 0) perp.negate();
    }
  }

  // BlendCap constant.
  return pb.clone().addScaledVector(perp, chain.length() * 0.4);
}

const RIGIFY_IK_CHAINS = [
  {
    kind: 'ARM', side: 'L',
    a: 'upper_arm_fk.L', b: 'forearm_fk.L', c: 'hand_fk.L',
    ik: 'hand_ik.L', pole: 'upper_arm_ik_target.L',
    owner: 'MCH-forearm_ik.L'
  },
  {
    kind: 'ARM', side: 'R',
    a: 'upper_arm_fk.R', b: 'forearm_fk.R', c: 'hand_fk.R',
    ik: 'hand_ik.R', pole: 'upper_arm_ik_target.R',
    owner: 'MCH-forearm_ik.R'
  },
  {
    kind: 'LEG', side: 'L',
    a: 'thigh_fk.L', b: 'shin_fk.L', c: 'foot_fk.L',
    ik: 'foot_ik.L', pole: 'thigh_ik_target.L',
    owner: 'MCH-shin_ik.L'
  },
  {
    kind: 'LEG', side: 'R',
    a: 'thigh_fk.R', b: 'shin_fk.R', c: 'foot_fk.R',
    ik: 'foot_ik.R', pole: 'thigh_ik_target.R',
    owner: 'MCH-shin_ik.R'
  }
];

function resolveRigifyIkChains(tgt) {
  return RIGIFY_IK_CHAINS.map(def => {
    const resolved = { ...def };
    for (const key of ['a', 'b', 'c', 'ik', 'pole']) {
      const runtimeName =
        findBoneByOriginalExact(tgt, [def[key]]) ||
        findSemanticBone(tgt, def[key]);
      if (!runtimeName) return null;
      resolved[key] = runtimeName;
    }
    resolved.owner =
      findBoneByOriginalExact(tgt, [def.owner]) ||
      findSemanticBone(tgt, def.owner) ||
      '';
    return resolved;
  }).filter(Boolean);
}

function evaluatedBonePose(tgt, runtimeName) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const position = bone.getWorldPosition(new THREE.Vector3());
  const quaternion = bone.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const scale = bone.getWorldScale(new THREE.Vector3());
  const matrix = new THREE.Matrix4().compose(
    position.clone(),
    quaternion.clone(),
    scale.clone()
  );

  return { bone, position, quaternion, scale, matrix };
}

function rigifyChainPoseSnapshot(tgt, chain) {
  const a = evaluatedBonePose(tgt, chain.a);
  const b = evaluatedBonePose(tgt, chain.b);
  const c = evaluatedBonePose(tgt, chain.c);
  if (!a || !b || !c) return null;
  return { a, b, c };
}

function scanRigifyPoleAnchorLocal(tgt, mixer, chain, times) {
  let bestLen = 0;
  let bestLocal = null;
  const step = Math.max(1, Math.floor(times.length / 60));

  for (let i = 0; i < times.length; i += step) {
    restoreRest(tgt);
    mixer.setTime(Number(times[i]));
    updateSlotWorld(tgt);

    const snap = rigifyChainPoseSnapshot(tgt, chain);
    if (!snap) continue;

    const upper = snap.b.position.clone().sub(snap.a.position);
    const lower = snap.c.position.clone().sub(snap.b.position);
    const bendAxisWorld = upper.clone().cross(lower);
    const len = bendAxisWorld.length();

    if (len <= bestLen || len < 1e-6) continue;

    const local = bendAxisWorld
      .clone()
      .applyQuaternion(snap.b.quaternion.clone().invert());

    if (local.lengthSq() < 1e-10) continue;

    bestLen = len;
    bestLocal = local.normalize();
  }

  restoreRest(tgt);
  return bestLocal;
}

function rigifyPoleFunctionalParentName(tgt, chain) {
  const mappedTargets = new Set(
    state.boneMap
      .filter(isPairValid)
      .map(pair => pair.target)
  );
  const excluded = new Set([chain.a, chain.b, chain.c, chain.ik, chain.pole]);

  let bone = tgt.bones.get(chain.a)?.parent || null;
  while (bone) {
    if (
      bone.isBone &&
      mappedTargets.has(bone.name) &&
      !excluded.has(bone.name)
    ) {
      return bone.name;
    }
    bone = bone.parent;
  }

  return findBoneByOriginalExact(tgt, ['root']) || null;
}

function rigifyFunctionalParentName(tgt, chain, kind) {
  // Rigify explicitly defaults IK_parent to root.
  if (kind === 'IK') {
    return findBoneByOriginalExact(tgt, ['root']) || null;
  }

  // Pole parent defaults to the limb's original rig parent. Walking from the
  // first FK control to the nearest mapped ancestor reproduces shoulder/torso
  // carry without depending on generated MCH names.
  return rigifyPoleFunctionalParentName(tgt, chain);
}

function rigifyFunctionalParentPoseMatrix(tgt, chain, kind, out) {
  const parentName = rigifyFunctionalParentName(tgt, chain, kind);
  if (!parentName) return out.identity();

  const pose = evaluatedBonePose(tgt, parentName);
  return pose ? out.copy(pose.matrix) : out.identity();
}

function rigifyFunctionalParentRestMatrix(tgt, chain, kind, out) {
  const parentName = rigifyFunctionalParentName(tgt, chain, kind);
  if (!parentName) return out.identity();

  return composeRestWorldMatrix(tgt, parentName, out) || out.identity();
}

function encodeRigifyControlLocal(
  tgt,
  controlName,
  desiredWorld,
  functionalParentPose,
  functionalParentRest,
  outMatrix
) {
  const control = tgt.bones.get(controlName);
  if (!control) return null;

  const controlRestWorld = composeRestWorldMatrix(
    tgt, controlName, new THREE.Matrix4()
  );
  const rawRestLocal = composeRestLocalMatrix(
    tgt, controlName, new THREE.Matrix4()
  );

  if (!controlRestWorld || !rawRestLocal) return null;

  let basis = null;

  // Rigify SwitchParentBuilder creates MCH-<control>.parent, parents the
  // visible control to it, and drives that MCH via an ARMATURE constraint.
  const helper = control.parent?.isBone ? control.parent : null;
  const helperOriginal = helper
    ? (originalObjectName(helper) || helper.name)
    : '';

  if (helper && /^MCH-.*\.parent$/i.test(helperOriginal)) {
    const helperRestWorld = composeRestWorldMatrix(
      tgt, helper.name, new THREE.Matrix4()
    );

    if (helperRestWorld) {
      const carrierDelta = functionalParentPose.clone()
        .multiply(functionalParentRest.clone().invert());

      const helperPoseWorld = carrierDelta
        .multiply(helperRestWorld);

      const controlRestRelative = helperRestWorld.clone()
        .invert()
        .multiply(controlRestWorld);

      const basisIdentityWorld = helperPoseWorld
        .multiply(controlRestRelative);

      basis = basisIdentityWorld.clone()
        .invert()
        .multiply(desiredWorld);
    }
  }

  if (!basis) {
    const restRelative = functionalParentRest.clone()
      .invert()
      .multiply(controlRestWorld);

    const desiredRelative = functionalParentPose.clone()
      .invert()
      .multiply(desiredWorld);

    basis = restRelative.clone()
      .invert()
      .multiply(desiredRelative);
  }

  return outMatrix.copy(rawRestLocal).multiply(basis);
}

function bakeRigifyIkFromFk() {
  if (!state.fkRawClip) {
    throw new Error('Primero aplica el retargeting FK de Rigify.');
  }

  const tgt = state.target;
  const solveClip = state.fkRawClip;
  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(solveClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(solveClip.duration, i / fps)
  );

  const chains = resolveRigifyIkChains(tgt);
  if (chains.length !== 4) {
    throw new Error(
      `FK→IK Rigify incompleto: encontré ${chains.length}/4 cadenas IK.`
    );
  }

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(solveClip).play();

  const poleAnchors = new Map();
  for (const chain of chains) {
    poleAnchors.set(
      chain.pole,
      scanRigifyPoleAnchorLocal(tgt, mixer, chain, times)
    );
  }

  const data = new Map();
  for (const chain of chains) {
    data.set(chain.ik, { p: [], q: [], s: [], lastQ: null });
    data.set(chain.pole, { p: [], q: [], s: [], lastQ: null });
  }

  const fkPoseWorld = new THREE.Matrix4();
  const fkRestWorld = new THREE.Matrix4();
  const ikRestWorld = new THREE.Matrix4();
  const desiredIkWorld = new THREE.Matrix4();
  const desiredPoleWorld = new THREE.Matrix4();
  const parentPose = new THREE.Matrix4();
  const parentRest = new THREE.Matrix4();
  const encodedLocal = new THREE.Matrix4();

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      for (const chain of chains) {
        const snap = rigifyChainPoseSnapshot(tgt, chain);
        if (!snap) continue;

        poseToMatrix(snap.c, fkPoseWorld);
        if (!restWorldMatrix(tgt, chain.c, fkRestWorld)) continue;
        if (!restWorldMatrix(tgt, chain.ik, ikRestWorld)) continue;

        // BlendCap: IK = FK_pose × inverse(FK_rest) × IK_rest.
        desiredIkWorld.copy(fkPoseWorld)
          .multiply(fkRestWorld.clone().invert())
          .multiply(ikRestWorld);

        rigifyFunctionalParentPoseMatrix(
          tgt, chain, 'IK', parentPose
        );
        rigifyFunctionalParentRestMatrix(
          tgt, chain, 'IK', parentRest
        );

        const encoded = encodeRigifyControlLocal(
          tgt,
          chain.ik,
          desiredIkWorld,
          parentPose,
          parentRest,
          encodedLocal
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s);
        q.normalize();

        const d = data.get(chain.ik);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();
        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s.x, s.y, s.z);
      }

      for (const chain of chains) {
        const snap = rigifyChainPoseSnapshot(tgt, chain);
        if (!snap) continue;

        const poleWorldPos = computeBlendCapPolePointFromSnapshot(
          snap,
          poleAnchors.get(chain.pole)
        );

        const poleRest = tgt.rest.get(chain.pole);
        if (!poleRest) continue;

        desiredPoleWorld.compose(
          poleWorldPos,
          poleRest.worldQuat.clone(),
          poleRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
        );

        rigifyFunctionalParentPoseMatrix(
          tgt, chain, 'POLE', parentPose
        );
        rigifyFunctionalParentRestMatrix(
          tgt, chain, 'POLE', parentRest
        );

        const encoded = encodeRigifyControlLocal(
          tgt,
          chain.pole,
          desiredPoleWorld,
          parentPose,
          parentRest,
          encodedLocal
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s);
        q.normalize();

        const d = data.get(chain.pole);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();
        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s.x, s.y, s.z);
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const tracks = [];
  for (const [name, d] of data) {
    if (d.p.length === times.length * 3) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${name}.position`, times, d.p)
      );
    }
    if (d.q.length === times.length * 4) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, d.q)
      );
    }
    if (d.s.length === times.length * 3) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${name}.scale`, times, d.s)
      );
    }
  }

  log(
    'FK→IK Rigify: IK=FKpose·FKrest⁻¹·IKrest; ' +
    'IK_parent=root; POLE parent compensado por MCH-*.parent; ' +
    'pole_vector debe estar ON en el Rigify original.'
  );

  return new THREE.AnimationClip(
    'Retargeted_IK_Controls',
    solveClip.duration,
    tracks
  );
}


function buildConvertedOutputClip(keepLimbFk) {
  const fk = state.fkClip;
  const ik = state.ikOnlyClip;
  if (!fk || !ik) return fk || ik;

  if (keepLimbFk) {
    return mergeClips('Retargeted_FK_IK', [fk, ik]);
  }

  // "Convert" must NOT discard root/spine/head/fingers/toes.
  // Only remove the FK rotations that the four IK chains replace.
  const replaced = new Set(
    usesRigifyPipeline()
      ? [
          'upper_arm_fk.L', 'forearm_fk.L', 'hand_fk.L',
          'upper_arm_fk.R', 'forearm_fk.R', 'hand_fk.R',
          'thigh_fk.L', 'shin_fk.L', 'foot_fk.L',
          'thigh_fk.R', 'shin_fk.R', 'foot_fk.R'
        ]
      : [
          'FK-UpperArm.L', 'FK-Forearm.L', 'FK-Hand.L',
          'FK-UpperArm.R', 'FK-Forearm.R', 'FK-Hand.R',
          'FK-Thigh.L', 'FK-Knee.L', 'FK-Foot.L',
          'FK-Thigh.R', 'FK-Knee.R', 'FK-Foot.R'
        ]
  );

  const retained = fk.tracks.filter(track => {
    const parsed = parseTrackTarget(track.name);
    if (!parsed) return true;

    const bone = state.target.bones.get(parsed.nodeName);
    const original = originalObjectName(bone) || parsed.nodeName;

    return !replaced.has(original);
  }).map(track => track.clone());

  const bodyClip = new THREE.AnimationClip(
    'Retargeted_Body_Without_LimbFK',
    fk.duration,
    retained
  );

  return mergeClips('Retargeted_IK', [bodyClip, ik]);
}

function bakeIkFromFk() {
  if (!state.fkClip) throw new Error('Primero aplica el retargeting FK.');

  const tgt = state.target;

  // IMPORTANT: state.fkClip is the exact pose-basis carrier that already
  // reproduces the FK 1:1 when its Action is copied onto RIG-Sintel.
  // Do not use WaltRig Runtime here: it is a Three.js preview simulation,
  // not the source of truth for OriginalRig_Action export.
  const solveClip = state.fkClip;

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(solveClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(solveClip.duration, i / fps)
  );

  const chains = resolveCloudRigIkChains(tgt);
  if (chains.length !== 4) {
    throw new Error(
      `FK→IK CloudRig incompleto: encontré ${chains.length}/4 cadenas IK.`
    );
  }

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(solveClip).play();

  // BlendCap: choose a stable local bend axis from the most-bent sample.
  const poleAnchors = new Map();
  for (const chain of chains) {
    poleAnchors.set(
      chain.pole,
      scanPoleAnchorLocal(tgt, mixer, chain, times)
    );
  }

  const data = new Map();
  for (const chain of chains) {
    data.set(chain.ik, { p: [], q: [], s: [], lastQ: null });
    data.set(chain.pole, { p: [], q: [], s: [], lastQ: null });
  }

  const fkPoseWorld = new THREE.Matrix4();
  const fkRestWorld = new THREE.Matrix4();
  const ikRestWorld = new THREE.Matrix4();
  const desiredIkWorld = new THREE.Matrix4();
  const desiredPoleWorld = new THREE.Matrix4();

  const parentPose = new THREE.Matrix4();
  const parentRest = new THREE.Matrix4();
  const encodedLocal = new THREE.Matrix4();

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      // Reconstruct the ORIGINAL CloudRig FK pose from the same pose-basis
      // carrier used by the already-working OriginalRig_Action.
      const fkPoseCache = new Map();
      const ikDesiredWorldByName = new Map();

      // End effectors. BlendCap formula:
      // desiredIK = FK_pose * inverse(FK_rest) * IK_rest.
      for (const chain of chains) {
        const snap = chainPoseSnapshot(tgt, chain, fkPoseCache);
        if (!snap) continue;

        poseToMatrix(snap.c, fkPoseWorld);

        if (!restWorldMatrix(tgt, chain.c, fkRestWorld)) continue;
        if (!restWorldMatrix(tgt, chain.ik, ikRestWorld)) continue;

        desiredIkWorld.copy(fkPoseWorld)
          .multiply(fkRestWorld.clone().invert())
          .multiply(ikRestWorld);

        ikDesiredWorldByName.set(chain.ik, desiredIkWorld.clone());

        functionalParentPoseMatrix(
          tgt,
          chain,
          'IK',
          ikDesiredWorldByName,
          fkPoseCache,
          parentPose
        );
        functionalParentRestMatrix(
          tgt, chain, 'IK', parentRest
        );

        const encoded = encodeOriginalRigControlLocal(
          tgt,
          chain.ik,
          desiredIkWorld,
          parentPose,
          parentRest,
          encodedLocal
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s);
        q.normalize();

        const d = data.get(chain.ik);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();

        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s.x, s.y, s.z);
      }

      // Poles second. For legs, CloudRig's default ik_pole_follow=1 means the
      // P-POLE carrier follows the just-computed IK-Foot.
      for (const chain of chains) {
        const snap = chainPoseSnapshot(tgt, chain, fkPoseCache);
        if (!snap) continue;

        const poleWorldPos = computeBlendCapPolePointFromSnapshot(
          snap,
          poleAnchors.get(chain.pole)
        );

        const poleRest = tgt.rest.get(chain.pole);
        if (!poleRest) continue;

        desiredPoleWorld.compose(
          poleWorldPos,
          poleRest.worldQuat.clone(),
          poleRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
        );

        functionalParentPoseMatrix(
          tgt,
          chain,
          'POLE',
          ikDesiredWorldByName,
          fkPoseCache,
          parentPose
        );
        functionalParentRestMatrix(
          tgt, chain, 'POLE', parentRest
        );

        const encoded = encodeOriginalRigControlLocal(
          tgt,
          chain.pole,
          desiredPoleWorld,
          parentPose,
          parentRest,
          encodedLocal
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s);
        q.normalize();

        const d = data.get(chain.pole);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();

        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s.x, s.y, s.z);
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const tracks = [];
  for (const [name, d] of data) {
    if (d.p.length === times.length * 3) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${name}.position`, times, d.p)
      );
    }
    if (d.q.length === times.length * 4) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, d.q)
      );
    }
    if (d.s.length === times.length * 3) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${name}.scale`, times, d.s)
      );
    }
  }

  if (tracks.length < 24) {
    log(
      `FK→IK aviso: se generaron ${tracks.length}/24 curvas esperadas ` +
      '(4 IK + 4 POLE × TRS).'
    );
  }

  log(
    'FK→IK BlendCap parity: fuente=OriginalRig matrix_basis (NO preview); ' +
    'IK=FKpose·FKrest⁻¹·IKrest; manos/pies sin cambios; ' +
    'POLE-Arm y POLE-Leg usan el mismo espacio estable de root (pole_follow=0).'
  );

  return new THREE.AnimationClip(
    'Retargeted_IK_Controls',
    solveClip.duration,
    tracks
  );
}

function convertFkToIk() {
  try {
    setStatus('Baking FK → IK…');

    state.ikOnlyClip = usesRigifyPipeline()
      ? bakeRigifyIkFromFk()
      : bakeIkFromFk();
    state.exportClip = buildConvertedOutputClip($('keepFk').checked);
    state.exported = false;

    // Preview always retains FK because the browser intentionally does not run
    // CloudRig's Blender IK constraints. IK controls are baked/exported; the
    // already-correct FK keeps the visible deformation identical while we
    // validate the generated control curves.
    state.targetPreviewClip = mergeClips(
      'Preview_FK_IK',
      [
        usesRigifyPipeline() ? state.fkRawClip : state.fkClip,
        state.ikOnlyClip
      ]
    );

    playTargetClip(state.targetPreviewClip);
    updateButtons();
    updateStats();
    setStatus('FK → IK listo', 'good');

    log(
      `FK → IK generado: ${state.ikOnlyClip.tracks.length} curvas. ` +
      `Salida: ${state.exportClip.tracks.length} curvas; ` +
      `Conservar FK=${$('keepFk').checked ? 'sí' : 'no (sólo FK de cuerpo/dedos/toes)'}. `
    );
  } catch (err) {
    console.error(err);
    setStatus('Error FK → IK', 'bad');
    log(`ERROR FK→IK: ${err?.stack || err?.message || err}`);
  }
}

function createOriginalNameExportClip(clip, slot) {
  const nameMap = new Map();

  slot.root.traverse((object) => {
    const original = originalObjectName(object);
    if (object.name && original && object.name !== original) {
      nameMap.set(object.name, original);
    }
  });

  const loadedNames = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  const tracks = clip.tracks.map((track) => {
    const copy = track.clone();

    for (const loadedName of loadedNames) {
      if (track.name === loadedName || track.name.startsWith(loadedName + '.')) {
        copy.name = nameMap.get(loadedName) + track.name.slice(loadedName.length);
        break;
      }
    }

    return copy;
  });

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function temporarilyRestoreOriginalNames(root) {
  const renamed = [];

  root.traverse((object) => {
    const original = originalObjectName(object);
    if (original && object.name !== original) {
      renamed.push([object, object.name]);
      object.name = original;
    }
  });

  return () => {
    for (const [object, runtimeName] of renamed) object.name = runtimeName;
  };
}


// Parent frame that the ORIGINAL CloudRig evaluates through constraints.
 // This is deliberately different from the raw FBX hierarchy: in the FBX,
 // Neck/Head/UpperArm live below static FK-HNG branches and Shoulder lives
 // below the raw Chest branch. The Action we export must contain pose-basis
 // deltas for the original constrained rig, not raw-FBX local rotations.
function parseTrackTarget(trackName) {
  const dot = String(trackName || '').lastIndexOf('.');
  if (dot <= 0) return null;
  return {
    nodeName: trackName.slice(0, dot),
    property: trackName.slice(dot + 1)
  };
}

const ORIGINAL_RIG_LOGICAL_PARENT = {
  'TORSO-Spine': 'root',

  // Two parallel CloudRig body sections below TORSO.
  'FK-Spine': 'TORSO-Spine',
  'FK-Chest': 'FK-Spine',
  'HIP-Spine': 'TORSO-Spine',
  'HTP-Spine': 'TORSO-Spine',

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

  // CloudRig hinge_setup: FK-HNG-Thigh follows the lower section in FK mode.
  // Collapsing that carry to HIP/HTP is mathematically equivalent for the
  // animator's matrix_basis and avoids baking the missing FBX constraint.
  'FK-Thigh.L': '@LOWER',
  'FK-Knee.L': 'FK-Thigh.L',
  'FK-Foot.L': 'FK-Knee.L',
  // FK-Toes is parentless in data but an ARMATURE constraint carries it from
  // FK-Foot when ik=0. Treat FK-Foot as its logical/carry parent.
  'FK-Toes.L': 'FK-Foot.L',

  'FK-Thigh.R': '@LOWER',
  'FK-Knee.R': 'FK-Thigh.R',
  'FK-Foot.R': 'FK-Knee.R',
  'FK-Toes.R': 'FK-Foot.R'
};

function buildOriginalRigTransferClip(clip) {
  const tgt = state.target;
  if (!clip || !tgt.root) return clip;

  const runtimePairs = new Map();

  for (const [childOriginal, parentSpec] of Object.entries(ORIGINAL_RIG_LOGICAL_PARENT)) {
    const childName = findBoneByOriginalExact(tgt, [childOriginal]);

    const parentCandidates = parentSpec === '@LOWER'
      ? ['HIP-Spine', 'HTP-Spine']
      : [parentSpec];

    const parentName = parentCandidates
      .map(name => findBoneByOriginalExact(tgt, [name]))
      .find(Boolean);

    if (childName && parentName) {
      const parentBone = tgt.bones.get(parentName);
      runtimePairs.set(childName, {
        childOriginal,
        parentOriginal: originalObjectName(parentBone) || parentSpec,
        parentName
      });
    }
  }

  if (!runtimePairs.size) return clip.clone();

  const sourceTracks = clip.tracks.map(track => track.clone());
  const specialTracks = sourceTracks.filter(track => {
    const parsed = parseTrackTarget(track.name);
    return parsed?.property === 'quaternion' && runtimePairs.has(parsed.nodeName);
  });

  if (!specialTracks.length) return clip.clone();

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(clip).play();

  const replacement = new Map();

  try {
    for (const track of specialTracks) {
      const parsed = parseTrackTarget(track.name);
      const childName = parsed.nodeName;
      const pair = runtimePairs.get(childName);

      const child = tgt.bones.get(childName);
      const parent = tgt.bones.get(pair.parentName);
      const childRest = tgt.rest.get(childName);
      const parentRest = tgt.rest.get(pair.parentName);

      if (!child || !parent || !childRest || !parentRest) continue;

      const restRelative = parentRest.worldQuat.clone()
        .invert()
        .multiply(childRest.worldQuat)
        .normalize();

      const restRelativeInv = restRelative.clone().invert();
      const values = [];

      const childWorld = new THREE.Quaternion();
      const parentWorld = new THREE.Quaternion();
      const poseRelative = new THREE.Quaternion();
      const basisDelta = new THREE.Quaternion();
      const exportLocal = new THREE.Quaternion();

      let previous = null;

      for (const time of track.times) {
        restoreRest(tgt);
        mixer.setTime(Number(time));
        updateSlotWorld(tgt);

        child.getWorldQuaternion(childWorld);
        parent.getWorldQuaternion(parentWorld);

        poseRelative.copy(parentWorld)
          .invert()
          .multiply(childWorld)
          .normalize();

        // logicalPose = logicalRest * matrixBasis
        // => matrixBasis = inverse(logicalRest) * logicalPose
        basisDelta.copy(restRelativeInv)
          .multiply(poseRelative)
          .normalize();

        // The FBX control itself still lives below its static HNG branch.
        // Write restLocal * matrixBasis so Blender's FBX importer recovers
        // the same pose-channel delta when this Action is assigned to the
        // ORIGINAL rig, where the HNG/constraints move with Chest/Shoulder.
        exportLocal.copy(childRest.quaternion)
          .multiply(basisDelta)
          .normalize();

        if (previous && previous.dot(exportLocal) < 0) {
          exportLocal.x *= -1;
          exportLocal.y *= -1;
          exportLocal.z *= -1;
          exportLocal.w *= -1;
        }

        values.push(
          exportLocal.x,
          exportLocal.y,
          exportLocal.z,
          exportLocal.w
        );

        previous = exportLocal.clone();
      }

      replacement.set(
        track.name,
        new THREE.QuaternionKeyframeTrack(
          track.name,
          Array.from(track.times),
          values
        )
      );

      log(
        `OriginalRig basis: ${pair.childOriginal} relativo a ${pair.parentOriginal}.`
      );
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const tracks = sourceTracks.map(track => replacement.get(track.name) || track);

  return new THREE.AnimationClip(
    clip.name || 'Retargeted_FK',
    clip.duration,
    tracks
  );
}


function buildRigifyOriginalRigTransferClip(clip) {
  const tgt = state.target;
  if (!clip || !tgt.root) return clip;

  const childName =
    findBoneByOriginalExact(tgt, ['head']) ||
    findSemanticBone(tgt, 'head');
  const parentName =
    findBoneByOriginalExact(tgt, ['neck']) ||
    findSemanticBone(tgt, 'neck');

  if (!childName || !parentName) return clip.clone();

  const child = tgt.bones.get(childName);
  const parent = tgt.bones.get(parentName);
  const childRest = tgt.rest.get(childName);
  const parentRest = tgt.rest.get(parentName);

  if (!child || !parent || !childRest || !parentRest) return clip.clone();

  const sourceTracks = clip.tracks.map(track => track.clone());
  const headTrack = sourceTracks.find(track => {
    const parsed = parseTrackTarget(track.name);
    return parsed?.nodeName === childName && parsed.property === 'quaternion';
  });

  if (!headTrack) return clip.clone();

  // Rigify's visible head control is parented to MCH-ROT-head, which follows
  // neck in Blender. The FBX helper is static, so a raw local solve gives the
  // wrong matrix_basis when the Action is copied back to the original rig.
  // Solve head exactly against the animated neck frame instead.
  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(clip).play();

  const restRelative = parentRest.worldQuat.clone()
    .invert()
    .multiply(childRest.worldQuat)
    .normalize();
  const restRelativeInv = restRelative.clone().invert();

  const values = [];
  const childWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const poseRelative = new THREE.Quaternion();
  const basisDelta = new THREE.Quaternion();
  const exportLocal = new THREE.Quaternion();
  let previous = null;

  try {
    for (const time of headTrack.times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      child.getWorldQuaternion(childWorld);
      parent.getWorldQuaternion(parentWorld);

      poseRelative.copy(parentWorld)
        .invert()
        .multiply(childWorld)
        .normalize();

      basisDelta.copy(restRelativeInv)
        .multiply(poseRelative)
        .normalize();

      // Same carrier convention used by OriginalRig_Action:
      // FBX local = raw rest local × Blender matrix_basis.
      exportLocal.copy(childRest.quaternion)
        .multiply(basisDelta)
        .normalize();

      if (previous && previous.dot(exportLocal) < 0) {
        exportLocal.x *= -1;
        exportLocal.y *= -1;
        exportLocal.z *= -1;
        exportLocal.w *= -1;
      }

      values.push(
        exportLocal.x,
        exportLocal.y,
        exportLocal.z,
        exportLocal.w
      );
      previous = exportLocal.clone();
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const replacement = new THREE.QuaternionKeyframeTrack(
    headTrack.name,
    Array.from(headTrack.times),
    values
  );

  const tracks = sourceTracks.map(track =>
    track.name === headTrack.name ? replacement : track
  );

  log('Rigify OriginalRig basis: head relativo a neck/MCH-ROT-head.');

  return new THREE.AnimationClip(
    clip.name || 'Retargeted_FK',
    clip.duration,
    tracks
  );
}


function buildCloudRigCleanHierarchyPlan() {
  const tgt = state.target;
  if (!tgt.root) return [];

  restoreRest(tgt);
  updateSlotWorld(tgt);

  const lowerSectionName =
    findBoneByOriginalExact(tgt, ['HTP-Spine', 'HIP-Spine']);

  const lowerSectionBone = lowerSectionName
    ? tgt.bones.get(lowerSectionName)
    : null;

  const lowerSectionOriginal = lowerSectionBone
    ? originalObjectName(lowerSectionBone)
    : null;

  const pairs = [
    ['FK-Spine', 'TORSO-Spine'],
    ['FK-Chest', 'FK-Spine'],

    ['FK-Shoulder.L', 'FK-Chest'],
    ['FK-UpperArm.L', 'FK-Shoulder.L'],
    ['FK-Forearm.L', 'FK-UpperArm.L'],
    ['FK-Hand.L', 'FK-Forearm.L'],

    ['FK-Shoulder.R', 'FK-Chest'],
    ['FK-UpperArm.R', 'FK-Shoulder.R'],
    ['FK-Forearm.R', 'FK-UpperArm.R'],
    ['FK-Hand.R', 'FK-Forearm.R'],

    ['FK-Neck', 'FK-Chest'],
    ['FK-Head', 'FK-Neck'],

    ...(lowerSectionOriginal ? [['FK-Hips', lowerSectionOriginal]] : []),

    ['FK-Thigh.L', 'FK-Hips'],
    ['FK-Knee.L', 'FK-Thigh.L'],
    ['FK-Foot.L', 'FK-Knee.L'],
    ['FK-Toes.L', 'FK-Foot.L'],

    ['FK-Thigh.R', 'FK-Hips'],
    ['FK-Knee.R', 'FK-Thigh.R'],
    ['FK-Foot.R', 'FK-Knee.R'],
    ['FK-Toes.R', 'FK-Foot.R']
  ];

  const entries = [];
  const localMatrix = new THREE.Matrix4();
  const localPosition = new THREE.Vector3();
  const localQuaternion = new THREE.Quaternion();
  const localScale = new THREE.Vector3();

  for (const [childOriginal, parentOriginal] of pairs) {
    const childName = findBoneByOriginalExact(tgt, [childOriginal]);
    const parentName = findBoneByOriginalExact(tgt, [parentOriginal]);
    if (!childName || !parentName) continue;

    const child = tgt.bones.get(childName);
    const parent = tgt.bones.get(parentName);
    if (!child || !parent) continue;

    localMatrix.copy(parent.matrixWorld)
      .invert()
      .multiply(child.matrixWorld);

    localMatrix.decompose(localPosition, localQuaternion, localScale);

    entries.push({
      child: originalObjectName(child) || childOriginal,
      parent: originalObjectName(parent) || parentOriginal,
      runtimeChild: childName,
      runtimeParent: parentName,
      position: [localPosition.x, localPosition.y, localPosition.z],
      quaternion: [
        localQuaternion.x,
        localQuaternion.y,
        localQuaternion.z,
        localQuaternion.w
      ],
      scale: [localScale.x, localScale.y, localScale.z]
    });
  }

  restoreRest(tgt);
  return entries;
}

function poseMatrixForCleanHierarchy(tgt, runtime, runtimeName, out) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const virtual = runtime?.virtualFk?.get(runtimeName);
  const position = virtual?.position
    ? virtual.position
    : bone.getWorldPosition(new THREE.Vector3());
  const quaternion = virtual?.quaternion
    ? virtual.quaternion
    : bone.getWorldQuaternion(new THREE.Quaternion());
  const scale = bone.getWorldScale(new THREE.Vector3());

  return out.compose(
    position.clone(),
    quaternion.clone(),
    scale
  );
}

function bakeCleanHierarchyControlClip(sourceClip, rewritePlan) {
  const tgt = state.target;
  const runtime = tgt.rigRuntime;

  if (!tgt.root || !sourceClip || !rewritePlan?.length) return sourceClip;

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(sourceClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(sourceClip.duration, i / fps)
  );

  const rewrittenNames = new Set(rewritePlan.map(x => x.runtimeChild));
  const baseTracks = sourceClip.tracks
    .filter(track => {
      const parsed = parseTrackTarget(track.name);
      if (!parsed || !rewrittenNames.has(parsed.nodeName)) return true;
      return !['position', 'quaternion', 'scale'].includes(parsed.property);
    })
    .map(track => track.clone());

  const data = new Map(
    rewritePlan.map(entry => [
      entry.runtimeChild,
      { p: [], q: [], s: [], previousQ: null, entry }
    ])
  );

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(sourceClip).play();

  const previousRuntimeEnabled = runtime?.enabled;
  if (runtime) runtime.enabled = true;

  const childWorld = new THREE.Matrix4();
  const parentWorld = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      runtime?.update?.();
      updateSlotWorld(tgt);

      for (const entry of rewritePlan) {
        const d = data.get(entry.runtimeChild);
        if (!d) continue;

        if (
          !poseMatrixForCleanHierarchy(
            tgt,
            runtime,
            entry.runtimeChild,
            childWorld
          ) ||
          !poseMatrixForCleanHierarchy(
            tgt,
            runtime,
            entry.runtimeParent,
            parentWorld
          )
        ) {
          continue;
        }

        local.copy(parentWorld)
          .invert()
          .multiply(childWorld);

        local.decompose(p, q, s);
        q.normalize();

        if (d.previousQ && d.previousQ.dot(q) < 0) {
          q.x *= -1;
          q.y *= -1;
          q.z *= -1;
          q.w *= -1;
        }

        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s.x, s.y, s.z);
        d.previousQ = q.clone();
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    if (runtime) runtime.enabled = previousRuntimeEnabled;
    restoreRest(tgt);
  }

  const tracks = [...baseTracks];

  for (const [name, d] of data) {
    if (d.p.length === times.length * 3) {
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, d.p));
    }

    if (d.q.length === times.length * 4) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, d.q));
    }

    if (d.s.length === times.length * 3) {
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, d.s));
    }
  }

  return new THREE.AnimationClip(
    'Retargeted_CleanControls',
    sourceClip.duration,
    tracks
  );
}

function buildOriginalRigLowerFrameClip(sourceClip) {
  const tgt = state.target;
  const runtime = tgt.rigRuntime;

  if (!tgt.root || !sourceClip) return sourceClip;

  const lowerName =
    findBoneByOriginalExact(tgt, ['HIP-Spine', 'HTP-Spine']);
  const hipsName = findBoneByOriginalExact(tgt, ['FK-Hips']);

  if (!lowerName || !hipsName) {
    log('OriginalRig lower frame: HIP/HTP-Spine o FK-Hips no encontrado; se conserva la Action anterior.');
    return sourceClip.clone();
  }

  const lower = tgt.bones.get(lowerName);
  const hips = tgt.bones.get(hipsName);
  const hipsRest = tgt.rest.get(hipsName);

  if (!lower || !hips || !hipsRest) return sourceClip.clone();

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(sourceClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(sourceClip.duration, i / fps)
  );

  restoreRest(tgt);
  updateSlotWorld(tgt);

  const lowerRestWorld = lower.matrixWorld.clone();
  const hipsRestWorld = hips.matrixWorld.clone();
  const hipsRestRelative = lowerRestWorld.clone()
    .invert()
    .multiply(hipsRestWorld);
  const hipsRestRelativeInv = hipsRestRelative.clone().invert();

  const lowerP = [];
  const lowerQ = [];
  const lowerS = [];
  const neutralHipsQ = [];
  let previousLowerQ = null;

  const tracks = sourceClip.tracks
    .filter(track => {
      const parsed = parseTrackTarget(track.name);
      if (!parsed) return true;

      if (parsed.nodeName === lowerName &&
          ['position', 'quaternion', 'scale'].includes(parsed.property)) {
        return false;
      }

      if (parsed.nodeName === hipsName &&
          parsed.property === 'quaternion') {
        return false;
      }

      return true;
    })
    .map(track => track.clone());

  tgt.mixer?.stopAllAction();
  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(sourceClip).play();

  const previousRuntimeEnabled = runtime?.enabled;
  if (runtime) runtime.enabled = true;

  const desiredHipsWorld = new THREE.Matrix4();
  const desiredLowerWorld = new THREE.Matrix4();
  const desiredLowerLocal = new THREE.Matrix4();

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      runtime?.update?.();
      updateSlotWorld(tgt);

      if (!poseMatrixForCleanHierarchy(
        tgt,
        runtime,
        hipsName,
        desiredHipsWorld
      )) {
        continue;
      }

      desiredLowerWorld.copy(desiredHipsWorld)
        .multiply(hipsRestRelativeInv);

      if (lower.parent) {
        desiredLowerLocal.copy(lower.parent.matrixWorld)
          .invert()
          .multiply(desiredLowerWorld);
      } else {
        desiredLowerLocal.copy(desiredLowerWorld);
      }

      desiredLowerLocal.decompose(p, q, s);
      q.normalize();

      if (previousLowerQ && previousLowerQ.dot(q) < 0) {
        q.x *= -1;
        q.y *= -1;
        q.z *= -1;
        q.w *= -1;
      }
      previousLowerQ = q.clone();

      lowerP.push(p.x, p.y, p.z);
      lowerQ.push(q.x, q.y, q.z, q.w);
      lowerS.push(s.x, s.y, s.z);

      neutralHipsQ.push(
        hipsRest.quaternion.x,
        hipsRest.quaternion.y,
        hipsRest.quaternion.z,
        hipsRest.quaternion.w
      );
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    if (runtime) runtime.enabled = previousRuntimeEnabled;
    restoreRest(tgt);
  }

  if (lowerP.length === times.length * 3) {
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${lowerName}.position`,
        times,
        lowerP
      )
    );
  }

  if (lowerQ.length === times.length * 4) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${lowerName}.quaternion`,
        times,
        lowerQ
      )
    );
  }

  if (lowerS.length === times.length * 3) {
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${lowerName}.scale`,
        times,
        lowerS
      )
    );
  }

  if (neutralHipsQ.length === times.length * 4) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${hipsName}.quaternion`,
        times,
        neutralHipsQ
      )
    );
  }

  log(
    `OriginalRig lower frame: ${originalObjectName(lower) || lowerName} recibe la pose WORLD de FK-Hips; ` +
    'FK-Hips queda neutral para evitar doble pelvis. Las piernas/HNG siguen el frame inferior real.'
  );

  return new THREE.AnimationClip(
    'Retargeted_OriginalRig_FrameSplit',
    sourceClip.duration,
    tracks
  );
}

function buildOriginalRigControlOnlyClip(clip) {
  if (!clip) return null;

  // The official preset itself defines which Target controls belong in the
  // Action. This is rig-agnostic: Rigify/ARP/Mixamo names no longer get
  // discarded by CloudRig-specific regexes.
  const allowedRuntimeNames = new Set(
    state.boneMap
      .filter(isPairValid)
      .map(pair => pair.target)
  );

  // FK→IK currently exists only for CloudRig. Include its generated controls
  // even though they were not original FK mapping rows.
  for (const track of state.ikOnlyClip?.tracks || []) {
    const parsed = parseTrackTarget(track.name);
    if (parsed) allowedRuntimeNames.add(parsed.nodeName);
  }

  const tracks = clip.tracks
    .filter(track => {
      const parsed = parseTrackTarget(track.name);
      return !!parsed && allowedRuntimeNames.has(parsed.nodeName);
    })
    .map(track => track.clone());

  return new THREE.AnimationClip(
    'Retargeted_OriginalRig_FK',
    clip.duration,
    tracks
  );
}

function buildStandaloneCleanExport() {
  const hierarchy = buildCloudRigCleanHierarchyPlan();

  if (!hierarchy.length) {
    throw new Error('No pude construir la jerarquía limpia del CloudRig.');
  }

  const controlSource = state.targetPreviewClip || state.exportClip;
  const cleanControls = bakeCleanHierarchyControlClip(
    controlSource,
    hierarchy
  );

  const defBaked = bakeDeformPreviewClip();

  if (!defBaked) {
    throw new Error(
      'No pude hornear los DEF del CloudRig para mover la malla standalone.'
    );
  }

  const standalone = mergeClips(
    'Retargeted_Standalone',
    [cleanControls, defBaked]
  );

  return {
    hierarchy,
    clip: standalone,
    controlTracks: cleanControls.tracks.length,
    defTracks: defBaked.tracks.length
  };
}

function downloadBinaryFile(bytes, fileName, mime = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTextFile(text, fileName, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBlenderXYZAction() {
  if (!state.target.root || !state.exportClip) return;

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const rotationMode = $('rotationMode')?.value === 'quaternion' ? 'quaternion' : 'xyz';
  const resumeTime = state.playTime;
  const script = buildBlenderActionScript(
    state.exportClip,
    state.target,
    fps,
    originalObjectName,
    rotationMode
  );

  playTargetClip(state.targetPreviewClip);
  seek(resumeTime);

  const base = (state.target.fileName || 'target.fbx').replace(/\.fbx$/i, '');
  const suffix = rotationMode === 'quaternion' ? 'Quaternion' : 'XYZ';
  downloadTextFile(script, base + '_Retargeted_' + suffix + '_Blender.py', 'text/x-python');

  setStatus('Action para Blender exportada', 'good');
  log(`Blender Action: ${suffix} generado desde deltas WORLD del viewport para el rig original.`);
}

function buildOriginalRigActionFbxPackage(rotationMode = 'xyz') {
  if (!state.target.root || !state.exportClip || !state.target.originalBuffer) {
    throw new Error('Falta Target, retarget o FBX original.');
  }

  const controlClip = buildOriginalRigControlOnlyClip(state.exportClip);
  if (!controlClip || !controlClip.tracks.length) {
    throw new Error('No pude construir la Action de controles del rig original.');
  }

  const originalRigAction = createOriginalNameExportClip(
    controlClip,
    state.target
  );

  const result = injectAnimationsIntoOriginalFBX(
    state.target.originalBuffer,
    [{
      clip: originalRigAction,
      actionName: 'Retargeted_OriginalRig_FK',
      includeControlPositions: true
    }],
    {
      rotationMode,
      currentActionName: 'Retargeted_OriginalRig_FK'
    }
  );

  return {
    ...result,
    action: originalRigAction
  };
}

async function exportOriginalRigActionFbx() {
  if (!state.target.root || !state.exportClip || !state.target.originalBuffer) return;

  try {
    setStatus('Exportando Action FBX para rig original…');

    const rotationMode = $('rotationMode')?.value || 'xyz';
    const pkg = buildOriginalRigActionFbxPackage(rotationMode);
    const base = (state.target.fileName || 'target.fbx').replace(/\.fbx$/i, '');

    downloadBinaryFile(
      pkg.bytes,
      `${base}_OriginalRig_Action.fbx`
    );

    setStatus('Action FBX para rig original exportada', 'good');
    log(
      `OriginalRig Action FBX: 1 stack · ${pkg.action.tracks.length} tracks · ` +
      `preset=${state.activePreset?.label || 'manual'}. ` +
      'Importa este FBX sólo para extraer Retargeted_OriginalRig_FK.'
    );
  } catch (err) {
    console.error(err);
    setStatus('Error exportando Action FBX', 'bad');
    log(`ERROR OriginalRig FBX: ${err?.stack || err?.message || err}`);
  }
}

async function exportTargetFbx() {
  if (!state.target.root || !state.exportClip) return;

  try {
    setStatus('Exportando FBX…');

    const exportClip = createOriginalNameExportClip(state.exportClip, state.target);
    let exportMode = $('exportMode')?.value || 'exact';
    const rotationMode = $('rotationMode')?.value || 'xyz';

    if (exportMode === 'clean' && !usesCloudRigPipeline()) {
      exportMode = 'exact';
      if ($('exportMode')) $('exportMode').value = 'exact';
      log('FBX CLEAN es específico de CloudRig; este preset se exportará como FBX EXACTO.');
    }

    let bytes;
    let report = null;

    if (exportMode === 'clean') {
      const clean = buildStandaloneCleanExport();

      // Action A: standalone. Contains baked DEF because the exported FBX no
      // longer has the Blender constraints/drivers that normally move them.
      const originalStandalone = createOriginalNameExportClip(
        clean.clip,
        state.target
      );

      // Action B: copy-back Action for the ORIGINAL .blend rig.
      // NO DEF curves. On the original CloudRig the DEF/STR chains must be
      // driven by its own constraints from the FK/IK controls.
      const originalRigControlClip = buildOriginalRigControlOnlyClip(
        state.exportClip
      );

      if (!originalRigControlClip || !originalRigControlClip.tracks.length) {
        throw new Error(
          'No pude construir la Action de controles para el CloudRig original.'
        );
      }

      const originalRigAction = createOriginalNameExportClip(
        originalRigControlClip,
        state.target
      );

      const result = injectAnimationsIntoOriginalFBX(
        state.target.originalBuffer,
        [{
          clip: originalStandalone,
          actionName: 'Retargeted_Standalone',
          includeDeformPositions: true,
          includeControlPositions: true
        }],
        {
          rotationMode,
          currentActionName: 'Retargeted_Standalone',
          hierarchyRewrite: clean.hierarchy
        }
      );

      bytes = result.bytes;
      report = result.report;

      log(
        `FBX CLEAN: jerarquía FK reescrita=${report.hierarchy?.rewired || 0}; ` +
        `Retargeted_Standalone=${clean.controlTracks + clean.defTracks} tracks ` +
        `(DEF baked=${clean.defTracks}). Este FBX contiene UNA Action standalone por diseño.`
      );
    } else if (exportMode === 'exact') {
      const exactActions = [
        {
          clip: exportClip,
          actionName: exportClip.name || 'Retargeted_FK',
          includeControlPositions: true
        }
      ];

      let currentActionName = exportClip.name || 'Retargeted_FK';

      if (usesCloudRigPipeline() && $('includeDefPreview')?.checked) {
        const defPreview = bakeDeformPreviewClip();

        if (defPreview) {
          const originalDefPreview = createOriginalNameExportClip(defPreview, state.target);
          exactActions.push({
            clip: originalDefPreview,
            actionName: 'Retargeted_DEF_Preview',
            includeDeformPositions: true
          });

          // Al abrir el FBX standalone, esta Action es la que mueve la malla
          // sin necesitar constraints de Blender.
          currentActionName = 'Retargeted_DEF_Preview';
        }
      }

      const result = injectAnimationsIntoOriginalFBX(
        state.target.originalBuffer,
        exactActions,
        {
          rotationMode,
          currentActionName
        }
      );

      bytes = result.bytes;
      report = result.report;

      const clipNames = report.clips.map(c => c.name).join(', ');
      log(
        `FBX EXACTO: Target original + Actions [${clipNames}]. ` +
        `Stacks=${report.stacks}, CurveNodes=${report.curveNodes}, Curves=${report.curves}. ` +
        'Lcl Rotation preserva RotationOrder y revierte Pre/PostRotation del FBX original.'
      );
    } else {
      state.target.mixer?.stopAllAction();
      restoreRest(state.target);

      const oldAnimations = state.target.root.animations;
      const restoreRuntimeNames = temporarilyRestoreOriginalNames(state.target.root);
      const displayParent = state.target.root.parent === state.target.displayRoot
        ? state.target.displayRoot
        : null;

      if (displayParent) displayParent.remove(state.target.root);
      restoreOriginalMaterials(state.target);
      state.target.root.animations = [exportClip];

      const exporter = new FBXExporter();
      const options = {
        preset: 'blender',
        version: 7400,
        unitScale: 100,
        bakeSpaceTransform: false,
        fps: Math.max(1, Math.min(120, Number($('fps').value) || 30)),
        includeAnimations: true,
        animations: [exportClip],
        embedTextures: true,
        customProperties: true,
        creator: 'Retarget-to-play'
      };

      try {
        try {
          bytes = await exporter.parseAsync(state.target.root, options);
        } catch (textureErr) {
          log(
            `Export legacy con texturas falló (${textureErr.message}). ` +
            'Reintentando sin embeber texturas…'
          );
          bytes = await exporter.parseAsync(
            state.target.root,
            { ...options, embedTextures: false }
          );
        }
      } finally {
        state.target.root.animations = oldAnimations;
        restoreRuntimeNames();

        if (displayParent) {
          displayParent.add(state.target.root);
          displayParent.updateMatrixWorld(true);
        }

        applyWhiteViewportMaterial(state.target);
      }

      log('Export legacy: preset blender · unitScale 100 · bakeSpaceTransform=false.');
    }

    const base = (state.target.fileName || 'target.fbx').replace(/\.fbx$/i, '');

    downloadBinaryFile(
      bytes,
      exportMode === 'clean'
        ? `${base}_retarget_clean.fbx`
        : exportMode === 'exact'
          ? `${base}_retarget_exact.fbx`
          : `${base}_retarget_legacy.fbx`
    );

    // In CLEAN mode the main export must deliver BOTH artifacts in one click:
    // 1) standalone FBX with baked DEF for visual verification
    // 2) original-rig Action carrier with controls only, DEF/helpers = 0
    if (exportMode === 'clean') {
      setStatus('Exportando 2/2 · Action para rig original…');
      const originalPkg = buildOriginalRigActionFbxPackage(rotationMode);

      downloadBinaryFile(
        originalPkg.bytes,
        `${base}_OriginalRig_Action.fbx`
      );

      log(
        `Segundo archivo generado automáticamente: ${base}_OriginalRig_Action.fbx · ` +
        `${originalPkg.action.tracks.length} tracks · DEF/helpers=0.`
      );
    }

    if ((exportMode === 'clean' || exportMode === 'exact') && $('downloadOriginalRigAction')?.checked) {
      const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
      const originalRigRotationMode =
        $('rotationMode')?.value === 'quaternion' ? 'quaternion' : 'xyz';
      const resumeTime = state.playTime;

      const script = buildBlenderActionScript(
        state.exportClip,
        state.target,
        fps,
        originalObjectName,
        originalRigRotationMode
      );

      const suffix =
        originalRigRotationMode === 'quaternion' ? 'Quaternion' : 'XYZ';

      downloadTextFile(
        script,
        `${base}_OriginalRig_${suffix}.py`,
        'text/x-python'
      );

      playTargetClip(state.targetPreviewClip);
      seek(resumeTime);

      log(
        `Action para el rig original descargada en ${suffix}. ` +
        'No reutilices en el CloudRig original la Action creada al importar el FBX.'
      );
    }

    playTargetClip(state.targetPreviewClip);
    state.exported = true;
    updateWorkflowUI();

    setStatus(
      exportMode === 'clean'
        ? 'FBX CLEAN + Action original exportados'
        : exportMode === 'exact'
          ? 'FBX exacto exportado'
          : 'FBX legacy exportado',
      'good'
    );

    log(
      `Export terminado: "${exportClip.name}" · ${exportClip.tracks.length} tracks · ` +
      `${exportMode === 'clean'
        ? 'FBX original + jerarquía FK compensada + DEF baked'
        : exportMode === 'exact'
          ? 'FBX original preservado'
          : 'FBX reconstruido'}.`
    );
  } catch (err) {
    console.error(err);
    setStatus('Error exportando FBX', 'bad');
    log(`ERROR export: ${err.message}`);
  }
}

function updateStats() {
  const sticky = $('exportStickyStatus');
  const workbench = $('exportWorkbenchStats');

  if (!state.exportClip) {
    $('stats').textContent = 'Sin retarget generado.';
    if (sticky) sticky.textContent = 'Sin retarget generado';
    if (workbench) workbench.textContent = 'Aún no hay una Action lista. Aplica Transfer primero.';
    return;
  }

  const fkBones = state.fkClip ? new Set(state.fkClip.tracks.map(t => t.name.split('.').slice(0, -1).join('.'))).size : 0;
  const ikBones = state.ikOnlyClip ? new Set(state.ikOnlyClip.tracks.map(t => t.name.split('.').slice(0, -1).join('.'))).size : 0;
  const defTracks = state.exportClip.tracks.filter(t => {
    const node = t.name.split('.').slice(0, -1).join('.');
    const bone = state.target.bones.get(node);
    const original = originalObjectName(bone) || node;
    return /^DEF-/i.test(original);
  }).length;

  const exportModeValue = $('exportMode')?.value || 'clean';
  const modeLabel = exportModeValue === 'clean'
    ? 'Clean · FK rejerarquizado + DEF baked'
    : exportModeValue === 'legacy'
      ? 'Legacy reconstruido'
      : 'Exacto · FBX original';
  const rotationLabel = $('rotationMode')?.value === 'quaternion' ? 'Quaternion WXYZ' : 'XYZ Euler';
  const defPreviewLabel = $('includeDefPreview')?.checked ? 'Sí · Action separada' : 'No';
  const summary = `Action: ${state.exportClip.name}\nDuración: ${state.exportClip.duration.toFixed(3)} s\nCurvas: ${state.exportClip.tracks.length}\nFK: ${fkBones}\nIK/POLE: ${ikBones}\nDEF en Action principal: ${defTracks}\nExport: ${modeLabel}\nRig original: ${rotationLabel}\nDEF Preview: ${defPreviewLabel}`;
  $('stats').textContent = summary;
  if (sticky) sticky.textContent = `${state.exportClip.name} · ${state.exportClip.duration.toFixed(2)} s`;
  if (workbench) workbench.textContent = summary;
}

function setMappingCollapsed(collapsed, remember = true) {
  const card = $('mappingCard');
  if (!card) return;

  const value = !!collapsed;
  card.classList.toggle('collapsed', value);

  if (remember && state.workspaceView === 'workspace') {
    state.workspaceMappingCollapsed = value;
  }

  const label = $('mappingToggleLabel');
  const icon = $('mappingToggleIcon');
  if (label) label.textContent = value ? 'Expandir' : 'Colapsar';
  if (icon) icon.textContent = value ? '⌄' : '⌃';
}

function resizeViewports() {
  for (const view of [sourceView, targetView]) {
    const w = Math.max(1, view.container.clientWidth);
    const h = Math.max(1, view.container.clientHeight);
    view.renderer.setSize(w, h, false);
    view.camera.aspect = w / h;
    view.camera.updateProjectionMatrix();
  }
}

function setWorkspaceView(view) {
  const allowed = new Set(['workspace', 'mappings', 'animations', 'export']);
  const next = allowed.has(view) ? view : 'workspace';
  state.workspaceView = next;

  const workspace = $('mainWorkspace');
  if (workspace) workspace.dataset.view = next;

  const shell = document.querySelector('.workspace-shell');
  const workflowSidebar = document.querySelector('.workflow-sidebar');
  const settingsPanel = document.querySelector('.settings-panel');
  const bridge = document.querySelector('.retarget-bridge');
  const mappingCard = $('mappingCard');
  const isAnimation = next === 'animations';

  shell?.classList.toggle('animations-focus', isAnimation);

  // No depender únicamente del CSS: ocultamos físicamente las zonas
  // que no pertenecen a cada mesa de trabajo.
  if (mappingCard) mappingCard.hidden = next !== 'mappings';
  if (workflowSidebar) workflowSidebar.hidden = isAnimation;
  if (settingsPanel) settingsPanel.hidden = isAnimation;
  if (bridge) bridge.hidden = isAnimation || next === 'export';

  document.querySelectorAll('[data-workspace]').forEach(button => {
    button.classList.toggle('active', button.dataset.workspace === next);
  });

  if (next === 'mappings') {
    if (mappingCard) mappingCard.hidden = false;
    setMappingCollapsed(false, false);
  } else if (next === 'workspace') {
    setMappingCollapsed(true, false);
  }

  requestAnimationFrame(() => {
    resizeViewports();
    requestAnimationFrame(resizeViewports);
  });
}

function setWorkflowStep(id, mode) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (mode) el.classList.add(mode);
}

function updateWorkflowUI() {
  const hasSource = !!state.source.root;
  const hasTarget = !!state.target.root;
  const valid = validMap().length;
  const total = state.boneMap.length;
  const percent = hasSource && hasTarget && total > 0 ? Math.round((valid / total) * 100) : 0;
  const mapReady = hasSource && hasTarget && valid > 0;

  const fill = $('mapProgressFill');
  const pct = $('mapPercent');
  const badge = $('compatibilityBadge');
  if (fill) fill.style.width = `${percent}%`;
  if (pct) pct.textContent = `${percent}%`;

  if (badge) {
    badge.classList.toggle('good', percent >= 90);
    badge.classList.toggle('pending', percent < 90);
    badge.textContent = !hasSource || !hasTarget
      ? 'Pendiente'
      : percent >= 90
        ? 'Compatible'
        : valid > 0
          ? 'Map parcial'
          : 'Sin map';
  }

  setWorkflowStep('stepSource', hasSource ? 'done' : 'active');
  setWorkflowStep('stepTarget', hasTarget ? 'done' : hasSource ? 'active' : null);
  setWorkflowStep('stepMap', state.fkClip ? 'done' : mapReady ? 'active' : null);
  setWorkflowStep('stepRetarget', state.fkClip ? 'done' : mapReady ? 'active' : null);
  setWorkflowStep('stepIk', state.ikOnlyClip ? 'done' : state.fkClip ? 'active' : null);
  setWorkflowStep('stepExport', state.exported ? 'done' : state.exportClip ? 'active' : null);
}

function updateButtons() {
  const ready = !!state.source.root && !!state.target.root && !!state.source.activeClip && validMap().length > 0;
  $('applyRetarget').disabled = !ready;
  $('convertIk').disabled = !state.fkClip || !supportsFkToIk();
  $('exportFbx').disabled = !state.exportClip;
  if ($('exportWorkspaceButton')) $('exportWorkspaceButton').disabled = !state.exportClip;
  if ($('exportBlenderAction')) $('exportBlenderAction').disabled = !state.exportClip;
  if ($('exportOriginalRigFbxAction')) $('exportOriginalRigFbxAction').disabled = !state.exportClip;
  updateWorkflowUI();
}

function updateTimelineBounds() {
  const duration = state.source.activeClip?.duration || state.exportClip?.duration || 0;
  $('timeline').max = String(Math.max(duration, 0.001));
  $('timeline').value = String(Math.min(state.playTime, duration || 0));
  $('timeReadout').textContent = `${state.playTime.toFixed(2)} / ${duration.toFixed(2)} s`;
}

function seek(time) {
  const duration = state.source.activeClip?.duration || state.targetPreviewClip?.duration || 0;
  state.playTime = THREE.MathUtils.clamp(time, 0, duration || 0);
  if (state.source.mixer && state.source.activeClip) state.source.mixer.setTime(state.playTime);
  if (state.target.mixer && state.targetPreviewClip) state.target.mixer.setTime(state.playTime);
  applyTargetRigRuntime();
  updateRigOverlays();
  $('timeline').value = String(state.playTime);
  $('timeReadout').textContent = `${state.playTime.toFixed(2)} / ${duration.toFixed(2)} s`;
}

function bindDropModule(module, input, handler, label) {
  let dragDepth = 0;

  const hasFiles = event =>
    event.dataTransfer &&
    Array.from(event.dataTransfer.types || []).includes('Files');

  module.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    module.classList.add('drag-import');
  });

  module.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    module.classList.add('drag-import');
  });

  module.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) module.classList.remove('drag-import');
  });

  module.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    module.classList.remove('drag-import');

    const files = [...e.dataTransfer.files];
    const file = files.find(f => /\.fbx$/i.test(f.name));

    if (!file) {
      log(`${label}: el archivo soltado no es FBX.`);
      setStatus('Solo se admiten FBX', 'bad');
      return;
    }

    handler(file);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handler(file);
    input.value = '';
  });
}

const loadSourceFile = file =>
  loadFbx(file, state.source, sourceView).catch(e => log(`ERROR Source: ${e.message}`));

const loadTargetFile = file =>
  loadFbx(file, state.target, targetView).catch(e => log(`ERROR Target: ${e.message}`));

// Todo el módulo es zona de drop: cabecera, viewport y footer.
bindDropModule($('sourceModule'), $('sourceFile'), loadSourceFile, 'Source');
bindDropModule($('targetModule'), $('targetFile'), loadTargetFile, 'Target');

$('sourceButton').onclick = () => $('sourceFile').click();
$('targetButton').onclick = () => $('targetFile').click();
$('fitSource').onclick = () => fitView(sourceView, state.source.displayRoot || state.source.root);
$('fitTarget').onclick = () => fitView(targetView, state.target.displayRoot || state.target.root);
$('sourceClip').onchange = () => setSourceClip(Number($('sourceClip').value));
$('loadPreset').onclick = () => void loadPreset();
$('preset').onchange = () => {
  state.activePresetId = $('preset').value;
  if (state.source.root && state.target.root && $('preset').value !== 'none') {
    void loadPreset();
  } else if ($('preset').value === 'none') {
    state.activePreset = null;
    state.boneMap = [];
    refreshMapUi();
  }
};
$('autoMatch').onclick = autoMatch;
$('addPair').onclick = () => {
  state.boneMap.push({ source: '', target: '' });
  refreshMapUi();
};
$('clearMap').onclick = () => {
  state.boneMap = [];
  refreshMapUi();
};
$('mapSearch').oninput = refreshMapUi;
$('sourcePrefix').onchange = () => {
  if ($('preset').value !== 'none' && state.source.root && state.target.root) void loadPreset();
};
$('targetPrefix').onchange = () => {
  if ($('preset').value !== 'none' && state.source.root && state.target.root) void loadPreset();
};
$('applyRetarget').onclick = applyRetarget;
$('convertIk').onclick = convertFkToIk;
$('exportFbx').onclick = exportTargetFbx;
$('exportWorkspaceButton').onclick = exportTargetFbx;
$('exportBlenderAction').onclick = exportBlenderXYZAction;
$('exportOriginalRigFbxAction').onclick = exportOriginalRigActionFbx;

$('exportMode')?.addEventListener('change', updateStats);
$('rotationMode')?.addEventListener('change', updateStats);
$('includeDefPreview')?.addEventListener('change', updateStats);

$('toggleMapping').onclick = () => {
  if (state.workspaceView === 'mappings') return;
  setMappingCollapsed(!$('mappingCard').classList.contains('collapsed'));
};

document.querySelectorAll('[data-workspace]').forEach(button => {
  button.onclick = () => setWorkspaceView(button.dataset.workspace);
});

document.querySelectorAll('[data-go-workspace]').forEach(step => {
  step.onclick = () => setWorkspaceView(step.dataset.goWorkspace);
});

$('keepFk').onchange = () => {
  if (!state.ikOnlyClip) return;
  state.exportClip = buildConvertedOutputClip($('keepFk').checked);
  state.exported = false;
  updateStats();
  updateWorkflowUI();
};

$('previewDeform').onchange = () => {
  applyTargetRigRuntime();
  updateRigOverlays();
};

$('showArmatures').onchange = () => {
  updateRigOverlays();
};

$('footMatch').onchange = () => {
  if (state.fkClip) {
    log('Foot Contact Match cambió: vuelve a pulsar Transfer para recalcular la Action.');
  }
};

function setTheme(theme, persist = true) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  if (persist) localStorage.setItem('retarget-theme', next);

  const icon = $('themeIcon');
  const toggle = $('themeToggle');
  if (icon) icon.textContent = next === 'dark' ? '☀' : '☾';
  if (toggle) toggle.title = next === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  applyViewportTheme(sourceView, next);
  applyViewportTheme(targetView, next);
}

$('themeToggle').onclick = () => {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
};

setTheme(currentTheme(), false);

$('playPause').onclick = () => {
  state.playing = !state.playing;
  $('playPause').textContent = state.playing ? 'Ⅱ' : '▶';
};
$('timeline').oninput = () => seek(Number($('timeline').value));
$('fps').onchange = () => {
  const v = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  $('fps').value = String(v);
};

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - state.lastFrame) / 1000, 0.1);
  state.lastFrame = now;
  const duration = state.source.activeClip?.duration || state.targetPreviewClip?.duration || 0;

  if (state.playing && duration > 0) {
    let t = state.playTime + dt;
    if (t > duration) t %= duration;
    seek(t);
  }

  applyTargetRigRuntime();
  updateRigOverlays();

  sourceView.controls.update();
  targetView.controls.update();
  sourceView.renderer.render(sourceView.scene, sourceView.camera);
  targetView.renderer.render(targetView.scene, targetView.camera);
}

setWorkspaceView('workspace');
setMappingCollapsed(true, false);
updateStats();
updateWorkflowUI();
requestAnimationFrame(animate);
log(`Retarget-to-play listo · WaltFBX v${WALT_FBX_VERSION}. Los FBX se procesan localmente en el navegador.`);
