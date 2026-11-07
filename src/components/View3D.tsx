import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { bounds, farthest, placedWires, roughMarks, type Marks, type Point } from "../geometry";
import type { Model } from "../model";

interface Props {
  model: Model;
  /** Where the sources and the loads sit, from the deck of the model; `null` while the model has none. */
  marks: Marks | null;
}

/** What the view keeps between two models. */
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** The objects of the model: replaced when it changes. */
  content: THREE.Group;
  wireMaterial: LineMaterial;
  /** The marks of the sources and of the loads: spheres of radius 1 that are scaled for every picture. */
  markers: THREE.Mesh[];
  /** The request to show everything that the camera has answered; -1 before the first. */
  fitted: number;
  /** What the camera was last aimed at. */
  frame: { centre: Point; radius: number; ground: boolean } | null;
  draw: () => void;
}

const FIELD_OF_VIEW = 40;

/** The radius of a mark over its distance from the camera: about five pixels. */
const MARKER_SIZE = 0.011;

/** A colour of the page, so that the view follows its light and dark theme. */
function pageColour(element: Element, name: string): THREE.Color {
  return new THREE.Color(getComputedStyle(element).getPropertyValue(name).trim());
}

/** Frees the graphics memory of the objects of a model. */
function clear(group: THREE.Group) {
  group.traverse((object) => {
    const item = object as Partial<THREE.Mesh>;
    item.geometry?.dispose();
    const material = item.material;
    if (Array.isArray(material)) material.forEach((one) => one.dispose());
    else material?.dispose();
  });
  group.clear();
}

/** The antenna in space: drag to turn it, scroll to zoom. The Z axis points up. */
export function View3D({ model, marks }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const { ground } = model;
  const wires = placedWires(model);
  const { sources, loads } = marks ?? roughMarks(model);
  const marksKey = JSON.stringify([sources, loads]);
  const wiresKey = JSON.stringify(wires);

  // The renderer, the camera and the controls live as long as the view.
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 1000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    const content = new THREE.Group();
    scene.add(content);
    const wireMaterial = new LineMaterial({ linewidth: 3 });

    const draw = () => {
      // The marks keep their size on the screen at any distance.
      for (const marker of stage.current?.markers ?? []) {
        marker.scale.setScalar(camera.position.distanceTo(marker.position) * MARKER_SIZE);
      }
      renderer.render(scene, camera);
    };
    controls.addEventListener("change", draw);
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      wireMaterial.resolution.set(width, height);
      draw();
    });
    resize.observe(element);

    stage.current = { renderer, scene, camera, controls, content, wireMaterial, markers: [], fitted: -1, frame: null, draw };
    return () => {
      resize.disconnect();
      controls.dispose();
      clear(content);
      wireMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  // The objects of the model.
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    const { content, camera, controls, wireMaterial, draw } = current;
    const element = host.current!;
    clear(content);

    const { centre, radius } = bounds(wires);
    const hasGround = ground.kind !== "free";
    // The camera looks at the antenna, and over a ground at the middle of its
    // height, so that the ground under it is in the picture too.
    const aim: Point = [centre[0], centre[1], hasGround ? centre[2] / 2 : centre[2]];
    const reach = farthest(wires, aim) || radius;

    const positions = wires.flatMap((wire) => [wire.x1, wire.y1, wire.z1, wire.x2, wire.y2, wire.z2]);
    if (positions.length > 0) {
      wireMaterial.color = pageColour(element, "--ink");
      content.add(new LineSegments2(new LineSegmentsGeometry().setPositions(positions), wireMaterial));
    }

    const mark = (at: Point, colour: string): THREE.Mesh => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 12),
        new THREE.MeshBasicMaterial({ color: pageColour(element, colour) }),
      );
      marker.position.set(...at);
      content.add(marker);
      return marker;
    };
    current.markers = [...loads.map((at) => mark(at, "--trace-c")), ...sources.map((at) => mark(at, "--trace-b"))];

    const axes = new THREE.AxesHelper(radius * 0.5);
    axes.setColors(new THREE.Color("#e5484d"), new THREE.Color("#30a46c"), new THREE.Color("#3e8ed0"));
    content.add(axes);

    if (hasGround) {
      // A grid under the antenna, and a line from every wire end down to it.
      const size = 2 * Math.max(radius, centre[2]) * 1.4;
      const line = pageColour(element, "--grid");
      const grid = new THREE.GridHelper(size, 10, line, line);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(centre[0], centre[1], 0);
      content.add(grid);

      // A vertical wire is its own line down: only its lower end gets one.
      const drops = wires.flatMap((wire) => {
        const ends = [
          [wire.x1, wire.y1, wire.z1],
          [wire.x2, wire.y2, wire.z2],
        ];
        const vertical = wire.x1 === wire.x2 && wire.y1 === wire.y2;
        const lower = wire.z1 <= wire.z2 ? 0 : 1;
        return ends.filter((_, end) => !vertical || end === lower).flatMap(([x, y, z]) => [x, y, z, x, y, 0]);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(drops, 3));
      const dashed = new THREE.LineSegments(
        geometry,
        new THREE.LineDashedMaterial({ color: pageColour(element, "--muted"), dashSize: reach * 0.03, gapSize: reach * 0.03 }),
      );
      dashed.computeLineDistances();
      content.add(dashed);
    }

    // The whole antenna comes into view at first, on request, and when the
    // model has become another one: much larger, much smaller or elsewhere.
    // A small change of a wire leaves the camera where the user put it.
    const frame = current.frame;
    const another =
      !frame ||
      frame.ground !== hasGround ||
      radius > frame.radius * 1.3 ||
      radius < frame.radius / 1.3 ||
      Math.hypot(centre[0] - frame.centre[0], centre[1] - frame.centre[1], centre[2] - frame.centre[2]) > frame.radius * 0.3;
    if (current.fitted !== fitRequest || another) {
      current.fitted = fitRequest;
      current.frame = { centre, radius, ground: hasGround };
      const target = new THREE.Vector3(...aim);
      const distance = (reach / Math.sin(THREE.MathUtils.degToRad(FIELD_OF_VIEW / 2))) * 1.15;
      // The direction of the view stays as the user turned it.
      const direction = frame
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(1, -1.25, 0.7).normalize();
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.update();
    }
    draw();
    // The keys stand for the wires and the marks: the effect runs when the values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiresKey, marksKey, ground.kind, fitRequest]);

  if (unavailable) return <p className="note">Тривимірний вигляд недоступний у цьому браузері.</p>;
  return (
    <div className="view3d">
      <div className="canvas" ref={host} role="img" aria-label="Тривимірний вигляд антени" />
      <div className="view-bar">
        <span className="axes">
          <span className="axis-x">X</span> <span className="axis-y">Y</span> <span className="axis-z">Z</span>
          {sources.length > 0 && <span className="mark source-mark">{sources.length > 1 ? "джерела" : "джерело"}</span>}
          {loads.length > 0 && <span className="mark load-mark">навантаження</span>}
        </span>
        <button type="button" className="quiet" onClick={() => setFitRequest((count) => count + 1)}>
          Показати все
        </button>
      </div>
    </div>
  );
}
