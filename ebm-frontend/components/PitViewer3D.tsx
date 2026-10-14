'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Sliders, Sun, Moon } from 'lucide-react';
import { useEBMStore, BlockData, TopoMesh, DemGrid } from '../store/ebmStore';

function CaptureManager() {
  const { gl, scene, camera } = useThree();
  const setR3fContext = useEBMStore(s => s.setR3fContext);
  
  useEffect(() => {
    // Save refs so InspectorPanel can do manual captures
    setR3fContext({ gl, scene, camera });
    return () => setR3fContext(null);
  }, [gl, scene, camera, setR3fContext]);
  
  return null;
}

function getHeatmapColor(val: number): THREE.Color {
  // val is 0.0 to 1.0 (from Cut-off to Max Grade)
  // Stops: 0=Blue, 0.25=Cyan, 0.5=Green, 0.75=Yellow, 1=Red
  val = Math.max(0, Math.min(1, val));
  
  const stops = [
    { v: 0.0, c: new THREE.Color('#2563eb') }, // Blue 600
    { v: 0.25, c: new THREE.Color('#06b6d4') }, // Cyan 500
    { v: 0.5, c: new THREE.Color('#10b981') }, // Emerald 500
    { v: 0.75, c: new THREE.Color('#f59e0b') }, // Amber 500
    { v: 1.0, c: new THREE.Color('#ef4444') }, // Red 500
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (val >= stops[i].v && val <= stops[i+1].v) {
      const t = (val - stops[i].v) / (stops[i+1].v - stops[i].v);
      return stops[i].c.clone().lerp(stops[i+1].c, t);
    }
  }
  return stops[stops.length - 1].c;
}


function useNormalized(blocks: BlockData[]) {
  const { minX, minY, topoMesh, pitBoundaryPolygons, demGrid } = useEBMStore();
  
  return useMemo(() => {
    let scale = 1;
    let blockSize = 10;
    
    let refMinX = minX || 0;
    let refMinY = minY || 0;
    let midX = 0;
    let midY = 0;
    let midZ = 0;
    let minZVal = 0;
    let maxZVal = 0;

    if (blocks.length > 0) {
      // Single for-loop — safe at any block count, zero extra allocations
      let x0 = blocks[0].Local_X, x1 = x0;
      let y0 = blocks[0].Local_Y, y1 = y0;
      let z0 = blocks[0].Z,       z1 = z0;
      for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.Local_X < x0) x0 = b.Local_X; else if (b.Local_X > x1) x1 = b.Local_X;
        if (b.Local_Y < y0) y0 = b.Local_Y; else if (b.Local_Y > y1) y1 = b.Local_Y;
        if (b.Z       < z0) z0 = b.Z;       else if (b.Z       > z1) z1 = b.Z;
      }
      const minXVal = x0, maxXVal = x1;
      const minYVal = y0, maxYVal = y1;
      minZVal = z0; maxZVal = z1;

      // blockSize: unique X spacing
      const xs = blocks.map((b) => b.Local_X);
      const uniqueX = [...new Set(xs)].sort((a, b) => a - b);
      blockSize = uniqueX.length > 1 ? Math.abs(uniqueX[1] - uniqueX[0]) : 10;

      const rangeX = Math.max(maxXVal - minXVal, 1);
      const rangeY = Math.max(maxYVal - minYVal, 1);
      scale = 50 / Math.max(rangeX, rangeY, 1);

      midX = (minXVal + maxXVal) / 2;
      midY = (minYVal + maxYVal) / 2;
      midZ = (minZVal + maxZVal) / 2;
    } else if (demGrid) {
      const rangeX = demGrid.extent.max_x - demGrid.extent.min_x;
      const rangeY = demGrid.extent.max_y - demGrid.extent.min_y;
      scale = 50 / Math.max(rangeX, rangeY, 1);
      refMinX = demGrid.extent.min_x;
      refMinY = demGrid.extent.min_y;
      midX = (demGrid.extent.min_x + demGrid.extent.max_x) / 2;
      midY = (demGrid.extent.min_y + demGrid.extent.max_y) / 2;
      midZ = (demGrid.extent.min_z + demGrid.extent.max_z) / 2;
      minZVal = demGrid.extent.min_z;
      maxZVal = demGrid.extent.max_z;
    } else if (topoMesh && topoMesh.vertices.length > 0) {
      // for-loop over vertices — topoMesh can also be large
      let x0 = topoMesh.vertices[0][0], x1 = x0;
      let y0 = topoMesh.vertices[0][1], y1 = y0;
      let z0 = topoMesh.vertices[0][2], z1 = z0;
      for (let i = 1; i < topoMesh.vertices.length; i++) {
        const v = topoMesh.vertices[i];
        if (v[0] < x0) x0 = v[0]; else if (v[0] > x1) x1 = v[0];
        if (v[1] < y0) y0 = v[1]; else if (v[1] > y1) y1 = v[1];
        if (v[2] < z0) z0 = v[2]; else if (v[2] > z1) z1 = v[2];
      }
      const minXVal = x0, maxXVal = x1;
      const minYVal = y0, maxYVal = y1;
      minZVal = z0; maxZVal = z1;
      const rangeX = maxXVal - minXVal;
      const rangeY = maxYVal - minYVal;
      scale = 50 / Math.max(rangeX, rangeY, 1);
      refMinX = minXVal;
      refMinY = minYVal;
      midX = (minXVal + maxXVal) / 2;
      midY = (minYVal + maxYVal) / 2;
      midZ = (minZVal + maxZVal) / 2;
    } else if (pitBoundaryPolygons && pitBoundaryPolygons.length > 0) {
      // for-loop over flattened polygon points
      let x0 = Infinity, x1 = -Infinity;
      let y0 = Infinity, y1 = -Infinity;
      for (const ring of pitBoundaryPolygons as number[][][]) {
        for (const p of ring) {
          if (p[0] < x0) x0 = p[0]; else if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1]; else if (p[1] > y1) y1 = p[1];
        }
      }
      const minXVal = x0, maxXVal = x1;
      const minYVal = y0, maxYVal = y1;
      const rangeX = maxXVal - minXVal;
      const rangeY = maxYVal - minYVal;
      scale = 50 / Math.max(rangeX, rangeY, 1);
      refMinX = minXVal;
      refMinY = minYVal;
      midX = (minXVal + maxXVal) / 2;
      midY = (minYVal + maxYVal) / 2;
    }
    
    if (!blocks.length) return { normalized: [], minBev: 0, maxBev: 1, maxGrade: 1, blockSize: blockSize * scale, scale, refMinX, refMinY, midX, midY, midZ, minZVal, maxZVal };
    
    // BEV range — for-loop, no spread
    let minBev = blocks[0].BEV, maxBev = minBev;
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].BEV < minBev) minBev = blocks[i].BEV;
      else if (blocks[i].BEV > maxBev) maxBev = blocks[i].BEV;
    }

    // Max ore grade — for-loop, no spread
    let maxGrade = 0.01;
    for (const b of blocks) {
      if ((b.Destination === 'Ore' || b.Model_Type === 'Ore') && b.Grade > maxGrade) {
        maxGrade = b.Grade;
      }
    }
    if (maxGrade < 0.01) maxGrade = 1;

    // Voxel Precision: ukuran pas dengan rasio 0.995 untuk mencegah Z-fighting tanpa overlap
    const normalized = blocks.map((b) => {
      const bdx = (b.DX || blockSize) * scale;
      const bdy = (b.DY || blockSize) * scale;
      const bdz = (b.DZ || blockSize) * scale;
      return {
        ...b,
        nx: (b.Local_X - midX) * scale,
        ny: (b.Z - midZ) * scale,
        nz: (b.Local_Y - midY) * scale,
        bsX: bdx * 0.995,
        bsY: bdz * 0.995,
        bsZ: bdy * 0.995,
      };
    });
    return { normalized, minBev, maxBev, maxGrade, blockSize: blockSize * scale, scale, refMinX, refMinY, midX, midY, midZ, minZVal, maxZVal };
  }, [blocks, minX, minY, topoMesh, pitBoundaryPolygons, demGrid]);
}

function MinedBlocks({ blocks, clippingZ, clippingX, clippingY, scale, setSelectedBlock }: { blocks: BlockData[]; clippingZ: number; clippingX: number; clippingY: number; scale: number, setSelectedBlock: (b: BlockData) => void }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const { normalized, maxGrade } = useNormalized(blocks);
  const { viewMode, lithologyColors, financialParams, activeShell, nestedPits } = useEBMStore();

  // Derive the active RF from the shell index to filter block visibility
  const activeRF = useMemo(() => {
    if (!nestedPits || nestedPits.length === 0) return Infinity;
    // activeShell is 1-based; 0 means show all
    if (activeShell <= 0) return Infinity;
    const idx = Math.min(activeShell - 1, nestedPits.length - 1);
    return nestedPits[idx]?.rf ?? Infinity;
  }, [activeShell, nestedPits]);

  const visible = useMemo(
    () => normalized.filter((b) => {
      if (b.Z > clippingZ || b.Local_X > clippingX || b.Local_Y > clippingY) return false;
      if (b.MINED_STATUS !== 1) return false;
      // Shell filter: only show blocks whose First_RF <= activeRF
      // Fall back gracefully if First_RF is missing (old API response)
      const firstRF = (b as any).First_RF;
      if (firstRF !== undefined && firstRF !== null && isFinite(activeRF)) {
        return firstRF <= activeRF + 1e-9; // epsilon for float precision
      }
      return true; // no First_RF data → show all (backward compat)
    }),
    [normalized, clippingZ, clippingX, clippingY, activeRF]
  );

  // Read Pushback_Phase directly from backend-assigned field (1, 2, or 3)
  // This replaces the incorrect elevation-chunking approach.
  const phases = useMemo(() => {
    if (viewMode !== 'Pushback Phase') return new Map<any, number>();
    const map = new Map<any, number>();
    visible.forEach((b) => {
      map.set(b, (b as any).Pushback_Phase || 0);
    });
    return map;
  }, [visible, viewMode]);

  useEffect(() => {
    if (!meshRef.current || !visible.length) return;
    const mesh = meshRef.current;
    
    const profitColor = new THREE.Color('#10b981'); // Emerald 500
    const lossColor = new THREE.Color('#ef4444'); // Red 500
    const wasteColor = new THREE.Color('#64748b'); // Slate 500 (Waste / Below Cut-off)

    visible.forEach((b, i) => {
      dummy.position.set(b.nx, b.ny, b.nz);
      dummy.scale.set(b.bsX, b.bsY, b.bsZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      
      let color: THREE.Color;
      if (viewMode === 'Destination') {
        // Gold/Amber = Ore (Pabrik), Slate = Waste (Dump)
        color = b.Destination === 'Ore' ? new THREE.Color('#fbbf24') : wasteColor;
      } else if (viewMode === 'Lithology') {
        color = new THREE.Color(lithologyColors[b.RockType] || '#ffffff');
      } else if (viewMode === 'Economic (BEV)') {
        color = b.BEV > 0 ? profitColor : lossColor;
      } else if (viewMode === 'Pushback Phase') {
        const p = phases.get(b);
        if (p === 1) color = new THREE.Color('#fbbf24'); // Phase 1: Amber
        else if (p === 2) color = new THREE.Color('#f97316'); // Phase 2: Oranye
        else if (p === 3) color = new THREE.Color('#ef4444'); // Phase 3: Merah
        else color = new THREE.Color('#64748b');
      } else {
        // Grade Heatmap: Blok di bawah cut_off_grade atau berstatus Waste diwarnai slate
        const cog = financialParams.cut_off_grade ?? 0.5;
        if (b.Grade < cog || b.Model_Type === 'Waste' || b.Destination === 'Waste') {
          color = wasteColor;
        } else {
          const normGrade = Math.max(0, b.Grade) / maxGrade;
          color = getHeatmapColor(normGrade);
        }
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = visible.length;
  }, [visible, dummy, maxGrade, viewMode, lithologyColors, phases, financialParams]);

  if (!visible.length) return null;
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, visible.length]} 
      renderOrder={2}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) setSelectedBlock(visible[e.instanceId]);
      }}
      onPointerEnter={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerLeave={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.35} metalness={0.08} />
    </instancedMesh>
  );
}

function WasteBlocks({ blocks, clippingZ, clippingX, clippingY, scale, setSelectedBlock }: { blocks: BlockData[]; clippingZ: number; clippingX: number; clippingY: number; scale: number, setSelectedBlock: (b: BlockData) => void }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { normalized } = useNormalized(blocks);
  const { viewMode, lithologyColors, activeShell, nestedPits } = useEBMStore();

  const activeRF = useMemo(() => {
    if (!nestedPits || nestedPits.length === 0) return Infinity;
    if (activeShell <= 0) return Infinity;
    const idx = Math.min(activeShell - 1, nestedPits.length - 1);
    return nestedPits[idx]?.rf ?? Infinity;
  }, [activeShell, nestedPits]);

  const visible = useMemo(
    () => normalized.filter((b) => {
      if (b.Z > clippingZ || b.Local_X > clippingX || b.Local_Y > clippingY) return false;
      
      if (b.MINED_STATUS !== 1) return true; // Truly unmined waste
      
      // If it is mined, but its First_RF > activeRF, it's not in the active shell yet,
      // so we render it as base/waste block to prevent holes/Z-fighting
      const firstRF = (b as any).First_RF;
      if (firstRF !== undefined && firstRF !== null && isFinite(activeRF)) {
        return firstRF > activeRF + 1e-9;
      }
      return false; // It's in the active shell, so don't render it here (MinedBlocks handles it)
    }),
    [normalized, clippingZ, clippingX, clippingY, activeRF]
  );

  useEffect(() => {
    if (!meshRef.current || !visible.length) return;
    const mesh = meshRef.current;
    
    const defaultColor = new THREE.Color('#64748b'); // Slate 500
    const profitColor = new THREE.Color('#10b981'); // Emerald 500
    const lossColor = new THREE.Color('#ef4444'); // Red 500
    
    visible.forEach((b, i) => {
      dummy.position.set(b.nx, b.ny, b.nz);
      dummy.scale.set(b.bsX, b.bsY, b.bsZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      
      let color: THREE.Color;
      if (viewMode === 'Lithology') {
        color = new THREE.Color(lithologyColors[b.RockType] || '#ffffff');
      } else if (viewMode === 'Economic (BEV)') {
        color = b.BEV > 0 ? profitColor : lossColor;
      } else {
        color = defaultColor;
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = visible.length;
  }, [visible, dummy, viewMode, lithologyColors]);

  if (!visible.length) return null;
  const isTransparent = viewMode === 'Grade Heatmap';
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, visible.length]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) setSelectedBlock(visible[e.instanceId]);
      }}
      onPointerEnter={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerLeave={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        roughness={0.65} 
        metalness={0.05} 
        transparent={isTransparent} 
        opacity={isTransparent ? 0.15 : 0.85} 
        depthWrite={!isTransparent} 
        color={isTransparent ? "#64748b" : undefined} 
      />
    </instancedMesh>
  );
}

function TopographyRender({ topoMesh, scale, midX, midY, midZ }: { topoMesh: TopoMesh | null; scale: number; midX: number; midY: number; midZ: number }) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  
  useEffect(() => {
    if (!geometryRef.current || !topoMesh) return;
    
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < topoMesh.vertices.length; i++) {
      const z = topoMesh.vertices[i][2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (minZ === Infinity) { minZ = 0; maxZ = 1; }
    const rangeZ = Math.max(maxZ - minZ, 0.1);

    const flatVertices = new Float32Array(topoMesh.vertices.length * 3);
    const colors = new Float32Array(topoMesh.vertices.length * 3);
    
    const colorLow = new THREE.Color('#388e3c'); // Green
    const colorHigh = new THREE.Color('#8d6e63'); // Brown
    const tempColor = new THREE.Color();

    topoMesh.vertices.forEach((v, i) => {
      flatVertices[i*3] = (v[0] - midX) * scale;
      flatVertices[i*3+1] = (v[2] - midZ) * scale; // Y is elevation
      flatVertices[i*3+2] = (v[1] - midY) * scale; // Z is depth
      
      const t = (v[2] - minZ) / rangeZ;
      tempColor.copy(colorLow).lerp(colorHigh, t);
      colors[i*3] = tempColor.r;
      colors[i*3+1] = tempColor.g;
      colors[i*3+2] = tempColor.b;
    });
    
    const flatIndices = new Uint32Array(topoMesh.faces.length * 3);
    topoMesh.faces.forEach((f, i) => {
      flatIndices[i*3] = f[0];
      flatIndices[i*3+1] = f[1];
      flatIndices[i*3+2] = f[2];
    });
    
    geometryRef.current.setAttribute('position', new THREE.BufferAttribute(flatVertices, 3));
    geometryRef.current.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current.setIndex(new THREE.BufferAttribute(flatIndices, 1));
    geometryRef.current.computeVertexNormals();
  }, [topoMesh, midX, midY, midZ, scale]);

  if (!topoMesh) return null;

  return (
    <group>
      <mesh>
        <bufferGeometry ref={geometryRef} />
        <meshStandardMaterial vertexColors={true} side={THREE.DoubleSide} roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh>
        <bufferGeometry ref={geometryRef} />
        <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PitBoundaryRender({ polygons, scale, midX, midY, minZVal, midZ }: { polygons: number[][][]; scale: number; midX: number; midY: number; minZVal: number; midZ: number }) {
  if (!polygons || polygons.length === 0) return null;

  return (
    <group>
      {polygons.map((ring, i) => {
        const points = ring.map(pt => {
          return new THREE.Vector3(
            (pt[0] - midX) * scale,
            (minZVal - midZ) * scale + 0.15,
            (pt[1] - midY) * scale
          );
        });
        if (points.length > 0 && !points[0].equals(points[points.length - 1])) {
          points.push(points[0].clone());
        }
        
        return (
          <Line
            key={i}
            points={points}
            color="#fbbf24" // amber-400
            lineWidth={3.5}
            dashed={true}
            dashSize={2}
            gapSize={1}
            depthTest={false}
            renderOrder={999}
          />
        );
      })}
    </group>
  );
}

function DemRender({ demGrid, scale, midX, midY, midZ }: { demGrid: DemGrid; scale: number; midX: number; midY: number; midZ: number }) {
  const geometryRef = useRef<THREE.PlaneGeometry>(null);

  const width = (demGrid.extent.max_x - demGrid.extent.min_x) * scale;
  const depth = (demGrid.extent.max_y - demGrid.extent.min_y) * scale;
  
  useEffect(() => {
    if (!geometryRef.current || !(demGrid as any).elevation_grid) return;
    const geometry = geometryRef.current;
    const positionAttribute = geometry.attributes.position;
    
    const rangeZ = Math.max(demGrid.extent.max_z - demGrid.extent.min_z, 0.1);
    const colors = new Float32Array(positionAttribute.count * 3);
    const colorLow = new THREE.Color('#059669'); // Emerald 600
    const colorHigh = new THREE.Color('#b45309'); // Amber 700
    const tempColor = new THREE.Color();
    
    let vertexIdx = 0;
    const elevGrid = (demGrid as any).elevation_grid;
    for (let r = 0; r < demGrid.rows; r++) {
      for (let c = 0; c < demGrid.cols; c++) {
        let elev = elevGrid[r][c];
        if (elev === null || isNaN(elev)) elev = demGrid.extent.min_z;
        
        const scaledZ = (elev - midZ) * scale;
        positionAttribute.setZ(vertexIdx, scaledZ);
        
        const t = (elev - demGrid.extent.min_z) / rangeZ;
        tempColor.copy(colorLow).lerp(colorHigh, t);
        colors[vertexIdx*3] = tempColor.r;
        colors[vertexIdx*3+1] = tempColor.g;
        colors[vertexIdx*3+2] = tempColor.b;
        
        vertexIdx++;
      }
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;
  }, [demGrid, scale, midZ]);

  const rawCenterX = (demGrid as any).center_x ?? ((demGrid.extent.min_x + demGrid.extent.max_x) / 2);
  const rawCenterY = (demGrid as any).center_y ?? ((demGrid.extent.min_y + demGrid.extent.max_y) / 2);
  const centerX = (rawCenterX - midX) * scale;
  const centerZ = (rawCenterY - midY) * scale;

  return (
    <group position={[centerX, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <planeGeometry ref={geometryRef} args={[width, depth, demGrid.cols - 1, demGrid.rows - 1]} />
        <meshStandardMaterial vertexColors={true} side={THREE.DoubleSide} roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh>
        <planeGeometry args={[width, depth, demGrid.cols - 1, demGrid.rows - 1]} />
        <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Renders the outer hull of all mined blocks as a glowing wireframe pit shell
function PitShellRender({ blocks, scale }: { blocks: BlockData[]; scale: number }) {
  const { normalized } = useNormalized(blocks);

  const minedNorm = useMemo(() => normalized.filter(b => b.MINED_STATUS === 1), [normalized]);

  const shellGeometry = useMemo(() => {
    if (minedNorm.length === 0) return null;

    let minY = Infinity;
    const colMap = new Map<string, number>();
    for (let i = 0; i < minedNorm.length; i++) {
      const b = minedNorm[i];
      if (b.ny < minY) minY = b.ny;
      const key = `${b.nx.toFixed(2)},${b.nz.toFixed(2)}`;
      const cur = colMap.get(key);
      if (cur === undefined || b.ny > cur) colMap.set(key, b.ny);
    }
    if (minY === Infinity) minY = 0;

    const positions: number[] = [];
    const indices: number[] = [];
    let idx = 0;

    const bsX = minedNorm[0]?.bsX ?? 1;
    const bsZ = minedNorm[0]?.bsZ ?? 1;

    for (const [key, topY] of colMap.entries()) {
      const [nx, nz] = key.split(',').map(Number);
      positions.push(nx - bsX/2, minY, nz - bsZ/2);
      positions.push(nx + bsX/2, minY, nz - bsZ/2);
      positions.push(nx + bsX/2, minY, nz + bsZ/2);
      positions.push(nx - bsX/2, minY, nz + bsZ/2);
      positions.push(nx - bsX/2, topY + bsX/2, nz - bsZ/2);
      positions.push(nx + bsX/2, topY + bsX/2, nz - bsZ/2);
      positions.push(nx + bsX/2, topY + bsX/2, nz + bsZ/2);
      positions.push(nx - bsX/2, topY + bsX/2, nz + bsZ/2);
      const b = idx * 8;
      indices.push(b, b+4, b+5, b, b+5, b+1);
      indices.push(b+3, b+7, b+6, b+3, b+6, b+2);
      indices.push(b, b+7, b+3, b, b+4, b+7);
      indices.push(b+1, b+5, b+6, b+1, b+6, b+2);
      indices.push(b+4, b+6, b+5, b+4, b+7, b+6);
      idx++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [minedNorm]);

  if (!shellGeometry) return null;

  return (
    <group>
      <mesh geometry={shellGeometry}>
        <meshStandardMaterial color="#f59e0b" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh geometry={shellGeometry}>
        <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SceneContent() {
  const { pitBlocks, topoMesh, demGrid, clippingZ, clippingX, clippingY, layerVisibility, setSelectedBlock, pitBoundaryPolygons, canvasTheme } = useEBMStore();
  const { scale, midX, midY, midZ, minZVal } = useNormalized(pitBlocks);
  const isDark = canvasTheme !== 'light';
  
  return (
    <>
      {/* Studio Lighting Setup (Dark & Light Mode Aware) */}
      <hemisphereLight args={[isDark ? '#38bdf8' : '#ffffff', isDark ? '#020617' : '#cbd5e1', isDark ? 0.55 : 0.7]} />
      <directionalLight position={[120, 180, 100]} intensity={isDark ? 1.35 : 1.15} color={isDark ? '#fffaf0' : '#ffffff'} />
      <directionalLight position={[-100, 80, -90]} intensity={isDark ? 0.65 : 0.45} color={isDark ? '#7dd3fc' : '#e2e8f0'} />
      <directionalLight position={[-60, -50, 120]} intensity={isDark ? 0.3 : 0.25} color={isDark ? '#94a3b8' : '#cbd5e1'} />

      {layerVisibility.blockModel && layerVisibility.wasteBlocks && <WasteBlocks blocks={pitBlocks} clippingZ={clippingZ} clippingX={clippingX} clippingY={clippingY} scale={scale} setSelectedBlock={setSelectedBlock} />}
      {layerVisibility.blockModel && layerVisibility.pitShell && <MinedBlocks blocks={pitBlocks} clippingZ={clippingZ} clippingX={clippingX} clippingY={clippingY} scale={scale} setSelectedBlock={setSelectedBlock} />}
      {layerVisibility.pitShellWireframe && pitBlocks.length > 0 && <PitShellRender blocks={pitBlocks} scale={scale} />}
      {layerVisibility.topography && topoMesh && <TopographyRender topoMesh={topoMesh} scale={scale} midX={midX} midY={midY} midZ={midZ} />}
      {layerVisibility.topography && demGrid && <DemRender demGrid={demGrid} scale={scale} midX={midX} midY={midY} midZ={midZ} />}
      {layerVisibility.pitBoundary && pitBoundaryPolygons && pitBoundaryPolygons.length > 0 && (
        <PitBoundaryRender polygons={pitBoundaryPolygons} scale={scale} midX={midX} midY={midY} minZVal={minZVal} midZ={midZ} />
      )}

      {/* Ground Plane Grid */}
      <Grid
        args={[240, 240]}
        cellSize={4}
        cellThickness={0.5}
        cellColor={isDark ? '#1e293b' : '#e2e8f0'}
        sectionSize={20}
        sectionThickness={1.2}
        sectionColor={isDark ? '#334155' : '#cbd5e1'}
        fadeDistance={180}
        fadeStrength={1.5}
        position={[0, (minZVal - midZ) * scale - 0.5, 0]}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#f43f5e', '#10b981', '#38bdf8']} labelColor={isDark ? '#ffffff' : '#1e293b'} />
      </GizmoHelper>
    </>
  );
}

function EmptyScene() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { canvasTheme } = useEBMStore();
  const isDark = canvasTheme !== 'light';

  useFrame((_, delta) => {
    meshRef.current.rotation.y += delta * 0.3;
    meshRef.current.rotation.x += delta * 0.1;
  });
  return (
    <>
      <hemisphereLight args={[isDark ? '#38bdf8' : '#ffffff', isDark ? '#020617' : '#cbd5e1', 0.8]} />
      <directionalLight position={[15, 20, 15]} intensity={1.3} color={isDark ? '#60a5fa' : '#3b82f6'} />
      <mesh ref={meshRef}>
        <octahedronGeometry args={[3, 0]} />
        <meshStandardMaterial color={isDark ? '#3b82f6' : '#2563eb'} wireframe roughness={0.2} metalness={0.8} />
      </mesh>
      <Grid
        args={[80, 80]}
        cellSize={4}
        cellThickness={0.5}
        cellColor={isDark ? '#1e293b' : '#e2e8f0'}
        sectionSize={20}
        sectionThickness={1.0}
        sectionColor={isDark ? '#334155' : '#cbd5e1'}
        fadeDistance={60}
        position={[0, -4, 0]}
      />
      <OrbitControls 
        makeDefault 
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
}

export default function PitViewer3D() {
  const {
    pitBlocks, topoMesh, demGrid, pitBoundaryPolygons, isLoading,
    viewMode, setViewMode, showCanvas, lithologyColors, nestedPits,
    selectedBlock, setSelectedBlock, originX, originY, originZ, financialParams,
    clippingZ, setClippingZ, clippingX, setClippingX, clippingY, setClippingY,
    minZ, maxZ, minX, maxX, minY, maxY,
    activeTab,
    canvasTheme, setCanvasTheme
  } = useEBMStore();
  const [isSlicerOpen, setIsSlicerOpen] = useState(false);
  const fmt = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(v);
  const hasData = pitBlocks.length > 0 || topoMesh !== null || demGrid !== null || (pitBoundaryPolygons && pitBoundaryPolygons.length > 0);
  const isDark = canvasTheme !== 'light';

  if (!showCanvas) return <div className="flex-1 bg-black"></div>;

  const maxGrade = useMemo(() => {
    let max = 0.01;
    for (let i = 0; i < pitBlocks.length; i++) {
      const b = pitBlocks[i];
      if ((b.Destination === 'Ore' || b.Model_Type === 'Ore') && b.Grade > max) {
        max = b.Grade;
      }
    }
    return max;
  }, [pitBlocks]);

  return (
    <div className={`flex-1 relative overflow-hidden select-none transition-colors duration-300 ${isDark ? 'bg-[#080b11]' : 'bg-[#F8FAFC]'}`}>
      {!hasData && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div className={`p-4 rounded-2xl border backdrop-blur-md text-center max-w-sm ${isDark ? 'bg-[#0b0f19]/60 border-white/5' : 'bg-white/80 border-gray-200 shadow-md'}`}>
            <p className={`text-xs font-bold tracking-widest uppercase font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Workspace Pit 3D</p>
            <p className={`text-[11px] mt-1 font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Upload model blok atau topografi di panel kiri untuk memulai simulasi</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-20 backdrop-blur-md ${isDark ? 'bg-[#080b11]/80' : 'bg-white/80'}`}>
          <div className="w-14 h-14 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
          <p className="text-indigo-500 font-bold text-xs tracking-widest font-mono">MEMPROSES MODEL BLOK...</p>
        </div>
      )}

      {/* Theme Toggle Button (Dark / White Mode) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setCanvasTheme(isDark ? 'light' : 'dark')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-xl cursor-pointer border ${
            isDark
              ? 'bg-[#0b0f19]/85 text-gray-200 border-white/10 hover:border-amber-400/50 hover:text-amber-300'
              : 'bg-white/90 text-gray-700 border-gray-200/90 hover:border-indigo-400/50 hover:text-indigo-600 shadow-md'
          }`}
          title={isDark ? 'Beralih ke background Putih (White Canvas)' : 'Beralih ke background Hitam (Dark Canvas)'}
        >
          {isDark ? (
            <>
              <Sun size={13} className="text-amber-400" />
              <span>Background: Gelap</span>
            </>
          ) : (
            <>
              <Moon size={13} className="text-indigo-600" />
              <span>Background: Putih</span>
            </>
          )}
        </button>
      </div>

      {/* Block count badge */}
      {pitBlocks.length > 0 && (
        <div className={`absolute top-4 left-4 z-10 backdrop-blur-md border shadow-2xl rounded-xl px-3.5 py-2 ${isDark ? 'bg-[#0b0f19]/85 border-white/10 text-gray-200' : 'bg-white/90 border-gray-200/90 text-gray-700 shadow-md'}`}>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-emerald-500 font-bold">{pitBlocks.filter((b) => b.MINED_STATUS === 1).length.toLocaleString()}</span>
            <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>/</span>
            <span className={`font-bold ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{pitBlocks.length.toLocaleString()}</span>
            <span className={`font-sans text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>blok ditambang</span>
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      {pitBlocks.length > 0 && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 backdrop-blur-md border shadow-2xl rounded-xl p-1 flex gap-1 ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          {(['Destination', 'Grade Heatmap', 'Economic (BEV)', 'Lithology', 'Pushback Phase'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === mode
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/30'
                  : isDark
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      {/* Floating Block Inspector Card */}
      {selectedBlock && (
        <div className={`absolute top-16 right-4 z-20 w-72 backdrop-blur-md border rounded-xl shadow-2xl p-3.5 text-xs ${isDark ? 'bg-[#0b0f19]/90 border-white/10 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
          <div className={`flex items-center justify-between pb-2 mb-2.5 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              <span className="w-2 h-2 rounded-full bg-pink-400"></span>
              <span>Inspeksi Blok #{selectedBlock.ID ?? ''}</span>
            </div>
            <button
              onClick={() => setSelectedBlock(null)}
              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer text-xs ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            >
              ✕
            </button>
          </div>
          <div className="space-y-2">
            <div className={`p-2 rounded-lg border text-[11px] font-mono space-y-1 ${isDark ? 'bg-[#121826]/80 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex justify-between text-gray-400"><span>X (UTM):</span><span className={`font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{((selectedBlock.Local_X ?? selectedBlock.X) + originX).toLocaleString('id-ID')}</span></div>
              <div className="flex justify-between text-gray-400"><span>Y (UTM):</span><span className={`font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{((selectedBlock.Local_Y ?? selectedBlock.Y) + originY).toLocaleString('id-ID')}</span></div>
              <div className="flex justify-between text-gray-400"><span>Z (Elev):</span><span className={`font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>{(selectedBlock.Z + originZ).toLocaleString('id-ID')} m</span></div>
            </div>
            <div className={`p-2 rounded-lg border text-[11px] font-mono space-y-1 ${isDark ? 'bg-[#121826]/80 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex justify-between"><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Kadar:</span><span className="text-yellow-500 font-bold">{selectedBlock.Grade?.toFixed(3)} {financialParams.grade_unit === 'percent' ? '%' : 'g/t'}</span></div>
              <div className="flex justify-between"><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Litologi:</span><span className={isDark ? 'text-gray-200' : 'text-gray-800'}>{selectedBlock.RockType || '-'}</span></div>
              <div className="flex justify-between"><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>BEV:</span><span className={`font-bold ${selectedBlock.BEV >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{financialParams.currency || 'IDR'} {new Intl.NumberFormat('id-ID').format(selectedBlock.BEV)}</span></div>
              <div className="flex justify-between"><span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Status:</span><span className={`font-bold ${selectedBlock.MINED_STATUS === 1 ? 'text-emerald-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>{selectedBlock.MINED_STATUS === 1 ? 'DITAMBANG' : 'TIDAK'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Destination Legend */}
      {pitBlocks.length > 0 && viewMode === 'Destination' && (
        <div className={`absolute top-16 left-4 z-10 backdrop-blur-md border rounded-xl p-3 shadow-2xl w-52 transition-opacity ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Material Destination</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#fbbf24] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Pabrik (Ore)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#64748b] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Dump (Waste)</span>
            </div>
          </div>
        </div>
      )}

      {/* Grade Legend */}
      {pitBlocks.length > 0 && viewMode === 'Grade Heatmap' && (
        <div className={`absolute top-16 left-4 z-10 backdrop-blur-md border rounded-xl p-3 shadow-2xl w-52 transition-opacity ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Grade Scale (Ore)</p>
          <div className="h-2.5 w-full rounded bg-gradient-to-r from-blue-600 via-cyan-500 via-emerald-500 via-amber-500 to-red-500 mb-1"></div>
          <div className={`flex justify-between text-[10px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <span>Low</span>
            <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>High ({maxGrade.toFixed(2)})</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-3 h-3 bg-[#64748b] opacity-60 rounded-sm border ${isDark ? 'border-white/10' : 'border-gray-300'}`}></div>
            <span className={`text-[10px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Waste / Below Cut-off</span>
          </div>
        </div>
      )}

      {/* BEV Legend */}
      {pitBlocks.length > 0 && viewMode === 'Economic (BEV)' && (
        <div className={`absolute top-16 left-4 z-10 backdrop-blur-md border rounded-xl p-3 shadow-2xl w-52 transition-opacity ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Economic Value</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#10b981] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Profit (BEV &gt; 0)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#ef4444] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Loss (BEV &le; 0)</span>
            </div>
          </div>
        </div>
      )}

      {/* Pushback Phase Legend */}
      {pitBlocks.length > 0 && viewMode === 'Pushback Phase' && (
        <div className={`absolute top-16 left-4 z-10 backdrop-blur-md border rounded-xl p-3 shadow-2xl w-52 transition-opacity ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Pushback Phase</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#fbbf24] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Tahun 1 (Top)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#f97316] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Tahun 2 (Mid)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#ef4444] rounded-sm shadow-sm"></div>
              <span className={`text-[10px] font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Tahun 3 (Bottom)</span>
            </div>
          </div>
        </div>
      )}

      {/* Lithology Legend */}
      {pitBlocks.length > 0 && viewMode === 'Lithology' && (
        <div className={`absolute top-16 left-4 z-10 backdrop-blur-md border rounded-xl p-3 shadow-2xl w-52 max-h-60 overflow-y-auto custom-scrollbar transition-opacity ${isDark ? 'bg-[#0b0f19]/85 border-white/10' : 'bg-white/90 border-gray-200 shadow-md'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Domain Litologi</p>
          <div className="flex flex-col gap-2">
            {Object.keys(lithologyColors).length > 0 ? (
              Object.entries(lithologyColors).map(([litho, color]: [string, string]) => (
                <div key={litho} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shadow-sm shrink-0" style={{ backgroundColor: color }}></div>
                  <span className={`text-[10px] font-mono truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{litho}</span>
                </div>
              ))
            ) : (
              <span className={`text-[10px] italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Tidak ada litologi khusus</span>
            )}
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-4 text-[10px] font-mono backdrop-blur-md border px-4 py-1.5 rounded-full shadow-lg pointer-events-none ${isDark ? 'bg-[#0b0f19]/70 border-white/10 text-gray-400' : 'bg-white/80 border-gray-200 text-gray-600'}`}>
        <span>🖱 Klik Kiri: Rotate</span>
        <span>•</span>
        <span>⚙ Scroll: Zoom</span>
        <span>•</span>
        <span>✋ Klik Tengah/Kanan: Pan</span>
      </div>

      {/* 3D Slicer / Cross-Section Widget */}
      {pitBlocks.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end">
          {isSlicerOpen ? (
            <div className={`w-72 backdrop-blur-md border rounded-xl shadow-2xl p-3.5 text-xs space-y-3 ${isDark ? 'bg-[#0b0f19]/95 border-white/10 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
              <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  <Sliders size={14} className="text-indigo-400" />
                  <span>3D Slicer (Cross-Section)</span>
                </div>
                <button
                  onClick={() => setIsSlicerOpen(false)}
                  className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer text-xs ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
                  title="Tutup Slicer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {/* Z Slicer */}
                <div>
                  <div className={`flex justify-between text-[11px] mb-1 font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className="text-indigo-500 font-bold">Z (Elevasi)</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>{clippingZ > 9990 ? 'No Clip' : fmt(clippingZ) + ' m'}</span>
                  </div>
                  <input
                    type="range"
                    min={minZ}
                    max={maxZ}
                    value={clippingZ > 9990 ? maxZ : clippingZ}
                    onChange={(e) => setClippingZ(parseFloat(e.target.value))}
                    className={`w-full accent-indigo-500 h-1.5 rounded-lg appearance-none cursor-pointer ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}
                  />
                  <div className={`flex justify-between text-[10px] font-mono mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span>{fmt(minZ)} m</span>
                    <span>{fmt(maxZ)} m</span>
                  </div>
                </div>

                {/* X Slicer */}
                <div>
                  <div className={`flex justify-between text-[11px] mb-1 font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className="text-rose-500 font-bold">X (Timur-Barat)</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>{clippingX > 9990 ? 'No Clip' : fmt(clippingX) + ' m'}</span>
                  </div>
                  <input
                    type="range"
                    min={minX}
                    max={maxX}
                    value={clippingX > 9990 ? maxX : clippingX}
                    onChange={(e) => setClippingX(parseFloat(e.target.value))}
                    className={`w-full accent-rose-500 h-1.5 rounded-lg appearance-none cursor-pointer ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}
                  />
                  <div className={`flex justify-between text-[10px] font-mono mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span>{fmt(minX)} m</span>
                    <span>{fmt(maxX)} m</span>
                  </div>
                </div>

                {/* Y Slicer */}
                <div>
                  <div className={`flex justify-between text-[11px] mb-1 font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className="text-emerald-500 font-bold">Y (Utara-Selatan)</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>{clippingY > 9990 ? 'No Clip' : fmt(clippingY) + ' m'}</span>
                  </div>
                  <input
                    type="range"
                    min={minY}
                    max={maxY}
                    value={clippingY > 9990 ? maxY : clippingY}
                    onChange={(e) => setClippingY(parseFloat(e.target.value))}
                    className={`w-full accent-emerald-500 h-1.5 rounded-lg appearance-none cursor-pointer ${isDark ? 'bg-[#1e293b]' : 'bg-gray-200'}`}
                  />
                  <div className={`flex justify-between text-[10px] font-mono mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span>{fmt(minY)} m</span>
                    <span>{fmt(maxY)} m</span>
                  </div>
                </div>

                {/* Reset button */}
                <button
                  onClick={() => {
                    setClippingZ(9999);
                    setClippingX(9999);
                    setClippingY(9999);
                  }}
                  className={`w-full text-[10px] font-semibold border rounded-lg py-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? 'text-gray-300 hover:text-white border-white/10 hover:border-white/30 bg-[#121826]/80'
                      : 'text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Reset Semua Slicer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsSlicerOpen(true)}
              className={`flex items-center gap-2 border rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all cursor-pointer text-xs font-semibold ${
                isDark
                  ? 'bg-[#0b0f19]/85 hover:bg-[#121826] text-gray-200 border-white/10 hover:border-indigo-500/50'
                  : 'bg-white/90 hover:bg-gray-100 text-gray-700 border-gray-200 hover:border-indigo-400/50 shadow-md'
              }`}
            >
              <Sliders size={14} className="text-indigo-400" />
              <span>3D Slicer (XYZ)</span>
              {(clippingZ <= 9990 || clippingX <= 9990 || clippingY <= 9990) && (
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              )}
            </button>
          )}
        </div>
      )}

      <Canvas
        camera={{ position: [50, 40, 50], fov: 45, near: 0.5, far: 2000 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: isDark ? 1.15 : 1.0,
        }}
        dpr={[1, 2]}
        frameloop={activeTab === 'workspace' ? 'always' : 'never'}
      >
        <CaptureManager />
        <color attach="background" args={[isDark ? '#080b11' : '#F8FAFC']} />
        <fog attach="fog" args={[isDark ? '#080b11' : '#F8FAFC', isDark ? 120 : 140, isDark ? 360 : 420]} />
        {hasData ? <SceneContent /> : <EmptyScene />}
      </Canvas>
    </div>
  );
}
