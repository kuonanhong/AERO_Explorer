#!/usr/bin/env python3
"""Reproduce the shipped Statue of Liberty model assets.

Asset: Gravity Jack, Statue Of Liberty, CC BY 4.0.
See README.md, SOURCE-LICENSE.txt and the emitted model-manifest.json.
This utility transforms only the pinned original artist recreation; it does
not reconstruct or claim a photogrammetric survey of the actual monument.
"""
import pathlib,struct,json,hashlib,io,numpy as np
from PIL import Image
import argparse

parser = argparse.ArgumentParser(description="Rebuild AERO Explorer's CC BY 4.0 Statue of Liberty mesh and Canvas LOD.")
parser.add_argument('--source', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent / 'source' / 'statue-liberty-original.glb', help='Verified original Gravity Jack GLB (bundled by default)')
parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path.cwd() / 'rebuilt-statue-model', help='Output asset directory (default: ./rebuilt-statue-model)')
parser.add_argument('--overwrite', action='store_true', help="Replace this converter's six known output files if present")
args = parser.parse_args()
out = args.output.expanduser().resolve()
source = args.source.expanduser().resolve()
output_names = ['statue-liberty.mesh.json', 'statue-liberty-lite.mesh.json', 'statue-liberty-body.jpg', 'statue-liberty-robes.jpg', 'model-manifest.json', 'MODEL-CREDITS.txt']
if not args.overwrite and any((out / name).exists() for name in output_names):
    parser.error('Output files already exist. Use a fresh --output directory or explicitly add --overwrite.')
b = source.read_bytes()
expected_sha256 = '581d99fd34e0ec5c1423cccccf9b0fb9f564f2d134bbb99d16a9e7ba8f1ee792'
if hashlib.sha256(b).hexdigest() != expected_sha256:
    parser.error('Source GLB SHA256 mismatch; do not substitute a different or unlicensed asset.')
if b[:4] != b'glTF' or struct.unpack_from('<I', b, 4)[0] != 2:
    parser.error('Expected glTF 2 binary input.')
out.mkdir(parents=True, exist_ok=True)
jlen,jtype=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+jlen]);
if g.get('asset', {}).get('extras', {}).get('license') != 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)':
    parser.error('Source GLB license metadata mismatch.')
p=20+jlen;blen,btype=struct.unpack_from('<II',b,p);binary=b[p+8:p+8+blen]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 stride=v.get('byteStride',np.dtype(dt).itemsize*n)
 return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=offset,strides=(stride,np.dtype(dt).itemsize)).copy()
# All source node transforms are identity apart from two cancelling root rotations.
def node_matrix(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape((4,4),order='F')
 assert not any(k in node for k in ['translation','rotation','scale'])
 return np.eye(4)
prims=[]
def walk(i,parent):
 node=g['nodes'][i];transform=parent@node_matrix(node)
 if 'mesh' in node:
  for prim in g['meshes'][node['mesh']]['primitives']:
   a=prim['attributes'];points=accessor(a['POSITION']);points=(np.c_[points,np.ones(len(points))]@transform.T)[:,:3]
   normals=accessor(a['NORMAL'])@np.linalg.inv(transform[:3,:3]);normals/=np.linalg.norm(normals,axis=1,keepdims=True)
   prims.append({'name':node['name'],'p':points,'n':normals,'uv':accessor(a['TEXCOORD_0']),'i':accessor(prim['indices']).reshape(-1),'material':prim['material']})
 for child in node.get('children',[]):walk(child,transform)
for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4))
allpoints=np.concatenate([p['p'] for p in prims]);lo=allpoints.min(axis=0);hi=allpoints.max(axis=0);origin=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]);scale=46.05/(hi[1]-lo[1])
files=[]
# Use original PBR base colour textures. Downsample only; preserve patina colour.
materials=[]
for mi,mat in enumerate(g['materials']):
 texi=mat['pbrMetallicRoughness']['baseColorTexture']['index'];ii=g['textures'][texi]['source'];iv=g['bufferViews'][g['images'][ii]['bufferView']];raw=binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']];im=Image.open(io.BytesIO(raw)).convert('RGB');origsize=im.size;im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
 name='statue-liberty-'+['body','robes'][mi]+'.jpg';im.save(out/name,quality=88,optimize=True)
 materials.append({'name':mat['name'],'baseColorTexture':name,'baseColor':[1,1,1],'roughness':0.88,'metalness':0.25,'doubleSided':bool(mat.get('doubleSided')),'textureFlipY':False})
 files.append({'path':name,'sourceImageIndex':ii,'originalPixels':origsize,'pixels':im.size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'bytes':(out/name).stat().st_size})
result={'format':'aero-indexed-mesh-v1','units':'m','name':'Statue of Liberty — Gravity Jack artist reconstruction','geometryType':'artist-reconstruction','height':46.05,'includesPedestal':False,'textureConvention':'glTF (flipY=false)','bounds':{'min':np.round((lo-origin)*scale,5).tolist(),'max':np.round((hi-origin)*scale,5).tolist()},'materials':materials,'primitives':[]}
for p in prims:
 result['primitives'].append({'name':p['name'],'positions':np.round((p['p']-origin)*scale,5).flatten().tolist(),'normals':np.round(p['n'],5).flatten().tolist(),'uvs':np.round(p['uv'],6).flatten().tolist(),'indices':p['i'].tolist(),'material':p['material']})
f=out/'statue-liberty.mesh.json';f.write_text(json.dumps(result,separators=(',',':'),ensure_ascii=False))
files.insert(0,{'path':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'vertices':sum(len(p['p']) for p in prims),'triangles':sum(len(p['i'])//3 for p in prims)})
manifest={'schema':'aero-model-manifest-v1','retrieved':'2026-10-11','models':[{'id':'statue-liberty','name':'Statue Of Liberty','author':'Gravity Jack','authorUrl':'https://sketchfab.com/gravityjack','source':'https://sketchfab.com/3d-models/statue-of-liberty-84094e8d5e724b5c882cf576ca12e44e','download':'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-115/84094e8d5e724b5c882cf576ca12e44e.glb','dataset':'Objaverse 1.0 / Allen Institute for AI','datasetUrl':'https://huggingface.co/datasets/allenai/objaverse','license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','licenseEvidence':'License, author and source embedded in original GLB asset.extras; creator listing also CC Attribution.','originalSha256':hashlib.sha256(b).hexdigest(),'originalBytes':len(b),'originalDescription':'This American symbol has been recreated in 3D using ZBrush and Maya. Highly detailed and textured for PBR using Substance Painter. Its 100% UV unwrapped and game ready.','captureType':'artist-reconstruction','notPhotogrammetry':True,'notSurveyGrade':True,'modifications':['Applied source glTF node transforms.','Centered x/z bounding box and placed statue base at y=0.','Uniformly scaled statue mesh height to 46.05 metres; this does not certify every model dimension.','Converted indexed geometry, normals and UVs to JSON, rounded positions and normals to 5 decimal places and UVs to 6.','Downsampled two original base color texture maps to at most 1024 pixels and JPEG quality 88.','Original normal and metallic-roughness maps omitted; roughness/metalness approximated for lightweight browser rendering.'],'units':'metres','heightMetres':46.05,'pedestalIncluded':False,'orientation':{'up':'+Y','front':'pending visual verification','originalFrontPreserved':True,'worldGeographicYawMustBeAssignedByScene':True},'dimensionReference':'https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm','dimensionFacts':{'statueHeightMetres':46.05,'groundToTorchMetres':92.99,'groundToPedestalMetres':46.94,'faces':'southeast'},'files':files}]}
(out/'model-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(out/'MODEL-CREDITS.txt').write_text('Statue Of Liberty by Gravity Jack (https://sketchfab.com/gravityjack)\nSource: https://sketchfab.com/3d-models/statue-of-liberty-84094e8d5e724b5c882cf576ca12e44e\nLicense: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/\nDownloaded through Allen Institute for AI Objaverse 1.0, https://huggingface.co/datasets/allenai/objaverse\nModified for AERO Explorer: converted to indexed JSON; recentered; uniformly scaled to 46.05 m; texture downsampling; simplified PBR parameters.\nThis is an artist-created 3D reconstruction using ZBrush and Maya, NOT a surveyed photogrammetry/digital twin. The pedestal and surrounding scene are not included in the licensed mesh.\nDimensions reference: US National Park Service, https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm\nNo creator, museum, or park endorsement implied.\n')
print(json.dumps({'files':files,'bounds':result['bounds'],'sourceScale':scale,'sourceOrigin':origin.tolist()},indent=2))

# Stage 2: normalize front, create the bounded Canvas LOD, and update checksums.
import pathlib,json,numpy as np,hashlib
from PIL import Image
from scipy.spatial import cKDTree
import fast_simplification
p=out/'statue-liberty.mesh.json';d=json.loads(p.read_text())
R=np.array([[0,0,-1],[0,1,0],[1,0,0]])
verts=[];faces=[];centroids=[];colors=[];offset=0
for prim in d['primitives']:
 v=np.array(prim['positions']).reshape(-1,3)@R.T;n=np.array(prim['normals']).reshape(-1,3)@R.T;idx=np.array(prim['indices']).reshape(-1,3);uv=np.array(prim['uvs']).reshape(-1,2)
 prim['positions']=np.round(v,5).flatten().tolist();prim['normals']=np.round(n,5).flatten().tolist()
 verts.append(v);faces.append(idx+offset);offset+=len(v);centroids.append(v[idx].mean(axis=1))
 im=np.array(Image.open(out/d['materials'][prim['material']]['baseColorTexture']).convert('RGB'));pixuv=uv[idx].mean(axis=1)%1
 xi=np.clip((pixuv[:,0]*im.shape[1]).astype(int),0,im.shape[1]-1);yi=np.clip((pixuv[:,1]*im.shape[0]).astype(int),0,im.shape[0]-1)
 colors.append(im[yi,xi])
v=np.concatenate(verts);f=np.concatenate(faces);src_centers=np.concatenate(centroids);src_colors=np.concatenate(colors)
d['bounds']={'min':v.min(axis=0).tolist(),'max':v.max(axis=0).tolist()};d['front']='+Z';d['liteUrl']='statue-liberty-lite.mesh.json';p.write_text(json.dumps(d,separators=(',',':'),ensure_ascii=False))
welded,inverse=np.unique(np.round(v,5),axis=0,return_inverse=True);faces=inverse[f];valid=(faces[:,0]!=faces[:,1])&(faces[:,1]!=faces[:,2])&(faces[:,0]!=faces[:,2]);faces=faces[valid]
v2,f2=fast_simplification.simplify(welded,faces,target_count=1800,agg=7)
normal=np.cross(v2[f2[:,1]]-v2[f2[:,0]],v2[f2[:,2]]-v2[f2[:,0]]);normal/=np.maximum(1e-12,np.linalg.norm(normal,axis=1))[:,None]
_,near=cKDTree(src_centers).query(v2[f2].mean(axis=1));facecolors=src_colors[near]
lite={'format':'aero-indexed-mesh-lite-v1','name':d['name'],'geometryType':d['geometryType'],'height':d['height'],'units':'m','front':'+Z','includesPedestal':False,'bounds':d['bounds'],'positions':np.round(v2,4).flatten().tolist(),'indices':f2.flatten().tolist(),'faceNormals':np.round(normal,4).flatten().tolist(),'faceColors':facecolors.flatten().tolist(),'faceColorRange':255}
litep=out/d['liteUrl'];litep.write_text(json.dumps(lite,separators=(',',':'),ensure_ascii=False))
m=json.loads((out/'model-manifest.json').read_text());model=m['models'][0]
model['orientation']={'up':'+Y','front':'+Z','normalization':'Source front +X was rotated -90 degrees about Y to face +Z.','worldGeographicYawMustBeAssignedByScene':True}
model['modifications'].append('Rotated -90 degrees about Y to normalize front to +Z; verified rendered front, back, left and right views.')
model['modifications'].append('Created 1,800-triangle Canvas LOD by welding coincident positions and quadric-error edge collapse; sampled source base-color textures for per-face colour. Simplification changes shape and is for navigation preview only.')
model['licenseVerification']={'creatorListing':'https://sketchfab.com/3d-models/statue-of-liberty-84094e8d5e724b5c882cf576ca12e44e','listingLicense':'CC Attribution','sourceAssetLicense':'CC-BY-4.0','verifiedAt':'2026-10-11','verifiedVia':'Creator public listing retrieved in web search plus source GLB asset.extras and archived Objaverse metadata license=by.'}
for entry in model['files']:
 file=out/entry['path'];entry['bytes']=file.stat().st_size;entry['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
model['files'].append({'path':litep.name,'bytes':litep.stat().st_size,'sha256':hashlib.sha256(litep.read_bytes()).hexdigest(),'vertices':len(v2),'triangles':len(f2)})
(out/'model-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print('vertices/triangles',len(v2),len(f2));print('totalBytes',sum(f.stat().st_size for f in out.iterdir() if f.is_file()))

print("Complete:", out)
