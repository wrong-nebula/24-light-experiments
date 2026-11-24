import * as T from "three/webgpu";

// The two cone tips share a pivot. A dark keyline keeps them legible on both
// the bright detector cards and the unlit sides of the room.
function arrowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.scale(4, 4);
  ctx.translate(24, 6);
  ctx.fillStyle = "#ededed";
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-15, -3.4);
  ctx.lineTo(-15, -0.8);
  ctx.lineTo(15, -0.8);
  ctx.lineTo(15, -3.4);
  ctx.lineTo(22, 0);
  ctx.lineTo(15, 3.4);
  ctx.lineTo(15, 0.8);
  ctx.lineTo(-15, 0.8);
  ctx.lineTo(-15, 3.4);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 2.4, 0, 2 * Math.PI);
  ctx.fillStyle = "#303030";
  ctx.fill();
  ctx.strokeStyle = "#ededed";
  ctx.lineWidth = 1;
  ctx.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function addAxisHint(scene, keep, { object, axis, anchor }) {
  const material = keep(
    new T.SpriteMaterial({
      map: keep(arrowTexture()),
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const sprite = new T.Sprite(material);
  sprite.raycast = () => {};
  sprite.renderOrder = 2;
  scene.add(sprite);

  const localAnchor = new T.Vector3(...anchor);
  const direction = new T.Vector3();
  return {
    update(camera, height, plan) {
      sprite.visible = !plan && height > 0;
      if (!sprite.visible) return;
      const unitsPerPixel = (camera.top - camera.bottom) / (camera.zoom * height);
      object.localToWorld(sprite.position.copy(localAnchor));
      sprite.position.y += 5 * unitsPerPixel;
      direction.set(0, 0, 0);
      direction[axis] = 1;
      direction.transformDirection(camera.matrixWorldInverse);
      const across = Math.hypot(direction.x, direction.y);
      // Looking straight down the rail leaves no lateral direction to show.
      sprite.visible = across > 0.12;
      material.rotation = Math.atan2(direction.y, direction.x);
      material.opacity = 0.94 * T.MathUtils.smoothstep(across, 0.12, 0.35);
      sprite.scale.set(48 * across * unitsPerPixel, 12 * unitsPerPixel, 1);
    },
  };
}
