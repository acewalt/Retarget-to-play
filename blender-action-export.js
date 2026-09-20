import * as THREE from 'three';

function parseTrackTarget(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot <= 0) return null;
  return { nodeName: trackName.slice(0, dot), property: trackName.slice(dot + 1) };
}

function resetSlotToRest(slot) {
  for (const [name, rest] of slot.rest || []) {
    const bone = slot.bones.get(name);
    if (!bone) continue;
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  }
  (slot.displayRoot || slot.root)?.updateMatrixWorld(true);
}

function collectAnimatedBones(clip, slot, originalName) {
  const records = new Map();

  for (const track of clip.tracks || []) {
    const parsed = parseTrackTarget(track.name);
    if (!parsed) continue;
    if (parsed.property !== 'quaternion' && parsed.property !== 'position') continue;

    const bone = slot.bones.get(parsed.nodeName);
    const rest = slot.rest.get(parsed.nodeName);
    if (!bone || !rest) continue;

    let record = records.get(parsed.nodeName);
    if (!record) {
      record = {
        runtimeName: parsed.nodeName,
        bone: originalName(bone) || parsed.nodeName,
        rotation: false,
        position: false,
        basisRotations: [],
        positionDeltas: []
      };
      records.set(parsed.nodeName, record);
    }

    if (parsed.property === 'quaternion') record.rotation = true;
    if (parsed.property === 'position') record.position = true;
  }

  return records;
}

const THREE_TO_BLENDER_Q = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const BLENDER_TO_THREE_Q = THREE_TO_BLENDER_Q.clone().invert();

function worldDeltaToBlender(q) {
  return THREE_TO_BLENDER_Q.clone()
    .multiply(q)
    .multiply(BLENDER_TO_THREE_Q)
    .normalize();
}

function worldVectorToBlender(v) {
  return v.clone().applyQuaternion(THREE_TO_BLENDER_Q);
}

function stabilizeQuaternion(samples, q) {
  const previous = samples[samples.length - 1];
  if (!previous) return q;

  const prev = new THREE.Quaternion(
    previous[1], previous[2], previous[3], previous[0]
  );

  if (prev.dot(q) < 0) {
    q.x *= -1;
    q.y *= -1;
    q.z *= -1;
    q.w *= -1;
  }

  return q;
}

export function buildOriginalRigDeltaData(
  clip,
  slot,
  fps,
  originalName,
  rotationMode = 'xyz'
) {
  if (!clip || !slot?.root) {
    throw new Error('Blender Action: faltan clip o Target.');
  }

  const records = collectAnimatedBones(clip, slot, originalName);
  if (!records.size) {
    throw new Error('Blender Action: no encontré controles animados.');
  }

  const frameCount = Math.max(2, Math.ceil((clip.duration || 0) * fps) + 1);
  const times = Array.from(
    { length: frameCount },
    (_, i) => Math.min(clip.duration || 0, i / fps)
  );
  const frames = times.map(t => t * fps);

  resetSlotToRest(slot);
  const mixer = new THREE.AnimationMixer(slot.root);
  const action = mixer.clipAction(clip).play();

  try {
    for (const time of times) {
      resetSlotToRest(slot);
      mixer.setTime(time);
      (slot.displayRoot || slot.root).updateMatrixWorld(true);

      for (const record of records.values()) {
        const bone = slot.bones.get(record.runtimeName);
        const rest = slot.rest.get(record.runtimeName);
        if (!bone || !rest) continue;

        if (record.rotation) {
          // state.exportClip is now encoded as:
          //   localTrack = rawFBXRestLocal * ORIGINAL_RIG_matrix_basis
          // Therefore the portable pose-basis is obtained directly from the
          // local channel, with no world-space/HNG reconstruction and no
          // Blender/Three axis conversion.
          const basis = rest.quaternion.clone()
            .invert()
            .multiply(bone.quaternion)
            .normalize();

          stabilizeQuaternion(record.basisRotations, basis);

          record.basisRotations.push([
            basis.w,
            basis.x,
            basis.y,
            basis.z
          ]);
        }

        if (record.position) {
          const currentWorld = bone.getWorldPosition(new THREE.Vector3());
          const delta = worldVectorToBlender(currentWorld.sub(rest.worldPos));
          record.positionDeltas.push([delta.x, delta.y, delta.z]);
        }
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    resetSlotToRest(slot);
  }

  const hasIk = [...records.values()].some(record =>
    /^IK-(Hand|Foot)\./.test(record.bone) ||
    /^POLE-(Arm|Leg)\./.test(record.bone)
  );

  return {
    name: (clip.name || 'Retargeted_FK') +
      (rotationMode === 'quaternion' ? '_OriginalRig_Quaternion' : '_OriginalRig_XYZ'),
    rotationMode,
    hasIk,
    fps,
    frameEnd: frames.length ? Math.round(frames[frames.length - 1]) : 0,
    frames,
    bones: [...records.values()].map(({ runtimeName, ...record }) => record)
  };
}

export function buildBlenderActionScript(
  clip,
  slot,
  fps,
  originalName,
  rotationMode = 'xyz'
) {
  const payload = buildOriginalRigDeltaData(
    clip,
    slot,
    fps,
    originalName,
    rotationMode
  );

  const jsonLiteral = JSON.stringify(JSON.stringify(payload));

  const pythonBody = String.raw`
rig = bpy.context.object if bpy.context.object and bpy.context.object.type == 'ARMATURE' else None
if rig is None:
    rig = bpy.data.objects.get('RIG-Sintel')

if rig is None or rig.type != 'ARMATURE':
    raise RuntimeError('Selecciona el RIG-Sintel ORIGINAL antes de ejecutar el script.')

scene = bpy.context.scene
view_layer = bpy.context.view_layer

# CloudRig usa 0=FK y 1=IK. Si la Action contiene IK-Hand/IK-Foot/POLE,
# deja el rig directamente en IK; en una Action FK pura lo deja en FK.
USE_IK = bool(DATA.get('hasIk', False))
IK_SWITCH_VALUE = 1 if USE_IK else 0
NON_SWITCH_IK = ('ik_stretch', 'ik_parents', 'ik_pole_follow', 'ik_hinge')
changed_props = []
for pb in rig.pose.bones:
    for key in list(pb.keys()):
        try:
            value = pb[key]
        except Exception:
            continue
        if not isinstance(value, (int, float)):
            continue
        if key.startswith('ik_pole_follow'):
            # Stable-pole mode mirrors the already-working arm poles:
            # keep leg pole parent-switch on the root/default parent instead
            # of letting P-POLE-Leg follow the animated IK foot.
            if value != 0:
                pb[key] = type(value)(0)
                changed_props.append(pb.name + ':' + key + '=0')
        elif key.startswith('ik_') and not key.startswith(NON_SWITCH_IK):
            if value != IK_SWITCH_VALUE:
                pb[key] = type(value)(IK_SWITCH_VALUE)
                changed_props.append(pb.name + ':' + key + '=' + str(IK_SWITCH_VALUE))
        elif key.startswith('fk_hinge_'):
            if value != 0:
                pb[key] = type(value)(0)
                changed_props.append(pb.name + ':' + key + '=0')

try:
    rig.update_tag()
except Exception:
    pass

scene.frame_set(scene.frame_current)
view_layer.update()

rig.animation_data_create()
name = DATA.get('name') or 'Retargeted_OriginalRig'
old = bpy.data.actions.get(name)
if old is not None:
    bpy.data.actions.remove(old)

action = bpy.data.actions.new(name=name)
rig.animation_data.action = action

rotation_mode = DATA.get('rotationMode', 'xyz')
scene.render.fps = int(DATA.get('fps', 30))
scene.frame_start = 0
scene.frame_end = int(DATA.get('frameEnd', 0))

items = [
    item for item in DATA.get('bones', [])
    if rig.pose.bones.get(item['bone']) is not None
]

# Parent/constraint order. HNG helpers are evaluated between these stages.
ORDER = {
    'root': 0,
    'TORSO-Spine': 5,
    'HIP-Spine': 8,
    'FK-Hips': 10,
    'FK-Spine': 12,
    'FK-Chest': 20,
    'FK-Shoulder.L': 30,
    'FK-Shoulder.R': 30,
    'FK-Neck': 32,
    'FK-UpperArm.L': 40,
    'FK-UpperArm.R': 40,
    'FK-Head': 42,
    'FK-Forearm.L': 50,
    'FK-Forearm.R': 50,
    'FK-Hand.L': 60,
    'FK-Hand.R': 60,
    'FK-Thigh.L': 30,
    'FK-Thigh.R': 30,
    'FK-Knee.L': 40,
    'FK-Knee.R': 40,
    'FK-Foot.L': 50,
    'FK-Foot.R': 50,
    'FK-Toes.L': 60,
    'FK-Toes.R': 60,
}
items.sort(key=lambda item: ORDER.get(item['bone'], 100))

for item in items:
    pb = rig.pose.bones[item['bone']]
    pb.location = (0.0, 0.0, 0.0)
    pb.scale = (1.0, 1.0, 1.0)
    if rotation_mode == 'quaternion':
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    else:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0.0, 0.0, 0.0)

view_layer.update()
previous_euler = {}

frames = DATA.get('frames', [])
for sample_index, frame in enumerate(frames):
    scene.frame_set(round(frame))
    view_layer.update()

    for item in items:
        pb = rig.pose.bones[item['bone']]

        if item.get('rotation') and sample_index < len(item.get('basisRotations', [])):
            w, x, y, z = item['basisRotations'][sample_index]
            basis_q = Quaternion((w, x, y, z))
            basis_q.normalize()

            # This quaternion IS the original CloudRig pose-basis. Do not
            # solve it again through FK-HNG/Chest; doing so was the source of
            # the double-parent rotation seen in neck/head/shoulders/arms.
            if rotation_mode == 'quaternion':
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = basis_q
            else:
                pb.rotation_mode = 'XYZ'
                previous = previous_euler.get(item['bone'])
                e = basis_q.to_euler('XYZ', previous) if previous is not None else basis_q.to_euler('XYZ')
                pb.rotation_euler = e
                previous_euler[item['bone']] = e.copy()

            view_layer.update()

            if rotation_mode == 'quaternion':
                pb.keyframe_insert(
                    data_path='rotation_quaternion',
                    frame=frame,
                    group=item['bone']
                )
            else:
                pb.keyframe_insert(
                    data_path='rotation_euler',
                    frame=frame,
                    group=item['bone']
                )

        if item.get('position') and sample_index < len(item.get('positionDeltas', [])):
            dx, dy, dz = item['positionDeltas'][sample_index]
            desired_pos = pb.bone.matrix_local.translation + Vector((dx, dy, dz))
            mat = pb.matrix.copy()
            mat.translation = desired_pos
            pb.matrix = mat
            view_layer.update()
            pb.keyframe_insert(
                data_path='location',
                frame=frame,
                group=item['bone']
            )

try:
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
except Exception:
    pass

scene.frame_set(0)
view_layer.update()

print('[Retarget-to-play] Action creada:', action.name)
print('[Retarget-to-play] CloudRig modo:', 'IK' if USE_IK else 'FK', '· props cambiadas:', len(changed_props))
for item in changed_props:
    print('  ', item)
`;

  return [
    '# Retarget-to-play - CloudRig ORIGINAL',
    '# Pose-basis portable para el CloudRig original.',
    '',
    'import bpy',
    'import json',
    'from mathutils import Quaternion, Vector',
    '',
    'DATA = json.loads(' + jsonLiteral + ')',
    '',
    pythonBody
  ].join('\n');
}

export function buildBlenderXYZActionScript(clip, slot, fps, originalName) {
  return buildBlenderActionScript(clip, slot, fps, originalName, 'xyz');
}
