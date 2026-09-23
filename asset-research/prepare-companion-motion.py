"""Extract CC0 Mesh2Motion rotations into the VRM normalized humanoid frame.

Only human-bone rotations are shipped; mesh, textures and root translations are
omitted. The source bind matrices are checked against the saved rest skeleton.
"""
import copy
import hashlib
import json
import math
import pathlib
import struct

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / 'mesh2motion-human-base.glb'
OUT = ROOT.parent / 'companion-web/dist/assets/motions'
raw = SOURCE.read_bytes()
json_len = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_len])
binary = raw[28 + json_len:]
nodes = gltf['nodes']
parents = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}


def read_accessor(index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    assert accessor['componentType'] == 5126 and 'sparse' not in accessor
    widths = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    width = widths[accessor['type']]
    assert view.get('byteStride', width * 4) == width * 4
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return np.frombuffer(binary, dtype='<f4', count=accessor['count'] * width, offset=offset).reshape(-1, width).copy()


def qm(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return np.array([w * X + x * W + y * Z - z * Y,
                     w * Y - x * Z + y * W + z * X,
                     w * Z + x * Y - y * X + z * W,
                     w * W - x * X - y * Y - z * Z])


def qmatrix(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])


def world_matrix(i):
    n = nodes[i]
    matrix = np.eye(4)
    matrix[:3, :3] = qmatrix(n.get('rotation', [0, 0, 0, 1])) @ np.diag(n.get('scale', [1, 1, 1]))
    matrix[:3, 3] = n.get('translation', [0, 0, 0])
    return world_matrix(parents[i]) @ matrix if i in parents else matrix


def world_quaternion(i):
    q = nodes[i].get('rotation', [0, 0, 0, 1])
    value = qm(world_quaternion(parents[i]), q) if i in parents else np.array(q)
    return value / np.linalg.norm(value)


bind = read_accessor(gltf['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
rest_error = max(np.max(np.abs(world_matrix(node) @ matrix - np.eye(4)))
                 for node, matrix in zip(gltf['skins'][0]['joints'], bind))
assert rest_error < 0.00001, 'Animation saved pose differs from source skin rest pose'

mapping = {'pelvis': 'hips', 'spine_01': 'spine', 'spine_02': 'chest',
           'spine_03': 'upperChest', 'neck_01': 'neck', 'head': 'head'}
for suffix, side in [('l', 'left'), ('r', 'right')]:
    for name, target in [('clavicle', 'Shoulder'), ('upperarm', 'UpperArm'), ('lowerarm', 'LowerArm'),
                         ('hand', 'Hand'), ('thigh', 'UpperLeg'), ('calf', 'LowerLeg'),
                         ('foot', 'Foot'), ('ball', 'Toes')]:
        mapping[name + '_' + suffix] = side + target
    for finger, target in [('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Little')]:
        for index, joint in enumerate(['Proximal', 'Intermediate', 'Distal'], 1):
            mapping[f'{finger}_{index:02}_{suffix}'] = side + target + joint
    for index, joint in enumerate(['Metacarpal', 'Proximal', 'Distal'], 1):
        mapping[f'thumb_{index:02}_{suffix}'] = side + 'Thumb' + joint

requested = {'Walk': 'walk', 'Walk_Carry': 'carry', 'Idle_A': 'idle'}
result = {'version': 1, 'coordinateSystem': 'VRM1 normalized humanoid',
          'source': 'https://github.com/Mesh2Motion/mesh2motion-app/blob/main/static/animations/human-base-animations.glb',
          'sourceSHA256': hashlib.sha256(raw).hexdigest(), 'license': 'CC0-1.0',
          'containsRootTranslation': False, 'clips': {}}
for animation in gltf['animations']:
    if animation['name'] not in requested:
        continue
    tracks = {}
    duration = 0
    for channel in animation['channels']:
        target = channel['target']
        node_index = target['node']
        name = nodes[node_index]['name']
        if target['path'] != 'rotation' or name not in mapping:
            continue
        sampler = animation['samplers'][channel['sampler']]
        times = read_accessor(sampler['input']).flatten()
        source_values = read_accessor(sampler['output'])
        duration = max(duration, float(times[-1]))
        if sampler.get('interpolation', 'LINEAR') == 'STEP':
            assert np.max(np.abs(source_values - source_values[0])) < 0.000001
            times = times[:1]
            source_values = source_values[:1]
        else:
            assert sampler.get('interpolation', 'LINEAR') == 'LINEAR'
        parent_world = world_quaternion(parents[node_index]) if node_index in parents else np.array([0, 0, 0, 1])
        inverse_rest = world_quaternion(node_index) * [-1, -1, -1, 1]
        values = [qm(qm(parent_world, q), inverse_rest) for q in source_values]
        values = [q / np.linalg.norm(q) for q in values]
        # Keep adjacent quaternions in one hemisphere to make interpolation stable.
        for i in range(1, len(values)):
            if np.dot(values[i - 1], values[i]) < 0:
                values[i] = -values[i]
        tracks[mapping[name]] = {'times': np.round(times, 7).tolist(),
                                'rotations': np.round(values, 7).flatten().tolist()}
    clip = {'sourceName': animation['name'], 'duration': duration, 'loop': True, 'tracks': tracks}
    if animation['name'] in ('Walk', 'Walk_Carry'):
        # Source phase 0: left heel contacts; .5: right heel contacts.
        # Our foot planner starts phase 0 with the LEFT foot taking off.
        clip['footworkPhaseOffset'] = 0.5
        clip['contacts'] = {'left': 0.0, 'right': 0.5}
        clip['swingMidpoints'] = {'left': 0.75, 'right': 0.25}
    result['clips'][requested[animation['name']]] = clip

OUT.mkdir(parents=True, exist_ok=True)
dest = OUT / 'companion-motion.json'
dest.write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'output': str(dest), 'bytes': dest.stat().st_size, 'restBindError': float(rest_error),
                  'clips': {name: {'duration': clip['duration'], 'bones': len(clip['tracks'])}
                            for name, clip in result['clips'].items()}}, indent=2))
