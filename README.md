# Retarget-to-play

Herramienta web local para transferir una Action de un FBX Source a un rig Target y devolver un FBX del Target con una Action nueva.

## Flujo actual

1. Carga un **Source FBX** con animación.
2. Carga el **Target FBX**. Las Actions que vengan en el Target se ignoran.
3. Usa el preset **Mixamo → CloudRig / Sintel (FK)** o edita el Bone Map.
4. Pulsa **Aplicar Retargeting FK**.
5. Opcionalmente pulsa **Convertir FK → IK** para hornear:
   - `IK-Hand.L/R`
   - `IK-Foot.L/R`
   - `POLE-Arm.L/R`
   - `POLE-Leg.L/R`
6. Exporta **Target FBX + Action**.

El retarget se hornea por frame y cada hueso FK mapeado recibe curvas de posición, rotación y escala. El cálculo usa el cambio de orientación mundial del Source respecto a su pose de referencia y lo aplica sobre la pose de referencia del Target, por lo que no depende de que ambos rigs tengan exactamente los mismos ejes locales.

## Preset CloudRig / Sintel

El preset incluido mapea el esqueleto Mixamo a los controles FK principales de CloudRig, por ejemplo:

- `Hips → FK-Hips`
- `Spine → FK-Spine`
- `Spine2 → FK-Chest`
- `LeftArm → FK-UpperArm.L`
- `LeftForeArm → FK-Forearm.L`
- `LeftHand → FK-Hand.L`
- `LeftUpLeg → FK-Thigh.L`
- `LeftLeg → FK-Knee.L`
- `LeftFoot → FK-Foot.L`

y sus equivalentes derechos.

## Exportación

La salida usa `@comfyorg/fbx-exporter-three` para generar un FBX binario desde el navegador. Se conserva la jerarquía cargada del Target y se adjunta únicamente la Action generada por esta herramienta.

El objetivo del archivo exportado es importarlo en Blender y reutilizar la Action sobre el rig original que tenga los mismos nombres de controles/huesos.

### Límite importante del paso FK → IK

La conversión crea keyframes de transformación para los controles IK y los pole targets. Los switches IK/FK, drivers, constraints y propiedades personalizadas específicas del archivo `.blend` no se pueden reconstruir de forma fiable a partir de un FBX. Si CloudRig exige activar un switch IK/FK en Blender, ese switch debe activarse en el rig original al reutilizar la Action.

## Ejecución

No requiere build. `index.html`, `styles.css` y `app.js` funcionan como sitio estático y el workflow de GitHub Pages publica `main`.

Los FBX seleccionados se procesan en el navegador; la página no los sube a un servidor propio.
