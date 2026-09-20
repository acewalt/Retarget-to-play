import * as THREE from 'three';

function parseTrackTarget(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot <= 0) return null;
  return {
    nodeName: trackName.slice(0, dot),
    property: trackName.slice(dot + 1)
  };
}

function collectTrackInfo(clip) {
  const info = new Map();

  for (const track of clip.tracks || []) {
    const parsed = parseTrackTarget(track.name);
    if (!parsed) continue;

    let entry = info.get(parsed.nodeName);
    if (!entry) {
      entry = {
        nodeName: parsed.nodeName,
        rotation: false,
        position: false
      };
      info.set(parsed.nodeName, entry);
    }

    if (parsed.property === 'quaternion') entry.rotation = true;
    if (parsed.property === 'position') entry.position = true;
  }

  return info;
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

function uniqueTimes(clip, fps) {
  const values = new Set();

  for (const track of clip.tracks || []) {
    for (const t of track.times || []) {
      values.add(Number(t).toFixed(8));
    }
  }

  if (!values.size) {
    const count = Math.max(2, Math.ceil((clip.duration || 0) * fps) + 1);
    for (let i = 0; i < count; i++) {
      values.add(String(Math.min(clip.duration || 0, i / fps)));
    }
  }

  return [...values]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

// Blender (+Z up) -> Three r180 (+Y up) is a -90 degree rotation around X.
// Therefore Three -> Blender uses +90 degrees around X.
const THREE_TO_BLENDER_Q = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const BLENDER_TO_THREE_Q = THREE_TO_BLENDER_Q.clone().invert();

function threeDeltaQuaternionToBlender(qThree) {
  return THREE_TO_BLENDER_Q.clone()
    .multiply(qThree)
    .multiply(BLENDER_TO_THREE_Q)
    .normalize();
}

function threeVectorToBlender(v) {
  return v.clone().applyQuaternion(THREE_TO_BLENDER_Q);
}

/**
 * Samples the exact pose that is visible in the web viewport and stores it as
 * WORLD/armature-space deltas relative to each control's rest pose.
 *
 * This is intentionally NOT an FBX local-channel copy. Blender's FBX importer
 * changes bone axes/rest representation. A world delta can instead be applied
 * to the ORIGINAL CloudRig rest matrices inside Blender.
 */
export function buildBlenderWorldDeltaActionData(
  clip,
  slot,
  fps,
  originalName,
  rotationMode = 'xyz'
) {
  if (!clip || !slot?.root) throw new Error('Blender Action: faltan clip o Target.');

  const trackInfo = collectTrackInfo(clip);
  const active = [...trackInfo.values()].filter(entry => slot.bones.has(entry.nodeName));
  if (!active.length) throw new Error('Blender Action: no encontré controles animados.');

  const times = uniqueTimes(clip, fps);
  const frames = times.map(t => t * fps);

  const records = new Map();
  for (const entry of active) {
    const bone = slot.bones.get(entry.nodeName);
    records.set(entry.nodeName, {
      runtimeName: entry.nodeName,
      bone: originalName(bone) || entry.nodeName,
      rotation: entry.rotation,
      position: entry.position,
      rotationDeltas: [],
      positionDeltas: []
    });
  }

  resetSlotToRest(slot);

  const mixer = new THREE.AnimationMixer(slot.root);
  const action = mixer.clipAction(clip).play();

  try {
    for (const time of times) {
      resetSlotToRest(slot);
      mixer.setTime(time);
      (slot.displayRoot || slot.root).updateMatrixWorld(true);

      for (const entry of active) {
        const bone = slot.bones.get(entry.nodeName);
        const rest = slot.rest.get(entry.nodeName);
        const out = records.get(entry.nodeName);
        if (!bone || !rest || !out) continue;

        if (entry.rotation) {
          const currentWorld = bone.getWorldQuaternion(new THREE.Quaternion());
          const deltaThree = currentWorld
            .multiply(rest.worldQuat.clone().invert())
            .normalize();

          const deltaBlender = threeDeltaQuaternionToBlender(deltaThree);

          out.rotationDeltas.push([
            deltaBlender.w,
            deltaBlender.x,
            deltaBlender.y,
            deltaBlender.z
          ]);
        }

        if (entry.position) {
          const currentWorld = bone.getWorldPosition(new THREE.Vector3());
          const deltaThree = currentWorld.sub(rest.worldPos);
          const deltaBlender = threeVectorToBlender(deltaThree);

          out.positionDeltas.push([
            deltaBlender.x,
            deltaBlender.y,
            deltaBlender.z
          ]);
        }
      }
    }
  } finally {
    action.stop();
    mixer.stopAllAction();
    resetSlotToRest(slot);
  }

  return {
    name: (clip.name || 'Retargeted_FK') +
      (rotationMode === 'quaternion' ? '_OriginalRig_Quaternion' : '_OriginalRig_XYZ'),
    rotationMode,
    fps,
    frameEnd: frames.length ? Math.round(frames[frames.length - 1]) : 0,
    frames,
    bones: [...records.values()].map(({ runtimeName, ...item }) => item)
  };
}

export function buildBlenderActionScript(
  clip,
  slot,
  fps,
  originalName,
  rotationMode = 'xyz'
) {
  const payload = buildBlenderWorldDeltaActionData(
    clip,
    slot,
    fps,
    originalName,
    rotationMode
  );

  const jsonLiteral = JSON.stringify(JSON.stringify(payload));

  return [
    '# Retarget-to-play · ORIGINAL CloudRig Action',
    '# Select the ORIGINAL RIG-Sintel armature and run this file in Blender.',
    '# The data contains world-space pose deltas sampled from the web viewport.',
    '',
    'import bpy',
    'import json',
    'from mathutils import Matrix, Quaternion, Vector',
    '',
    'DATA = json.loads(' + jsonLiteral + ')',
    '',
    "rig = bpy.context.object if bpy.context.object and bpy.context.object.type == 'ARMATURE' else None",
    'if rig is None:',
    "    rig = bpy.data.objects.get('RIG-Sintel')",
    '',
    "if rig is None or rig.type != 'ARMATURE':",
    "    raise RuntimeError('Select the original RIG-Sintel armature before running this script.')",
    '',
    'rig.animation_data_create()',
    "name = DATA.get('name') or 'Retargeted_OriginalRig'",
    'old = bpy.data.actions.get(name)',
    'if old is not None:',
    '    bpy.data.actions.remove(old)',
    '',
    'action = bpy.data.actions.new(name=name)',
    'rig.animation_data.action = action',
    '',
    'scene = bpy.context.scene',
    "scene.render.fps = int(DATA.get('fps', 30))",
    'scene.frame_start = 0',
    "scene.frame_end = int(DATA.get('frameEnd', 0))",
    "rotation_mode = DATA.get('rotationMode', 'xyz')",
    '',
    '# Reset only the controls we are about to animate.',
    "for item in DATA.get('bones', []):",
    "    pb = rig.pose.bones.get(item['bone'])",
    '    if pb is None:',
    '        continue',
    '    pb.location = (0.0, 0.0, 0.0)',
    '    pb.scale = (1.0, 1.0, 1.0)',
    "    if rotation_mode == 'quaternion':",
    "        pb.rotation_mode = 'QUATERNION'",
    '        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)',
    '    else:',
    "        pb.rotation_mode = 'XYZ'",
    '        pb.rotation_euler = (0.0, 0.0, 0.0)',
    '',
    'view_layer = bpy.context.view_layer',
    '',
    "def bone_depth(pb):",
    '    depth = 0',
    '    p = pb.parent',
    '    while p is not None:',
    '        depth += 1',
    '        p = p.parent',
    '    return depth',
    '',
    "items = [item for item in DATA.get('bones', []) if rig.pose.bones.get(item['bone']) is not None]",
    "items.sort(key=lambda item: bone_depth(rig.pose.bones[item['bone']]))",
    '',
    "frames = DATA.get('frames', [])",
    'for sample_index, frame in enumerate(frames):',
    '    scene.frame_set(round(frame))',
    '    view_layer.update()',
    '',
    '    for item in items:',
    "        pb = rig.pose.bones[item['bone']]",
    '',
    "        if item.get('rotation') and sample_index < len(item.get('rotationDeltas', [])):",
    "            w, x, y, z = item['rotationDeltas'][sample_index]",
    '            delta = Quaternion((w, x, y, z))',
    '            rest_q = pb.bone.matrix_local.to_quaternion()',
    '            desired_q = delta @ rest_q',
    '',
    '            # Keep the head where the ORIGINAL rig currently places it',
    '            # (parents/hinges/constraints), but force the visual orientation',
    '            # to the exact web-space delta applied to the original rest bone.',
    '            desired = desired_q.to_matrix().to_4x4()',
    '            desired.translation = pb.matrix.translation.copy()',
    '',
    "            if rotation_mode == 'quaternion':",
    "                pb.rotation_mode = 'QUATERNION'",
    '            else:',
    "                pb.rotation_mode = 'XYZ'",
    '',
    '            pb.matrix = desired',
    '            view_layer.update()',
    '',
    "            if rotation_mode == 'quaternion':",
    "                pb.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=item['bone'])",
    '            else:',
    "                pb.keyframe_insert(data_path='rotation_euler', frame=frame, group=item['bone'])",
    '',
    "        if item.get('position') and sample_index < len(item.get('positionDeltas', [])):",
    "            dx, dy, dz = item['positionDeltas'][sample_index]",
    '            rest_pos = pb.bone.matrix_local.translation',
    '            desired_pos = rest_pos + Vector((dx, dy, dz))',
    '            mat = pb.matrix.copy()',
    '            mat.translation = desired_pos',
    '            pb.matrix = mat',
    '            view_layer.update()',
    "            pb.keyframe_insert(data_path='location', frame=frame, group=item['bone'])",
    '',
    '# Keep interpolation deterministic and equivalent to the baked samples.',
    'try:',
    '    for fc in action.fcurves:',
    '        for kp in fc.keyframe_points:',
    "            kp.interpolation = 'LINEAR'",
    'except Exception:',
    '    pass',
    '',
    'scene.frame_set(0)',
    "print('[Retarget-to-play] Original rig Action ready:', action.name)",
    ''
  ].join('\\n');
}

// Backward-compatible alias.
export function buildBlenderXYZActionScript(clip, slot, fps, originalName) {
  return buildBlenderActionScript(clip, slot, fps, originalName, 'xyz');
}
