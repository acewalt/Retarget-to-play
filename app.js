import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { WaltFBXLoader, WALT_FBX_VERSION } from './walt-fbx-loader.js?v=20260922-restoverlay2';
import { injectAnimationsIntoOriginalFBX, rewriteTargetActionsToBindRest } from './walt-fbx-exact-export.js?v=20260921-restgizmo2';
import { buildBlenderActionScript } from './blender-action-export.js?v=20260920-preview1';

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
  mixamo_to_ue: {
    label: 'Mixamo → UE',
    path: './presets/mixamo_to_ue.json',
    sourceFamily: 'mixamo',
    targetFamily: 'ue'
  },
  ue_to_mixamo: {
    label: 'UE → Mixamo',
    path: './presets/ue_to_mixamo.json',
    sourceFamily: 'ue',
    targetFamily: 'mixamo'
  },
  ue_to_cloudrig: {
    label: 'UE → CloudRig / Sintel',
    path: './presets/ue_to_cloudrig.json',
    sourceFamily: 'ue',
    targetFamily: 'cloudrig'
  },
  ue_to_rigify: {
    label: 'UE → Rigify',
    path: './presets/ue_to_rigify.json',
    sourceFamily: 'ue',
    targetFamily: 'rigify'
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

function usesMixamoControlRigPipeline() {
  return (
    state.activePreset?.targetFamily === 'mixamo-ctrl' &&
    targetLooksMixamoControlRig()
  );
}

function usesAutoRigProPipeline() {
  return (
    state.activePreset?.targetFamily === 'arp' &&
    targetLooksAutoRigPro()
  );
}

function usesUeToAutoRigProPipeline() {
  return (
    usesAutoRigProPipeline() &&
    state.activePreset?.sourceFamily === 'ue' &&
    state.activePresetId === 'ue_to_arp'
  );
}

function usesEmbeddedDeformControlRigPipeline() {
  return usesMixamoControlRigPipeline() || usesAutoRigProPipeline();
}

function supportsFkToIk() {
  return (
    usesCloudRigPipeline() ||
    usesRigifyPipeline() ||
    usesMixamoControlRigPipeline() ||
    usesAutoRigProPipeline()
  );
}

function sourceLooksBlendCap() {
  const src = state.source;
  if (!src?.root) return false;

  return !!(
    findBoneByOriginalExact(src, ['LeftBrow']) &&
    findBoneByOriginalExact(src, ['RightBrow']) &&
    findBoneByOriginalExact(src, ['LeftEye']) &&
    findBoneByOriginalExact(src, ['RightEye'])
  );
}

function targetLooksAutoRigPro() {
  const tgt = state.target;
  if (!tgt?.root) return false;

  const has = (...names) =>
    !!findBoneByOriginalExact(tgt, names);

  // Auto-Rig Pro exported FBX keeps both animator controls (c_*) and its
  // driven/deform hierarchy. WaltFBX can therefore classify it generically.
  // Detect ARP from the control signature instead of the generic profile.
  const bodyControls =
    has('c_pos') &&
    has('c_root_master.x') &&
    has('c_root.x') &&
    has('c_spine_01.x') &&
    has('c_spine_02.x') &&
    has('c_neck.x') &&
    has('c_head.x');

  const fkControls =
    has('c_arm_fk.l') &&
    has('c_forearm_fk.l') &&
    has('c_hand_fk.l') &&
    has('c_arm_fk.r') &&
    has('c_forearm_fk.r') &&
    has('c_hand_fk.r') &&
    has('c_thigh_fk.l') &&
    has('c_leg_fk.l') &&
    has('c_foot_fk.l') &&
    has('c_thigh_fk.r') &&
    has('c_leg_fk.r') &&
    has('c_foot_fk.r');

  const ikControls =
    has('c_hand_ik.l') &&
    has('c_hand_ik.r') &&
    has('c_foot_ik.l') &&
    has('c_foot_ik.r') &&
    has('c_arms_pole.l') &&
    has('c_arms_pole.r') &&
    has('c_leg_pole.l') &&
    has('c_leg_pole.r');

  return !!(bodyControls && fkControls && ikControls);
}

function targetLooksMixamoControlRig() {
  const tgt = state.target;
  if (!tgt?.root) return false;

  const has = (...names) =>
    !!findBoneByOriginalExact(tgt, names);

  // Mixamo Control Rig contains the original mixamorig deform skeleton too,
  // so WaltFBX may classify the FBX generically as "mixamo". Detect this rig
  // from its control signature instead of relying on the generic profile.
  //
  // Current hierarchy uses Ctrl_UpLeg_FK_* (not Ctrl_Thigh_FK_*). Keep the
  // older Thigh alias as a fallback so both variants remain compatible.
  const coreControls =
    has('Ctrl_Master') &&
    has('Ctrl_Hips') &&
    has('Ctrl_Spine') &&
    has('Ctrl_Spine1') &&
    has('Ctrl_Spine2');

  const leftArm =
    has('Ctrl_Arm_FK_Left') &&
    has('Ctrl_ForeArm_FK_Left') &&
    has('Ctrl_Hand_FK_Left');

  const rightArm =
    has('Ctrl_Arm_FK_Right') &&
    has('Ctrl_ForeArm_FK_Right') &&
    has('Ctrl_Hand_FK_Right');

  const leftLeg =
    has('Ctrl_UpLeg_FK_Left', 'Ctrl_Thigh_FK_Left') &&
    has('Ctrl_Leg_FK_Left') &&
    has('Ctrl_Foot_FK_Left');

  const rightLeg =
    has('Ctrl_UpLeg_FK_Right', 'Ctrl_Thigh_FK_Right') &&
    has('Ctrl_Leg_FK_Right') &&
    has('Ctrl_Foot_FK_Right');

  const ikSignature =
    has('Ctrl_Hand_IK_Left') &&
    has('Ctrl_Hand_IK_Right') &&
    has('Ctrl_Foot_IK_Left') &&
    has('Ctrl_Foot_IK_Right') &&
    has('Ctrl_ArmPole_IK_Left') &&
    has('Ctrl_LegPole_IK_Left');

  return !!(
    coreControls &&
    leftArm &&
    rightArm &&
    leftLeg &&
    rightLeg &&
    ikSignature
  );
}

function targetLooksUnrealEngine() {
  const tgt = state.target;
  if (!tgt?.root) return false;

  const has = (...names) =>
    !!findBoneByOriginalExact(tgt, names);

  return !!(
    has('root') &&
    has('pelvis') &&
    has('spine_01') &&
    has('spine_05') &&
    has('clavicle_l') &&
    has('upperarm_l') &&
    has('lowerarm_l') &&
    has('hand_l') &&
    has('thigh_l') &&
    has('calf_l') &&
    has('foot_l')
  );
}

function loadedRigProfile(slot) {
  return slot?.asset?.rig?.profile || '';
}

function displayRigProfile(slot) {
  if (!slot?.root) return loadedRigProfile(slot) || 'unknown';

  if (slot.kind === 'target') {
    if (targetLooksMixamoControlRig()) return 'mixamo-control-rig';
    if (targetLooksAutoRigPro()) return 'auto-rig-pro';
    if (targetLooksUnrealEngine()) return 'ue';
  }

  return loadedRigProfile(slot) || 'generic';
}

function sourceMatchesPresetFamily(family) {
  if (!state.source.root) return false;

  switch (family) {
    case 'mixamo':
      return loadedRigProfile(state.source) === 'mixamo';
    case 'ue':
      return loadedRigProfile(state.source) === 'ue';
    case 'blendcap':
      return sourceLooksBlendCap();
    default:
      return true;
  }
}

function targetMatchesPresetFamily(family) {
  if (!state.target.root) return false;

  switch (family) {
    case 'cloudrig':
      return targetLooksCloudRig();
    case 'rigify':
      return targetLooksRigify();
    case 'mixamo':
      return (
        loadedRigProfile(state.target) === 'mixamo' &&
        !targetLooksMixamoControlRig()
      );
    case 'arp':
      return targetLooksAutoRigPro();
    case 'mixamo-ctrl':
      return targetLooksMixamoControlRig();
    case 'ue':
      return (
        loadedRigProfile(state.target) === 'ue' ||
        targetLooksUnrealEngine()
      );
    default:
      return true;
  }
}

function presetMatchesLoadedRigs() {
  const preset = state.activePreset;
  if (!preset || state.activePresetId === 'none') return false;
  if (!state.source.root || !state.target.root) return false;

  return (
    sourceMatchesPresetFamily(preset.sourceFamily) &&
    targetMatchesPresetFamily(preset.targetFamily)
  );
}

const state = {
  source: makeSlot('source'),
  target: makeSlot('target'),
  boneMap: [],
  activePresetId: 'none',
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
  workspaceMappingCollapsed: true,
  mappingPreviewSelectedIndex: null,
  mappingPreviewHits: {
    source: { joints: [], segments: [] },
    target: { joints: [], segments: [] }
  },
  dualFbxReady: false,
  actionPackerSourceFiles: [],
  ueArpBridge: {
    group: null,
    mixer: null,
    action: null,
    clip: null,
    nodes: new Map(),
    links: [],
    line: null
  },
  arpSkinPreviewCache: {
    targetRoot: null,
    weightedNames: null,
    bindings: null,
    skinOverrides: [],
    skinOverrideTargetRoot: null
  },
  ghost: {
    enabled: false,
    container: null,
    visual: null,
    mixer: null,
    action: null,
    bonePairs: [],
    comparison: null,
    lastTime: NaN,
    opacity: 0.20
  },
  restEditor: {
    selectedBone: null,
    selectedRole: null,
    transform: null,
    transformHelper: null,
    hasCustomRest: false,
    undoStack: [],
    sensitivity: 0.5,
    showFullGimbal: false,
    targetOverlayEnabled: true,
    targetOverlayOpacity: 0.20,
    targetOverlayRoot: null,
    jointMarkers: [],
    jointMarkerTexture: null,
    hoveredMarkerBone: null,
    dragBaseQuaternion: null,
    applyingSensitivity: false
  }
};


function disposeUeArpHelperBridge() {
  const bridge = state.ueArpBridge;
  if (!bridge) return;

  bridge.action?.stop?.();
  bridge.mixer?.stopAllAction?.();

  if (bridge.group) {
    targetView.scene.remove(bridge.group);
    bridge.group.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach(material => material?.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }

  bridge.group = null;
  bridge.mixer = null;
  bridge.action = null;
  bridge.clip = null;
  bridge.nodes = new Map();
  bridge.links = [];
  bridge.line = null;
}

function installUeArpHelperBridge(helperClip, descriptors) {
  disposeUeArpHelperBridge();

  if (!helperClip?.tracks?.length || !descriptors?.length) return;

  const group = new THREE.Group();
  group.name = 'UE_ARP_HelperBridge';
  group.renderOrder = 90;

  const box = state.target.displayRoot
    ? new THREE.Box3().setFromObject(state.target.displayRoot)
    : new THREE.Box3();

  const size = box.isEmpty()
    ? 1
    : Math.max(box.getSize(new THREE.Vector3()).length(), 0.25);

  const radius = THREE.MathUtils.clamp(size * 0.012, 0.014, 0.055);
  const sphereGeometry = new THREE.SphereGeometry(radius, 10, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  const nodes = new Map();

  for (const descriptor of descriptors) {
    const marker = new THREE.Mesh(sphereGeometry, sphereMaterial);
    marker.name = descriptor.helperName;
    marker.userData.ueArpHelper = true;
    marker.renderOrder = 91;
    group.add(marker);
    nodes.set(descriptor.helperName, marker);
  }

  const links = descriptors
    .filter(descriptor => descriptor.parentHelperName)
    .map(descriptor => [
      descriptor.parentHelperName,
      descriptor.helperName
    ])
    .filter(([parent, child]) => nodes.has(parent) && nodes.has(child));

  let line = null;

  if (links.length) {
    const positions = new Float32Array(links.length * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });

    line = new THREE.LineSegments(geometry, material);
    line.name = 'UE_ARP_HelperBridge_Links';
    line.renderOrder = 90;
    group.add(line);
  }

  targetView.scene.add(group);

  const mixer = new THREE.AnimationMixer(group);
  const action = mixer.clipAction(helperClip).play();

  state.ueArpBridge.group = group;
  state.ueArpBridge.mixer = mixer;
  state.ueArpBridge.action = action;
  state.ueArpBridge.clip = helperClip;
  state.ueArpBridge.nodes = nodes;
  state.ueArpBridge.links = links;
  state.ueArpBridge.line = line;

  mixer.setTime(state.playTime || 0);
  updateUeArpHelperBridgeOverlay();

  log(
    'UE -> ARP Helper Bridge visible: ' +
    descriptors.length +
    ' helpers / ' +
    links.length +
    ' enlaces. Azul = proxy WORLD independiente del rig Target.'
  );
}

function updateUeArpHelperBridgeOverlay() {
  const bridge = state.ueArpBridge;
  if (!bridge?.group?.visible || !bridge.line) return;

  const attr = bridge.line.geometry?.getAttribute?.('position');
  if (!attr) return;

  const parentPos = new THREE.Vector3();
  const childPos = new THREE.Vector3();

  bridge.links.forEach(([parentName, childName], index) => {
    const parent = bridge.nodes.get(parentName);
    const child = bridge.nodes.get(childName);
    if (!parent || !child) return;

    parent.getWorldPosition(parentPos);
    child.getWorldPosition(childPos);

    const offset = index * 6;
    attr.array[offset] = parentPos.x;
    attr.array[offset + 1] = parentPos.y;
    attr.array[offset + 2] = parentPos.z;
    attr.array[offset + 3] = childPos.x;
    attr.array[offset + 4] = childPos.y;
    attr.array[offset + 5] = childPos.z;
  });

  attr.needsUpdate = true;
  bridge.line.geometry.computeBoundingSphere?.();
}

function sourceFileIdentity(file) {
  return [
    String(file?.name || ''),
    Number(file?.size || 0),
    Number(file?.lastModified || 0)
  ].join('::');
}

function actionPackerFrameWindow() {
  return $('actionPackerFrame')?.contentWindow || null;
}

function postSourceFileToActionPacker(file) {
  const target = actionPackerFrameWindow();
  if (!target || !file) return;

  target.postMessage({
    type: 'retarget-to-play:source-fbx',
    file
  }, window.location.origin);
}

function rememberSourceForActionPacker(file) {
  if (!file) return;

  const key = sourceFileIdentity(file);
  const exists = state.actionPackerSourceFiles.some(
    entry => sourceFileIdentity(entry) === key
  );

  if (!exists) state.actionPackerSourceFiles.push(file);
  postSourceFileToActionPacker(file);
}

function syncAllSourcesToActionPacker() {
  for (const file of state.actionPackerSourceFiles) {
    postSourceFileToActionPacker(file);
  }
}

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== actionPackerFrameWindow()) return;

  if (event.data?.type === 'action-packer:ready') {
    syncAllSourcesToActionPacker();
    return;
  }

  if (event.data?.type === 'action-packer:height') {
    const frame = $('actionPackerFrame');
    const height = Number(event.data.height);

    if (
      frame &&
      window.matchMedia('(max-width: 760px)').matches &&
      Number.isFinite(height) &&
      height > 300
    ) {
      const clamped = Math.min(Math.max(Math.ceil(height), 520), 12000);
      frame.style.height = clamped + 'px';
      frame.parentElement?.style.setProperty(
        '--action-packer-mobile-height',
        clamped + 'px'
      );
    }
  }
});

const actionPackerMobileMedia = window.matchMedia('(max-width: 760px)');
actionPackerMobileMedia.addEventListener?.('change', event => {
  if (event.matches) return;

  const frame = $('actionPackerFrame');
  if (frame) frame.style.removeProperty('height');
  frame?.parentElement?.style.removeProperty('--action-packer-mobile-height');
});

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
    neutralBaseClip: null,
    restSource: 'model-local',
    restDetection: null,
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

const RETARGET_VALIDATION_FINGER_RE = /(thumb|index|middle|ring|pinky)/i;

function disposeGhostOverlay({ keepEnabled = true } = {}) {
  const ghost = state.ghost;
  if (!ghost) return;

  ghost.action?.stop?.();
  ghost.mixer?.stopAllAction?.();

  if (ghost.container) {
    targetView.scene.remove(ghost.container);
  }

  ghost.visual?.traverse?.(object => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of materials) {
      if (material?.userData?.retargetGhostMaterial) {
        material.dispose?.();
      }
    }
  });

  ghost.container = null;
  ghost.visual = null;
  ghost.mixer = null;
  ghost.action = null;
  ghost.bonePairs = [];
  ghost.comparison = null;
  ghost.lastTime = NaN;

  if (!keepEnabled) ghost.enabled = false;
}

const CLOUDRIG_CONTROL_TO_DEFORM = {
  'HIP-Spine': 'DEF-Hips',
  'HTP-Spine': 'DEF-Hips',
  'FK-Hips': 'DEF-Hips',
  'FK-Spine': 'DEF-Spine',
  'FK-Chest': 'DEF-Chest',
  'FK-Neck': 'DEF-Neck',
  'FK-Head': 'DEF-Head',

  'FK-Shoulder.L': 'DEF-Shoulder.L',
  'FK-UpperArm.L': 'DEF-UpperArm_1.L',
  'FK-Forearm.L': 'DEF-Forearm_1.L',
  'FK-Hand.L': 'DEF-Hand.L',

  'FK-Shoulder.R': 'DEF-Shoulder.R',
  'FK-UpperArm.R': 'DEF-UpperArm_1.R',
  'FK-Forearm.R': 'DEF-Forearm_1.R',
  'FK-Hand.R': 'DEF-Hand.R',

  'FK-Thigh.L': 'DEF-Thigh_1.L',
  'FK-Knee.L': 'DEF-Knee_1.L',
  'FK-Foot.L': 'DEF-Foot.L',
  'FK-Toes.L': 'DEF-Toes.L',

  'FK-Thigh.R': 'DEF-Thigh_1.R',
  'FK-Knee.R': 'DEF-Knee_1.R',
  'FK-Foot.R': 'DEF-Foot.R',
  'FK-Toes.R': 'DEF-Toes.R'
};

const RIGIFY_CONTROL_TO_DEFORM = {
  'spine_fk': 'DEF-spine',
  'spine_fk.001': 'DEF-spine.002',
  'spine_fk.002': 'DEF-spine.004',
  'spine_fk.003': 'DEF-spine.006',
  'neck': 'DEF-neck',
  'head': 'DEF-head',

  'shoulder.L': 'DEF-shoulder.L',
  'upper_arm_fk.L': 'DEF-upper_arm.L',
  'forearm_fk.L': 'DEF-forearm.L',
  'hand_fk.L': 'DEF-hand.L',

  'shoulder.R': 'DEF-shoulder.R',
  'upper_arm_fk.R': 'DEF-upper_arm.R',
  'forearm_fk.R': 'DEF-forearm.R',
  'hand_fk.R': 'DEF-hand.R',

  'thigh_fk.L': 'DEF-thigh.L',
  'shin_fk.L': 'DEF-shin.L',
  'foot_fk.L': 'DEF-foot.L',
  'toe_fk.L': 'DEF-toe.L',

  'thigh_fk.R': 'DEF-thigh.R',
  'shin_fk.R': 'DEF-shin.R',
  'foot_fk.R': 'DEF-foot.R',
  'toe_fk.R': 'DEF-toe.R'
};

function validationTargetBoneName(pair) {
  const targetBone = state.target.bones.get(pair?.target);
  if (!targetBone) return '';

  const original = originalObjectName(targetBone) || pair.target;

  if (usesCloudRigPipeline()) {
    const deformOriginal = CLOUDRIG_CONTROL_TO_DEFORM[original];
    if (deformOriginal) {
      return (
        findBoneByOriginalExact(state.target, [deformOriginal]) ||
        pair.target
      );
    }
  }

  if (usesRigifyPipeline()) {
    const deformOriginal = RIGIFY_CONTROL_TO_DEFORM[original];
    if (deformOriginal) {
      return (
        findBoneByOriginalExact(state.target, [deformOriginal]) ||
        pair.target
      );
    }
  }

  if (usesMixamoControlRigPipeline()) {
    const deformSemantic = MIXAMO_CONTROL_TO_DEFORM[original];
    if (deformSemantic) {
      return (
        findMixamoControlRigDeformBone(state.target, deformSemantic) ||
        pair.target
      );
    }
  }

  if (usesAutoRigProPipeline()) {
    const deformOriginal = ARP_CONTROL_TO_DEFORM[original];
    if (deformOriginal) {
      return (
        findBoneByOriginalExact(state.target, [deformOriginal]) ||
        findSemanticBone(state.target, deformOriginal) ||
        pair.target
      );
    }
  }

  return pair.target;
}

function validationMappedNodes() {
  if (!state.source.root || !state.target.root) return [];

  const bestBySource = new Map();

  for (const pair of validMap()) {
    const sourceBone = state.source.bones.get(pair.source);
    const targetName = validationTargetBoneName(pair);
    const targetBone = targetName
      ? state.target.bones.get(targetName)
      : null;

    if (!sourceBone || !targetBone) continue;

    const channels = String(pair.channels || 'ROT').toUpperCase();
    const priority =
      channels.includes('ROT') ? 30 :
      channels.includes('LOC') ? 10 :
      1;

    const existing = bestBySource.get(pair.source);
    if (existing && existing.priority >= priority) continue;

    bestBySource.set(pair.source, {
      pair,
      priority,
      source: pair.source,
      target: targetName,
      sourceBone,
      targetBone,
      sourceOriginal: originalObjectName(sourceBone) || pair.source,
      targetOriginal: originalObjectName(targetBone) || targetName
    });
  }

  return [...bestBySource.values()];
}

function centroidOfPoints(points) {
  const out = new THREE.Vector3();
  if (!points.length) return out;

  for (const point of points) out.add(point);
  return out.multiplyScalar(1 / points.length);
}

function validationCoreNode(node) {
  const name = String(node?.sourceOriginal || '');
  if (RETARGET_VALIDATION_FINGER_RE.test(name)) return false;
  if (/(toe|end|eye|jaw|brow|lip|nose|cheek)/i.test(name)) return false;
  return true;
}

function validationGroundNode(node) {
  const sourceName = String(node?.sourceOriginal || '');
  const targetName = String(node?.targetOriginal || '');

  return (
    /(leftfoot|rightfoot|lefttoebase|righttoebase|foot|toe)/i.test(sourceName) ||
    /(foot|toe|ball)/i.test(targetName)
  );
}

function validationMedian(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[mid]
    : (finite[mid - 1] + finite[mid]) * 0.5;
}

function validationRestAlignment(nodes = validationMappedNodes()) {
  const samples = [];

  for (const node of nodes) {
    const sr = state.source.rest.get(node.source);
    const tr = state.target.rest.get(node.target);
    if (!sr || !tr) continue;

    samples.push({
      node,
      source: sr.worldPos.clone(),
      target: tr.worldPos.clone()
    });
  }

  const coreSamples = samples.filter(sample =>
    validationCoreNode(sample.node)
  );

  const scaleSamples = coreSamples.length >= 4
    ? coreSamples
    : samples;

  if (scaleSamples.length < 2) {
    return {
      scale: 1,
      rotation: new THREE.Quaternion(),
      restGroundOffsetY: null,
      groundSampleCount: 0,
      bodySpan: 1,
      samples,
      sourceCenter: new THREE.Vector3(),
      targetCenter: new THREE.Vector3()
    };
  }

  const sourceCenter = centroidOfPoints(
    scaleSamples.map(x => x.source)
  );
  const targetCenter = centroidOfPoints(
    scaleSamples.map(x => x.target)
  );

  // Median radius-ratio is much more robust than a global RMS when one
  // character has short legs, long arms, oversized hands, etc.
  const ratios = [];

  for (const sample of scaleSamples) {
    const sourceRadius = sample.source.distanceTo(sourceCenter);
    const targetRadius = sample.target.distanceTo(targetCenter);

    if (sourceRadius > 1e-6 && targetRadius > 1e-6) {
      ratios.push(targetRadius / sourceRadius);
    }
  }

  const medianScale = validationMedian(ratios);
  const scale = medianScale > 0
    ? THREE.MathUtils.clamp(medianScale, 0.05, 20)
    : 1;

  const anchor = validationAnchorNode(nodes);
  const sourceAnchorRest = anchor
    ? state.source.rest.get(anchor.source)
    : null;
  const targetAnchorRest = anchor
    ? state.target.rest.get(anchor.target)
    : null;

  // Static coordinate-system correction. This is NOT a per-frame fit:
  // it only reconciles the two rigs' Rest orientation, so animation errors
  // remain visible instead of being hidden by the Ghost.
  const rotation =
    sourceAnchorRest && targetAnchorRest
      ? targetAnchorRest.worldQuat.clone()
          .multiply(sourceAnchorRest.worldQuat.clone().invert())
          .normalize()
      : new THREE.Quaternion();

  // The old Ghost matched the CURRENT hips vertically every frame. That made
  // characters with different leg proportions look slightly sunk into, or
  // floating above, the Target. Use the feet/toes in REST only to establish a
  // static ground-plane offset. The offset does not change per frame, so jumps,
  // crouches and vertical root-motion errors stay visible.
  const groundSamples = samples.filter(sample =>
    validationGroundNode(sample.node)
  );

  const sourceGroundY = validationMedian(
    groundSamples.map(sample =>
      sample.source.clone()
        .multiplyScalar(scale)
        .applyQuaternion(rotation)
        .y
    )
  );

  const targetGroundY = validationMedian(
    groundSamples.map(sample => sample.target.y)
  );

  const restGroundOffsetY =
    groundSamples.length >= 2 &&
    Number.isFinite(sourceGroundY) &&
    Number.isFinite(targetGroundY)
      ? targetGroundY - sourceGroundY
      : null;

  const box = new THREE.Box3();
  box.makeEmpty();
  for (const sample of scaleSamples) box.expandByPoint(sample.target);

  const targetRadii = scaleSamples.map(sample =>
    sample.target.distanceTo(targetCenter)
  );
  const targetMedianRadius = validationMedian(targetRadii);

  const bodySpan = box.isEmpty()
    ? Math.max(targetMedianRadius * 2, 1e-4)
    : Math.max(
        box.min.distanceTo(box.max),
        targetMedianRadius * 2,
        1e-4
      );

  return {
    scale,
    rotation,
    restGroundOffsetY,
    groundSampleCount: groundSamples.length,
    bodySpan,
    samples,
    sourceCenter,
    targetCenter
  };
}


function validationAnchorNode(nodes) {
  if (!nodes.length) return null;

  const sourceObjectToName = new Map();
  for (const [name, bone] of state.source.bones) {
    sourceObjectToName.set(bone, name);
  }

  const candidates = nodes
    .map(node => ({
      node,
      depth: boneDepth(node.sourceBone),
      rootLike: /(root|hips|pelvis)/i.test(node.sourceOriginal) ? 0 : 1
    }))
    .sort((a, b) =>
      a.rootLike - b.rootLike ||
      a.depth - b.depth
    );

  return candidates[0]?.node || nodes[0];
}

function validationGhostTranslation(alignment, anchor) {
  let sourceAnchor;
  let targetAnchor;

  if (anchor) {
    sourceAnchor = anchor.sourceBone.getWorldPosition(new THREE.Vector3());
    targetAnchor = anchor.targetBone.getWorldPosition(new THREE.Vector3());
  } else {
    const sourceBox = new THREE.Box3().setFromObject(
      state.source.displayRoot || state.source.root
    );
    const targetBox = new THREE.Box3().setFromObject(
      state.target.displayRoot || state.target.root
    );

    sourceAnchor = sourceBox.getCenter(new THREE.Vector3());
    targetAnchor = targetBox.getCenter(new THREE.Vector3());
  }

  const transformedSourceAnchor = sourceAnchor
    .clone()
    .multiplyScalar(alignment.scale)
    .applyQuaternion(alignment.rotation);

  const translation = targetAnchor.clone()
    .sub(transformedSourceAnchor);

  // Horizontal/depth alignment follows the current hips/root so the models
  // remain visually superposed while scrubbing. Vertical alignment is locked
  // to the REST floor whenever feet/toes are available; this fixes the
  // "Source slightly below Target" case without hiding vertical animation.
  if (Number.isFinite(alignment.restGroundOffsetY)) {
    translation.y = alignment.restGroundOffsetY;
  }

  return {
    translation,
    sourceAnchor,
    targetAnchor
  };
}

function syncGhostPoseFromSource() {
  const ghost = state.ghost;
  if (!ghost?.visual) return;

  const sourceVisual = state.source.displayRoot || state.source.root;
  if (!sourceVisual) return;

  // Literal mirror of what is shown in the Source viewport.
  // Do not derive any transform from presets, mappings, target bones or
  // validation. The Source clone keeps the exact same scene-space transform.
  ghost.visual.position.copy(sourceVisual.position);
  ghost.visual.quaternion.copy(sourceVisual.quaternion);
  ghost.visual.scale.copy(sourceVisual.scale);

  for (const [sourceBone, ghostBone] of ghost.bonePairs || []) {
    ghostBone.position.copy(sourceBone.position);
    ghostBone.quaternion.copy(sourceBone.quaternion);
    ghostBone.scale.copy(sourceBone.scale);
  }
}

function updateGhostOverlayPose(force = false) {
  const ghost = state.ghost;
  if (!ghost?.enabled || !ghost.container || !ghost.visual) return;
  if (!state.source.root || !state.target.root || !state.targetPreviewClip) return;

  if (!force && ghost.lastTime === state.playTime) return;

  // Source and Target viewports already use synchronized cameras. Therefore
  // putting an exact clone of the Source scene object in targetView produces
  // the same Source image on the Target side, only with the Ghost material.
  syncGhostPoseFromSource();

  ghost.container.position.set(0, 0, 0);
  ghost.container.quaternion.identity();
  ghost.container.scale.set(1, 1, 1);
  ghost.lastTime = state.playTime;
}
function rebuildGhostOverlay() {
  disposeGhostOverlay({ keepEnabled: true });

  if (
    !state.ghost.enabled ||
    !state.source.root ||
    !state.target.root ||
    !state.source.activeClip ||
    !state.targetPreviewClip
  ) {
    return;
  }

  // Same idea as Redefine Rest Pose > Target Overlay, but reversed:
  // clone the SOURCE visual and render that exact clone in targetView.
  const sourceVisual = state.source.displayRoot || state.source.root;
  const visual = cloneSkeleton(sourceVisual);
  const container = new THREE.Group();

  container.name = 'Retarget_Source_Ghost_Container';
  visual.name = 'Retarget_Source_Ghost';
  visual.userData.retargetGhost = true;

  visual.traverse(object => {
    if (object.isMesh || object.isSkinnedMesh) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x63a7ff,
        transparent: true,
        opacity: state.ghost.opacity,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      material.userData.retargetGhostMaterial = true;
      object.material = material;
      object.renderOrder = 35;
      object.frustumCulled = false;
      object.raycast = () => {};
    } else if (object.isLine || object.isLineSegments || object.isPoints) {
      object.visible = false;
    }
  });

  container.add(visual);
  targetView.scene.add(container);

  // Pair the clone's bones with the Source bones once. During playback we
  // only copy local TRS. No second mixer and no preset/mapping computations.
  const ghostBones = collectBones(visual);
  const bonePairs = [];

  for (const [name, sourceBone] of state.source.bones) {
    const ghostBone = ghostBones.get(name);
    if (ghostBone) bonePairs.push([sourceBone, ghostBone]);
  }

  state.ghost.container = container;
  state.ghost.visual = visual;
  state.ghost.mixer = null;
  state.ghost.action = null;
  state.ghost.bonePairs = bonePairs;
  state.ghost.comparison = null;
  state.ghost.lastTime = NaN;

  updateGhostOverlayPose(true);

  log(
    `Ghost directo Source→Target: overlay independiente · ` +
    `${bonePairs.length} huesos visuales sincronizados · sin presets/mapping.`
  );
}
function setGhostMode(enabled) {
  state.ghost.enabled = !!enabled;

  if (state.ghost.enabled) {
    rebuildGhostOverlay();
  } else {
    disposeGhostOverlay({ keepEnabled: true });
  }

  const button = $('ghostMode');
  if (button) {
    button.classList.toggle('active', state.ghost.enabled);
    button.setAttribute('aria-pressed', state.ghost.enabled ? 'true' : 'false');
    button.textContent = state.ghost.enabled ? 'Ghost · ON' : 'Ghost';
  }
}

function validationPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1)
  );
  return sorted[index];
}

function currentValidationSnapshot() {
  if (!state.source.root || !state.target.root || !state.targetPreviewClip) {
    throw new Error('Primero genera un Transfer para poder validar.');
  }

  // Make the two evaluated poses deterministic at the exact timeline time.
  if (state.source.mixer && state.source.activeClip) {
    state.source.mixer.setTime(state.playTime);
  }
  if (state.target.mixer && state.targetPreviewClip) {
    state.target.mixer.setTime(state.playTime);
  }

  applyTargetRigRuntime();
  updateSlotWorld(state.source);
  updateSlotWorld(state.target);

  const nodes = validationMappedNodes();
  if (nodes.length < 3) {
    throw new Error('No hay suficientes huesos comparables para validar.');
  }

  const bySource = new Map(nodes.map(node => [node.source, node]));
  const sourceObjectToName = new Map();

  for (const [name, bone] of state.source.bones) {
    sourceObjectToName.set(bone, name);
  }

  const segments = [];

  for (const node of nodes) {
    let parentObject = node.sourceBone.parent;
    let parentNode = null;

    while (parentObject) {
      const sourceName = sourceObjectToName.get(parentObject);
      if (sourceName && bySource.has(sourceName)) {
        parentNode = bySource.get(sourceName);
        break;
      }
      parentObject = parentObject.parent;
    }

    if (!parentNode) continue;
    if (parentNode.target === node.target) continue;

    const sourceA = parentNode.sourceBone.getWorldPosition(new THREE.Vector3());
    const sourceB = node.sourceBone.getWorldPosition(new THREE.Vector3());
    const targetA = parentNode.targetBone.getWorldPosition(new THREE.Vector3());
    const targetB = node.targetBone.getWorldPosition(new THREE.Vector3());

    const sourceVector = sourceB.sub(sourceA);
    const targetVector = targetB.sub(targetA);

    if (sourceVector.lengthSq() < 1e-9 || targetVector.lengthSq() < 1e-9) {
      continue;
    }

    const angleDeg = THREE.MathUtils.radToDeg(
      sourceVector.angleTo(targetVector)
    );

    segments.push({
      angleDeg,
      finger:
        RETARGET_VALIDATION_FINGER_RE.test(node.sourceOriginal) ||
        RETARGET_VALIDATION_FINGER_RE.test(parentNode.sourceOriginal),
      label:
        `${parentNode.sourceOriginal} → ${node.sourceOriginal}  |  ` +
        `${parentNode.targetOriginal} → ${node.targetOriginal}`
    });
  }

  const alignment = validationRestAlignment(nodes);
  const anchor = validationAnchorNode(nodes);

  const {
    translation,
    sourceAnchor,
    targetAnchor
  } = validationGhostTranslation(alignment, anchor);

  const jointErrors = [];

  for (const node of nodes) {
    const sourceWorld = node.sourceBone
      .getWorldPosition(new THREE.Vector3())
      .multiplyScalar(alignment.scale)
      .applyQuaternion(alignment.rotation)
      .add(translation);

    const targetWorld = node.targetBone.getWorldPosition(
      new THREE.Vector3()
    );

    const distance = sourceWorld.distanceTo(targetWorld);
    const percent = (distance / alignment.bodySpan) * 100;

    jointErrors.push({
      distance,
      percent,
      label: `${node.sourceOriginal} ↔ ${node.targetOriginal}`
    });
  }

  let rootMotionErrorPercent = 0;

  if (anchor) {
    const sourceRest = state.source.rest.get(anchor.source);
    const targetRest = state.target.rest.get(anchor.target);

    if (sourceRest && targetRest) {
      const sourceDelta = sourceAnchor.clone()
        .sub(sourceRest.worldPos)
        .multiplyScalar(alignment.scale)
        .applyQuaternion(alignment.rotation);

      const targetDelta = targetAnchor.clone()
        .sub(targetRest.worldPos);

      rootMotionErrorPercent =
        sourceDelta.distanceTo(targetDelta) /
        alignment.bodySpan *
        100;
    }
  }

  const angles = segments.map(x => x.angleDeg);
  const coreAngles = segments
    .filter(x => !x.finger)
    .map(x => x.angleDeg);
  const positionPercents = jointErrors.map(x => x.percent);

  const average = values =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return {
    nodes,
    segments,
    jointErrors,
    alignment,
    anchor,
    angularAverage: average(angles),
    angularMedian: validationPercentile(angles, 0.5),
    angularP95: validationPercentile(angles, 0.95),
    coreAngularAverage: average(coreAngles.length ? coreAngles : angles),
    positionAveragePercent: average(positionPercents),
    positionMedianPercent: validationPercentile(positionPercents, 0.5),
    positionP95Percent: validationPercentile(positionPercents, 0.95),
    rootMotionErrorPercent
  };
}

function buildRetargetValidationReport(snapshot) {
  const worstSegments = [...snapshot.segments]
    .sort((a, b) => b.angleDeg - a.angleDeg)
    .slice(0, 8);

  const worstJoints = [...snapshot.jointErrors]
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 8);

  const f2 = value => Number(value || 0).toFixed(2);

  const lines = [
    'RETARGET VALIDATION · WaltFBX',
    `Frame: ${state.playTime.toFixed(3)} s`,
    `Preset: ${state.activePreset?.label || state.activePresetId || 'manual'}`,
    `Source: ${state.source.fileName || '—'}`,
    `Target: ${state.target.fileName || '—'}`,
    '',
    'NORMALIZACIÓN',
    `Escala robusta Source→Target: ${snapshot.alignment.scale.toFixed(4)}x`,
    'Rotación: corrección estática Rest-space (no ajuste por frame)',
    Number.isFinite(snapshot.alignment.restGroundOffsetY)
      ? `Vertical: suelo REST por pies/toes (${snapshot.alignment.groundSampleCount} referencias) · offset ${snapshot.alignment.restGroundOffsetY.toFixed(4)}`
      : 'Vertical: fallback al anchor actual',
    `Anchor X/Z: ${snapshot.anchor?.sourceOriginal || 'centroide'} ↔ ${snapshot.anchor?.targetOriginal || 'centroide'}`,
    `Joints comparados: ${snapshot.nodes.length}`,
    `Segmentos comparados: ${snapshot.segments.length}`,
    '',
    'POSE · independiente del tamaño del personaje',
    `Error angular medio: ${f2(snapshot.angularAverage)}°`,
    `Error angular mediano: ${f2(snapshot.angularMedian)}°`,
    `Error angular P95: ${f2(snapshot.angularP95)}°`,
    `Core body medio (sin dedos): ${f2(snapshot.coreAngularAverage)}°`,
    '',
    'POSICIÓN · después de normalizar escala y alinear el anchor',
    `Desviación media de joints: ${f2(snapshot.positionAveragePercent)}% del span del Target`,
    `Desviación mediana: ${f2(snapshot.positionMedianPercent)}%`,
    `Desviación P95: ${f2(snapshot.positionP95Percent)}%`,
    `Error de root motion: ${f2(snapshot.rootMotionErrorPercent)}% del span del Target`,
    '',
    'PEORES SEGMENTOS'
  ];

  if (worstSegments.length) {
    worstSegments.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${f2(item.angleDeg)}° · ${item.label}`
      );
    });
  } else {
    lines.push('— Sin segmentos suficientes —');
  }

  lines.push('', 'PEORES JOINTS');

  if (worstJoints.length) {
    worstJoints.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${f2(item.percent)}% · ${item.label}`
      );
    });
  } else {
    lines.push('— Sin joints suficientes —');
  }

  lines.push(
    '',
    'LECTURA',
    '• El error angular compara DIRECCIÓN de segmentos, no longitud: un personaje chaparro/alto no es penalizado por estatura.',
    '• La posición usa una escala uniforme Source→Target y luego alinea el root/hips; diferencias restantes reflejan pose y proporciones corporales.',
    '• Root motion se reporta aparte para no esconder un desplazamiento incorrecto al alinear el Ghost.'
  );

  return lines.join('\n');
}

async function copyTextWithFallback(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      textarea.remove();
    }

    return copied;
  }
}

async function validateAndCopyRetarget() {
  const button = $('validateRetarget');

  try {
    const snapshot = currentValidationSnapshot();
    const report = buildRetargetValidationReport(snapshot);

    log(report);

    const copied = await copyTextWithFallback(report);

    setStatus(
      `Validación ${copied ? 'copiada' : 'generada'} · ` +
      `Pose ${snapshot.coreAngularAverage.toFixed(2)}° · ` +
      `Joints ${snapshot.positionAveragePercent.toFixed(2)}%`,
      'good'
    );

    if (button) {
      const old = button.textContent;
      button.textContent = copied ? 'Copiado ✓' : 'Validado ✓';
      window.setTimeout(() => {
        if (button) button.textContent = old;
      }, 1300);
    }
  } catch (error) {
    console.error(error);
    setStatus('No se pudo validar', 'bad');
    log(`ERROR Validación: ${error?.message || error}`);
  }
}

const REST_POSE_BONES = [
  { role: 'leftUpperArm', label: 'Left Upper Arm', semantic: 'LeftArm', aliases: ['LeftArm', 'upper_arm_fk.L', 'FK-UpperArm.L', 'upperarm_l'] },
  { role: 'rightUpperArm', label: 'Right Upper Arm', semantic: 'RightArm', aliases: ['RightArm', 'upper_arm_fk.R', 'FK-UpperArm.R', 'upperarm_r'] },
  { role: 'leftForearm', label: 'Left Forearm / Elbow', semantic: 'LeftForeArm', aliases: ['LeftForeArm', 'forearm_fk.L', 'FK-Forearm.L', 'lowerarm_l'] },
  { role: 'rightForearm', label: 'Right Forearm / Elbow', semantic: 'RightForeArm', aliases: ['RightForeArm', 'forearm_fk.R', 'FK-Forearm.R', 'lowerarm_r'] },
  { role: 'leftThigh', label: 'Left Thigh', semantic: 'LeftUpLeg', aliases: ['LeftUpLeg', 'thigh_fk.L', 'FK-Thigh.L', 'thigh_l'] },
  { role: 'rightThigh', label: 'Right Thigh', semantic: 'RightUpLeg', aliases: ['RightUpLeg', 'thigh_fk.R', 'FK-Thigh.R', 'thigh_r'] },
  { role: 'leftShin', label: 'Left Shin / Knee', semantic: 'LeftLeg', aliases: ['LeftLeg', 'shin_fk.L', 'FK-Knee.L', 'calf_l'] },
  { role: 'rightShin', label: 'Right Shin / Knee', semantic: 'RightLeg', aliases: ['RightLeg', 'shin_fk.R', 'FK-Knee.R', 'calf_r'] }
];

const REST_POSE_MIRROR = new Map([
  ['leftUpperArm', 'rightUpperArm'], ['rightUpperArm', 'leftUpperArm'],
  ['leftForearm', 'rightForearm'], ['rightForearm', 'leftForearm'],
  ['leftThigh', 'rightThigh'], ['rightThigh', 'leftThigh'],
  ['leftShin', 'rightShin'], ['rightShin', 'leftShin']
]);

function resolveRestPoseBone(slot, definition) {
  if (!slot?.root || !definition) return null;
  return findBoneByOriginalExact(slot, definition.aliases || []) ||
    findSemanticBone(slot, definition.semantic) || null;
}

function availableRestPoseBones() {
  return REST_POSE_BONES.map(definition => ({
    ...definition,
    name: resolveRestPoseBone(state.source, definition)
  })).filter(entry => !!entry.name);
}

function restPoseEntryByName(name) {
  return availableRestPoseBones().find(entry => entry.name === name) || null;
}

function cloneSourceRestMap() {
  const out = new Map();
  for (const [name, r] of state.source.rest) {
    out.set(name, {
      position: r.position.clone(),
      quaternion: r.quaternion.clone(),
      scale: r.scale.clone(),
      worldPos: r.worldPos.clone(),
      worldQuat: r.worldQuat.clone(),
      worldScale: r.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
    });
  }
  return out;
}

function captureRestPoseUndoSnapshot(label = 'Edit Rest Pose') {
  if (!state.source.root) return null;

  const bones = new Map();
  for (const [name, bone] of state.source.bones) {
    bones.set(name, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone()
    });
  }

  return {
    label,
    bones,
    rest: cloneSourceRestMap(),
    hasCustomRest: state.restEditor.hasCustomRest
  };
}

function pushRestPoseUndo(label) {
  const snapshot = captureRestPoseUndoSnapshot(label);
  if (!snapshot) return;
  state.restEditor.undoStack.push(snapshot);
  if (state.restEditor.undoStack.length > 60) state.restEditor.undoStack.shift();
  updateRestPoseUndoUi();
}

function updateRestPoseUndoUi() {
  const undoButton = $('undoRestPose');
  if (undoButton) undoButton.disabled = state.restEditor.undoStack.length === 0;
}

function restoreRestPoseSnapshot(snapshot) {
  if (!snapshot || !state.source.root) return;

  for (const [name, value] of snapshot.bones) {
    const bone = state.source.bones.get(name);
    if (!bone) continue;
    bone.position.copy(value.position);
    bone.quaternion.copy(value.quaternion);
    bone.scale.copy(value.scale);
  }

  state.source.rest = new Map();
  for (const [name, r] of snapshot.rest) {
    state.source.rest.set(name, {
      position: r.position.clone(),
      quaternion: r.quaternion.clone(),
      scale: r.scale.clone(),
      worldPos: r.worldPos.clone(),
      worldQuat: r.worldQuat.clone(),
      worldScale: r.worldScale.clone()
    });
  }

  state.restEditor.hasCustomRest = snapshot.hasCustomRest;
  state.source.rigRuntime?.captureRest?.();
  updateSlotWorld(state.source);
  updateRigOverlays();
  updateRestPoseUi();
}

function undoRestPoseEdit() {
  if (state.workspaceView !== 'restpose') return;
  const snapshot = state.restEditor.undoStack.pop();
  if (!snapshot) return;

  restoreRestPoseSnapshot(snapshot);
  invalidateRetargetAfterRestChange();

  const selected = state.restEditor.selectedBone;
  if (selected && state.source.bones.has(selected)) selectRestPoseBone(selected);

  updateRestPoseUndoUi();
  setStatus(`Undo · ${snapshot.label}`, 'good');
  log(`Redefine Rest Pose Undo: ${snapshot.label}.`);
}

function restPoseSensitivity() {
  return THREE.MathUtils.clamp(Number(state.restEditor.sensitivity) || 0.5, 0.05, 1);
}

function applyRestPoseRotationSensitivity() {
  const boneName = state.restEditor.selectedBone;
  const bone = boneName ? state.source.bones.get(boneName) : null;
  const start = state.restEditor.dragBaseQuaternion;
  const factor = restPoseSensitivity();

  if (!bone || !start || factor >= 0.999 || state.restEditor.applyingSensitivity) return;

  state.restEditor.applyingSensitivity = true;
  try {
    const raw = bone.quaternion.clone().normalize();
    const delta = start.clone().invert().multiply(raw).normalize();
    const scaledDelta = new THREE.Quaternion().identity().slerp(delta, factor).normalize();
    bone.quaternion.copy(start.clone().multiply(scaledDelta).normalize());
  } finally {
    state.restEditor.applyingSensitivity = false;
  }
}

function installRestPoseGizmoThickness(helper) {
  const lines = [];
  helper.traverse(object => {
    if (object.isLine && !object.isLineSegments && object.geometry?.attributes?.position?.count >= 3) {
      lines.push(object);
    }
  });

  for (const line of lines) {
    if (line.userData.restPoseThickened) continue;

    const attribute = line.geometry.attributes.position;
    const points = [];
    for (let i = 0; i < attribute.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(attribute, i));
    }

    const closed = points.length > 5 && points[0].distanceTo(points[points.length - 1]) < 0.08;
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const materialSource = Array.isArray(line.material) ? line.material[0] : line.material;

    // Only the compact yellow E ring gets a real tube. Native WebGL line
    // widths are unreliable, especially on mobile/Safari.
    if (line.name !== 'E') continue;

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(24, Math.min(144, points.length * 2)),
        0.042,
        10,
        closed
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffd21a,
        transparent: false,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );

    tube.frustumCulled = false;
    tube.renderOrder = (line.renderOrder || 0) + 1;
    tube.userData.restGizmoSourceLine = line;
    tube.raycast = () => {};
    line.add(tube);
    line.userData.restPoseThickened = true;
  }
}

function thickenRestPoseRingGeometry(geometry, tubeRadius = 0.026) {
  const position = geometry?.attributes?.position;
  if (!position?.count) return geometry;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const size = box.getSize(new THREE.Vector3());
  const axes = [
    { key: 'x', size: size.x },
    { key: 'y', size: size.y },
    { key: 'z', size: size.z }
  ].sort((a, b) => a.size - b.size);

  const normalAxis = axes[0].key;
  const planeA = axes[1].key;
  const planeB = axes[2].key;

  let radiusSum = 0;
  for (let i = 0; i < position.count; i++) {
    const a = position.getComponent(i, planeA === 'x' ? 0 : planeA === 'y' ? 1 : 2);
    const b = position.getComponent(i, planeB === 'x' ? 0 : planeB === 'y' ? 1 : 2);
    radiusSum += Math.hypot(a, b);
  }
  const centerRadius = radiusSum / position.count;

  const axisIndex = { x: 0, y: 1, z: 2 };

  for (let i = 0; i < position.count; i++) {
    const values = [position.getX(i), position.getY(i), position.getZ(i)];
    const ia = axisIndex[planeA];
    const ib = axisIndex[planeB];
    const inormal = axisIndex[normalAxis];

    const a = values[ia];
    const b = values[ib];
    const radial = Math.max(1e-8, Math.hypot(a, b));
    const radialOffset = radial - centerRadius;
    const normalOffset = values[inormal];
    const crossLen = Math.max(1e-8, Math.hypot(radialOffset, normalOffset));

    const newRadial = centerRadius + (radialOffset / crossLen) * tubeRadius;
    values[ia] = (a / radial) * newRadial;
    values[ib] = (b / radial) * newRadial;
    values[inormal] = (normalOffset / crossLen) * tubeRadius;

    position.setXYZ(i, values[0], values[1], values[2]);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals?.();
  geometry.computeBoundingSphere?.();
  return geometry;
}

function compactRestPoseGizmoGeometry(transform) {
  const gizmo = transform?._gizmo;
  if (!gizmo) return;

  const visualE = gizmo.gizmo?.rotate?.children?.find(handle => handle.name === 'E');
  const pickerE = gizmo.picker?.rotate?.children?.find(handle => handle.name === 'E');

  if (visualE?.geometry && !visualE.userData.restPoseCompactGeometry) {
    visualE.geometry = visualE.geometry.clone();
    visualE.geometry.scale(0.72, 0.72, 0.72);
    thickenRestPoseRingGeometry(visualE.geometry, 0.040);
    visualE.userData.restPoseCompactGeometry = true;
  }

  if (pickerE?.geometry && !pickerE.userData.restPoseCompactGeometry) {
    pickerE.geometry = pickerE.geometry.clone();
    pickerE.geometry.scale(0.72, 0.72, 0.72);
    pickerE.userData.restPoseCompactGeometry = true;
  }
}

function setRestPoseHandleMaterialVisible(handle, visible) {
  const materials = Array.isArray(handle?.material) ? handle.material : [handle?.material];
  for (const material of materials) {
    if (material) material.visible = visible;
  }
}

function configureRestPosePickerHandle(handle, enabled) {
  if (!handle) return;

  if (!handle.userData.restPoseOriginalRaycast) {
    handle.userData.restPoseOriginalRaycast = handle.raycast;
  }

  handle.raycast = enabled
    ? handle.userData.restPoseOriginalRaycast
    : function () {};
}

function updateRestPoseGizmoMode() {
  const transform = state.restEditor.transform;
  const helper = state.restEditor.transformHelper;
  if (!transform || !helper) return;

  const full = !!state.restEditor.showFullGimbal;
  const gizmo = transform._gizmo;

  // Important: r180 hides the E (yellow) ring whenever any of showX/Y/Z is
  // false. Keep those internal flags enabled and hide the colored rings at
  // material/picker level instead.
  transform.showX = true;
  transform.showY = true;
  transform.showZ = true;

  for (const handle of gizmo?.gizmo?.rotate?.children || []) {
    if (handle.name === 'E') {
      setRestPoseHandleMaterialVisible(handle, true);
      const materials = Array.isArray(handle.material) ? handle.material : [handle.material];
      for (const material of materials) {
        if (!material) continue;
        material.color?.setHex?.(0xffd21a);
        material.transparent = false;
        material.opacity = 1;
        material.depthTest = false;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    } else if (['X', 'Y', 'Z', 'XYZE'].includes(handle.name)) {
      setRestPoseHandleMaterialVisible(handle, full);
    }
  }

  for (const handle of gizmo?.picker?.rotate?.children || []) {
    configureRestPosePickerHandle(
      handle,
      full || handle.name === 'E'
    );
  }

  if (!full && transform.axis && transform.axis !== 'E') {
    transform.axis = null;
  }

  const toggle = $('showFullRestGimbal');
  if (toggle) toggle.checked = full;
}

function syncRestPoseGizmoThickness() {
  const helper = state.restEditor.transformHelper;
  if (!helper || state.workspaceView !== 'restpose') return;

  updateRestPoseGizmoMode();

  helper.traverse(object => {
    const sourceLine = object.userData?.restGizmoSourceLine;
    if (!sourceLine || !object.material) return;

    const sourceMaterial = Array.isArray(sourceLine.material)
      ? sourceLine.material[0]
      : sourceLine.material;

    if (sourceLine.name === 'E') {
      object.material.color?.setHex?.(0xffd21a);
      object.material.transparent = false;
      object.material.opacity = 1;
      object.material.depthTest = false;
      object.material.depthWrite = false;
    } else {
      if (sourceMaterial?.color && object.material.color) {
        object.material.color.copy(sourceMaterial.color);
      }
      if (Number.isFinite(sourceMaterial?.opacity)) {
        object.material.opacity = sourceMaterial.opacity;
      }
    }
  });
}

function ensureRestPoseTransformControls() {
  if (state.restEditor.transform) return state.restEditor.transform;

  const transform = new TransformControls(sourceView.camera, sourceView.renderer.domElement);
  transform.setMode('rotate');
  transform.setSpace('local');
  transform.setSize(0.56);

  const helper = transform.getHelper();
  helper.visible = false;

  // Make the rotation rings easier to read. Chromium/WebGL may clamp native
  // line widths on some GPUs, but when supported this makes the gizmo visibly
  // thicker without changing the rotation math or hit areas.
  helper.traverse(object => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if ('linewidth' in material) material.linewidth = 3;
      material.needsUpdate = true;
    }
  });

  // Bring the yellow E ring closer to the bone instead of leaving the
  // default TransformControls outer ring floating far away.
  compactRestPoseGizmoGeometry(transform);
  installRestPoseGizmoThickness(helper);

  updateRestPoseGizmoMode();

  sourceView.scene.add(helper);

  transform.addEventListener('mouseDown', () => {
    const bone = state.restEditor.selectedBone
      ? state.source.bones.get(state.restEditor.selectedBone)
      : null;
    if (!bone) return;
    pushRestPoseUndo('Rotate Bone');
    state.restEditor.dragBaseQuaternion = bone.quaternion.clone();
  });

  transform.addEventListener('mouseUp', () => {
    state.restEditor.dragBaseQuaternion = null;
  });

  transform.addEventListener('dragging-changed', event => {
    sourceView.controls.enabled = !event.value;
  });

  transform.addEventListener('objectChange', () => {
    applyRestPoseRotationSensitivity();
    updateSlotWorld(state.source);
    updateRigOverlays();
  });

  state.restEditor.transform = transform;
  state.restEditor.transformHelper = helper;
  return transform;
}

function detachRestPoseTransform() {
  state.restEditor.transform?.detach?.();
  if (state.restEditor.transformHelper) state.restEditor.transformHelper.visible = false;
  sourceView.controls.enabled = true;
}

function disposeRestPoseTargetOverlay() {
  const overlay = state.restEditor.targetOverlayRoot;
  if (!overlay) return;

  sourceView.scene.remove(overlay);

  overlay.traverse(object => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    for (const material of materials) {
      if (material?.userData?.restPoseTargetOverlayMaterial) {
        material.dispose?.();
      }
    }
  });

  state.restEditor.targetOverlayRoot = null;
}

function setRestPoseTargetOverlayOpacity(value) {
  const opacity = THREE.MathUtils.clamp(Number(value) || 0.20, 0.05, 0.75);
  state.restEditor.targetOverlayOpacity = opacity;

  const overlay = state.restEditor.targetOverlayRoot;
  if (overlay) {
    overlay.traverse(object => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.userData?.restPoseTargetOverlayMaterial) continue;
        material.opacity = opacity;
        material.needsUpdate = true;
      }
    });
  }

  const slider = $('restTargetOverlayOpacity');
  if (slider && document.activeElement !== slider) slider.value = String(opacity);
  const valueLabel = $('restTargetOverlayOpacityValue');
  if (valueLabel) valueLabel.textContent = `${Math.round(opacity * 100)}%`;
}

function alignRestPoseTargetOverlay(overlay) {
  const sourceRoot = state.source.displayRoot || state.source.root;
  if (!sourceRoot || !overlay) return;

  sourceRoot.updateMatrixWorld(true);
  overlay.updateMatrixWorld(true);

  const sourceBox = new THREE.Box3().setFromObject(sourceRoot);
  const targetBox = new THREE.Box3().setFromObject(overlay);
  if (sourceBox.isEmpty() || targetBox.isEmpty()) return;

  const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
  const targetCenter = targetBox.getCenter(new THREE.Vector3());

  // Preserve the Target's real scale. Only align floor + horizontal center so
  // pose differences are easy to compare and proportions are not falsified.
  overlay.position.x += sourceCenter.x - targetCenter.x;
  overlay.position.z += sourceCenter.z - targetCenter.z;
  overlay.position.y += sourceBox.min.y - targetBox.min.y;
  overlay.updateMatrixWorld(true);
}

function rebuildRestPoseTargetOverlay() {
  disposeRestPoseTargetOverlay();

  if (
    !state.restEditor.targetOverlayEnabled ||
    !state.source.root ||
    !state.target.root ||
    state.workspaceView !== 'restpose'
  ) {
    return;
  }

  // Target is already restored to neutral Rest when entering this workspace.
  updateSlotWorld(state.target);

  const targetVisual = state.target.displayRoot || state.target.root;
  const overlay = cloneSkeleton(targetVisual);
  overlay.name = 'RestPose_Target_Overlay';
  overlay.userData.restPoseTargetOverlay = true;

  overlay.traverse(object => {
    if (object.isMesh || object.isSkinnedMesh) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x63a7ff,
        transparent: true,
        opacity: state.restEditor.targetOverlayOpacity,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      material.userData.restPoseTargetOverlayMaterial = true;
      object.material = material;
      object.renderOrder = 35;
      object.frustumCulled = false;
      object.raycast = () => {};
    } else if (object.isLine || object.isLineSegments || object.isPoints) {
      // Do not bring any FBX line/helper artifacts into the overlay.
      object.visible = false;
    }
  });

  sourceView.scene.add(overlay);
  alignRestPoseTargetOverlay(overlay);
  state.restEditor.targetOverlayRoot = overlay;
  setRestPoseTargetOverlayOpacity(state.restEditor.targetOverlayOpacity);
}

function setRestPoseTargetOverlayEnabled(enabled) {
  state.restEditor.targetOverlayEnabled = !!enabled;

  if (state.restEditor.targetOverlayEnabled) {
    rebuildRestPoseTargetOverlay();
  } else {
    disposeRestPoseTargetOverlay();
  }

  const button = $('toggleRestTargetOverlay');
  if (button) {
    button.classList.toggle('active', state.restEditor.targetOverlayEnabled);
    button.setAttribute('aria-pressed', state.restEditor.targetOverlayEnabled ? 'true' : 'false');
    button.textContent = state.restEditor.targetOverlayEnabled
      ? 'Target Overlay · ON'
      : 'Target Overlay';
  }

  const slider = $('restTargetOverlayOpacity');
  if (slider) slider.disabled = !state.restEditor.targetOverlayEnabled || !state.target.root;
}

function disposeRestPoseJointMarkers() {
  for (const marker of state.restEditor.jointMarkers || []) {
    sourceView.scene.remove(marker);
    marker.material?.dispose?.();
  }

  state.restEditor.jointMarkers = [];

  if (state.restEditor.jointMarkerTexture) {
    state.restEditor.jointMarkerTexture.dispose?.();
    state.restEditor.jointMarkerTexture = null;
  }

  state.restEditor.hoveredMarkerBone = null;
}

function makeRestPoseJointMarkerTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, size, size);

  // Solid articulation dot. SpriteMaterial.color tints this white disc
  // blue/cyan/yellow according to normal/hover/selected state.
  context.beginPath();
  context.arc(size / 2, size / 2, 34, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255,255,255,1)';
  context.fill();

  // Subtle crisp edge so the marker remains readable over white geometry.
  context.beginPath();
  context.arc(size / 2, size / 2, 34, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(255,255,255,1)';
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateRestPoseJointMarkerStyles() {
  const selected = state.restEditor.selectedBone;
  const hovered = state.restEditor.hoveredMarkerBone;

  for (const marker of state.restEditor.jointMarkers || []) {
    const boneName = marker.userData?.boneName;
    const isSelected = boneName === selected;
    const isHovered = !isSelected && boneName === hovered;

    marker.material.color.setHex(
      isSelected
        ? 0xffd21a
        : isHovered
          ? 0x78d8ff
          : 0x4b9dff
    );

    marker.material.opacity = isSelected ? 1 : isHovered ? 1 : 0.96;
    marker.material.needsUpdate = true;
  }
}

function buildRestPoseJointMarkers() {
  disposeRestPoseJointMarkers();

  if (state.workspaceView !== 'restpose' || !state.source.root) return;

  const texture = makeRestPoseJointMarkerTexture();
  if (!texture) return;

  state.restEditor.jointMarkerTexture = texture;

  for (const entry of availableRestPoseBones()) {
    const bone = state.source.bones.get(entry.name);
    if (!bone) continue;

    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0x4b9dff,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      sizeAttenuation: true
    });

    const marker = new THREE.Sprite(material);
    marker.name = `RestPoseJointMarker:${entry.role}`;
    marker.renderOrder = 1400;
    marker.frustumCulled = false;
    marker.userData.restPoseJointMarker = true;
    marker.userData.boneName = entry.name;
    marker.userData.role = entry.role;
    marker.userData.label = entry.label;

    // Selection uses screen-space hit testing below, so the sprite itself
    // never steals TransformControls raycasts.
    marker.raycast = () => {};

    sourceView.scene.add(marker);
    state.restEditor.jointMarkers.push(marker);
  }

  updateRestPoseJointMarkers();
  updateRestPoseJointMarkerStyles();
}

function updateRestPoseJointMarkers() {
  if (state.workspaceView !== 'restpose' || !state.source.root) return;
  if (!state.restEditor.jointMarkers?.length) return;

  updateSlotWorld(state.source);

  const cameraWorld = sourceView.camera.getWorldPosition(new THREE.Vector3());
  const viewportHeight = Math.max(1, sourceView.renderer.domElement.clientHeight);
  const fovRadians = THREE.MathUtils.degToRad(sourceView.camera.fov);

  for (const marker of state.restEditor.jointMarkers) {
    const bone = state.source.bones.get(marker.userData?.boneName);
    if (!bone) {
      marker.visible = false;
      continue;
    }

    marker.visible = true;

    const world = bone.getWorldPosition(new THREE.Vector3());
    marker.position.copy(world);

    // Keep the visual marker at a near-constant pixel size while zooming.
    const distance = Math.max(0.01, cameraWorld.distanceTo(world));
    const worldHeight = 2 * distance * Math.tan(fovRadians * 0.5);
    const isSelected = marker.userData.boneName === state.restEditor.selectedBone;
    const pixels = isSelected
      ? (window.innerWidth <= 760 ? 28 : 24)
      : (window.innerWidth <= 760 ? 24 : 21);
    const worldSize = worldHeight * (pixels / viewportHeight);

    marker.scale.set(worldSize, worldSize, 1);
  }
}

function pickRestPoseJointMarker(clientX, clientY, hover = false) {
  if (state.workspaceView !== 'restpose' || !state.source.root) return null;
  if (!state.restEditor.jointMarkers?.length) return null;

  const rect = sourceView.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const point = {
    x: clientX - rect.left,
    y: clientY - rect.top
  };

  const coarsePointer =
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    navigator.maxTouchPoints > 0;

  const radius = hover
    ? 19
    : coarsePointer
      ? 32
      : 25;

  let best = null;

  for (const marker of state.restEditor.jointMarkers) {
    if (!marker.visible) continue;

    const world = marker.getWorldPosition(new THREE.Vector3());
    const projected = projectRestPosePoint(world, rect);
    const distance = Math.hypot(
      point.x - projected.x,
      point.y - projected.y
    );

    if (distance <= radius && (!best || distance < best.distance)) {
      best = { marker, distance };
    }
  }

  return best?.marker || null;
}

function handleRestPoseJointMarkerHover(event) {
  if (state.workspaceView !== 'restpose') return;
  if (event.pointerType === 'touch') return;
  if (state.restEditor.transform?.dragging) return;

  const marker = pickRestPoseJointMarker(event.clientX, event.clientY, true);
  const boneName = marker?.userData?.boneName || null;

  if (boneName !== state.restEditor.hoveredMarkerBone) {
    state.restEditor.hoveredMarkerBone = boneName;
    updateRestPoseJointMarkerStyles();
  }

  sourceView.renderer.domElement.style.cursor = marker ? 'pointer' : 'crosshair';
}

function clearRestPoseJointMarkerHover() {
  if (state.restEditor.hoveredMarkerBone) {
    state.restEditor.hoveredMarkerBone = null;
    updateRestPoseJointMarkerStyles();
  }

  if (state.workspaceView === 'restpose') {
    sourceView.renderer.domElement.style.cursor = 'crosshair';
  }
}

function updateRestPoseUi() {
  const select = $('restBoneSelect');
  const entries = availableRestPoseBones();

  if (select) {
    const previous = state.restEditor.selectedBone;
    select.innerHTML = '';

    if (!state.source.root) {
      select.add(new Option('Carga un Source', ''));
      select.disabled = true;
    } else if (!entries.length) {
      select.add(new Option('No encontré brazos/piernas compatibles', ''));
      select.disabled = true;
    } else {
      select.disabled = false;
      for (const entry of entries) {
        const bone = state.source.bones.get(entry.name);
        const original = originalObjectName(bone) || entry.name;
        select.add(new Option(`${entry.label} · ${original}`, entry.name));
      }

      const selected = entries.some(entry => entry.name === previous)
        ? previous
        : entries[0].name;
      select.value = selected;
    }
  }

  const hasSource = !!state.source.root;
  const hasSelection = !!state.restEditor.selectedBone;
  if ($('copyRestBone')) $('copyRestBone').disabled = !hasSelection;
  if ($('resetRestBone')) $('resetRestBone').disabled = !hasSelection;
  if ($('resetRestPose')) $('resetRestPose').disabled = !hasSource;
  if ($('commitRestPose')) $('commitRestPose').disabled = !hasSource;

  const hasTarget = !!state.target.root;
  const overlayButton = $('toggleRestTargetOverlay');
  if (overlayButton) {
    overlayButton.disabled = !(hasSource && hasTarget);
    overlayButton.classList.toggle('active', !!state.restEditor.targetOverlayEnabled);
    overlayButton.setAttribute('aria-pressed', state.restEditor.targetOverlayEnabled ? 'true' : 'false');
    overlayButton.textContent = state.restEditor.targetOverlayEnabled
      ? 'Target Overlay · ON'
      : 'Target Overlay';
  }

  const overlayOpacity = $('restTargetOverlayOpacity');
  if (overlayOpacity) {
    overlayOpacity.disabled = !(hasSource && hasTarget && state.restEditor.targetOverlayEnabled);
    if (document.activeElement !== overlayOpacity) {
      overlayOpacity.value = String(state.restEditor.targetOverlayOpacity);
    }
  }
  const overlayOpacityValue = $('restTargetOverlayOpacityValue');
  if (overlayOpacityValue) {
    overlayOpacityValue.textContent = `${Math.round(state.restEditor.targetOverlayOpacity * 100)}%`;
  }

  updateRestPoseUndoUi();

  const sensitivityInput = $('restSensitivity');
  const sensitivityValue = $('restSensitivityValue');
  if (sensitivityInput && document.activeElement !== sensitivityInput) {
    sensitivityInput.value = String(state.restEditor.sensitivity);
  }
  if (sensitivityValue) sensitivityValue.textContent = `${Math.round(restPoseSensitivity() * 100)}%`;

  const fullGimbalToggle = $('showFullRestGimbal');
  if (fullGimbalToggle) fullGimbalToggle.checked = !!state.restEditor.showFullGimbal;

  const status = $('restPoseStatus');
  if (status) {
    const selectedEntry = restPoseEntryByName(state.restEditor.selectedBone);
    const selectedText = selectedEntry ? ` · Selected: ${selectedEntry.label}` : '';
    status.textContent = !hasSource
      ? 'Carga un Source. El Target queda como referencia visual.'
      : state.restEditor.hasCustomRest
        ? `Rest personalizada activa para el próximo Transfer${selectedText}.`
        : `Rota brazos, codos, muslos o rodillas${selectedText}.`;
  }

  updateRestPoseJointMarkerStyles();
}

function selectRestPoseBone(name) {
  if (!state.source.root || !name || !state.source.bones.has(name)) {
    state.restEditor.selectedBone = null;
    state.restEditor.selectedRole = null;
    detachRestPoseTransform();
    updateRestPoseUi();
    return;
  }

  const entry = restPoseEntryByName(name);
  state.restEditor.selectedBone = name;
  state.restEditor.selectedRole = entry?.role || null;

  const transform = ensureRestPoseTransformControls();
  transform.attach(state.source.bones.get(name));
  transform.setMode('rotate');
  if (state.restEditor.transformHelper) state.restEditor.transformHelper.visible = state.workspaceView === 'restpose';

  const select = $('restBoneSelect');
  if (select) select.value = name;
  updateRestPoseUi();
}

function mirrorRestPoseDelta(deltaWorld) {
  const reflection = new THREE.Matrix4().makeScale(-1, 1, 1);
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(deltaWorld);
  rotation.premultiply(reflection).multiply(reflection);
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize();
}

function copySelectedRestBone() {
  const selectedName = state.restEditor.selectedBone;
  const selectedRole = state.restEditor.selectedRole;
  if (!selectedName || !selectedRole) return;

  const mirrorRole = REST_POSE_MIRROR.get(selectedRole);
  const mirrorEntry = availableRestPoseBones().find(entry => entry.role === mirrorRole);
  if (!mirrorEntry) return;

  const src = state.source;
  const selectedBone = src.bones.get(selectedName);
  const mirrorBone = src.bones.get(mirrorEntry.name);
  const selectedRest = src.rest.get(selectedName);
  const mirrorRest = src.rest.get(mirrorEntry.name);
  if (!selectedBone || !mirrorBone || !selectedRest || !mirrorRest) return;

  pushRestPoseUndo('Mirror Selected Bone');
  updateSlotWorld(src);
  const currentWorld = selectedBone.getWorldQuaternion(new THREE.Quaternion());
  const deltaWorld = currentWorld.multiply(selectedRest.worldQuat.clone().invert()).normalize();
  const mirroredDelta = mirrorRestPoseDelta(deltaWorld);
  const desiredMirrorWorld = mirroredDelta.multiply(mirrorRest.worldQuat).normalize();

  setBoneWorldQuaternion(src, mirrorBone, desiredMirrorWorld);
  updateSlotWorld(src);
  updateRigOverlays();

  log(`Redefine Rest Pose: ${originalObjectName(selectedBone) || selectedName} copiado en espejo a ${originalObjectName(mirrorBone) || mirrorEntry.name}.`);
}

function resetSelectedRestBone() {
  const name = state.restEditor.selectedBone;
  const rest = name ? state.source.rest.get(name) : null;
  const bone = name ? state.source.bones.get(name) : null;
  if (!rest || !bone) return;

  pushRestPoseUndo('Reset Bone');
  bone.position.copy(rest.position);
  bone.quaternion.copy(rest.quaternion);
  bone.scale.copy(rest.scale);
  updateSlotWorld(state.source);
  updateRigOverlays();
}

function resetRestPoseEditorPose() {
  if (!state.source.root) return;
  pushRestPoseUndo('Reset Pose');
  restoreRest(state.source);
  updateRigOverlays();
}

function invalidateRetargetAfterRestChange() {
  if (state.ghost?.container) {
    disposeGhostOverlay({ keepEnabled: true });
  }

  state.fkClip = null;
  state.fkRawClip = null;
  state.ikOnlyClip = null;
  state.deformPreviewClip = null;
  state.exportClip = null;
  state.targetPreviewClip = null;
  state.exported = false;

  if (state.target.root) {
    state.target.mixer?.stopAllAction?.();
    state.target.action = null;
    state.target.mixer = null;
    state.target.activeClip = null;
    restoreRest(state.target);
  }

  updateButtons();
  updateStats();
  updateWorkflowUI();
  updateTimelineBounds();
}

function commitRestPoseEditor() {
  if (!state.source.root) return;

  pushRestPoseUndo('Use This Pose as Rest');
  updateSlotWorld(state.source);
  captureRest(state.source);
  state.source.rigRuntime?.captureRest?.();
  state.restEditor.hasCustomRest = true;
  invalidateRetargetAfterRestChange();

  const selected = state.restEditor.selectedBone;
  if (selected && state.source.bones.has(selected)) selectRestPoseBone(selected);
  updateRestPoseUi();

  setStatus('Source Rest Pose redefinida', 'good');
  log('Redefine Rest Pose: la pose actual del Source se usará como Rest para el próximo retarget. La Action original no fue modificada.');
}

function enterRestPoseWorkspace() {
  state.playing = false;
  if ($('playPause')) $('playPause').textContent = '▶';

  if (state.source.root) {
    restoreRest(state.source);
    updateSlotWorld(state.source);
  }
  if (state.target.root) {
    restoreRest(state.target);
    updateSlotWorld(state.target);
  }

  if (state.restEditor.targetOverlayEnabled) {
    rebuildRestPoseTargetOverlay();
  }

  buildRestPoseJointMarkers();
  updateRestPoseUi();
  const entries = availableRestPoseBones();
  const selected = entries.some(entry => entry.name === state.restEditor.selectedBone)
    ? state.restEditor.selectedBone
    : entries[0]?.name;
  if (selected) selectRestPoseBone(selected);
}

function leaveRestPoseWorkspace() {
  detachRestPoseTransform();
  disposeRestPoseTargetOverlay();
  disposeRestPoseJointMarkers();
  if (state.source.root) restoreRest(state.source);
}

function pointSegmentDistance2D(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom > 1e-8
    ? THREE.MathUtils.clamp((apx * abx + apy * aby) / denom, 0, 1)
    : 0;
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  return Math.hypot(point.x - x, point.y - y);
}

function projectRestPosePoint(world, rect) {
  const p = world.clone().project(sourceView.camera);
  return {
    x: (p.x * 0.5 + 0.5) * rect.width,
    y: (-p.y * 0.5 + 0.5) * rect.height
  };
}

function pickRestPoseBoneFromViewport(event) {
  if (state.workspaceView !== 'restpose' || !state.source.root) return;
  if (state.restEditor.transform?.dragging) return;

  const marker = pickRestPoseJointMarker(event.clientX, event.clientY, false);
  if (marker?.userData?.boneName) {
    selectRestPoseBone(marker.userData.boneName);
    return;
  }

  const rect = sourceView.renderer.domElement.getBoundingClientRect();
  const click = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  let best = null;

  updateSlotWorld(state.source);

  for (const entry of availableRestPoseBones()) {
    const bone = state.source.bones.get(entry.name);
    if (!bone) continue;

    const startWorld = bone.getWorldPosition(new THREE.Vector3());
    const childBone = bone.children.find(child => child.isBone);
    const endWorld = childBone
      ? childBone.getWorldPosition(new THREE.Vector3())
      : startWorld.clone();

    const a = projectRestPosePoint(startWorld, rect);
    const b = projectRestPosePoint(endWorld, rect);
    const distance = pointSegmentDistance2D(click, a, b);

    if (!best || distance < best.distance) best = { entry, distance };
  }

  if (best && best.distance <= 22) {
    selectRestPoseBone(best.entry.name);
  }
}

sourceView.renderer.domElement.addEventListener('click', pickRestPoseBoneFromViewport);
sourceView.renderer.domElement.addEventListener('pointermove', handleRestPoseJointMarkerHover);
sourceView.renderer.domElement.addEventListener('pointerleave', clearRestPoseJointMarkerHover);

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


function humanoidRestSemantic(name) {
  const n = canonicalSemantic(name);
  const candidates = [
    'hips',
    'spine', 'spine1', 'spine2',
    'neck', 'head',
    'leftshoulder', 'rightshoulder',
    'leftarm', 'rightarm',
    'leftforearm', 'rightforearm',
    'leftupleg', 'rightupleg',
    'leftleg', 'rightleg',
    'leftfoot', 'rightfoot'
  ];
  return candidates.find(candidate => n.endsWith(candidate)) || '';
}

function findBoneByRestSemantic(bones, semantic) {
  if (!semantic) return null;

  for (const [name, bone] of bones) {
    const candidate = humanoidRestSemantic(originalObjectName(bone) || name);
    if (candidate === semantic) return bone;
  }

  return null;
}

function compareSourceModelRestToBindRest(sourceSlot, bindBones) {
  const samples = [];

  for (const [name, sourceBone] of sourceSlot.bones) {
    const semantic = humanoidRestSemantic(originalObjectName(sourceBone) || name);
    if (!semantic) continue;

    const bindBone =
      bindBones.get(name) ||
      findBoneByRestSemantic(bindBones, semantic);

    if (!bindBone) continue;

    samples.push({
      name,
      semantic,
      angleDeg: THREE.MathUtils.radToDeg(
        sourceBone.quaternion.angleTo(bindBone.quaternion)
      )
    });
  }

  const materiallyDifferent = samples.filter(sample => sample.angleDeg >= 12);
  const stronglyDifferent = samples.filter(sample => sample.angleDeg >= 25);
  const avgDeg = samples.length
    ? samples.reduce((sum, sample) => sum + sample.angleDeg, 0) / samples.length
    : 0;
  const maxDeg = samples.length
    ? Math.max(...samples.map(sample => sample.angleDeg))
    : 0;

  // Deliberately conservative. A normal FBX keeps its existing path.
  // We only switch when several major humanoid bones disagree strongly with
  // the explicit FBX BindPose, which is the "animation baked into Model pose"
  // case seen in some Mixamo-style FBX files.
  const useBindPose =
    samples.length >= 8 &&
    materiallyDifferent.length >= 4 &&
    stronglyDifferent.length >= 2 &&
    avgDeg >= 7 &&
    maxDeg >= 35;

  return {
    useBindPose,
    sampleCount: samples.length,
    materiallyDifferent: materiallyDifferent.length,
    stronglyDifferent: stronglyDifferent.length,
    avgDeg,
    maxDeg
  };
}

function deriveConditionalSourceBindRest(originalBuffer, sourceSlot) {
  if (!originalBuffer || !sourceSlot?.root || !sourceSlot.animations?.length) {
    return null;
  }

  let neutralized;

  try {
    // This utility does not alter Model transforms. It only rewrites a
    // temporary copy of the Action so frame 0 evaluates to the FBX BindPose.
    // The original Source bytes and original Source Action remain untouched.
    neutralized = rewriteTargetActionsToBindRest(originalBuffer);
  } catch (error) {
    return {
      applied: false,
      reason: 'bind-pose-unavailable',
      error: error?.message || String(error)
    };
  }

  const report = neutralized?.report;
  if (
    !report?.bindModels ||
    !report?.curvesRewritten ||
    !neutralized?.bytes?.byteLength
  ) {
    return {
      applied: false,
      reason: 'no-usable-bind-pose',
      report
    };
  }

  let candidateRoot = null;
  let mixer = null;

  try {
    const bytes = neutralized.bytes;
    const candidateBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );

    const candidateAsset = fbxLoader.parse(candidateBuffer, '');
    candidateRoot = candidateAsset.root;
    const candidateClips = [...candidateAsset.animations];

    if (!candidateRoot || !candidateClips.length) {
      return {
        applied: false,
        reason: 'bind-pose-no-candidate-action',
        report
      };
    }

    mixer = new THREE.AnimationMixer(candidateRoot);
    const action = mixer.clipAction(candidateClips[0]);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(0);
    candidateRoot.updateMatrixWorld(true);

    const bindBones = collectBones(candidateRoot);
    const detection = compareSourceModelRestToBindRest(sourceSlot, bindBones);

    if (!detection.useBindPose) {
      return {
        applied: false,
        reason: 'model-rest-matches-bind-pose',
        report,
        detection
      };
    }

    const bindRest = new Map();

    for (const [name, sourceBone] of sourceSlot.bones) {
      const semantic = humanoidRestSemantic(originalObjectName(sourceBone) || name);
      const candidateBone =
        bindBones.get(name) ||
        findBoneByRestSemantic(bindBones, semantic);

      if (!candidateBone) continue;

      bindRest.set(name, {
        position: candidateBone.position.clone(),
        quaternion: candidateBone.quaternion.clone(),
        scale: candidateBone.scale.clone(),
        worldPos: candidateBone.getWorldPosition(new THREE.Vector3()),
        worldQuat: candidateBone.getWorldQuaternion(new THREE.Quaternion()),
        worldScale: candidateBone.getWorldScale(new THREE.Vector3())
      });
    }

    if (bindRest.size < Math.max(8, Math.floor(sourceSlot.bones.size * 0.4))) {
      return {
        applied: false,
        reason: 'bind-pose-insufficient-bone-match',
        report,
        detection,
        matchedBones: bindRest.size
      };
    }

    // Any bone absent from the FBX BindPose falls back to the already captured
    // Model-local rest, so the condition never destroys partial/custom rigs.
    for (const [name, current] of sourceSlot.rest) {
      if (bindRest.has(name)) continue;

      bindRest.set(name, {
        position: current.position.clone(),
        quaternion: current.quaternion.clone(),
        scale: current.scale.clone(),
        worldPos: current.worldPos.clone(),
        worldQuat: current.worldQuat.clone(),
        worldScale: current.worldScale.clone()
      });
    }

    sourceSlot.rest = bindRest;
    sourceSlot.restSource = 'fbx-bind-pose';
    sourceSlot.restDetection = {
      ...detection,
      bindModels: report.bindModels,
      curvesRewritten: report.curvesRewritten
    };

    restoreRest(sourceSlot);
    sourceSlot.rigRuntime?.captureRest?.();

    return {
      applied: true,
      reason: 'model-rest-differs-from-bind-pose',
      report,
      detection,
      matchedBones: bindRest.size
    };
  } catch (error) {
    return {
      applied: false,
      reason: 'bind-pose-derivation-failed',
      report,
      error: error?.message || String(error)
    };
  } finally {
    mixer?.stopAllAction?.();

    if (candidateRoot) {
      candidateRoot.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material?.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
    }
  }
}


function buildNeutralTargetBaselineClip(slot, clips) {
  if (!slot?.root || slot.kind !== 'target') return null;

  const byTrack = new Map();

  for (const clip of clips || []) {
    for (const track of clip.tracks || []) {
      const parsed = parseTrackTarget(track.name);
      if (!parsed) continue;
      if (!['position', 'quaternion', 'scale'].includes(parsed.property)) continue;
      if (!slot.bones.has(parsed.nodeName)) continue;

      // All Target input Actions have already been rewritten to the same
      // Bind/Rest values. Keep one copy of every TRS channel that exists in
      // any of them; this becomes the neutral baseline for future exports.
      if (!byTrack.has(track.name)) {
        byTrack.set(track.name, track.clone());
      }
    }
  }

  if (!byTrack.size) return null;

  return new THREE.AnimationClip(
    'Target_BindRest_Baseline',
    0,
    [...byTrack.values()]
  );
}

function constantTrackForDuration(track, duration) {
  const size = track.getValueSize?.() || 0;
  if (!size || !track.values?.length) return null;

  const value = Array.from(track.values.slice(0, size));
  const times = duration > 0 ? [0, duration] : [0];
  const values = [];

  for (let i = 0; i < times.length; i++) values.push(...value);

  const out = new track.constructor(track.name, times, values);
  if (track.getInterpolation && out.setInterpolation) {
    out.setInterpolation(track.getInterpolation());
  }
  return out;
}

function withTargetNeutralBaseline(clip) {
  if (!clip) return null;

  const baseline = state.target.neutralBaseClip;
  if (!baseline?.tracks?.length) return clip.clone();

  const byTrack = new Map();

  // Baseline first: every channel that existed in the incoming Target Action
  // receives an explicit Bind/Rest value for the full exported duration.
  for (const track of baseline.tracks) {
    const constant = constantTrackForDuration(track, clip.duration);
    if (constant) byTrack.set(constant.name, constant);
  }

  // Retarget/IK tracks override the corresponding neutral channel.
  for (const track of clip.tracks) {
    byTrack.set(track.name, track.clone());
  }

  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    [...byTrack.values()]
  );
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
  disposeUeArpHelperBridge();

  if (slot.kind === 'target') {
    restoreAutoRigProSkinMatrixOverrides();
    state.arpSkinPreviewCache.targetRoot = null;
    state.arpSkinPreviewCache.weightedNames = null;
    state.arpSkinPreviewCache.bindings = null;
  }

  if (state.ghost?.container) {
    disposeGhostOverlay({ keepEnabled: true });
  }

  if (state.restEditor?.targetOverlayRoot) {
    disposeRestPoseTargetOverlay();
  }
  if (state.restEditor?.jointMarkers?.length) {
    disposeRestPoseJointMarkers();
  }

  if (slot.kind === 'target' && slot.displayRoot) {
    const baseY = slot.displayRoot.userData?.waltPreviewBaseY;
    if (Number.isFinite(baseY)) slot.displayRoot.position.y = baseY;
  }
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

  // Target-only: rewrite the FBX's own Action curve VALUES to its BindPose.
  // The original bytes stay untouched in slot.originalBuffer for later export.
  let parseBuffer = buffer;
  let targetRestActionReport = null;

  if (slot.kind === 'target') {
    const neutralized = rewriteTargetActionsToBindRest(buffer);
    targetRestActionReport = neutralized.report;

    if (neutralized.report.curvesRewritten > 0) {
      parseBuffer = neutralized.bytes.buffer.slice(
        neutralized.bytes.byteOffset,
        neutralized.bytes.byteOffset + neutralized.bytes.byteLength
      );
    }
  }

  const asset = fbxLoader.parse(parseBuffer, '');
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

  // If the Target arrived with Actions, their FBX curve values were rewritten
  // above to the real BindPose. Evaluate that rewritten Action first and ONLY
  // then capture the retarget rest. This is the same pattern seen in a proper
  // Blender "rest Action": Pose Location=0 / Rotation=identity / Scale=1,
  // while the raw FBX curves contain the bone's bind-local Lcl values.
  const hasRewrittenTargetAction =
    slot.kind === 'target' &&
    (targetRestActionReport?.curvesRewritten || 0) > 0 &&
    loadedAnimations.length > 0;

  slot.neutralBaseClip = hasRewrittenTargetAction
    ? buildNeutralTargetBaselineClip(slot, loadedAnimations)
    : null;

  if (hasRewrittenTargetAction) {
    slot.mixer = new THREE.AnimationMixer(root);
    slot.activeClip = loadedAnimations[0];
    slot.action = slot.mixer.clipAction(slot.activeClip);
    slot.action.setLoop(THREE.LoopRepeat, Infinity).play();
    slot.mixer.setTime(0);
    updateSlotWorld(slot);

    captureRest(slot);

    // CloudRig runtime was created before the neutral Action was evaluated,
    // so refresh its own FK/DEF rest cache from this corrected pose as well.
    slot.rigRuntime?.captureRest?.();

    slot.action.stop();
    slot.mixer.stopAllAction();
    slot.action = null;
    slot.mixer = null;
    slot.activeClip = null;

    // Target input Actions are still not reused by retarget/playback.
    // Their only job here was to establish the correct neutral rest.
    slot.animations = [];
    root.animations = [];

    restoreRest(slot);
    slot.rigRuntime?.resetDriven?.();
    restoreRest(slot);
  } else {
    captureRest(slot);

    if (slot.kind === 'source') {
      const bindRestResult = deriveConditionalSourceBindRest(buffer, slot);

      if (bindRestResult?.applied) {
        const d = bindRestResult.detection;
        log(
          `Source Rest auto-detect: pose Model distinta de BindPose · usando BindPose FBX. ` +
          `${d.materiallyDifferent}/${d.sampleCount} huesos principales ≥12°, ` +
          `${d.stronglyDifferent} ≥25°, avg=${d.avgDeg.toFixed(1)}°, max=${d.maxDeg.toFixed(1)}°.`
        );
      } else if (bindRestResult?.detection) {
        const d = bindRestResult.detection;
        slot.restSource = 'model-local';
        slot.restDetection = d;
        log(
          `Source Rest auto-detect: pose Model compatible con BindPose · sin corrección. ` +
          `${d.materiallyDifferent}/${d.sampleCount} huesos ≥12°, ` +
          `avg=${d.avgDeg.toFixed(1)}°, max=${d.maxDeg.toFixed(1)}°.`
        );
      } else if (
        bindRestResult?.reason &&
        bindRestResult.reason !== 'no-usable-bind-pose'
      ) {
        log(
          `Source Rest auto-detect: fallback Model pose (${bindRestResult.reason}` +
          `${bindRestResult.error ? ': ' + bindRestResult.error : ''}).`
        );
      }
    }

    if (slot.kind === 'target') {
      slot.animations = [];
      root.animations = [];
      slot.activeClip = null;
      slot.action?.stop?.();
      slot.action = null;
      slot.mixer?.stopAllAction?.();
      slot.mixer = null;
      slot.rigRuntime?.resetDriven?.();
      restoreRest(slot);
    }
  }

  fitView(view, slot.displayRoot);

  if (slot.kind === 'source') {
    $('sourceLabel').textContent = `${file.name} · ${slot.bones.size} huesos · ${asset.rig.profile}`;
    fillSourceClips();
    const inferred = inferPrefix(slot);
    if (inferred) $('sourcePrefix').value = inferred;
    rememberSourceForActionPacker(file);
    log(`WaltFBX v${WALT_FBX_VERSION} Source: ${file.name}; profile=${asset.rig.profile}; ${slot.bones.size} huesos; ${loadedAnimations.length} Actions; Rest=${slot.restSource}; UpAxis=${asset.metadata.upAxis}; axis=${asset.metadata.axisNormalization}; UnitScaleFactor=${asset.metadata.unitScaleFactor}; ×${slot.unitScale.toFixed(4)} m; Constraints FBX=${asset.metadata.constraintCount}.`);
  } else {
    $('targetLabel').textContent = `${file.name} · ${slot.bones.size} huesos · ${displayRigProfile(slot)}`;
    const rewrittenCurves = targetRestActionReport?.curvesRewritten || 0;
    $('targetAnimNotice').textContent = loadedAnimations.length
      ? rewrittenCurves
        ? `Target con ${loadedAnimations.length} Action(s): ${rewrittenCurves} curvas reescritas a Rest desde BindPose.`
        : `Target con ${loadedAnimations.length} Action(s): no fue necesario reescribir curvas.`
      : 'Target sin Actions de entrada. Correcto.';
    const runtimeInfo = slot.rigRuntime?.status;
    log(`WaltFBX v${WALT_FBX_VERSION} Target: ${file.name}; profile=${asset.rig.profile}; ${slot.bones.size} huesos; Actions entrada=${loadedAnimations.length}; curvas Rest reescritas=${rewrittenCurves}; baseline TRS=${slot.neutralBaseClip?.tracks?.length || 0}; BindPose models=${targetRestActionReport?.bindModels || 0}; UnitScaleFactor=${asset.metadata.unitScaleFactor}; ×${slot.unitScale.toFixed(4)} m; Constraints FBX=${asset.metadata.constraintCount}; WaltRig FK→DEF=${runtimeInfo ? `${runtimeInfo.bindings}/${runtimeInfo.requestedBindings}` : 'n/a'}.`);
  }

  state.fkClip = state.fkRawClip = state.ikOnlyClip = state.deformPreviewClip = state.exportClip = state.targetPreviewClip = null;
  state.exported = false;
  refreshMapUi();
  updateButtons();
  updateTimelineBounds();

  if (slot.kind === 'source') {
    state.restEditor.selectedBone = null;
    state.restEditor.selectedRole = null;
    state.restEditor.hasCustomRest = false;
    state.restEditor.undoStack = [];
    state.restEditor.dragBaseQuaternion = null;
  }
  updateRestPoseUi();

  if (state.workspaceView === 'restpose' && state.source.root) {
    buildRestPoseJointMarkers();

    if (
      state.restEditor.targetOverlayEnabled &&
      state.target.root
    ) {
      rebuildRestPoseTargetOverlay();
    }
  }

  setStatus('LOCAL · sin subida', 'good');

  const bothLoaded = !!state.source.root && !!state.target.root;
  if (bothLoaded && !state.dualFbxReady) {
    // Let the loaded FBX render first, then reveal the newly available UI.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => updateConditionalFeatureVisibility(true), 140);
      });
    });
  } else {
    updateConditionalFeatureVisibility(false);
  }

  if (bothLoaded && $('preset').value !== 'none') {
    state.activePreset = null;
    updateTransferBridgeVisibility(false);
    void loadPreset().then(() => {
      const compatible = presetMatchesLoadedRigs();
      updateTransferBridgeVisibility(compatible);
    });
  } else {
    updateTransferBridgeVisibility(false);
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

  if (state.ghost?.enabled && state.targetPreviewClip) {
    rebuildGhostOverlay();
  }

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

async function fetchPresetDefinitionData(id, definition) {
  if (definition.inline) {
    return {
      name: definition.label,
      source_prefix: definition.sourceFamily === 'mixamo' ? 'mixamorig:' : '',
      pairs: definition.inline
    };
  }

  const response = await fetch(
    definition.path + '?v=20260922-restoverlay2',
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error(
      `No pude cargar ${definition.label}: HTTP ${response.status}`
    );
  }

  return response.json();
}

function resolvePresetTargetBone(definition, spec) {
  const candidates = Array.isArray(spec) ? [...spec] : [spec];

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
}

function scorePresetAgainstLoadedRigs(definition, presetData) {
  const pairs = presetData?.pairs || [];
  if (!pairs.length) {
    return {
      resolvedBoth: 0,
      resolvedSource: 0,
      resolvedTarget: 0,
      ratio: 0,
      score: 0
    };
  }

  let resolvedSource = 0;
  let resolvedTarget = 0;
  let resolvedBoth = 0;

  for (const entry of pairs) {
    const source = findSemanticBone(state.source, entry.source) || '';
    const target = resolvePresetTargetBone(definition, entry.target);

    if (source) resolvedSource++;
    if (target) resolvedTarget++;
    if (source && target) resolvedBoth++;
  }

  const ratio = resolvedBoth / pairs.length;

  // Pair matches dominate. Target coverage is the tie-breaker that lets
  // Auto-preset distinguish variants such as Rigify New vs Old.
  const score =
    ratio * 1_000_000 +
    resolvedBoth * 1_000 +
    resolvedTarget * 10 +
    resolvedSource;

  return {
    resolvedBoth,
    resolvedSource,
    resolvedTarget,
    ratio,
    score
  };
}

async function detectAutoPreset() {
  if (!state.source.root || !state.target.root) return null;

  if (targetLooksMixamoControlRig()) {
    log(
      'Auto-preset: Target reconocido como Mixamo Control Rig por firma de controles ' +
      '(Ctrl_Master / Ctrl_Hips / FK / IK), aunque el perfil base sea ' +
      `"${loadedRigProfile(state.target) || 'desconocido'}".`
    );
  }

  if (targetLooksAutoRigPro()) {
    log(
      'Auto-preset: Target reconocido como Auto-Rig Pro por firma de controles ' +
      '(c_root / c_spine / FK / IK), aunque el perfil base sea ' +
      `"${loadedRigProfile(state.target) || 'desconocido'}".`
    );
  }

  if (targetLooksUnrealEngine()) {
    log(
      'Auto-preset: Target reconocido como Unreal Engine por firma ' +
      '(root / pelvis / spine / upperarm / calf / foot).'
    );
  }

  const candidates = Object.entries(BLENDCAP_PRESET_REGISTRY)
    .filter(([, definition]) =>
      sourceMatchesPresetFamily(definition.sourceFamily) &&
      targetMatchesPresetFamily(definition.targetFamily)
    );

  if (!candidates.length) return null;

  const scored = [];

  for (const [id, definition] of candidates) {
    try {
      const data = await fetchPresetDefinitionData(id, definition);
      const metrics = scorePresetAgainstLoadedRigs(definition, data);

      scored.push({
        id,
        definition,
        data,
        ...metrics
      });
    } catch (error) {
      log(`Auto-preset omitió ${definition.label}: ${error.message}`);
    }
  }

  scored.sort((a, b) =>
    b.score - a.score ||
    b.resolvedBoth - a.resolvedBoth ||
    a.id.localeCompare(b.id)
  );

  const best = scored[0] || null;
  if (!best || best.resolvedBoth <= 0) return null;

  return best;
}

async function loadPreset() {
  if (!state.source.root || !state.target.root) {
    log('Preset pendiente: primero carga Source y Target.');
    return;
  }

  const requestedId = $('preset').value;

  if (requestedId === 'none') {
    state.activePresetId = 'none';
    state.activePreset = null;
    state.boneMap = [];
    refreshMapUi();
    updateButtons();
    updateTransferBridgeVisibility(false);
    log('Preset desactivado.');
    return;
  }

  let id = requestedId;
  let definition = null;
  let presetData = null;
  let autoMetrics = null;

  if (requestedId === 'auto') {
    const detected = await detectAutoPreset();

    if (!detected) {
      state.activePresetId = 'none';
      state.activePreset = null;
      state.boneMap = [];
      refreshMapUi();
      updateButtons();
      updateStats();
      updateTransferBridgeVisibility(false);
      setStatus('Auto-preset · sin coincidencia', 'bad');
      log('Auto-preset: no encontré un preset compatible con las dos armaduras cargadas.');
      return;
    }

    id = detected.id;
    definition = detected.definition;
    presetData = detected.data;
    autoMetrics = detected;

    log(
      `Auto-preset → ${definition.label} · ` +
      `${detected.resolvedBoth}/${presetData.pairs?.length || 0} pares detectados.`
    );
  } else {
    definition = BLENDCAP_PRESET_REGISTRY[id];

    if (!definition) {
      throw new Error(`Preset desconocido: ${id}`);
    }

    presetData = await fetchPresetDefinitionData(id, definition);
  }

  state.activePresetId = id;
  state.activePreset = {
    id,
    autoDetected: requestedId === 'auto',
    autoMetrics,
    ...definition,
    data: presetData
  };

  if (definition.sourceFamily === 'mixamo') {
    $('sourcePrefix').value =
      inferPrefix(state.source) ||
      presetData.source_prefix ||
      $('sourcePrefix').value ||
      '';
  } else if (definition.sourceFamily === 'ue') {
    $('sourcePrefix').value = presetData.source_prefix || '';
  }

  if (definition.targetFamily === 'mixamo') {
    $('targetPrefix').value =
      inferPrefix(state.target) ||
      $('targetPrefix').value ||
      '';
  }

  const pairs = presetData.pairs || [];
  state.boneMap = pairs.map(entry => ({
    source: findSemanticBone(state.source, entry.source) || '',
    target: resolvePresetTargetBone(definition, entry.target),
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
  updateTransferBridgeVisibility(false);

  const resolved = state.boneMap.filter(isPairValid).length;
  const headLocal = state.boneMap.filter(p => p.locSpace === 'head_local').length;

  log(
    `${requestedId === 'auto' ? 'Auto-preset' : 'Preset'} ${definition.label}: ` +
    `${resolved}/${pairs.length} pares resueltos` +
    (headLocal ? ` · face head_local=${headLocal}` : '') +
    ` · ${definition.sourceFamily} → ${definition.targetFamily}.`
  );

  if (requestedId === 'auto') {
    setStatus(`Auto-preset · ${definition.label}`, 'good');
  }
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

function mappingPreviewBoneSet(slot, side) {
  if (!slot?.root) return new Set();

  const reverse = new Map();
  for (const [name, bone] of slot.bones) reverse.set(bone, name);

  const selected = new Set();

  for (const pair of state.boneMap) {
    const name = side === 'source' ? pair.source : pair.target;
    if (name && slot.bones.has(name)) selected.add(name);
  }

  // If Mapping is still empty, show the rig itself. For very large control
  // rigs we avoid drawing hundreds of helper branches until a map exists.
  if (!selected.size) {
    const all = [...slot.bones.keys()];
    if (all.length <= 160) return new Set(all);

    for (const [name, bone] of slot.bones) {
      const original = originalObjectName(bone) || name;
      if (
        /(^|[:._-])(root|hips|pelvis|spine|chest|neck|head|shoulder|clavicle|arm|forearm|hand|thigh|upleg|leg|calf|knee|foot|toe)([.:_-]|$)/i.test(original) &&
        !/(pole|mch|str-|helper|twist|roll|mechanism)/i.test(original)
      ) {
        selected.add(name);
      }
    }
  }

  // Keep the path to the rig root so the spatial relationship remains clear.
  for (const name of [...selected]) {
    let bone = slot.bones.get(name)?.parent;
    let guard = 0;

    while (bone && guard++ < 64) {
      const parentName = reverse.get(bone);
      if (parentName) selected.add(parentName);
      bone = bone.parent;
    }
  }

  return selected;
}

function mappingPreviewRestPosition(slot, name) {
  const rest = slot?.rest?.get(name);
  if (rest?.worldPos) return rest.worldPos.clone();

  const bone = slot?.bones?.get(name);
  return bone
    ? bone.getWorldPosition(new THREE.Vector3())
    : null;
}

function drawMappingSkeleton(canvas, slot, side, selectedName) {
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const hitState = state.mappingPreviewHits?.[side];
  if (hitState) {
    hitState.joints = [];
    hitState.segments = [];
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const lineColor =
    styles.getPropertyValue('--border-strong').trim() ||
    'rgba(130,150,180,.72)';
  const nodeColor =
    styles.getPropertyValue('--muted').trim() ||
    'rgba(150,165,190,.9)';
  const textColor =
    styles.getPropertyValue('--muted').trim() ||
    '#94a3b8';
  const selectedColor = '#facc15';

  if (!slot?.root) {
    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      side === 'source' ? 'Carga un Source' : 'Carga un Target',
      width * 0.5,
      height * 0.5
    );
    return;
  }

  const visible = mappingPreviewBoneSet(slot, side);
  const reverse = new Map();
  for (const [name, bone] of slot.bones) reverse.set(bone, name);

  const points = new Map();

  for (const name of visible) {
    const p = mappingPreviewRestPosition(slot, name);
    if (p) points.set(name, p);
  }

  if (!points.size) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;

  for (const p of points.values()) {
    minX=Math.min(minX,p.x);
    maxX=Math.max(maxX,p.x);
    minY=Math.min(minY,p.y);
    maxY=Math.max(maxY,p.y);
  }

  const spanX=Math.max(maxX-minX,1e-4);
  const spanY=Math.max(maxY-minY,1e-4);
  const padding=18;
  const usableW=Math.max(1,width-padding*2);
  const usableH=Math.max(1,height-padding*2);
  const scale=Math.min(usableW/spanX,usableH/spanY);
  const centerX=(minX+maxX)*0.5;
  const centerY=(minY+maxY)*0.5;

  const project = p => ({
    x: width*0.5 + (p.x-centerX)*scale,
    y: height*0.5 - (p.y-centerY)*scale
  });

  // First pass: regular hierarchy.
  ctx.lineCap='round';
  ctx.lineJoin='round';

  for (const [name,p] of points) {
    const bone=slot.bones.get(name);
    if(!bone) continue;

    let parent=bone.parent;
    let parentName='';

    while(parent) {
      const candidate=reverse.get(parent);
      if(candidate && points.has(candidate)) {
        parentName=candidate;
        break;
      }
      parent=parent.parent;
    }

    if(!parentName) continue;

    const a=project(points.get(parentName));
    const b=project(p);
    const highlighted=name===selectedName;

    if (hitState) {
      hitState.segments.push({
        name,
        parentName,
        ax:a.x,
        ay:a.y,
        bx:b.x,
        by:b.y
      });
    }

    ctx.beginPath();
    ctx.moveTo(a.x,a.y);
    ctx.lineTo(b.x,b.y);
    ctx.strokeStyle=highlighted ? selectedColor : lineColor;
    ctx.lineWidth=highlighted ? 3.5 : 1.75;
    ctx.globalAlpha=highlighted ? 1 : 0.74;
    ctx.stroke();
  }

  // Bone joints.
  for (const [name,p] of points) {
    const q=project(p);
    const highlighted=name===selectedName;

    if (hitState) {
      hitState.joints.push({
        name,
        x:q.x,
        y:q.y
      });
    }

    ctx.beginPath();
    ctx.arc(q.x,q.y,highlighted ? 7 : 4,0,Math.PI*2);
    ctx.fillStyle=highlighted ? selectedColor : nodeColor;
    ctx.globalAlpha=highlighted ? 1 : 0.88;
    ctx.fill();

    if(highlighted) {
      ctx.beginPath();
      ctx.arc(q.x,q.y,11,0,Math.PI*2);
      ctx.strokeStyle='rgba(250,204,21,.32)';
      ctx.lineWidth=4;
      ctx.stroke();
    }
  }

  ctx.globalAlpha=1;
}

function renderMappingSkeletonPreview() {
  const sourceCanvas=$('mappingSourceSkeleton');
  const targetCanvas=$('mappingTargetSkeleton');
  if(!sourceCanvas || !targetCanvas) return;

  let index=state.mappingPreviewSelectedIndex;

  if(
    index == null ||
    index < 0 ||
    index >= state.boneMap.length
  ) {
    index=null;
    state.mappingPreviewSelectedIndex=null;
  }

  const pair=index == null ? null : state.boneMap[index];
  const sourceName=pair?.source || '';
  const targetName=pair?.target || '';

  drawMappingSkeleton(
    sourceCanvas,
    state.source,
    'source',
    sourceName
  );

  drawMappingSkeleton(
    targetCanvas,
    state.target,
    'target',
    targetName
  );

  const sourceLabel=$('mappingSourceBoneLabel');
  const targetLabel=$('mappingTargetBoneLabel');
  const hint=$('mappingPreviewHint');

  if(sourceLabel) {
    sourceLabel.textContent=sourceName
      ? (originalObjectName(state.source.bones.get(sourceName)) || sourceName)
      : '—';
  }

  if(targetLabel) {
    targetLabel.textContent=targetName
      ? (originalObjectName(state.target.bones.get(targetName)) || targetName)
      : '—';
  }

  if(hint) {
    if(pair) {
      const s=sourceLabel?.textContent || sourceName || '—';
      const t=targetLabel?.textContent || targetName || '—';
      hint.textContent=`${s} → ${t}`;
    } else {
      hint.textContent='Selecciona una fila para comparar ambos huesos.';
    }
  }
}

function selectMappingPreviewPair(index, { scrollIntoView = false } = {}) {
  state.mappingPreviewSelectedIndex=index;

  let selectedRow=null;

  document.querySelectorAll('#boneMap .map-row').forEach(row => {
    const selected=Number(row.dataset.mapIndex)===index;
    row.classList.toggle('selected',selected);
    if(selected) selectedRow=row;
  });

  renderMappingSkeletonPreview();

  if(scrollIntoView && selectedRow) {
    selectedRow.scrollIntoView({
      block:'nearest',
      behavior:'smooth'
    });
  }
}

function pointToSegmentDistance(px,py,ax,ay,bx,by) {
  const abx=bx-ax;
  const aby=by-ay;
  const apx=px-ax;
  const apy=py-ay;
  const denom=abx*abx+aby*aby;

  if(denom<=1e-9) {
    return Math.hypot(px-ax,py-ay);
  }

  const t=THREE.MathUtils.clamp(
    (apx*abx+apy*aby)/denom,
    0,
    1
  );

  const qx=ax+abx*t;
  const qy=ay+aby*t;
  return Math.hypot(px-qx,py-qy);
}

function mappingPreviewBoneAtPoint(side,x,y) {
  const hits=state.mappingPreviewHits?.[side];
  if(!hits) return '';

  let bestName='';
  let bestDistance=Infinity;

  // Joints get priority and a generous touch target.
  for(const joint of hits.joints || []) {
    const distance=Math.hypot(x-joint.x,y-joint.y);
    if(distance<bestDistance) {
      bestDistance=distance;
      bestName=joint.name;
    }
  }

  if(bestDistance<=24) return bestName;

  // Clicking near a bone line selects the child bone represented by that line.
  for(const segment of hits.segments || []) {
    const distance=pointToSegmentDistance(
      x,y,
      segment.ax,segment.ay,
      segment.bx,segment.by
    );

    if(distance<bestDistance) {
      bestDistance=distance;
      bestName=segment.name;
    }
  }

  return bestDistance<=18 ? bestName : '';
}

function mappingPreviewPairIndexForBone(side,boneName) {
  if(!boneName) return -1;

  const key=side==='source' ? 'source' : 'target';

  // Prefer the currently selected row if it uses the clicked bone.
  const selected=state.mappingPreviewSelectedIndex;
  if(
    selected!=null &&
    state.boneMap[selected]?.[key]===boneName
  ) {
    return selected;
  }

  return state.boneMap.findIndex(pair => pair?.[key]===boneName);
}

function handleMappingSkeletonPointer(event,side) {
  const canvas=event.currentTarget;
  if(!(canvas instanceof HTMLCanvasElement)) return;

  const rect=canvas.getBoundingClientRect();
  if(rect.width<=0 || rect.height<=0) return;

  const x=event.clientX-rect.left;
  const y=event.clientY-rect.top;
  const boneName=mappingPreviewBoneAtPoint(side,x,y);

  if(!boneName) return;

  const index=mappingPreviewPairIndexForBone(side,boneName);

  if(index>=0) {
    selectMappingPreviewPair(index,{scrollIntoView:true});
    return;
  }

  // The preview may include hierarchy parents that are not directly mapped.
  // Keep the interaction explicit instead of silently selecting the wrong row.
  const slot=side==='source' ? state.source : state.target;
  const label=originalObjectName(slot.bones.get(boneName)) || boneName;
  const hint=$('mappingPreviewHint');

  if(hint) {
    hint.textContent=`${label} · sin par directo en el mapping`;
  }
}

function refreshMapUi() {
  const host = $('boneMap');
  const sourceNames = [...state.source.bones.keys()].sort();
  const targetNames = [...state.target.bones.keys()].sort();
  if (!state.source.root || !state.target.root) {
    host.className = 'bone-map empty';
    host.textContent = 'Carga ambos FBX para ver los pares de Mapping aquí.';
    $('mapCount').textContent = '0 / 0 válidos';
    state.mappingPreviewSelectedIndex = null;
    renderMappingSkeletonPreview();
    return;
  }

  if (
    state.mappingPreviewSelectedIndex != null &&
    state.mappingPreviewSelectedIndex >= state.boneMap.length
  ) {
    state.mappingPreviewSelectedIndex = null;
  }

  host.className = 'bone-map';
  host.innerHTML = '';
  const q = $('mapSearch').value.trim().toLowerCase();
  const conflicts = conflictingPairIndexes();

  state.boneMap.forEach((pair, index) => {
    if (q && !`${pair.source} ${pair.target}`.toLowerCase().includes(q)) return;
    const duplicate = conflicts.has(index);
    const row = document.createElement('div');
    row.dataset.mapIndex = String(index);
    row.className =
      `map-row ${(!isPairValid(pair) || duplicate) ? 'invalid' : ''} ` +
      `${state.mappingPreviewSelectedIndex === index ? 'selected' : ''}`;

    row.onclick = event => {
      if (event.target instanceof HTMLButtonElement) return;
      selectMappingPreviewPair(index);
    };

    const s = document.createElement('select');
    s.append(new Option('— Source —', ''));
    sourceNames.forEach(n => s.add(new Option(originalObjectName(state.source.bones.get(n)) || n, n)));
    s.value = pair.source;
    s.onfocus = () => selectMappingPreviewPair(index);
    s.onchange = () => {
      state.mappingPreviewSelectedIndex = index;
      state.boneMap[index].source = s.value;
      refreshMapUi();
      updateButtons();
    };

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
    t.onfocus = () => selectMappingPreviewPair(index);
    t.onchange = () => {
      state.mappingPreviewSelectedIndex = index;
      state.boneMap[index].target = t.value;
      refreshMapUi();
      updateButtons();
    };

    const remove = document.createElement('button');
    remove.className = 'row-remove';
    remove.textContent = '×';
    remove.title = 'Quitar par';
    remove.onclick = event => {
      event.stopPropagation();

      if (state.mappingPreviewSelectedIndex === index) {
        state.mappingPreviewSelectedIndex = null;
      } else if (
        state.mappingPreviewSelectedIndex != null &&
        state.mappingPreviewSelectedIndex > index
      ) {
        state.mappingPreviewSelectedIndex--;
      }

      state.boneMap.splice(index, 1);
      refreshMapUi();
      updateButtons();
    };

    row.append(s, arrow, t, remove);
    host.appendChild(row);
  });

  $('mapCount').textContent = `${validMap().length} / ${state.boneMap.length} válidos`;
  renderMappingSkeletonPreview();
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

function findMixamoControlRigDeformBone(slot, semantic) {
  if (!slot?.root || !semantic) return '';

  const wanted = canonicalSemantic(semantic);

  for (const [loadedName, bone] of slot.bones) {
    const original = originalObjectName(bone) || loadedName;
    if (!/^mixamorig\d*:/i.test(original)) continue;

    const tail = original.split(':').pop();
    if (canonicalSemantic(tail) === wanted) return loadedName;
  }

  for (const [loadedName, bone] of slot.bones) {
    const original = originalObjectName(bone) || loadedName;
    if (/^Ctrl_/i.test(original)) continue;
    if (canonicalSemantic(original) === wanted) return loadedName;
  }

  return '';
}

const MIXAMO_CONTROL_TO_DEFORM = {
  'Ctrl_Master': 'Hips',
  'Ctrl_Hips': 'Hips',
  'Ctrl_Hips_Free': 'Hips',
  'Ctrl_Spine': 'Spine',
  'Ctrl_Spine1': 'Spine1',
  'Ctrl_Spine2': 'Spine2',
  'Ctrl_Neck': 'Neck',
  'Ctrl_Head': 'Head',
  'Ctrl_Shoulder_Left': 'LeftShoulder',
  'Ctrl_Arm_FK_Left': 'LeftArm',
  'Ctrl_ForeArm_FK_Left': 'LeftForeArm',
  'Ctrl_Hand_FK_Left': 'LeftHand',
  'Ctrl_Shoulder_Right': 'RightShoulder',
  'Ctrl_Arm_FK_Right': 'RightArm',
  'Ctrl_ForeArm_FK_Right': 'RightForeArm',
  'Ctrl_Hand_FK_Right': 'RightHand',
  'Ctrl_UpLeg_FK_Left': 'LeftUpLeg',
  'Ctrl_Thigh_FK_Left': 'LeftUpLeg',
  'Ctrl_Leg_FK_Left': 'LeftLeg',
  'Ctrl_Foot_FK_Left': 'LeftFoot',
  'Ctrl_Toe_FK_Left': 'LeftToeBase',
  'Ctrl_UpLeg_FK_Right': 'RightUpLeg',
  'Ctrl_Thigh_FK_Right': 'RightUpLeg',
  'Ctrl_Leg_FK_Right': 'RightLeg',
  'Ctrl_Foot_FK_Right': 'RightFoot',
  'Ctrl_Toe_FK_Right': 'RightToeBase'
};

for (const side of ['Left', 'Right']) {
  for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    for (let i = 1; i <= 3; i++) {
      MIXAMO_CONTROL_TO_DEFORM[`Ctrl_${finger}${i}_${side}`] =
        `${side}Hand${finger}${i}`;
    }
  }
}

const ARP_CONTROL_TO_DEFORM = {
  // Global/body carriers: keep the actual ARP controls in the preview.
  // These are common ancestors of the visible deform branches.
  'c_pos': 'c_pos',
  'c_root_master.x': 'c_root_master.x',
  'c_root.x': 'c_root_master.x',

  'c_spine_01.x': 'c_spine_01.x',
  'c_spine_02.x': 'c_spine_02.x',
  'c_neck.x': 'c_neck.x',
  'c_head.x': 'c_head.x',

  // Shoulder controls are parents of arm.l / forearm.l / hand.l.
  'c_shoulder.l': 'c_shoulder.l',
  'c_shoulder.r': 'c_shoulder.r',

  // Limbs are baked directly on the visible deform chains.
  'c_arm_fk.l': 'arm.l',
  'c_forearm_fk.l': 'forearm.l',
  'c_hand_fk.l': 'hand.l',
  'c_arm_fk.r': 'arm.r',
  'c_forearm_fk.r': 'forearm.r',
  'c_hand_fk.r': 'hand.r',

  'c_thigh_fk.l': 'thigh.l',
  'c_leg_fk.l': 'leg.l',
  'c_foot_fk.l': 'foot.l',
  'c_toes_fk.l': 'toes_01.l',
  'c_thigh_fk.r': 'thigh.r',
  'c_leg_fk.r': 'leg.r',
  'c_foot_fk.r': 'foot.r',
  'c_toes_fk.r': 'toes_01.r'
};

for (const side of ['l', 'r']) {
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    for (let i = 1; i <= 3; i++) {
      ARP_CONTROL_TO_DEFORM[`c_${finger}${i}.${side}`] =
        `${finger}${i}.${side}`;
    }
  }
}


function buildEmbeddedDeformPreviewMap(controlToDeform, profile) {
  const tgt = state.target;
  const pairs = [];

  for (const pair of validMap()) {
    const targetBone = tgt.bones.get(pair.target);
    if (!targetBone) continue;

    const targetOriginal = originalObjectName(targetBone) || pair.target;
    const deformSpec = controlToDeform[targetOriginal];
    if (!deformSpec) continue;

    const deformTarget = profile === 'mixamo-control-rig'
      ? findMixamoControlRigDeformBone(tgt, deformSpec)
      : (
          findBoneByOriginalExact(tgt, [deformSpec]) ||
          findSemanticBone(tgt, deformSpec)
        );

    if (!deformTarget) continue;

    pairs.push({
      source: pair.source,
      target: deformTarget,
      sourceSpec: pair.sourceSpec,
      targetSpec: deformSpec,
      channels: pair.channels || 'ROT',
      axes: pair.axes || 'XYZ',
      locSpace: pair.locSpace || 'world',
      influence: pair.influence ?? 1,
      profile
    });
  }

  return pairs;
}

function buildMixamoControlRigDeformPreviewMap() {
  if (!usesMixamoControlRigPipeline()) return [];
  return buildEmbeddedDeformPreviewMap(
    MIXAMO_CONTROL_TO_DEFORM,
    'mixamo-control-rig'
  );
}

function buildUeToArpSpineSourceRemap() {
  const remap = new Map();

  if (!usesUeToAutoRigProPipeline()) return remap;

  const src = state.source;
  const tgt = state.target;
  if (!src?.root || !tgt?.root) return remap;

  const srcPelvisName =
    findBoneByOriginalExact(src, ['pelvis']) ||
    findSemanticBone(src, 'pelvis');

  const srcNeckName =
    findBoneByOriginalExact(src, ['neck_02', 'neck_01']) ||
    findSemanticBone(src, 'neck');

  const tgtRootRefName =
    findBoneByOriginalExact(tgt, ['root_ref.x']);

  const tgtNeckRefName =
    findBoneByOriginalExact(tgt, ['neck_ref.x']);

  if (!srcPelvisName || !srcNeckName || !tgtRootRefName || !tgtNeckRefName) {
    return remap;
  }

  const srcPelvisRest = src.rest.get(srcPelvisName);
  const srcNeckRest = src.rest.get(srcNeckName);
  const tgtRootRefRest = tgt.rest.get(tgtRootRefName);
  const tgtNeckRefRest = tgt.rest.get(tgtNeckRefName);

  if (!srcPelvisRest || !srcNeckRest || !tgtRootRefRest || !tgtNeckRefRest) {
    return remap;
  }

  const normalizedAlong = (point, start, end) => {
    const axis = end.clone().sub(start);
    const lenSq = axis.lengthSq();
    if (lenSq < 1e-10) return 0;
    return THREE.MathUtils.clamp(
      point.clone().sub(start).dot(axis) / lenSq,
      0,
      1
    );
  };

  const sourceCandidates = [
    'spine_01',
    'spine_02',
    'spine_03',
    'spine_04',
    'spine_05'
  ]
    .map(original => {
      const runtime =
        findBoneByOriginalExact(src, [original]) ||
        findSemanticBone(src, original);

      const rest = runtime ? src.rest.get(runtime) : null;
      if (!runtime || !rest) return null;

      return {
        original,
        runtime,
        t: normalizedAlong(
          rest.worldPos,
          srcPelvisRest.worldPos,
          srcNeckRest.worldPos
        )
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  const targetRefs = [
    ['c_spine_01.x', 'spine_01_ref.x'],
    ['c_spine_02.x', 'spine_02_ref.x']
  ]
    .map(([control, refOriginal]) => {
      const runtime = findBoneByOriginalExact(tgt, [refOriginal]);
      const rest = runtime ? tgt.rest.get(runtime) : null;
      if (!runtime || !rest) return null;

      return {
        control,
        refOriginal,
        t: normalizedAlong(
          rest.worldPos,
          tgtRootRefRest.worldPos,
          tgtNeckRefRest.worldPos
        )
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  if (sourceCandidates.length < 2 || targetRefs.length < 2) {
    return remap;
  }

  // Pick an ordered pair of UE spine bones that best matches the actual ARP
  // reference-bone heights. This avoids assuming CloudRig's spine_03/spine_05
  // landmarks are also correct for this Auto-Rig Pro rig.
  let best = null;

  for (let i = 0; i < sourceCandidates.length - 1; i++) {
    for (let j = i + 1; j < sourceCandidates.length; j++) {
      const a = sourceCandidates[i];
      const b = sourceCandidates[j];
      const error =
        Math.abs(a.t - targetRefs[0].t) +
        Math.abs(b.t - targetRefs[1].t);

      if (!best || error < best.error) {
        best = { a, b, error };
      }
    }
  }

  if (!best) return remap;

  remap.set(targetRefs[0].control, best.a.runtime);
  remap.set(targetRefs[1].control, best.b.runtime);

  remap.meta = {
    lower: best.a.original,
    upper: best.b.original,
    lowerT: best.a.t,
    upperT: best.b.t,
    targetLowerT: targetRefs[0].t,
    targetUpperT: targetRefs[1].t,
    error: best.error
  };

  return remap;
}

function buildAutoRigProDeformPreviewMap() {
  if (!usesAutoRigProPipeline()) return [];

  const tgt = state.target;
  const pairs = [];
  const ueSpineRemap = buildUeToArpSpineSourceRemap();

  for (const pair of validMap()) {
    const targetBone = tgt.bones.get(pair.target);
    if (!targetBone) continue;

    const targetOriginal = originalObjectName(targetBone) || pair.target;
    const previewOriginal = ARP_CONTROL_TO_DEFORM[targetOriginal];
    if (!previewOriginal) continue;

    const remappedSource = ueSpineRemap.get(targetOriginal) || pair.source;

    const previewTarget =
      findBoneByOriginalExact(tgt, [previewOriginal]) ||
      findSemanticBone(tgt, previewOriginal);

    if (!previewTarget) continue;

    pairs.push({
      ...pair,
      source: remappedSource,
      target: previewTarget,
      targetSpec: previewOriginal,
      profile: 'auto-rig-pro-preview'
    });
  }

  return pairs;
}

function buildMixamoToArpReferencePreviewMap() {
  if (
    state.activePresetId !== 'mixamo_to_arp' ||
    !usesAutoRigProPipeline()
  ) {
    return [];
  }

  const tgt = state.target;
  const pairs = [];

  // Build the preview against ARP's clean *_ref hierarchy instead of against
  // c_* controls or the interleaved deform/helper tree.
  for (const pair of validMap()) {
    if (!String(pair.channels || 'ROT').toUpperCase().includes('ROT')) {
      continue;
    }

    const control = tgt.bones.get(pair.target);
    if (!control) continue;

    const controlOriginal = originalObjectName(control) || pair.target;
    const refOriginal =
      AUTO_RIG_PRO_CONTROL_TO_REFERENCE[controlOriginal] || '';

    if (!refOriginal) continue;

    const refTarget = findBoneByOriginalExact(tgt, [refOriginal]);
    if (!refTarget) continue;

    pairs.push({
      ...pair,
      target: refTarget,
      targetSpec: refOriginal,
      profile: 'auto-rig-pro-reference-preview'
    });
  }

  // Root motion for the viewport only. The export Action keeps its original
  // c_pos / c_root_master split.
  const hips =
    findSemanticBone(state.source, 'Hips') ||
    findBoneByOriginalExact(state.source, [
      'mixamorig1:Hips',
      'mixamorig:Hips',
      'Hips'
    ]);

  const rootRef = findBoneByOriginalExact(tgt, ['root_ref.x']);

  if (hips && rootRef) {
    pairs.push({
      source: hips,
      target: rootRef,
      sourceSpec: 'Hips',
      targetSpec: 'root_ref.x',
      channels: 'LOC',
      axes: 'XYZ',
      locSpace: 'world',
      influence: 1,
      profile: 'auto-rig-pro-reference-preview'
    });
  }

  return pairs;
}

function autoRigProWeightedSkinBoneNames() {
  const tgt = state.target;
  const cache = state.arpSkinPreviewCache;

  if (!tgt?.root) return new Set();

  if (
    cache.targetRoot === tgt.root &&
    cache.weightedNames instanceof Set
  ) {
    return cache.weightedNames;
  }

  const weighted = new Set();

  tgt.root.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton?.bones) return;

    const skinIndex = object.geometry?.getAttribute?.('skinIndex');
    const skinWeight = object.geometry?.getAttribute?.('skinWeight');
    const bones = object.skeleton.bones;

    if (!skinIndex || !skinWeight) {
      for (const bone of bones) {
        if (bone?.name) weighted.add(bone.name);
      }
      return;
    }

    const count = Math.min(skinIndex.count, skinWeight.count);

    for (let vertex = 0; vertex < count; vertex++) {
      for (let slot = 0; slot < 4; slot++) {
        const weight =
          slot === 0 ? skinWeight.getX(vertex) :
          slot === 1 ? skinWeight.getY(vertex) :
          slot === 2 ? skinWeight.getZ(vertex) :
          skinWeight.getW(vertex);

        if (!(weight > 1e-5)) continue;

        const index = Math.round(
          slot === 0 ? skinIndex.getX(vertex) :
          slot === 1 ? skinIndex.getY(vertex) :
          slot === 2 ? skinIndex.getZ(vertex) :
          skinIndex.getW(vertex)
        );

        const bone = bones[index];
        if (bone?.name) weighted.add(bone.name);
      }
    }
  });

  cache.targetRoot = tgt.root;
  cache.weightedNames = weighted;
  cache.bindings = null;

  return weighted;
}

function autoRigProReferenceForSkinBone(original) {
  const name = String(original || '').toLowerCase();

  // Exclude animator controls and obvious non-deform helpers.
  if (
    /^c_/.test(name) ||
    /(pole|line|target|cursor|bank|heel|snap|nostr|ik\.|_ik|pre_pole)/.test(name)
  ) {
    return '';
  }

  if (/^(root\.x|root_bend\.x)$/.test(name)) return 'root_ref.x';

  if (/spine_01/.test(name)) return 'spine_01_ref.x';
  if (/spine_02/.test(name)) return 'spine_02_ref.x';

  if (/^neck(?:_|\.|$)|neck_twist/.test(name)) return 'neck_ref.x';
  if (/^head(?:_|\.|$)|head_scale/.test(name)) return 'head_ref.x';

  const side = /\.l$|_l$/.test(name)
    ? 'l'
    : /\.r$|_r$/.test(name)
      ? 'r'
      : '';

  if (side) {
    if (/shoulder/.test(name)) return 'shoulder_ref.' + side;

    // All stretch/twist/deform variants of one anatomical segment receive
    // the SAME reference delta. This keeps vertices influenced by multiple
    // helper bones coherent instead of tearing the mesh.
    if (
      /(^|_)(arm)(?:_|\.|$)/.test(name) &&
      !/forearm/.test(name)
    ) {
      return 'arm_ref.' + side;
    }

    if (/forearm/.test(name)) return 'forearm_ref.' + side;

    if (
      /(^|_)(hand)(?:_|\.|$)/.test(name) &&
      !/(thumb|index|middle|ring|pinky)/.test(name)
    ) {
      return 'hand_ref.' + side;
    }

    if (/thigh/.test(name)) return 'thigh_ref.' + side;

    if (
      /(^|_)(leg)(?:_|\.|$)/.test(name) &&
      !/(pole|line)/.test(name)
    ) {
      return 'leg_ref.' + side;
    }

    if (/^foot(?:_|\.|$)|foot_fk|foot_stretch/.test(name)) {
      return 'foot_ref.' + side;
    }

    if (/toe/.test(name)) return 'toes_ref.' + side;

    for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      for (let i = 1; i <= 3; i++) {
        const re = new RegExp(finger + i + '(?:_|\\.|$)');
        if (re.test(name)) return finger + i + '_ref.' + side;
      }
    }
  }

  return '';
}

function resolveAutoRigProRefToSkinBindings() {
  const tgt = state.target;
  const cache = state.arpSkinPreviewCache;

  if (
    cache.targetRoot === tgt.root &&
    Array.isArray(cache.bindings)
  ) {
    return cache.bindings;
  }

  const weightedNames = autoRigProWeightedSkinBoneNames();
  const bindings = [];
  const seen = new Set();

  for (const runtimeName of weightedNames) {
    const drivenBone = tgt.bones.get(runtimeName);
    if (!drivenBone) continue;

    const original = originalObjectName(drivenBone) || runtimeName;
    const refOriginal = autoRigProReferenceForSkinBone(original);
    if (!refOriginal) continue;

    const ref = findBoneByOriginalExact(tgt, [refOriginal]);
    const refBone = ref ? tgt.bones.get(ref) : null;
    const refRest = ref ? tgt.rest.get(ref) : null;
    const drivenRest = tgt.rest.get(runtimeName);

    if (!ref || !refBone || !refRest || !drivenRest) continue;

    const key = ref + '::' + runtimeName;
    if (seen.has(key)) continue;
    seen.add(key);

    const refRestWorld = new THREE.Matrix4().compose(
      refRest.worldPos,
      refRest.worldQuat,
      refRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    const drivenRestWorld = new THREE.Matrix4().compose(
      drivenRest.worldPos,
      drivenRest.worldQuat,
      drivenRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    bindings.push({
      ref,
      refOriginal,
      refBone,
      driven: runtimeName,
      drivenOriginal: original,
      drivenBone,
      drivenRest,
      refToDrivenRest: refRestWorld.invert().multiply(drivenRestWorld)
    });
  }

  bindings.sort((a, b) =>
    boneDepth(a.drivenBone) - boneDepth(b.drivenBone)
  );

  cache.targetRoot = tgt.root;
  cache.bindings = bindings;

  return bindings;
}

function logAutoRigProSkinPreviewCoverage(bindings) {
  const weightedNames = autoRigProWeightedSkinBoneNames();
  const mapped = new Set(bindings.map(binding => binding.driven));

  const importantUnmapped = [];

  for (const runtimeName of weightedNames) {
    if (mapped.has(runtimeName)) continue;

    const bone = state.target.bones.get(runtimeName);
    const original = originalObjectName(bone) || runtimeName;

    if (
      /(spine|neck|head|shoulder|arm|forearm|hand|thigh|leg|foot|toe|twist|stretch)/i.test(original)
    ) {
      importantUnmapped.push(original);
    }
  }

  log(
    'Mixamo → ARP skin preview: ' +
    bindings.length +
    '/' +
    weightedNames.size +
    ' bones con peso reciben pose *_ref.' +
    (importantUnmapped.length
      ? ' Sin mapa anatómico: ' + importantUnmapped.slice(0, 18).join(', ')
      : '')
  );
}


function restoreAutoRigProSkinMatrixOverrides() {
  const cache = state.arpSkinPreviewCache;

  for (const entry of cache.skinOverrides || []) {
    if (
      entry?.skeleton &&
      typeof entry.originalUpdate === 'function'
    ) {
      entry.skeleton.update = entry.originalUpdate;
    }
  }

  cache.skinOverrides = [];
  cache.skinOverrideTargetRoot = null;
}

function ensureAutoRigProSkinMatrixOverrides() {
  const tgt = state.target;
  const cache = state.arpSkinPreviewCache;

  if (
    state.activePresetId !== 'mixamo_to_arp' ||
    !tgt?.root
  ) {
    restoreAutoRigProSkinMatrixOverrides();
    return false;
  }

  if (
    cache.skinOverrideTargetRoot === tgt.root &&
    cache.skinOverrides?.length
  ) {
    return true;
  }

  restoreAutoRigProSkinMatrixOverrides();

  const reverseTarget = new Map();
  for (const [runtimeName, bone] of tgt.bones) {
    reverseTarget.set(bone, runtimeName);
  }

  const overrides = [];
  const mappedNames = new Set();
  const skeletonNames = new Set();

  tgt.root.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton?.bones) return;

    const skeleton = object.skeleton;
    const bindingsByIndex = new Array(skeleton.bones.length).fill(null);

    for (let i = 0; i < skeleton.bones.length; i++) {
      const bone = skeleton.bones[i];
      if (!bone) continue;

      skeletonNames.add(bone.name);

      const runtimeName =
        reverseTarget.get(bone) ||
        (tgt.bones.has(bone.name) ? bone.name : '');

      if (!runtimeName) continue;

      const original = originalObjectName(bone) || runtimeName;
      const refOriginal = autoRigProReferenceForSkinBone(original);
      if (!refOriginal) continue;

      const refName = findBoneByOriginalExact(tgt, [refOriginal]);
      const refBone = refName ? tgt.bones.get(refName) : null;
      const refRest = refName ? tgt.rest.get(refName) : null;
      const drivenRest = tgt.rest.get(runtimeName);

      if (!refBone || !refRest || !drivenRest) continue;

      const refRestWorld = new THREE.Matrix4().compose(
        refRest.worldPos,
        refRest.worldQuat,
        refRest.worldScale || new THREE.Vector3(1, 1, 1)
      );

      const drivenRestWorld = new THREE.Matrix4().compose(
        drivenRest.worldPos,
        drivenRest.worldQuat,
        drivenRest.worldScale || new THREE.Vector3(1, 1, 1)
      );

      bindingsByIndex[i] = {
        refBone,
        refToDrivenRest: refRestWorld
          .invert()
          .multiply(drivenRestWorld)
      };

      mappedNames.add(original);
    }

    if (!bindingsByIndex.some(Boolean)) return;

    const originalUpdate = skeleton.update;
    const offsetMatrix = new THREE.Matrix4();
    const desiredWorld = new THREE.Matrix4();

    // Viewport-only skinning override:
    // do NOT move ARP's actual bones. Build the final skin matrices directly
    // from the clean animated *_ref skeleton. This bypasses the exported FBX
    // helper/stretch/twist hierarchy entirely.
    skeleton.update = function () {
      const bones = this.bones;
      const inverses = this.boneInverses;
      const boneMatrices = this.boneMatrices;

      for (let i = 0, il = bones.length; i < il; i++) {
        const bone = bones[i];
        const inverse = inverses[i];

        if (!inverse) continue;

        const binding = bindingsByIndex[i];

        if (binding?.refBone) {
          desiredWorld.copy(binding.refBone.matrixWorld)
            .multiply(binding.refToDrivenRest);

          offsetMatrix.copy(desiredWorld)
            .multiply(inverse);
        } else if (bone) {
          offsetMatrix.copy(bone.matrixWorld)
            .multiply(inverse);
        } else {
          offsetMatrix.identity();
        }

        offsetMatrix.toArray(boneMatrices, i * 16);
      }

      if (this.boneTexture) {
        this.boneTexture.needsUpdate = true;
      }
    };

    overrides.push({
      mesh: object,
      skeleton,
      originalUpdate,
      bindingsByIndex
    });
  });

  cache.skinOverrides = overrides;
  cache.skinOverrideTargetRoot = tgt.root;

  log(
    'Mixamo → ARP matrix-skin preview: ' +
    overrides.length +
    ' Skeleton(s) intervenidos · ' +
    mappedNames.size +
    '/' +
    skeletonNames.size +
    ' bones anatómicos redirigidos a *_ref · jerarquía ARP intacta.'
  );

  return overrides.length > 0;
}

function resetAutoRigProReferenceSkinPreview() {
  const tgt = state.target;
  if (!tgt?.root) return;

  const bindings = resolveAutoRigProRefToSkinBindings();

  for (const binding of bindings) {
    const bone = binding.drivenBone;
    const rest = binding.drivenRest;
    if (!bone || !rest) continue;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }

  updateSlotWorld(tgt);
}

function applyAutoRigProReferenceSkinPreviewRuntime() {
  const tgt = state.target;

  if (
    state.activePresetId !== 'mixamo_to_arp' ||
    !state.deformPreviewClip ||
    !state.targetPreviewClip ||
    !tgt?.root
  ) {
    return false;
  }

  const bindings = resolveAutoRigProRefToSkinBindings();
  if (!bindings.length) return false;

  // Mixer.setTime() has changed the *_ref local transforms. Update the whole
  // target ONCE so every refBone.matrixWorld is current.
  updateSlotWorld(tgt);

  // Reset owned skin bones without rescanning vertices or traversing the whole
  // 467-bone rig after every individual bone.
  for (const binding of bindings) {
    const bone = binding.drivenBone;
    const rest = binding.drivenRest;
    if (!bone || !rest) continue;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }

  // One reset propagation before the parent-first solve.
  updateSlotWorld(tgt);

  const desiredWorld = new THREE.Matrix4();
  const parentInv = new THREE.Matrix4();
  const desiredLocal = new THREE.Matrix4();

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const binding of bindings) {
    const refBone = binding.refBone;
    const drivenBone = binding.drivenBone;

    if (!refBone || !drivenBone) continue;

    desiredWorld.copy(refBone.matrixWorld)
      .multiply(binding.refToDrivenRest);

    if (drivenBone.parent) {
      // Parent bindings are processed first by depth, so its matrixWorld is
      // already valid. For non-owned parents the single update above is enough.
      parentInv.copy(drivenBone.parent.matrixWorld).invert();
      desiredLocal.copy(parentInv).multiply(desiredWorld);
    } else {
      desiredLocal.copy(desiredWorld);
    }

    desiredLocal.decompose(position, quaternion, scale);

    drivenBone.position.copy(position);
    drivenBone.quaternion.copy(quaternion).normalize();
    drivenBone.scale.copy(scale);

    // Update ONLY this bone's matrices. updateSlotWorld(tgt) here used to
    // traverse hundreds of bones for every binding on every frame.
    drivenBone.updateMatrix();
    if (drivenBone.parent) {
      drivenBone.matrixWorld.multiplyMatrices(
        drivenBone.parent.matrixWorld,
        drivenBone.matrix
      );
    } else {
      drivenBone.matrixWorld.copy(drivenBone.matrix);
    }
    drivenBone.matrixWorldNeedsUpdate = false;
  }

  return true;
}

function buildCurrentEmbeddedDeformPreviewMap() {
  if (usesMixamoControlRigPipeline()) {
    return buildMixamoControlRigDeformPreviewMap();
  }
  if (usesAutoRigProPipeline()) {
    return buildAutoRigProDeformPreviewMap();
  }
  return [];
}


function filterClipToTargets(clip, targets, name) {
  if (!clip) return null;
  const wanted = targets instanceof Set ? targets : new Set(targets || []);

  const tracks = clip.tracks
    .filter(track => {
      const parsed = parseTrackTarget(track.name);
      return parsed && wanted.has(parsed.nodeName);
    })
    .map(track => track.clone());

  if (!tracks.length) return null;

  return new THREE.AnimationClip(
    name || clip.name,
    clip.duration,
    tracks
  );
}


function updateBoneWorldPath(bone) {
  if (!bone) return;
  if (typeof bone.updateWorldMatrix === 'function') {
    bone.updateWorldMatrix(true, false);
    return;
  }
  bone.updateMatrixWorld?.(true);
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
      if (tb.parent) {
        updateBoneWorldPath(tb.parent);
        tb.parent.worldToLocal(localPos);
      }

      tb.position.copy(localPos);
      tb.scale.copy(tr.scale);
      updateBoneWorldPath(tb);

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
        updateBoneWorldPath(tb.parent);
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
      updateBoneWorldPath(tb);
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
      if (tb.parent) {
        updateBoneWorldPath(tb.parent);
        tb.parent.worldToLocal(localPos);
      }

      tb.position.copy(localPos);
      tb.scale.copy(tr.scale);
      updateBoneWorldPath(tb);
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
        updateBoneWorldPath(torso);
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

function rigifyPreviewBodyContext() {
  if (!usesRigifyPipeline()) return null;

  const src = state.source;
  const tgt = state.target;

  const sourceHipsName =
    findBoneByOriginalExact(
      src,
      ['mixamorig1:Hips', 'mixamorig:Hips', 'Hips']
    ) ||
    findSemanticBone(src, 'Hips');

  const sourceHips = sourceHipsName
    ? src.bones.get(sourceHipsName)
    : null;
  const sourceHipsRest = sourceHipsName
    ? src.rest.get(sourceHipsName)
    : null;

  if (!sourceHips || !sourceHipsRest) return null;

  const sourceHeadName =
    findBoneByOriginalExact(
      src,
      ['mixamorig1:Head', 'mixamorig:Head', 'Head']
    ) ||
    findSemanticBone(src, 'Head');

  const targetTorsoName =
    findBoneByOriginalExact(tgt, ['torso']) ||
    findSemanticBone(tgt, 'torso');

  const targetHeadName =
    findBoneByOriginalExact(tgt, ['DEF-head', 'head']) ||
    findSemanticBone(tgt, 'Head');

  let scale = 1;

  const sourceHeadRest = sourceHeadName
    ? src.rest.get(sourceHeadName)
    : null;
  const targetTorsoRest = targetTorsoName
    ? tgt.rest.get(targetTorsoName)
    : null;
  const targetHeadRest = targetHeadName
    ? tgt.rest.get(targetHeadName)
    : null;

  if (sourceHeadRest && targetTorsoRest && targetHeadRest) {
    const sourceHeight =
      sourceHipsRest.worldPos.distanceTo(sourceHeadRest.worldPos);
    const targetHeight =
      targetTorsoRest.worldPos.distanceTo(targetHeadRest.worldPos);

    if (sourceHeight > 1e-6 && targetHeight > 1e-6) {
      scale = THREE.MathUtils.clamp(
        targetHeight / sourceHeight,
        0.5,
        2
      );
    }
  }

  const currentHipsWorld =
    sourceHips.getWorldPosition(new THREE.Vector3());

  const bodyDelta = currentHipsWorld
    .sub(sourceHipsRest.worldPos)
    .multiplyScalar($('autoScale')?.checked ? scale : 1);

  return {
    bodyDelta,
    motionScale: scale
  };
}

const MIXAMO_TO_ARP_SOURCE_PREVIEW_BINDINGS = [
  // Torso. Mixamo Spine1 is intentionally collapsed between Spine and Spine2,
  // matching the existing Mixamo -> ARP preset.
  { source: 'Spine', sourceParent: 'Hips', target: 'spine_01.x', targetParent: 'root.x' },
  { source: 'Spine2', sourceParent: 'Spine', target: 'spine_02.x', targetParent: 'spine_01.x' },
  { source: 'Neck', sourceParent: 'Spine2', target: 'neck.x', targetParent: 'spine_02.x' },
  { source: 'Head', sourceParent: 'Neck', target: 'head.x', targetParent: 'neck.x' },

  // Shoulders + arms.
  { source: 'LeftShoulder', sourceParent: 'Spine2', target: 'c_shoulder.l', targetParent: 'spine_02.x' },
  { source: 'LeftArm', sourceParent: 'LeftShoulder', target: 'arm.l', targetParent: 'c_shoulder.l' },
  { source: 'LeftForeArm', sourceParent: 'LeftArm', target: 'forearm.l', targetParent: 'arm.l' },
  { source: 'LeftHand', sourceParent: 'LeftForeArm', target: 'hand.l', targetParent: 'forearm.l' },

  { source: 'RightShoulder', sourceParent: 'Spine2', target: 'c_shoulder.r', targetParent: 'spine_02.x' },
  { source: 'RightArm', sourceParent: 'RightShoulder', target: 'arm.r', targetParent: 'c_shoulder.r' },
  { source: 'RightForeArm', sourceParent: 'RightArm', target: 'forearm.r', targetParent: 'arm.r' },
  { source: 'RightHand', sourceParent: 'RightForeArm', target: 'hand.r', targetParent: 'forearm.r' },

  // Legs. c_thigh_b is ARP's real FBX carrier below root.x; use it only as
  // the current parent frame while the Source supplies the anatomical bend.
  { source: 'LeftUpLeg', sourceParent: 'Hips', target: 'thigh.l', targetParent: 'c_thigh_b.l' },
  { source: 'LeftLeg', sourceParent: 'LeftUpLeg', target: 'leg.l', targetParent: 'thigh.l' },
  { source: 'LeftFoot', sourceParent: 'LeftLeg', target: 'foot.l', targetParent: 'leg.l' },
  { source: 'LeftToeBase', sourceParent: 'LeftFoot', target: 'toes_01.l', targetParent: 'foot.l' },

  { source: 'RightUpLeg', sourceParent: 'Hips', target: 'thigh.r', targetParent: 'c_thigh_b.r' },
  { source: 'RightLeg', sourceParent: 'RightUpLeg', target: 'leg.r', targetParent: 'thigh.r' },
  { source: 'RightFoot', sourceParent: 'RightLeg', target: 'foot.r', targetParent: 'leg.r' },
  { source: 'RightToeBase', sourceParent: 'RightFoot', target: 'toes_01.r', targetParent: 'foot.r' }
];

function resolveMixamoToArpSourcePreviewBindings() {
  const src = state.source;
  const tgt = state.target;

  return MIXAMO_TO_ARP_SOURCE_PREVIEW_BINDINGS
    .map(spec => {
      const source =
        findSemanticBone(src, spec.source) ||
        findBoneByOriginalExact(src, [spec.source]);

      const sourceParent =
        findSemanticBone(src, spec.sourceParent) ||
        findBoneByOriginalExact(src, [spec.sourceParent]);

      const target = findBoneByOriginalExact(tgt, [spec.target]);
      const targetParent = findBoneByOriginalExact(tgt, [spec.targetParent]);

      if (!source || !sourceParent || !target || !targetParent) return null;

      return {
        ...spec,
        source,
        sourceParent,
        target,
        targetParent
      };
    })
    .filter(Boolean);
}

function resetMixamoToArpSourcePreview() {
  const tgt = state.target;
  if (!tgt?.root) return;

  for (const binding of resolveMixamoToArpSourcePreviewBindings()) {
    const bone = tgt.bones.get(binding.target);
    const rest = tgt.rest.get(binding.target);
    if (!bone || !rest) continue;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }

  updateSlotWorld(tgt);
}

function applyMixamoToArpSourcePreviewRuntime() {
  const src = state.source;
  const tgt = state.target;

  if (
    state.activePresetId !== 'mixamo_to_arp' ||
    !src?.root ||
    !tgt?.root ||
    !src.activeClip ||
    !state.targetPreviewClip
  ) {
    return false;
  }

  const bindings = resolveMixamoToArpSourcePreviewBindings();
  if (!bindings.length) return false;

  // Source mixer has already been evaluated by seek(). Rebuild the visible
  // ARP body directly from the Mixamo anatomical pose. The exported c_* Action
  // is intentionally NOT involved in this viewport solve.
  for (const binding of bindings) {
    const driven = tgt.bones.get(binding.target);
    const rest = tgt.rest.get(binding.target);
    if (!driven || !rest) continue;

    driven.position.copy(rest.position);
    driven.quaternion.copy(rest.quaternion);
    driven.scale.copy(rest.scale);
  }

  updateSlotWorld(tgt);

  const sourceParentPoseQ = new THREE.Quaternion();
  const sourcePoseQ = new THREE.Quaternion();
  const sourceRestRelativeQ = new THREE.Quaternion();
  const sourcePoseRelativeQ = new THREE.Quaternion();
  const sourceBasisQ = new THREE.Quaternion();

  const targetRestRelativeQ = new THREE.Quaternion();
  const axisMapQ = new THREE.Quaternion();
  const targetBasisQ = new THREE.Quaternion();

  const targetParentRestWorld = new THREE.Matrix4();
  const targetRestWorld = new THREE.Matrix4();
  const targetRestRelative = new THREE.Matrix4();
  const basisMatrix = new THREE.Matrix4();
  const desiredWorld = new THREE.Matrix4();
  const actualParentInv = new THREE.Matrix4();
  const desiredLocal = new THREE.Matrix4();

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const binding of bindings) {
    const sourceBone = src.bones.get(binding.source);
    const sourceParentBone = src.bones.get(binding.sourceParent);
    const targetBone = tgt.bones.get(binding.target);
    const targetParentBone = tgt.bones.get(binding.targetParent);

    const sourceRest = src.rest.get(binding.source);
    const sourceParentRest = src.rest.get(binding.sourceParent);
    const targetRest = tgt.rest.get(binding.target);
    const targetParentRest = tgt.rest.get(binding.targetParent);

    if (
      !sourceBone ||
      !sourceParentBone ||
      !targetBone ||
      !targetParentBone ||
      !sourceRest ||
      !sourceParentRest ||
      !targetRest ||
      !targetParentRest
    ) {
      continue;
    }

    sourceParentBone.getWorldQuaternion(sourceParentPoseQ).normalize();
    sourceBone.getWorldQuaternion(sourcePoseQ).normalize();

    sourceRestRelativeQ.copy(sourceParentRest.worldQuat)
      .invert()
      .multiply(sourceRest.worldQuat)
      .normalize();

    sourcePoseRelativeQ.copy(sourceParentPoseQ)
      .invert()
      .multiply(sourcePoseQ)
      .normalize();

    sourceBasisQ.copy(sourceRestRelativeQ)
      .invert()
      .multiply(sourcePoseRelativeQ)
      .normalize();

    targetRestRelativeQ.copy(targetParentRest.worldQuat)
      .invert()
      .multiply(targetRest.worldQuat)
      .normalize();

    // Convert the Mixamo child-local rotation delta into the ARP deform
    // bone's child-local axes.
    axisMapQ.copy(targetRestRelativeQ)
      .invert()
      .multiply(sourceRestRelativeQ)
      .normalize();

    targetBasisQ.copy(axisMapQ)
      .multiply(sourceBasisQ)
      .multiply(axisMapQ.clone().invert())
      .normalize();

    targetParentRestWorld.compose(
      targetParentRest.worldPos,
      targetParentRest.worldQuat,
      targetParentRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    targetRestWorld.compose(
      targetRest.worldPos,
      targetRest.worldQuat,
      targetRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    targetRestRelative.copy(targetParentRestWorld)
      .invert()
      .multiply(targetRestWorld);

    basisMatrix.makeRotationFromQuaternion(targetBasisQ);

    // Parent-first functional chain using ARP's own rest lengths/pivots.
    desiredWorld.copy(targetParentBone.matrixWorld)
      .multiply(targetRestRelative)
      .multiply(basisMatrix);

    if (targetBone.parent) {
      actualParentInv.copy(targetBone.parent.matrixWorld).invert();
      desiredLocal.copy(actualParentInv).multiply(desiredWorld);
    } else {
      desiredLocal.copy(desiredWorld);
    }

    desiredLocal.decompose(position, quaternion, scale);

    targetBone.position.copy(position);
    targetBone.quaternion.copy(quaternion).normalize();
    targetBone.scale.copy(scale);

    updateSlotWorld(tgt);
  }

  return true;
}

const AUTO_RIG_PRO_PREVIEW_BINDINGS = [
  // The original ARP .blend evaluates these as one anatomical chain through
  // constraints/helpers. The exported FBX does not preserve that functional
  // parenting, so reconstruct it explicitly for VIEWPORT ONLY.
  { driver: 'c_spine_01.x', driven: 'spine_01.x', parent: 'root.x' },
  { driver: 'c_spine_02.x', driven: 'spine_02.x', parent: 'spine_01.x' },

  // c_neck.x is already parented below spine_02.x in the FBX, so neck.x can
  // follow it naturally. c_head.x lives in a separate head_scale_fix branch.
  { driver: 'c_head.x', driven: 'head.x', parent: 'neck.x' },

  { driver: 'c_arm_fk.l', driven: 'arm.l', parent: 'c_shoulder.l' },
  { driver: 'c_forearm_fk.l', driven: 'forearm.l', parent: 'arm.l' },
  { driver: 'c_hand_fk.l', driven: 'hand.l', parent: 'forearm.l' },

  { driver: 'c_arm_fk.r', driven: 'arm.r', parent: 'c_shoulder.r' },
  { driver: 'c_forearm_fk.r', driven: 'forearm.r', parent: 'arm.r' },
  { driver: 'c_hand_fk.r', driven: 'hand.r', parent: 'forearm.r' },

  { driver: 'c_thigh_fk.l', driven: 'thigh.l', parent: 'c_thigh_b.l' },
  { driver: 'c_leg_fk.l', driven: 'leg.l', parent: 'thigh.l' },
  { driver: 'c_foot_fk.l', driven: 'foot.l', parent: 'leg.l' },
  { driver: 'c_toes_fk.l', driven: 'toes_01.l', parent: 'foot.l' },

  { driver: 'c_thigh_fk.r', driven: 'thigh.r', parent: 'c_thigh_b.r' },
  { driver: 'c_leg_fk.r', driven: 'leg.r', parent: 'thigh.r' },
  { driver: 'c_foot_fk.r', driven: 'foot.r', parent: 'leg.r' },
  { driver: 'c_toes_fk.r', driven: 'toes_01.r', parent: 'foot.r' }
];

function autoRigProPreviewResolvedBindings() {
  const tgt = state.target;
  if (!tgt?.root) return [];

  return AUTO_RIG_PRO_PREVIEW_BINDINGS
    .map(spec => {
      const driver = findBoneByOriginalExact(tgt, [spec.driver]);
      const driven = findBoneByOriginalExact(tgt, [spec.driven]);
      const parent = findBoneByOriginalExact(tgt, [spec.parent]);

      if (!driver || !driven || !parent) return null;

      return {
        ...spec,
        driver,
        driven,
        parent
      };
    })
    .filter(Boolean);
}

function resetAutoRigProPreviewDriven() {
  const tgt = state.target;
  if (!tgt?.root) return;

  for (const binding of autoRigProPreviewResolvedBindings()) {
    const bone = tgt.bones.get(binding.driven);
    const rest = tgt.rest.get(binding.driven);
    if (!bone || !rest) continue;

    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }

  updateSlotWorld(tgt);
}

function applyAutoRigProPreviewRuntime() {
  const tgt = state.target;

  if (
    !usesAutoRigProPipeline() ||
    !tgt?.root ||
    !state.targetPreviewClip
  ) {
    return;
  }

  const bindings = autoRigProPreviewResolvedBindings();
  if (!bindings.length) return;

  // Mixer has already evaluated c_* controls for this frame. Reset only the
  // deform bones reconstructed by this runtime, then rebuild them parent-first.
  for (const binding of bindings) {
    const drivenBone = tgt.bones.get(binding.driven);
    const drivenRest = tgt.rest.get(binding.driven);
    if (!drivenBone || !drivenRest) continue;

    drivenBone.position.copy(drivenRest.position);
    drivenBone.quaternion.copy(drivenRest.quaternion);
    drivenBone.scale.copy(drivenRest.scale);
  }

  updateSlotWorld(tgt);

  const driverBasis = new THREE.Quaternion();
  const controlToDriven = new THREE.Quaternion();
  const drivenBasis = new THREE.Quaternion();

  const parentRestWorld = new THREE.Matrix4();
  const drivenRestWorld = new THREE.Matrix4();
  const restRelative = new THREE.Matrix4();
  const basisMatrix = new THREE.Matrix4();
  const desiredWorld = new THREE.Matrix4();
  const desiredLocal = new THREE.Matrix4();
  const parentWorldInv = new THREE.Matrix4();

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (const binding of bindings) {
    const driverBone = tgt.bones.get(binding.driver);
    const drivenBone = tgt.bones.get(binding.driven);
    const logicalParent = tgt.bones.get(binding.parent);

    const driverRest = tgt.rest.get(binding.driver);
    const drivenRest = tgt.rest.get(binding.driven);
    const logicalParentRest = tgt.rest.get(binding.parent);

    if (
      !driverBone ||
      !drivenBone ||
      !logicalParent ||
      !driverRest ||
      !drivenRest ||
      !logicalParentRest
    ) {
      continue;
    }

    // state.fkClip stores FBX local rest * Blender matrix_basis.
    // Recover matrix_basis directly from the animated c_* local quaternion.
    driverBasis.copy(driverRest.quaternion)
      .invert()
      .multiply(driverBone.quaternion)
      .normalize();

    // Express that same rotation delta in the deform bone's REST axes.
    controlToDriven.copy(drivenRest.worldQuat)
      .invert()
      .multiply(driverRest.worldQuat)
      .normalize();

    drivenBasis.copy(controlToDriven)
      .multiply(driverBasis)
      .multiply(controlToDriven.clone().invert())
      .normalize();

    parentRestWorld.compose(
      logicalParentRest.worldPos,
      logicalParentRest.worldQuat,
      logicalParentRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    drivenRestWorld.compose(
      drivenRest.worldPos,
      drivenRest.worldQuat,
      drivenRest.worldScale || new THREE.Vector3(1, 1, 1)
    );

    restRelative.copy(parentRestWorld)
      .invert()
      .multiply(drivenRestWorld);

    basisMatrix.makeRotationFromQuaternion(drivenBasis);

    // Recreate the transform the deform bone would have if it really lived
    // below its functional ARP parent. This fixes BOTH orientation and pivot
    // position, which a rotation-only deform bake cannot do.
    desiredWorld.copy(logicalParent.matrixWorld)
      .multiply(restRelative)
      .multiply(basisMatrix);

    if (drivenBone.parent) {
      parentWorldInv.copy(drivenBone.parent.matrixWorld).invert();
      desiredLocal.copy(parentWorldInv).multiply(desiredWorld);
    } else {
      desiredLocal.copy(desiredWorld);
    }

    desiredLocal.decompose(position, quaternion, scale);

    drivenBone.position.copy(position);
    drivenBone.quaternion.copy(quaternion).normalize();
    drivenBone.scale.copy(scale);

    updateSlotWorld(tgt);
  }
}

function applyTargetRigRuntime() {
  // Auto-Rig Pro has no WaltFBX runtime in walt-fbx-loader. Its deform bones
  // are interleaved with animator controls, so reconstruct the missing
  // Blender functional hierarchy locally in app.js.
  if (usesAutoRigProPipeline()) {
    const enabled = $('previewDeform')?.checked ?? true;

    if (state.activePresetId === 'mixamo_to_arp') {
      if (enabled && state.targetPreviewClip) {
        // The target mixer animates only the clean *_ref hierarchy.
        // The renderer then receives final skin matrices directly from it.
        ensureAutoRigProSkinMatrixOverrides();
      } else {
        restoreAutoRigProSkinMatrixOverrides();
      }

      return;
    }

    restoreAutoRigProSkinMatrixOverrides();

    if (!state.targetPreviewClip) {
      resetAutoRigProPreviewDriven();
      return;
    }

    if (enabled) {
      applyAutoRigProPreviewRuntime();
    } else {
      resetAutoRigProPreviewDriven();
    }

    return;
  }

  // Preset/target changed away from ARP: never leave a Skeleton.update patch
  // attached to a previous Target.
  restoreAutoRigProSkinMatrixOverrides();

  const runtime = state.target.rigRuntime;
  if (!runtime) return;

  // Imported Targets are neutral by definition. Do not evaluate their
  // control->DEF runtime until Transfer has created a preview clip.
  if (!state.targetPreviewClip) {
    runtime.enabled = false;
    runtime.resetDriven();
    return;
  }

  runtime.enabled = $('previewDeform')?.checked ?? true;

  if (runtime.enabled) {
    runtime.update(
      usesRigifyPipeline()
        ? rigifyPreviewBodyContext()
        : null
    );
  } else {
    runtime.resetDriven();
  }
}

function collectRigifyViewportDefBindings() {
  const tgt = state.target;
  const byDriven = new Map();

  const add = (driverOriginal, drivenOriginal) => {
    const driver =
      findBoneByOriginalExact(tgt, [driverOriginal]);
    const driven =
      findBoneByOriginalExact(tgt, [drivenOriginal]);
    if (!driver || !driven) return;

    byDriven.set(driven, {
      driver,
      driven,
      driverOriginal,
      drivenOriginal
    });
  };

  // Split Rigify spine. Live runtime distributes each FK section across
  // both connected DEF segments instead of concentrating the whole bend in
  // the first segment.
  add('spine_fk', 'DEF-spine');
  add('spine_fk', 'DEF-spine.001');

  add('spine_fk.001', 'DEF-spine.002');
  add('spine_fk.001', 'DEF-spine.003');

  add('spine_fk.002', 'DEF-spine.004');
  add('spine_fk.002', 'DEF-spine.005');

  add('spine_fk.003', 'DEF-spine.006');

  // Auxiliary weighted deform bones from the real Rigify hierarchy.
  add('spine_fk', 'DEF-pelvis.L');
  add('spine_fk', 'DEF-pelvis.R');
  add('spine_fk.003', 'DEF-breast.L');
  add('spine_fk.003', 'DEF-breast.R');

  add('neck', 'DEF-neck');
  add('head', 'DEF-head');

  for (const side of ['L', 'R']) {
    add(`shoulder.${side}`, `DEF-shoulder.${side}`);
    add(`upper_arm_fk.${side}`, `DEF-upper_arm.${side}`);
    add(`forearm_fk.${side}`, `DEF-forearm.${side}`);
    add(`hand_fk.${side}`, `DEF-hand.${side}`);

    add(`thigh_fk.${side}`, `DEF-thigh.${side}`);
    add(`shin_fk.${side}`, `DEF-shin.${side}`);
    add(`foot_fk.${side}`, `DEF-foot.${side}`);
    add(`toe_fk.${side}`, `DEF-toe.${side}`);
  }

  // Fingers and any other Rigify controls that have a direct DEF-<name>
  // counterpart can be previewed automatically.
  for (const pair of validMap()) {
    const control = tgt.bones.get(pair.target);
    if (!control) continue;

    const original = originalObjectName(control) || pair.target;
    const defOriginal = `DEF-${original}`;
    if (findBoneByOriginalExact(tgt, [defOriginal])) {
      add(original, defOriginal);
    }
  }

  return [...byDriven.values()]
    .sort((a, b) =>
      boneDepth(tgt.bones.get(a.driven)) -
      boneDepth(tgt.bones.get(b.driven))
    );
}

const RIGIFY_PREVIEW_FK_PARENT = {
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

  // Mixamo Hips ROT is mapped to spine_fk in the shipped
  // Mixamo → Rigify preset. This is the lower/pelvis orientation frame.
  // Parenting the legs to torso dropped that pelvis rotation in preview,
  // which produced visible foot drift even though the exported Action was OK.
  'thigh_fk.L': 'spine_fk',
  'shin_fk.L': 'thigh_fk.L',
  'foot_fk.L': 'shin_fk.L',
  'toe_fk.L': 'foot_fk.L',

  'thigh_fk.R': 'spine_fk',
  'shin_fk.R': 'thigh_fk.R',
  'foot_fk.R': 'shin_fk.R',
  'toe_fk.R': 'foot_fk.R'
};

const RIGIFY_PREVIEW_FK_ORDER = [
  'spine_fk', 'spine_fk.001', 'spine_fk.002', 'spine_fk.003',
  'neck', 'head',

  'shoulder.L', 'upper_arm_fk.L', 'forearm_fk.L', 'hand_fk.L',
  'shoulder.R', 'upper_arm_fk.R', 'forearm_fk.R', 'hand_fk.R',

  'thigh_fk.L', 'shin_fk.L', 'foot_fk.L', 'toe_fk.L',
  'thigh_fk.R', 'shin_fk.R', 'foot_fk.R', 'toe_fk.R'
];

function rigifyPreviewBoneName(original) {
  return findBoneByOriginalExact(state.target, [original]);
}

function buildRigifyVirtualFkFrame(tgt) {
  const virtual = new Map();

  // Same principle used by WaltCloudRigRuntime: live section controls are
  // frames, while the anatomical FK hierarchy is reconstructed independently
  // from the raw FBX parent tree (whose Blender constraints are missing).
  for (const original of ['root', 'torso']) {
    const name = rigifyPreviewBoneName(original);
    const bone = name ? tgt.bones.get(name) : null;
    const rest = name ? tgt.rest.get(name) : null;
    if (!bone || !rest) continue;

    const q = bone.getWorldQuaternion(new THREE.Quaternion()).normalize();
    virtual.set(original, {
      name,
      position: bone.getWorldPosition(new THREE.Vector3()),
      quaternion: q,
      deltaQuaternion: q.clone()
        .multiply(rest.worldQuat.clone().invert())
        .normalize()
    });
  }

  for (const original of RIGIFY_PREVIEW_FK_ORDER) {
    const name = rigifyPreviewBoneName(original);
    const bone = name ? tgt.bones.get(name) : null;
    const rest = name ? tgt.rest.get(name) : null;
    if (!bone || !rest) continue;

    const parentOriginal = RIGIFY_PREVIEW_FK_PARENT[original];
    const parentVirtual = parentOriginal ? virtual.get(parentOriginal) : null;
    const parentName = parentOriginal
      ? rigifyPreviewBoneName(parentOriginal)
      : null;
    const parentRest = parentName ? tgt.rest.get(parentName) : null;

    let worldQuaternion;
    let worldPosition;

    if (parentVirtual && parentRest) {
      // The retarget clip stores a pose basis on the FK control. Recompose
      // that basis on the anatomical parent reconstructed above, exactly like
      // the CloudRig virtual-FK runtime does.
      const poseBasis = rest.quaternion.clone()
        .invert()
        .multiply(bone.quaternion)
        .normalize();

      const restRelative = parentRest.worldQuat.clone()
        .invert()
        .multiply(rest.worldQuat)
        .normalize();

      worldQuaternion = parentVirtual.quaternion.clone()
        .multiply(restRelative)
        .multiply(poseBasis)
        .normalize();

      const parentDelta = parentVirtual.quaternion.clone()
        .multiply(parentRest.worldQuat.clone().invert())
        .normalize();

      const restOffset = rest.worldPos.clone()
        .sub(parentRest.worldPos)
        .applyQuaternion(parentDelta);

      worldPosition = parentVirtual.position.clone().add(restOffset);
    } else {
      worldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion()).normalize();
      worldPosition = bone.getWorldPosition(new THREE.Vector3());
    }

    virtual.set(original, {
      name,
      position: worldPosition,
      quaternion: worldQuaternion,
      deltaQuaternion: worldQuaternion.clone()
        .multiply(rest.worldQuat.clone().invert())
        .normalize()
    });
  }

  return virtual;
}

function buildRigifyViewportDeformClip(controlClip) {
  const tgt = state.target;
  if (!usesRigifyPipeline() || !tgt.root || !controlClip) return null;

  const bindings = collectRigifyViewportDefBindings();
  if (!bindings.length) {
    log('Preview Rigify: no encontré pares control → DEF; se usa FK raw.');
    return null;
  }

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(controlClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(controlClip.duration, i / fps)
  );

  const data = new Map(
    bindings.map(binding => [
      binding.driven,
      { p: [], q: [], previousQ: null }
    ])
  );

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(controlClip).play();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      const virtual = buildRigifyVirtualFkFrame(tgt);

      // Drive DEF from the reconstructed anatomical FK hierarchy, not from
      // each raw Rigify control independently. This is the CloudRig preview
      // strategy: parent carry and bone lengths stay coherent even though the
      // Blender MCH/constraint graph does not exist in the FBX runtime.
      for (const binding of bindings) {
        const driver = tgt.bones.get(binding.driver);
        const driven = tgt.bones.get(binding.driven);
        const driverRest = tgt.rest.get(binding.driver);
        const drivenRest = tgt.rest.get(binding.driven);
        if (!driver || !driven || !driverRest || !drivenRest) continue;

        const driverOriginal =
          originalObjectName(driver) || binding.driverOriginal || binding.driver;
        const v =
          virtual.get(driverOriginal) ||
          virtual.get(binding.driverOriginal);

        let driverWorldPos;
        let driverWorldQ;
        let driverDeltaQ;

        if (v) {
          driverWorldPos = v.position.clone();
          driverWorldQ = v.quaternion.clone();
          driverDeltaQ = v.deltaQuaternion.clone();
        } else {
          driverWorldPos = driver.getWorldPosition(new THREE.Vector3());
          driverWorldQ = driver.getWorldQuaternion(new THREE.Quaternion()).normalize();
          driverDeltaQ = driverWorldQ.clone()
            .multiply(driverRest.worldQuat.clone().invert())
            .normalize();
        }

        const desiredWorldQ = driverDeltaQ.clone()
          .multiply(drivenRest.worldQuat)
          .normalize();

        const restOffset = drivenRest.worldPos.clone()
          .sub(driverRest.worldPos)
          .applyQuaternion(driverDeltaQ);

        const desiredWorldPos = driverWorldPos.clone().add(restOffset);

        const desiredLocalPos = desiredWorldPos.clone();
        let desiredLocalQ = desiredWorldQ.clone();

        if (driven.parent) {
          driven.parent.worldToLocal(desiredLocalPos);

          const parentWorldQ =
            driven.parent.getWorldQuaternion(new THREE.Quaternion());
          desiredLocalQ = parentWorldQ
            .invert()
            .multiply(desiredWorldQ)
            .normalize();
        }

        driven.position.copy(desiredLocalPos);
        driven.quaternion.copy(desiredLocalQ);
        driven.scale.copy(drivenRest.scale);
        updateSlotWorld(tgt);

        const d = data.get(binding.driven);
        if (!d) continue;

        const q = desiredLocalQ.clone();
        if (d.previousQ && d.previousQ.dot(q) < 0) {
          q.x *= -1;
          q.y *= -1;
          q.z *= -1;
          q.w *= -1;
          driven.quaternion.copy(q);
          updateSlotWorld(tgt);
        }

        d.p.push(
          driven.position.x,
          driven.position.y,
          driven.position.z
        );
        d.q.push(q.x, q.y, q.z, q.w);
        d.previousQ = q.clone();
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
  }

  log(
    `Preview Rigify virtual-FK → DEF: ${bindings.length} bindings · ` +
    `${tracks.length} curvas POS/ROT · estrategia CloudRig · export intacto.`
  );

  return tracks.length
    ? new THREE.AnimationClip(
        'Rigify_Viewport_DEF_Preview',
        controlClip.duration,
        tracks
      )
    : null;
}

function rigifyPreviewSourceFeet() {
  const src = state.source;
  return [
    findBoneByOriginalExact(src, ['mixamorig1:LeftFoot', 'mixamorig:LeftFoot', 'LeftFoot']) ||
      findSemanticBone(src, 'LeftFoot'),
    findBoneByOriginalExact(src, ['mixamorig1:LeftToeBase', 'mixamorig:LeftToeBase', 'LeftToeBase']) ||
      findSemanticBone(src, 'LeftToeBase'),
    findBoneByOriginalExact(src, ['mixamorig1:RightFoot', 'mixamorig:RightFoot', 'RightFoot']) ||
      findSemanticBone(src, 'RightFoot'),
    findBoneByOriginalExact(src, ['mixamorig1:RightToeBase', 'mixamorig:RightToeBase', 'RightToeBase']) ||
      findSemanticBone(src, 'RightToeBase')
  ].filter(Boolean);
}

function rigifyPreviewTargetFeet() {
  const tgt = state.target;
  return [
    findBoneByOriginalExact(tgt, ['DEF-foot.L', 'foot_fk.L']),
    findBoneByOriginalExact(tgt, ['DEF-toe.L', 'toe_fk.L']),
    findBoneByOriginalExact(tgt, ['DEF-foot.R', 'foot_fk.R']),
    findBoneByOriginalExact(tgt, ['DEF-toe.R', 'toe_fk.R'])
  ].filter(Boolean);
}

function minBoneWorldY(slot, names, useRest = false) {
  let minY = Infinity;

  for (const name of names) {
    if (!name) continue;

    if (useRest) {
      const rest = slot.rest.get(name);
      if (rest) minY = Math.min(minY, rest.worldPos.y);
      continue;
    }

    const bone = slot.bones.get(name);
    if (!bone) continue;
    minY = Math.min(
      minY,
      bone.getWorldPosition(new THREE.Vector3()).y
    );
  }

  return Number.isFinite(minY) ? minY : null;
}

function rigifyPreviewVerticalScale(sourceFloor, targetFloor) {
  const srcHead =
    findBoneByOriginalExact(state.source, ['mixamorig1:Head', 'mixamorig:Head', 'Head']) ||
    findSemanticBone(state.source, 'Head');
  const tgtHead =
    findBoneByOriginalExact(state.target, ['DEF-head', 'head']);

  const srcHeadY = srcHead
    ? state.source.rest.get(srcHead)?.worldPos?.y
    : null;
  const tgtHeadY = tgtHead
    ? state.target.rest.get(tgtHead)?.worldPos?.y
    : null;

  const srcHeight = Number.isFinite(srcHeadY) ? srcHeadY - sourceFloor : NaN;
  const tgtHeight = Number.isFinite(tgtHeadY) ? tgtHeadY - targetFloor : NaN;

  const ratio =
    Number.isFinite(srcHeight) &&
    Number.isFinite(tgtHeight) &&
    Math.abs(srcHeight) > 1e-5
      ? tgtHeight / srcHeight
      : 1;

  return Number.isFinite(ratio)
    ? THREE.MathUtils.clamp(ratio, 0.5, 2)
    : 1;
}

function resetRigifyPreviewGroundAlignment() {
  const displayRoot = state.target.displayRoot;
  if (!displayRoot) return;

  if (!Number.isFinite(displayRoot.userData.waltPreviewBaseY)) {
    displayRoot.userData.waltPreviewBaseY = displayRoot.position.y;
  }

  displayRoot.position.y = displayRoot.userData.waltPreviewBaseY;
  displayRoot.updateMatrixWorld(true);
}

function applyRigifyPreviewGroundAlignment() {
  const displayRoot = state.target.displayRoot;

  if (
    !displayRoot ||
    !usesRigifyPipeline() ||
    !state.targetPreviewClip ||
    !state.source.activeClip
  ) {
    resetRigifyPreviewGroundAlignment();
    return;
  }

  if (!Number.isFinite(displayRoot.userData.waltPreviewBaseY)) {
    displayRoot.userData.waltPreviewBaseY = displayRoot.position.y;
  }

  // Measure from an unshifted Target every frame. The resulting correction is
  // applied only to the display parent, so export clips and bone transforms
  // remain byte-for-byte untouched.
  displayRoot.position.y = displayRoot.userData.waltPreviewBaseY;
  updateSlotWorld(state.target);

  const sourceFeet = rigifyPreviewSourceFeet();
  const targetFeet = rigifyPreviewTargetFeet();
  if (!sourceFeet.length || !targetFeet.length) return;

  const sourceFloor = minBoneWorldY(state.source, sourceFeet, true);
  const targetFloor = minBoneWorldY(state.target, targetFeet, true);
  const sourceCurrent = minBoneWorldY(state.source, sourceFeet, false);
  const targetCurrent = minBoneWorldY(state.target, targetFeet, false);

  if (
    sourceFloor == null ||
    targetFloor == null ||
    sourceCurrent == null ||
    targetCurrent == null
  ) {
    return;
  }

  // Reproduce the Source's actual vertical foot trajectory. If a foot is on
  // its rest floor, the Target is placed on its own rest floor; if the Source
  // is genuinely airborne, that height is preserved proportionally.
  const verticalScale = rigifyPreviewVerticalScale(
    sourceFloor,
    targetFloor
  );
  const desiredTargetFootY =
    targetFloor + (sourceCurrent - sourceFloor) * verticalScale;

  const correctionY = THREE.MathUtils.clamp(
    desiredTargetFootY - targetCurrent,
    -2,
    2
  );

  displayRoot.position.y =
    displayRoot.userData.waltPreviewBaseY + correctionY;
  displayRoot.updateMatrixWorld(true);
}

function rebuildTargetPreviewClip() {
  if (!state.fkClip) return;

  if (usesRigifyPipeline()) {
    // Rigify now previews the same way CloudRig does:
    // play the RAW FK controls and let a live runtime reconstruct the missing
    // Blender constraint/MCH result onto DEF every frame.
    state.deformPreviewClip = null;

    state.targetPreviewClip = mergeClips(
      'Rigify_Viewport_Preview',
      [
        state.fkRawClip || state.fkClip,
        state.ikOnlyClip
      ]
    );
    return;
  }

  if (usesAutoRigProPipeline()) {
    if (
      state.activePresetId === 'mixamo_to_arp' &&
      state.deformPreviewClip
    ) {
      // The *_ref branch is a clean anatomical hierarchy. Animate it, then
      // copy its evaluated WORLD pose to the actual bones used by the mesh.
      state.targetPreviewClip = state.deformPreviewClip;
      return;
    }

    const controlPreview = state.fkClip || state.fkRawClip;

    state.targetPreviewClip = state.ikOnlyClip
      ? mergeClips(
          'AutoRigPro_Viewport_Preview',
          [controlPreview, state.ikOnlyClip]
        )
      : controlPreview;

    return;
  }

  if (usesMixamoControlRigPipeline() && state.deformPreviewClip) {
    // Mixamo Control Rig has a separate mixamorig deform branch, so the
    // control and deform clips can coexist in the viewport.
    state.targetPreviewClip = mergeClips(
      'MixamoControlRig_Viewport_Preview',
      [
        state.fkRawClip || state.fkClip,
        state.deformPreviewClip,
        state.ikOnlyClip
      ]
    );
    return;
  }

  state.targetPreviewClip = state.ikOnlyClip
    ? mergeClips(
        'Preview_FK_IK',
        [state.fkClip, state.ikOnlyClip]
      )
    : state.fkClip;
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
  resetRigifyPreviewGroundAlignment();
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

    let bakedRaw;
    state.deformPreviewClip = null;

    if (usesAutoRigProPipeline()) {
      const isMixamoToArp = state.activePresetId === 'mixamo_to_arp';
      const deformMap = isMixamoToArp
        ? buildMixamoToArpReferencePreviewMap()
        : buildAutoRigProDeformPreviewMap();

      if (!deformMap.length) {
        throw new Error(
          isMixamoToArp
            ? 'Mixamo → Auto-Rig Pro: no pude construir el preview *_ref.'
            : 'Auto-Rig Pro detectado, pero no encontré su esqueleto deform embebido.'
        );
      }

      state.fkRawClip = bakeRetarget(
        map,
        'Retargeted_AutoRigPro_RAW'
      );

      state.deformPreviewClip = bakeRetarget(
        deformMap,
        isMixamoToArp
          ? 'Retargeted_ARP_Reference_Preview'
          : 'Retargeted_DEF_Preview'
      );

      if (!state.fkRawClip?.tracks?.length) {
        throw new Error(
          'Auto-Rig Pro: el bake no produjo curvas de controles válidas.'
        );
      }

      log(
        isMixamoToArp
          ? `Mixamo → ARP preview *_ref: ${deformMap.length} mappings · ` +
            `${state.deformPreviewClip?.tracks?.length || 0} tracks de referencia.`
          : `Auto-Rig Pro preview híbrido (carrier+deform): ${deformMap.length} mappings · ` +
            `${state.deformPreviewClip?.tracks?.length || 0} tracks deform.`
      );

      if (isMixamoToArp) {
        logAutoRigProSkinPreviewCoverage(
          resolveAutoRigProRefToSkinBindings()
        );
      }
    } else if (usesMixamoControlRigPipeline()) {
      const deformMap = buildMixamoControlRigDeformPreviewMap();

      if (!deformMap.length) {
        throw new Error(
          'Mixamo Control Rig detectado, pero no encontré su esqueleto mixamorig deform.'
        );
      }

      // Mixamo Control Rig keeps the deform skeleton as a separate branch,
      // so one combined sampling pass is safe and faster.
      const combinedMap = [...map, ...deformMap];
      bakedRaw = bakeRetarget(
        combinedMap,
        'Retargeted_MixamoControlRig_RAW'
      );

      const controlTargets = new Set(map.map(pair => pair.target));
      const deformTargets = new Set(deformMap.map(pair => pair.target));

      state.fkRawClip = filterClipToTargets(
        bakedRaw,
        controlTargets,
        'Retargeted_FK_RAW'
      );

      state.deformPreviewClip = filterClipToTargets(
        bakedRaw,
        deformTargets,
        'Retargeted_DEF_Preview'
      );

      if (!state.fkRawClip?.tracks?.length) {
        throw new Error(
          'Mixamo Control Rig: el bake no produjo curvas Ctrl_* válidas.'
        );
      }

      log(
        `Mixamo Control Rig preview: ${deformTargets.size} huesos deform detectados · ` +
        `${state.deformPreviewClip?.tracks?.length || 0} tracks de preview.`
      );
    } else {
      state.fkRawClip = bakeRetarget(map, 'Retargeted_FK_RAW');
    }

    // CloudRig, Rigify and Auto-Rig Pro lose functional Blender parent /
    // constraint relationships in FBX, so their export Action is recoded
    // against the original-rig basis. Mixamo Control Rig keeps its raw bake.
    state.fkClip = usesCloudRigPipeline()
      ? buildOriginalRigTransferClip(state.fkRawClip)
      : usesRigifyPipeline()
        ? buildRigifyOriginalRigTransferClip(state.fkRawClip)
        : usesUeToAutoRigProPipeline()
          ? buildUeAutoRigProHelperBridgeAction(state.fkRawClip)
          : usesAutoRigProPipeline()
            ? buildAutoRigProOriginalRigTransferClip(state.fkRawClip)
            : state.fkRawClip.clone();

    state.fkClip.name = 'Retargeted_FK';

    if (usesUeToAutoRigProPipeline()) {
      log(
        'UE → Auto-Rig Pro FK: Helper Bridge activo · Source WORLD → helpers independientes → ' +
        '*_ref local → matrix_basis c_*.'
      );
    }
    state.ikOnlyClip = null;
    state.exportClip = state.fkClip;
    state.exported = false;

    // Preview stays separate from export. Embedded Blender control rigs keep
    // animator-control tracks plus a deform-only companion for the mesh.
    if (!usesEmbeddedDeformControlRigPipeline()) {
      state.deformPreviewClip = null;
    }
    rebuildTargetPreviewClip();

    if (state.ghost.enabled) {
      rebuildGhostOverlay();
    }

    state.playTime = 0;
    playTargetClip(state.targetPreviewClip);
    updateTimelineBounds();
    seek(0);

    // Transfer means "show me the result": start playback automatically.
    state.playing = true;
    state.lastFrame = performance.now();
    $('playPause').textContent = 'Ⅱ';

    updateButtons();
    updateStats();
    setStatus('Retarget FK listo · reproduciendo', 'good');
    const rt = state.target.rigRuntime?.status;
    log(
      `Retarget FK: ${map.length} controles FK, ${state.fkClip.tracks.length} curvas TRS, ` +
      `${Number($('fps').value) || 30} FPS. Action DEF=0. ` +
      (usesEmbeddedDeformControlRigPipeline()
        ? `${usesAutoRigProPipeline() ? 'ARP' : 'MixamoCtrl'} preview=${state.deformPreviewClip?.tracks?.length || 0} tracks.`
        : `WaltRig Runtime FK→DEF=${rt ? `${rt.bindings}/${rt.requestedBindings}` : 'n/a'}.`)
    );
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

// The exported Rigify FBX preserves the bone tree, but Blender does NOT
// export Rigify's live COPY_TRANSFORMS / ARMATURE parent-switch constraints.
// These are the animator-control relationships that the ORIGINAL .blend
// evaluates when the already-correct FK Action is assigned.
//
// Reconstruct only the controls needed by Mixamo -> Rigify FK->IK. This is
// intentionally separate from the raw FBX hierarchy.
const RIGIFY_ORIGINAL_LOGICAL_PARENT = {
  'torso': 'root',

  // Rigify basic_spine has two FK branches below torso.
  'spine_fk.001': 'torso',
  'spine_fk': 'spine_fk.001',
  'spine_fk.002': 'torso',
  'spine_fk.003': 'spine_fk.002',

  // shoulder is basic.super_copy: ORG-shoulder COPY_TRANSFORMS shoulder.
  'shoulder.L': 'spine_fk.003',
  'shoulder.R': 'spine_fk.003',

  // Limb FK controls collapse the missing MCH/ORG helper chain to the
  // animator-visible controls that actually determine the evaluated pose.
  'upper_arm_fk.L': 'shoulder.L',
  'forearm_fk.L': 'upper_arm_fk.L',
  'hand_fk.L': 'forearm_fk.L',
  'upper_arm_fk.R': 'shoulder.R',
  'forearm_fk.R': 'upper_arm_fk.R',
  'hand_fk.R': 'forearm_fk.R',

  // Thigh parent lives below the lower spine result.
  'thigh_fk.L': 'spine_fk',
  'shin_fk.L': 'thigh_fk.L',
  'foot_fk.L': 'shin_fk.L',
  'toe_fk.L': 'foot_fk.L',
  'thigh_fk.R': 'spine_fk',
  'shin_fk.R': 'thigh_fk.R',
  'foot_fk.R': 'shin_fk.R',
  'toe_fk.R': 'foot_fk.R'
};

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

function resolveRigifyLogicalParentName(tgt, runtimeName) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const original = originalObjectName(bone) || runtimeName;
  const parentOriginal = RIGIFY_ORIGINAL_LOGICAL_PARENT[original];
  if (!parentOriginal) return null;

  return (
    findBoneByOriginalExact(tgt, [parentOriginal]) ||
    findSemanticBone(tgt, parentOriginal) ||
    null
  );
}

// Reconstruct MCH-hand_fk exactly enough for the original Rigify FK chain.
// Rigify parents this helper to forearm_fk with inherit_scale='NONE', then
// parents hand_fk under the helper. The raw exported FBX keeps the node but
// loses Blender's inherit-scale evaluation.
//
// Blender BONE_INHERIT_SCALE_NONE:
// - translation follows the FULL parent pose matrix;
// - rotation removes parent scale/shear before applying the rest offset.
// That split matters at the wrist and was previously collapsed to
// forearm_fk -> hand_fk.
function rigifyHandFkHelperPoseMatrix(
  tgt,
  handRuntimeName,
  cache,
  out = new THREE.Matrix4()
) {
  const handBone = tgt.bones.get(handRuntimeName);
  if (!handBone) return null;

  const handOriginal = originalObjectName(handBone) || handRuntimeName;
  const match = /^hand_fk\.([LR])$/i.exec(handOriginal);
  if (!match) return null;

  const side = match[1].toUpperCase();
  const helperName =
    findBoneByOriginalExact(tgt, [`MCH-hand_fk.${side}`]);
  const foreName =
    findBoneByOriginalExact(tgt, [`forearm_fk.${side}`]);

  if (!helperName || !foreName) return null;

  const forePose = rigifyOriginalFkPoseMatrix(
    tgt, foreName, cache, new THREE.Matrix4()
  );
  const foreRest = composeRestWorldMatrix(
    tgt, foreName, new THREE.Matrix4()
  );
  const helperRest = composeRestWorldMatrix(
    tgt, helperName, new THREE.Matrix4()
  );

  if (!forePose || !foreRest || !helperRest) return null;

  const restRelative = foreRest.clone()
    .invert()
    .multiply(helperRest);

  // Rotation branch of BONE_INHERIT_SCALE_NONE:
  // strip parent scale/shear but retain parent translation/orientation.
  const parentPos = new THREE.Vector3();
  const parentQ = new THREE.Quaternion();
  forePose.decompose(
    parentPos,
    parentQ,
    new THREE.Vector3()
  );
  parentQ.normalize();

  const unscaledParent = new THREE.Matrix4().compose(
    parentPos,
    parentQ,
    new THREE.Vector3(1, 1, 1)
  );

  const helperPose = unscaledParent.multiply(restRelative);

  // Location branch uses the FULL parent pose transform on the helper's
  // rest offset, matching BKE_bone_parent_transform_calc_from_matrices.
  const restOffset = new THREE.Vector3();
  restRelative.decompose(
    restOffset,
    new THREE.Quaternion(),
    new THREE.Vector3()
  );
  const helperPos = restOffset.applyMatrix4(forePose);

  helperPose.elements[12] = helperPos.x;
  helperPose.elements[13] = helperPos.y;
  helperPose.elements[14] = helperPos.z;

  cache?.set(helperName, helperPose.clone());
  return out.copy(helperPose);
}

// Reconstruct the pose that the ORIGINAL Rigify evaluates from the FK Action.
// The critical difference from bone.matrixWorld is torso_parent and the
// shoulder super_copy constraint: both are lost in an exported FBX.
function rigifyOriginalFkPoseMatrix(
  tgt,
  runtimeName,
  cache,
  out = new THREE.Matrix4()
) {
  if (cache?.has(runtimeName)) {
    return out.copy(cache.get(runtimeName));
  }

  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const rawRestLocal = composeRestLocalMatrix(
    tgt, runtimeName, new THREE.Matrix4()
  );
  const restWorld = composeRestWorldMatrix(
    tgt, runtimeName, new THREE.Matrix4()
  );
  if (!rawRestLocal || !restWorld) return null;

  const currentLocal = new THREE.Matrix4().compose(
    bone.position.clone(),
    bone.quaternion.clone(),
    bone.scale.clone()
  );

  // The FK Action carrier stores raw FBX rest-local * Blender matrix_basis.
  const basis = rawRestLocal.clone()
    .invert()
    .multiply(currentLocal);

  let poseWorld = null;

  // hand_fk is NOT a direct child of forearm_fk in original Rigify:
  // forearm_fk -> MCH-hand_fk -> hand_fk.
  // Reconstruct that helper before applying hand_fk matrix_basis.
  const original = originalObjectName(bone) || runtimeName;
  if (/^hand_fk\.[LR]$/i.test(original)) {
    const helperPose = rigifyHandFkHelperPoseMatrix(
      tgt, runtimeName, cache, new THREE.Matrix4()
    );

    const side = original.slice(-1).toUpperCase();
    const helperName =
      findBoneByOriginalExact(tgt, [`MCH-hand_fk.${side}`]);
    const helperRest = helperName
      ? composeRestWorldMatrix(tgt, helperName, new THREE.Matrix4())
      : null;

    if (helperPose && helperRest) {
      const handRestRelative = helperRest.clone()
        .invert()
        .multiply(restWorld);

      poseWorld = helperPose
        .multiply(handRestRelative)
        .multiply(basis);
    }
  }

  const parentName = resolveRigifyLogicalParentName(tgt, runtimeName);

  if (!poseWorld && parentName) {
    const parentPose = rigifyOriginalFkPoseMatrix(
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

  // root and any non-mapped auxiliary fallback.
  if (!poseWorld) {
    poseWorld = restWorld.clone().multiply(basis);
  }

  cache?.set(runtimeName, poseWorld.clone());
  return out.copy(poseWorld);
}

function rigifyOriginalFkPose(tgt, runtimeName, cache) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const matrix = rigifyOriginalFkPoseMatrix(
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

function rigifyChainPoseSnapshot(tgt, chain, cache) {
  const a = rigifyOriginalFkPose(tgt, chain.a, cache);
  const b = rigifyOriginalFkPose(tgt, chain.b, cache);
  const c = rigifyOriginalFkPose(tgt, chain.c, cache);
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

    const cache = new Map();
    const snap = rigifyChainPoseSnapshot(tgt, chain, cache);
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
  // Rigify's pole_parent defaults to the limb's rig_parent_bone:
  // arm -> ORG-shoulder (which is COPY_TRANSFORMS shoulder control)
  // leg -> ORG-spine (lower torso result).
  //
  // Use equivalent animator controls so the parent delta is reconstructible
  // from the FK Action even though ORG constraints are absent in the FBX.
  const parentOriginal = chain.kind === 'ARM'
    ? `shoulder.${chain.side}`
    : 'spine_fk';

  return (
    findBoneByOriginalExact(tgt, [parentOriginal]) ||
    findSemanticBone(tgt, parentOriginal) ||
    findBoneByOriginalExact(tgt, ['root']) ||
    null
  );
}

function rigifyFunctionalParentName(tgt, chain, kind) {
  // hand_ik / foot_ik explicitly select Root in SwitchParentBuilder.
  if (kind === 'IK') {
    return findBoneByOriginalExact(tgt, ['root']) || null;
  }
  return rigifyPoleFunctionalParentName(tgt, chain);
}

function rigifyFunctionalParentPoseMatrix(
  tgt,
  chain,
  kind,
  fkPoseCache,
  out
) {
  const parentName = rigifyFunctionalParentName(tgt, chain, kind);
  if (!parentName) return out.identity();

  const pose = rigifyOriginalFkPoseMatrix(
    tgt, parentName, fkPoseCache, out
  );

  return pose || out.identity();
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
  outMatrix,
  noLocalLocation = false
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

  const helper = control.parent?.isBone ? control.parent : null;
  const helperOriginal = helper
    ? (originalObjectName(helper) || helper.name)
    : '';

  let parentPose = functionalParentPose.clone();
  let parentRest = functionalParentRest.clone();
  let ctrlRelRest = null;

  if (helper && /^MCH-.*\.parent$/i.test(helperOriginal)) {
    const helperRestWorld = composeRestWorldMatrix(
      tgt, helper.name, new THREE.Matrix4()
    );

    if (helperRestWorld) {
      // SwitchParentBuilder evaluates the root-level MCH proxy from the
      // selected parent's pose delta. Reconstruct that evaluated helper
      // first; this is the ACTUAL direct parent frame of hand_ik / pole.
      const carrierDelta = functionalParentPose.clone()
        .multiply(functionalParentRest.clone().invert());

      parentPose = carrierDelta.multiply(helperRestWorld);
      parentRest = helperRestWorld;

      ctrlRelRest = helperRestWorld.clone()
        .invert()
        .multiply(controlRestWorld);
    }
  }

  if (!ctrlRelRest) {
    ctrlRelRest = parentRest.clone()
      .invert()
      .multiply(controlRestWorld);
  }

  let basisT;
  const basisQ = new THREE.Quaternion();
  const basisS = new THREE.Vector3();

  if (noLocalLocation) {
    // Port of Blender's BKE_armature_mat_pose_to_bone common Rigify case:
    //   BONE_NO_LOCAL_LOCATION + use_inherit_rotation + inherit_scale=AVERAGE.
    //
    // Blender deliberately uses TWO parent transforms here:
    //   rotscale_mat -> rotation / scale channels
    //   loc_mat      -> location channels
    //
    // Treating location as a normal inverse(parent * rest) transform is the
    // source of the remaining Rigify hand offset. BlendCap's classic solver
    // avoids the same bug by delegating t_pb.matrix to this Blender routine.
    const parentP = new THREE.Vector3();
    const parentQ = new THREE.Quaternion();
    const parentS = new THREE.Vector3();
    parentPose.decompose(parentP, parentQ, parentS);
    parentQ.normalize();

    // BONE_INHERIT_SCALE_AVERAGE:
    // remove parent shear/non-uniform scale, then apply cubic-root volume
    // scale uniformly before multiplying the child's rest offset.
    const volumeScale = Math.cbrt(Math.abs(
      parentS.x * parentS.y * parentS.z
    )) || 1;

    const parentAverage = new THREE.Matrix4().compose(
      parentP,
      parentQ,
      new THREE.Vector3(volumeScale, volumeScale, volumeScale)
    );

    const rotScaleMat = parentAverage
      .multiply(ctrlRelRest);

    const boneBasisRS = rotScaleMat.clone()
      .invert()
      .multiply(desiredWorld);

    boneBasisRS.decompose(
      new THREE.Vector3(),
      basisQ,
      basisS
    );
    basisQ.normalize();

    // BONE_NO_LOCAL_LOCATION loc_mat:
    // Blender does NOT decompose/recompose parent_pose_mat here. It copies
    // the raw parent 3x3, preserving scale AND shear, and combines that
    // with the posed rest-head translation. This distinction is small but
    // visible at the Rigify wrist (both hands land slightly inward if the
    // raw 3x3 is replaced by quaternion+scale).
    const restOffset = new THREE.Vector3();
    ctrlRelRest.decompose(
      restOffset,
      new THREE.Quaternion(),
      new THREE.Vector3()
    );

    const restHeadAtPose = restOffset.clone()
      .applyMatrix4(parentPose);

    const pe = parentPose.elements;
    const locMat = new THREE.Matrix4();
    locMat.set(
      pe[0], pe[4], pe[8],  restHeadAtPose.x,
      pe[1], pe[5], pe[9],  restHeadAtPose.y,
      pe[2], pe[6], pe[10], restHeadAtPose.z,
      0,     0,     0,      1
    );

    const desiredT = new THREE.Vector3();
    desiredWorld.decompose(
      desiredT,
      new THREE.Quaternion(),
      new THREE.Vector3()
    );

    basisT = desiredT.applyMatrix4(locMat.clone().invert());
  } else {
    const poseIdentity = parentPose.clone().multiply(ctrlRelRest);
    const basisFull = poseIdentity.clone()
      .invert()
      .multiply(desiredWorld);

    basisT = new THREE.Vector3();
    basisFull.decompose(basisT, basisQ, basisS);
    basisQ.normalize();
  }

  const basis = new THREE.Matrix4().compose(
    basisT,
    basisQ,
    basisS
  );

  // Exact-FBX carrier convention: raw rest local * Blender matrix_basis.
  return outMatrix.copy(rawRestLocal).multiply(basis);
}


function bakeRigifyIkFromFk() {
  if (!state.fkClip) {
    throw new Error('Primero aplica el retargeting FK de Rigify.');
  }

  const tgt = state.target;

  // IMPORTANT: use the exact FK Action carrier that is already proven on
  // the ORIGINAL Rigify, then reconstruct its missing live constraints.
  const solveClip = state.fkClip;
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
  const s3 = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      // One logical-pose cache per frame. This reconstructs root -> torso
      // carry and shoulder COPY_TRANSFORMS before any IK target is solved.
      const fkPoseCache = new Map();

      // End effectors from the evaluated ORIGINAL-Rigify FK pose.
      for (const chain of chains) {
        const snap = rigifyChainPoseSnapshot(tgt, chain, fkPoseCache);
        if (!snap) continue;

        poseToMatrix(snap.c, fkPoseWorld);
        if (!restWorldMatrix(tgt, chain.c, fkRestWorld)) continue;
        if (!restWorldMatrix(tgt, chain.ik, ikRestWorld)) continue;

        // BlendCap bake principle:
        // desired IK = evaluated FK end * FK-rest^-1 * IK-rest.
        desiredIkWorld.copy(fkPoseWorld)
          .multiply(fkRestWorld.clone().invert())
          .multiply(ikRestWorld);

        rigifyFunctionalParentPoseMatrix(
          tgt, chain, 'IK', fkPoseCache, parentPose
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
          encodedLocal,
          chain.kind === 'ARM'
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s3);
        q.normalize();

        const d = data.get(chain.ik);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();
        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s3.x, s3.y, s3.z);
      }

      // Pole targets are derived from the SAME reconstructed FK geometry.
      for (const chain of chains) {
        const snap = rigifyChainPoseSnapshot(tgt, chain, fkPoseCache);
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
          tgt, chain, 'POLE', fkPoseCache, parentPose
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
          encodedLocal,
          chain.kind === 'ARM'
        );
        if (!encoded) continue;

        encoded.decompose(p, q, s3);
        q.normalize();

        const d = data.get(chain.pole);
        if (d.lastQ && d.lastQ.dot(q) < 0) {
          q.x *= -1; q.y *= -1; q.z *= -1; q.w *= -1;
        }
        d.lastQ = q.clone();
        d.p.push(p.x, p.y, p.z);
        d.q.push(q.x, q.y, q.z, q.w);
        d.s.push(s3.x, s3.y, s3.z);
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
    'FK→IK Rigify original-evaluated: fuente=FK Action portable; ' +
    'piernas conservadas; hand_ik usa BKE no-local con parent 3x3 crudo; ' +
    'hand parent=root; arm pole parent=shoulder.'
  );

  return new THREE.AnimationClip(
    'Retargeted_IK_Controls',
    solveClip.duration,
    tracks
  );
}


const MIXAMO_CONTROL_RIG_IK_CHAINS = [
  {
    kind: 'ARM', side: 'L',
    a: 'Ctrl_Arm_FK_Left',
    b: 'Ctrl_ForeArm_FK_Left',
    c: 'Ctrl_Hand_FK_Left',
    ik: 'Ctrl_Hand_IK_Left',
    pole: 'Ctrl_ArmPole_IK_Left'
  },
  {
    kind: 'ARM', side: 'R',
    a: 'Ctrl_Arm_FK_Right',
    b: 'Ctrl_ForeArm_FK_Right',
    c: 'Ctrl_Hand_FK_Right',
    ik: 'Ctrl_Hand_IK_Right',
    pole: 'Ctrl_ArmPole_IK_Right'
  },
  {
    kind: 'LEG', side: 'L',
    a: 'Ctrl_UpLeg_FK_Left',
    b: 'Ctrl_Leg_FK_Left',
    c: 'Ctrl_Foot_FK_Left',
    ik: 'Ctrl_Foot_IK_Left',
    pole: 'Ctrl_LegPole_IK_Left'
  },
  {
    kind: 'LEG', side: 'R',
    a: 'Ctrl_UpLeg_FK_Right',
    b: 'Ctrl_Leg_FK_Right',
    c: 'Ctrl_Foot_FK_Right',
    ik: 'Ctrl_Foot_IK_Right',
    pole: 'Ctrl_LegPole_IK_Right'
  }
];

const AUTO_RIG_PRO_IK_CHAINS = [
  {
    kind: 'ARM', side: 'L',
    a: 'arm.l',
    b: 'forearm.l',
    c: 'hand.l',
    ik: 'c_hand_ik.l',
    pole: 'c_arms_pole.l'
  },
  {
    kind: 'ARM', side: 'R',
    a: 'arm.r',
    b: 'forearm.r',
    c: 'hand.r',
    ik: 'c_hand_ik.r',
    pole: 'c_arms_pole.r'
  },
  {
    kind: 'LEG', side: 'L',
    a: 'thigh.l',
    b: 'leg.l',
    c: 'foot.l',
    ik: 'c_foot_ik.l',
    pole: 'c_leg_pole.l'
  },
  {
    kind: 'LEG', side: 'R',
    a: 'thigh.r',
    b: 'leg.r',
    c: 'foot.r',
    ik: 'c_foot_ik.r',
    pole: 'c_leg_pole.r'
  }
];

function resolveDirectControlIkChains(tgt, definitions) {
  return definitions.map(def => {
    const resolved = { ...def };

    for (const key of ['a', 'b', 'c', 'ik', 'pole']) {
      const runtimeName =
        findBoneByOriginalExact(tgt, [def[key]]) ||
        findSemanticBone(tgt, def[key]);

      if (!runtimeName) return null;
      resolved[key] = runtimeName;
    }

    return resolved;
  }).filter(Boolean);
}

function directControlChainSnapshot(tgt, chain) {
  const read = runtimeName => {
    const bone = tgt.bones.get(runtimeName);
    if (!bone) return null;

    return {
      bone,
      position: bone.getWorldPosition(new THREE.Vector3()),
      quaternion: bone.getWorldQuaternion(new THREE.Quaternion()).normalize(),
      scale: bone.getWorldScale(new THREE.Vector3())
    };
  };

  const a = read(chain.a);
  const b = read(chain.b);
  const c = read(chain.c);

  return a && b && c ? { a, b, c } : null;
}

function scanDirectControlPoleAnchor(tgt, mixer, chain, times) {
  let bestLen = 0;
  let bestLocal = null;
  const step = Math.max(1, Math.floor(times.length / 60));

  for (let i = 0; i < times.length; i += step) {
    restoreRest(tgt);
    mixer.setTime(Number(times[i]));
    updateSlotWorld(tgt);

    const snap = directControlChainSnapshot(tgt, chain);
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

function directControlWorldToLocalMatrix(
  tgt,
  runtimeName,
  desiredWorld,
  out = new THREE.Matrix4()
) {
  const bone = tgt.bones.get(runtimeName);
  if (!bone) return null;

  const parent = bone.parent;

  if (parent) {
    parent.updateMatrixWorld(true);
    return out.copy(parent.matrixWorld)
      .invert()
      .multiply(desiredWorld);
  }

  return out.copy(desiredWorld);
}

function bakeDirectControlRigIkFromFk(
  definitions,
  label,
  solveClipOverride = null,
  { preserveRestPoleDistance = false } = {}
) {
  const solveClip = solveClipOverride || state.fkClip;

  if (!solveClip) {
    throw new Error('Primero aplica el retargeting FK.');
  }

  const tgt = state.target;

  const fps = Math.max(1, Math.min(120, Number($('fps').value) || 30));
  const frameCount = Math.max(2, Math.ceil(solveClip.duration * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(solveClip.duration, i / fps)
  );

  const chains = resolveDirectControlIkChains(tgt, definitions);

  if (chains.length !== 4) {
    throw new Error(
      `FK→IK ${label} incompleto: encontré ${chains.length}/4 cadenas IK.`
    );
  }

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(solveClip).play();

  const poleAnchors = new Map();
  const poleRestDistances = new Map();

  for (const chain of chains) {
    poleAnchors.set(
      chain.pole,
      scanDirectControlPoleAnchor(tgt, mixer, chain, times)
    );

    if (preserveRestPoleDistance) {
      const bendRest = tgt.rest.get(chain.b);
      const poleRest = tgt.rest.get(chain.pole);
      const restDistance = bendRest && poleRest
        ? bendRest.worldPos.distanceTo(poleRest.worldPos)
        : NaN;

      if (Number.isFinite(restDistance) && restDistance > 1e-5) {
        poleRestDistances.set(chain.pole, restDistance);
      }
    }
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
        const snap = directControlChainSnapshot(tgt, chain);
        if (!snap) continue;

        const fkRest = tgt.rest.get(chain.c);
        const ikRest = tgt.rest.get(chain.ik);

        if (!fkRest || !ikRest) continue;

        fkPoseWorld.compose(
          snap.c.position,
          snap.c.quaternion,
          snap.c.scale
        );

        fkRestWorld.compose(
          fkRest.worldPos.clone(),
          fkRest.worldQuat.clone(),
          fkRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
        );

        ikRestWorld.compose(
          ikRest.worldPos.clone(),
          ikRest.worldQuat.clone(),
          ikRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
        );

        desiredIkWorld.copy(fkPoseWorld)
          .multiply(fkRestWorld.clone().invert())
          .multiply(ikRestWorld);

        const ikLocal = directControlWorldToLocalMatrix(
          tgt,
          chain.ik,
          desiredIkWorld,
          encodedLocal
        );

        if (ikLocal) {
          ikLocal.decompose(p, q, s);
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

        const poleRest = tgt.rest.get(chain.pole);
        if (!poleRest) continue;

        let poleWorldPos = computeBlendCapPolePointFromSnapshot(
          snap,
          poleAnchors.get(chain.pole)
        );

        const restPoleDistance = poleRestDistances.get(chain.pole);
        if (restPoleDistance) {
          const direction = poleWorldPos.clone().sub(snap.b.position);
          if (direction.lengthSq() > 1e-10) {
            poleWorldPos = snap.b.position.clone().add(
              direction.normalize().multiplyScalar(restPoleDistance)
            );
          }
        }

        desiredPoleWorld.compose(
          poleWorldPos,
          poleRest.worldQuat.clone(),
          poleRest.worldScale?.clone?.() || new THREE.Vector3(1, 1, 1)
        );

        const poleLocal = directControlWorldToLocalMatrix(
          tgt,
          chain.pole,
          desiredPoleWorld,
          encodedLocal
        );

        if (!poleLocal) continue;

        poleLocal.decompose(p, q, s);
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
      `FK→IK ${label} aviso: se generaron ${tracks.length}/24 curvas esperadas ` +
      '(4 IK + 4 POLE × TRS).'
    );
  }

  log(
    `FK→IK ${label}: end effectors hacen snap a la pose FK; ` +
    'los poles usan el plano real de codo/rodilla con estabilización.'
  );

  return new THREE.AnimationClip(
    'Retargeted_IK_Controls',
    solveClip.duration,
    tracks
  );
}

function bakeMixamoControlRigIkFromFk() {
  return bakeDirectControlRigIkFromFk(
    MIXAMO_CONTROL_RIG_IK_CHAINS,
    'Mixamo Control Rig'
  );
}

function bakeAutoRigProIkFromFk() {
  return bakeDirectControlRigIkFromFk(
    AUTO_RIG_PRO_IK_CHAINS,
    'Auto-Rig Pro',
    state.deformPreviewClip || state.fkRawClip || state.fkClip,
    { preserveRestPoleDistance: true }
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
      : usesMixamoControlRigPipeline()
        ? [
            'Ctrl_Arm_FK_Left', 'Ctrl_ForeArm_FK_Left', 'Ctrl_Hand_FK_Left',
            'Ctrl_Arm_FK_Right', 'Ctrl_ForeArm_FK_Right', 'Ctrl_Hand_FK_Right',
            'Ctrl_UpLeg_FK_Left', 'Ctrl_Leg_FK_Left', 'Ctrl_Foot_FK_Left',
            'Ctrl_UpLeg_FK_Right', 'Ctrl_Leg_FK_Right', 'Ctrl_Foot_FK_Right'
          ]
        : usesAutoRigProPipeline()
          ? [
              'c_arm_fk.l', 'c_forearm_fk.l', 'c_hand_fk.l',
              'c_arm_fk.r', 'c_forearm_fk.r', 'c_hand_fk.r',
              'c_thigh_fk.l', 'c_leg_fk.l', 'c_foot_fk.l',
              'c_thigh_fk.r', 'c_leg_fk.r', 'c_foot_fk.r'
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
      : usesMixamoControlRigPipeline()
        ? bakeMixamoControlRigIkFromFk()
        : usesAutoRigProPipeline()
          ? bakeAutoRigProIkFromFk()
          : bakeIkFromFk();
    state.exportClip = buildConvertedOutputClip($('keepFk').checked);
    state.exported = false;

    // Preview remains independent from the exported Action. For Rigify,
    // keep the viewport-only DEF bake while also showing generated IK controls.
    rebuildTargetPreviewClip();
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

  const sourceTracks = clip.tracks.map(track => track.clone());
  const replacements = new Map();

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(clip).play();

  function findQuatTrack(runtimeName) {
    return sourceTracks.find(track => {
      const parsed = parseTrackTarget(track.name);
      return (
        parsed?.nodeName === runtimeName &&
        parsed.property === 'quaternion'
      );
    }) || null;
  }

  function portableRotationTrack({
    runtimeName,
    parentRuntimeName,
    times,
    parentPoseQuaternionAtTime
  }) {
    const bone = tgt.bones.get(runtimeName);
    const rest = tgt.rest.get(runtimeName);
    const parentRest = tgt.rest.get(parentRuntimeName);
    if (!bone || !rest || !parentRest) return null;

    const restRelativeQ = parentRest.worldQuat.clone()
      .invert()
      .multiply(rest.worldQuat)
      .normalize();

    const desiredQ = new THREE.Quaternion();
    const parentPoseQ = new THREE.Quaternion();
    const identityQ = new THREE.Quaternion();
    const basisQ = new THREE.Quaternion();
    const exportLocalQ = new THREE.Quaternion();
    const values = [];
    let previous = null;

    for (const time of times) {
      restoreRest(tgt);
      mixer.setTime(Number(time));
      updateSlotWorld(tgt);

      bone.getWorldQuaternion(desiredQ).normalize();
      parentPoseQuaternionAtTime(parentPoseQ);

      identityQ.copy(parentPoseQ)
        .multiply(restRelativeQ)
        .normalize();

      basisQ.copy(identityQ)
        .invert()
        .multiply(desiredQ)
        .normalize();

      // The FBX carrier stores actual local rest * Blender matrix_basis.
      exportLocalQ.copy(rest.quaternion)
        .multiply(basisQ)
        .normalize();

      if (previous && previous.dot(exportLocalQ) < 0) {
        exportLocalQ.x *= -1;
        exportLocalQ.y *= -1;
        exportLocalQ.z *= -1;
        exportLocalQ.w *= -1;
      }

      values.push(
        exportLocalQ.x,
        exportLocalQ.y,
        exportLocalQ.z,
        exportLocalQ.w
      );
      previous = exportLocalQ.clone();
    }

    return new THREE.QuaternionKeyframeTrack(
      `${runtimeName}.quaternion`,
      Array.from(times),
      values
    );
  }

  try {
    // ---------------------------------------------------------------
    // HEAD
    // ---------------------------------------------------------------
    const headName =
      findBoneByOriginalExact(tgt, ['head']) ||
      findSemanticBone(tgt, 'head');
    const headHelperName =
      findBoneByOriginalExact(tgt, ['MCH-ROT-head']);
    const torsoName =
      findBoneByOriginalExact(tgt, ['torso']);

    if (headName && headHelperName && torsoName) {
      const head = tgt.bones.get(headName);
      const torso = tgt.bones.get(torsoName);
      const headRest = tgt.rest.get(headName);
      const helperRest = tgt.rest.get(headHelperName);
      const headTrack = findQuatTrack(headName);

      if (head && torso && headRest && helperRest && headTrack) {
        const relRestQ = helperRest.worldQuat.clone()
          .invert()
          .multiply(headRest.worldQuat)
          .normalize();

        const desiredHeadQ = new THREE.Quaternion();
        const torsoPoseQ = new THREE.Quaternion();
        const identityHeadQ = new THREE.Quaternion();
        const basisDelta = new THREE.Quaternion();
        const exportLocal = new THREE.Quaternion();
        const values = [];
        let previous = null;

        for (const time of headTrack.times) {
          restoreRest(tgt);
          mixer.setTime(Number(time));
          updateSlotWorld(tgt);

          head.getWorldQuaternion(desiredHeadQ).normalize();
          torso.getWorldQuaternion(torsoPoseQ).normalize();

          identityHeadQ.copy(torsoPoseQ)
            .multiply(relRestQ)
            .normalize();

          basisDelta.copy(identityHeadQ)
            .invert()
            .multiply(desiredHeadQ)
            .normalize();

          exportLocal.copy(headRest.quaternion)
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

        replacements.set(
          headTrack.name,
          new THREE.QuaternionKeyframeTrack(
            headTrack.name,
            Array.from(headTrack.times),
            values
          )
        );
      }
    }

    // ---------------------------------------------------------------
    // ARMS — BlendCap-style pose -> matrix_basis for ORIGINAL Rigify.
    //
    // Raw FBX hierarchy:
    // ORG-shoulder -> MCH-upper_arm_parent -> upper_arm_fk
    //                                  ... -> MCH-hand_fk -> hand_fk
    //
    // The original .blend evaluates ORG/MCH constraints that FBX loses.
    // Preserve the already-good desired WORLD rotations from the raw
    // retarget, but encode each FK control against its functional parent
    // so the Action reproduces that same world pose on the real Rigify.
    // ---------------------------------------------------------------
    for (const side of ['L', 'R']) {
      const shoulderName =
        findBoneByOriginalExact(tgt, [`shoulder.${side}`]);
      const upperName =
        findBoneByOriginalExact(tgt, [`upper_arm_fk.${side}`]);
      const foreName =
        findBoneByOriginalExact(tgt, [`forearm_fk.${side}`]);
      const handName =
        findBoneByOriginalExact(tgt, [`hand_fk.${side}`]);
      const handHelperName =
        findBoneByOriginalExact(tgt, [`MCH-hand_fk.${side}`]);

      if (
        !shoulderName || !upperName || !foreName ||
        !handName || !handHelperName
      ) {
        continue;
      }

      const shoulder = tgt.bones.get(shoulderName);
      const upper = tgt.bones.get(upperName);
      const fore = tgt.bones.get(foreName);
      const handHelperRest = tgt.rest.get(handHelperName);
      const foreRest = tgt.rest.get(foreName);
      const handRest = tgt.rest.get(handName);

      if (
        !shoulder || !upper || !fore ||
        !handHelperRest || !foreRest || !handRest
      ) {
        continue;
      }

      const upperTrack = findQuatTrack(upperName);
      const foreTrack = findQuatTrack(foreName);
      const handTrack = findQuatTrack(handName);

      if (upperTrack) {
        const replacement = portableRotationTrack({
          runtimeName: upperName,
          parentRuntimeName: shoulderName,
          times: upperTrack.times,
          parentPoseQuaternionAtTime: out =>
            shoulder.getWorldQuaternion(out).normalize()
        });
        if (replacement) replacements.set(upperTrack.name, replacement);
      }

      if (foreTrack) {
        const replacement = portableRotationTrack({
          runtimeName: foreName,
          parentRuntimeName: upperName,
          times: foreTrack.times,
          // The corrected upper_arm_fk is constructed to reproduce this
          // same raw desired WORLD quaternion on the original rig.
          parentPoseQuaternionAtTime: out =>
            upper.getWorldQuaternion(out).normalize()
        });
        if (replacement) replacements.set(foreTrack.name, replacement);
      }

      if (handTrack) {
        const helperRestRelativeQ = foreRest.worldQuat.clone()
          .invert()
          .multiply(handHelperRest.worldQuat)
          .normalize();

        const handRestRelativeQ = handHelperRest.worldQuat.clone()
          .invert()
          .multiply(handRest.worldQuat)
          .normalize();

        const desiredHandQ = new THREE.Quaternion();
        const forePoseQ = new THREE.Quaternion();
        const helperPoseQ = new THREE.Quaternion();
        const identityHandQ = new THREE.Quaternion();
        const basisQ = new THREE.Quaternion();
        const exportLocalQ = new THREE.Quaternion();
        const values = [];
        let previous = null;

        for (const time of handTrack.times) {
          restoreRest(tgt);
          mixer.setTime(Number(time));
          updateSlotWorld(tgt);

          tgt.bones.get(handName)
            .getWorldQuaternion(desiredHandQ)
            .normalize();

          fore.getWorldQuaternion(forePoseQ).normalize();

          // MCH-hand_fk has inherit_scale=NONE. For rotation this means
          // it follows the forearm's unscaled orientation plus its rest
          // offset. COPY_SCALE uniform affects scale, not quaternion.
          helperPoseQ.copy(forePoseQ)
            .multiply(helperRestRelativeQ)
            .normalize();

          identityHandQ.copy(helperPoseQ)
            .multiply(handRestRelativeQ)
            .normalize();

          basisQ.copy(identityHandQ)
            .invert()
            .multiply(desiredHandQ)
            .normalize();

          exportLocalQ.copy(handRest.quaternion)
            .multiply(basisQ)
            .normalize();

          if (previous && previous.dot(exportLocalQ) < 0) {
            exportLocalQ.x *= -1;
            exportLocalQ.y *= -1;
            exportLocalQ.z *= -1;
            exportLocalQ.w *= -1;
          }

          values.push(
            exportLocalQ.x,
            exportLocalQ.y,
            exportLocalQ.z,
            exportLocalQ.w
          );
          previous = exportLocalQ.clone();
        }

        replacements.set(
          handTrack.name,
          new THREE.QuaternionKeyframeTrack(
            handTrack.name,
            Array.from(handTrack.times),
            values
          )
        );
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const tracks = sourceTracks.map(
    track => replacements.get(track.name) || track
  );

  log(
    'Rigify OriginalRig basis: head + upper_arm_fk/forearm_fk/hand_fk ' +
    'codificados contra parents funcionales del rig original.'
  );

  return new THREE.AnimationClip(
    clip.name || 'Retargeted_FK',
    clip.duration,
    tracks
  );
}

const AUTO_RIG_PRO_LOGICAL_PARENT = {
  // Functional/original-rig hierarchy.
  // Do NOT copy the raw FBX carrier hierarchy here: Blender constraints make
  // these controls behave like the anatomical reference skeleton.
  'c_root.x': 'c_root_master.x',

  'c_spine_01.x': 'c_root.x',
  'c_spine_02.x': 'c_spine_01.x',

  'c_neck.x': 'c_spine_02.x',
  'c_head.x': 'c_neck.x',

  'c_shoulder.l': 'c_spine_02.x',
  'c_arm_fk.l': 'c_shoulder.l',
  'c_forearm_fk.l': 'c_arm_fk.l',
  'c_hand_fk.l': 'c_forearm_fk.l',

  'c_shoulder.r': 'c_spine_02.x',
  'c_arm_fk.r': 'c_shoulder.r',
  'c_forearm_fk.r': 'c_arm_fk.r',
  'c_hand_fk.r': 'c_forearm_fk.r',

  'c_thigh_fk.l': 'c_root.x',
  'c_leg_fk.l': 'c_thigh_fk.l',
  'c_foot_fk.l': 'c_leg_fk.l',
  'c_toes_fk.l': 'c_foot_fk.l',

  'c_thigh_fk.r': 'c_root.x',
  'c_leg_fk.r': 'c_thigh_fk.r',
  'c_foot_fk.r': 'c_leg_fk.r',
  'c_toes_fk.r': 'c_foot_fk.r'
}

for (const side of ['l', 'r']) {
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    AUTO_RIG_PRO_LOGICAL_PARENT[`c_${finger}1.${side}`] =
      `c_hand_fk.${side}`;
    AUTO_RIG_PRO_LOGICAL_PARENT[`c_${finger}2.${side}`] =
      `c_${finger}1.${side}`;
    AUTO_RIG_PRO_LOGICAL_PARENT[`c_${finger}3.${side}`] =
      `c_${finger}2.${side}`;
  }
}


const AUTO_RIG_PRO_CONTROL_TO_REFERENCE = {
  'c_root.x': 'root_ref.x',
  'c_spine_01.x': 'spine_01_ref.x',
  'c_spine_02.x': 'spine_02_ref.x',
  'c_neck.x': 'neck_ref.x',
  'c_head.x': 'head_ref.x',
  'c_shoulder.l': 'shoulder_ref.l',
  'c_arm_fk.l': 'arm_ref.l',
  'c_forearm_fk.l': 'forearm_ref.l',
  'c_hand_fk.l': 'hand_ref.l',
  'c_shoulder.r': 'shoulder_ref.r',
  'c_arm_fk.r': 'arm_ref.r',
  'c_forearm_fk.r': 'forearm_ref.r',
  'c_hand_fk.r': 'hand_ref.r',
  'c_thigh_fk.l': 'thigh_ref.l',
  'c_leg_fk.l': 'leg_ref.l',
  'c_foot_fk.l': 'foot_ref.l',
  'c_toes_fk.l': 'toes_ref.l',
  'c_thigh_fk.r': 'thigh_ref.r',
  'c_leg_fk.r': 'leg_ref.r',
  'c_foot_fk.r': 'foot_ref.r',
  'c_toes_fk.r': 'toes_ref.r'
};

for (const side of ['l', 'r']) {
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    for (let i = 1; i <= 3; i++) {
      AUTO_RIG_PRO_CONTROL_TO_REFERENCE[
        'c_' + finger + i + '.' + side
      ] = finger + i + '_ref.' + side;
    }
  }
}

function buildUeAutoRigProHelperBridgeAction(rawClip) {
  const src = state.source;
  const tgt = state.target;
  const sourceClip = src.activeClip;

  if (!rawClip || !sourceClip || !src.root || !tgt.root) {
    return rawClip?.clone?.() || rawClip;
  }

  // New UE -> ARP strategy:
  // SOURCE WORLD -> independent proxy helpers -> ARP reference-local basis
  // -> c_* matrix_basis.
  //
  // The helper layer is deliberately outside the Target FBX hierarchy. It
  // cannot inherit ARP helper/constraint transforms that are incomplete after
  // FBX export, so it gives us a clean diagnostic boundary.
  const entries = [];
  const reverseTarget = new Map();

  for (const [runtimeName, bone] of tgt.bones) {
    reverseTarget.set(bone, runtimeName);
  }

  const nearestRefParent = refName => {
    let parent = tgt.bones.get(refName)?.parent || null;

    while (parent) {
      const runtimeName = reverseTarget.get(parent);
      const original = runtimeName
        ? (originalObjectName(parent) || runtimeName)
        : '';

      if (
        runtimeName &&
        /_ref(?:\.|$)/i.test(original)
      ) {
        return runtimeName;
      }

      parent = parent.parent;
    }

    return '';
  };

  let helperIndex = 0;
  const ueSpineRemap = buildUeToArpSpineSourceRemap();

  for (const pair of validMap()) {
    if (!String(pair.channels || 'ROT').toUpperCase().includes('ROT')) {
      continue;
    }

    const control = tgt.bones.get(pair.target);
    const controlRest = tgt.rest.get(pair.target);

    if (!control || !controlRest) continue;

    const controlOriginal = originalObjectName(control) || pair.target;
    const sourceName = ueSpineRemap.get(controlOriginal) || pair.source;
    const sourceBone = src.bones.get(sourceName);
    const sourceRest = src.rest.get(sourceName);

    if (!sourceBone || !sourceRest) continue;
    const refOriginal =
      AUTO_RIG_PRO_CONTROL_TO_REFERENCE[controlOriginal] || '';

    if (!refOriginal) continue;

    const refName = findBoneByOriginalExact(tgt, [refOriginal]);
    const refRest = refName ? tgt.rest.get(refName) : null;

    if (!refName || !refRest) continue;

    const parentRefName = nearestRefParent(refName);

    const refToControl = controlRest.worldQuat.clone()
      .invert()
      .multiply(refRest.worldQuat)
      .normalize();

    entries.push({
      sourceName,
      sourceRest,
      controlName: pair.target,
      controlOriginal,
      controlRest,
      refName,
      refOriginal,
      refRest,
      parentRefName,
      refToControl,
      refToControlInv: refToControl.clone().invert(),
      helperName: 'UE_ARP_Helper_' + String(helperIndex++).padStart(3, '0'),
      parentHelperName: '',
      q: [],
      p: [],
      controlQ: [],
      previousControl: null
    });
  }

  if (entries.length < 12) {
    log(
      'UE -> ARP Helper Bridge: referencias insuficientes (' +
      entries.length +
      '); fallback al solver local anterior.'
    );
    return buildUeAutoRigProLocalBasisAction(rawClip);
  }

  const entryByRef = new Map(
    entries.map(entry => [entry.refName, entry])
  );
  const entryByControl = new Map(
    entries.map(entry => [entry.controlOriginal, entry])
  );

  const childPreference = {
    'c_root.x': ['c_spine_01.x'],
    'c_spine_01.x': ['c_spine_02.x'],
    'c_spine_02.x': ['c_neck.x', 'c_shoulder.l', 'c_shoulder.r'],
    'c_neck.x': ['c_head.x'],
    'c_shoulder.l': ['c_arm_fk.l'],
    'c_arm_fk.l': ['c_forearm_fk.l'],
    'c_forearm_fk.l': ['c_hand_fk.l'],
    'c_shoulder.r': ['c_arm_fk.r'],
    'c_arm_fk.r': ['c_forearm_fk.r'],
    'c_forearm_fk.r': ['c_hand_fk.r'],
    'c_thigh_fk.l': ['c_leg_fk.l'],
    'c_leg_fk.l': ['c_foot_fk.l'],
    'c_foot_fk.l': ['c_toes_fk.l'],
    'c_thigh_fk.r': ['c_leg_fk.r'],
    'c_leg_fk.r': ['c_foot_fk.r'],
    'c_foot_fk.r': ['c_toes_fk.r'],
    'c_hand_fk.l': ['c_middle1.l', 'c_index1.l'],
    'c_hand_fk.r': ['c_middle1.r', 'c_index1.r']
  };

  for (const side of ['l', 'r']) {
    for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      childPreference['c_' + finger + '1.' + side] =
        ['c_' + finger + '2.' + side];
      childPreference['c_' + finger + '2.' + side] =
        ['c_' + finger + '3.' + side];
    }
  }

  for (const entry of entries) {
    let cursor = entry.parentRefName;

    while (cursor) {
      const parentEntry = entryByRef.get(cursor);
      if (parentEntry) {
        entry.parentHelperName = parentEntry.helperName;
        entry.parentBridgeRefName = parentEntry.refName;
        break;
      }
      cursor = nearestRefParent(cursor);
    }

    const preferredChildren =
      childPreference[entry.controlOriginal] || [];

    let childEntry = preferredChildren
      .map(name => entryByControl.get(name))
      .find(Boolean) || null;

    if (!childEntry) {
      childEntry = entries.find(candidate =>
        AUTO_RIG_PRO_LOGICAL_PARENT[candidate.controlOriginal] ===
        entry.controlOriginal
      ) || null;
    }

    entry.childSourceName = childEntry?.sourceName || '';
  }

  const sourcePelvisName =
    findBoneByOriginalExact(src, ['pelvis']) ||
    findSemanticBone(src, 'pelvis');

  const sourceNeckName =
    findBoneByOriginalExact(src, ['neck_02', 'neck_01']) ||
    findSemanticBone(src, 'neck');

  const sourceShoulderLName =
    findBoneByOriginalExact(src, ['clavicle_l']) ||
    findSemanticBone(src, 'clavicle_l');

  const sourceShoulderRName =
    findBoneByOriginalExact(src, ['clavicle_r']) ||
    findSemanticBone(src, 'clavicle_r');

  const restPos = name => name ? src.rest.get(name)?.worldPos || null : null;

  const restPelvis = restPos(sourcePelvisName);
  const restNeck = restPos(sourceNeckName);
  const restShoulderL = restPos(sourceShoulderLName);
  const restShoulderR = restPos(sourceShoulderRName);

  const restBodyForward = new THREE.Vector3(0, 0, 1);

  if (restPelvis && restNeck && restShoulderL && restShoulderR) {
    const up = restNeck.clone().sub(restPelvis).normalize();
    const right = restShoulderR.clone().sub(restShoulderL).normalize();
    const forward = right.clone().cross(up);

    if (forward.lengthSq() > 1e-8) {
      restBodyForward.copy(forward.normalize());
    }
  }

  const makeAimFrame = (origin, child, forwardHint, out) => {
    const y = child.clone().sub(origin);
    if (y.lengthSq() < 1e-10) return null;
    y.normalize();

    const z = forwardHint.clone()
      .addScaledVector(y, -forwardHint.dot(y));

    if (z.lengthSq() < 1e-8) {
      z.set(0, 0, 1).addScaledVector(y, -y.z);
    }
    if (z.lengthSq() < 1e-8) {
      z.set(1, 0, 0).addScaledVector(y, -y.x);
    }
    if (z.lengthSq() < 1e-8) return null;

    z.normalize();

    const x = y.clone().cross(z).normalize();
    z.copy(x).cross(y).normalize();

    const matrix = new THREE.Matrix4().makeBasis(x, y, z);
    return out.setFromRotationMatrix(matrix).normalize();
  };

  for (const entry of entries) {
    const childRest = entry.childSourceName
      ? src.rest.get(entry.childSourceName)
      : null;

    if (childRest) {
      entry.helperRestFrame = makeAimFrame(
        entry.sourceRest.worldPos,
        childRest.worldPos,
        restBodyForward,
        new THREE.Quaternion()
      );
      entry.helperRestFrameInv =
        entry.helperRestFrame?.clone().invert() || null;
    } else {
      entry.helperRestFrame = null;
      entry.helperRestFrameInv = null;
    }
  }

  const fps = Math.max(
    1,
    Math.min(120, Number($('fps').value) || 30)
  );

  const frameCount = Math.max(
    2,
    Math.ceil(sourceClip.duration * fps) + 1
  );

  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(sourceClip.duration, i / fps)
  );

  restoreRest(src);

  const sourceMixer = new THREE.AnimationMixer(src.root);
  const sourceAction = sourceMixer.clipAction(sourceClip).play();

  const helperWorldByRef = new Map();
  const sourcePoseQ = new THREE.Quaternion();
  const worldDeltaQ = new THREE.Quaternion();
  const helperWorldQ = new THREE.Quaternion();
  const poseFrameQ = new THREE.Quaternion();
  const poseBodyForward = new THREE.Vector3();
  const posePelvis = new THREE.Vector3();
  const poseNeck = new THREE.Vector3();
  const poseShoulderL = new THREE.Vector3();
  const poseShoulderR = new THREE.Vector3();
  const childPoseP = new THREE.Vector3();
  const parentHelperQ = new THREE.Quaternion();
  const restRelativeQ = new THREE.Quaternion();
  const poseRelativeQ = new THREE.Quaternion();
  const refBasisQ = new THREE.Quaternion();
  const controlBasisQ = new THREE.Quaternion();
  const controlLocalQ = new THREE.Quaternion();
  const sourcePoseP = new THREE.Vector3();
  const helperWorldP = new THREE.Vector3();

  try {
    for (const time of times) {
      restoreRest(src);
      sourceMixer.setTime(Number(time));
      updateSlotWorld(src);

      helperWorldByRef.clear();

      // Stage A v2: helpers are reconstructed from JOINT POSITIONS,
      // not from Source bone-local axes. This makes the proxy independent of
      // Unreal/ARP bone roll and local-axis conventions.
      poseBodyForward.copy(restBodyForward);

      const pelvisBone = sourcePelvisName
        ? src.bones.get(sourcePelvisName)
        : null;
      const neckBone = sourceNeckName
        ? src.bones.get(sourceNeckName)
        : null;
      const shoulderLBone = sourceShoulderLName
        ? src.bones.get(sourceShoulderLName)
        : null;
      const shoulderRBone = sourceShoulderRName
        ? src.bones.get(sourceShoulderRName)
        : null;

      if (pelvisBone && neckBone && shoulderLBone && shoulderRBone) {
        pelvisBone.getWorldPosition(posePelvis);
        neckBone.getWorldPosition(poseNeck);
        shoulderLBone.getWorldPosition(poseShoulderL);
        shoulderRBone.getWorldPosition(poseShoulderR);

        const up = poseNeck.clone().sub(posePelvis).normalize();
        const right = poseShoulderR.clone().sub(poseShoulderL).normalize();
        const forward = right.clone().cross(up);

        if (forward.lengthSq() > 1e-8) {
          poseBodyForward.copy(forward.normalize());
        }
      }

      for (const entry of entries) {
        const sourceBone = src.bones.get(entry.sourceName);
        if (!sourceBone) continue;

        sourceBone.getWorldPosition(sourcePoseP);

        let usedPositionFrame = false;

        if (entry.childSourceName && entry.helperRestFrameInv) {
          const childBone = src.bones.get(entry.childSourceName);

          if (childBone) {
            childBone.getWorldPosition(childPoseP);

            const frame = makeAimFrame(
              sourcePoseP,
              childPoseP,
              poseBodyForward,
              poseFrameQ
            );

            if (frame) {
              worldDeltaQ.copy(frame)
                .multiply(entry.helperRestFrameInv)
                .normalize();

              helperWorldQ.copy(worldDeltaQ)
                .multiply(entry.refRest.worldQuat)
                .normalize();

              usedPositionFrame = true;
            }
          }
        }

        // End bones / degenerate chains fall back to Source WORLD delta.
        if (!usedPositionFrame) {
          sourceBone.getWorldQuaternion(sourcePoseQ).normalize();

          worldDeltaQ.copy(sourcePoseQ)
            .multiply(entry.sourceRest.worldQuat.clone().invert())
            .normalize();

          helperWorldQ.copy(worldDeltaQ)
            .multiply(entry.refRest.worldQuat)
            .normalize();
        }

        helperWorldP.copy(entry.refRest.worldPos)
          .add(
            sourcePoseP.clone().sub(entry.sourceRest.worldPos)
          );

        helperWorldByRef.set(entry.refName, {
          q: helperWorldQ.clone(),
          p: helperWorldP.clone()
        });

        entry.q.push(
          helperWorldQ.x,
          helperWorldQ.y,
          helperWorldQ.z,
          helperWorldQ.w
        );

        entry.p.push(
          helperWorldP.x,
          helperWorldP.y,
          helperWorldP.z
        );
      }

      // Stage B: ARP controls read ONLY the helper/reference hierarchy.
      for (const entry of entries) {
        const helperPose = helperWorldByRef.get(entry.refName);
        if (!helperPose) continue;

        const parentRest = entry.parentBridgeRefName
          ? tgt.rest.get(entry.parentBridgeRefName)
          : null;

        const parentHelperPose = entry.parentBridgeRefName
          ? helperWorldByRef.get(entry.parentBridgeRefName)
          : null;

        if (parentRest && parentHelperPose) {
          restRelativeQ.copy(parentRest.worldQuat)
            .invert()
            .multiply(entry.refRest.worldQuat)
            .normalize();

          parentHelperQ.copy(parentHelperPose.q).normalize();

          poseRelativeQ.copy(parentHelperQ)
            .invert()
            .multiply(helperPose.q)
            .normalize();

          refBasisQ.copy(restRelativeQ)
            .invert()
            .multiply(poseRelativeQ)
            .normalize();
        } else {
          refBasisQ.copy(entry.refRest.worldQuat)
            .invert()
            .multiply(helperPose.q)
            .normalize();
        }

        // Same physical local rotation, expressed in the animator control's
        // actual channel axes exactly once.
        controlBasisQ.copy(entry.refToControl)
          .multiply(refBasisQ)
          .multiply(entry.refToControlInv)
          .normalize();

        controlLocalQ.copy(entry.controlRest.quaternion)
          .multiply(controlBasisQ)
          .normalize();

        if (
          entry.previousControl &&
          entry.previousControl.dot(controlLocalQ) < 0
        ) {
          controlLocalQ.x *= -1;
          controlLocalQ.y *= -1;
          controlLocalQ.z *= -1;
          controlLocalQ.w *= -1;
        }

        entry.controlQ.push(
          controlLocalQ.x,
          controlLocalQ.y,
          controlLocalQ.z,
          controlLocalQ.w
        );

        entry.previousControl = controlLocalQ.clone();
      }
    }
  } finally {
    sourceAction.stop();
    sourceMixer.stopAllAction();
    restoreRest(src);
  }

  const controlReplacement = new Map();
  const helperTracks = [];

  for (const entry of entries) {
    if (entry.controlQ.length === times.length * 4) {
      const trackName = entry.controlName + '.quaternion';

      controlReplacement.set(
        trackName,
        new THREE.QuaternionKeyframeTrack(
          trackName,
          times,
          entry.controlQ
        )
      );
    }

    if (entry.q.length === times.length * 4) {
      helperTracks.push(
        new THREE.QuaternionKeyframeTrack(
          entry.helperName + '.quaternion',
          times,
          entry.q
        )
      );
    }

    if (entry.p.length === times.length * 3) {
      helperTracks.push(
        new THREE.VectorKeyframeTrack(
          entry.helperName + '.position',
          times,
          entry.p
        )
      );
    }
  }

  const controlTracks = rawClip.tracks.map(track =>
    controlReplacement.get(track.name) || track.clone()
  );

  const existing = new Set(
    controlTracks.map(track => track.name)
  );

  for (const [trackName, track] of controlReplacement) {
    if (!existing.has(trackName)) controlTracks.push(track);
  }

  const helperClip = new THREE.AnimationClip(
    'UE_ARP_HelperBridge_Debug',
    sourceClip.duration,
    helperTracks
  );

  installUeArpHelperBridge(
    helperClip,
    entries.map(entry => ({
      helperName: entry.helperName,
      parentHelperName: entry.parentHelperName,
      controlOriginal: entry.controlOriginal,
      sourceName: entry.sourceName,
      refOriginal: entry.refOriginal
    }))
  );

  log(
    'UE -> ARP Helper Bridge v2 (joint-position tracking): ' +
    controlReplacement.size +
    '/' +
    entries.length +
    ' controles. JOINT POSITIONS -> aim helpers -> *_ref local -> c_* basis.'
  );

  return new THREE.AnimationClip(
    'Retargeted_FK',
    rawClip.duration,
    controlTracks
  );
}

function buildUeAutoRigProLocalBasisAction(rawClip) {
  const src = state.source;
  const tgt = state.target;
  const sourceClip = src.activeClip;

  if (!rawClip || !sourceClip || !src.root || !tgt.root) {
    return rawClip?.clone?.() || rawClip;
  }

  // UE -> ARP is deliberately solved in SOURCE LOCAL / anatomical space.
  //
  // Previous attempts reconstructed each ARP control from a WORLD delta and
  // then tried to recover Blender's matrix_basis through either:
  //   1) the raw FBX control hierarchy,
  //   2) a guessed functional parent hierarchy, or
  //   3) the *_ref WORLD pose.
  //
  // That works for CloudRig because its logical carry hierarchy is known, but
  // ARP interleaves c_* controls, deform bones and helper bones. A WORLD solve
  // can therefore attribute a parent's rotation to the child a second time.
  //
  // Here each c_* control receives only the LOCAL motion of its corresponding
  // UE anatomical segment:
  //
  //   sourceBasis =
  //     inverse(sourceRestRelativeToMappedParent) *
  //     sourcePoseRelativeToMappedParent
  //
  // Then that basis is expressed in the actual ARP control bone axes and
  // written as:
  //
  //   FBX local = controlRestLocal * matrix_basis
  //
  // This also intentionally collapses skipped UE chains:
  // pelvis -> spine_03 becomes c_spine_01, spine_03 -> spine_05 becomes
  // c_spine_02, spine_05 -> neck_02 becomes c_neck, etc.
  const sourceTracks = rawClip.tracks.map(track => track.clone());

  const pairByControlOriginal = new Map();
  const entries = [];
  const ueSpineRemap = buildUeToArpSpineSourceRemap();

  if (ueSpineRemap.meta) {
    log(
      'UE -> ARP spine landmarks: ' +
      ueSpineRemap.meta.lower + ' -> c_spine_01.x, ' +
      ueSpineRemap.meta.upper + ' -> c_spine_02.x ' +
      '(REST height match).'
    );
  }

  for (const pair of validMap()) {
    if (!String(pair.channels || 'ROT').toUpperCase().includes('ROT')) {
      continue;
    }

    const control = tgt.bones.get(pair.target);
    const controlRest = tgt.rest.get(pair.target);

    if (!control || !controlRest) continue;

    const controlOriginal = originalObjectName(control) || pair.target;
    const sourceName = ueSpineRemap.get(controlOriginal) || pair.source;
    const sourceBone = src.bones.get(sourceName);
    const sourceRest = src.rest.get(sourceName);

    if (!sourceBone || !sourceRest) continue;

    pairByControlOriginal.set(controlOriginal, {
      pair,
      sourceName,
      sourceBone,
      sourceRest,
      controlName: pair.target,
      control,
      controlRest,
      controlOriginal
    });
  }

  const sourceRootName =
    findBoneByOriginalExact(src, ['root']) ||
    findSemanticBone(src, 'root') ||
    '';

  const reverseSource = new Map();
  for (const [runtimeName, bone] of src.bones) {
    reverseSource.set(bone, runtimeName);
  }

  const nearestSourceAncestor = sourceName => {
    let parent = src.bones.get(sourceName)?.parent || null;

    while (parent) {
      const runtimeName = reverseSource.get(parent);
      if (runtimeName && src.rest.has(runtimeName)) return runtimeName;
      parent = parent.parent;
    }

    return '';
  };

  for (const item of pairByControlOriginal.values()) {
    const parentControlOriginal =
      AUTO_RIG_PRO_LOGICAL_PARENT[item.controlOriginal] || '';

    let sourceParentName =
      pairByControlOriginal.get(parentControlOriginal)?.sourceName || '';

    // c_root.x represents UE pelvis rotation while UE root carries the
    // locomotion frame. The preset maps root only for translation, so it is
    // not present in pairByControlOriginal and must be supplied explicitly.
    if (item.controlOriginal === 'c_root.x' && sourceRootName) {
      sourceParentName = sourceRootName;
    }

    // Fallback only for a control outside the known anatomical table.
    if (!sourceParentName) {
      sourceParentName = nearestSourceAncestor(item.sourceName);
    }

    const sourceParentRest = sourceParentName
      ? src.rest.get(sourceParentName)
      : null;

    const sourceRestRelative = sourceParentRest
      ? sourceParentRest.worldQuat.clone()
          .invert()
          .multiply(item.sourceRest.worldQuat)
          .normalize()
      : item.sourceRest.worldQuat.clone().normalize();

    // ARP's *_ref branch is the anatomical coordinate frame. Use it ONLY to
    // convert the already-computed SOURCE-LOCAL delta into ARP anatomical
    // axes. Do not reconstruct a *_ref WORLD pose here: that was the previous
    // double-parent / double-axis failure visible as the permanent forward
    // torso bend.
    const refOriginal =
      AUTO_RIG_PRO_CONTROL_TO_REFERENCE[item.controlOriginal] || '';

    const refName = refOriginal
      ? findBoneByOriginalExact(tgt, [refOriginal])
      : '';

    const refRest = refName ? tgt.rest.get(refName) : null;

    // sourceBasis lives in the UE child bone's local axes. Convert that delta
    // into the corresponding ARP anatomical (*_ref) bone axes:
    //
    //   D_ref = C * D_source * inverse(C)
    //   C     = inverse(Q_ref_rest_world) * Q_source_rest_world
    //
    // The c_* matrix_basis then consumes this anatomical delta directly.
    // We intentionally do NOT apply another ref->control conjugation.
    const sourceToReference = refRest
      ? refRest.worldQuat.clone()
          .invert()
          .multiply(item.sourceRest.worldQuat)
          .normalize()
      : item.controlRest.worldQuat.clone()
          .invert()
          .multiply(item.sourceRest.worldQuat)
          .normalize();

    entries.push({
      ...item,
      sourceParentName,
      sourceParentRest,
      sourceRestRelative,
      sourceRestRelativeInv: sourceRestRelative.clone().invert(),
      refName,
      refOriginal,
      refRest,
      sourceToReference,
      sourceToReferenceInv: sourceToReference.clone().invert(),
      values: [],
      previous: null
    });
  }

  if (entries.length < 12) {
    log(
      'UE -> ARP local-basis solver: controles insuficientes (' +
      entries.length +
      '), usando fallback OriginalRig.'
    );
    return buildAutoRigProOriginalRigTransferClip(rawClip);
  }

  const fps = Math.max(
    1,
    Math.min(120, Number($('fps').value) || 30)
  );

  const frameCount = Math.max(
    2,
    Math.ceil(sourceClip.duration * fps) + 1
  );

  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(sourceClip.duration, i / fps)
  );

  restoreRest(src);
  const sourceMixer = new THREE.AnimationMixer(src.root);
  const sourceAction = sourceMixer.clipAction(sourceClip).play();

  const childWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const sourcePoseRelative = new THREE.Quaternion();
  const sourceBasis = new THREE.Quaternion();
  const controlBasis = new THREE.Quaternion();
  const exportLocal = new THREE.Quaternion();

  try {
    for (const time of times) {
      restoreRest(src);
      sourceMixer.setTime(Number(time));
      updateSlotWorld(src);

      for (const entry of entries) {
        const sourceBone = src.bones.get(entry.sourceName);
        if (!sourceBone) continue;

        sourceBone.getWorldQuaternion(childWorld).normalize();

        if (entry.sourceParentName) {
          const sourceParent = src.bones.get(entry.sourceParentName);
          if (!sourceParent) continue;

          sourceParent.getWorldQuaternion(parentWorld).normalize();

          sourcePoseRelative.copy(parentWorld)
            .invert()
            .multiply(childWorld)
            .normalize();
        } else {
          sourcePoseRelative.copy(childWorld);
        }

        sourceBasis.copy(entry.sourceRestRelativeInv)
          .multiply(sourcePoseRelative)
          .normalize();

        controlBasis.copy(entry.sourceToReference)
          .multiply(sourceBasis)
          .multiply(entry.sourceToReferenceInv)
          .normalize();

        exportLocal.copy(entry.controlRest.quaternion)
          .multiply(controlBasis)
          .normalize();

        if (entry.previous && entry.previous.dot(exportLocal) < 0) {
          exportLocal.x *= -1;
          exportLocal.y *= -1;
          exportLocal.z *= -1;
          exportLocal.w *= -1;
        }

        entry.values.push(
          exportLocal.x,
          exportLocal.y,
          exportLocal.z,
          exportLocal.w
        );

        entry.previous = exportLocal.clone();
      }
    }
  } finally {
    sourceAction.stop();
    sourceMixer.stopAllAction();
    restoreRest(src);
  }

  const replacements = new Map();

  for (const entry of entries) {
    if (entry.values.length !== times.length * 4) continue;

    const trackName = entry.controlName + '.quaternion';

    replacements.set(
      trackName,
      new THREE.QuaternionKeyframeTrack(
        trackName,
        times,
        entry.values
      )
    );
  }

  const tracks = sourceTracks.map(
    track => replacements.get(track.name) || track.clone()
  );

  const existing = new Set(tracks.map(track => track.name));
  for (const [trackName, track] of replacements) {
    if (!existing.has(trackName)) tracks.push(track);
  }

  log(
    'UE -> Auto-Rig Pro local-basis solver v8: ' +
    replacements.size +
    '/' +
    entries.length +
    ' controles. UE local basis + spine landmarks por REST -> *_ref axes -> c_* matrix_basis.'
  );

  return new THREE.AnimationClip(
    'Retargeted_FK',
    rawClip.duration,
    tracks
  );
}

function buildAutoRigProOriginalRigTransferClip(clip) {
  const tgt = state.target;
  if (!clip || !tgt.root) return clip;

  const runtimePairs = new Map();

  for (const [childOriginal, parentOriginal] of Object.entries(
    AUTO_RIG_PRO_LOGICAL_PARENT
  )) {
    const childName = findBoneByOriginalExact(tgt, [childOriginal]);
    const parentName = findBoneByOriginalExact(tgt, [parentOriginal]);

    if (!childName || !parentName) continue;

    runtimePairs.set(childName, {
      childOriginal,
      parentOriginal,
      parentName
    });
  }

  if (!runtimePairs.size) return clip.clone();

  const sourceTracks = clip.tracks.map(track => track.clone());

  const entries = sourceTracks
    .map(track => {
      const parsed = parseTrackTarget(track.name);

      if (
        parsed?.property !== 'quaternion' ||
        !runtimePairs.has(parsed.nodeName)
      ) {
        return null;
      }

      const childName = parsed.nodeName;
      const pair = runtimePairs.get(childName);
      const child = tgt.bones.get(childName);
      const parent = tgt.bones.get(pair.parentName);
      const childRest = tgt.rest.get(childName);
      const parentRest = tgt.rest.get(pair.parentName);

      if (!child || !parent || !childRest || !parentRest) return null;

      const restRelativeInv = parentRest.worldQuat.clone()
        .invert()
        .multiply(childRest.worldQuat)
        .normalize()
        .invert();

      return {
        track,
        child,
        parent,
        childRest,
        restRelativeInv,
        values: [],
        previous: null
      };
    })
    .filter(Boolean);

  if (!entries.length) return clip.clone();

  // bakeRetarget creates uniformly sampled tracks. Use a sorted union anyway
  // so this stays correct if a future clip contains different key times.
  const timeSet = new Set();
  for (const entry of entries) {
    for (const time of entry.track.times) {
      timeSet.add(Number(time));
    }
  }
  const times = [...timeSet].sort((a, b) => a - b);

  restoreRest(tgt);
  tgt.mixer?.stopAllAction();

  const mixer = new THREE.AnimationMixer(tgt.root);
  const action = mixer.clipAction(clip).play();

  const childWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const poseRelative = new THREE.Quaternion();
  const basisDelta = new THREE.Quaternion();
  const exportLocal = new THREE.Quaternion();

  try {
    // Critical performance fix: evaluate the 467-bone ARP rig ONCE per frame,
    // then solve every control from that same evaluated pose. The previous
    // implementation evaluated the entire timeline once PER CONTROL.
    for (const time of times) {
      mixer.setTime(time);
      updateSlotWorld(tgt);

      for (const entry of entries) {
        entry.child.getWorldQuaternion(childWorld).normalize();
        entry.parent.getWorldQuaternion(parentWorld).normalize();

        poseRelative.copy(parentWorld)
          .invert()
          .multiply(childWorld)
          .normalize();

        basisDelta.copy(entry.restRelativeInv)
          .multiply(poseRelative)
          .normalize();

        exportLocal.copy(entry.childRest.quaternion)
          .multiply(basisDelta)
          .normalize();

        if (entry.previous && entry.previous.dot(exportLocal) < 0) {
          exportLocal.x *= -1;
          exportLocal.y *= -1;
          exportLocal.z *= -1;
          exportLocal.w *= -1;
        }

        entry.values.push(
          exportLocal.x,
          exportLocal.y,
          exportLocal.z,
          exportLocal.w
        );

        entry.previous = exportLocal.clone();
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    restoreRest(tgt);
  }

  const replacements = new Map();

  for (const entry of entries) {
    replacements.set(
      entry.track.name,
      new THREE.QuaternionKeyframeTrack(
        entry.track.name,
        times,
        entry.values
      )
    );
  }

  const tracks = sourceTracks.map(
    track => replacements.get(track.name) || track
  );

  log(
    `Auto-Rig Pro OriginalRig optimizado: ${replacements.size} controles · ` +
    `${times.length} frames evaluados una sola vez (no por control).`
  );

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

  const controlSource = withTargetNeutralBaseline(
    state.targetPreviewClip || state.exportClip
  );
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

function buildUeAutoRigProCopyBackAction() {
  if (!usesUeToAutoRigProPipeline()) return null;

  // IMPORTANT: for UE -> ARP the exported FBX is only an Action carrier.
  // The user imports it into Blender and assigns that Action to the ORIGINAL
  // Auto-Rig Pro rig. Therefore do NOT merge the Target neutral/base Action,
  // DEF preview, helpers or any other FBX channels into this Action.
  //
  // state.fkClip is already encoded as:
  //   raw FBX control rest-local * ORIGINAL ARP matrix_basis
  // so the exact FBX exporter can round-trip it through Blender and the
  // resulting Action can be copied directly to the original c_* controls.
  const source = state.fkClip || state.exportClip;
  if (!source) return null;

  const allowedRuntimeNames = new Set(
    state.boneMap
      .filter(isPairValid)
      .map(pair => pair.target)
  );

  const tracks = source.tracks
    .filter(track => {
      const parsed = parseTrackTarget(track.name);
      if (!parsed || !allowedRuntimeNames.has(parsed.nodeName)) return false;

      // Copy-back Action: only animator-control transforms.
      // No helper/DEF/neutral tracks.
      return (
        parsed.property === 'quaternion' ||
        parsed.property === 'position'
      );
    })
    .map(track => track.clone());

  if (!tracks.length) return null;

  const runtimeClip = new THREE.AnimationClip(
    'Retargeted_OriginalRig_FK',
    source.duration,
    tracks
  );

  return createOriginalNameExportClip(
    runtimeClip,
    state.target
  );
}

function buildOriginalRigActionFbxPackage(rotationMode = 'xyz') {
  if (!state.target.root || !state.exportClip || !state.target.originalBuffer) {
    throw new Error('Falta Target, retarget o FBX original.');
  }

  let originalRigAction;

  if (usesUeToAutoRigProPipeline()) {
    originalRigAction = buildUeAutoRigProCopyBackAction();
  } else {
    const exportWithNeutralBase = withTargetNeutralBaseline(state.exportClip);
    const controlClip = buildOriginalRigControlOnlyClip(exportWithNeutralBase);

    if (controlClip?.tracks?.length) {
      originalRigAction = createOriginalNameExportClip(
        controlClip,
        state.target
      );
    }
  }

  if (!originalRigAction || !originalRigAction.tracks.length) {
    throw new Error('No pude construir la Action de controles del rig original.');
  }

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

    const exportRuntimeClip = withTargetNeutralBaseline(state.exportClip);
    const exportClip = createOriginalNameExportClip(exportRuntimeClip, state.target);
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
        withTargetNeutralBaseline(state.exportClip)
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
      let exactActions;
      let currentActionName;

      if (usesUeToAutoRigProPipeline()) {
        const copyBack = buildUeAutoRigProCopyBackAction();

        if (!copyBack?.tracks?.length) {
          throw new Error(
            'UE → Auto-Rig Pro: no pude construir la Action copy-back para el rig original.'
          );
        }

        // UE -> ARP special export:
        // ONE Action only. No neutral baseline. No DEF preview. No helper curves.
        // This FBX is deliberately an Action carrier for Blender.
        exactActions = [{
          clip: copyBack,
          actionName: 'Retargeted_OriginalRig_FK',
          includeControlPositions: true
        }];
        currentActionName = 'Retargeted_OriginalRig_FK';
      } else {
        exactActions = [
          {
            clip: exportClip,
            actionName: exportClip.name || 'Retargeted_FK',
            includeControlPositions: true
          }
        ];

        currentActionName = exportClip.name || 'Retargeted_FK';

        if (
          (
            usesCloudRigPipeline() ||
            usesMixamoControlRigPipeline() ||
            usesAutoRigProPipeline()
          ) &&
          $('includeDefPreview')?.checked
        ) {
          const defPreview = usesEmbeddedDeformControlRigPipeline()
            ? state.deformPreviewClip
            : bakeDeformPreviewClip();

          if (defPreview) {
            const originalDefPreview = createOriginalNameExportClip(
              defPreview,
              state.target
            );

            exactActions.push({
              clip: originalDefPreview,
              actionName: 'Retargeted_DEF_Preview',
              includeDeformPositions: true
            });

            currentActionName = 'Retargeted_DEF_Preview';
          }
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

      if (usesUeToAutoRigProPipeline()) {
        log(
          `UE → Auto-Rig Pro EXPORT copy-back: [${clipNames}] · ` +
          `${report.curveNodes} CurveNodes · ${report.curves} Curves. ` +
          'FBX contiene UNA sola Action de controles c_* para copiar al rig ARP original.'
        );
      } else {
        log(
          `FBX EXACTO: Target original + Actions [${clipNames}]. ` +
          `Stacks=${report.stacks}, CurveNodes=${report.curveNodes}, Curves=${report.curves}. ` +
          'Lcl Rotation preserva RotationOrder y revierte Pre/PostRotation del FBX original.'
        );
      }
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
          ? (
              usesUeToAutoRigProPipeline()
                ? `${base}_UE_to_ARP_OriginalRig_Action.fbx`
                : `${base}_retarget_exact.fbx`
            )
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

    if (
      !usesUeToAutoRigProPipeline() &&
      (exportMode === 'clean' || exportMode === 'exact') &&
      $('downloadOriginalRigAction')?.checked
    ) {
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


function captureTransferStageLayout(stage) {
  const sourceCard = stage.querySelector('.source-card');
  const targetCard = stage.querySelector('.target-card');
  const timeline = stage.parentElement?.querySelector('.timeline-card');

  const capture = element => element && !element.hidden
    ? { element, rect: element.getBoundingClientRect() }
    : null;

  return [
    capture(sourceCard),
    capture(targetCard),
    capture(timeline)
  ].filter(Boolean);
}

function animateTransferStageLayout(beforeLayout) {
  const duration = 560;
  const easing = 'cubic-bezier(.16,.84,.22,1)';

  for (const item of beforeLayout) {
    const element = item.element;
    const before = item.rect;
    const after = element.getBoundingClientRect();

    if (!after.width || !after.height) continue;

    const dx = before.left - after.left;
    const dy = before.top - after.top;

    const isViewportCard =
      element.classList.contains('source-card') ||
      element.classList.contains('target-card');

    const sx = isViewportCard ? before.width / after.width : 1;
    const sy = isViewportCard ? before.height / after.height : 1;

    const effectivelySame =
      Math.abs(dx) < 0.5 &&
      Math.abs(dy) < 0.5 &&
      Math.abs(sx - 1) < 0.002 &&
      Math.abs(sy - 1) < 0.002;

    if (effectivelySame) continue;

    for (const animation of element.getAnimations()) {
      if (animation.id === 'transfer-layout-flip') animation.cancel();
    }

    const animation = element.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`
        },
        {
          transformOrigin: '0 0',
          transform: 'translate(0,0) scale(1,1)'
        }
      ],
      {
        duration,
        easing,
        fill: 'both'
      }
    );

    animation.id = 'transfer-layout-flip';
    animation.addEventListener('finish', () => animation.cancel(), { once: true });
  }
}

function updateTransferBridgeVisibility(animate = false) {
  const bridge = $('retargetBridge') || document.querySelector('.retarget-bridge');
  const stage = bridge?.closest('.retarget-stage') || document.querySelector('.retarget-stage');
  if (!bridge || !stage) return;

  const hasBoth = !!state.source.root && !!state.target.root;
  const hasPreset = !!state.activePreset && state.activePresetId !== 'none';
  const rigsMatchPreset = hasBoth && hasPreset && presetMatchesLoadedRigs();

  const shouldShow =
    state.workspaceView === 'workspace' &&
    hasBoth &&
    hasPreset &&
    rigsMatchPreset;

  const initialized = stage.dataset.transferLayoutInitialized === 'true';
  const previousShown = initialized
    ? stage.dataset.transferBridgeShown === 'true'
    : (!stage.classList.contains('no-transfer-bridge') && !bridge.hidden);

  const layoutChanged = previousShown !== shouldShow;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const canAnimateLayout =
    initialized &&
    layoutChanged &&
    state.workspaceView === 'workspace' &&
    window.innerWidth > 760 &&
    !reducedMotion;

  const beforeLayout = canAnimateLayout
    ? captureTransferStageLayout(stage)
    : null;

  // For show, make the bridge participate in layout before removing the
  // no-bridge grid. For hide, remove it from layout in the same frame.
  if (shouldShow) bridge.hidden = false;
  stage.classList.toggle('no-transfer-bridge', !shouldShow);
  if (!shouldShow) bridge.hidden = true;

  stage.dataset.transferLayoutInitialized = 'true';
  stage.dataset.transferBridgeShown = shouldShow ? 'true' : 'false';

  // The DOM is now at its final geometry. FLIP animates Source/Target from the
  // previous geometry to this one, so the viewports smoothly resize instead
  // of snapping when Transfer/FK→IK appears or disappears.
  if (beforeLayout?.length) {
    resizeViewports();
    animateTransferStageLayout(beforeLayout);
  }

  if (!shouldShow) {
    bridge.classList.remove('transfer-reveal');
  } else if (animate || layoutChanged) {
    bridge.classList.remove('transfer-reveal');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bridge.classList.add('transfer-reveal'));
    });
    window.setTimeout(() => bridge.classList.remove('transfer-reveal'), 900);
  }

  requestAnimationFrame(() => {
    resizeViewports();
    requestAnimationFrame(resizeViewports);
  });
}

function revealConditionalFeature(element, animate = false, delayMs = 0) {
  if (!element) return;

  element.classList.remove('feature-reveal', 'feature-reveal-prep');

  if (!animate) {
    element.hidden = false;
    return;
  }

  element.classList.add('feature-reveal-prep');
  element.hidden = false;
  element.style.setProperty('--feature-delay', `${delayMs}ms`);

  // First paint it in the prepared invisible state, then start the reveal.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.classList.remove('feature-reveal-prep');
      element.classList.add('feature-reveal');
    });
  });

  window.setTimeout(() => {
    element.classList.remove('feature-reveal', 'feature-reveal-prep');
    element.style.removeProperty('--feature-delay');
  }, 1250 + delayMs);
}

function updateConditionalFeatureVisibility() {
  const sourceReady = !!state.source.root;
  const restPoseNav = $('navRestPose');

  if (sourceReady) {
    const shouldAnimate = !!restPoseNav?.hidden;
    revealConditionalFeature(restPoseNav, shouldAnimate, 0);
  } else if (restPoseNav) {
    restPoseNav.classList.remove('feature-reveal', 'feature-reveal-prep');
    restPoseNav.style.removeProperty('--feature-delay');
    restPoseNav.hidden = true;

    if (state.workspaceView === 'restpose') {
      setWorkspaceView('workspace');
    }
  }

  const ready = sourceReady && !!state.target.root;
  const becameReady = ready && !state.dualFbxReady;
  state.dualFbxReady = ready;

  const gated = [
    $('navMappings'),
    $('navAnimations'),
    $('stepMap'),
    $('stepIk'),
    $('mappingSettingsSection')
  ];

  if (ready) {
    gated.forEach((element, index) => {
      revealConditionalFeature(element, becameReady, index * 65);
    });
  } else {
    for (const element of gated) {
      if (!element) continue;
      element.classList.remove('feature-reveal', 'feature-reveal-prep');
      element.style.removeProperty('--feature-delay');
      element.hidden = true;
    }

    if (state.workspaceView === 'mappings' || state.workspaceView === 'animations') {
      setWorkspaceView('workspace');
    }
  }
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

function setAutoPresetButtonsBusy(busy) {
  for (const button of [$('autoMatch'), $('sidebarAutoPreset')]) {
    if (!button) continue;
    button.disabled = !!busy;
    button.classList.toggle('is-busy', !!busy);
    button.textContent = busy ? '✦ Detectando…' : '✦ Auto-preset';
  }
}

function runAutoPreset() {
  if (!state.source.root || !state.target.root) {
    updateTransferBridgeVisibility(false);
    setStatus('Auto-preset · carga Source y Target', 'bad');
    log('Auto-preset: primero carga Source y Target.');
    return;
  }

  setAutoPresetButtonsBusy(true);
  updateTransferBridgeVisibility(false);
  setStatus('Auto-preset · detectando…');

  void detectAutoPreset()
    .then(detected => {
      if (!detected) {
        $('preset').value = 'none';
        state.activePresetId = 'none';
        state.activePreset = null;
        state.boneMap = [];
        refreshMapUi();
        updateButtons();
        updateStats();
        updateTransferBridgeVisibility(false);
        setStatus('Auto-preset · sin coincidencia', 'bad');
        log('Auto-preset: no encontré un preset compatible con Source + Target.');
        return;
      }

      // Select the actual preset in the existing selector so both the sidebar
      // and Mapping workspace always reflect the same detected preset.
      $('preset').value = detected.id;
      state.activePresetId = detected.id;
      state.activePreset = null;

      log(
        `Auto-preset detectó ${detected.definition.label} · ` +
        `${detected.resolvedBoth}/${detected.data?.pairs?.length || 0} pares.`
      );

      return loadPreset().then(() => {
        const compatible = presetMatchesLoadedRigs();
        updateTransferBridgeVisibility(compatible);
        setStatus(
          compatible
            ? `Auto-preset · ${detected.definition.label}`
            : 'Auto-preset · preset incompatible',
          compatible ? 'good' : 'bad'
        );
      });
    })
    .catch(error => {
      updateTransferBridgeVisibility(false);
      setStatus('Auto-preset · error', 'bad');
      log(`ERROR Auto-preset: ${error.message}`);
    })
    .finally(() => {
      setAutoPresetButtonsBusy(false);
    });
}

function updateSidebarAutoPresetVisibility(view = state.workspaceView) {
  const wrap = $('sidebarAutoPresetWrap');
  if (!wrap) return;

  const hide = view === 'mappings';

  // Keep the shortcut physically present in Workspace. Only Mapping collapses
  // it because Mapping already exposes the same Auto-preset action in its
  // toolbar.
  wrap.hidden = false;
  wrap.classList.toggle('workspace-hidden', hide);
  wrap.setAttribute('aria-hidden', hide ? 'true' : 'false');

  const button = $('sidebarAutoPreset');
  if (button) {
    button.hidden = false;
    button.tabIndex = hide ? -1 : 0;
  }
}

function setWorkspaceView(view) {
  const allowed = new Set(['workspace', 'mappings', 'restpose', 'animations', 'actionpacker']);
  let next = allowed.has(view) ? view : 'workspace';

  const needsBothFbx = next === 'mappings' || next === 'animations';
  const needsSource = next === 'restpose';

  if (needsBothFbx && !(state.source.root && state.target.root)) {
    next = 'workspace';
  } else if (needsSource && !state.source.root) {
    next = 'workspace';
  }

  const previous = state.workspaceView;

  if (previous === 'restpose' && next !== 'restpose') leaveRestPoseWorkspace();
  state.workspaceView = next;

  const workspace = $('mainWorkspace');
  if (workspace) workspace.dataset.view = next;

  const shell = document.querySelector('.workspace-shell');
  const workflowSidebar = document.querySelector('.workflow-sidebar');
  const settingsPanel = document.querySelector('.settings-panel');
  const bridge = document.querySelector('.retarget-bridge');
  const mappingCard = $('mappingCard');
  const restToolbar = $('restPoseToolbar');
  const actionPackerWorkspace = $('actionPackerWorkspace');
  const isAnimation = next === 'animations';
  const isRestPose = next === 'restpose';
  const isActionPacker = next === 'actionpacker';
  const isFocusDesk = isAnimation || isRestPose || isActionPacker;

  shell?.classList.toggle('animations-focus', isAnimation);
  shell?.classList.toggle('restpose-focus', isRestPose);
  shell?.classList.toggle('mappings-focus', next === 'mappings');
  shell?.classList.toggle('actionpacker-focus', isActionPacker);
  updateSidebarAutoPresetVisibility(next);

  if (workspace) workspace.hidden = isActionPacker;
  if (actionPackerWorkspace) actionPackerWorkspace.hidden = !isActionPacker;
  if (mappingCard) mappingCard.hidden = next !== 'mappings';
  if (restToolbar) restToolbar.hidden = !isRestPose;
  if (workflowSidebar) workflowSidebar.hidden = isFocusDesk;
  if (settingsPanel) settingsPanel.hidden = isFocusDesk;
  if (bridge && (isAnimation || isRestPose || isActionPacker)) bridge.hidden = true;

  document.querySelectorAll('[data-workspace]').forEach(button => {
    button.classList.toggle('active', button.dataset.workspace === next);
  });

  if (next === 'mappings') {
    if (mappingCard) mappingCard.hidden = false;
    setMappingCollapsed(false, false);
    requestAnimationFrame(() => {
      renderMappingSkeletonPreview();
      requestAnimationFrame(renderMappingSkeletonPreview);
    });
  } else if (next === 'workspace') {
    setMappingCollapsed(true, false);
  }

  if (isActionPacker) {
    requestAnimationFrame(syncAllSourcesToActionPacker);
  }

  if (isRestPose) {
    enterRestPoseWorkspace();
  } else if (previous === 'restpose') {
    requestAnimationFrame(() => seek(state.playTime));
  }

  if (!isActionPacker) {
    updateTransferBridgeVisibility(false);

    requestAnimationFrame(() => {
      resizeViewports();
      requestAnimationFrame(resizeViewports);
    });
  }
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

function updateQuickIkStep() {
  const step = $('quickIkStep');
  const button = $('quickConvertIk');
  const note = $('quickIkNote');
  if (!step || !button || !note) return;

  const hasFk = !!state.fkClip;
  const supported = hasFk && supportsFkToIk();
  const converted = !!state.ikOnlyClip;

  step.hidden = !hasFk;

  if (!hasFk) return;

  if (converted) {
    button.disabled = true;
    button.classList.add('done');
    button.innerHTML = '<span>✓</span><b>FK → IK listo</b>';
    note.textContent = 'Controles IK generados';
    return;
  }

  button.classList.remove('done');
  button.innerHTML = '<span>→</span><b>FK → IK</b>';
  button.disabled = !supported;

  if (supported) {
    note.textContent = 'Siguiente paso · bake de controles IK';
    button.title = 'Convertir ahora FK → IK';
  } else {
    note.textContent = 'No disponible para este tipo de Target';
    button.title = 'Este Target no expone un pipeline IK compatible';
  }
}

function updateButtons() {
  const ready = !!state.source.root && !!state.target.root && !!state.source.activeClip && validMap().length > 0;
  $('applyRetarget').disabled = !ready;
  $('convertIk').disabled = !state.fkClip || !supportsFkToIk();

  const canCompare = !!(
    state.fkClip &&
    state.source.root &&
    state.target.root &&
    state.targetPreviewClip
  );

  if ($('ghostMode')) $('ghostMode').disabled = !canCompare;
  if ($('validateRetarget')) $('validateRetarget').disabled = !canCompare;

  if (!canCompare && state.ghost.enabled && state.ghost.container) {
    disposeGhostOverlay({ keepEnabled: true });
  }

  updateQuickIkStep();
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
  if (state.ueArpBridge?.mixer && state.ueArpBridge?.clip) {
    state.ueArpBridge.mixer.setTime(state.playTime);
    updateUeArpHelperBridgeOverlay();
  }
  applyTargetRigRuntime();
  updateGhostOverlayPose();
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

// Safari/iOS can enter text-selection mode from an imprecise long press or
// drag over the editor. Block selection in UI chrome, but keep it available
// inside fields/logs where selecting text is intentional.
const appRoot = document.querySelector('.app');
appRoot?.addEventListener('selectstart', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const editable = target.closest(
    'input, textarea, select, .diagnostics pre, .stats, [contenteditable="true"]'
  );

  if (!editable) event.preventDefault();
});

$('sourceButton').onclick = () => $('sourceFile').click();
$('targetButton').onclick = () => $('targetFile').click();
$('fitSource').onclick = () => fitView(sourceView, state.source.displayRoot || state.source.root);
$('fitTarget').onclick = () => fitView(targetView, state.target.displayRoot || state.target.root);
$('ghostMode').onclick = () => setGhostMode(!state.ghost.enabled);
$('validateRetarget').onclick = validateAndCopyRetarget;
$('sourceClip').onchange = () => setSourceClip(Number($('sourceClip').value));
$('loadPreset').onclick = () => {
  if ($('preset').value === 'none') {
    updateTransferBridgeVisibility(false);
    log('Selecciona un preset manual o usa Auto-preset.');
    return;
  }

  state.activePreset = null;
  state.activePresetId = $('preset').value;
  updateTransferBridgeVisibility(false);

  void loadPreset()
    .then(() => {
      updateTransferBridgeVisibility(presetMatchesLoadedRigs());
    })
    .catch(error => {
      updateTransferBridgeVisibility(false);
      log(`ERROR preset: ${error.message}`);
    });
};
$('preset').onchange = () => {
  const id = $('preset').value;
  state.activePresetId = id;

  if (id === 'none') {
    state.activePreset = null;
    state.boneMap = [];
    refreshMapUi();
    updateButtons();
    updateTransferBridgeVisibility(false);
    return;
  }

  if (state.source.root && state.target.root) {
    state.activePreset = null;
    updateTransferBridgeVisibility(false);
    void loadPreset()
      .then(() => {
        const compatible = presetMatchesLoadedRigs();
        updateTransferBridgeVisibility(compatible);

        if (!compatible) {
          const preset = state.activePreset;
          log(
            `Preset ${preset?.label || id}: oculto Transfer porque Source/Target no corresponden a ` +
            `${preset?.sourceFamily || '?'} → ${preset?.targetFamily || '?'}.`
          );
        }
      })
      .catch(error => {
        updateTransferBridgeVisibility(false);
        log(`ERROR preset: ${error.message}`);
      });
  }
};
$('autoMatch').onclick = runAutoPreset;
$('sidebarAutoPreset').onclick = runAutoPreset;
updateSidebarAutoPresetVisibility(state.workspaceView);
$('addPair').onclick = () => {
  state.boneMap.push({ source: '', target: '' });
  state.mappingPreviewSelectedIndex = state.boneMap.length - 1;
  refreshMapUi();
};
$('clearMap').onclick = () => {
  state.boneMap = [];
  state.mappingPreviewSelectedIndex = null;
  refreshMapUi();
};
const mappingPreviewResizeObserver = new ResizeObserver(() => {
  if (state.workspaceView === 'mappings') {
    renderMappingSkeletonPreview();
  }
});
if ($('mappingSkeletonPreview')) {
  mappingPreviewResizeObserver.observe($('mappingSkeletonPreview'));
}

$('mappingSourceSkeleton')?.addEventListener('click',event => {
  handleMappingSkeletonPointer(event,'source');
});
$('mappingTargetSkeleton')?.addEventListener('click',event => {
  handleMappingSkeletonPointer(event,'target');
});

$('mapSearch').oninput = refreshMapUi;
$('sourcePrefix').onchange = () => {
  if ($('preset').value !== 'none' && state.source.root && state.target.root) void loadPreset();
};
$('targetPrefix').onchange = () => {
  if ($('preset').value !== 'none' && state.source.root && state.target.root) void loadPreset();
};
$('applyRetarget').onclick = applyRetarget;

$('restBoneSelect').onchange = () => selectRestPoseBone($('restBoneSelect').value);
$('restSpaceToggle').onclick = () => {
  const transform = ensureRestPoseTransformControls();
  const nextSpace = transform.space === 'local' ? 'world' : 'local';
  transform.setSpace(nextSpace);
  $('restSpaceToggle').textContent = nextSpace === 'local' ? 'Local' : 'World';
};
$('showFullRestGimbal').onchange = () => {
  state.restEditor.showFullGimbal = $('showFullRestGimbal').checked;
  updateRestPoseGizmoMode();
};
$('toggleRestTargetOverlay').onclick = () => {
  setRestPoseTargetOverlayEnabled(!state.restEditor.targetOverlayEnabled);
  updateRestPoseUi();
};
$('restTargetOverlayOpacity').oninput = () => {
  setRestPoseTargetOverlayOpacity($('restTargetOverlayOpacity').value);
};
$('copyRestBone').onclick = copySelectedRestBone;
$('undoRestPose').onclick = undoRestPoseEdit;
$('resetRestBone').onclick = resetSelectedRestBone;
$('resetRestPose').onclick = resetRestPoseEditorPose;
$('commitRestPose').onclick = commitRestPoseEditor;
$('restSensitivity').oninput = () => {
  state.restEditor.sensitivity = Number($('restSensitivity').value) || 0.5;
  updateRestPoseUi();
};

$('convertIk').onclick = convertFkToIk;
$('quickConvertIk').onclick = convertFkToIk;
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
  if (usesRigifyPipeline() && state.fkClip) {
    const resumeTime = state.playTime;
    rebuildTargetPreviewClip();
    playTargetClip(state.targetPreviewClip);
    seek(resumeTime);
  } else {
    applyTargetRigRuntime();
  }
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

window.addEventListener('keydown', event => {
  if (state.workspaceView !== 'restpose') return;

  const isUndo = (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    String(event.key).toLowerCase() === 'z';

  if (!isUndo) return;
  event.preventDefault();
  event.stopPropagation();
  undoRestPoseEdit();
}, { capture: true });

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

  let poseUpdatedBySeek = false;

  if (state.playing && duration > 0) {
    let t = state.playTime + dt;
    if (t > duration) t %= duration;
    seek(t);
    poseUpdatedBySeek = true;
  }

  // seek() already evaluates both mixers + the target runtime + overlays.
  // Do not repeat the expensive ARP skin solve a second time in the same RAF.
  if (!poseUpdatedBySeek) {
    applyTargetRigRuntime();
    updateGhostOverlayPose();
    updateUeArpHelperBridgeOverlay();
    updateRigOverlays();
  }

  syncRestPoseGizmoThickness();
  updateRestPoseJointMarkers();

  sourceView.controls.update();
  targetView.controls.update();
  sourceView.renderer.render(sourceView.scene, sourceView.camera);
  targetView.renderer.render(targetView.scene, targetView.camera);
}

setWorkspaceView('workspace');
setMappingCollapsed(true, false);
updateConditionalFeatureVisibility(false);
updateTransferBridgeVisibility(false);
updateStats();
updateWorkflowUI();
requestAnimationFrame(animate);
log(`Retarget-to-play listo · WaltFBX v${WALT_FBX_VERSION}. Los FBX se procesan localmente en el navegador.`);
