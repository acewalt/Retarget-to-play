import * as THREE from 'three';

function parseTrackTarget(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot <= 0) return null;
  return {
    nodeName: trackName.slice(0, dot),
    property: trackName.slice(dot + 1)
  };
}

const UPPER_SOLVE_ORDER = [
  ['FK-Shoulder.L', 'DEF-Shoulder.L'],
  ['FK-Shoulder.R', 'DEF-Shoulder.R'],
  ['FK-Neck', 'DEF-Neck'],
  ['FK-Head', 'DEF-Head'],
  ['FK-UpperArm.L', 'DEF-UpperArm_1.L'],
  ['FK-UpperArm.R', 'DEF-UpperArm_1.R'],
  ['FK-Forearm.L', 'DEF-Forearm_1.L'],
  ['FK-Forearm.R', 'DEF-Forearm_1.R'],
  ['FK-Hand.L', 'DEF-Hand.L'],
  ['FK-Hand.R', 'DEF-Hand.R']
];

const UPPER_SOLVE_CONTROLS = new Set(
  UPPER_SOLVE_ORDER.map(([control]) => control)
);

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
  const runtime = slot.rigRuntime || null;
  const solverGoals = UPPER_SOLVE_ORDER
    .map(([controlName, drivenName]) => {
      const control = slot.bones.get(controlName) ||
        runtime?.rig?.get?.(controlName) || null;
      const driven = slot.bones.get(drivenName) ||
        runtime?.rig?.get?.(drivenName) || null;
      const drivenRest = driven ? runtime?.rest?.get?.(driven) : null;

      if (!control || !driven || !drivenRest) return null;

      return {
        control: originalName(control) || controlName,
        driven: originalName(driven) || drivenName,
        runtimeControlName: control.name,
        drivenBone: driven,
        drivenRest,
        rotationDeltas: []
      };
    })
    .filter(Boolean);

  for (const entry of active) {
    const bone = slot.bones.get(entry.nodeName);
    const boneName = originalName(bone) || entry.nodeName;
    records.set(entry.nodeName, {
      runtimeName: entry.nodeName,
      bone: boneName,
      rotation: entry.rotation,
      position: entry.position,
      rotationSpace: 'world',
      solverOverride: UPPER_SOLVE_CONTROLS.has(boneName),
      rotationDeltas: [],
      positionDeltas: []
    });
  }

  resetSlotToRest(slot);

  const mixer = new THREE.AnimationMixer(slot.root);
  const action = mixer.clipAction(clip).play();
  const previousRuntimeEnabled = runtime?.enabled;

  try {
    for (const time of times) {
      resetSlotToRest(slot);
      mixer.setTime(time);
      (slot.displayRoot || slot.root).updateMatrixWorld(true);

      if (runtime) {
        runtime.enabled = true;
        runtime.update();
        (slot.displayRoot || slot.root).updateMatrixWorld(true);
      }

      for (const goal of solverGoals) {
        const currentWorld = goal.drivenBone.getWorldQuaternion(
          new THREE.Quaternion()
        );

        const deltaThree = currentWorld
          .multiply(goal.drivenRest.worldQuaternion.clone().invert())
          .normalize();

        const deltaBlender = threeDeltaQuaternionToBlender(deltaThree);

        const previous = goal.rotationDeltas[goal.rotationDeltas.length - 1];
        if (previous) {
          const prevQ = new THREE.Quaternion(
            previous[1], previous[2], previous[3], previous[0]
          );

          if (prevQ.dot(deltaBlender) < 0) {
            deltaBlender.x *= -1;
            deltaBlender.y *= -1;
            deltaBlender.z *= -1;
            deltaBlender.w *= -1;
          }
        }

        goal.rotationDeltas.push([
          deltaBlender.w,
          deltaBlender.x,
          deltaBlender.y,
          deltaBlender.z
        ]);
      }

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

          const deltaForBlender = threeDeltaQuaternionToBlender(deltaThree);

          // Keep quaternion hemisphere stable between baked frames so dense
          // Quaternion/Euler conversion cannot jump through the long arc.
          const previous = out.rotationDeltas[out.rotationDeltas.length - 1];
          if (previous) {
            const prevQ = new THREE.Quaternion(
              previous[1], previous[2], previous[3], previous[0]
            );
            if (prevQ.dot(deltaForBlender) < 0) {
              deltaForBlender.x *= -1;
              deltaForBlender.y *= -1;
              deltaForBlender.z *= -1;
              deltaForBlender.w *= -1;
            }
          }

          out.rotationDeltas.push([
            deltaForBlender.w,
            deltaForBlender.x,
            deltaForBlender.y,
            deltaForBlender.z
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

    if (runtime) {
      runtime.enabled = previousRuntimeEnabled ?? true;
      runtime.resetDriven();
    }

    resetSlotToRest(slot);
  }

  return {
    name: (clip.name || 'Retargeted_FK') +
      (rotationMode === 'quaternion' ? '_OriginalRig_Quaternion' : '_OriginalRig_XYZ'),
    rotationMode,
    fps,
    frameEnd: frames.length ? Math.round(frames[frames.length - 1]) : 0,
    frames,
    bones: [...records.values()].map(({ runtimeName, ...item }) => item),
    solverGoals: solverGoals.map(goal => ({
      control: goal.control,
      driven: goal.driven,
      rotationDeltas: goal.rotationDeltas
    }))
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
    '# CloudRig has several FK controls under HNG branches directly below',
    '# RIG-Sintel. Their actual dependency is constraint-driven, not represented',
    '# by the raw FBX parent depth. Solve them in anatomical/constraint order.',
    'LOGICAL_ORDER = {',
    "    'root': 0,",
    "    'TORSO-Spine': 5,",
    "    'FK-Hips': 10,",
    "    'FK-Spine': 10,",
    "    'FK-Chest': 20,",
    "    'FK-Shoulder.L': 30,",
    "    'FK-Shoulder.R': 30,",
    "    'FK-Neck': 30,",
    "    'FK-UpperArm.L': 40,",
    "    'FK-UpperArm.R': 40,",
    "    'FK-Head': 40,",
    "    'FK-Forearm.L': 50,",
    "    'FK-Forearm.R': 50,",
    "    'FK-Hand.L': 60,",
    "    'FK-Hand.R': 60,",
    "    'FK-Thigh.L': 20,",
    "    'FK-Thigh.R': 20,",
    "    'FK-Knee.L': 30,",
    "    'FK-Knee.R': 30,",
    "    'FK-Foot.L': 40,",
    "    'FK-Foot.R': 40,",
    "    'FK-Toes.L': 50,",
    "    'FK-Toes.R': 50,",
    '}',
    '',
    "items = [item for item in DATA.get('bones', []) if rig.pose.bones.get(item['bone']) is not None]",
    "items.sort(key=lambda item: (LOGICAL_ORDER.get(item['bone'], 100), bone_depth(rig.pose.bones[item['bone']])))",
    '',
    "frames = DATA.get('frames', [])",
    'for sample_index, frame in enumerate(frames):',
    '    scene.frame_set(round(frame))',
    '    view_layer.update()',
    '',
    '    for item in items:',
    "        pb = rig.pose.bones[item['bone']]",
    '',
    "        if item.get('rotation') and not item.get('solverOverride') and sample_index < len(item.get('rotationDeltas', [])):",
    "            w, x, y, z = item['rotationDeltas'][sample_index]",
    '            delta = Quaternion((w, x, y, z))',
    '            rest_q = pb.bone.matrix_local.to_quaternion()',
    '            desired_q = delta @ rest_q',
    '            desired = desired_q.to_matrix().to_4x4()',
    '            desired.translation = pb.matrix.translation.copy()',
    '',
    "            if rotation_mode == 'quaternion':",
    "                pb.rotation_mode = 'QUATERNION'",
    '            else:',
    "                pb.rotation_mode = 'XYZ'",
    '',
    '            # Setting pose.matrix AFTER all logical parents/drivers above',
    '            # were evaluated makes Blender solve the correct local basis',
    '            # for HNG/constraint-driven FK controls.',
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
    '    # Constraint-aware upper-body solve.',
    '    # The browser already has the correct final DEF pose. Instead of',
    '    # assuming the exported FK/HNG hierarchy equals the original .blend,',
    '    # iteratively rotate each ORIGINAL FK control until its driven DEF bone',
    '    # matches that browser pose.',
    "    for goal in DATA.get('solverGoals', []):",
    "        control = rig.pose.bones.get(goal['control'])",
    "        driven = rig.pose.bones.get(goal['driven'])",
    '        if control is None or driven is None:',
    '            continue',
    "        if sample_index >= len(goal.get('rotationDeltas', [])):",
    '            continue',
    '',
    "        w, x, y, z = goal['rotationDeltas'][sample_index]",
    '        delta = Quaternion((w, x, y, z))',
    '        driven_rest_q = driven.bone.matrix_local.to_quaternion()',
    '        desired_driven_q = delta @ driven_rest_q',
    '',
    '        # A few feedback iterations are deliberate. CloudRig constraints,',
    '        # HNG bones and inherit settings are evaluated by Blender itself;',
    '        # each iteration measures the real DEF result and corrects the',
    '        # control in armature/world space.',
    '        for _ in range(5):',
    '            view_layer.update()',
    '            current_driven_q = driven.matrix.to_quaternion()',
    '            error_q = desired_driven_q @ current_driven_q.inverted()',
    '',
    '            # Stop once residual angular error is tiny.',
    '            angle = error_q.angle',
    '            if angle < 0.0005:',
    '                break',
    '',
    '            control_q = control.matrix.to_quaternion()',
    '            corrected_q = error_q @ control_q',
    '            corrected = corrected_q.to_matrix().to_4x4()',
    '            corrected.translation = control.matrix.translation.copy()',
    '            control.matrix = corrected',
    '            view_layer.update()',
    '',
    "        if rotation_mode == 'quaternion':",
    "            control.rotation_mode = 'QUATERNION'",
    "            control.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=goal['control'])",
    '        else:',
    "            control.rotation_mode = 'XYZ'",
    "            control.keyframe_insert(data_path='rotation_euler', frame=frame, group=goal['control'])",
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
    "print('[Retarget-to-play] Constraint-aware DEF feedback solver enabled for shoulders, neck, head and arms.')",
    ''
  ].join('\\n');
}

// Backward-compatible alias.
export function buildBlenderXYZActionScript(clip, slot, fps, originalName) {
  return buildBlenderActionScript(clip, slot, fps, originalName, 'xyz');
}
