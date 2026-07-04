/**
 * DependencyGraph3D — the persistent 3D scene for the landing page.
 *
 * Implemented imperatively via useEffect + THREE.js objects added directly to
 * the scene, rather than declarative R3F JSX. This avoids the @react-three/fiber
 * JSX namespace resolution issue with TanStack Start's tsconfig environment.
 *
 * Camera choreography is driven by scrollProgress (0–1), not ScrollTrigger.
 */
"use client";

import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── scene data ──────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "customer_id", isLeakage: true },
  { id: "age",         isLeakage: false },
  { id: "experience",  isLeakage: false },
  { id: "department",  isLeakage: false },
  { id: "city",        isLeakage: false },
  { id: "rating",      isLeakage: false },
  { id: "salary",      isLeakage: false },
  { id: "missing_pct", isLeakage: false },
  { id: "variance",    isLeakage: false },
  { id: "completeness",isLeakage: false },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6],
  [5, 6], [6, 7], [7, 8], [8, 9], [0, 5], [1, 6], [2, 7],
];

const TRUST_COLORS = [
  "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899",
  "#06b6d4", "#f97316", "#84cc16", "#e11d48", "#7c3aed",
];

const SHAP_IMPORTANCE = [6, 5.2, 4.8, 4.1, 3.5, 2.9, 2.1, 1.8, 1.2, 0.7];

// ─── camera keyframes ─────────────────────────────────────────────────────────

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

const CAM: CameraState[] = [
  { position: [0, 0, 18],  target: [0, 0, 0],   fov: 60 },
  { position: [0, 4, 12],  target: [0, 0, 0],   fov: 52 },
  { position: [5, 2, 9],   target: [0, 0, 0],   fov: 48 },
  { position: [0, 8, 20],  target: [0, 0, 0],   fov: 55 },
  { position: [-5, 3, 7],  target: [-2, 0, 0],  fov: 44 },
  { position: [0, 2, 22],  target: [0, 0, 0],   fov: 58 },
  { position: [0, 0, 26],  target: [0, 0, 0],   fov: 60 },
];

const CAM_T = [0, 0.15, 0.35, 0.55, 0.75, 0.90, 1.0];

// Smootherstep — approximates cubic-bezier(0.22, 1, 0.36, 1)
function smootherstep(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpCam(t: number): CameraState {
  let i = 0;
  for (let k = 0; k < CAM_T.length - 1; k++) {
    if (t >= CAM_T[k] && t <= CAM_T[k + 1]) { i = k; break; }
  }
  i = Math.min(i, CAM.length - 2);
  const raw = (t - CAM_T[i]) / (CAM_T[i + 1] - CAM_T[i] || 0.001);
  const alpha = Math.max(0, Math.min(1, raw));
  const ea = smootherstep(alpha);
  const s = CAM[i], e = CAM[i + 1];
  return {
    position: [
      s.position[0] + (e.position[0] - s.position[0]) * ea,
      s.position[1] + (e.position[1] - s.position[1]) * ea,
      s.position[2] + (e.position[2] - s.position[2]) * ea,
    ],
    target: [
      s.target[0] + (e.target[0] - s.target[0]) * ea,
      s.target[1] + (e.target[1] - s.target[1]) * ea,
      s.target[2] + (e.target[2] - s.target[2]) * ea,
    ],
    fov: s.fov + (e.fov - s.fov) * ea,
  };
}

// ─── node position formations ─────────────────────────────────────────────────

function heroPositions(): THREE.Vector3[] {
  return COLUMNS.map((_, i) => {
    const angle = (i / COLUMNS.length) * Math.PI * 2;
    const r = 3.5 + (i % 3) * 1.2;
    return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle * 0.7) * 1.5, Math.sin(angle) * r * 0.6);
  });
}

function trustPositions(): THREE.Vector3[] {
  return COLUMNS.map((_, i) => {
    const angle = (i / COLUMNS.length) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 4.5, 0, Math.sin(angle) * 4.5);
  });
}

function shapPositions(): THREE.Vector3[] {
  const sorted = COLUMNS.map((c, i) => ({ ...c, importance: SHAP_IMPORTANCE[i], origIdx: i }));
  sorted.sort((a, b) => b.importance - a.importance);
  const positions: THREE.Vector3[] = new Array(COLUMNS.length);
  sorted.forEach((node, rank) => {
    positions[node.origIdx] = new THREE.Vector3(
      -6 + rank * 1.4,
      node.importance * 0.4 - 2,
      0
    );
  });
  return positions;
}

function anomalyPositions(): THREE.Vector3[] {
  const base = heroPositions();
  base[0] = new THREE.Vector3(-6, 3, -2);
  return base;
}

function getNodePositions(t: number): THREE.Vector3[] {
  const heroPos  = heroPositions();
  const trustPos = trustPositions();
  const shapPos  = shapPositions();
  const anomPos  = anomalyPositions();

  if (t < 0.15) return heroPos;
  if (t < 0.35) {
    const a = smootherstep((t - 0.15) / 0.20);
    return heroPos.map((p, i) => p.clone().lerp(trustPos[i], a));
  }
  if (t < 0.55) return trustPos;
  if (t < 0.75) {
    const a = smootherstep((t - 0.55) / 0.20);
    return trustPos.map((p, i) => p.clone().lerp(shapPos[i], a));
  }
  if (t < 0.90) {
    const a = smootherstep((t - 0.75) / 0.15);
    return shapPos.map((p, i) => p.clone().lerp(anomPos[i], a));
  }
  const a = smootherstep((t - 0.90) / 0.10);
  return anomPos.map((p, i) => p.clone().lerp(heroPos[i], a));
}

// ─── main component ───────────────────────────────────────────────────────────

export interface DependencyGraph3DProps {
  scrollProgress: number;
  isWireframe?: boolean;
  visibleNodeCount?: number;
  edgeProgress?: number;
}

export function DependencyGraph3D({
  scrollProgress,
  isWireframe = false,
  visibleNodeCount = COLUMNS.length,
  edgeProgress = 1,
}: DependencyGraph3DProps) {
  const { scene, camera } = useThree();
  const timeRef = useRef(0);

  // Refs to imperative Three objects
  const meshesRef  = useRef<THREE.Mesh[]>([]);
  const edgesRef   = useRef<THREE.Line[]>([]);
  const lightsRef  = useRef<THREE.Light[]>([]);
  const groupRef   = useRef<THREE.Group | null>(null);

  // Build scene imperatively once
  useEffect(() => {
    const group = new THREE.Group();
    groupRef.current = group;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    const point1  = new THREE.PointLight(0xffffff, 0.8);
    point1.position.set(10, 10, 10);
    const point2  = new THREE.PointLight(0x3b82f6, 0.4);
    point2.position.set(-8, -4, 6);
    group.add(ambient, point1, point2);
    lightsRef.current = [ambient, point1, point2];

    // Nodes
    const meshes: THREE.Mesh[] = [];
    COLUMNS.forEach((col, i) => {
      const color = col.isLeakage ? "#f59e0b" : TRUST_COLORS[i % TRUST_COLORS.length];
      const geo  = new THREE.SphereGeometry(0.22, 16, 16);
      const mat  = new THREE.MeshStandardMaterial({
        color,
        emissive: col.isLeakage ? "#f59e0b" : color,
        emissiveIntensity: col.isLeakage ? 0.4 : 0.05,
        roughness: 0.4,
        metalness: 0.6,
        wireframe: isWireframe,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(col.isLeakage ? 1.4 : 1);
      group.add(mesh);
      meshes.push(mesh);
    });
    meshesRef.current = meshes;

    // Edges
    const edges: THREE.Line[] = [];
    EDGES.forEach(([a, b]) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: "#334155",
        transparent: true,
        opacity: 0.35,
      });
      const line = new THREE.Line(geo, mat);
      group.add(line);
      edges.push(line);
    });
    edgesRef.current = edges;

    scene.add(group);

    return () => {
      scene.remove(group);
      meshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      edges.forEach((e) => { e.geometry.dispose(); (e.material as THREE.Material).dispose(); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, isWireframe]);

  // Update every frame
  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = scrollProgress;

    // Camera
    const camState = lerpCam(t);
    const camTargetVec = new THREE.Vector3(...camState.target);
    camera.position.lerp(new THREE.Vector3(...camState.position), delta * 6);
    camera.lookAt(camTargetVec);
    const perspCam = camera as THREE.PerspectiveCamera;
    if (perspCam.fov) {
      perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, camState.fov, delta * 6);
      perspCam.updateProjectionMatrix();
    }

    // Node positions
    const nodePositions = getNodePositions(t);
    const isLeakageSection = t >= 0.35 && t < 0.55;
    const leakageAlpha = Math.max(0, Math.min(1, (t - 0.35) / 0.05));

    meshesRef.current.forEach((mesh, i) => {
      if (i >= visibleNodeCount) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.lerp(nodePositions[i], delta * 4);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      const col = COLUMNS[i];
      if (col.isLeakage) {
        // Pulsing amber emissive
        const pulse = 0.5 + 0.5 * Math.sin(timeRef.current * 3.5);
        const isSevered = isLeakageSection && leakageAlpha > 0.5;
        mat.emissiveIntensity = isSevered ? 0.1 : 0.3 + pulse * 0.7;
        mat.opacity = isSevered ? 0.3 : 1;
        mat.transparent = isSevered;
      }
    });

    // Edge positions
    edgesRef.current.forEach((edge, idx) => {
      const [a, b] = EDGES[idx];
      if (a >= visibleNodeCount || b >= visibleNodeCount) {
        edge.visible = false;
        return;
      }
      const progress = Math.min(1, edgeProgress * EDGES.length - idx);
      if (progress <= 0) { edge.visible = false; return; }
      edge.visible = true;

      const posA = nodePositions[a];
      const posB = nodePositions[b];
      const positions = new Float32Array([posA.x, posA.y, posA.z, posB.x, posB.y, posB.z]);
      edge.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      edge.geometry.attributes.position.needsUpdate = true;

      const severed = isLeakageSection && (a === 0 || b === 0) && leakageAlpha > 0.5;
      const mat = edge.material as THREE.LineBasicMaterial;
      mat.color.set(severed ? "#ef4444" : "#334155");
      mat.opacity = severed ? progress * 0.15 : progress * 0.35;
    });
  });

  return null; // All rendering is imperative via scene.add()
}
