import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';

const $ = (id) => document.getElementById(id);
const fbxLoader = new FBXLoader();

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

const PREVIEW_DEFORM_PRESET = [
  ['Hips', 'Hips'],
  ['Spine', 'Spine'],
  ['Spine2', 'Chest'],
  ['Neck', 'Neck'],
  ['Head', 'Head'],
  ['LeftShoulder', 'Shoulder.L'],
  ['LeftArm', 'UpperArm.L'],
  ['LeftForeArm', 'Forearm.L'],
  ['LeftHand', 'Hand.L'],
  ['RightShoulder', 'Shoulder.R'],
  ['RightArm', 'UpperArm.R'],
  ['RightForeArm', 'Forearm.R'],
  ['RightHand', 'Hand.R'],
  ['LeftUpLeg', 'Thigh.L'],
  ['LeftLeg', 'Knee.L'],
  ['LeftFoot', 'Foot.L'],
  ['LeftToeBase', 'Toes.L'],
  ['RightUpLeg', 'Thigh.R'],
  ['RightLeg', 'Knee.R'],
  ['RightFoot', 'Foot.R'],
  ['RightToeBase', 'Toes.R']
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
  cameraSyncLock: false
};

function makeSlot(kind) {
  return {
    kind,
    fileName: '',
    root: null,
    bones: new Map(),
    rest: new Map(),
    animations: [],
    mixer: null,
    action: null,
    activeClip: null,
    helper: null
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

function createViewport(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1217);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
  camera.position.set(3, 2, 5);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  const grid = new THREE.GridHelper(20, 20, 0x28343e, 0x1b242c);
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
  return { scene, camera, renderer, controls, container };
}

const sourceView = createViewport($('sourceViewport'));
const targetView = createViewport($('targetViewport'));

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

function captureRest(slot) {
  slot.root.updateMatrixWorld(true);
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
  slot.root.updateMatrixWorld(true);
}

function disposeObject(root) {
  root?.traverse((o) => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
    else o.material?.dispose?.();
  });
}

function clearSlot(slot, view) {
  if (slot.action) slot.action.stop();
  if (slot.mixer) slot.mixer.stopAllAction();
  if (slot.helper) view.scene.remove(slot.helper);
  if (slot.root) {
    view.scene.remove(slot.root);
    disposeObject(slot.root);
  }
  Object.assign(slot, makeSlot(slot.kind));
}

async function loadFbx(file, slot, view) {
  setStatus(`Leyendo ${file.name}…`);
  const buffer = await file.arrayBuffer();
  const root = fbxLoader.parse(buffer, '');
  const loadedAnimations = [...(root.animations || [])];

  clearSlot(slot, view);
  slot.fileName = file.name;
  slot.root = root;
  slot.bones = collectBones(root);
  slot.animations = slot.kind === 'source' ? loadedAnimations : [];
  root.animations = slot.kind === 'source' ? loadedAnimations : [];
  view.scene.add(root);

  slot.helper = new THREE.SkeletonHelper(root);
  slot.helper.material.depthTest = false;
  slot.helper.material.transparent = true;
  slot.helper.material.opacity = 0.55;
  view.scene.add(slot.helper);

  captureRest(slot);
  fitView(view, root);

  if (slot.kind === 'source') {
    $('sourceLabel').textContent = `${file.name} · ${slot.bones.size} huesos`;
    fillSourceClips();
    const inferred = inferPrefix(slot);
    if (inferred) $('sourcePrefix').value = inferred;
    log(`Source cargado: ${file.name}; ${slot.bones.size} huesos; ${loadedAnimations.length} Actions.`);
  } else {
    $('targetLabel').textContent = `${file.name} · ${slot.bones.size} huesos`;
    $('targetAnimNotice').textContent = loadedAnimations.length
      ? `Target cargado con ${loadedAnimations.length} Action(s): se ignoraron y no se reutilizarán.`
      : 'Target sin Actions de entrada. Correcto.';
    log(`Target cargado: ${file.name}; ${slot.bones.size} huesos. Actions de entrada descartadas: ${loadedAnimations.length}.`);
  }

  state.fkClip = state.ikOnlyClip = state.deformPreviewClip = state.exportClip = state.targetPreviewClip = null;
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
  const hipPair = map.find(p => /hips$/i.test(p.source.replace(/^.*:/, '')));
  if (!hipPair) return 1;
  const srcHead = findSemanticBone(state.source, 'Head');
  const tgtHead = map.find(p => /FK-Head$/i.test(p.target))?.target || findSemanticBone(state.target, 'Head');
  if (!srcHead || !tgtHead) return 1;

  const sHip = state.source.rest.get(hipPair.source)?.worldPos;
  const sHead = state.source.rest.get(srcHead)?.worldPos;
  const tHip = state.target.rest.get(hipPair.target)?.worldPos;
  const tHead = state.target.rest.get(tgtHead)?.worldPos;
  if (!sHip || !sHead || !tHip || !tHead) return 1;

  const sd = sHip.distanceTo(sHead);
  const td = tHip.distanceTo(tHead);
  return sd > 1e-6 && td > 1e-6 ? td / sd : 1;
}

function buildResolvedPreset(preset) {
  return preset.map(([s, t]) => ({
    source: findSemanticBone(state.source, s) || '',
    target: findSemanticBone(state.target, t) || ''
  })).filter(isPairValid);
}

function bakeRetarget(map, clipName, { rootMotion = true } = {}) {
  const src = state.source;
  const tgt = state.target;
  const clip = src.activeClip;
  if (!clip) throw new Error('El Source no tiene una Action activa.');

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(clip.duration * fps) + 1);
  const times = Array.from({ length: frameCount }, (_, i) => Math.min(clip.duration, i / fps));
  const scale = $('autoScale').checked ? skeletonScaleFor(map) : 1;
  const ordered = [...map].sort((a, b) => boneDepth(tgt.bones.get(a.target)) - boneDepth(tgt.bones.get(b.target)));
  const data = new Map();
  for (const p of ordered) data.set(p.target, { q: [], p: [], s: [] });

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
    src.root.updateMatrixWorld(true);
    restoreRest(tgt);

    for (const pair of ordered) {
      const sb = src.bones.get(pair.source);
      const tb = tgt.bones.get(pair.target);
      const sr = src.rest.get(pair.source);
      const tr = tgt.rest.get(pair.target);
      if (!sb || !tb || !sr || !tr) continue;

      sb.getWorldQuaternion(qSrc);
      qDelta.copy(qSrc).multiply(sr.worldQuat.clone().invert()).normalize();
      qDesired.copy(qDelta).multiply(tr.worldQuat).normalize();

      if (tb.parent) {
        tb.parent.getWorldQuaternion(qParent);
        qLocal.copy(qParent).invert().multiply(qDesired).normalize();
      } else {
        qLocal.copy(qDesired);
      }
      tb.quaternion.copy(qLocal);

      const isRootMotion = rootMotion && /hips$/i.test(pair.source.replace(/^.*:/, ''));
      if (isRootMotion) {
        sb.getWorldPosition(srcPos);
        desiredPos.copy(tr.worldPos).add(srcPos.clone().sub(sr.worldPos).multiplyScalar(scale));
        if (tb.parent) {
          localPos.copy(desiredPos);
          tb.parent.worldToLocal(localPos);
          tb.position.copy(localPos);
        } else {
          tb.position.copy(desiredPos);
        }
      } else {
        tb.position.copy(tr.position);
      }
      tb.scale.copy(tr.scale);
      tgt.root.updateMatrixWorld(true);

      const d = data.get(pair.target);
      d.q.push(tb.quaternion.x, tb.quaternion.y, tb.quaternion.z, tb.quaternion.w);
      d.p.push(tb.position.x, tb.position.y, tb.position.z);
      d.s.push(tb.scale.x, tb.scale.y, tb.scale.z);
    }
  }

  restoreRest(src);
  restoreRest(tgt);

  const tracks = [];
  for (const [targetName, d] of data) {
    tracks.push(new THREE.VectorKeyframeTrack(`${targetName}.position`, times, d.p));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, times, d.q));
    tracks.push(new THREE.VectorKeyframeTrack(`${targetName}.scale`, times, d.s));
  }
  return new THREE.AnimationClip(clipName, clip.duration, tracks);
}

function mergeClips(name, clips) {
  const usable = clips.filter(Boolean);
  const duration = Math.max(...usable.map(c => c.duration), 0);
  return new THREE.AnimationClip(name, duration, usable.flatMap(c => c.tracks.map(t => t.clone())));
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
}

function applyRetarget() {
  try {
    setStatus('Calculando retarget FK…');
    const map = validMap();
    if (!map.length) throw new Error('No hay pares válidos en el Bone Map.');

    state.fkClip = bakeRetarget(map, 'Retargeted_FK');
    state.ikOnlyClip = null;
    state.exportClip = state.fkClip;

    if ($('previewDeform').checked) {
      const previewMap = buildResolvedPreset(PREVIEW_DEFORM_PRESET);
      state.deformPreviewClip = previewMap.length ? bakeRetarget(previewMap, 'Retargeted_Preview_Deform') : null;
    } else {
      state.deformPreviewClip = null;
    }

    state.targetPreviewClip = mergeClips('Preview_FK', [state.fkClip, state.deformPreviewClip]);
    playTargetClip(state.targetPreviewClip);
    state.playTime = 0;
    updateTimelineBounds();
    updateButtons();
    updateStats();
    setStatus('Retarget FK listo', 'good');
    log(`Retarget FK generado: ${map.length} huesos mapeados, ${state.fkClip.tracks.length} curvas TRS, ${Number($('fps').value) || 30} FPS.`);
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

  const chains = [
    { a: 'FK-UpperArm.L', b: 'FK-Forearm.L', c: 'FK-Hand.L', ik: 'IK-Hand.L', pole: 'POLE-Arm.L' },
    { a: 'FK-UpperArm.R', b: 'FK-Forearm.R', c: 'FK-Hand.R', ik: 'IK-Hand.R', pole: 'POLE-Arm.R' },
    { a: 'FK-Thigh.L', b: 'FK-Knee.L', c: 'FK-Foot.L', ik: 'IK-Foot.L', pole: 'POLE-Leg.L' },
    { a: 'FK-Thigh.R', b: 'FK-Knee.R', c: 'FK-Foot.R', ik: 'IK-Foot.R', pole: 'POLE-Leg.R' }
  ].filter(c => [c.a, c.b, c.c, c.ik, c.pole].every(n => tgt.bones.has(n)));

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
    tgt.root.updateMatrixWorld(true);

    for (const chain of chains) {
      const a = tgt.bones.get(chain.a);
      const b = tgt.bones.get(chain.b);
      const c = tgt.bones.get(chain.c);
      const ik = tgt.bones.get(chain.ik);
      const pole = tgt.bones.get(chain.pole);

      ik.position.copy(desiredControlPosition(c, ik));
      ik.quaternion.copy(desiredControlQuaternion(c, ik));
      ik.scale.copy(tgt.rest.get(ik.name).scale);
      tgt.root.updateMatrixWorld(true);

      const poleWorld = computePolePoint(a, b, c, pole);
      pole.position.copy(worldToLocalPoint(pole, poleWorld));
      pole.quaternion.copy(tgt.rest.get(pole.name).quaternion);
      pole.scale.copy(tgt.rest.get(pole.name).scale);
      tgt.root.updateMatrixWorld(true);

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
    state.targetPreviewClip = mergeClips('Preview_FK_IK', [state.fkClip, state.ikOnlyClip, state.deformPreviewClip]);
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

async function exportTargetFbx() {
  if (!state.target.root || !state.exportClip) return;
  try {
    setStatus('Exportando FBX…');
    state.target.mixer?.stopAllAction();
    restoreRest(state.target);
    const oldAnimations = state.target.root.animations;
    const exportClip = createOriginalNameExportClip(state.exportClip, state.target);
    const restoreRuntimeNames = temporarilyRestoreOriginalNames(state.target.root);
    state.target.root.animations = [exportClip];

    const exporter = new FBXExporter();
    const options = {
      preset: 'blender',
      version: 7400,
      fps: Math.max(1, Math.min(120, Number($('fps').value) || 30)),
      includeAnimations: true,
      animations: [exportClip],
      embedTextures: true,
      customProperties: true,
      creator: 'Retarget-to-play'
    };

    let bytes;
    try {
      try {
        bytes = await exporter.parseAsync(state.target.root, options);
      } catch (textureErr) {
        log(`Export con texturas embebidas falló (${textureErr.message}). Reintentando sin embeber texturas…`);
        bytes = await exporter.parseAsync(state.target.root, { ...options, embedTextures: false });
      }
    } finally {
      state.target.root.animations = oldAnimations;
      restoreRuntimeNames();
    }

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (state.target.fileName || 'target.fbx').replace(/\.fbx$/i, '');
    a.href = url;
    a.download = `${base}_retargeted.fbx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    playTargetClip(state.targetPreviewClip);
    setStatus('FBX exportado', 'good');
    log(`FBX exportado conservando los nombres originales del Target y Action "${exportClip.name}" (${exportClip.tracks.length} curvas).`);
  } catch (err) {
    console.error(err);
    setStatus('Error exportando FBX', 'bad');
    log(`ERROR export: ${err.message}`);
  }
}

function updateStats() {
  if (!state.exportClip) {
    $('stats').textContent = 'Sin retarget generado.';
    return;
  }
  const fkBones = state.fkClip ? new Set(state.fkClip.tracks.map(t => t.name.split('.').slice(0, -1).join('.'))).size : 0;
  const ikBones = state.ikOnlyClip ? new Set(state.ikOnlyClip.tracks.map(t => t.name.split('.').slice(0, -1).join('.'))).size : 0;
  $('stats').textContent = `Action salida: ${state.exportClip.name}\nDuración: ${state.exportClip.duration.toFixed(3)} s\nCurvas: ${state.exportClip.tracks.length}\nHuesos FK animados: ${fkBones}\nControles IK/POLE animados: ${ikBones}`;
}

function updateButtons() {
  const ready = !!state.source.root && !!state.target.root && !!state.source.activeClip && validMap().length > 0;
  $('applyRetarget').disabled = !ready;
  $('convertIk').disabled = !state.fkClip;
  $('exportFbx').disabled = !state.exportClip;
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
  $('timeline').value = String(state.playTime);
  $('timeReadout').textContent = `${state.playTime.toFixed(2)} / ${duration.toFixed(2)} s`;
}

function bindDropZone(zone, input, handler) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag');
    const file = [...e.dataTransfer.files].find(f => /\.fbx$/i.test(f.name));
    if (file) handler(file);
  });
  input.addEventListener('change', () => input.files[0] && handler(input.files[0]));
}

bindDropZone($('sourceDrop'), $('sourceFile'), file => loadFbx(file, state.source, sourceView).catch(e => log(`ERROR Source: ${e.message}`)));
bindDropZone($('targetDrop'), $('targetFile'), file => loadFbx(file, state.target, targetView).catch(e => log(`ERROR Target: ${e.message}`)));

$('sourceButton').onclick = () => $('sourceFile').click();
$('targetButton').onclick = () => $('targetFile').click();
$('fitSource').onclick = () => fitView(sourceView, state.source.root);
$('fitTarget').onclick = () => fitView(targetView, state.target.root);
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

$('keepFk').onchange = () => {
  if (!state.ikOnlyClip) return;
  state.exportClip = $('keepFk').checked
    ? mergeClips('Retargeted_FK_IK', [state.fkClip, state.ikOnlyClip])
    : state.ikOnlyClip;
  updateStats();
};

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

  sourceView.controls.update();
  targetView.controls.update();
  sourceView.renderer.render(sourceView.scene, sourceView.camera);
  targetView.renderer.render(targetView.scene, targetView.camera);
}

requestAnimationFrame(animate);
log('Retarget-to-play listo. Los FBX se procesan localmente en el navegador.');
