import numpy as np
import math

def get_offsets(dx, dy, dz, osa, nz):
    osa_rad = math.radians(osa)
    tan_osa = math.tan(osa_rad)
    offsets = set()
    for k in range(1, nz):
        r = (k * dz) / tan_osa + 1e-9
        max_di = int(r / dx) + 1
        max_dj = int(r / dy) + 1
        for di in range(-max_di, max_di + 1):
            for dj in range(-max_dj, max_dj + 1):
                if math.hypot(di * dx, dj * dy) <= r:
                    offsets.add((di, dj, k))
    return offsets

def transitive_reduction(offsets):
    reduced = set(offsets)
    original = set(offsets)
    for o in original:
        # Try to find if o can be formed by o1 + o2 where o1, o2 in original
        # o = (di, dj, dk)
        # o1 = (di1, dj1, dk1), o2 = (di2, dj2, dk2)
        # dk1 + dk2 = dk
        can_reduce = False
        for o1 in original:
            if o1 == o: continue
            di1, dj1, dk1 = o1
            if dk1 >= o[2]: continue
            
            o2 = (o[0] - di1, o[1] - dj1, o[2] - dk1)
            if o2 in original:
                can_reduce = True
                break
        if can_reduce:
            reduced.remove(o)
    return reduced

osa_list = [30, 35, 45, 50, 60]
for osa in osa_list:
    off = get_offsets(10, 10, 10, osa, 10)
    red = transitive_reduction(off)
    print(f"OSA {osa}: Full={len(off)}, Reduced={len(red)}")

