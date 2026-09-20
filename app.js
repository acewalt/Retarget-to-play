import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { WaltFBXLoader, WALT_FBX_VERSION } from './walt-fbx-loader.js?v=20260920-rt2';
import { injectAnimationsIntoOriginalFBX } from './walt-fbx-exact-export.js?v=20260920-action3';
import { buildBlenderActionScript } from './blender-action-export.js?v=20260920-action3';

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

const CLOUDRIG_PRESET = [
  ['Hips', 'FK-Hips'],
  ['Spine', 'FK-Spine'],
  ['Spine2', 'FK-Chest'],
  ['Neck', 'FK-Neck'],
  ['Head', 'FK-Head'],
  ['LeftShoulder', 'FK-Shoulder.L'],
  ['LeftArm', 'FK-UpperArm.L'],
  ['LeftForeArm', 'FK-Forearm.L'],
  ['LeftHand', 'FK-Hand.L'],
  ['RightShoulder', 'FK-Shoulder.R'],
  ['RightArm', 'FK-UpperArm.R'],
  ['RightForeArm', 'FK-Forearm.R'],
  ['RightHand', 'FK-Hand.R'],
  ['LeftUpLeg', 'FK-Thigh.L'],
  ['LeftLeg', 'FK-Knee.L'],
  ['LeftFoot', 'FK-Foot.L'],
  ['LeftToeBase', 'FK-Toes.L'],
  ['RightUpLeg', 'FK-Thigh.R'],
  ['RightLeg', 'FK-Knee.R'],
  ['RightFoot', 'FK-Foot.R'],
  ['RightToeBase', 'FK-Toes.R']
];

const state = {
  source: makeSlot('source'),
  target: makeSlot('target'),
  boneMap: [],
  fkClip: null,
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
      worldQuat: bone.getWorldQuaternion(new THREE.Quaternion())
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

  state.fkClip = state.ikOnlyClip = state.deformPreviewClip = state.exportClip = state.targetPreviewClip = null;
  state.exported = false;
  refreshMapUi();
  updateButtons();
  updateTimelineBounds();
  setStatus('LOCAL · sin subida', 'good');

  if (state.source.root && state.target.root && $('preset').value === 'cloudrig-sintel') loadPreset();
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

function loadPreset() {
  if (!state.source.root || !state.target.root) {
    log('Preset pendiente: primero carga Source y Target.');
    return;
  }
  if ($('preset').value !== 'cloudrig-sintel') return;
  state.boneMap = CLOUDRIG_PRESET.map(([s, t]) => ({
    source: findSemanticBone(state.source, s) || '',
    target: findSemanticBone(state.target, t) || ''
  })).filter(p => p.source || p.target);
  refreshMapUi();
  log(`Preset Mixamo → CloudRig cargado: ${state.boneMap.length} pares.`);
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
  return !!pair.source && !!pair.target && state.source.bones.has(pair.source) && state.target.bones.has(pair.target);
}

function validMap() {
  const seenTarget = new Set();
  return state.boneMap.filter(p => {
    if (!isPairValid(p) || seenTarget.has(p.target)) return false;
    seenTarget.add(p.target);
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
  const targetUseCount = new Map();
  state.boneMap.forEach(p => targetUseCount.set(p.target, (targetUseCount.get(p.target) || 0) + 1));

  state.boneMap.forEach((pair, index) => {
    if (q && !`${pair.source} ${pair.target}`.toLowerCase().includes(q)) return;
    const duplicate = pair.target && targetUseCount.get(pair.target) > 1;
    const row = document.createElement('div');
    row.className = `map-row ${(!isPairValid(pair) || duplicate) ? 'invalid' : ''}`;

    const s = document.createElement('select');
    s.append(new Option('— Source —', ''));
    sourceNames.forEach(n => s.add(new Option(originalObjectName(state.source.bones.get(n)) || n, n)));
    s.value = pair.source;
    s.onchange = () => { state.boneMap[index].source = s.value; refreshMapUi(); updateButtons(); };

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

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

function bakeRetarget(map, clipName, { rootMotion = true } = {}) {
  const src = state.source;
  const tgt = state.target;
  const clip = src.activeClip;
  if (!clip) throw new Error('El Source no tiene una Action activa.');

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = Array.from({ length: frameCount }, (_, i) => Math.min(clip.duration, i / fps));
  const torsoScale = $('autoScale').checked ? skeletonScaleFor(map) : 1;
  const motionScale = $('autoScale').checked ? rootMotionScaleFor(map, torsoScale) : 1;
  const ordered = [...map].sort(
    (a, b) => boneDepth(tgt.bones.get(a.target)) - boneDepth(tgt.bones.get(b.target))
  );

  const data = new Map();
  for (const p of ordered) data.set(p.target, { q: [] });

  const sourceHipsName =
    ordered.find(p => /hips$/i.test(originalObjectName(src.bones.get(p.source)) || p.source))?.source ||
    findSemanticBone(src, 'Hips');

  const motionCarrierName =
    findBoneByOriginalExact(tgt, ['TORSO-Spine']) ||
    findBoneByOriginalExact(tgt, ['root']) ||
    null;

  const motionCarrier = motionCarrierName ? tgt.bones.get(motionCarrierName) : null;
  const motionRest = motionCarrierName ? tgt.rest.get(motionCarrierName) : null;
  const motionPositions = [];

  const qSrc = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  const qDesired = new THREE.Quaternion();
  const qParent = new THREE.Quaternion();
  const qLocal = new THREE.Quaternion();

  const srcPos = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const localPos = new THREE.Vector3();

  if (!src.mixer) {
    src.mixer = new THREE.AnimationMixer(src.root);
    src.action = src.mixer.clipAction(clip).play();
  }

  for (const time of times) {
    restoreRest(src);
    src.mixer.setTime(time);
    updateSlotWorld(src);
    restoreRest(tgt);

    if (rootMotion && sourceHipsName && motionCarrier && motionRest) {
      const sourceHips = src.bones.get(sourceHipsName);
      const sourceHipsRest = src.rest.get(sourceHipsName);

      if (sourceHips && sourceHipsRest) {
        sourceHips.getWorldPosition(srcPos);

        const targetDeltaWorld = srcPos.clone()
          .sub(sourceHipsRest.worldPos)
          .multiplyScalar(motionScale);

        desiredPos.copy(motionRest.worldPos).add(targetDeltaWorld);
        localPos.copy(desiredPos);

        if (motionCarrier.parent) motionCarrier.parent.worldToLocal(localPos);

        motionCarrier.position.copy(localPos);
        motionCarrier.quaternion.copy(motionRest.quaternion);
        motionCarrier.scale.copy(motionRest.scale);
        updateSlotWorld(tgt);

        motionPositions.push(
          motionCarrier.position.x,
          motionCarrier.position.y,
          motionCarrier.position.z
        );
      }
    }

    for (const pair of ordered) {
      const sb = src.bones.get(pair.source);
      const tb = tgt.bones.get(pair.target);
      const sr = src.rest.get(pair.source);
      const tr = tgt.rest.get(pair.target);
      if (!sb || !tb || !sr || !tr) continue;

      sb.getWorldQuaternion(qSrc);

      qDelta.copy(qSrc)
        .multiply(sr.worldQuat.clone().invert())
        .normalize();

      qDesired.copy(qDelta)
        .multiply(tr.worldQuat)
        .normalize();

      if (tb.parent) {
        tb.parent.getWorldQuaternion(qParent);
        qLocal.copy(qParent)
          .invert()
          .multiply(qDesired)
          .normalize();
      } else {
        qLocal.copy(qDesired);
      }

      tb.position.copy(tr.position);
      tb.quaternion.copy(qLocal);
      tb.scale.copy(tr.scale);
      updateSlotWorld(tgt);

    }

    // End-effector correction for feet. This pass keeps the source foot
    // trajectory/contact while preserving FK controls as the actual output.
    applyFootContactCorrection(src, tgt, 'L', motionScale);
    applyFootContactCorrection(src, tgt, 'R', motionScale);

    for (const pair of ordered) {
      const bone = tgt.bones.get(pair.target);
      const d = data.get(pair.target);
      if (!bone || !d) continue;
      d.q.push(
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w
      );
    }
  }

  restoreRest(src);
  restoreRest(tgt);

  const tracks = [];
  for (const [targetName, d] of data) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, times, d.q)
    );
  }

  if (motionCarrierName && motionPositions.length === times.length * 3) {
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${motionCarrierName}.position`,
        times,
        motionPositions
      )
    );
  }

  log(
    `Root motion: Source Hips → ${motionCarrierName ? originalObjectName(motionCarrier) || motionCarrierName : 'sin carrier'}; ` +
    `FK-Hips queda como control pélvico.`
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

    state.fkClip = bakeRetarget(map, 'Retargeted_FK');
    state.ikOnlyClip = null;
    state.exportClip = state.fkClip;
    state.exported = false;

    // No horneamos DEF. WaltRig Runtime reproduce en tiempo real dentro
    // del navegador la relación FK -> DEF que el FBX no contiene.
    state.deformPreviewClip = null;
    state.targetPreviewClip = state.fkClip;
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
    setStatus('Error de retarget', 'bad');
    log(`ERROR Retarget: ${err.message}`);
  }
}

function worldToLocalPoint(object, point) {
  const out = point.clone();
  if (object.parent) object.parent.worldToLocal(out);
  return out;
}

function desiredControlQuaternion(driverBone, controlBone) {
  const dr = state.target.rest.get(driverBone.name);
  const cr = state.target.rest.get(controlBone.name);
  const qCur = driverBone.getWorldQuaternion(new THREE.Quaternion());
  const delta = qCur.multiply(dr.worldQuat.clone().invert()).normalize();
  const desiredWorld = delta.multiply(cr.worldQuat).normalize();
  if (!controlBone.parent) return desiredWorld;
  const parentQ = controlBone.parent.getWorldQuaternion(new THREE.Quaternion());
  return parentQ.invert().multiply(desiredWorld).normalize();
}

function desiredControlPosition(driverBone, controlBone) {
  const dr = state.target.rest.get(driverBone.name);
  const cr = state.target.rest.get(controlBone.name);
  const cur = driverBone.getWorldPosition(new THREE.Vector3());
  const desiredWorld = cr.worldPos.clone().add(cur.sub(dr.worldPos));
  return worldToLocalPoint(controlBone, desiredWorld);
}

function computePolePoint(a, b, c, poleBone) {
  const pa = a.getWorldPosition(new THREE.Vector3());
  const pb = b.getWorldPosition(new THREE.Vector3());
  const pc = c.getWorldPosition(new THREE.Vector3());
  const ac = pc.clone().sub(pa);
  const t = THREE.MathUtils.clamp(pb.clone().sub(pa).dot(ac) / Math.max(ac.lengthSq(), 1e-8), 0, 1);
  const proj = pa.clone().addScaledVector(ac, t);
  let dir = pb.clone().sub(proj);

  const bRest = state.target.rest.get(b.name).worldPos;
  const poleRest = state.target.rest.get(poleBone.name).worldPos;
  const restDir = poleRest.clone().sub(bRest);
  const restDist = Math.max(restDir.length(), pa.distanceTo(pb) + pb.distanceTo(pc));
  restDir.normalize();

  if (dir.lengthSq() < 1e-8) dir.copy(restDir);
  else dir.normalize();
  if (dir.dot(restDir) < 0) dir.negate();
  return pb.addScaledVector(dir, restDist);
}

function bakeIkFromFk() {
  if (!state.fkClip) throw new Error('Primero aplica el retargeting FK.');
  const tgt = state.target;
  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(state.fkClip.duration * fps) + 1);
  const times = Array.from({ length: frameCount }, (_, i) => Math.min(state.fkClip.duration, i / fps));

  const chainDefs = [
    { a: 'FK-UpperArm.L', b: 'FK-Forearm.L', c: 'FK-Hand.L', ik: 'IK-Hand.L', pole: 'POLE-Arm.L' },
    { a: 'FK-UpperArm.R', b: 'FK-Forearm.R', c: 'FK-Hand.R', ik: 'IK-Hand.R', pole: 'POLE-Arm.R' },
    { a: 'FK-Thigh.L', b: 'FK-Knee.L', c: 'FK-Foot.L', ik: 'IK-Foot.L', pole: 'POLE-Leg.L' },
    { a: 'FK-Thigh.R', b: 'FK-Knee.R', c: 'FK-Foot.R', ik: 'IK-Foot.R', pole: 'POLE-Leg.R' }
  ];

  const chains = chainDefs.map(def => {
    const resolved = {};
    for (const key of ['a', 'b', 'c', 'ik', 'pole']) {
      const runtimeName = findBoneByOriginalExact(tgt, [def[key]]);
      if (!runtimeName) return null;
      resolved[key] = runtimeName;
    }
    return resolved;
  }).filter(Boolean);

  if (!chains.length) throw new Error('No encontré cadenas FK/IK CloudRig compatibles en el Target.');

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();
  tgt.mixer = new THREE.AnimationMixer(tgt.root);
  const action = tgt.mixer.clipAction(state.fkClip).play();
  const data = new Map();

  for (const chain of chains) {
    data.set(chain.ik, { p: [], q: [], s: [] });
    data.set(chain.pole, { p: [], q: [], s: [] });
  }

  for (const time of times) {
    restoreRest(tgt);
    tgt.mixer.setTime(time);
    updateSlotWorld(tgt);

    for (const chain of chains) {
      const a = tgt.bones.get(chain.a);
      const b = tgt.bones.get(chain.b);
      const c = tgt.bones.get(chain.c);
      const ik = tgt.bones.get(chain.ik);
      const pole = tgt.bones.get(chain.pole);

      ik.position.copy(desiredControlPosition(c, ik));
      ik.quaternion.copy(desiredControlQuaternion(c, ik));
      ik.scale.copy(tgt.rest.get(ik.name).scale);
      updateSlotWorld(tgt);

      const poleWorld = computePolePoint(a, b, c, pole);
      pole.position.copy(worldToLocalPoint(pole, poleWorld));
      pole.quaternion.copy(tgt.rest.get(pole.name).quaternion);
      pole.scale.copy(tgt.rest.get(pole.name).scale);
      updateSlotWorld(tgt);

      const id = data.get(chain.ik);
      id.p.push(ik.position.x, ik.position.y, ik.position.z);
      id.q.push(ik.quaternion.x, ik.quaternion.y, ik.quaternion.z, ik.quaternion.w);
      id.s.push(ik.scale.x, ik.scale.y, ik.scale.z);

      const pd = data.get(chain.pole);
      pd.p.push(pole.position.x, pole.position.y, pole.position.z);
      pd.q.push(pole.quaternion.x, pole.quaternion.y, pole.quaternion.z, pole.quaternion.w);
      pd.s.push(pole.scale.x, pole.scale.y, pole.scale.z);
    }
  }

  action.stop();
  restoreRest(tgt);

  const tracks = [];
  for (const [name, d] of data) {
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, d.p));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, d.q));
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, d.s));
  }
  return new THREE.AnimationClip('Retargeted_IK', state.fkClip.duration, tracks);
}

function convertFkToIk() {
  try {
    setStatus('Baking FK → IK…');
    state.ikOnlyClip = bakeIkFromFk();
    state.exportClip = $('keepFk').checked
      ? mergeClips('Retargeted_FK_IK', [state.fkClip, state.ikOnlyClip])
      : state.ikOnlyClip;
    state.exported = false;
    state.targetPreviewClip = mergeClips('Preview_FK_IK', [state.fkClip, state.ikOnlyClip]);
    playTargetClip(state.targetPreviewClip);
    updateButtons();
    updateStats();
    setStatus('FK → IK listo', 'good');
    log(`FK → IK generado: ${state.ikOnlyClip.tracks.length} curvas para manos/pies IK y poles.`);
  } catch (err) {
    console.error(err);
    setStatus('Error FK → IK', 'bad');
    log(`ERROR FK→IK: ${err.message}`);
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

async function exportTargetFbx() {
  if (!state.target.root || !state.exportClip) return;

  try {
    setStatus('Exportando FBX…');

    const exportClip = createOriginalNameExportClip(state.exportClip, state.target);
    const exportMode = $('exportMode')?.value || 'exact';
    const rotationMode = $('rotationMode')?.value || 'xyz';

    let bytes;
    let report = null;

    if (exportMode === 'exact') {
      const exactActions = [
        {
          clip: exportClip,
          actionName: exportClip.name || 'Retargeted_FK'
        }
      ];

      let currentActionName = exportClip.name || 'Retargeted_FK';

      if ($('includeDefPreview')?.checked) {
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

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (state.target.fileName || 'target.fbx').replace(/\.fbx$/i, '');

    a.href = url;
    a.download = exportMode === 'exact'
      ? `${base}_retarget_exact.fbx`
      : `${base}_retarget_legacy.fbx`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (exportMode === 'exact' && $('downloadOriginalRigAction')?.checked) {
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
      exportMode === 'exact' ? 'FBX exacto exportado' : 'FBX legacy exportado',
      'good'
    );

    log(
      `Export terminado: "${exportClip.name}" · ${exportClip.tracks.length} tracks · ` +
      `${exportMode === 'exact' ? 'FBX original preservado' : 'FBX reconstruido'}.`
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

  const modeLabel = $('exportMode')?.value === 'legacy' ? 'Legacy reconstruido' : 'Exacto · FBX original';
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
  $('convertIk').disabled = !state.fkClip;
  $('exportFbx').disabled = !state.exportClip;
  if ($('exportWorkspaceButton')) $('exportWorkspaceButton').disabled = !state.exportClip;
  if ($('exportBlenderAction')) $('exportBlenderAction').disabled = !state.exportClip;
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
$('loadPreset').onclick = loadPreset;
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
$('sourcePrefix').onchange = () => $('preset').value === 'cloudrig-sintel' && loadPreset();
$('targetPrefix').onchange = () => $('preset').value === 'cloudrig-sintel' && loadPreset();
$('applyRetarget').onclick = applyRetarget;
$('convertIk').onclick = convertFkToIk;
$('exportFbx').onclick = exportTargetFbx;
$('exportWorkspaceButton').onclick = exportTargetFbx;
$('exportBlenderAction').onclick = exportBlenderXYZAction;

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
  state.exportClip = $('keepFk').checked
    ? mergeClips('Retargeted_FK_IK', [state.fkClip, state.ikOnlyClip])
    : state.ikOnlyClip;
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
