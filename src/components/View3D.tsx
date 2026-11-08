import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { bounds, farthest, feedPoint, placedWires, roughMarks, type Marks, type Point } from "../geometry";
import type { Model } from "../model";
import { PATTERN_RANGE, surface, viridis, type PatternGrid } from "../pattern";
import { Hint } from "./Help";

interface Props {
  model: Model;
  /** Where the sources and the loads sit, from the deck of the model; `null` while the model has none. */
  marks: Marks | null;
  /** The pattern of the results that belong to the model as it is; `null` without such results. */
  pattern: PatternGrid | null;
}

/** What the view keeps between two models. */
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** The objects of the model: replaced when it changes. */
  content: THREE.Group;
  /** The pattern in space: replaced when the results change. */
  patternGroup: THREE.Group;
  wireMaterial: LineMaterial;
  /** The marks of the sources and of the loads: spheres of radius 1 that are scaled for every picture. */
  markers: THREE.Mesh[];
  /** The request to show everything that the camera has answered; -1 before the first. */
  fitted: number;
  /** What the camera was last aimed at, and how far the picture reaches from there. */
  frame: { centre: Point; reach: number; ground: boolean } | null;
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
export function View3D({ model, marks, pattern }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [patternWanted, setPatternWanted] = useState(true);
  const showPattern = pattern !== null && patternWanted;
  const top = pattern ? Math.max(...pattern.gain) : 0;
  const { ground } = model;
  const wires = placedWires(model);
  const { sources, loads } = marks ?? roughMarks(model);
  const marksKey = JSON.stringify([sources, loads]);
  const wiresKey = JSON.stringify(wires);
  // The pattern comes out of the feed point, as large as the antenna.
  const origin = feedPoint(
    sources,
    model.sources.map((source) => source.voltage !== 0),
    bounds(wires).centre,
  );
  const originKey = JSON.stringify(origin);

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
    const patternGroup = new THREE.Group();
    scene.add(content, patternGroup);
    // Light gives the pattern its shape; the wires and the marks are drawn without it.
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(1, -1.5, 2);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4), light);
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

    stage.current = { renderer, scene, camera, controls, content, patternGroup, wireMaterial, markers: [], fitted: -1, frame: null, draw };
    return () => {
      resize.disconnect();
      controls.dispose();
      clear(content);
      clear(patternGroup);
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
    // The pattern, when it is shown, is a sphere as large as the antenna around the feed point.
    const patternReach = showPattern ? Math.hypot(origin[0] - aim[0], origin[1] - aim[1], origin[2] - aim[2]) + radius : 0;
    const reach = Math.max(farthest(wires, aim) || radius, patternReach);

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
      reach > frame.reach * 1.3 ||
      reach < frame.reach / 1.3 ||
      Math.hypot(centre[0] - frame.centre[0], centre[1] - frame.centre[1], centre[2] - frame.centre[2]) > frame.reach * 0.3;
    if (current.fitted !== fitRequest || another) {
      current.fitted = fitRequest;
      current.frame = { centre, reach, ground: hasGround };
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
  }, [wiresKey, marksKey, originKey, ground.kind, fitRequest, showPattern]);

  // The pattern in space, out of the feed point.
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    clear(current.patternGroup);
    if (pattern && showPattern) {
      const shape = surface(pattern, origin, bounds(wires).radius);
      // The colour map is in sRGB; the renderer works in linear colours.
      const colour = new THREE.Color();
      const colors: number[] = [];
      for (let i = 0; i < shape.colors.length; i += 3) {
        colour.setRGB(shape.colors[i], shape.colors[i + 1], shape.colors[i + 2], THREE.SRGBColorSpace);
        colors.push(colour.r, colour.g, colour.b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(shape.positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(shape.indices);
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
      current.patternGroup.add(new THREE.Mesh(geometry, material));
    }
    current.draw();
    // The feed point and the wires give the place and the size of the pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, showPattern, wiresKey, originKey]);

  // The colours of the legend, from the bottom of the range to the maximum.
  const legend = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1]
    .map((part) => `rgb(${viridis(part).map((value) => Math.round(value * 255)).join(" ")})`)
    .join(", ")})`;

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
        <span className="view-actions">
          {pattern && (
            <Hint topic="patternToggle">
              <label className="toggle">
                <input type="checkbox" checked={patternWanted} onChange={(event) => setPatternWanted(event.target.checked)} />
                Діаграма
              </label>
            </Hint>
          )}
          <Hint topic="fitView">
            <button type="button" className="quiet" onClick={() => setFitRequest((count) => count + 1)}>
              Показати все
            </button>
          </Hint>
        </span>
      </div>
      {showPattern && (
        <p className="pattern-legend">
          <span className="ramp" style={{ background: legend }} aria-hidden="true" />
          <span>
            Підсилення: від {(top - PATTERN_RANGE).toFixed(0)} до {top.toFixed(1)} дБі. Відстань від центру й колір — у тій самій шкалі, що й
            плоскі діаграми.
          </span>
        </p>
      )}
    </div>
  );
}
