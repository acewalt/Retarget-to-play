import * as THREE from 'three';

function parseTrackTarget(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot <= 0) return null;
  return { nodeName: trackName.slice(0, dot), property: trackName.slice(dot + 1) };
}

function unwrapEulerRadians(prev, current) {
  if (!prev) return current;
  const tau = Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    while (current[i] - prev[i] > Math.PI) current[i] -= tau;
    while (current[i] - prev[i] < -Math.PI) current[i] += tau;
  }
  return current;
}

export function buildBlenderBasisActionData(clip, slot, fps, originalName) {
  const rotations = [];
  const locations = [];
  let maxTime = 0;

  for (const track of clip.tracks) {
    const parsed = parseTrackTarget(track.name);
    if (!parsed) continue;
    const bone = slot.bones.get(parsed.nodeName);
    const rest = slot.rest.get(parsed.nodeName);
    if (!bone || !rest) continue;

    const boneName = originalName(bone) || parsed.nodeName;
    const frames = Array.from(track.times, t => {
      maxTime = Math.max(maxTime, Number(t));
      return Number(t) * fps;
    });

    if (parsed.property === 'quaternion') {
      const restInv = rest.quaternion.clone().invert();
      const q = new THREE.Quaternion();
      const basis = new THREE.Quaternion();
      const e = new THREE.Euler(0, 0, 0, 'XYZ');
      const values = [];
      let previous = null;
      for (let i = 0; i < track.times.length; i++) {
        q.fromArray(track.values, i * 4).normalize();
        basis.copy(restInv).multiply(q).normalize();
        e.setFromQuaternion(basis, 'XYZ');
        const triple = unwrapEulerRadians(previous, [e.x, e.y, e.z]);
        values.push(triple);
        previous = triple;
      }
      rotations.push({ bone: boneName, frames, values });
      continue;
    }

    if (parsed.property === 'position') {
      const restInvQ = rest.quaternion.clone().invert();
      const values = [];
      for (let i = 0; i < track.times.length; i++) {
        const current = new THREE.Vector3().fromArray(track.values, i * 3);
        const basisPosition = current.sub(rest.position).applyQuaternion(restInvQ);
        basisPosition.x /= Math.abs(rest.scale.x) > 1e-8 ? rest.scale.x : 1;
        basisPosition.y /= Math.abs(rest.scale.y) > 1e-8 ? rest.scale.y : 1;
        basisPosition.z /= Math.abs(rest.scale.z) > 1e-8 ? rest.scale.z : 1;
        values.push([basisPosition.x, basisPosition.y, basisPosition.z]);
      }
      locations.push({ bone: boneName, frames, values });
    }
  }

  return {
    name: (clip.name || 'Retargeted_FK') + '_XYZ',
    fps,
    frameEnd: Math.round(maxTime * fps),
    rotations,
    locations
  };
}

export function buildBlenderXYZActionScript(clip, slot, fps, originalName) {
  const payload = buildBlenderBasisActionData(clip, slot, fps, originalName);
  const jsonLiteral = JSON.stringify(JSON.stringify(payload));
  return [
    '# Retarget-to-play Blender XYZ Euler Action',
    '# Select the ORIGINAL CloudRig armature and run this file in Blender.',
    '',
    'import bpy',
    'import json',
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
    "name = DATA.get('name') or 'Retargeted_FK_XYZ'",
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
    '',
    "for item in DATA.get('rotations', []):",
    "    pb = rig.pose.bones.get(item['bone'])",
    '    if pb is None:',
    "        print('[Retarget-to-play] Bone missing:', item['bone'])",
    '        continue',
    "    pb.rotation_mode = 'XYZ'",
    "    for frame, value in zip(item['frames'], item['values']):",
    '        pb.rotation_euler = value',
    "        pb.keyframe_insert(data_path='rotation_euler', frame=frame, group=item['bone'])",
    '',
    "for item in DATA.get('locations', []):",
    "    pb = rig.pose.bones.get(item['bone'])",
    '    if pb is None:',
    "        print('[Retarget-to-play] Bone missing:', item['bone'])",
    '        continue',
    "    for frame, value in zip(item['frames'], item['values']):",
    '        pb.location = value',
    "        pb.keyframe_insert(data_path='location', frame=frame, group=item['bone'])",
    '',
    'try:',
    '    for fc in action.fcurves:',
    '        for kp in fc.keyframe_points:',
    "            kp.interpolation = 'LINEAR'",
    'except Exception:',
    '    pass',
    '',
    'scene.frame_set(0)',
    "print('[Retarget-to-play] Action ready:', action.name)",
    ''
  ].join('\\n');
}
