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
  rotationMode = 'xyz',
  options = {}
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

  const convertToIk = !!options.convertToIk;
  const keepLimbFk = options.keepLimbFk !== false;
  const modeTag = convertToIk ? 'IK' : 'FK';

  return {
    name: (clip.name || 'Retargeted_FK') +
      `_OriginalRig_${modeTag}_` +
      (rotationMode === 'quaternion' ? 'Quaternion' : 'XYZ'),
    rotationMode,
    hasIk,
    convertToIk,
    keepLimbFk,
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
  rotationMode = 'xyz',
  options = {}
) {
  const payload = buildOriginalRigDeltaData(
    clip,
    slot,
    fps,
    originalName,
    rotationMode,
    options
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

# CloudRig usa 0=FK y 1=IK.
# El bake exacto FK->IK se hace EN BLENDER sobre el rig original, porque el
# FBX no conserva los ARMATURE/IK constraints ni los parent-switches que
# determinan el espacio real de IK-Hand / IK-Foot / POLE.
CONVERT_TO_IK = bool(DATA.get('convertToIk', False))
KEEP_LIMB_FK = bool(DATA.get('keepLimbFk', True))

NON_SWITCH_IK = ('ik_stretch', 'ik_parents', 'ik_pole_follow', 'ik_hinge')

def _is_limb_ik_switch(key):
    k = str(key).lower()
    if not k.startswith('ik_') or k.startswith(NON_SWITCH_IK):
        return False
    return any(token in k for token in ('arm', 'leg', 'thigh', 'upperarm'))

limb_switches = []
ik_context_props = []
changed_props = []

for pb in rig.pose.bones:
    for key in list(pb.keys()):
        try:
            value = pb[key]
        except Exception:
            continue
        if not isinstance(value, (int, float)):
            continue

        if _is_limb_ik_switch(key):
            limb_switches.append((pb, key, type(value)))
            # Sample/bake from the already-perfect FK pose first.
            if value != 0:
                pb[key] = type(value)(0)
                changed_props.append(pb.name + ':' + key + '=0')
        elif key.startswith(('ik_parents', 'ik_pole_follow', 'ik_stretch', 'ik_hinge')):
            ik_context_props.append((pb, key, value))
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


# ---------------------------------------------------------------------------
# EXACT FK -> IK BAKE ON THE ORIGINAL CLOUDRIG
# ---------------------------------------------------------------------------
if CONVERT_TO_IK:
    IK_CHAINS = [
        {
            'label': 'Arm.L',
            'fk': ('FK-UpperArm.L', 'FK-Forearm.L', 'FK-Hand.L'),
            'ik': 'IK-Hand.L',
            'pole': 'POLE-Arm.L',
        },
        {
            'label': 'Arm.R',
            'fk': ('FK-UpperArm.R', 'FK-Forearm.R', 'FK-Hand.R'),
            'ik': 'IK-Hand.R',
            'pole': 'POLE-Arm.R',
        },
        {
            'label': 'Leg.L',
            'fk': ('FK-Thigh.L', 'FK-Knee.L', 'FK-Foot.L'),
            'ik': 'IK-Foot.L',
            'pole': 'POLE-Leg.L',
        },
        {
            'label': 'Leg.R',
            'fk': ('FK-Thigh.R', 'FK-Knee.R', 'FK-Foot.R'),
            'ik': 'IK-Foot.R',
            'pole': 'POLE-Leg.R',
        },
    ]

    def _closest_point_on_line(line_start, line_end, point):
        line_dir = line_end - line_start
        denom = line_dir.dot(line_dir)
        if denom <= 1e-12:
            return line_start.copy()
        factor = (point - line_start).dot(line_dir) / denom
        return line_start + line_dir * factor

    def _cloudrig_pole_location(first, second):
        # CloudRig-style pole: current FK chain plane, armature/object space.
        first_head = first.head.copy()
        first_tail = first.tail.copy()
        second_tail = second.tail.copy()

        chain_vec = second_tail - first_head
        closest = _closest_point_on_line(first_head, second_tail, first_tail)
        elbow_vec = first_tail - closest

        if elbow_vec.length <= 1e-8:
            chain_n = chain_vec.normalized() if chain_vec.length > 1e-8 else Vector((0, 1, 0))
            candidates = [first.x_axis.copy(), -first.x_axis.copy(),
                          first.z_axis.copy(), -first.z_axis.copy()]
            candidates = [v - chain_n * v.dot(chain_n) for v in candidates]
            candidates = [v for v in candidates if v.length > 1e-8]
            elbow_vec = max(candidates, key=lambda v: v.length) if candidates else Vector((0, 0, 1))

        elbow_dir = elbow_vec.normalized()
        return first_tail + elbow_dir * max(chain_vec.length, first.length + second.length)

    valid_chains = []
    for spec in IK_CHAINS:
        names = list(spec['fk']) + [spec['ik'], spec['pole']]
        missing = [name for name in names if rig.pose.bones.get(name) is None]
        if missing:
            print('[Retarget-to-play] FK->IK skip', spec['label'], 'missing:', missing)
            continue
        valid_chains.append(spec)

    print('[Retarget-to-play] FK->IK exact chains:', len(valid_chains), '/ 4')

    # Keep FK active while sampling. IK is derived from the TARGET FK result.
    for pb, key, value_type in limb_switches:
        try:
            pb[key] = value_type(0)
        except Exception:
            pass

    try:
        rig.update_tag()
    except Exception:
        pass
    scene.frame_set(scene.frame_current)
    view_layer.update()

    for sample_index, frame in enumerate(frames):
        f = round(frame)
        scene.frame_set(f)
        view_layer.update()

        frame_samples = []

        for spec in valid_chains:
            fk_first = rig.pose.bones[spec['fk'][0]]
            fk_second = rig.pose.bones[spec['fk'][1]]
            fk_end = rig.pose.bones[spec['fk'][2]]
            ik_ctrl = rig.pose.bones[spec['ik']]
            pole_ctrl = rig.pose.bones[spec['pole']]

            # BlendCap formula in armature-local space.
            desired_ik = (
                fk_end.matrix.copy()
                @ fk_end.bone.matrix_local.inverted()
                @ ik_ctrl.bone.matrix_local
            )
            pole_loc = _cloudrig_pole_location(fk_first, fk_second)

            frame_samples.append((spec, ik_ctrl, pole_ctrl, desired_ik, pole_loc))

        # End effectors first. Let Blender do the authoritative matrix->basis
        # solve through the real P-IK parent-switch hierarchy.
        for spec, ik_ctrl, pole_ctrl, desired_ik, pole_loc in frame_samples:
            if rotation_mode == 'quaternion':
                ik_ctrl.rotation_mode = 'QUATERNION'
            else:
                ik_ctrl.rotation_mode = 'XYZ'

            ik_ctrl.matrix = desired_ik
            view_layer.update()

            ik_ctrl.keyframe_insert(
                data_path='location',
                frame=f,
                group=spec['ik']
            )
            if rotation_mode == 'quaternion':
                ik_ctrl.keyframe_insert(
                    data_path='rotation_quaternion',
                    frame=f,
                    group=spec['ik']
                )
            else:
                ik_ctrl.keyframe_insert(
                    data_path='rotation_euler',
                    frame=f,
                    group=spec['ik']
                )

        # Poles second. This matters for legs whose pole parent follows IK-Foot.
        view_layer.update()

        for spec, ik_ctrl, pole_ctrl, desired_ik, pole_loc in frame_samples:
            pole_mat = pole_ctrl.matrix.copy()
            pole_mat.translation = pole_loc
            pole_ctrl.matrix = pole_mat
            view_layer.update()

            pole_ctrl.keyframe_insert(
                data_path='location',
                frame=f,
                group=spec['pole']
            )

    switch_frames = [int(scene.frame_start), int(scene.frame_end)]

    # Turn on only the limb IK systems that were baked and key that state.
    for pb, key, value_type in limb_switches:
        try:
            pb[key] = value_type(1)
            for f in switch_frames:
                pb.keyframe_insert(
                    data_path='["' + key + '"]',
                    frame=f,
                    group='IK Switches'
                )
        except Exception as exc:
            print('[Retarget-to-play] switch key failed:', pb.name, key, exc)

    # Preserve parent-switch / pole-follow / stretch state in the Action.
    for pb, key, value in ik_context_props:
        try:
            pb[key] = value
            for f in switch_frames:
                pb.keyframe_insert(
                    data_path='["' + key + '"]',
                    frame=f,
                    group='IK Context'
                )
        except Exception:
            pass

    if not KEEP_LIMB_FK:
        limb_fk = {
            'FK-UpperArm.L', 'FK-Forearm.L', 'FK-Hand.L',
            'FK-UpperArm.R', 'FK-Forearm.R', 'FK-Hand.R',
            'FK-Thigh.L', 'FK-Knee.L', 'FK-Foot.L',
            'FK-Thigh.R', 'FK-Knee.R', 'FK-Foot.R',
        }

        try:
            for fc in list(action.fcurves):
                if any(('pose.bones["' + bone_name + '"]') in fc.data_path for bone_name in limb_fk):
                    action.fcurves.remove(fc)
        except Exception as exc:
            print('[Retarget-to-play] No pude limpiar FK limb curves:', exc)

    try:
        rig.update_tag()
    except Exception:
        pass
    scene.frame_set(scene.frame_start)
    view_layer.update()
else:
    # Pure FK Action: key the limb switches OFF so the Action remains portable.
    switch_frames = [int(scene.frame_start), int(scene.frame_end)]
    for pb, key, value_type in limb_switches:
        try:
            pb[key] = value_type(0)
            for f in switch_frames:
                pb.keyframe_insert(
                    data_path='["' + key + '"]',
                    frame=f,
                    group='IK Switches'
                )
        except Exception:
            pass

# Transform curves are linear. IK properties are discrete.
try:
    for fc in action.fcurves:
        is_ik_prop = ('["ik_' in fc.data_path)
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT' if is_ik_prop else 'LINEAR'
except Exception:
    pass

scene.frame_set(0)
view_layer.update()

print('[Retarget-to-play] Action creada:', action.name)
print('[Retarget-to-play] CloudRig modo:', 'IK exacto' if CONVERT_TO_IK else 'FK', '· props cambiadas:', len(changed_props))
print('[Retarget-to-play] FK limb conservado:', KEEP_LIMB_FK if CONVERT_TO_IK else True)
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

export function buildBlenderXYZActionScript(clip, slot, fps, originalName, options = {}) {
  return buildBlenderActionScript(clip, slot, fps, originalName, 'xyz', options);
}
