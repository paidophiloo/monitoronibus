"""Author the urban bus. Run from repo root: blender -b -t 2 -P assets/build_bus.py."""
import math
from collections import defaultdict
from pathlib import Path

import bpy

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
parts = defaultdict(list)


def material(name, hex_color, metallic=0.0, roughness=0.52):
    def linear(channel):
        channel = channel / 255
        return channel / 12.92 if channel < 0.04045 else ((channel + .055) / 1.055) ** 2.4
    rgb = tuple(linear(int(hex_color[i:i+2], 16)) for i in (0, 2, 4))
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    surface = value.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = roughness
    return value


shell = material("Porcelain enamel", "d9e1e5", .22, .34)
trim = material("Graphite trim", "18232a")
glass = material("Smoked glass", "263b4a", .38, .18)
glass_sky = material("Glazing reflection", "466474", .3, .26)
paint = material("Livery", "237852", .15, .35)
rubber = material("Rubber", "202323", 0, .88)
metal = material("Satin alloy", "a3aeb4", .62, .37)
white = material("Headlights", "fff4ce", .16, .25)
red = material("Tail lamps", "d93b35")
amber = material("Amber LEDs", "f6b747")
brand = material("Lettering", "202e35")


def register(obj, mat, family):
    obj.data.materials.append(mat)
    parts[(family, mat.name)].append(obj)
    return obj


def mesh(family, vertices, faces, mat):
    data = bpy.data.meshes.new(family)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(family, data)
    bpy.context.collection.objects.link(obj)
    return register(obj, mat, family)


def box(family, pos, size, mat, radius=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if radius:
        bevel = obj.modifiers.new("Rolled edges", "BEVEL")
        bevel.width = radius
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        normal = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return register(obj, mat, family)


def loft(family, sections, mat):
    vertices = []
    for z, w, front, back, chamfer in sections:
        vertices.extend([(-w+chamfer,front,z),(w-chamfer,front,z),(w,front+chamfer,z),
                         (w,back-chamfer,z),(w-chamfer,back,z),(-w+chamfer,back,z),
                         (-w,back-chamfer,z),(-w,front+chamfer,z)])
    faces = [tuple(reversed(range(8)))]
    for row in range(len(sections)-1):
        for i in range(8):
            a, b = 8*row+i, 8*row+(i+1)%8
            faces.append((a,b,b+8,a+8))
    faces.append(tuple(range(len(vertices)-8,len(vertices))))
    return mesh(family, vertices, faces, mat)


loft("Body", [(1.22,1.25,-5.96,5.92,.27),(2.14,1.27,-6.05,5.98,.27),
              (2.89,1.24,-5.82,5.91,.24),(3.12,1.21,-5.70,5.84,.23),
              (3.26,1.06,-5.54,5.70,.25)], shell)
loft("Body", [(.41,1.16,-5.78,5.82,.29),(1.00,1.18,-5.91,5.91,.26),
              (1.27,1.20,-5.96,5.92,.26)], trim)
loft("Livery", [(1.17,1.255,-5.98,5.94,.27),(1.62,1.278,-6.012,5.964,.27)], paint)
axles = (-3.68, 3.50)
for side in (-1,1):
    for start,end in [(-5.66,-4.40),(-2.96,2.78),(4.22,5.65)]:
        box("Body", (side*1.207,(start+end)/2,.81), (.10,end-start,.77), shell, .045)
    for axle in axles:
        # Separate wheel-arch fender mesh with an open inner radius.
        vertices = []
        for i in range(17):
            angle = math.pi * i / 16
            for r in (.58,.69):
                vertices.append((side*1.267,axle+r*math.cos(angle),.53+r*math.sin(angle)))
        mesh("Body", vertices, [(2*i,2*i+1,2*i+3,2*i+2) for i in range(16)], shell)
    for i in range(9):
        y = -4.88 + i*1.215
        box("Windows", (side*1.260,y,2.22), (.045,1.166,1.00), trim, .036)
        box("Windows", (side*1.282,y,2.23), (.035,1.084,.88), glass, .025)
        box("Windows", (side*1.301,y,2.57), (.012,1.05,.026), glass_sky, .004)
        if i % 2 == 0:
            box("Windows", (side*1.303,y,2.41), (.013,1.06,.018), trim, .003)
    for y in (-4.91,.32,4.92) if side == 1 else ():
        box("Doors", (1.302,y,1.56), (.046,1.10,2.00), trim, .04)
        for offset in (-.27,.27):
            box("Doors", (1.331,y+offset,1.83), (.03,.46,1.38), glass, .018)
            box("Doors", (1.33,y+offset,.76), (.025,.47,.34), metal, .018)
        box("Doors", (1.345,y,1.0), (.025,.022,.25), amber, .005)
    for axle in axles:
        for family, x, radius, depth, mat in [
            ("Wheels",1.14,.505,.25,rubber),("Wheels",1.28,.31,.035,metal),
            ("Wheels",1.303,.151,.04,trim),("Wheels",1.328,.090,.018,metal)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth,
                location=(side*x,axle,.505), rotation=(0,math.pi/2,0))
            obj = bpy.context.object
            for face in obj.data.polygons:
                face.use_smooth = len(face.vertices)==4
            register(obj, mat, family)
        for i in range(6):
            theta = i*math.tau/6
            box("Wheels",(side*1.307,axle+.21*math.cos(theta),.505+.21*math.sin(theta)),
                (.024,.034,.034),trim,.005)
    box("Mirrors", (side*1.43,-5.64,2.50), (.40,.10,.085), trim, .035)
    box("Mirrors", (side*1.59,-5.73,2.36), (.18,.24,.43), trim, .045)
    box("Mirrors", (side*1.595,-5.605,2.35), (.12,.014,.31), glass_sky, .012)
    box("Lights", (side*.91,-5.95,.91), (.38,.13,.19), white, .045)
    box("Lights", (side*.88,5.97,1.12), (.26,.07,.43), red, .045)
    box("Lights", (side*.91,-6.01,1.045), (.38,.035,.035), amber, .005)

# Curved windshield with swept corner panes, a raked upper edge and wiper geometry.
windshield = []
for z, front, half_width in ((1.52,-6.045,1.22),(2.14,-6.091,1.25),
                              (2.78,-5.897,1.22),(2.88,-5.872,1.21)):
    windshield.extend([(-half_width,front+.23,z),(-.97,front+.006,z),
                       (0,front-.015,z),(.97,front+.006,z),(half_width,front+.23,z)])
mesh("Windows", windshield, [(j+i,j+i+1,j+i+6,j+i+5) for j in (0,5,10) for i in range(4)], glass)
box("Windows", (0,5.97,2.25), (1.95,.075,.89), glass, .07)
box("DestinationSign",(0,-6.025,2.62),(1.57,.07,.24),trim,.035)
for x, angle in [(-.49,-.36),(.48,.33)]:
    wiper = box("Windows",(x,-6.079,1.78),(.64,.035,.037),trim,.006)
    wiper.rotation_euler.y = angle
box("Body",(0,-5.90,.65),(2.17,.29,.26),shell,.09)
box("Body",(0,5.95,.66),(2.22,.25,.27),shell,.075)
box("Lights",(0,-6.055,.65),(.43,.019,.12),amber,.01)
for y in (-3.65,.42,2.84):
    box("Roof",(0,y,3.315),(1.63,1.04,.18),shell,.07)
    for i in range(7):
        box("Roof", (0,y-.33+i*.11,3.409),(1.24,.031,.013),metal,.003)


def lettering(family, text, location, rotation, size, mat):
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.size = size
    bpy.ops.object.convert(target="MESH")
    register(bpy.context.object, mat, family)


lettering("DestinationSign","PÁTIO MONITOR",(0,-6.064,2.57),(math.pi/2,0,0),.135,amber)
lettering("Livery","MOBILIDADE URBANA",(-1.261,-.35,.84),(math.pi/2,0,-math.pi/2),.22,brand)
lettering("Livery","PÁTIO MONITOR",(1.27,-2.0,.85),(math.pi/2,0,math.pi/2),.21,brand)

for (family, mat_name), group in parts.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in group:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    if len(group) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = family + " · " + mat_name

output = Path("apps/web/public/models/sp-standard-bus.glb").resolve()
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_draco_mesh_compression_enable=False)
