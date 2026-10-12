#!/usr/bin/env python3
"""Build a reproducible, sourced catalogue. Does not fabricate locations or history.

python -m pip install opencc-python-reimplemented==0.1.7
python build-catalogue.py
Raw source files and checksums are documented in catalogue-sources.json.
"""
from pathlib import Path
from collections import defaultdict, Counter
import hashlib, html, json, math, re
from opencc import OpenCC

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'raw'
CC = OpenCC('s2twp')
SIM = OpenCC('t2s')
DATE = '2026-10-11'
TW_LICENSE = 'https://data.gov.tw/license'
CC_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/'
TW_SOURCE = 'https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip'
UN_SOURCE = 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json?lang=en&timezone=UTC'
TW_CITIES = {
 '臺北市':'Taipei','新北市':'New Taipei','桃園市':'Taoyuan','臺中市':'Taichung','臺南市':'Tainan','高雄市':'Kaohsiung',
 '基隆市':'Keelung','新竹市':'Hsinchu City','嘉義市':'Chiayi City','新竹縣':'Hsinchu County','苗栗縣':'Miaoli',
 '彰化縣':'Changhua','南投縣':'Nantou','雲林縣':'Yunlin','嘉義縣':'Chiayi County','屏東縣':'Pingtung',
 '宜蘭縣':'Yilan','花蓮縣':'Hualien','臺東縣':'Taitung','澎湖縣':'Penghu','金門縣':'Kinmen','連江縣':'Lienchiang (Matsu)'}
FAVOURITES = ['太平山','阿里山','太魯閣','玉山','雪山','墾丁','日月潭','清境','石朗','柴口','綠島','蘭嶼','故宮','九份','野柳','龍洞','東北角','清水斷崖','鳳儀書院','澄清湖','衛武營','蓮池潭','佛光山','故宮南院','玉井','國家森林','國家公園','國立','南仁湖','龜山島','合歡山','司馬庫斯','武陵','棲蘭','美濃','鹿港','淡水','赤崁樓','安平古堡','八卦山','北港朝天宮','關山','布洛灣']
TW_PHOTOS = {
 '太平山國家森林遊樂區':'taipingshan-jancing','見晴懷古步道':'taipingshan-jancing','翠峰湖':'taipingshan-cuifeng',
 '阿里山國家森林遊樂區':'v5-alishan-forest','太魯閣國家公園':'v5-taroko-gorge','石朗潛水區':'v5-green-island-clownfish',
 '石朗':'v5-green-island-clownfish','柴口浮潛區':'v5-green-island-fish','國立故宮博物院':'taipei-npm',
 '鳳儀書院':'fengyi-academy','鳥松濕地公園':'niaosong-wetland','大東文化藝術中心':'dadong',
 '曹公廟':'caogong-temple','國立科學工藝博物館':'science-museum','鳳山龍山寺':'fengshan-longshan',
 '衛武營國家藝術文化中心':'weiwuying','黃埔新村':'huangpu-village','西子灣':'sizihwan',
 '日月潭伊達邵碼頭商圈':'v5-sun-moon-lake','日月潭自行車道-環潭路線':'v5-sun-moon-lake'}
TW_ENGLISH = {'太平山國家森林遊樂區':'Taipingshan National Forest Recreation Area','阿里山國家森林遊樂區':'Alishan National Forest Recreation Area','太魯閣國家公園':'Taroko National Park','石朗潛水區':'Shilang Diving Area, Green Island','石朗':'Shilang, Green Island','柴口浮潛區':'Chaikou Snorkeling Area, Green Island','國立故宮博物院':'National Palace Museum','鳳儀書院':'Fongyi Academy','鳥松濕地公園':'Niaosong Wetland Park','國立科學工藝博物館':'National Science and Technology Museum','日月潭伊達邵碼頭商圈':'Ita Thao Pier, Sun Moon Lake'}
WATER_UNESCO = {'154','764','653','1386'}
UN_PHOTOS = {'154':'v5-gbr-corals','28':'yellowstone-old-faithful'}
DIVE_ZH = {'Apo Reef':'菲律賓阿波礁','Bunaken':'印尼布納肯','Chuuk Lagoon':'密克羅尼西亞楚克潟湖','Fernando de Noronha':'巴西費爾南多迪諾羅尼亞群島','Great Blue Hole':'貝里斯大藍洞','Ko Tao':'泰國龜島','Komodo National Park':'印尼科莫多海域','Menjangan Island':'印尼鹿島','Poor Knights Islands':'紐西蘭貧騎士群島','Raja Ampat Islands':'印尼四王群島','Ras Muhammad National Park':'埃及拉斯穆罕默德海域','Rock Islands':'帛琉洛克群島','SS Thistlegorm':'埃及 Thistlegorm 沉船','Silfra':'冰島 Silfra 裂隙','Similan Islands':'泰國斯米蘭群島','Sipadan':'馬來西亞西巴丹','Tubbataha Reef':'菲律賓圖巴塔哈群礁','Tulamben':'印尼圖蘭奔'}
DIVE_COUNTRY = {'Apo Reef':'PH','Bunaken':'ID','Chuuk Lagoon':'FM','Fernando de Noronha':'BR','Great Blue Hole':'BZ','Ko Tao':'TH','Komodo National Park':'ID','Menjangan Island':'ID','Poor Knights Islands':'NZ','Raja Ampat Islands':'ID','Ras Muhammad National Park':'EG','Rock Islands':'PW','SS Thistlegorm':'EG','Silfra':'IS','Similan Islands':'TH','Sipadan':'MY','Tubbataha Reef':'PH','Tulamben':'ID'}
DIVE_PHOTOS = {'Great Blue Hole':'v5-belize-coral','Raja Ampat Islands':'v5-raja-ampat-arborek','Silfra':'v5-silfra'}

def clean(value):
 return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>', '', str(value or '')))).strip()
def brief(value, n=160):
 s=clean(value)
 if len(s)<=n:return s
 cut=s[:n]
 matches=list(re.finditer(r'[。.!?！？]',cut))
 return cut[:matches[-1].end()] if matches and matches[-1].end()>n*.35 else cut.rstrip()+'…'
def valid(lat,lon):
 return isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180 and (lat or lon)
def output(name,data):
 (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def norm(s):return re.sub(r'[\W_]+','',s.replace('台','臺')).lower()
def tw_category(name):
 if any(s in name for s in ['浮潛','潛水','石朗']):return 'diving','water'
 if any(s in name for s in ['博物','文物','美術館','展覽','書院','文化館','故事館','紀念館']):return 'museum','land'
 if any(s in name for s in ['廟','寺','宮','祠','古堡','古蹟','老街','聚落','古宅','故居','城門']):return 'heritage','land'
 if any(s in name for s in ['森林','林場','神木']):return 'forest','air'
 if any(s in name for s in ['湖','潭','水庫']):return 'lake','air'
 if any(s in name for s in ['山','嶺','峰','崖','峽谷','瀑布']):return 'mountain','air'
 return 'scenic','air'
def tw_rank(x):
 name=x['AttractionName']
 return (sum(6 for s in FAVOURITES if s in name)+int(bool(x.get('Images')))*2+int(len(clean(x.get('Description')))>=120), -len(name))

def main():
 tw=json.loads((RAW/'taiwan-zh.json').read_text(encoding='utf-8-sig'))
 un=json.loads((RAW/'download1.txt').read_text())
 diving=json.loads((RAW/'diving-wikipedia.json').read_text())['query']['pages'].values()
 catalogue=[];details={};seen=set();cities=defaultdict(list);excluded=[]
 for x in tw['Attractions']:
  if not valid(x.get('PositionLat'),x.get('PositionLon')):continue
  # Nearby duplicate records from overlapping publishers are not counted twice.
  key=(norm(x['AttractionName']),round(x['PositionLat'],2),round(x['PositionLon'],2))
  if key in seen:continue
  seen.add(key);city=(x.get('PostalAddress') or {}).get('City','臺灣');cities[city].append(x)
 for values in cities.values():values.sort(key=tw_rank,reverse=True)
 selected=[]
 # Equal round-robin coverage of all 22 counties/cities, then fill remaining capacity.
 while len(selected)<1500 and any(cities.values()):
  for city in sorted(cities):
   if cities[city]:selected.append(cities[city].pop(0))
   if len(selected)==1500:break
 for x in selected:
  name=clean(x['AttractionName']);city=(x.get('PostalAddress') or {}).get('City','臺灣');town=(x.get('PostalAddress') or {}).get('Town','')
  id='tw-'+x['AttractionID'].removeprefix('Attraction_').lower();category,vehicle=tw_category(name)
  source='https://media.taiwan.net.tw/zh-tw/portal/travel/details/'+x['AttractionID'].lower()
  urls=list(dict.fromkeys([source]+([x['WebsiteURL']] if str(x.get('WebsiteURL','')).startswith('https://') else [])))
  english_name=TW_ENGLISH.get(name,name)
  en=f'{category.capitalize()} destination in {TW_CITIES.get(city,city)}, Taiwan. The original Tourism Administration description and local history are available in Traditional Chinese.'
  row={'id':id,'lat':round(x['PositionLat'],6),'lon':round(x['PositionLon'],6),'name':{'zh-Hant':name,'zh-Hans':SIM.convert(name),'en':english_name},'description':{'zh-Hant':brief(x.get('Description'),140),'en':en},'country':'TW','region':city,'category':category,'vehicle':vehicle,'allowedVehicles':[vehicle],'sources':urls,'sourceUrls':urls,'detailId':id,'dataLicense':'OGDL-1.0','sourceLanguage':'zh-Hant','descriptionLanguages':['zh-Hant'],'aliases':[name,city,town]+[str(v) for v in x.get('AlternateNames',[])][:3]}
  if name not in TW_ENGLISH:row['nameFallback']='Official Traditional Chinese proper name; no unverified English translation.'
  if name in TW_PHOTOS:row['photoId']=TW_PHOTOS[name]
  if vehicle=='water':
   row['waterProfile']='sea'
   if '綠島' in town:row['aliases']+=['綠島浮潛','綠島潛水','Green Island diving','Green Island snorkeling']
  row['photoStatus']='bundled-licensed' if row.get('photoId') else 'on-demand-verified-commons'
  details[id]={'id':id,'description':{'zh-Hant':clean(x.get('Description')),'en':en},'historyLanguage':'zh-Hant','attribution':'交通部觀光署／原資料提供機關','license':'政府資料開放授權條款－第1版','licenseUrl':TW_LICENSE,'sources':urls,'sourceId':x['AttractionID'],'updated':x.get('UpdateTime'),'sourceImages':[{'url':i['URL'],'caption':clean(i.get('Name')),'credit':clean(i.get('Description')),'licenseStatus':'Not individually verified; do not display or redistribute automatically.'} for i in x.get('Images',[])[:3] if str(i.get('URL','')).startswith('https://')]}
  catalogue.append(row)
 for x in un:
  p=x.get('coordinates') or {}
  if not valid(p.get('lat'),p.get('lon')):
   excluded.append({'id':x['id_no'],'name':x['name_en'],'reason':'No explicit top-level coordinate in source; no invented coordinate.'});continue
  id='unesco-'+x['id_no'];source='https://whc.unesco.org/en/list/'+x['id_no']+'/'
  names={};descs={}
  for lang in ['en','fr','es','ru','ar','zh']:
   out='zh-Hans' if lang=='zh' else lang
   if x.get('name_'+lang):names[out]=clean(x['name_'+lang])
   if x.get('short_description_'+lang):descs[out]=clean(x['short_description_'+lang])
  if names.get('zh-Hans'):names['zh-Hant']=CC.convert(names['zh-Hans'])
  if descs.get('zh-Hans'):descs['zh-Hant']=CC.convert(descs['zh-Hans'])
  vehicle='water' if x['id_no'] in WATER_UNESCO else 'land' if x['category']=='Cultural' else 'air'
  name=names['en'].lower()
  category='diving' if vehicle=='water' else 'forest' if 'forest' in name else 'lake' if 'lake' in name else 'mountain' if any(s in name for s in ['mountain','mount ','volcano','alps']) else 'heritage' if vehicle=='land' else 'scenic'
  row={'id':id,'lat':round(p['lat'],6),'lon':round(p['lon'],6),'name':names,'description':{'en':brief(descs.get('en',''),160),'zh-Hant':brief(descs.get('zh-Hant',descs.get('en','')),140)},'country':x['iso_codes'],'region':x['region'],'category':category,'vehicle':vehicle,'allowedVehicles':[vehicle],'sources':[source],'sourceUrls':[source],'detailId':id,'dataLicense':'CC-BY-SA-4.0','sourceLanguage':'en','descriptionLanguages':list(descs),'aliases':[str(s) for s in x.get('states_names',[])],'year':x.get('date_inscribed')}
  if x['id_no'] in UN_PHOTOS:row['photoId']=UN_PHOTOS[x['id_no']]
  if vehicle=='water':row['waterProfile']='sea'
  row['photoStatus']='bundled-licensed' if row.get('photoId') else 'on-demand-verified-commons'
  details[id]={'id':id,'description':descs,'attribution':'UNESCO World Heritage Centre / UNESCO DataHub','license':'CC BY-SA 4.0','licenseUrl':CC_LICENSE,'sources':[source,'https://data.unesco.org/explore/dataset/whc001/information/'],'sourceId':x['id_no'],'inscribed':x.get('date_inscribed'),'criteria':x.get('criteria_txt'),'category':x['category'],'scriptConversion':'zh-Hant converted from UNESCO zh-Hans with OpenCC s2twp; other text retains source language.','sourceImages':[]}
  catalogue.append(row)
 for x in diving:
  if not x.get('coordinates'):continue
  p=x['coordinates'][0]
  if not valid(p['lat'],p['lon']):continue
  name=x['title'];zh=DIVE_ZH.get(name,name);id='dive-'+re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
  url='https://en.wikipedia.org/wiki/'+name.replace(' ','_')
  # Keep a separate explicitly underwater game variant for a reef/archipelago,
  # not a claim that the whole heritage anchor is a permitted real dive route.
  desc_en=clean(x.get('extract'))
  desc_zh=f'{zh}的水下載具模擬練習錨點。位置源自百科座標；這不是實際潛水路線或即時水下攝影。英文原始介紹可在景點故事中閱讀。'
  row={'id':id,'lat':round(p['lat'],6),'lon':round(p['lon'],6),'name':{'en':name+' — underwater practice','zh-Hant':zh+'・水下練習','zh-Hans':SIM.convert(zh)+'・水下练习'},'description':{'en':brief(desc_en,180),'zh-Hant':desc_zh},'country':DIVE_COUNTRY.get(name,''),'region':'Dive destinations','category':'diving','vehicle':'water','allowedVehicles':['water'],'waterProfile':'lake' if name=='Silfra' else 'sea','sources':[url],'sourceUrls':[url],'detailId':id,'dataLicense':'CC-BY-SA-4.0','sourceLanguage':'en','descriptionLanguages':['en'],'aliases':[name,zh]}
  if name in DIVE_PHOTOS:row['photoId']=DIVE_PHOTOS[name]
  row['photoStatus']='bundled-licensed' if row.get('photoId') else 'on-demand-verified-commons'
  details[id]={'id':id,'description':{'en':desc_en,'zh-Hant':desc_zh},'attribution':'Wikipedia contributors','license':'CC BY-SA 4.0','licenseUrl':CC_LICENSE,'sources':[url],'sourceImages':[]}
  catalogue.append(row)
 panorama_rows=[
  ('pano-san-diego-canyon','聖地牙哥 Los Peñasquitos 自然步道・360°','Los Peñasquitos Canyon Preserve — 360°',32.938486,-117.152701,'US','forest','air','v5-san-diego-360','https://commons.wikimedia.org/wiki/File:San_Diego_Panorama_DSC_2349-DSC_2362.jpg','聖地牙哥自然保護地步道的實拍完整環景，拍攝於2020年12月30日。可轉頭觀看四周；照片不包含自由移動的測繪模型。','A full spherical photograph taken on a trail in Los Peñasquitos Canyon Preserve on 30 December 2020. Look around the photographed position; this is not a freely navigable surveyed 3D scene.'),
  ('pano-berlin-gallery','柏林舊國家美術館外部・360°','Alte Nationalgalerie exterior, Berlin — 360°',52.520433,13.399413,'DE','museum','land','v5-berlin-gallery-360','https://commons.wikimedia.org/wiki/File:Alte_Nationalgalerie,_Berlin-Mitte,_360_Grad_Panorama,_160101,_ako.jpg','柏林舊國家美術館外部的完整球形環景，拍攝於2016年1月1日。這是戶外建築與庭院的照片，並非館內展覽或即時攝影。','A full spherical photograph outside the Alte Nationalgalerie, Berlin, taken on 1 January 2016. The image shows the exterior and courtyard, not indoor exhibitions or a live view.')]
 for id,zh,en,lat,lon,country,category,vehicle,photo,url,desc_zh,desc_en in panorama_rows:
  row={'id':id,'lat':lat,'lon':lon,'name':{'zh-Hant':zh,'en':en},'description':{'zh-Hant':desc_zh,'en':desc_en},'country':country,'region':'Real 360 panoramas','category':category,'vehicle':vehicle,'allowedVehicles':[vehicle],'sources':[url],'sourceUrls':[url],'detailId':id,'dataLicense':'CC-BY-SA-4.0','sourceLanguage':'en','descriptionLanguages':['zh-Hant','en'],'aliases':[zh,en],'photoId':photo,'photoStatus':'bundled-licensed','is360':True}
  details[id]={'id':id,'description':row['description'],'attribution':'AERO original summaries; coordinates and photograph facts from the cited Commons file page.','license':'CC BY-SA 4.0 for this destination summary; photograph license is separately stated in photo manifest.','licenseUrl':CC_LICENSE,'sources':[url],'sourceImages':[]}
  catalogue.append(row)
 ids=[x['id'] for x in catalogue];assert len(ids)==len(set(ids))
 assert len(catalogue)>=1000 and sum(x['country']=='TW' for x in catalogue)==1500
 assert all(valid(x['lat'],x['lon']) and x['allowedVehicles']==[x['vehicle']] for x in catalogue)
 shards=defaultdict(dict)
 for row in catalogue:
  shard=hashlib.sha256(row['id'].encode()).hexdigest()[:1]
  row['detailShard']='catalogue-details-'+shard+'.json'
  shards[shard][row['id']]=details[row['id']]
 for shard,data in shards.items():output('catalogue-details-'+shard+'.json',data)
 output('catalogue-index.json',catalogue);output('catalogue-details.json',details)
 checksums={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(RAW.iterdir()) if p.is_file()}
 summary={'version':5,'retrieved':DATE,'count':len(catalogue),'taiwanCount':1500,'worldHeritageCount':sum(x['id'].startswith('unesco-') for x in catalogue),'diveVariantCount':sum(x['id'].startswith('dive-') for x in catalogue),'vehicleCounts':dict(Counter(x['vehicle'] for x in catalogue)),'categoryCounts':dict(Counter(x['category'] for x in catalogue)),'taiwanRegions':dict(Counter(x['region'] for x in catalogue if x['country']=='TW')),'indexBytes':(ROOT/'catalogue-index.json').stat().st_size,'detailsBytes':(ROOT/'catalogue-details.json').stat().st_size,'sources':[{'id':'taiwan','url':TW_SOURCE,'landing':'https://data.gov.tw/dataset/7777','rawCount':len(tw['Attractions']),'license':'OGDL-1.0','licenseUrl':TW_LICENSE,'selection':'Deduplicate same normalized name in same 0.01-degree cell, prioritize named scenic/cultural features, balanced round-robin all 22 counties/cities until 1500.'},{'id':'unesco','url':UN_SOURCE,'landing':'https://data.unesco.org/explore/dataset/whc001/information/','rawCount':len(un),'license':'CC BY-SA 4.0','licenseUrl':CC_LICENSE,'selection':'All records with explicit valid top-level coordinates. Exclude missing-coordinate records rather than invent locations.'},{'id':'diving','url':'https://en.wikipedia.org/w/api.php','license':'CC BY-SA 4.0','licenseUrl':CC_LICENSE,'selection':'18 coordinate-backed explicitly underwater variants; may overlap larger UNESCO sites, counted separately as practice variants.'}],'excludedWorldHeritageRecords':excluded,'rawSHA256':checksums,'importantNotes':['The catalogue stores real coordinate anchors, not measured 3D terrain, real drone permission, bathymetry, live views, or 360 panoramas.','Vehicle tags are game rules inferred from destination type; they are not real-world safety or access determinations.','Only photoId records reference bundled individually licensed images. Other records require verified runtime Commons images or show a no-photo state. sourceImages URLs are not approved for automatic display.','Taiwan histories retain original Traditional Chinese; the English short text is a location/category summary, not a translation of the history. UNESCO retains six source languages plus Traditional Chinese script conversion. Missing language must be visibly indicated.','The 18 dive practice variants are marked separately so the number of unique source attractions remains auditable.']}
 output('catalogue-sources.json',summary)
 print(json.dumps({k:summary[k] for k in ['count','taiwanCount','worldHeritageCount','diveVariantCount','vehicleCounts','indexBytes','detailsBytes']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
