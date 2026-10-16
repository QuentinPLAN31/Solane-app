import os,json,html,datetime,sys
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=ROOT
BASE='https://www.solaneskin.com'
TODAY=os.environ.get('TODAY') or datetime.date.today().isoformat()
Q=json.load(open(os.path.join(ROOT,'articles','queue.json')))
Q=[a for a in Q if a['date']<=TODAY]
Q.sort(key=lambda a:(a['date'],a['slug']),reverse=True)
CSS='''*{box-sizing:border-box;margin:0}body{background:#171310;color:#f5efe4;font:18px/1.7 "Work Sans",system-ui,sans-serif}
a{color:#e0924f}header,main,footer{max-width:760px;margin:0 auto;padding:0 20px}
header{display:flex;justify-content:space-between;align-items:center;padding-top:22px;padding-bottom:22px;border-bottom:1px solid #392f24}
.logo{font:600 24px Fraunces,Georgia,serif;color:#f5efe4;text-decoration:none}
.btn{display:inline-block;background:#c9743f;color:#1c1006;font-weight:600;padding:12px 22px;border-radius:999px;text-decoration:none}
h1{font:600 38px/1.15 Fraunces,Georgia,serif;margin:40px 0 16px}h2{font:600 26px/1.25 Fraunces,Georgia,serif;margin:36px 0 10px}
p{margin:0 0 16px;color:#d9d0c0}.lead{font-size:20px;color:#f5efe4}
.tip{background:#2a231c;border-left:4px solid #c9743f;padding:16px 20px;border-radius:8px;margin:32px 0}
.cta{background:#1e1914;border:1px solid #392f24;border-radius:16px;padding:28px;margin:40px 0;text-align:center}
.cta h2{margin-top:0}.list a{display:block;padding:16px 0;border-bottom:1px solid #392f24;text-decoration:none;color:#f5efe4;font-weight:500}
.list span{display:block;color:#8f8574;font-size:15px;font-weight:400}
.crumb{font-size:14px;color:#8f8574;margin-top:24px}.crumb a{color:#8f8574}
footer{padding-top:30px;padding-bottom:50px;color:#8f8574;font-size:14px}'''
FONTS='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Work+Sans:wght@400;500;600&display=swap">'
def page(path,title,desc,body,ld):
    url=f'{BASE}/{path}'
    h=f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} | Solane</title><meta name="description" content="{html.escape(desc)}"><link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}"><meta property="og:url" content="{url}"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Solane">
<meta property="og:image" content="{BASE}/og-image.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{BASE}/og-image.png"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">{FONTS}<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld,ensure_ascii=False)}</script></head><body>
<header><a class="logo" href="/">Solane</a><a class="btn" href="/">Analyser ma peau</a></header><main>{body}</main>
<footer>Ces informations sont générales et ne remplacent pas l\'avis d\'un médecin ou d\'un dermatologue. En cas de peau douloureuse, d\'acné sévère ou qui s\'aggrave, consulte un professionnel de santé.<br><br><a href="/conseils/">Tous les conseils</a> · <a href="/">solaneskin.com</a></footer></body></html>'''
    os.makedirs(os.path.dirname(f'{OUT}/{path}'),exist_ok=True)
    open(f'{OUT}/{path}','w').write(h)

urls=[(BASE+'/','1.0',TODAY),(BASE+'/conseils/','0.8',TODAY)]
for a in Q:
    slug,h1,title,desc,secs,tip=a['slug'],a['h1'],a['title'],a['desc'],a['sections'],a['tip']
    rel=''.join(f'<a href="/conseils/{b["slug"]}/">{html.escape(b["title"])}</a>' for b in [x for x in Q if x['slug']!=slug][:4])
    body=f'<p class="crumb"><a href="/">Solane</a> › <a href="/conseils/">Conseils</a></p><h1>{html.escape(h1)}</h1><p class="lead">{html.escape(desc)}</p>'
    for t,x in secs: body+=f'<h2>{html.escape(t)}</h2><p>{html.escape(x)}</p>'
    body+=f'<div class="tip"><strong>À retenir :</strong> {html.escape(tip)}</div>'
    body+='<div class="cta"><h2>Quelle est ta vraie routine ?</h2><p>Analyse ta peau gratuitement avec Solane et reçois des conseils adaptés à ton type de peau.</p><a class="btn" href="/">Analyser ma peau</a></div>'
    body+=f'<h2>À lire aussi</h2><div class="list">{rel}</div>'
    ld={"@context":"https://schema.org","@type":"Article","headline":h1,"description":desc,"inLanguage":"fr","datePublished":a['date'],"dateModified":a['date'],"author":{"@type":"Organization","name":"Solane"},"publisher":{"@type":"Organization","name":"Solane","url":BASE},"mainEntityOfPage":f'{BASE}/conseils/{slug}/'}
    page(f'conseils/{slug}/index.html',title,desc,body,ld)
    urls.append((f'{BASE}/conseils/{slug}/','0.7',a['date']))
lst=''.join(f'<a href="/conseils/{b["slug"]}/">{html.escape(b["title"])}<span>{html.escape(b["desc"])}</span></a>' for b in Q)
page('conseils/index.html','Conseils peau : habitudes, routine et erreurs à éviter','Tous les conseils Solane pour comprendre ta peau : boutons, routine, crème solaire, habitudes qui abîment la peau et solutions simples.',
 f'<h1>Conseils pour ta peau</h1><p class="lead">Les habitudes qui abîment la peau, et comment les corriger simplement.</p><div class="list">{lst}</div>',{"@context":"https://schema.org","@type":"CollectionPage","name":"Conseils peau Solane","url":BASE+'/conseils/',"inLanguage":"fr"})
open(f'{OUT}/sitemap.xml','w').write('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{u}</loc><lastmod>{d}</lastmod><priority>{p}</priority></url>' for u,p,d in urls)+'</urlset>')
open(f'{OUT}/robots.txt','w').write(f'User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n')
print(len(Q),'articles publiés au',TODAY)
