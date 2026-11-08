"""Рисует JPG-картинки товаров и категорий (для рекламы, соцсетей и поиска картинок) из SVG сайта.
Запуск: сайт должен работать локально (node server.js), затем
    python3 tools/render-images.py http://localhost:3000
Картинки ложатся в public/img/p/<категория>/<товар>.jpg и public/img/c/<категория>.jpg.
Своё фото товара (колонка «Фото» в «Витрине») всегда важнее — для него картинка не нужна."""
import os, re, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img')
BG = {'ovoshchi': '#eef5e4', 'frukty-i-yagody': '#fdf0e0', 'zelen': '#eaf4e2', 'suhofrukty': '#f8efe0', 'orehi-i-semena': '#f6efe3', 'zamorozka': '#e9f1f7'}
sm = urllib.request.urlopen(BASE + '/sitemap.xml').read().decode()
prods = re.findall(r'<loc>[^<]*/catalog/([a-z0-9-]+)/([a-z0-9-]+)</loc>', sm)
cats = sorted(set(c for c, _ in prods))
jobs = [('/img/p/%s/%s.svg' % (c, s), os.path.join(OUT, 'p', c, s + '.jpg'), c) for c, s in prods] + [('/img/c/%s.svg' % c, os.path.join(OUT, 'c', c + '.jpg'), c) for c in cats]
with sync_playwright() as pw:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = pw.chromium.launch(executable_path=exe, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 800, 'height': 600})
    for src, dst, c in jobs:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        pg.set_content('<html><body style="margin:0"><div style="width:800px;height:600px;background:%s;position:relative;display:grid;place-items:center">'
                       '<div style="position:absolute;inset:0;background:radial-gradient(70%% 60%% at 50%% 55%%,rgba(255,255,255,.85),rgba(255,255,255,0) 70%%)"></div>'
                       '<img src="%s%s" style="position:relative;width:96%%;height:96%%;object-fit:contain"></div></body></html>' % (BG.get(c, '#f5f1e8'), BASE, src))
        pg.wait_for_function('document.images[0].complete')
        pg.screenshot(path=dst, type='jpeg', quality=84)
    b.close()
print('готово:', len(jobs), 'картинок')
