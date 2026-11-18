"""Render an original, spatially continuous spa opening with Blender 4.3."""
import math
import os
import random

import bpy
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(14)
scene = bpy.context.scene

def material(name, color, roughness=.55, scale=0, bump=0, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if scale:
        noise = nodes.new('ShaderNodeTexNoise')
        coords = nodes.new('ShaderNodeTexCoord')
        links.new(coords.outputs['Object'], noise.inputs['Vector'])
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = 4
        ramp = nodes.new('ShaderNodeValToRGB')
        for i, factor in enumerate((.61, 1.34)):
            ramp.color_ramp.elements[i].color = (*(v * factor for v in color), 1)
        links.new(noise.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs[0], shader.inputs['Base Color'])
        relief = nodes.new('ShaderNodeBump')
        relief.inputs['Strength'].default_value = .35
        relief.inputs['Distance'].default_value = bump
        links.new(noise.outputs['Fac'], relief.inputs['Height'])
        links.new(relief.outputs[0], shader.inputs['Normal'])
    return mat

plaster = material('Chaux sauge', (.21,.29,.22), .88, 5, .09)
dark = material('Chaux pin', (.068,.125,.10), .81, 12, .07)
sand = material('Travertin', (.45,.37,.27), .73, 8, .035)
oak = material('Noyer fumé', (.2,.092,.048), .46, 21, .012)
linen = material('Lin ficelle', (.57,.45,.34), .87, 120, .018)
cream = material('Lin écru', (.76,.69,.54), .91, 105, .014)
brass = material('Laiton brossé', (.48,.28,.10), .27, 80, .007, .72)
jade = material('Céramique céladon', (.14,.28,.208), .26, 14, .008)
stone = material('Pierre sombre', (.10,.12,.10), .5, 17, .025)
leaves = [material('Feuille %d'%i,c,.5, 22,.004) for i,c in enumerate([
    (.12,.20,.065),(.19,.25,.085),(.076,.148,.066),(.26,.30,.11)])]
glow = material('Diffuseur de lampe', (.94,.51,.22))
g = glow.node_tree.nodes.get('Principled BSDF')
g.inputs['Emission Color'].default_value = (1,.56,.27,1)
g.inputs['Emission Strength'].default_value = 4.2

def finish(obj, mat, bevel=0, smooth=False):
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Arêtes adoucies', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        obj.modifiers.new('Normales pondérées', 'WEIGHTED_NORMAL')
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj

def box(name, loc, dims, mat, radius=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, radius)

def cylinder(name, loc, radius, depth, mat, bevel=.02):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, bevel, True)

def ellipsoid(name, loc, size, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    return finish(obj, mat, smooth=True)

def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point, (x,y,z) in zip(spline.points, points):
        point.co = (x,y,z,1)
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def area(name, loc, target, energy, color, size):
    lamp = bpy.data.lights.new(name,'AREA')
    lamp.energy, lamp.color, lamp.shape, lamp.size = energy,color,'DISK',size
    obj = bpy.data.objects.new(name,lamp)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def lathe(name, loc, profile, mat):
    sides = 64
    verts = [(r*math.cos(2*math.pi*i/sides),r*math.sin(2*math.pi*i/sides),z)
             for r,z in profile for i in range(sides)]
    faces = [(j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i)
             for j in range(len(profile)-1) for i in range(sides)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    obj = bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(obj)
    obj.location = loc
    return finish(obj, mat, smooth=True)

def plant(x,y,height):
    lathe('Jarre', (x,y,0), [(.001,0),(.23,0),(.32,.15),(.29,.49),(.21,.58),(.18,.59),(.18,.42),(.001,.4)], stone)
    for branch in range(12):
        angle = random.random()*math.tau
        root = Vector((x,y,.45))
        length = random.uniform(.58,1.0)
        tip = root+Vector((math.cos(angle)*random.uniform(.2,.71),math.sin(angle)*random.uniform(.2,.71),height*length))
        tube('Tige', [root,root.lerp(tip,.55)+Vector((0,0,.08)),tip], .008, oak)
        for step in range(4):
            p = root.lerp(tip,.51+step*.145)
            for side in (-1,1):
                leaf = ellipsoid('Feuille', p+Vector((.065*side,.02*side,.025)), (.028,.023,.139), random.choice(leaves))
                leaf.rotation_euler = Vector((side*.8,math.sin(angle)*.65,.52)).to_track_quat('Z','Y').to_euler()

# Architectural space. The portal physically hides parts of the room at frame one.
box('Sol continu', (0,1,-.12), (12,17,.24), sand)
box('Plafond', (0,1,3.57), (12,17,.22), dark)
box('Mur gauche', (-3.7,1,1.7), (.28,17,3.5), plaster)
box('Mur droit', (3.7,1,1.7), (.28,17,3.5), dark)
box('Mur du fond', (0,6.2,1.7), (8,.28,3.5), plaster)
box('Traverse basse', (0,-.05,3.29), (8,.6,.5), plaster)
box('Jambage gauche', (-2.68,-.05,1.56), (3,.6,3.2), plaster, .065)
box('Jambage droit', (2.82,-.05,1.56), (2.75,.6,3.2), dark, .065)
for x in [-3.45,3.45]:
    box('Plinthe', (x,1,.13), (.16,14,.23), oak)
for side in [-1,1]:
    for j in range(24):
        box('Lame verticale', (side*3.50,.4+j*.235,1.66), (.13,.105,3.32), oak,.014)
for x in [-3,-2,-1,0,1,2,3]:
    box('Joint du travertin', (x,1,.001), (.009,15,.002), stone, 0)
for y in range(-6,7):
    box('Joint du travertin', (0,y,.002), (7,.009,.002), stone, 0)
for i in range(39):
    x = -3.13 + i*.164
    box('Lames du fond', (x,6.02,1.65), (.072,.075,3.3), oak,.01)

box('Banc d’accueil', (-2.55,-2.96,.26), (1.1,2.28,.42), oak,.12)
box('Assise en lin', (-2.55,-2.96,.53), (1.05,2.2,.19), linen,.09)
for yy in (-3.7,-2.92,-2.15):
    box('Coussin', (-2.55,yy,.68), (.54,.56,.17), cream,.076).rotation_euler.z=.25
plant(2.55,-1.05,1.67)
plant(-2.64,4.66,2.00)
plant(2.67,5.35,2.18)

box('Tapis', (.46,3.37,.018), (3.15,3.75,.04), stone,.015)
box('Socle du lit', (.48,3.39,.37), (1.11,1.92,.68), oak,.15)
box('Dosseret de lin', (.48,3.42,.78), (1.26,2.07,.24), linen,.10)
box('Drap', (.49,3.35,.924), (1.20,1.94,.075), cream,.034)
box('Retour du drap', (.49,2.4,.74), (1.19,.06,.41), cream,.027)
box('Appui tête', (.51,4.04,1.02), (.73,.54,.14), cream,.066)
for i in range(16):
    x=.0+i*.063
    tube('Plis', [(x,2.366,.55),(x+.012,2.365,.75),(x-.008,2.37,.90)], .009, cream)
box('Console arrière', (.2,5.66,.54), (3.24,.54,1.08), oak,.03)
box('Plateau arrière', (.2,5.66,1.1), (3.42,.64,.12), stone,.028)
cylinder('Pied du guéridon',(1.48,2.42,.45),.20,.90,jade)
cylinder('Plateau du guéridon',(1.48,2.42,.93),.37,.10,sand)
lathe('Vasque de soin',(1.47,2.43,.975), [(.001,0),(.12,0),(.16,.035),(.201,.11),(.197,.128),
    (.181,.128),(.159,.075),(.096,.031),(.001,.026)], jade)
water = material('Surface de l’huile', (.095,.15,.077), .13)
cylinder('Huile dans la vasque', (1.47,2.43,1.025), .138,.012,water,.004)
cylinder('Flacon',(1.69,2.61,1.09),.058,.225,jade)
cylinder('Bouchon',(1.69,2.61,1.23),.030,.066,brass)
for x,y,z in [(-2.0,-1.0,.6),(-1.15,5.62,1.18),(-.65,5.58,1.18),(1.5,5.64,1.18)]:
    cylinder('Porte-bougie',(x,y,z),.11,.13,brass)
    ellipsoid('Lueur',(x,y,z+.11),(.037,.037,.073),glow)
    area('Bougie',(x,y,z+.18),(x-.2,y-.4,z+.5),14,(1,.57,.31),.14)
for x in [-2.4,.2,2.4]:
    cylinder('Suspension',(x,4.72,2.49),.09,.24,glow)
    cylinder('Câble',(x,4.72,3.04),.012,.85,brass,.002)
    area('Suspension',(x,4.65,2.41),(x,3.5,.5),95,(1,.71,.51),.46)
area('Lumière accueil',(0,-3.75,3.1),(-1,-.1,0),310,(1,.83,.64),2.4)
area('Rebond accueil',(2,-1.5,2.65),(-1,-2,0),140,(.73,.86,1),2.0)
area('Lumière chambre',(-1.98,2.77,3.07),(.62,3.46,.72),380,(1,.78,.56),1.9)
area('Contre jour',(2.6,5.68,2.83),(0,3,.8),460,(1,.64,.37),1.4)
area('Lumière produit',(2.16,1.52,2.41),(1.48,2.43,1),85,(.87,.94,1),.75)

bpy.ops.object.camera_add()
camera=bpy.context.object
camera.data.lens=32
camera.data.sensor_width=36
camera.data.sensor_fit='HORIZONTAL'
scene.camera=camera
# Fixed focal length. Camera translation, rotation and foreground occlusions create depth.
for frame, pos, target in [
    (1,(-.90,-5.65,1.60),(.02,.46,1.49)),
    (16,(-.55,-3.62,1.58),(.06,2.62,1.31)),
    (35,(.27,-.38,1.55),(.55,3.43,1.23)),
    (55,(-.29,1.09,1.49),(.68,3.65,1.02)),
    (72,(.47,1.37,1.54),(1.20,2.65,.99)),
    (96,(1.25,1.77,1.55),(1.50,2.50,1.01)),
]:
    camera.location=pos
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.keyframe_insert(data_path='location',frame=frame)
    camera.keyframe_insert(data_path='rotation_euler',frame=frame)

scene.world.color=(.19,.19,.19)
scene.render.engine=os.environ.get('SEREIN_ENGINE','CYCLES')
scene.eevee.taa_render_samples=12
scene.cycles.samples=int(os.environ.get('SEREIN_SAMPLES','12'))
scene.cycles.use_denoising=False
scene.cycles.max_bounces=4
scene.cycles.diffuse_bounces=2
scene.cycles.glossy_bounces=2
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.30
scene.render.resolution_x=448
scene.render.resolution_y=672
scene.render.resolution_percentage=int(os.environ.get('SEREIN_SCALE','100'))
scene.render.fps=16
scene.frame_start=1
scene.frame_end=96
scene.render.image_settings.file_format='JPEG'
scene.render.image_settings.quality=91
scene.render.filepath=os.environ.get('SEREIN_OUTPUT','/tmp/serein-render/frame-')
preview=os.environ.get('SEREIN_PREVIEW')
if preview:
    directory=scene.render.filepath
    for frame in map(int,preview.split(',')):
        scene.frame_set(frame)
        scene.render.filepath=f'{directory}{frame:04}.jpg'
        bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
