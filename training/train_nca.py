"""Train the local light-transport rule. Runs on a CPU or in a Colab Python session.
Dependencies: numpy, numba, torch. Run from the repository root.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from numba import njit
import torch
from torch import nn

DIR = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def room(rng, n):
    solid = np.zeros((n, n), dtype=np.float32)
    solid[[0, -1], :] = solid[:, [0, -1]] = 1
    for _ in range(3):
        x, y = rng.integers(3, n - 5, 2)
        solid[y:y + rng.integers(2, 6), x:x + rng.integers(1, 4)] = 1
    nz, nx = np.gradient(-solid)
    length = np.maximum(.01, np.hypot(nx, nz))
    tint = rng.uniform(.38, .92, (3,)).astype('f')
    albedo = np.where(solid[..., None] > 0, tint, .97).astype('f')
    features = np.concatenate([albedo, (nx/length)[..., None], (nz/length)[..., None],
                               solid[..., None], np.full_like(solid[..., None], .19),
                               np.ones_like(solid[..., None])], axis=-1)
    source = np.zeros_like(albedo)
    x = rng.integers(2, n - 3)
    source[2:4, x-1:x+2] = rng.uniform(.35, 1, 3)
    source *= 1 - solid[..., None]
    return features, source


@njit
def trace(features, source, spp, steps, seed):
    # Backward path tracing in a 2D participating medium. Sample isotropic
    # volume scattering and cosine-weighted reflection at the last free cell.
    np.random.seed(seed)
    n = len(source)
    target = np.zeros_like(source)
    for y in range(n):
        for x in range(n):
            if features[y, x, 5] > .5:
                continue
            for _ in range(spp):
                px, py = x + np.random.random(), y + np.random.random()
                a = np.random.random() * 2 * np.pi
                dx, dy = math.cos(a), math.sin(a)
                wr = wg = wb = 1.
                for _t in range(steps):
                    ix, iy = int(px), int(py)
                    target[y,x,0] += wr * source[iy,ix,0] / spp
                    target[y,x,1] += wg * source[iy,ix,1] / spp
                    target[y,x,2] += wb * source[iy,ix,2] / spp
                    if np.random.random() < .19:
                        a = np.random.random() * 2 * np.pi
                        dx, dy = math.cos(a), math.sin(a)
                    qx, qy = px + dx, py + dy
                    if not (0 <= qx < n and 0 <= qy < n):
                        break
                    j, i = int(qx), int(qy)
                    if features[i,j,5] > .5:
                        nx, ny = features[i,j,3], features[i,j,4]
                        if nx*dx + ny*dy >= -.01:
                            nx, ny = -dx, -dy
                        angle = math.atan2(ny,nx) + math.asin(np.random.random()*2-1)
                        dx, dy = math.cos(angle), math.sin(angle)
                        wr *= features[i,j,0]
                        wg *= features[i,j,1]
                        wb *= features[i,j,2]
                    else:
                        px, py = qx, qy
                    wr *= .97
                    wg *= .97
                    wb *= .97
    return target


def run(args):
    torch.manual_seed(51)
    torch.set_num_threads(3)
    rng = np.random.default_rng(51)
    dataset = []
    for i in range(36):
        features, source = room(rng, 22)
        dataset.append((features, source, trace(features, source, 128, 16, 700+i)))
    f, src, ref = [torch.tensor(np.stack(t)) for t in zip(*dataset)]
    model = nn.Sequential(nn.Linear(8,88), nn.ReLU(), nn.Linear(88,88),
                          nn.ReLU(), nn.Linear(88,16))
    opt = torch.optim.Adam(model.parameters(), lr=.003)
    eye = torch.eye(4)
    opposite = eye[[1,0,3,2]]
    def loss(indices):
        features, emit, truth = f[indices], src[indices], ref[indices]
        wall = features[..., 5, None, None]
        prior = (1-wall) * (2.9 * eye) + wall * (1.6 * opposite)
        mix = (model(features).reshape(*features.shape[:3],4,4) + prior).softmax(-1)
        gains = features[...,None,:3]
        state = torch.zeros((*features.shape[:3],4,3))
        for _ in range(16):
            incoming = torch.stack([torch.roll(state[..., k,:], (dz,dx), (1,2))
                                    for k,(dx,dz) in enumerate(DIR)],dim=-2)
            # Zero exterior inflow. The browser uses the same open boundary.
            incoming[:,:,0,0] = 0
            incoming[:,:,-1,1] = 0
            incoming[:,0,:,2] = 0
            incoming[:,-1,:,3] = 0
            state = (mix @ incoming) * gains + emit[...,None,:]
        err = ((state.mean(-2).clamp_min(0)+.001).sqrt() -
               (truth.clamp_min(0)+.001).sqrt()).square()
        return (err*(1-wall[...,0])).mean()
    # A tiny offset keeps the derivative finite in dark cells.
    for step in range(args.steps):
        opt.zero_grad()
        ix = torch.randint(0, 30, (4,))
        value = loss(ix)
        value.backward()
        opt.step()
        if step % 40 == 0:
            print(step, float(value.detach()), flush=True)
    with torch.no_grad():
        held_out = float(loss(torch.arange(30,36)))
    layers = [dict(w=m.weight.detach().numpy().round(7).tolist(),
                   b=m.bias.detach().numpy().round(7).tolist())
              for m in model if isinstance(m, nn.Linear)]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    weights = np.concatenate([np.array(a, dtype='<f4').ravel() for m in layers for a in (m['w'],m['b'])])
    weights.tofile(output)
    print(json.dumps(dict(parameters=weights.size, held_out_loss=held_out,
                          training_rooms=30, validation_rooms=6, steps=args.steps)), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--steps', type=int, default=220)
    parser.add_argument('--output', default='public/nca-weights.bin')
    run(parser.parse_args())
